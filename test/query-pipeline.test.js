import test from 'node:test';
import assert from 'node:assert/strict';
import { document, json, query, service } from './helpers.js';

const docs = Array.from({ length: 35 }, (_, index) => document(index + 1));

test('PIPELINE-01: a coleta do CSV solicita a próxima página antes de concluir a atual', async () => {
  let inFlight = 0, peak = 0;
  const s = service(docs, { handler: async url => {
    if (url.pathname.endsWith('/filters')) return null;
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(resolve => setTimeout(resolve, 15));
    inFlight--;
    const page = Number(url.searchParams.get('pagina')), size = Number(url.searchParams.get('tam_pagina'));
    return json({ items: docs.slice((page - 1) * size, page * size), total: docs.length });
  } });
  const result = await s.service.export(query({ document_type: 'edital' }));
  assert.equal(result.metadata.exported_rows, 35);
  assert.equal(peak, 2, 'Uma página adiantada em paralelo à atual');
  assert.deepEqual(s.requests.map(url => url.searchParams.get('pagina')), ['1', '2', '3', '4']);
});

test('PIPELINE-02: pré-carga e validação reutilizam a mesma consulta de domínios', async () => {
  const s = service(docs);
  const [preload] = await Promise.all([
    s.service.domains('edital', undefined, undefined, 'preload', null, 'background'),
    s.service.execute(query({ document_type: 'edital', pncp_filters: { modalidades: ['6'] } })),
  ]);
  assert.ok(preload.filters.modalidades.length);
  await s.service.domains('edital', undefined, undefined, 'again');
  assert.equal(s.requests.filter(url => url.pathname.endsWith('/filters')).length, 1);
});

test('PIPELINE-03: cancelar a pré-carga não cancela a validação que aguardava o mesmo domínio', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const s = service(docs, { handler: async (url, _count, init) => {
    if (!url.pathname.endsWith('/filters')) return null;
    await Promise.race([gate, new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))]);
    return null;
  } });
  const controller = new AbortController();
  const preload = s.service.domains('edital', undefined, controller.signal, 'preload', null, 'background');
  const search = s.service.execute(query({ document_type: 'edital', pncp_filters: { modalidades: ['6'] } }));
  await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort(new DOMException('Operação cancelada.', 'AbortError'));
  await assert.rejects(preload, error => error.name === 'AbortError');
  release();
  assert.equal((await search).total, 35);
});
