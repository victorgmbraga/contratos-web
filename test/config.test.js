import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import viteConfig from '../vite.config.js';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const cspOf = (command, mode) => viteConfig({ command, mode }).server.headers['Content-Security-Policy'];
const metaOf = (command, mode) => {
  const plugin = viteConfig({ command, mode }).plugins.find(entry => entry.transformIndexHtml);
  return plugin.transformIndexHtml.handler('<head></head>').match(/content="([^"]+)"/)[1];
};

test('PKG-01: o projeto exige Node.js 24 LTS ou superior', () => {
  assert.equal(manifest.engines.node, '>=24.0.0');
});

test('CSP-01: o servidor de desenvolvimento permite os estilos injetados e o WebSocket de HMR', () => {
  const dev = cspOf('serve', 'development');
  assert.match(dev, /style-src 'self' 'unsafe-inline'/);
  assert.match(dev, /connect-src [^;]* ws:/);
  assert.match(metaOf('serve', 'development'), /style-src 'self' 'unsafe-inline'/);
});

test('CSP-02: o build publicado mantém a política restritiva', () => {
  const build = cspOf('build', 'production');
  assert.match(build, /style-src 'self'(;|$)/);
  assert.doesNotMatch(build, /unsafe-inline/);
  assert.doesNotMatch(build, /\bws:/);
  assert.match(build, /frame-ancestors 'self'/);
});

test('CSP-03: demo e preview seguem o modo em que são servidos', () => {
  assert.doesNotMatch(cspOf('build', 'demo'), /style-src 'self' 'unsafe-inline'/);
  assert.match(cspOf('serve', 'demo'), /style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(cspOf('serve', 'production'), /unsafe-inline/);
  assert.doesNotMatch(metaOf('serve', 'production'), /unsafe-inline/);
});
