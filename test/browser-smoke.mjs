import { build } from 'vite';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

// Executa os testes de navegador em processos separados, alguns em paralelo. Cada arquivo sobe
// seu próprio navegador e servidor estático numa porta livre, então não compartilha estado.
const args = process.argv.slice(2),
  skipBuild = args.includes('--skip-build'),
  serial = args.includes('--serial');
if (args.some(arg => !['--skip-build', '--serial'].includes(arg)))
  throw new Error('Use somente --skip-build e/ou --serial.');
const requested = Number(process.env.CONTRATOS_QA_BROWSER_WORKERS);
if (process.env.CONTRATOS_QA_BROWSER_WORKERS && !(Number.isInteger(requested) && requested >= 1))
  throw new Error('CONTRATOS_QA_BROWSER_WORKERS deve ser um inteiro maior que zero.');
// Acima de três processos o tempo passa a ser limitado pelo arquivo mais longo.
const workers = serial ? 1 : requested || Math.max(1, Math.min(3, availableParallelism() - 1));

async function stage(name, run) {
  const start = performance.now();
  console.log('RUN ' + name);
  await run();
  console.log(`TIME ${name}: ${((performance.now() - start) / 1000).toFixed(2)} s`);
}
if (skipBuild)
  await Promise.all(
    ['../dist-browser/index.html', '../dist-browser-test/index.html'].map(path =>
      access(new URL(path, import.meta.url))
    )
  );
else {
  await stage('build-test', () => build({ mode: 'test' }));
  await stage('build-production', () => build());
}

// Ordem aproximada do mais longo para o mais curto, para distribuir melhor entre os processos.
const files = [
  'ui-smoke-1.mjs',
  'mobile.browser.mjs',
  'ui-smoke-2.mjs',
  'accessibility.browser.mjs',
  'ui-smoke-3.mjs',
  'theme.browser.mjs',
  'filter-labels.browser.mjs',
  'browser-artifact.mjs',
  'select-menu.browser.mjs',
  'details-overflow.browser.mjs',
  'detail-links.browser.mjs',
  'service-worker.browser.mjs',
  'button-motion.browser.mjs',
  'results-table.browser.mjs',
  'pagination.browser.mjs',
  'municipality-filter.browser.mjs',
  'filter-options-cache.browser.mjs',
  'browser-diagnostics.browser.mjs'
];

function runFile(name) {
  const start = performance.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./browser-file.mjs', import.meta.url)), name], {
      env: process.env,
      // Em série, a saída aparece ao vivo; em paralelo, é agrupada por arquivo ao terminar.
      stdio: serial ? 'inherit' : ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout?.on('data', chunk => (output += chunk));
    child.stderr?.on('data', chunk => (output += chunk));
    child.on('close', code => {
      const seconds = ((performance.now() - start) / 1000).toFixed(2);
      if (!serial) process.stdout.write(`RUN ${name}\n${output}`);
      console.log(`TIME ${name}: ${seconds} s${code ? ' (falhou)' : ''}`);
      resolve(code === 0);
    });
  });
}

const queue = [...files],
  failures = [];
const start = performance.now();
await Promise.all(
  Array.from({ length: Math.min(workers, files.length) }, async () => {
    // Após uma falha, os arquivos em andamento terminam, mas nenhum novo começa.
    while (queue.length && !failures.length) {
      const name = queue.shift();
      if (!(await runFile(name))) failures.push(name);
    }
  })
);
console.log(
  `TIME browser-total: ${((performance.now() - start) / 1000).toFixed(2)} s em ${workers} ${workers === 1 ? 'processo' : 'processos'}`
);
if (failures.length) {
  console.error(`Falha em: ${failures.join(', ')}${queue.length ? `; não executados: ${queue.join(', ')}` : ''}`);
  process.exitCode = 1;
}
