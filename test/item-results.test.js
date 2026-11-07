import test from 'node:test';
import assert from 'node:assert/strict';
import { json, service } from './helpers.js';
import { MAX_ITEM_RESULTS } from '../src/pncp-core.js';
import { price, priceDifference, differenceText, supplierText } from '../public/item-results.js';

const purchase = { cnpj: '00394452000103', ano: '2026', sequencial: '21678' };
const raw = body => new Response(body, { headers: { 'Content-Type': 'application/json' } });

test('RESULTS-01: consulta o resultado do item e preserva os decimais do PNCP como texto', async () => {
  const s = service([], {
    handler: url =>
      url.pathname.endsWith('/itens/3/resultados')
        ? raw(
            '[{"sequencialResultado":1,"nomeRazaoSocialFornecedor":" PTN Ltda ","niFornecedor":"41358941000189","tipoPessoa":"PJ","quantidadeHomologada":2.00000,"valorUnitarioHomologado":9007199254740993.1234,"valorTotalHomologado":1E+3,"percentualDesconto":0.0000,"ordemClassificacaoSrp":1,"dataResultado":"2026-10-14","dataCancelamento":null,"moedaEstrangeira":null}]'
          )
        : null
  });
  const result = await s.service.itemResults(purchase, 3);
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].pathname, '/api/pncp/v1/orgaos/00394452000103/compras/2026/21678/itens/3/resultados');
  assert.equal(result.total, 1);
  assert.deepEqual(result.data[0], {
    sequencial: '1',
    situacao: null,
    fornecedor: 'PTN Ltda',
    fornecedor_ni: '41358941000189',
    tipo_pessoa: 'PJ',
    porte: null,
    ordem_classificacao_srp: '1',
    quantidade_homologada: '2.00000',
    valor_unitario_homologado: '9007199254740993.1234',
    valor_total_homologado: '1000',
    percentual_desconto: '0.0000',
    moeda_estrangeira: null,
    valor_nominal_moeda_estrangeira: null,
    data_resultado: '2026-10-14',
    data_cancelamento: null,
    motivo_cancelamento: null
  });
});

test('RESULTS-02: item sem resultado (204) é lista vazia; formatos inesperados são rejeitados', async () => {
  const empty = service([], { handler: () => new Response(null, { status: 204 }) });
  assert.deepEqual((await empty.service.itemResults(purchase, 1)).data, []);
  for (const body of [
    {},
    [1],
    [[]],
    [{ valorUnitarioHomologado: 'abc' }],
    [{ nomeRazaoSocialFornecedor: { nome: 'x' } }],
    Array.from({ length: MAX_ITEM_RESULTS + 1 }, () => ({}))
  ]) {
    const s = service([], { handler: () => json(body) });
    await assert.rejects(s.service.itemResults(purchase, 1), error => error.code === 'INVALID_UPSTREAM');
  }
});

test('RESULTS-03: identidade e número do item são validados antes da rede', async () => {
  const s = service([], { handler: () => json([]) });
  for (const [document, item] of [
    [purchase, 0],
    [purchase, 1.5],
    [purchase, '1'],
    [{ ...purchase, cnpj: '1' }, 1],
    [{ ...purchase, type: 'contrato' }, 1]
  ])
    await assert.rejects(s.service.itemResults(document, item));
  assert.equal(s.requests.length, 0);
});

test('RESULTS-04: preço, diferença para o estimado e fornecedor como exibidos', () => {
  assert.equal(price('1000.0000'), 'R$ 1.000,00');
  assert.equal(price('0.1234'), 'R$ 0,1234');
  assert.equal(price('12'), 'R$ 12,00');
  assert.equal(price(null), '—');
  assert.equal(priceDifference('1000.0000', '1719.81'), -41.9);
  assert.equal(priceDifference('1900.1234', '1719.81'), 10.5);
  assert.equal(priceDifference('100', '100.00'), 0);
  assert.equal(priceDifference('0.05', '0.1'), -50);
  assert.equal(priceDifference('99.95', '100'), -0.1);
  assert.equal(priceDifference('99.94', '100'), -0.1);
  assert.equal(priceDifference('100.05', '100'), 0.1);
  assert.equal(priceDifference('1', '3'), -66.7);
  assert.equal(priceDifference('9007199254740993.5', '9007199254740993'), 0);
  for (const [a, b] of [
    ['10', '0'],
    ['10', null],
    [null, '10'],
    ['10', '-5'],
    ['10', 'abc']
  ])
    assert.equal(priceDifference(a, b), null);
  assert.equal(differenceText(-41.9), '41,9% abaixo do estimado');
  assert.equal(differenceText(10), '10,0% acima do estimado');
  assert.equal(differenceText(0), 'Igual ao estimado');
  assert.equal(differenceText(null), null);
  assert.equal(
    supplierText({ fornecedor: 'A', tipo_pessoa: 'PJ', fornecedor_ni: '41358941000189' }),
    'A · CNPJ 41.358.941/0001-89'
  );
  assert.equal(supplierText({ fornecedor: 'B', tipo_pessoa: 'PF', fornecedor_ni: '12345678909' }), 'B · Pessoa física');
  assert.equal(supplierText({ fornecedor: null, tipo_pessoa: 'PE', fornecedor_ni: 'X1' }), 'Fornecedor não informado');
});
