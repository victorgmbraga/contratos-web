import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCnpj, formatCpf, formatCpfCnpj, createCellRenderer } from '../public/format.js';

const node = (tag, text, className) => ({ tag, textContent: text, className, title: '' });

test('MASK-01: CNPJ de 14 dígitos recebe a máscara brasileira', () => {
  assert.equal(formatCnpj('01234567000189'), '01.234.567/0001-89');
  assert.equal(formatCnpj('01.234.567/0001-89'), '01.234.567/0001-89', 'máscara é idempotente');
  assert.equal(formatCnpj('01234567000189 - Órgão público'), '01.234.567/0001-89 - Órgão público');
  assert.equal(
    formatCnpj('01.234.567/0001-89 - Órgão público'),
    '01.234.567/0001-89 - Órgão público',
    'nome preservado e máscara idempotente'
  );
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
  assert.equal(
    renderCell('01234567000189', { field: 'orgao_cnpj', title: 'CNPJ do órgão', type: 'text', mask: 'cnpj' })
      .textContent,
    '01.234.567/0001-89'
  );
  assert.equal(
    renderCell('01234567000189', { field: 'id', title: 'ID', type: 'text' }).textContent,
    '01234567000189',
    'coluna sem máscara não altera'
  );
  assert.equal(renderCell(null, { field: 'orgao_cnpj', type: 'text', mask: 'cnpj' }).textContent, '—');
});

test('CHIPS-01: critérios ativos mostram datas e números no padrão brasileiro', async () => {
  const { filterValueText } = await import('../public/format.js');
  assert.equal(filterValueText({ name: 'data_publicacao_inicio', type: 'date' }, '2026-10-01'), '01/10/2026');
  assert.equal(filterValueText({ name: 'valor_total_estimado_min', type: 'decimal' }, '1000.5'), 'R$ 1.000,50');
  assert.equal(filterValueText({ name: 'resultado_percentual_desconto_min', type: 'decimal' }, '5.25'), '5,25%');
  assert.equal(filterValueText({ name: 'item_quantidade_min', type: 'decimal' }, '1500.5'), '1.500,5');
  assert.equal(filterValueText({ name: 'ordem_classificacao_max', type: 'integer' }, 1200), '1.200');
  assert.equal(filterValueText({ name: 'srp', type: 'boolean' }, false), 'Não');
  assert.equal(filterValueText({ name: 'codigo_ibge', type: 'text' }, '5300108'), '5300108');
  assert.equal(filterValueText(undefined, 'livre'), 'livre');
});
