import test from 'node:test';
import assert from 'node:assert/strict';
import { schema } from '../src/schema.js';
import { project } from '../src/adapter.js';
import { config, document } from './helpers.js';

const fields = [
  ['amparo_legal_nome', 'Amparo legal', 'amparos_legais'],
  ['modo_disputa_nome', 'Modo de disputa', 'modos_disputa'],
  ['srp', 'Registro de preços', undefined],
  ['fonte_orcamentaria_nome', 'Fonte orçamentária', 'fontes_orcamentarias'],
  ['usuario_nome', 'Fonte/Plataforma', 'fontes'],
  ['orgao_subrogado_nome', 'Órgão sub-rogado', 'orgaos_subrogados'],
  ['unidade_subrogada_nome', 'Unidade sub-rogada', 'unidades_subrogadas']
];

test('LISTING-01: editais oferecem como colunas opcionais os campos da listagem do PNCP', () => {
  const s = schema(config());
  for (const [field, title, domain] of fields) {
    const column = s.columns_by_document.edital.find(c => c.field === field);
    assert.equal(column?.title, title, field);
    assert.ok(!column.visible, `${field} começa oculta`);
    assert.equal(column.domain, domain, `${field} abre o filtro correspondente`);
    if (domain) assert.ok(s.capabilities.some(c => c.name === domain && c.documents.includes('edital')));
    for (const type of ['ata', 'contrato'])
      assert.ok(!s.columns_by_document[type].some(c => c.field === field), `${field} não aparece em ${type}`);
  }
});

test('LISTING-02: a projeção junta listas da fonte e valida os tipos', () => {
  const row = project(
    document(1, {
      amparo_legal_nome: ['Lei 14.133/2021, Art. 28, I', 'Lei 14.133/2021, Art. 75, II'],
      modo_disputa_nome: 'Aberto',
      srp: true,
      fonte_orcamentaria_nome: ['Federal', 'Estadual'],
      usuario_nome: 'Compras.gov.br',
      orgao_subrogado_nome: null,
      unidade_subrogada_nome: 'Unidade sub-rogada'
    })
  );
  assert.equal(row.amparo_legal_nome, 'Lei 14.133/2021, Art. 28, I; Lei 14.133/2021, Art. 75, II');
  assert.equal(row.modo_disputa_nome, 'Aberto');
  assert.equal(row.srp, true);
  assert.equal(row.fonte_orcamentaria_nome, 'Federal; Estadual');
  assert.equal(row.usuario_nome, 'Compras.gov.br');
  assert.equal(row.orgao_subrogado_nome, null);
  assert.equal(row.unidade_subrogada_nome, 'Unidade sub-rogada');
  assert.equal(project(document(2, { fonte_orcamentaria_nome: [] })).fonte_orcamentaria_nome, null);
  assert.throws(
    () => project(document(3, { srp: 'sim' })),
    error => error.code === 'INVALID_UPSTREAM'
  );
  assert.throws(
    () => project(document(4, { amparo_legal_nome: [1] })),
    error => error.code === 'INVALID_UPSTREAM'
  );
});
