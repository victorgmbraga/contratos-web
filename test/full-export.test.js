import test from 'node:test';
import assert from 'node:assert/strict';
import { PncpClient } from '../src/pncp-core.js';
import { QueryService } from '../src/query-core.js';
import { fullExport, FULL_EXPORT_LIMIT } from '../src/full-export.js';
import { documentResources } from '../src/document-details.js';
import { createRuntime } from '../src/browser/runtime.js';
import { demoFetch, demoDocuments } from './demo-fixtures.js';
import { config, service as fixtureService, document, query } from './helpers.js';

const fileDownload = u => /\/arquivos\/\d+$/.test(u.pathname);
function demoService({ fail = () => null, settings = {} } = {}) {
  const cfg = config(settings),
    requests = [];
  const fetcher = async (url, init) => {
    const u = new URL(url);
    requests.push(u);
    assert.equal(fileDownload(u), false, 'a exportação não baixa arquivos');
    const failure = fail(u, init);
    if (failure) return failure;
    const result = await demoFetch(url);
    return result instanceof Response ? result : Response.json(result);
  };
  return { service: new QueryService(cfg, new PncpClient(cfg, { fetcher })), requests };
}
const exportJson = result => JSON.parse(Buffer.concat(result.chunks.map(chunk => Buffer.from(chunk))).toString('utf8'));
const run = (service, extra, signal = new AbortController().signal, options = {}) =>
  fullExport(service, query(extra), signal, 'r', options);

test('FULL-01: JSON traz um registro por documento com itens, resultados, listagens e links dos arquivos', async () => {
  const { service } = demoService();
  const progress = [];
  const result = await run(service, { q: 'firewall' }, undefined, {
    onProgress: p => progress.push(p),
    now: () => new Date('2026-11-19T10:00:00Z')
  });
  const expected = demoDocuments.filter(d => d.description.toLowerCase().includes('firewall'));
  assert(expected.length > 1 && expected.length <= FULL_EXPORT_LIMIT);
  const json = exportJson(result);
  assert.equal(json.formato, 'contratos-web/exportacao-completa');
  assert.equal(json.consulta.criterios.q, 'firewall');
  assert.equal(json.documentos.length, expected.length);
  assert.equal(result.metadata.exported_rows, expected.length);
  assert.equal(result.metadata.export_scope, 'full');
  assert.equal(result.metadata.finished_at, '2026-11-19T10:00:00.000Z');
  assert.deepEqual(progress[0], { documents: 0, total: expected.length });
  assert.deepEqual(progress.at(-1), { documents: expected.length, total: expected.length });
  for (const [index, doc] of json.documentos.entries()) {
    assert.equal(doc.indice, index + 1);
    assert.equal(doc.tipo_documento, 'edital');
    assert.deepEqual(doc.erros, []);
    assert(doc.detalhes.fields.length > 0);
    assert.deepEqual(Object.keys(doc.listagens), documentResources.edital);
    assert(Array.isArray(doc.itens) && doc.itens.length > 0);
    for (const item of doc.itens) assert.equal('resultados' in item, item.temResultado === true);
    assert(doc.itens.some(item => item.resultados?.length));
    assert([0, 12].includes(doc.arquivos.length), 'arquivos previstos para o edital no cenário');
    assert.equal(doc.arquivos.length, doc.listagens.arquivos.length);
    for (const file of doc.arquivos) {
      assert.deepEqual(Object.keys(file), ['origem', 'titulo', 'tipo', 'data_publicacao', 'url']);
      assert.match(file.url, /^https:\/\/pncp\.gov\.br\/.+\/arquivos\/\d+$/);
    }
    assert(Object.keys(doc.documento).every(key => !key.startsWith('_')));
  }
  assert(json.documentos.some(doc => doc.arquivos.length === 12));
  assert.equal(
    result.metadata.files_total,
    json.documentos.reduce((sum, doc) => sum + doc.arquivos.length, 0)
  );
  assert.deepEqual(json.resumo, {
    documentos: expected.length,
    arquivos: result.metadata.files_total,
    links_disponiveis: result.metadata.files_total,
    erros: 0
  });
  assert.equal(result.metadata.files_with_url, result.metadata.files_total);
  assert.equal(result.chunks.length, expected.length + 2);
});

test('FULL-02: atas e contratos trazem registros filhos e os links dos arquivos dos termos', async () => {
  const { service } = demoService();
  const ata = exportJson(await run(service, { document_type: 'ata', q: 'firewall' }));
  assert(ata.documentos.length > 0);
  for (const doc of ata.documentos) {
    assert.deepEqual(Object.keys(doc.listagens), documentResources.ata);
    assert.equal('itens' in doc, false);
    assert.deepEqual(doc.erros, []);
  }
  const doc = exportJson(await run(service, { document_type: 'contrato', q: 'firewall' })).documentos[0];
  assert.deepEqual(Object.keys(doc.listagens), documentResources.contrato);
  assert.deepEqual(doc.erros, []);
  assert(doc.listagens.empenhos.every(record => !record.sequencial || Array.isArray(record.detalhe)));
  const term = doc.listagens.termos.find(record => record.sequencial);
  assert(term?.arquivos.length > 0);
  assert(doc.arquivos.some(file => file.origem === `termos/${term.sequencial}` && file.url));
});

test('FULL-03: limite de 100 documentos é conferido antes de qualquer detalhe', async () => {
  const s = fixtureService(Array.from({ length: FULL_EXPORT_LIMIT + 1 }, (_, i) => document(i + 1)));
  await assert.rejects(
    fullExport(s.service, query(), new AbortController().signal, 'x'),
    error => error.code === 'EXPORT_TOO_BROAD' && error.details.limit === FULL_EXPORT_LIMIT
  );
  assert(s.requests.every(u => !u.pathname.includes('/orgaos/')));
});

test('FULL-04: falha de uma listagem fica registrada no documento sem interromper a exportação', async () => {
  const { service } = demoService({
    fail: u => (u.pathname.endsWith('/historico/quantidade') ? new Response('{}', { status: 500 }) : null)
  });
  const result = await run(service, { q: 'firewall' });
  const json = exportJson(result);
  for (const doc of json.documentos) {
    assert.deepEqual(doc.erros, [
      { secao: 'historico', codigo: 'PNCP_HTTP_ERROR', mensagem: 'PNCP retornou HTTP 500.' }
    ]);
    assert.equal('historico' in doc.listagens, false);
  }
  assert(json.documentos.some(doc => doc.arquivos.length === 12));
  assert.equal(result.metadata.errors, json.documentos.length);
});

test('FULL-05: cancelamento interrompe a coleta sem devolver o JSON', async () => {
  const controller = new AbortController();
  const { service } = demoService({
    fail: u => {
      if (u.pathname.endsWith('/itens/quantidade'))
        controller.abort(new DOMException('Operação cancelada.', 'AbortError'));
      return null;
    }
  });
  await assert.rejects(run(service, { q: 'firewall' }, controller.signal), error => error.name === 'AbortError');
});

test('FULL-06: runtime expõe fullExport com JSON transferível', async () => {
  const runtime = createRuntime(
    { PNCP_REQUESTS_PER_SECOND: 1000, PNCP_MAX_RETRIES: 0 },
    {
      fetcher: async url => {
        const result = await demoFetch(url);
        return result instanceof Response ? result : Response.json(result);
      }
    }
  );
  try {
    const result = await runtime.run('1', 'fullExport', { query: { api_version: '2.0', q: 'firewall' } });
    assert.equal(result.mime, 'application/json');
    assert.match(result.filename, /^contratos-web-completa-\d{8}T\d{6}Z\.json$/);
    assert(result.chunks.every(chunk => chunk instanceof ArrayBuffer));
    assert(exportJson(result).documentos.length > 0);
    await assert.rejects(
      runtime.run('2', 'fullExport', { query: {}, scope: 'all' }),
      error => error.code === 'UNKNOWN_FIELD' && error.details.field === 'scope'
    );
  } finally {
    await runtime.close();
  }
});

test('FULL-07: rejeita identidades repetidas antes de iniciar os detalhes', async () => {
  for (const duplicate of [document(12), document(13, { numero_sequencial: '0012' })]) {
    const { service, requests } = fixtureService([document(12), duplicate]);
    await assert.rejects(run(service), { code: 'SOURCE_CHANGED' });
    assert.equal(requests.length, 1);
  }
});

test('FULL-08: resumo distingue arquivos listados de links disponíveis', async () => {
  const { service } = demoService({
    fail: u =>
      u.pathname.endsWith('/arquivos')
        ? Response.json(
            Array.from({ length: 12 }, (_, index) => ({
              titulo: 'Arquivo de teste',
              url: index % 2 ? null : 'https://pncp.gov.br/arquivo'
            }))
          )
        : null
  });
  const result = await run(service, { q: 'firewall' });
  const json = exportJson(result);
  assert(json.resumo.arquivos > 0);
  assert.equal(json.resumo.links_disponiveis, json.resumo.arquivos / 2);
  assert.equal(result.metadata.files_with_url, json.resumo.links_disponiveis);
  const files = json.documentos.flatMap(doc => doc.arquivos);
  assert.equal(files.filter(file => file.url === null).length, json.resumo.links_disponiveis);
});

test('FULL-09: contabiliza chamadas da busca, detalhes e tentativas no orçamento comum', async () => {
  const { service, requests } = demoService({ settings: { PNCP_MAX_FULL_EXPORT_REQUESTS: 3 } });
  await assert.rejects(run(service, { q: 'firewall' }), { code: 'FULL_EXPORT_REQUEST_LIMIT' });
  assert.equal(requests.length, 3);
  assert(requests.some(url => url.pathname.includes('/orgaos/')));

  const retry = demoService({
    settings: { PNCP_MAX_FULL_EXPORT_REQUESTS: 1, PNCP_MAX_RETRIES: 1 },
    fail: () => new Response(null, { status: 503 })
  });
  await assert.rejects(run(retry.service, { q: 'firewall' }), { code: 'FULL_EXPORT_REQUEST_LIMIT' });
  assert.equal(retry.requests.length, 1);
});

test('FULL-10: limite inclui todos os blocos e o cabeçalho do JSON', async () => {
  const options = { now: () => new Date('2026-11-19T10:00:00Z') };
  const { service, requests } = demoService();
  const result = await run(service, { q: 'firewall' }, undefined, options);
  assert.equal(result.metadata.upstream_requests, requests.length);
  const bytes = Buffer.concat(result.chunks).byteLength;
  service.config.PNCP_MAX_FULL_EXPORT_BYTES = bytes;
  assert.equal(Buffer.concat((await run(service, { q: 'firewall' }, undefined, options)).chunks).byteLength, bytes);
  service.config.PNCP_MAX_FULL_EXPORT_BYTES--;
  await assert.rejects(run(service, { q: 'firewall' }, undefined, options), { code: 'FULL_EXPORT_BYTES_LIMIT' });
});

test('FULL-11: prazo geral interrompe detalhes em andamento sem devolver JSON', async () => {
  let aborted = 0;
  const { service, requests } = demoService({
    settings: { PNCP_FULL_EXPORT_TIMEOUT_SECONDS: 1 },
    fail: (url, { signal }) =>
      url.pathname.includes('/orgaos/')
        ? new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                aborted++;
                reject(signal.reason);
              },
              { once: true }
            );
          })
        : null
  });
  await assert.rejects(run(service, { q: 'firewall' }), { code: 'OPERATION_TIMEOUT' });
  assert(aborted > 0);
  assert.equal(requests.length, aborted + 1);
});

test('FULL-12: coleta de itens usa duas contagens e verifica páginas e total final', async () => {
  for (const scenario of ['estável', 'página incompleta', 'total alterado']) {
    let counts = 0;
    const { service, requests } = fixtureService([document(1)], {
      handler: url =>
        url.pathname.endsWith('/itens/quantidade')
          ? Response.json(++counts === 2 && scenario === 'total alterado' ? 252 : 251)
          : null,
      items: (_sequence, page) =>
        Array.from(
          {
            length: page < 3 ? 100 : scenario === 'página incompleta' ? 50 : 51
          },
          (_, i) => ({ numeroItem: (page - 1) * 100 + i + 1 })
        )
    });
    const result = exportJson(await run(service));
    const [entry] = result.documentos;
    assert.deepEqual(
      requests.filter(url => url.pathname.endsWith('/itens')).map(url => url.searchParams.get('pagina')),
      ['1', '2', '3']
    );
    if (scenario === 'estável') {
      assert.equal(entry.itens.length, 251);
      assert.equal(entry.itens.at(-1).numeroItem, 251);
    } else {
      assert.equal(entry.itens, null);
      assert(entry.erros.some(error => error.secao === 'itens' && error.codigo === 'SOURCE_CHANGED'));
    }
    assert.equal(counts, scenario === 'página incompleta' ? 1 : 2);
  }
});

test('FULL-13: itens repetidos entre páginas ou sem número deixam a seção com erro', async () => {
  for (const repeated of ['001', null]) {
    const { service, requests } = fixtureService([document(1)], {
      itemQuantity: 200,
      items: (_sequence, page) =>
        Array.from({ length: 100 }, (_, i) => ({
          numeroItem: page === 2 && i === 0 ? repeated : (page - 1) * 100 + i + 1,
          temResultado: true
        }))
    });
    const [entry] = exportJson(await run(service)).documentos;
    assert.equal(entry.itens, null);
    assert(entry.erros.some(error => error.secao === 'itens' && error.codigo === 'SOURCE_CHANGED'));
    assert.equal(requests.filter(url => url.pathname.endsWith('/itens')).length, 2);
    assert(requests.every(url => !url.pathname.endsWith('/resultados')));
  }
});

test('FULL-14: soma os bytes das respostas e cancela a leitura antes da próxima página', async () => {
  const search = JSON.stringify({ items: demoDocuments.slice(0, 1), total: 1 });
  const items = JSON.stringify(
    Array.from({ length: 100 }, (_, index) => ({
      numeroItem: index + 1,
      descricao: 'x'.repeat(512)
    }))
  );
  const encoded = new TextEncoder().encode(items);
  const limit = encoded.byteLength;
  let produced = 0,
    cancelled = false;
  const textJson = body => new Response(body, { headers: { 'Content-Type': 'application/json' } });
  const { service, requests } = demoService({
    settings: { PNCP_MAX_FULL_EXPORT_BYTES: limit },
    fail: url => {
      if (url.pathname === '/api/search/') return textJson(search);
      if (url.pathname.endsWith('/itens/quantidade')) return Response.json(300);
      if (!url.pathname.endsWith('/itens')) return null;
      return textJson(
        new ReadableStream(
          {
            pull(controller) {
              if (produced === encoded.byteLength) {
                controller.close();
                return;
              }
              const chunk = encoded.subarray(produced, produced + 512);
              produced += chunk.byteLength;
              controller.enqueue(chunk);
            },
            cancel() {
              cancelled = true;
            }
          },
          { highWaterMark: 0 }
        )
      );
    }
  });
  await assert.rejects(run(service), { code: 'FULL_EXPORT_RESPONSE_BYTES_LIMIT' });
  assert(produced > 0 && produced < limit);
  assert(cancelled);
  assert.deepEqual(
    requests.filter(url => url.pathname.endsWith('/itens')).map(url => url.searchParams.get('pagina')),
    ['1']
  );
  assert(requests.at(-1).pathname.endsWith('/itens'));
});

test('FULL-15: exporta todas as páginas de anexos com total estável e sinaliza redução do total', async () => {
  for (const changed of [false, true]) {
    let counts = 0;
    const { service, requests } = demoService({
      fail: url => {
        if (url.pathname === '/api/search/') return Response.json({ items: demoDocuments.slice(0, 1), total: 1 });
        if (url.pathname.endsWith('/arquivos/quantidade')) return Response.json(++counts > 1 && changed ? 51 : 102);
        if (!url.pathname.endsWith('/arquivos')) return null;
        const page = Number(url.searchParams.get('pagina'));
        const start = (page - 1) * 50;
        const total = changed && page > 1 ? 51 : 102;
        return Response.json(
          Array.from({ length: Math.min(50, total - start) }, (_, index) => ({
            titulo: `Arquivo ${start + index + 1}`,
            url: `https://pncp.gov.br/arquivos/${start + index + 1}`
          }))
        );
      }
    });
    const [entry] = exportJson(await run(service)).documentos;
    const pages = requests.filter(url => url.pathname.endsWith('/arquivos')).map(url => url.searchParams.get('pagina'));
    assert.deepEqual(pages, changed ? ['1', '2'] : ['1', '2', '3']);
    assert(entry.listagens.historico.length > 0);
    if (changed) {
      assert(!Object.hasOwn(entry.listagens, 'arquivos'));
      assert.equal(entry.arquivos.length, 0);
      assert(entry.erros.some(error => error.secao === 'arquivos' && error.codigo === 'SOURCE_CHANGED'));
    } else {
      assert.deepEqual(entry.erros, []);
      assert.equal(entry.arquivos.length, 102);
      assert.equal(entry.arquivos.at(-1).titulo, 'Arquivo 102');
    }
  }
});

test('FULL-16: o limite de exportação não encerra a busca que aguarda o mesmo domínio', async () => {
  const started = Promise.withResolvers(),
    response = Promise.withResolvers();
  let calls = 0;
  const { service } = fixtureService(
    [document(1)],
    {
      handler: url => {
        if (!url.pathname.endsWith('/filters') || ++calls > 1) return null;
        started.resolve();
        return response.promise;
      }
    },
    { PNCP_MAX_FULL_EXPORT_BYTES: 1024 }
  );
  const input = { pncp_filters: { modalidades: ['6'] } };
  const exporting = assert.rejects(run(service, input), { code: 'FULL_EXPORT_RESPONSE_BYTES_LIMIT' });
  await started.promise;
  const searching = service.execute(query(input));
  response.resolve(Response.json({ filters: { modalidades: [{ id: 6, nome: 'x'.repeat(2048) }] } }));
  const [, search] = await Promise.all([exporting, searching]);
  assert.equal(search.total, 1);
  assert.equal(calls, 2);
});

test('FULL-17: rejeita consulta não objeto, trata numeroItem textual ou fora de faixa e aplica limite de listagem', async () => {
  const empty = fixtureService([]);
  for (const bad of [null, []])
    await assert.rejects(fullExport(empty.service, bad, new AbortController().signal, 'x'), { code: 'INVALID_TYPE' });
  assert.equal(empty.requests.length, 0);

  const missingIdentity = fixtureService([document(1, { orgao_cnpj: null })]);
  const [noId] = exportJson(await run(missingIdentity.service)).documentos;
  assert.equal(noId.identificacao, null);
  assert.deepEqual(
    noId.erros.map(e => [e.secao, e.codigo]),
    [['documento', 'MISSING_IDENTITY']]
  );

  const mixedItems = fixtureService([document(1)], {
    itemQuantity: 2,
    items: () => [
      { numeroItem: '01', temResultado: true },
      { numeroItem: '9007199254740993', temResultado: true }
    ],
    handler: url =>
      url.pathname.endsWith('/itens/1/resultados')
        ? Response.json([{ sequencialResultado: 1, nomeRazaoSocialFornecedor: 'Empresa A' }])
        : null
  });
  const [itemDoc] = exportJson(await run(mixedItems.service)).documentos;
  assert.equal(itemDoc.itens[0].resultados.length, 1);
  assert.equal(itemDoc.itens[0].resultados[0].fornecedor, 'Empresa A');
  assert(itemDoc.erros.some(e => e.secao === 'itens/9007199254740993/resultados' && e.codigo === 'INVALID_ITEM'));

  const limitedRelated = demoService({
    settings: { PNCP_MAX_DETAIL_ITEMS: 10 },
    fail: url => {
      if (url.pathname === '/api/search/') return Response.json({ items: demoDocuments.slice(0, 1), total: 1 });
      if (url.pathname.endsWith('/arquivos/quantidade')) return Response.json(20);
      if (url.pathname.endsWith('/arquivos'))
        return Response.json(Array.from({ length: 20 }, (_, i) => ({ titulo: `A${i + 1}`, url: null })));
      return null;
    }
  });
  const [limitedDoc] = exportJson(await run(limitedRelated.service)).documentos;
  assert(limitedDoc.erros.some(e => e.secao === 'arquivos' && e.codigo === 'DETAIL_ITEM_LIMIT'));
});

test('FULL-18: isola falhas em detalhes, resultados e filhos de contrato e coleta histórico até vazio', async () => {
  let historyCalls = 0;
  const { service } = demoService({
    fail: url => {
      if (url.pathname.endsWith('/contratos/2026/1')) return new Response('{}', { status: 500 });
      if (url.pathname.endsWith('/termos/1/arquivos')) return new Response('{}', { status: 500 });
      if (url.pathname.endsWith('/historico/quantidade')) return Response.json(0);
      if (url.pathname.endsWith('/historico')) {
        historyCalls++;
        const page = Number(url.searchParams.get('pagina'));
        return page === 1
          ? Response.json([{ tipoLogManutencaoNome: 'Inclusão', documentoTitulo: 'Contrato' }])
          : Response.json([]);
      }
      return null;
    }
  });
  const [contractDoc] = exportJson(await run(service, { document_type: 'contrato', q: 'firewall' })).documentos;
  assert.equal(contractDoc.detalhes, null);
  assert(contractDoc.erros.some(e => e.secao === 'detalhes' && e.codigo === 'PNCP_HTTP_ERROR'));
  assert(contractDoc.erros.some(e => e.secao === 'termos/1' && e.codigo === 'PNCP_HTTP_ERROR'));
  assert.equal(contractDoc.listagens.historico.length, 1);
  assert(historyCalls >= 2);

  const started = Promise.withResolvers(),
    response = Promise.withResolvers();
  let calls = 0;
  const shared = fixtureService(
    [document(1)],
    {
      handler: url => {
        if (!url.pathname.endsWith('/filters')) return null;
        if (++calls === 1) {
          started.resolve();
          return response.promise;
        }
        return Response.json({ filters: { modalidades: [{ id: 6, nome: 'Pregão' }] } });
      }
    },
    { PNCP_MAX_OPERATION_BYTES: 1024 }
  );
  const input = { pncp_filters: { modalidades: ['6'] } };
  const first = assert.rejects(shared.service.execute(query(input)), { code: 'OPERATION_BYTES_LIMIT' });
  await started.promise;
  const second = shared.service.execute(query(input));
  response.resolve(Response.json({ filters: { modalidades: [{ id: 6, nome: 'x'.repeat(2048) }] } }));
  const [, ok] = await Promise.all([first, second]);
  assert.equal(ok.total, 1);
  assert.equal(calls, 2);
});
