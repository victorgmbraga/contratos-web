import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuery, compareDecimal, validateDocument } from '../src/validation.js';
import { serializeSearch, normalizeOptions, PncpClient } from '../src/pncp-core.js';
import { project, safeLink } from '../src/adapter.js';
import { parseExactJson as parse } from '../src/exact-json.js';
import { indexedDocumentFields, recordFields } from '../src/document-details.js';
import { validateSettings } from '../src/settings.js';
import { config, document, service, query, json } from './helpers.js';

test('HTTP-01: pipe codificado uma vez; false e zero preservados', () => {
  const cfg = config({ PNCP_VALIDATED_FILTERS: 'srp,item_quantidade_min,ordem_classificacao_min' });
  const q = validateQuery(
    query({ pncp_filters: { ufs: ['DF', 'GO'], srp: false, item_quantidade_min: '0.00', ordem_classificacao_min: 0 } }),
    cfg
  );
  const params = serializeSearch(q, 1, 10);
  assert.equal(params.get('ufs'), 'DF|GO');
  assert(params.toString().includes('DF%7CGO'));
  assert(!params.toString().includes('%257C'));
  assert.equal(params.get('srp'), 'false');
  assert.equal(params.get('item_quantidade_min'), '0.00');
  assert.equal(params.get('ordem_classificacao_min'), '0');
  assert(!params.has('total'));
});
test('HTTP-03: desconhecidos, reservados, tipos documentais e status rejeitados antes da rede', async () => {
  const s = service([]);
  for (const input of [
    query({ extra: true }),
    query({ status: 'vigente' }),
    query({ pncp_filters: { foo: 1 } }),
    query({ pncp_filters: { total: true } }),
    query({ pncp_filters: { permite_adesao: 'true' } }),
    query({ document_type: 'irp' })
  ])
    await assert.rejects(s.service.execute(input), error => error.status === 400 || error.status === 409);
  assert.equal(s.requests.length, 0);
});
test('HTTP-02: nomes não são aceitos como IDs e datas reais são verificadas', () => {
  for (const pncp_filters of [
    { orgaos: ['Ministério'] },
    { ufs: ['XX'] },
    { data_publicacao_inicio: '2026-02-30' },
    { valor_total_estimado_min: 100 },
    { data_publicacao_inicio: '2026-10-01', data_publicacao_fim: '2026-09-01' },
    { valor_total_estimado_min: '10', valor_total_estimado_max: '2' }
  ])
    assert.throws(() => validateQuery(query({ pncp_filters }), config()));
  assert.throws(() => validateQuery(query({ page: true }), config()));
  assert.throws(() => validateQuery(query({ size: 30 }), config()));
});
test('HTTP-03: domínios pequenos são conferidos na fonte', async () => {
  const s = service([document(1)]);
  await assert.rejects(
    s.service.execute(query({ pncp_filters: { modalidades: ['999'] } })),
    e => e.code === 'INVALID_DOMAIN'
  );
  assert.equal(s.requests.length, 1);
  assert(s.requests[0].pathname.endsWith('/filters'));
});
test('DATA-01: precisão decimal, identificadores e ausência preservados', () => {
  const raw = parse(
    '{"id":123,"doc_type":"_doc","document_type":"edital","description":"NULL","valor_total_estimado":9007199254740993.25,"valor_total_homologado":0,"tem_resultado":false}'
  );
  const d = project(raw);
  assert.equal(d.id, '123');
  assert.equal(d.objeto_compra, 'NULL');
  assert.equal(d.valor_total_estimado, '9007199254740993.25');
  assert.equal(d.valor_total_homologado, '0');
  assert.equal(d.tem_resultado, false);
  assert.equal(d.orgao_nome, null);
});
test('UI-03: caminho PNCP preserva /app e links executáveis são rejeitados', () => {
  assert.equal(safeLink('/editais/123/2026/1', true), 'https://pncp.gov.br/app/editais/123/2026/1');
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('https://evil.example/editais/123', true), 'https://pncp.gov.br/app');
  assert.equal(safeLink('https://user:password@example.com'), null);
});
test('DATA-02: arrays, objetos e booleanos incompatíveis não viram ausência', () => {
  for (const extra of [
    { description: false },
    { description: [] },
    { valor_total_estimado: false },
    { tem_resultado: 'false' }
  ])
    assert.throws(
      () => project(document(1, extra)),
      e => e.code === 'INVALID_UPSTREAM'
    );
});
test('LIVE-02/MEM-01: consultas iguais fazem novas chamadas e recebem novas respostas', async () => {
  let i = 0;
  const s = service([], { handler: () => json({ items: [document(1, { description: `Versão ${++i}` })], total: 1 }) });
  assert.equal((await s.service.execute(query())).data[0].objeto_compra, 'Versão 1');
  assert.equal((await s.service.execute(query())).data[0].objeto_compra, 'Versão 2');
  assert.equal(s.requests.length, 2);
});
test('PAGE-01: janela de 10000 separada do total PNCP', async () => {
  const s = service([], {
    handler: () => json({ items: Array.from({ length: 10 }, (_, i) => document(i + 1)), total: 12500 })
  });
  const r = await s.service.execute(query());
  assert.equal(r.total, 12500);
  assert.equal(r.accessible_total, 10000);
  assert.equal(r.last_page, 1000);
  assert.equal(r.last_row, 10000);
  assert(r.window_limited);
  assert.equal(r.collection_complete, false);
  await assert.rejects(s.service.export(query()), e => e.code === 'EXPORT_TOO_BROAD');
});
test('PAGE-02/PAGE-03: zero e página fora do intervalo', async () => {
  const s = service([]),
    r = await s.service.execute(query());
  assert.equal(r.last_page, 1);
  assert.equal(r.last_row, 0);
  assert.equal(r.total, 0);
  await assert.rejects(
    s.service.execute(query({ page: 2 })),
    e => e.code === 'PAGE_OUT_OF_RANGE' && e.details.last_page === 1
  );
});
test('HTTP-04/LIVE-03: 204, HTML e protocolo inválido não viram zero resultados', async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    new Response('<html>erro</html>', { headers: { 'Content-Type': 'text/html' } }),
    json({ items: [], total: 'abc' }),
    json({ items: [{ doc_type: '_doc', document_type: 'contrato' }], total: 1 })
  ]) {
    const s = service([], { handler: () => response });
    await assert.rejects(s.service.execute(query()), e => e.status === 502);
  }
});
test('HTTP-04: falha transitória respeita tentativa limitada', async () => {
  const s = service(
    [],
    {
      handler: (url, n) =>
        n === 1 ? new Response(null, { status: 503, headers: { 'Retry-After': '0' } }) : json({ items: [], total: 0 })
    },
    { PNCP_MAX_RETRIES: 1 }
  );
  const r = await s.service.execute(query());
  assert.equal(s.requests.length, 2);
  assert.equal(r.upstream_requests, 2);
});
test('HTTP-04: redirecionamento para outra origem rejeitado', async () => {
  const s = service([], {
    handler: () => new Response(null, { status: 302, headers: { Location: 'https://example.com/private' } })
  });
  await assert.rejects(s.service.execute(query()), e => e.code === 'UNSAFE_REDIRECT');
  assert.equal(s.requests.length, 1);
});
test('UI-01/MEM-01: cancelamento interrompe a requisição PNCP em andamento', async () => {
  const s = service([], {
    handler: (url, n, init) =>
      new Promise((resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      )
  });
  const controller = new AbortController(),
    promise = s.service.execute(query(), controller.signal);
  setTimeout(() => controller.abort(new Error('cancelado')), 30);
  await assert.rejects(promise, /cancelado/);
  assert.equal(s.requests.length, 1);
  assert.equal(s.client.active, 0);
});
test('HTTP-04: orçamento global interrompe espera', async () => {
  const s = service(
    [],
    {
      handler: async (url, n, init) =>
        new Promise((resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
        )
    },
    { PNCP_OPERATION_TIMEOUT_SECONDS: 0.1 }
  );
  await assert.rejects(s.service.execute(query()), e => e.code === 'OPERATION_TIMEOUT');
});
test('HTTP-05: Retry-After extremo é limitado, fetchOptions preserva signal/Accept e Location inválido falha sem repetir', async () => {
  const limited = service(
    [],
    { handler: () => new Response(null, { status: 429, headers: { 'Retry-After': '9999999999' } }) },
    { PNCP_MAX_RETRIES: 0 }
  );
  await assert.rejects(
    limited.service.execute(query()),
    e => e.code === 'PNCP_UNAVAILABLE' && e.details.retry_after_seconds === 300
  );
  let seenInit;
  const customClient = new PncpClient(config(), {
    fetcher: async (_url, init) => {
      seenInit = init;
      return json({ items: [], total: 0 });
    },
    fetchOptions: { signal: new AbortController().signal, headers: { 'X-Trace': '1' } }
  });
  await customClient.search(validateQuery(query(), config()), 1, 10, {
    id: '1',
    priority: 'foreground',
    signal: new AbortController().signal,
    requests: 0,
    bytes: 0,
    itemCount: 0,
    check() {}
  });
  assert.notEqual(seenInit.signal, customClient.fetchOptions.signal);
  assert.equal(seenInit.headers.Accept, 'application/json');
  assert.equal(seenInit.headers['X-Trace'], '1');
  assert.equal(seenInit.redirect, 'manual');

  for (const location of ['', '   ', 'http://[invalido']) {
    const redirected = service(
      [],
      {
        handler: () => new Response(null, { status: 302, headers: location ? { Location: location } : {} })
      },
      { PNCP_MAX_RETRIES: 2 }
    );
    await assert.rejects(redirected.service.execute(query()), e => e.code === 'UNSAFE_REDIRECT');
    assert.equal(redirected.requests.length, 1);
  }
});
test('DATA-03: ExactJsonNumber escalar em opções, protótipos seguros, aninhamento profundo e notação científica em detalhes', () => {
  assert.deepEqual(normalizeOptions(parse('[2026, 2025]'), 'anos'), [
    { id: '2026', label: '2026' },
    { id: '2025', label: '2025' }
  ]);
  const indexed = indexedDocumentFields(
    parse(
      '{"document_type":"toString","data_inicio_vigencia":"2026-10-01","constructor":"abc","valor_extra":1e5,"valor_texto":"Sigiloso"}'
    )
  );
  assert.equal(indexed.find(f => f.field === 'valor_extra')?.type, 'decimal');
  assert.equal(indexed.find(f => f.field === 'valor_extra')?.value, '100000');
  assert.equal(indexed.find(f => f.field === 'valor_texto')?.type, 'text');
  assert.equal(indexed.find(f => f.field === 'constructor')?.title, 'Constructor');

  let deep = { valorExtra: parse('1.5e2'), toString: 'ok' };
  for (let i = 0; i < 600; i++) deep = { n: deep };
  const fields = recordFields('edital', {
    numeroControlePNCP: '00000000000000-1-000001/2026',
    orgaoEntidade: { cnpj: '00000000000000', razaoSocial: 'Órgão' },
    unidadeOrgao: { nomeUnidade: 'Unidade', ufSigla: 'DF', municipioNome: 'Brasília' },
    modalidadeNome: 'Pregão',
    situacaoCompraNome: 'Divulgada',
    dataPublicacaoPncp: '2026-10-01',
    dataAtualizacao: '2026-10-01',
    valorTotalEstimado: parse('10'),
    valorTotalHomologado: null,
    valorExtra: parse('1.5e2'),
    valorSigiloso: 'Sigiloso',
    deep
  });
  assert.equal(fields.find(f => f.field === 'valorExtra')?.value, '150');
  assert.equal(fields.find(f => f.field === 'valorExtra')?.type, 'decimal');
  assert.equal(fields.find(f => f.field === 'valorSigiloso')?.type, 'text');
  assert(fields.some(f => f.field.endsWith('.toString') && f.title === 'To String'));
});
test('VAL-01: reservados retornam RESERVED_PARAMETER, -0 equivale a 0 e limites de configuração são validados', () => {
  assert.throws(
    () => validateQuery(query({ pncp_filters: { total: true } }), config()),
    e => e.code === 'RESERVED_PARAMETER'
  );
  assert.equal(compareDecimal('-0', '0'), 0);
  assert.equal(compareDecimal('-0.00', '0.0'), 0);
  assert.equal(compareDecimal('-0.01', '0'), -1);
  assert.throws(
    () => validateDocument({ cnpj: '00000000000000', ano: '2026', sequencial: '1' }),
    e => e.code === 'INVALID_DOCUMENT_IDENTITY'
  );
  assert.throws(
    () => validateDocument([]),
    e => e.code === 'INVALID_DOCUMENT_IDENTITY'
  );
  assert.doesNotThrow(() => validateDocument({ cnpj: '00000000000000', ano: '2026', sequencial: '1' }, ['edital']));
  assert.throws(
    () => validateSettings({ PNCP_READ_TIMEOUT_SECONDS: 2_147_484 }),
    e => e.code === 'INVALID_CONFIG'
  );
  assert.equal(
    validateSettings({ PNCP_SEARCH_BASE_URL: 'https://pncp.gov.br/api/search///' }).PNCP_SEARCH_BASE_URL,
    'https://pncp.gov.br/api/search'
  );
});
