import test from 'node:test';
import assert from 'node:assert/strict';
import { createFilterLabelCache, FILTER_LABELS_KEY } from '../src/browser/filter-label-cache.js';
import { memoryStorage } from './helpers.js';

const key = id => JSON.stringify(['edital', 'orgaos', id]);

test('FILTER-LABELS-01: abas preservam seleções umas das outras e atualizam rótulos conhecidos', () => {
  const storage = memoryStorage(),
    first = createFilterLabelCache(() => storage),
    second = createFilterLabelCache(() => storage);
  first.set(key('1'), 'Órgão A');
  second.set(key('2'), 'Órgão B');
  first.set(key('1'), 'Órgão A atualizado');
  const restored = createFilterLabelCache(() => storage);
  assert.equal(restored.get(key('1')), 'Órgão A atualizado');
  assert.equal(restored.get(key('2')), 'Órgão B');
});

test('FILTER-LABELS-02: descarta cache corrompido sem apagar dados alheios e aceita novas seleções', () => {
  for (const invalid of [
    '{',
    '{}',
    '[null]',
    '[[123,"Nome"]]',
    '[["inválido","Nome"]]',
    JSON.stringify([[JSON.stringify(['edital']), 'Nome']]),
    JSON.stringify([[key('1'), null]])
  ]) {
    const storage = memoryStorage();
    storage.setItem('preferencia-do-usuario', 'preservar');
    storage.setItem(FILTER_LABELS_KEY, invalid);
    const cache = createFilterLabelCache(() => storage);
    assert.equal(cache.get(key('1')), undefined);
    assert.equal(storage.getItem(FILTER_LABELS_KEY), null);
    assert.equal(storage.getItem('preferencia-do-usuario'), 'preservar');
    cache.set(key('1'), 'Nome válido');
    assert.equal(createFilterLabelCache(() => storage).get(key('1')), 'Nome válido');
  }
});

test('FILTER-LABELS-03: armazenamento bloqueado, sem quota ou com leitura negada preserva os nomes na sessão', () => {
  const denied = () => {
    throw new Error('Storage indisponível');
  };
  for (const getStorage of [
    denied,
    () => undefined,
    () => ({ getItem: denied, removeItem: denied, setItem: denied }),
    () => ({ getItem: () => null, setItem: denied })
  ]) {
    const cache = createFilterLabelCache(getStorage);
    cache.set(key('1'), 'Nome selecionado');
    assert.equal(cache.get(key('1')), 'Nome selecionado');
  }
});

test('FILTER-LABELS-04: limita o histórico aos mil rótulos mais recentes', () => {
  const cache = createFilterLabelCache(() => undefined);
  for (let i = 0; i <= 1000; i++) cache.set(key(String(i)), 'Nome ' + i);
  assert.equal(cache.get(key('0')), undefined);
  assert.equal(cache.get(key('1000')), 'Nome 1000');
});
