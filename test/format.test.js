import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCnpj, formatCpf, formatCpfCnpj, createCellRenderer } from '../public/format.js';

const node = (tag, text, className) => ({ tag, textContent: text, className, title: '' });

test('MASK-01: CNPJ de 14 dígitos recebe a máscara brasileira', () => {
  assert.equal(formatCnpj('01234567000189'), '01.234.567/0001-89');
  assert.equal(formatCnpj('01.234.567/0001-89'), '01.234.567/0001-89', 'máscara é idempotente');
});

test('MASK-02: valores que não são CNPJ permanecem como vieram', () => {
  assert.equal(formatCnpj('123'), '123');
  assert.equal(formatCnpj('0000000000000'), '0000000000000');
  assert.equal(formatCnpj(null), null);
  assert.equal(formatCnpj(''), '');
});

test('MASK-03: campos CPF/CNPJ escolhem a máscara pelo tamanho', () => {
  assert.equal(formatCpfCnpj('12345678901'), '123.456.789-01');
  assert.equal(formatCpfCnpj('01234567000189'), '01.234.567/0001-89');
  assert.equal(formatCpfCnpj('123'), '123');
  assert.equal(formatCpf('01234567000189'), '01234567000189', 'CPF não mascara CNPJ');
});

test('MASK-04: células da tabela aplicam a máscara declarada na coluna', () => {
  const renderCell = createCellRenderer(node);
  assert.equal(renderCell('01234567000189', { field: 'orgao_cnpj', title: 'CNPJ do órgão', type: 'text', mask: 'cnpj' }).textContent, '01.234.567/0001-89');
  assert.equal(renderCell('01234567000189', { field: 'id', title: 'ID', type: 'text' }).textContent, '01234567000189', 'coluna sem máscara não altera');
  assert.equal(renderCell(null, { field: 'orgao_cnpj', type: 'text', mask: 'cnpj' }).textContent, '—');
});
