// Verificação de contrato contra o PNCP real (os demais testes usam dados sintéticos).
// Confere se a API ainda tem os campos, filtros, operadores e limites dos quais a aplicação
// depende, usando o mesmo serviço do Worker com o fetch do Node:
//   node test/pncp-contract.mjs
// CONTRATOS_PNCP_REPORT=arquivo.md grava um relatório em Markdown (usado pelo workflow semanal).
import { writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/browser/runtime.js';
import { MAX_QUERY_TEXT } from '../src/schema.js';
import { PRESETS, presetSearch, readSearch } from '../public/search-library.js';

const settings = { PNCP_MAX_RETRIES: 4, PNCP_READ_TIMEOUT_SECONDS: 60, PNCP_OPERATION_TIMEOUT_SECONDS: 180 };
const runtime = createRuntime(settings, { fetcher: (url, init) => fetch(url, init) });
let serial = 0;
const call = (method, payload) => runtime.run(`contrato-${++serial}`, method, payload);
const results = [];
// Falhas temporárias do PNCP (indisponível, limite de requisições) não indicam mudança na API:
// a verificação é repetida e, se o PNCP seguir indisponível, fica registrada à parte.
const transient = error => error.retryable === true || error.status === 429 || error.status >= 500;
async function check(name, fn) {
  const start = performance.now();
  let outcome;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      outcome = { name, status: 'ok', detail: (await fn()) || '' };
      break;
    } catch (error) {
      outcome = { name, status: transient(error) ? 'indisponível' : 'falhou', detail: error.message };
      if (outcome.status === 'falhou') break;
      await new Promise(resolve => setTimeout(resolve, attempt * 20000));
    }
  }
  results.push(outcome);
  const label = { ok: 'PASS', falhou: 'FAIL', indisponível: 'SKIP' }[outcome.status];
  console.log(`${label} ${name}${outcome.detail ? ` — ${outcome.detail}` : ''}`);
  console.log(`TIME ${name}: ${((performance.now() - start) / 1000).toFixed(1)} s`);
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const fmt = value => Number(value).toLocaleString('pt-BR');
const total = async (type, q = '', pncp_filters = {}, extra = {}) =>
  (await call('execute', { query: { document_type: type, q, pncp_filters, size: 10, ...extra } })).total;

const schema = await call('schema', {});
const recent = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);

for (const type of ['edital', 'ata', 'contrato']) {
  await check(`Busca e colunas padrão de ${type}`, async () => {
    const result = await call('execute', { query: { document_type: type, size: 100 } });
    expect(
      result.total > 1000 && result.data.length === 100,
      `esperava 100 de mais de mil, veio ${result.data.length}`
    );
    // Uma coluna exibida por padrão sem nenhum valor em 100 documentos indica campo renomeado ou removido.
    const empty = schema.columns_by_document[type]
      .filter(column => column.visible)
      .filter(column =>
        result.data.every(
          row => row[column.field] === null || row[column.field] === undefined || row[column.field] === ''
        )
      )
      .map(column => column.field);
    expect(!empty.length, `colunas padrão sem nenhum valor: ${empty.join(', ')}`);
    return `${fmt(result.total)} documentos`;
  });
}

// Um filtro de cada tipo deve restringir o resultado sem zerá-lo: se o PNCP ignorar o parâmetro
// (nome trocado), o total volta a ser o da consulta sem filtro.
const filterChecks = [
  ['edital', 'lista (UF)', { ufs: ['DF'] }],
  ['edital', 'enumeração (tipo de item)', { tipos_item: 'S' }],
  ['edital', 'booleano (registro de preços)', { srp: true }],
  ['edital', 'data (publicação recente)', { data_publicacao_inicio: recent }],
  ['edital', 'decimal (valor estimado mínimo)', { valor_total_estimado_min: '1000000' }],
  ['edital', 'situação dos itens', { situacoes_item: ['2'] }],
  ['ata', 'lista (UF)', { ufs: ['SP'] }],
  ['contrato', 'lista (UF)', { ufs: ['RJ'] }]
];
const baseTotals = {};
for (const [type, label, filters] of filterChecks)
  await check(`Filtro ${label} em ${type}`, async () => {
    baseTotals[type] ??= await total(type);
    const filtered = await total(type, '', filters);
    expect(
      filtered > 0 && filtered < baseTotals[type],
      `${fmt(filtered)} de ${fmt(baseTotals[type])}: o filtro não restringiu`
    );
    return `${fmt(filtered)} de ${fmt(baseTotals[type])}`;
  });

await check('Status temporal de editais e contratos', async () => {
  const [edital, contrato] = [
    await total('edital', '', {}, { status: 'recebendo_proposta' }),
    await total('contrato', '', {}, { status: 'vigente' })
  ];
  expect(edital > 0 && edital < baseTotals.edital, `recebendo propostas: ${fmt(edital)}`);
  expect(contrato > 0 && contrato < baseTotals.contrato, `vigentes: ${fmt(contrato)}`);
  return `recebendo propostas ${fmt(edital)}; contratos vigentes ${fmt(contrato)}`;
});

// Operadores documentados nas dicas de busca.
await check('Operadores de busca (E, OR, NOT, aspas)', async () => {
  const [microsoft, office, both, either, not, phrase] = [
    await total('edital', 'microsoft'),
    await total('edital', 'office'),
    await total('edital', 'microsoft office'),
    await total('edital', 'microsoft OR office'),
    await total('edital', 'office NOT microsoft'),
    await total('edital', '"microsoft office"')
  ];
  expect(both < microsoft && both < office, `E: "microsoft office" (${fmt(both)}) deveria ser menor que cada termo`);
  expect(either > microsoft && either > office, `OR: ${fmt(either)} deveria ser maior que cada termo`);
  expect(not < office && not > 0, `NOT: ${fmt(not)} deveria ficar entre 0 e ${fmt(office)}`);
  expect(phrase <= both, `aspas: ${fmt(phrase)} deveria ser no máximo ${fmt(both)}`);
  return `microsoft ${fmt(microsoft)}, office ${fmt(office)}, E ${fmt(both)}, OR ${fmt(either)}, NOT ${fmt(not)}, frase ${fmt(phrase)}`;
});

await check(`Busca textual com ${fmt(MAX_QUERY_TEXT)} caracteres`, async () => {
  let q = 'microsoft';
  for (let i = 0; q.length < MAX_QUERY_TEXT - 12; i++) q += ` OR termo${i}`;
  return `${fmt(await total('edital', q.slice(0, MAX_QUERY_TEXT)))} documentos`;
});

await check('Buscas prontas abaixo da janela de 10.000 resultados', async () => {
  const totals = [];
  for (const preset of PRESETS) {
    const query = readSearch(presetSearch(preset), schema, 10);
    const count = (await call('execute', { query })).total;
    expect(count > 0, `${preset.name} não trouxe resultados`);
    expect(count <= 10000, `${preset.name}: ${fmt(count)} resultados, acima da janela navegável`);
    totals.push(`${preset.name} ${fmt(count)}`);
  }
  return totals.join('; ');
});

await check('Listas de filtros e catálogos', async () => {
  const domains = await call('domains', { type: 'edital' });
  const missing = ['modalidades', 'situacoes', 'ufs', 'item_tipos', 'item_situacoes'].filter(
    name => !domains.filters[name]?.length
  );
  expect(!missing.length, `listas vazias ou ausentes: ${missing.join(', ')}`);
  const paises = await call('domains', { type: 'edital', field: 'paises_fornecedor' });
  expect(
    paises.filters.paises_fornecedor?.some(option => option.id === 'BRA'),
    'catálogo de países sem BRA'
  );
  return `${Object.keys(domains.filters).length} listas`;
});

await check('Sugestões exigem três caracteres e usam IDs do IBGE nos municípios', async () => {
  // Chamada direta, fora do serviço: repete em falhas temporárias do PNCP (5xx ou rede).
  let short;
  for (let attempt = 1; attempt <= 5; attempt++) {
    short = await fetch(
      'https://pncp.gov.br/api/search/suggest?tipos_documento=edital&campo=orgaos&q=un&tam_pagina=5'
    ).catch(() => null);
    if (short && short.status < 500) break;
    await new Promise(resolve => setTimeout(resolve, attempt * 3000));
  }
  expect(
    short?.status === 400,
    `com dois caracteres o PNCP respondeu ${short.status}; a busca local de municípios e os recentes supõem 400`
  );
  const organs = await call('suggest', { type: 'edital', field: 'orgaos', q: 'universidade', size: 5 });
  expect(organs.items.length > 0, 'sem sugestões de órgãos');
  // A sugestão do PNCP diferencia acentos: "brasilia" não encontra Brasília.
  const cities = await call('suggest', { type: 'edital', field: 'municipios', q: 'brasília', size: 5 });
  expect(
    cities.items.some(option => option.id === '5300108'),
    'Brasília não veio com o código IBGE 5300108; os filtros de município usam a relação do IBGE'
  );
  return `${organs.items.length} órgãos; Brasília 5300108`;
});

// Documentos públicos de referência, os mesmos da página de diagnóstico.
const documents = [
  { type: 'edital', cnpj: '00394452000103', ano: '2026', sequencial: '21678' },
  { type: 'ata', cnpj: '88585518000185', ano: '2026', sequencial_compra: '469', sequencial: '1' },
  { type: 'contrato', cnpj: '10870883000144', ano: '2021', sequencial: '30' }
];
for (const document of documents)
  await check(`Detalhes de ${document.type} de referência`, async () => {
    const detail = await call('documentDetails', { document });
    const filled = detail.fields.filter(
      field => field.value !== null && field.value !== undefined && field.value !== ''
    );
    expect(filled.length >= 10, `detalhes com só ${filled.length} campos preenchidos`);
    expect(detail.objeto, 'detalhes sem objeto');
    return `${filled.length} campos preenchidos`;
  });
await check('Itens de edital de referência', async () => {
  const items = await call('details', { document: documents[0], page: 1, size: 10 });
  expect(items.data.length > 0 && items.total_items > 0, 'sem itens');
  return `${items.total_items} itens`;
});

await runtime.close();
const failed = results.filter(result => result.status === 'falhou'),
  unavailable = results.filter(result => result.status === 'indisponível'),
  passed = results.length - failed.length - unavailable.length;
const report = [
  `Verificação do contrato com o PNCP em ${new Date().toISOString()}: ${passed} de ${results.length} verificações passaram` +
    (failed.length ? `, ${failed.length} falharam` : '') +
    (unavailable.length ? `, ${unavailable.length} sem resposta do PNCP` : '') +
    '.',
  '',
  '| Verificação | Resultado | Detalhe |',
  '| --- | --- | --- |',
  ...results.map(
    result =>
      `| ${result.name} | ${result.status === 'falhou' ? '**falhou**' : result.status} | ${result.detail.replace(/\|/g, '\\|')} |`
  )
].join('\n');
if (process.env.CONTRATOS_PNCP_REPORT) await writeFile(process.env.CONTRATOS_PNCP_REPORT, report + '\n');
console.log(
  `\n${passed}/${results.length} verificações passaram; ${failed.length} falharam; ${unavailable.length} sem resposta do PNCP.`
);
// Código 1: o contrato mudou. Código 2: só faltou resposta do PNCP (o workflow avisa, sem abrir issue).
if (failed.length) process.exitCode = 1;
else if (unavailable.length) process.exitCode = 2;
