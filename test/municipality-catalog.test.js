import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMunicipalityCatalog, fetchMunicipalityCatalog } from '../public/municipality-catalog.js';
import { normalizeSearchText, parseMunicipalityCatalog, searchMunicipalities } from '../public/municipality-search.js';

const data = JSON.parse(await readFile(new URL('../public/municipios-ibge.json', import.meta.url), 'utf8'));
const list = parseMunicipalityCatalog(data);

test('MUNICIPALITIES-01: a relação publicada tem os municípios do IBGE com código, nome, UF e capitais', () => {
  assert.equal(list.length, 5571);
  assert.equal(new Set(list.map(item => item.id)).size, list.length);
  assert(list.every(item => /^\d{7}$/.test(item.id) && /^[A-Z]{2}$/.test(item.uf)));
  assert.equal(new Set(list.map(item => item.uf)).size, 27);
  assert.equal(list.filter(item => item.capital).length, 27);
  assert.deepEqual(
    list.find(item => item.id === '5300108'),
    { id: '5300108', label: 'Brasília/DF', name: 'Brasília', uf: 'DF', capital: true, text: 'brasilia' }
  );
  // A UF vem dos dois primeiros dígitos do código IBGE.
  assert(list.every(item => data.ufs[item.id.slice(0, 2)] === item.uf));
});

test('MUNICIPALITIES-02: rejeita relações malformadas', () => {
  for (const invalid of [
    null,
    {},
    { ufs: {}, capitais: [], municipios: {} },
    { ufs: { 53: 'DF' }, capitais: [], municipios: ['530010Brasília'] },
    { ufs: { 53: 'DF' }, capitais: [], municipios: ['9900000Inexistente'] },
    { ufs: { 53: 'DF' }, capitais: [], municipios: [5300108] }
  ])
    assert.throws(() => parseMunicipalityCatalog(invalid), /Relação de municípios inválida/);
});

test('MUNICIPALITIES-03: busca sem acento, por início de nome ou de palavra, com UF e prioridade das UFs', () => {
  const names = (query, options) => searchMunicipalities(list, query, options).items.map(item => item.label);
  assert.equal(normalizeSearchText('  São-Paulo/SP '), 'sao paulo sp');
  assert.deepEqual(names('').length, 27);
  assert(names('').includes('Brasília/DF'));
  assert.deepEqual(names('', { ufs: ['DF'] }), ['Brasília/DF']);
  assert.equal(names('', { ufs: ['AC'] }).length, 22);
  assert.equal(names('sao paulo')[0], 'São Paulo/SP');
  assert.equal(names('bom jesus pi')[0], 'Bom Jesus/PI');
  // Nomes que começam com o termo vêm antes dos que só têm uma palavra iniciada por ele.
  const paulo = names('paulo', { limit: 500 });
  assert(paulo.indexOf('Paulo Afonso/BA') < paulo.indexOf('São Paulo/SP'));
  const preferred = names('bras', { ufs: ['PA'] });
  assert.equal(preferred[0], 'Brasil Novo/PA');
  const { total, items } = searchMunicipalities(list, 'a');
  assert.equal(items.length, 50);
  assert(total > 1000);
  assert.deepEqual(names('zzzz'), []);
});

test('MUNICIPALITIES-04: carrega uma vez, permite nova tentativa após falha e consulta por código', async () => {
  let calls = 0,
    fail = true;
  const catalog = createMunicipalityCatalog(async () => {
    calls++;
    if (fail) throw new Error('offline');
    return data;
  });
  assert.equal(catalog.list, null);
  assert.equal(catalog.get('5300108'), undefined);
  await assert.rejects(catalog.load(), /offline/);
  fail = false;
  const [first, second] = await Promise.all([catalog.load(), catalog.load()]);
  assert.equal(first, second);
  assert.equal(calls, 2);
  assert.equal(catalog.get('5300108').label, 'Brasília/DF');
  assert.equal(catalog.list.length, 5571);
});

test('MUNICIPALITIES-05: o carregador publicado busca o asset ao lado do módulo e trata respostas de erro', async () => {
  const urls = [];
  const ok = fetchMunicipalityCatalog(async url => {
    urls.push(String(url));
    return Response.json(data);
  });
  assert.equal((await ok()).municipios.length, 5571);
  assert.match(urls[0], /\/public\/municipios-ibge\.json$/);
  const failing = fetchMunicipalityCatalog(async () => new Response('', { status: 404 }));
  await assert.rejects(failing(), /Não foi possível carregar a relação de municípios/);
});
