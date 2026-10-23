import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../public/session.js';

test('SESSION-01: um token novo invalida respostas do token anterior', () => {
  const session = createSession();
  const first = session.next('query');
  assert.equal(session.current('query', first), true);
  const second = session.next('query');
  assert.notEqual(second, first);
  assert.equal(session.current('query', first), false);
  assert.equal(session.current('query', second), true);
});

test('SESSION-02: tipos de operação são independentes', () => {
  const session = createSession();
  const query = session.next('query');
  const detail = session.next('detail');
  assert.equal(session.current('query', query), true);
  assert.equal(session.current('detail', detail), true);
  session.next('detail');
  assert.equal(session.current('query', query), true, 'invalidar detalhes não invalida a busca');
  assert.equal(session.current('detail', detail), false);
});

test('SESSION-03: last expõe o token atual sem incrementá-lo', () => {
  const session = createSession();
  const token = session.next('domains');
  assert.equal(session.last('domains'), token);
  assert.equal(session.last('domains'), token);
  assert.equal(session.current('domains', token), true);
  assert.equal(session.last('inexistente'), 0);
  assert.equal(session.current('inexistente', 0), true);
});
