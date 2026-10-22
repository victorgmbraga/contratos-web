import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const root = new URL('../dist-browser/assets/', import.meta.url);
const files = await readdir(root);
const sizes = new Map();
for (const name of files) {
  if (!/\.(js|css)$/.test(name)) continue;
  sizes.set(name, gzipSync(await readFile(new URL(name, root))).length);
}
const sizeOf = pattern => [...sizes].filter(([name]) => pattern.test(name)).reduce((total, [, size]) => total + size, 0);
const kb = value => (value / 1024).toFixed(2);
const checks = [
  ['JS da aplicação', sizeOf(/^index-.*\.js$/), 45 * 1024],
  ['CSS da aplicação', sizeOf(/^index-.*\.css$/), 12 * 1024],
  ['Worker', sizeOf(/^worker-.*\.js$/), 38 * 1024],
  ['JavaScript total', sizeOf(/\.js$/), 75 * 1024],
  ['CSS total', sizeOf(/\.css$/), 20 * 1024],
];
let failed = false;
for (const [label, size, limit] of checks) {
  const status = size <= limit ? 'ok' : 'excedido';
  console.log(`${label}: ${kb(size)} KiB gzip (limite ${kb(limit)} KiB) — ${status}`);
  if (size > limit) failed = true;
}
if (failed) process.exitCode = 1;
