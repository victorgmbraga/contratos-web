import test from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/adapter.js';
import { indexedDocumentFields } from '../src/document-details.js';
import { demoDocuments, demoAtas, demoContracts, demoFetch } from '../src/demo.js';
import { PncpClient } from '../src/pncp-core.js';
import { QueryService } from '../src/query-core.js';
import { config, query } from './helpers.js';

const demoService = () => {
  const cfg = config({ DEMO_MODE: true });
  return new QueryService(cfg, new PncpClient(cfg, { fetcher: demoFetch }));
};

test('PAYLOAD-01: somente editais transportam o registro bruto', () => {
  const edital = project(demoDocuments[0]);
  assert.equal(Object.hasOwn(edital, '_raw'), true);
  assert.equal(typeof edital._raw, 'object');
  assert.equal(Object.hasOwn(project(demoAtas[0]), '_raw'), false);
  assert.equal(Object.hasOwn(project(demoContracts[0]), '_raw'), false);
});

test('PAYLOAD-02: campos indexados do edital continuam disponíveis no painel', () => {
  const fields = indexedDocumentFields(project(demoDocuments[0])._raw);
  assert.ok(fields.length > 5);
  assert.ok(fields.some(field => field.field === 'numero_controle_pncp'));
});

test('PAYLOAD-03: busca de atas e contratos não envia registro bruto nem o projeta', async () => {
  const service = demoService();
  for (const type of ['ata', 'contrato']) {
    const result = await service.execute(query({ document_type: type, size: 10 }));
    assert.ok(result.data.length > 0, type);
    assert.equal(result.data.some(row => Object.hasOwn(row, '_raw')), false, type);
  }
  const editais = await service.execute(query({ document_type: 'edital', size: 10 }));
  assert.ok(editais.data.every(row => row._raw && typeof row._raw === 'object'));
});
