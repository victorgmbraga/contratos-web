import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';

const source = await readFile(new URL('../dist-browser/sw.js', import.meta.url), 'utf8');
const cacheName = source.match(/^const CACHE = '([^']+)';/m)?.[1];
assert.match(cacheName, /^contratos-web-assets-[a-f0-9]{12}$/);
const newCache = cacheName + '-atualizado';
const blockedCache = cacheName + '-bloqueado';
const blockedStorage = `const caches = {
  keys: async () => { throw new Error('Armazenamento bloqueado'); },
  match: async () => { throw new Error('Armazenamento bloqueado'); },
  open: async () => { throw new Error('Armazenamento bloqueado'); }
};\n`;
let version = 1;
const requests = new Map();
const server = http.createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  requests.set(path, (requests.get(path) || 0) + 1);
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/sw.js' || path === '/blocked/sw.js') {
    const name = path.startsWith('/blocked/') ? blockedCache : version === 1 ? cacheName : newCache;
    response.setHeader('Content-Type', 'text/javascript');
    response.end((path.startsWith('/blocked/') ? blockedStorage : '') + source.replace(`const CACHE = '${cacheName}';`, `const CACHE = '${name}';`));
  } else if (path === '/' || path === '/blocked/') {
    response.setHeader('Content-Type', 'text/html');response.end('<!doctype html><title>Service Worker</title>');
  } else if (path.endsWith('/missing.js')) {
    response.writeHead(404);response.end('ausente');
  } else {
    response.setHeader('Content-Type', 'text/plain');response.end('resposta de rede: ' + path);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launchTestBrowser();
try {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/');
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const fetchTwice = path => page.evaluate(async address => [await (await fetch(address)).text(), await (await fetch(address)).text()], path);
  assert.deepEqual(await fetchTwice('/assets/primeiro.js'), ['resposta de rede: /assets/primeiro.js', 'resposta de rede: /assets/primeiro.js']);
  assert.equal(requests.get('/assets/primeiro.js'), 1);
  await fetchTwice('/config.json');assert.equal(requests.get('/config.json'), 2);
  await fetchTwice('/assets/missing.js');assert.equal(requests.get('/assets/missing.js'), 2);
  await page.evaluate(() => caches.open('cache-de-outro-projeto'));
  assert((await page.evaluate(() => caches.keys())).includes(cacheName));

  version = 2;
  await page.evaluate(async () => {
    window.previousWorker = navigator.serviceWorker.controller;
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller !== window.previousWorker && navigator.serviceWorker.controller.state === 'activated');
  const keysAfterUpdate = await page.evaluate(() => caches.keys());
  assert(!keysAfterUpdate.includes(cacheName));
  assert(keysAfterUpdate.includes('cache-de-outro-projeto'));
  await fetchTwice('/assets/primeiro.js');
  assert.equal(requests.get('/assets/primeiro.js'), 2);
  assert((await page.evaluate(() => caches.keys())).includes(newCache));

  const blocked = await browser.newContext(), blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', error => errors.push(error.message));
  await blockedPage.goto(origin + '/blocked/');
  await blockedPage.evaluate(async () => { await navigator.serviceWorker.register('/blocked/sw.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; });
  await blockedPage.waitForFunction(() => !!navigator.serviceWorker.controller);
  const values = await blockedPage.evaluate(async () => [await (await fetch('/blocked/assets/arquivo.js')).text(), await (await fetch('/blocked/assets/arquivo.js')).text()]);
  assert.deepEqual(values, ['resposta de rede: /blocked/assets/arquivo.js', 'resposta de rede: /blocked/assets/arquivo.js']);
  assert.equal(requests.get('/blocked/assets/arquivo.js'), 2);
  assert.deepEqual(errors, []);
  console.log('PASS Service Worker: cache, atualização, limpeza seletiva e fallback quando o armazenamento falha');
} catch (error) {
  await diagnoseBrowserFailure(error);throw error;
} finally {
  await browser.close();await new Promise(resolve => server.close(resolve));
}
