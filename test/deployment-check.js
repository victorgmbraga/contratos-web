import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const types = {
  '.html': ['text/html'],
  '.js': ['text/javascript', 'application/javascript'],
  '.css': ['text/css'],
  '.json': ['application/json'],
  '.svg': ['image/svg+xml'],
  '.png': ['image/png'],
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Compare the public deployment to the exact build that passed browser tests.
export async function verifyDeployment({ baseUrl, directory, revision, fetcher = fetch, attempts = 8, delayMs = 5000, wait = delay, log = console.log, warn = console.warn }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('O endereço publicado deve usar HTTPS.');
  if (!base.pathname.endsWith('/') || base.search || base.hash) throw new Error('A URL publicada deve apontar para um diretório com barra final, sem parâmetros.');
  if (!revision || !Number.isInteger(attempts) || attempts < 1) throw new Error('Informe a revisão e ao menos uma tentativa.');

  const assets = (await readdir(join(directory, 'assets'), { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => `assets/${entry.name}`).sort();
  if (!assets.some(name => /\/index-.*\.js$/.test(name)) || !assets.some(name => /\/index-.*\.css$/.test(name)) || !assets.some(name => /\/worker-.*\.js$/.test(name))) {
    throw new Error('O build não contém os bundles principais de JavaScript, CSS e Worker.');
  }
  const paths = ['index.html', 'pncp-diagnostic.html', 'browser-config.json', 'theme-boot.js', 'sw.js', 'og-image.png', ...assets];
  const expected = await Promise.all(paths.map(async path => ({ path, digest: hash(await readFile(join(directory, path))) })));
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      for (const { path, digest } of expected) {
        const address = new URL(path === 'index.html' ? './' : path, base);
        address.searchParams.set('deploy-check', `${revision}-${attempt}`);
        const response = await fetcher(address, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
        const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        const accepted = types[extname(path)];
        if (accepted && !accepted.includes(mime)) throw new Error(`${path}: Content-Type inesperado (${mime || 'ausente'})`);
        const published = hash(Buffer.from(await response.arrayBuffer()));
        if (published !== digest) throw new Error(`${path}: conteúdo publicado difere do build validado`);
      }
      log(`Deploy verificado: ${expected.length} arquivos correspondem ao build ${revision}.`);
      return { files: expected.length, attempt };
    } catch (error) {
      failure = error;
      warn(`Verificação do deploy (${attempt}/${attempts}): ${error.message}`);
      if (attempt < attempts) await wait(delayMs);
    }
  }
  throw new Error(`O site não corresponde ao build após ${attempts} tentativas: ${failure?.message}`, { cause: failure });
}
