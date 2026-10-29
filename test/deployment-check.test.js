import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDeployment } from './deployment-check.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'contratos-deployment-'));
  const files = new Map([
    ['index.html', ['text/html', '<html>nova versão</html>']],
    ['pncp-diagnostic.html', ['text/html', '<html>diagnóstico</html>']],
    ['browser-config.json', ['application/json', '{}']],
    ['theme-boot.js', ['application/javascript', 'theme()']],
    ['sw.js', ['application/javascript', 'worker()']],
    ['og-image.png', ['image/png', 'image']],
    ['assets/index-test.js', ['application/javascript', 'app()']],
    ['assets/index-test.css', ['text/css', 'body {}']],
    ['assets/worker-test.js', ['text/javascript', 'run()']],
    ['assets/favicon-test.svg', ['image/svg+xml', '<svg/>']],
  ]);
  await mkdir(join(directory, 'assets'));
  for (const [path, [, body]] of files) await writeFile(join(directory, path), body);
  const requests = [], changes = new Map();
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname.slice('/projeto/'.length) || 'index.html';
    requests.push({ path, url });
    const change = changes.get(path)?.(requests.filter(entry => entry.path === path).length);
    const file = files.get(path);
    if (!file || change?.status) { response.writeHead(change?.status || 404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': change?.type || file[0] });
    response.end(change?.body ?? file[1]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  return { directory, files, requests, changes, baseUrl: `http://127.0.0.1:${server.address().port}/projeto/` };
}

test('DEPLOY-01: aguarda a propagação e compara os recursos da aplicação servidos em subdiretório', async t => {
  const f = await fixture(t), waits = [], warnings = [];
  f.changes.set('index.html', count => count === 1 ? { body: '<html>versão anterior</html>' } : {});
  const result = await verifyDeployment({ ...f, revision: 'abc123', attempts: 3, wait: async ms => waits.push(ms), log: () => {}, warn: text => warnings.push(text) });
  assert.deepEqual(result, { files: f.files.size, attempt: 2 });
  assert.deepEqual(waits, [5000]);
  assert.match(warnings[0], /index\.html: conteúdo publicado difere/);
  assert.equal(f.requests[0].url.searchParams.get('deploy-check'), 'abc123-1');
  assert.equal(f.requests[1].url.searchParams.get('deploy-check'), 'abc123-2');
  for (const path of f.files.keys()) assert(f.requests.some(request => request.path === path), path);
});

test('DEPLOY-02: falha quando há recurso ausente, MIME inválido ou conteúdo divergente', async t => {
  const f = await fixture(t);
  const cases = [
    ['assets/worker-test.js', { status: 404 }, /worker-test\.js: HTTP 404/],
    ['assets/index-test.js', { type: 'text/html' }, /index-test\.js: Content-Type inesperado/],
    ['browser-config.json', { body: '{"stale":true}' }, /browser-config\.json: conteúdo publicado difere/],
  ];
  for (const [path, response, expected] of cases) {
    f.changes.clear();f.changes.set(path, () => response);
    const waits = [];
    await assert.rejects(verifyDeployment({ ...f, revision: 'abc123', attempts: 2, wait: async ms => waits.push(ms), log: () => {}, warn: () => {} }), expected);
    assert.deepEqual(waits, [5000]);
  }
});

test('DEPLOY-03: rejeita origem insegura e build sem Worker antes da verificação remota', async t => {
  const f = await fixture(t);
  await assert.rejects(verifyDeployment({ ...f, baseUrl: 'http://example.com/', revision: 'abc' }), /deve usar HTTPS/);
  await rm(join(f.directory, 'assets/worker-test.js'));
  await assert.rejects(verifyDeployment({ ...f, revision: 'abc' }), /bundles principais/);
  assert.equal(f.requests.length, 0);
});
