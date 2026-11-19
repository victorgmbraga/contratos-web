import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { PncpClient, dispositionName } from '../src/pncp-core.js';
import { QueryService } from '../src/query-core.js';
import { fullExport, safeFileName, folderName, FULL_EXPORT_LIMIT, fullExportSections } from '../src/full-export.js';
import { zipWriter, crc32 } from '../src/zip.js';
import { createRuntime } from '../src/browser/runtime.js';
import { demoFetch, demoDocuments } from './demo-fixtures.js';
import { config, service as fixtureService, document, query } from './helpers.js';

/** Lê um ZIP sem ZIP64 e confere o CRC de cada entrada. */
function readZip(input) {
  const bytes = Buffer.concat(
    input.map(chunk =>
      Buffer.from(
        chunk instanceof ArrayBuffer ? chunk : chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
      )
    )
  );
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  const count = bytes.readUInt16LE(end + 10),
    entries = new Map();
  let offset = bytes.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10),
      crc = bytes.readUInt32LE(offset + 16),
      compressed = bytes.readUInt32LE(offset + 20),
      size = bytes.readUInt32LE(offset + 24),
      nameLength = bytes.readUInt16LE(offset + 28),
      local = bytes.readUInt32LE(offset + 42),
      name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert.equal(flags & 0x0800, 0x0800, 'nomes em UTF-8');
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28),
      raw = bytes.subarray(start, start + compressed),
      data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    assert.equal(data.length, size);
    assert.equal(crc32(data), crc, `CRC de ${name}`);
    entries.set(name, data);
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return entries;
}
const fileBody = url => new TextEncoder().encode(`conteúdo de ${url}`);
function demoService({ files = 'ok', fail = () => null, extra = {} } = {}) {
  const cfg = config({ PNCP_MAX_RETRIES: 0, ...extra }),
    requests = [];
  const fetcher = async (url, init) => {
    const u = new URL(url);
    requests.push(u);
    const failure = fail(u);
    if (failure) return failure;
    if (/\/arquivos\/\d+$/.test(u.pathname)) {
      if (files === 'cors') throw new TypeError('Failed to fetch');
      return new Response(fileBody(url), {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="edital ${u.pathname.split('/').at(-1)}.pdf"`
        }
      });
    }
    assert.equal(init.headers.Accept, 'application/json');
    const result = await demoFetch(url);
    return result instanceof Response ? result : Response.json(result);
  };
  const client = new PncpClient(cfg, { fetcher });
  return { service: new QueryService(cfg, client), requests };
}
const exportJson = entries => JSON.parse(entries.get('exportacao.json').toString('utf8'));

test('FULL-01: ZIP traz JSON por documento, itens com resultados, listagens e arquivos em pastas', async () => {
  const { service } = demoService();
  const progress = [];
  const result = await fullExport(service, query({ q: 'firewall' }), new AbortController().signal, 'r1', {
    onProgress: p => progress.push(p),
    now: () => new Date('2026-11-19T10:00:00Z')
  });
  const expected = demoDocuments.filter(d => d.description.toLowerCase().includes('firewall'));
  assert(expected.length > 1 && expected.length <= FULL_EXPORT_LIMIT);
  const entries = readZip(result.chunks),
    json = exportJson(entries);
  assert.equal(json.formato, 'contratos-web/exportacao-completa');
  assert.equal(json.consulta.criterios.q, 'firewall');
  assert.equal(json.documentos.length, expected.length);
  assert.equal(result.metadata.exported_rows, expected.length);
  assert.equal(result.metadata.export_scope, 'full');
  assert.equal(result.metadata.finished_at, '2026-11-19T10:00:00.000Z');
  assert.equal(progress.at(-1).phase, 'zip');
  assert.equal(progress.filter(p => p.phase === 'documents').at(-1).documents, expected.length);
  for (const [index, doc] of json.documentos.entries()) {
    assert.equal(doc.indice, index + 1);
    assert.equal(doc.pasta, folderName(index, doc.documento));
    assert.equal(doc.tipo_documento, 'edital');
    assert.deepEqual(doc.erros, []);
    assert(doc.detalhes.fields.length > 0);
    assert.deepEqual(Object.keys(doc.listagens), fullExportSections.edital);
    assert(Array.isArray(doc.itens) && doc.itens.length > 0);
    for (const item of doc.itens) assert.equal('resultados' in item, item.temResultado === true);
    assert(doc.itens.some(item => item.resultados?.length));
    assert.equal(doc.arquivos.length, doc.listagens.arquivos.length);
    assert([0, 12].includes(doc.arquivos.length), 'todas as páginas da listagem de arquivos');
    for (const file of doc.arquivos) {
      assert.equal(file.situacao, 'incluido');
      assert(file.arquivo.startsWith(`${doc.pasta}/`));
      assert.equal(entries.get(file.arquivo).toString('utf8'), new TextDecoder().decode(fileBody(file.url)));
      assert.equal(file.tamanho_bytes, entries.get(file.arquivo).length);
      assert.match(file.nome_original, /^edital \d+\.pdf$/);
    }
    assert(!('usedNames' in doc) && !('blobs' in doc));
    assert(Object.keys(doc.documento).every(key => !key.startsWith('_')));
  }
  assert(json.documentos.some(doc => doc.arquivos.length === 12));
  assert.equal(result.metadata.files_included, result.metadata.files_total);
  assert.equal(entries.size, 2 + result.metadata.files_included);
  assert.match(entries.get('arquivos.html').toString('utf8'), /Incluído no ZIP/);
});

test('FULL-02: atas e contratos trazem registros filhos e arquivos dos termos', async () => {
  const { service } = demoService();
  const ata = exportJson(
    readZip(
      (await fullExport(service, query({ document_type: 'ata', q: 'firewall' }), new AbortController().signal, 'a'))
        .chunks
    )
  );
  assert(ata.documentos.length > 0);
  for (const doc of ata.documentos) {
    assert.deepEqual(Object.keys(doc.listagens), fullExportSections.ata);
    assert.equal('itens' in doc, false);
    assert.deepEqual(doc.erros, []);
  }
  const contract = exportJson(
    readZip(
      (
        await fullExport(
          service,
          query({ document_type: 'contrato', q: 'firewall' }),
          new AbortController().signal,
          'c'
        )
      ).chunks
    )
  );
  const doc = contract.documentos[0];
  assert.deepEqual(Object.keys(doc.listagens), fullExportSections.contrato);
  assert.deepEqual(doc.erros, []);
  assert(doc.listagens.empenhos.every(record => !record.sequencial || Array.isArray(record.detalhe)));
  const term = doc.listagens.termos.find(record => record.sequencial);
  assert(term?.arquivos.length > 0);
  assert(doc.arquivos.some(file => file.origem === `termos/${term.sequencial}` && file.situacao === 'incluido'));
});

test('FULL-03: limite de 100 documentos é conferido antes de qualquer detalhe', async () => {
  const s = fixtureService(Array.from({ length: FULL_EXPORT_LIMIT + 1 }, (_, i) => document(i + 1)));
  await assert.rejects(
    fullExport(s.service, query(), new AbortController().signal, 'x'),
    error => error.code === 'EXPORT_TOO_BROAD' && error.details.limit === FULL_EXPORT_LIMIT
  );
  assert(s.requests.every(u => !u.pathname.includes('/orgaos/')));
});

test('FULL-04: bloqueio do navegador nos arquivos para após duas falhas e mantém os links', async () => {
  const { service, requests } = demoService({ files: 'cors' });
  const result = await fullExport(service, query({ q: 'firewall' }), new AbortController().signal, 'b');
  const entries = readZip(result.chunks),
    json = exportJson(entries),
    files = json.documentos.flatMap(doc => doc.arquivos);
  assert.equal(requests.filter(u => /\/arquivos\/\d+$/.test(u.pathname)).length, 2);
  assert(files.length > 2);
  assert(files.every(file => file.situacao === 'nao_baixado' && file.url && file.motivo));
  assert.equal(result.metadata.files_blocked, true);
  assert.equal(result.metadata.files_included, 0);
  assert.equal(entries.size, 2);
  assert.match(json.observacoes.at(-1), /links públicos/);
  const html = entries.get('arquivos.html').toString('utf8');
  assert.equal(html.match(/<a href="https:\/\/pncp\.gov\.br\//g).length, files.length);
});

test('FULL-05: falha de uma listagem fica registrada no documento sem interromper a exportação', async () => {
  const { service } = demoService({
    fail: u => (u.pathname.endsWith('/historico/quantidade') ? new Response('{}', { status: 500 }) : null)
  });
  const result = await fullExport(service, query({ q: 'firewall' }), new AbortController().signal, 'f');
  const json = exportJson(readZip(result.chunks));
  for (const doc of json.documentos) {
    assert.deepEqual(doc.erros, [
      { secao: 'historico', codigo: 'PNCP_HTTP_ERROR', mensagem: 'PNCP retornou HTTP 500.' }
    ]);
    assert.equal('historico' in doc.listagens, false);
  }
  assert(json.documentos.some(doc => doc.arquivos.length === 12));
  assert.equal(result.metadata.errors, json.documentos.length);
});

test('FULL-06: cancelamento interrompe a coleta sem devolver ZIP', async () => {
  const controller = new AbortController();
  const { service } = demoService({
    fail: u => {
      if (u.pathname.endsWith('/itens/quantidade'))
        controller.abort(new DOMException('Operação cancelada.', 'AbortError'));
      return null;
    }
  });
  await assert.rejects(
    fullExport(service, query({ q: 'firewall' }), controller.signal, 'c'),
    error => error.name === 'AbortError'
  );
});

test('FULL-07: runtime expõe fullExport com ZIP transferível', async () => {
  const runtime = createRuntime(
    { PNCP_REQUESTS_PER_SECOND: 1000, PNCP_MAX_RETRIES: 0 },
    {
      fetcher: async url => {
        const u = new URL(url);
        if (/\/arquivos\/\d+$/.test(u.pathname))
          return new Response(fileBody(url), { headers: { 'Content-Type': 'application/pdf' } });
        const result = await demoFetch(url);
        return result instanceof Response ? result : Response.json(result);
      }
    }
  );
  try {
    const result = await runtime.run('1', 'fullExport', { query: { api_version: '2.0', q: 'firewall' } });
    assert.equal(result.mime, 'application/zip');
    assert.match(result.filename, /^contratos-web-completa-\d{8}T\d{6}Z\.zip$/);
    assert(result.chunks.every(chunk => chunk instanceof ArrayBuffer));
    assert.equal(new Set(result.chunks).size, result.chunks.length);
    const json = exportJson(readZip(result.chunks));
    assert(json.documentos.length > 0);
    await assert.rejects(
      runtime.run('2', 'fullExport', { query: {}, scope: 'all' }),
      error => error.code === 'UNKNOWN_FIELD' && error.details.field === 'scope'
    );
  } finally {
    await runtime.close();
  }
});

test('ZIP-01: CRC32, nomes UTF-8, compressão opcional e entradas inválidas', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = zipWriter({ now: new Date(2026, 10, 19, 10, 30, 0) });
  const text = new TextEncoder().encode('ação '.repeat(200));
  await zip.add('dados.json', text, { compress: true });
  await zip.add('pasta/órgão.pdf', new Uint8Array([1, 2, 3]));
  await assert.rejects(zip.add('dados.json', text), /duplicada/);
  for (const name of ['', '/abs', 'a/../b', 'a//b', './a']) await assert.rejects(zip.add(name, text), /inválido/);
  const entries = readZip(zip.finish());
  assert.deepEqual([...entries.keys()], ['dados.json', 'pasta/órgão.pdf']);
  assert.equal(entries.get('dados.json').toString('utf8'), 'ação '.repeat(200));
  assert.deepEqual([...entries.get('pasta/órgão.pdf')], [1, 2, 3]);
});

test('ZIP-02: nomes de arquivos e pastas seguros e Content-Disposition', () => {
  assert.equal(safeFileName('a/b\\c:d*e?"f<g>h|i.pdf'), 'a_b_c_d_e_f_g_h_i.pdf');
  assert.equal(safeFileName('  ..  '), 'arquivo');
  assert.equal(safeFileName('CON.pdf'), '_CON.pdf');
  assert.equal(safeFileName(`${'x'.repeat(200)}.pdf`).length, 120);
  assert.match(safeFileName(`${'x'.repeat(200)}.pdf`), /\.pdf$/);
  assert.equal(
    folderName(0, { numero_controle_pncp: '00394452000103-1-021678/2026' }),
    '001-00394452000103-1-021678-2026'
  );
  assert.equal(folderName(99, {}), '100-documento');
  assert.equal(dispositionName('attachment; filename="Edital 1.pdf"'), 'Edital 1.pdf');
  assert.equal(dispositionName("attachment; filename=x.pdf; filename*=UTF-8''%C3%B3rg%C3%A3o.pdf"), 'órgão.pdf');
  assert.equal(dispositionName('attachment; filename=plain.zip'), 'plain.zip');
  assert.equal(dispositionName(null), null);
  assert.equal(dispositionName('attachment'), null);
});

test('FILE-01: download recusa links fora do PNCP', async () => {
  const s = fixtureService([]);
  for (const url of ['https://exemplo.com/a.pdf', 'http://pncp.gov.br/a.pdf', 'https://u:p@pncp.gov.br/a', 'nada'])
    await assert.rejects(
      s.client.file(url, { signal: new AbortController().signal }),
      error => error.code === 'UNSAFE_FILE_URL'
    );
});
