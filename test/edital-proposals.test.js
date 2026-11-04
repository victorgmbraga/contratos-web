import test from 'node:test';
import assert from 'node:assert/strict';
import { schema } from '../src/schema.js';
import { serializeSearch } from '../src/pncp-core.js';
import { project } from '../src/adapter.js';
import { createCellRenderer } from '../public/format.js';
import { config, document, query, service } from './helpers.js';

const node = (tag, text, className) => ({ tag, textContent: text, className, title: '' });

test('PROPOSTAS-01: editais oferecem o status Encerradas, como o portal PNCP', async () => {
  const s = schema(config());
  assert.deepEqual(s.statuses_by_document.edital, [
    'todos',
    'recebendo_proposta',
    'propostas_encerradas',
    'encerradas'
  ]);
  const fake = service([document(1)]);
  await fake.service.execute(query({ document_type: 'edital', status: 'encerradas' }));
  assert.equal(fake.requests.at(-1).searchParams.get('status'), 'encerradas');
  await assert.rejects(
    fake.service.execute(query({ document_type: 'ata', status: 'encerradas' })),
    error => error.code !== undefined
  );
});

test('PROPOSTAS-02: período de recebimento de propostas filtra editais com rótulo próprio', async () => {
  const caps = schema(config()).capabilities;
  for (const [name, label] of [
    ['data_inicio_vigencia_inicio', 'Início do recebimento de propostas a partir de'],
    ['data_inicio_vigencia_fim', 'Início do recebimento de propostas até']
  ]) {
    const cap = caps.find(c => c.name === name);
    assert.equal(cap.state, 'enabled');
    assert.deepEqual(cap.documents, ['edital', 'contrato', 'ata']);
    assert.equal(cap.labels_by_document.edital, label);
    assert.match(cap.label, /^Início da vigência/, 'Atas e contratos mantêm o rótulo de vigência');
  }
  const params = serializeSearch(
    {
      document_type: 'edital',
      q: '',
      status: 'todos',
      order: '-data',
      pncp_filters: { data_inicio_vigencia_inicio: '2026-10-01', data_inicio_vigencia_fim: '2026-10-02' }
    },
    1,
    10
  );
  assert.equal(params.get('data_inicio_vigencia_inicio'), '2026-10-01');
  assert.equal(params.get('data_inicio_vigencia_fim'), '2026-10-02');
  const fake = service([document(1)]);
  await fake.service.execute(
    query({ document_type: 'edital', pncp_filters: { data_inicio_vigencia_inicio: '2026-10-01' } })
  );
  assert.equal(fake.requests.at(-1).searchParams.get('data_inicio_vigencia_inicio'), '2026-10-01');
});

test('PROPOSTAS-03: colunas opcionais de início e fim das propostas em editais', () => {
  const columns = schema(config()).columns_by_document.edital;
  const start = columns.find(c => c.field === 'data_inicio_vigencia'),
    end = columns.find(c => c.field === 'data_fim_vigencia');
  assert.equal(start.title, 'Início das propostas');
  assert.equal(end.title, 'Fim das propostas');
  assert.equal(start.type, 'datetime');
  assert.deepEqual(start.native_range, ['data_inicio_vigencia_inicio', 'data_inicio_vigencia_fim']);
  assert.ok(!start.visible && !end.visible, 'Colunas opcionais, fora da tabela padrão');
  for (const type of ['ata', 'contrato'])
    assert.equal(
      schema(config()).columns_by_document[type].filter(c => c.field === 'data_inicio_vigencia').length,
      1,
      'Atas e contratos não duplicam a coluna de vigência'
    );
  const row = project(document(1, { data_inicio_vigencia: '2026-11-05T08:00', data_fim_vigencia: '2026-11-18T10:00' }));
  assert.equal(row.data_inicio_vigencia, '2026-11-05T08:00');
  assert.equal(row.data_fim_vigencia, '2026-11-18T10:00');
  const renderCell = createCellRenderer(node);
  assert.equal(renderCell('2026-11-05T08:00', start).textContent, '05/11/2026 08:00');
  assert.equal(renderCell('2026-11-18T10:00:59', end).textContent, '18/11/2026 10:00');
  assert.equal(renderCell('2026-11-05', end).textContent, '05/11/2026');
  assert.equal(renderCell(null, end).textContent, '—');
});
