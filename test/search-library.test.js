import test from 'node:test';
import assert from 'node:assert/strict';
import { schema, MAX_QUERY_TEXT } from '../src/schema.js';
import { defaults } from '../src/settings.js';
import { readQueryUrl } from '../src/browser/query-url.js';
import {
  PRESETS,
  createSavedSearches,
  describeQuery,
  MAX_SAVED_SEARCHES,
  presetSearch,
  presetText,
  querySearch,
  readSearch,
  SAVED_SEARCHES_KEY
} from '../public/search-library.js';
import { memoryStorage } from './helpers.js';

const definition = schema(defaults);

test('SEARCH-LIBRARY-01: as buscas prontas são consultas válidas de editais dentro do limite de texto', () => {
  assert.equal(new Set(PRESETS.map(preset => preset.id)).size, PRESETS.length);
  for (const preset of PRESETS) {
    const query = readSearch(presetSearch(preset), definition, 100);
    assert.equal(query.document_type, 'edital', preset.id);
    assert(query.q.length <= MAX_QUERY_TEXT, `${preset.id}: ${query.q.length} caracteres`);
    assert.equal(query.q, presetText(preset));
    assert.deepEqual(query.pncp_filters.tipos_item, 'S');
    assert.deepEqual(query.pncp_filters.situacoes, ['1']);
    assert.deepEqual(query.pncp_filters.situacoes_item, ['1', '2']);
    assert.equal(query.status, 'todos');
  }
  const microsoft = PRESETS.find(preset => preset.id === 'microsoft');
  assert.match(presetText(microsoft), /^microsoft OR m365 OR o365 OR sqlsvrstd OR sqlcal OR "sql server" OR /);
  const federal = readSearch(presetSearch(PRESETS.find(preset => preset.id === 'desenvolvimento')), definition, 100);
  assert.deepEqual(federal.pncp_filters.esferas, ['F']);
  assert.deepEqual(federal.pncp_filters.modalidades, ['6']);
});

test('SEARCH-LIBRARY-02: uma busca salva reproduz a consulta, sem a página, e é descrita em poucas palavras', () => {
  const query = readQueryUrl(
    'https://x.test/?tipos_documento=contrato&q=firewall&status=vigente&ufs=DF|GO&pagina=3&ordenacao=-data',
    definition
  );
  const search = querySearch(query, definition);
  assert(!search.includes('pagina='));
  assert.deepEqual(readSearch(search, definition, 100), { ...query, page: 1 });
  assert.equal(describeQuery(query), 'Contratos · “firewall” · 2 filtros');
  assert.equal(describeQuery({ ...query, q: 'a OR b OR c', status: 'todos' }), 'Contratos · 3 termos · 1 filtro');
  assert.equal(
    describeQuery({ ...query, q: 'x'.repeat(50), status: 'todos', pncp_filters: {} }),
    `Contratos · “${'x'.repeat(40)}…”`
  );
  assert.throws(() => readSearch('?tipos_documento=contrato&srp=talvez', definition, 100));
});

test('SEARCH-LIBRARY-03: buscas salvas ficam neste navegador, mais recentes primeiro, com nome único e limite', () => {
  const storage = memoryStorage(),
    saved = createSavedSearches(() => storage);
  assert.deepEqual(saved.list(), []);
  assert.equal(saved.save('  Firewall  ', '?q=firewall'), true);
  assert.equal(saved.save('Oracle', '?q=oracle'), true);
  assert.equal(saved.save('Firewall', '?q=firewall+OR+utm'), true);
  assert.deepEqual(createSavedSearches(() => storage).list(), [
    { name: 'Firewall', search: '?q=firewall+OR+utm' },
    { name: 'Oracle', search: '?q=oracle' }
  ]);
  assert.equal(saved.save('', '?q=x'), false);
  assert.equal(saved.save('Sem parâmetros', 'q=x'), false);
  saved.remove('Oracle');
  assert.deepEqual(
    saved.list().map(entry => entry.name),
    ['Firewall']
  );
  for (let i = 0; i < MAX_SAVED_SEARCHES + 5; i++) saved.save(`Busca ${i}`, `?q=${i}`);
  const names = saved.list().map(entry => entry.name);
  assert.equal(names.length, MAX_SAVED_SEARCHES);
  assert.equal(names[0], `Busca ${MAX_SAVED_SEARCHES + 4}`);
  assert.equal(saved.save('x'.repeat(80), '?q=longo'), true);
  assert.equal(saved.list()[0].name.length, 60);
});

test('SEARCH-LIBRARY-04: dados inválidos são descartados e armazenamento indisponível mantém a sessão', () => {
  for (const invalid of ['{', '{}', '[1]', JSON.stringify([{ name: 'a', search: 'sem-interrogacao' }])]) {
    const storage = memoryStorage();
    storage.setItem('outra-chave', 'preservar');
    storage.setItem(SAVED_SEARCHES_KEY, invalid);
    assert.deepEqual(createSavedSearches(() => storage).list(), []);
    assert.equal(storage.getItem(SAVED_SEARCHES_KEY), null);
    assert.equal(storage.getItem('outra-chave'), 'preservar');
  }
  const blocked = createSavedSearches(() => {
    throw new Error('SecurityError');
  });
  blocked.save('A', '?q=a');
  blocked.save('B', '?q=b');
  assert.deepEqual(
    blocked.list().map(entry => entry.name),
    ['B', 'A']
  );
  const full = memoryStorage();
  full.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  const quota = createSavedSearches(() => full);
  quota.save('A', '?q=a');
  quota.save('B', '?q=b');
  assert.deepEqual(
    quota.list().map(entry => entry.name),
    ['B', 'A']
  );
});
