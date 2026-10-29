import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PncpClient } from '../src/pncp-core.js';
import { QueryService } from '../src/query-core.js';
import { config, query } from './helpers.js';

const root = new URL('./fixtures/pncp-live/', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('provenance.json', root), 'utf8'));
const key = address => { const url = new URL(address); url.searchParams.sort(); return url.href; };
const snapshots = new Map(await Promise.all(Object.entries(provenance.responses).map(async ([file, url]) => [key(url), await readFile(new URL(file, root), 'utf8')])));

function fixture() {
  const requests = [], cfg = config();
  const client = new PncpClient(cfg, { fetcher: async address => {
    requests.push(address);
    const body = snapshots.get(key(address));
    assert.notEqual(body, undefined, `Consulta sem captura PNCP: ${address}`);
    return new Response(body, { headers: { 'Content-Type': 'application/json' } });
  } });
  return { service: new QueryService(cfg, client), requests };
}

const examples = [
  { type: 'edital', total: 76894, title: 'Edital nº 3/2026', identity: 'edital:04407920000180-1-000003/2026', document: { type: 'edital', cnpj: '04407920000180', ano: '2026', sequencial: '3' } },
  { type: 'ata', total: 1989, title: 'Ata nº 00003/2026', identity: 'ata:00394601000126-1-000004/2026-000001', document: { type: 'ata', cnpj: '00394601000126', ano: '2026', sequencial_compra: '4', sequencial: '1' } },
  { type: 'contrato', total: 28142, title: 'Contrato nº 00040/2025', identity: 'contrato:02270669000129-2-000086/2025', document: { type: 'contrato', cnpj: '02270669000129', ano: '2025', sequencial: '86' } },
];

test('PNCP-REAL-01: pesquisas reais dos três tipos preservam identidade, paginação e valores', async () => {
  const { service, requests } = fixture();
  for (const example of examples) {
    const result = await service.execute(query({ document_type: example.type, q: 'software' }));
    assert.equal(result.total, example.total);
    assert.equal(result.data.length, 10);
    assert.equal(result.data[0].titulo, example.title);
    assert.equal(result.data[0]._identity, example.identity);
    assert.deepEqual(result.data[0]._document, example.document);
    if (example.type === 'contrato') assert.equal(result.data[0].valor_global, '15172473.44');
  }
  assert.equal(requests.length, 3);
});

test('PNCP-REAL-02: detalhes reais preservam controle, objeto e campos booleanos e decimais', async () => {
  const { service } = fixture();
  const documents = [
    [{ type: 'edital', cnpj: '00394452000103', ano: '2026', sequencial: '21678' }, '00394452000103-1-021678/2026', 'Memória RAM DDR4 32GB 2133MHz 1.2v RDIMM'],
    [{ type: 'ata', cnpj: '00509968000148', ano: '2025', sequencial_compra: '402', sequencial: '1' }, '00509968000148-1-000402/2025-000001', 'Contratação de serviços de instalação de cabeamento lógico e elétrico'],
    [{ type: 'contrato', cnpj: '87711503000153', ano: '2025', sequencial: '50' }, '87711503000153-2-000050/2025', 'Contratação de empresa para instalação de sistema videomonitoramento veicular'],
  ];
  for (const [document, control, object] of documents) {
    const detail = await service.documentDetails(document);
    assert.equal(detail.document_type, document.type);
    assert.equal(detail.fields.find(field => field.field === 'numeroControlePNCP').value, control);
    assert(detail.objeto.startsWith(object));
    if (document.type === 'ata') assert.equal(detail.fields.find(field => field.field === 'numeroAtaRegistroPreco').value, '00013');
    if (document.type === 'contrato') {
      assert.equal(detail.fields.find(field => field.field === 'emendaParlamentar').value, false);
      assert.equal(detail.fields.find(field => field.field === 'valorGlobal').value, '51300.0000');
    }
  }
});

test('PNCP-REAL-03: históricos reais incluem grande total e contagem divergente de contrato', async () => {
  const { service, requests } = fixture();
  const examples = [
    [{ type: 'edital', cnpj: '00394452000103', ano: '2026', sequencial: '21678' }, 7, 1, 7, 'Inclusão - Contratação'],
    [{ type: 'ata', cnpj: '00509968000148', ano: '2025', sequencial_compra: '402', sequencial: '1' }, 66240, 6624, 10, 'Inclusão - Ata'],
    [{ type: 'contrato', cnpj: '87711503000153', ano: '2025', sequencial: '50' }, null, null, 10, 'Retificação - Contrato'],
  ];
  for (const [document, total, pages, count, event] of examples) {
    const history = await service.documentRelated(document, 'historico', 1, 10);
    assert.equal(history.total, total);
    assert.equal(history.total_pages, pages);
    assert.equal(history.data.length, count);
    assert.equal(history.data[0].evento, event);
    assert.equal(history.data[0].justificativa, 'Exigência Legal');
    if (document.type === 'contrato') {
      assert.equal(history.pagination_mode, 'until_empty');
      assert.equal(history.has_more, true);
    }
  }
  assert.equal(requests.length, 6);
});
