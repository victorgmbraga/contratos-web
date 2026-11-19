import test from 'node:test';
import assert from 'node:assert/strict';
import { PncpClient } from '../src/pncp-core.js';
import { QueryService } from '../src/query-core.js';
import { fullExport, FULL_EXPORT_LIMIT, fullExportSections } from '../src/full-export.js';
import { createRuntime } from '../src/browser/runtime.js';
import { demoFetch, demoDocuments } from './demo-fixtures.js';
import { config, service as fixtureService, document, query } from './helpers.js';

const fileDownload = u => /\/arquivos\/\d+$/.test(u.pathname);
function demoService({ fail = () => null } = {}) {
  const cfg = config({ PNCP_MAX_RETRIES: 0 }),
    requests = [];
  const fetcher = async url => {
    const u = new URL(url);
    requests.push(u);
    assert.equal(fileDownload(u), false, 'a exportação não baixa arquivos');
    const failure = fail(u);
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
    assert.deepEqual(Object.keys(doc.listagens), fullExportSections.edital);
    assert(Array.isArray(doc.itens) && doc.itens.length > 0);
    for (const item of doc.itens) assert.equal('resultados' in item, item.temResultado === true);
    assert(doc.itens.some(item => item.resultados?.length));
    assert([0, 12].includes(doc.arquivos.length), 'todas as páginas da listagem de arquivos');
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
  assert.deepEqual(json.resumo, { documentos: expected.length, arquivos: result.metadata.files_total, erros: 0 });
});

test('FULL-02: atas e contratos trazem registros filhos e os links dos arquivos dos termos', async () => {
  const { service } = demoService();
  const ata = exportJson(await run(service, { document_type: 'ata', q: 'firewall' }));
  assert(ata.documentos.length > 0);
  for (const doc of ata.documentos) {
    assert.deepEqual(Object.keys(doc.listagens), fullExportSections.ata);
    assert.equal('itens' in doc, false);
    assert.deepEqual(doc.erros, []);
  }
  const doc = exportJson(await run(service, { document_type: 'contrato', q: 'firewall' })).documentos[0];
  assert.deepEqual(Object.keys(doc.listagens), fullExportSections.contrato);
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
