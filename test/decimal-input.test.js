import test from 'node:test';
import assert from 'node:assert/strict';
import { decimalKind, formatDecimalInput, parseDecimalInput, sanitizeDecimalInput } from '../public/decimal-input.js';

test('DECIMAL-INPUT-01: tipo do campo pelo nome do filtro', () => {
  assert.equal(decimalKind('valor_total_estimado_min'), 'money');
  assert.equal(decimalKind('item_valor_unitario_estimado_max'), 'money');
  assert.equal(decimalKind('resultado_percentual_desconto_min'), 'percent');
  assert.equal(decimalKind('item_quantidade_min'), 'quantity');
  assert.equal(decimalKind('resultado_quantidade_homologado_max'), 'quantity');
});

test('DECIMAL-INPUT-02: vírgula decimal e ponto de milhar viram o decimal canônico da API', () => {
  for (const [kind, text, value] of [
    ['money', 'R$ 1.234.567,89', '1234567.89'],
    ['money', '1.000', '1000'],
    ['money', '1000,5', '1000.5'],
    ['money', 'R$ 0,00', '0.00'],
    ['percent', '5,25%', '5.25'],
    ['percent', '100', '100'],
    ['quantity', '1.500,5', '1500.5'],
    ['quantity', '10', '10']
  ])
    assert.deepEqual(parseDecimalInput(kind, text), { value }, `${kind} ${text}`);
  for (const [kind, text] of [
    ['money', '1000.50'],
    ['money', '1.00,5'],
    ['percent', '5.25'],
    ['quantity', '10.5'],
    ['quantity', '1,5,0']
  ])
    assert.ok(parseDecimalInput(kind, text).error, `${kind} ${text} é recusado`);
  assert.deepEqual(parseDecimalInput('money', 'R$ '), { value: undefined });
  assert.deepEqual(parseDecimalInput('percent', ''), { value: undefined });
});

test('DECIMAL-INPUT-03: digitação aceita só os caracteres do tipo', () => {
  assert.equal(sanitizeDecimalInput('percent', 'a5.2,5x%'), '52,5%');
  assert.equal(sanitizeDecimalInput('percent', '%%10,,5'), '10,5%');
  assert.equal(sanitizeDecimalInput('quantity', '1.500,5,0 un'), '1.500,50');
  assert.equal(sanitizeDecimalInput('money', 'R$ 1.000,50'), 'R$ 1.000,50');
  assert.equal(sanitizeDecimalInput('money', 'US$ 10'), '10');
});

test('DECIMAL-INPUT-04: decimal da API exibido no padrão brasileiro', () => {
  assert.equal(formatDecimalInput('money', '1234567.8'), 'R$ 1.234.567,80');
  assert.equal(formatDecimalInput('money', '0.00'), 'R$ 0,00');
  assert.equal(formatDecimalInput('percent', '5.25'), '5,25%');
  assert.equal(formatDecimalInput('quantity', '1500.250'), '1.500,25');
  assert.equal(formatDecimalInput('quantity', undefined), '');
});
