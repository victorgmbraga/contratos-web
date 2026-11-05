import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecentFilterOptions,
  RECENT_FILTER_OPTIONS_KEY,
  RECENT_OPTIONS_PER_FIELD
} from '../src/browser/recent-filter-options.js';
import { memoryStorage } from './helpers.js';

test('RECENT-OPTIONS-01: guarda as escolhas por campo, mais recentes primeiro, sem repetir e com limite', () => {
  const storage = memoryStorage(),
    recents = createRecentFilterOptions(() => storage);
  assert.deepEqual(recents.list('orgaos'), []);
  for (let i = 1; i <= RECENT_OPTIONS_PER_FIELD + 2; i++) recents.add('orgaos', { id: i, label: `Órgão ${i}` });
  recents.add('orgaos', { id: '5', label: 'Órgão 5 renomeado' });
  recents.add('fornecedores', { id: '1', label: 'Fornecedor' });
  const restored = createRecentFilterOptions(() => storage);
  const organs = restored.list('orgaos');
  assert.equal(organs.length, RECENT_OPTIONS_PER_FIELD);
  assert.deepEqual(organs[0], { id: '5', label: 'Órgão 5 renomeado' });
  assert.deepEqual(organs[1], { id: '10', label: 'Órgão 10' });
  assert.equal(organs.filter(option => option.id === '5').length, 1);
  assert(!organs.some(option => option.id === '1'));
  assert.deepEqual(restored.list('fornecedores'), [{ id: '1', label: 'Fornecedor' }]);
  // A lista devolvida é uma cópia.
  restored.list('orgaos').pop();
  assert.equal(restored.list('orgaos').length, RECENT_OPTIONS_PER_FIELD);
});

test('RECENT-OPTIONS-02: abas preservam o que as outras gravaram', () => {
  const storage = memoryStorage(),
    first = createRecentFilterOptions(() => storage),
    second = createRecentFilterOptions(() => storage);
  first.add('orgaos', { id: '1', label: 'A' });
  second.add('orgaos', { id: '2', label: 'B' });
  assert.deepEqual(
    createRecentFilterOptions(() => storage)
      .list('orgaos')
      .map(option => option.id),
    ['2', '1']
  );
});

test('RECENT-OPTIONS-03: descarta dados inválidos sem apagar outras chaves e ignora opções vazias', () => {
  for (const invalid of [
    '{',
    '[]',
    'null',
    JSON.stringify({ orgaos: 'x' }),
    JSON.stringify({ orgaos: [['1']] }),
    JSON.stringify({ orgaos: [['1', '']] }),
    JSON.stringify({ orgaos: Array.from({ length: RECENT_OPTIONS_PER_FIELD + 1 }, (_, i) => [String(i), 'X']) }),
    JSON.stringify(Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`campo${i}`, []])))
  ]) {
    const storage = memoryStorage();
    storage.setItem('preferencia-do-usuario', 'preservar');
    storage.setItem(RECENT_FILTER_OPTIONS_KEY, invalid);
    const recents = createRecentFilterOptions(() => storage);
    assert.deepEqual(recents.list('orgaos'), []);
    assert.equal(storage.getItem(RECENT_FILTER_OPTIONS_KEY), null);
    assert.equal(storage.getItem('preferencia-do-usuario'), 'preservar');
    recents.add('orgaos', { id: '', label: 'Sem ID' });
    recents.add('orgaos', { id: '1', label: '' });
    assert.equal(storage.getItem(RECENT_FILTER_OPTIONS_KEY), null);
  }
});

test('RECENT-OPTIONS-04: armazenamento bloqueado ou sem espaço mantém as escolhas na sessão', () => {
  const blocked = createRecentFilterOptions(() => {
    throw new Error('SecurityError');
  });
  blocked.add('orgaos', { id: '1', label: 'A' });
  blocked.add('fornecedores', { id: '2', label: 'B' });
  assert.deepEqual(blocked.list('orgaos'), [{ id: '1', label: 'A' }]);
  assert.deepEqual(blocked.list('fornecedores'), [{ id: '2', label: 'B' }]);
  const full = memoryStorage();
  full.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  const quota = createRecentFilterOptions(() => full);
  quota.add('orgaos', { id: '1', label: 'A' });
  quota.add('orgaos', { id: '2', label: 'B' });
  assert.deepEqual(
    quota.list('orgaos').map(option => option.id),
    ['2', '1']
  );
  // Muitos campos: os mais antigos saem primeiro.
  const storage = memoryStorage(),
    many = createRecentFilterOptions(() => storage);
  for (let i = 0; i < 45; i++) many.add(`campo${i}`, { id: '1', label: 'A' });
  assert.deepEqual(many.list('campo0'), []);
  assert.deepEqual(many.list('campo44'), [{ id: '1', label: 'A' }]);
});
