import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressEstimator } from '../public/progress.js';

test('PROGRESS-01: a primeira amostra não estima porque a taxa ainda é desconhecida', () => {
  const estimator = createProgressEstimator();
  assert.equal(estimator.update({ rows: 100, total: 1000, at: 1000 }), 0);
});

test('PROGRESS-02: estima a partir da taxa observada entre amostras', () => {
  const estimator = createProgressEstimator({ smoothing: 1 });
  estimator.update({ rows: 100, total: 1000, at: 0 });
  assert.equal(estimator.update({ rows: 200, total: 1000, at: 1000 }), 8);
  assert.equal(estimator.update({ rows: 300, total: 1000, at: 2000 }), 7);
});

test('PROGRESS-03: concluído e amostras sem avanço não exibem estimativa', () => {
  const estimator = createProgressEstimator({ smoothing: 1 });
  estimator.update({ rows: 100, total: 1000, at: 0 });
  estimator.update({ rows: 200, total: 1000, at: 1000 });
  assert.equal(estimator.update({ rows: 200, total: 1000, at: 2000 }), 8);
  assert.equal(estimator.update({ rows: 1000, total: 1000, at: 3000 }), 0);
});

test('PROGRESS-04: a suavização reduz o efeito de uma amostra isolada', () => {
  const estimator = createProgressEstimator({ smoothing: 0.3 });
  estimator.update({ rows: 100, total: 1000, at: 0 });
  estimator.update({ rows: 200, total: 1000, at: 1000 });
  const first = estimator.update({ rows: 300, total: 1000, at: 2000 });
  const second = estimator.update({ rows: 400, total: 1000, at: 4000 });
  assert.ok(second > first, 'taxa menor na última amostra aumenta a estimativa');
});
