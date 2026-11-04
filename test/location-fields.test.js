import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDocumentFields, joinOrganizationFields, recordFields } from '../src/document-details.js';

const titles = fields => fields.map(field => field.title);

test('LOCATION-01: busca indexada mostra Localidade da Unidade como Município/UF, sem código IBGE', () => {
  const fields = indexedDocumentFields({
    document_type: 'edital',
    numero_controle_pncp: '00000000000000-1-000001/2026',
    orgao_cnpj: '00000000000000',
    orgao_nome: 'Órgão',
    unidade_codigo: '2079',
    unidade_nome: 'Fundo Municipal de Saúde',
    uf: 'PA',
    municipio_nome: 'Santana do Araguaia',
    codigo_ibge: '1506708'
  });
  const location = fields.find(field => field.title === 'Localidade da Unidade');
  assert.equal(location.value, 'Santana do Araguaia/PA');
  assert.ok(!titles(fields).some(title => ['UF', 'Município', 'Código IBGE'].includes(title)));
  assert.ok(titles(fields).indexOf('Unidade') < titles(fields).indexOf('Localidade da Unidade'));
});

test('LOCATION-02: detalhes nativos juntam a localidade da unidade e da unidade sub-rogada', () => {
  const fields = recordFields('contrato', {
    numeroControlePNCP: '00000000000000-2-000001/2026',
    orgaoEntidade: { cnpj: '00000000000000', razaoSocial: 'Órgão' },
    unidadeOrgao: {
      codigoUnidade: '1',
      nomeUnidade: 'Unidade',
      ufSigla: 'SC',
      municipioNome: 'Blumenau',
      codigoIbge: '4202404',
      ufNome: 'Santa Catarina'
    },
    unidadeSubRogada: { codigoUnidade: '2', nomeUnidade: 'Sub', ufSigla: 'RS', municipioNome: 'Porto Alegre' }
  });
  assert.equal(fields.find(field => field.title === 'Localidade da Unidade').value, 'Blumenau/SC');
  assert.equal(fields.find(field => field.title === 'Localidade da Unidade sub-rogada').value, 'Porto Alegre/RS');
  assert.ok(!titles(fields).some(title => /^(UF|Município)( da unidade sub-rogada)?$/.test(title)));
});

test('LOCATION-03: campos da busca usados no painel e partes envolvidas também usam a localidade', () => {
  const schemaFields = joinOrganizationFields(
    [
      { field: 'uf', title: 'UF', type: 'text', value: 'DF' },
      { field: 'municipio_nome', title: 'Município', type: 'text', value: 'Brasília' }
    ],
    'schema'
  );
  assert.deepEqual(schemaFields, [
    { field: 'municipio_nome', title: 'Localidade da Unidade', type: 'text', value: 'Brasília/DF' }
  ]);
  const onlyState = joinOrganizationFields([{ field: 'uf', title: 'UF', type: 'text', value: 'GO' }], 'schema');
  assert.deepEqual(
    onlyState.map(field => [field.title, field.value]),
    [['Localidade da Unidade', 'GO']]
  );
  const parts = recordFields('partesenvolvidas', {
    tipoParteEnvolvida: { nome: 'Gerenciadora' },
    orgao: { nome: 'Órgão', cnpj: '00000000000000' },
    unidade: { nomeUnidade: 'Unidade', codigo: '1', localidade: { nomeMunicipio: 'Goiânia', uf: 'GO' } },
    dataInclusao: '2026-10-01T10:00:00'
  });
  assert.equal(parts.find(field => field.title === 'Localidade da Unidade').value, 'Goiânia/GO');
});
