import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../.github/workflows/', import.meta.url);
const source = await readFile(new URL('validate.yml', root), 'utf8');
const jobs = new Map(
  [...source.matchAll(/^ {2}([a-z][a-z_-]*):\n((?:(?: {4,}.*)?\n)*)/gm)].map(match => [match[1], match[2]])
);
const needs = job =>
  (job.match(/^ {4}needs: (.+)$/m)?.[1] || '')
    .replaceAll('[', '')
    .replaceAll(']', '')
    .split(',')
    .map(value => value.trim());
function artifactName(job, action) {
  const step = job.split(/\n {6}- /).find(step => step.includes(`uses: actions/${action}@`));
  const name = step?.match(/\n {10}name: (.+)/)?.[1];
  assert(name, `Artefato ausente em ${action}`);
  return name;
}

// Navegadores em cache por versão do Playwright; instalação com limite de tempo e até três tentativas.
function assertBrowserInstall(job, browser) {
  assert.match(job, /uses: actions\/cache@[^\n]+\n {8}with:\n {10}path: ~\/\.cache\/ms-playwright\n/);
  // A chave acompanha a revisão do navegador, não o package-lock (que muda a cada versão do app).
  assert(
    job.includes(
      `key: playwright-\${{ runner.os }}-${browser}-\${{ hashFiles('node_modules/playwright-core/browsers.json') }}`
    )
  );
  // Dependências do sistema num passo próprio, com retentativas do apt e sem timeout que deixe o apt órfão.
  assert(job.includes(`npx playwright install-deps ${browser}`));
  assert.match(job, /Acquire::Retries/);
  assert(job.includes(`timeout 150 npx playwright install ${browser};`));
  assert(!job.includes('--with-deps'), 'O download do navegador não instala pacotes do sistema');
  assert.match(job, /for attempt in 1 2 3; do/);
  assert(job.indexOf('run: npm ci') < job.indexOf('uses: actions/cache@'));
  assert(job.indexOf('uses: actions/cache@') < job.indexOf('install-deps'));
  assert(job.indexOf('install-deps') < job.indexOf(`timeout 150 npx playwright install ${browser}`));
  assert(job.indexOf(`timeout 150 npx playwright install ${browser}`) < job.indexOf('run: npm run test:browser'));
}

test('WORKFLOW-01: Chromium e Firefox validam em paralelo o mesmo build, sem recompilar', () => {
  const validate = jobs.get('validate'),
    browser = jobs.get('browser');
  assert(validate);
  assert(browser);
  assert(
    validate.indexOf('run: npm run format:check') > 0 &&
      validate.indexOf('run: npm run format:check') < validate.indexOf('run: npm run lint'),
    'Formatação conferida antes do lint'
  );
  assert.match(validate, /run: npm run test:coverage/);
  assert.doesNotMatch(validate, /run: npm test\s*\n/);
  const build = validate.indexOf('run: npm run build:qa'),
    budget = validate.indexOf('run: npm run test:budget'),
    upload = validate.indexOf('uses: actions/upload-artifact@');
  assert(build >= 0 && budget > build && upload > budget);
  assert.match(validate, /dist-browser\/\n/);
  assert.match(validate, /dist-browser-test\/\n/);
  assert.deepEqual(needs(browser), ['validate']);
  assert.match(browser, /fail-fast: false/);
  const engines = browser
    .match(/browser: \[([^\]]+)\]/)?.[1]
    .split(',')
    .map(value => value.trim());
  assert.deepEqual(engines, ['chromium', 'firefox']);
  assertBrowserInstall(browser, '${{ matrix.browser }}');
  assert.match(browser, /CONTRATOS_QA_BROWSER: \$\{\{ matrix\.browser \}\}/);
  assert.match(browser, /run: npm run test:browser -- --skip-build/);
  assert.doesNotMatch(browser, /run: npm run build/);
  assert.equal(artifactName(browser, 'download-artifact'), artifactName(validate, 'upload-artifact'));
  assert.match(browser, /id: browser_tests\n {8}run: npm run test:browser -- --skip-build/);
  assert.match(browser, /CONTRATOS_QA_DIAGNOSTICS_DIR: \$\{\{ runner\.temp \}\}\/browser-diagnostics/);
  assert.match(browser, /if: failure\(\) && steps\.browser_tests\.conclusion == 'failure'/);
  assert.match(browser, /name: browser-failure-\$\{\{ matrix\.browser \}\}/);
});

test('WORKFLOW-02: Pages depende de toda a validação e publica somente o artefato testado da main', async () => {
  const deploy = jobs.get('deploy');
  assert(deploy);
  assert.deepEqual(needs(deploy).sort(), ['browser', 'validate']);
  assert.equal(
    deploy.match(/^ {4}if: (.+)$/m)?.[1],
    "github.ref == 'refs/heads/main' && github.event_name != 'pull_request'"
  );
  assert.equal(artifactName(deploy, 'download-artifact'), artifactName(jobs.get('validate'), 'upload-artifact'));
  assert.match(deploy, /uses: actions\/upload-pages-artifact@[^\n]+\n {8}with:\n {10}path: dist-browser\n/);
  assert(deploy.indexOf('uses: actions/upload-pages-artifact@') < deploy.indexOf('uses: actions/deploy-pages@'));
  assert(deploy.indexOf('uses: actions/deploy-pages@') < deploy.indexOf('run: node test/verify-deployment.mjs'));
  assert.match(deploy, /SITE_URL: https:\/\/contratos-web\.net\.br\//);
  assert.match(source, /workflow_dispatch:/);
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  assert.doesNotMatch(jobs.get('validate') + jobs.get('browser'), /pages: write|id-token: write/);
  const publishers = [];
  for (const filename of await readdir(root))
    if (
      /\.ya?ml$/.test(filename) &&
      (await readFile(new URL(filename, root), 'utf8')).includes('uses: actions/deploy-pages@')
    )
      publishers.push(filename);
  assert.deepEqual(publishers, ['validate.yml']);
});

test('WORKFLOW-03: WebKit roda periodicamente ou sob demanda, com diagnósticos e sem publicar', async () => {
  const webkit = await readFile(new URL('webkit.yml', root), 'utf8');
  assert.match(webkit, /schedule:\n {4}- cron: '[^']+'/);
  assert.match(webkit, /workflow_dispatch:/);
  assert.doesNotMatch(webkit, /^ {2}(push|pull_request):/m);
  assertBrowserInstall(webkit, 'webkit');
  assert(webkit.indexOf('run: npm run build:qa') < webkit.indexOf('run: npm run test:browser -- --skip-build'));
  assert.match(webkit, /CONTRATOS_QA_BROWSER: webkit/);
  assert.match(webkit, /CONTRATOS_QA_DIAGNOSTICS_DIR: \$\{\{ runner\.temp \}\}\/webkit-diagnostics/);
  assert.match(webkit, /if: failure\(\) && steps\.webkit_tests\.conclusion == 'failure'/);
  assert.match(webkit, /name: browser-failure-webkit/);
  assert.doesNotMatch(webkit, /uses: actions\/deploy-pages@|pages: write|id-token: write/);
});

test('WORKFLOW-04: o contrato com o PNCP real é verificado toda semana e uma falha abre ou atualiza uma issue', async () => {
  const contract = await readFile(new URL('pncp-contract.yml', root), 'utf8');
  assert.match(contract, /schedule:\n {4}- cron: '[^']+'/);
  assert.match(contract, /workflow_dispatch:/);
  assert.doesNotMatch(contract, /^ {2}(push|pull_request):/m);
  assert.match(contract, /issues: write/);
  assert.match(contract, /run: npm ci/);
  assert.match(contract, /node test\/pncp-contract\.mjs/);
  // Só a quebra de contrato (código 1) gera issue; falta de resposta do PNCP (código 2) apenas avisa.
  assert.match(contract, /if \[ "\$code" = 2 \]; then/);
  assert.match(contract, /if: failure\(\) && steps\.contract\.outputs\.code == '1'/);
  assert.match(contract, /gh issue list --state open/);
  assert.match(contract, /gh issue comment/);
  assert.match(contract, /gh issue create/);
});

test('WORKFLOW-05: actions em versões exatas, auditoria das dependências de execução e Dependabot', async () => {
  for (const name of ['validate.yml', 'webkit.yml', 'pncp-contract.yml']) {
    const workflow = await readFile(new URL(name, root), 'utf8');
    const uses = [...workflow.matchAll(/uses: ([^\s]+)/g)].map(match => match[1]);
    assert(uses.length > 0, name);
    for (const action of uses) assert.match(action, /^actions\/[\w-]+@v\d+\.\d+\.\d+$/, `${name}: ${action}`);
  }
  const validate = await readFile(new URL('validate.yml', root), 'utf8');
  assert(validate.indexOf('run: npm audit --omit=dev') > validate.indexOf('run: npm ci'));
  const dependabot = await readFile(new URL('../dependabot.yml', root), 'utf8');
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
});
