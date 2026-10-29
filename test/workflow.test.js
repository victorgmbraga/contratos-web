import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const root=new URL('../.github/workflows/',import.meta.url);
const source=await readFile(new URL('validate.yml',root),'utf8');
const jobs=new Map([...source.matchAll(/^ {2}([a-z][a-z_-]*):\n((?:(?: {4,}.*)?\n)*)/gm)].map(match=>[match[1],match[2]]));
const needs=job=>(job.match(/^ {4}needs: (.+)$/m)?.[1] || '').replaceAll('[','').replaceAll(']','').split(',').map(value=>value.trim());
function artifactName(job,action) {
  const step=job.split(/\n {6}- /).find(step=>step.includes(`uses: actions/${action}@`));
  const name=step?.match(/\n {10}name: (.+)/)?.[1];assert(name,`Artefato ausente em ${action}`);
  return name;
}

test('WORKFLOW-01: Chromium e Firefox validam em paralelo o mesmo build, sem recompilar',()=>{
  const validate=jobs.get('validate'),browser=jobs.get('browser');assert(validate);assert(browser);
  assert.match(validate,/run: npm run test:coverage/);assert.doesNotMatch(validate,/run: npm test\s*\n/);
  const build=validate.indexOf('run: npm run build:qa'),budget=validate.indexOf('run: npm run test:budget'),upload=validate.indexOf('uses: actions/upload-artifact@');
  assert(build>=0 && budget>build && upload>budget);
  assert.match(validate,/dist-browser\/\n/);assert.match(validate,/dist-browser-test\/\n/);
  assert.deepEqual(needs(browser),['validate']);
  assert.match(browser,/fail-fast: false/);
  const engines=browser.match(/browser: \[([^\]]+)\]/)?.[1].split(',').map(value=>value.trim());
  assert.deepEqual(engines,['chromium','firefox']);
  assert.match(browser,/playwright install --with-deps \$\{\{ matrix\.browser \}\}/);
  assert.match(browser,/COMPRAS_QA_BROWSER: \$\{\{ matrix\.browser \}\}/);
  assert.match(browser,/run: npm run test:browser -- --skip-build/);assert.doesNotMatch(browser,/run: npm run build/);
  assert.equal(artifactName(browser,'download-artifact'),artifactName(validate,'upload-artifact'));
});

test('WORKFLOW-02: Pages depende de toda a validação e publica somente o artefato testado da main',async()=>{
  const deploy=jobs.get('deploy');assert(deploy);
  assert.deepEqual(needs(deploy).sort(),['browser','validate']);
  assert.equal(deploy.match(/^ {4}if: (.+)$/m)?.[1],"github.ref == 'refs/heads/main' && github.event_name != 'pull_request'");
  assert.equal(artifactName(deploy,'download-artifact'),artifactName(jobs.get('validate'),'upload-artifact'));
  assert.match(deploy,/uses: actions\/upload-pages-artifact@[^\n]+\n {8}with:\n {10}path: dist-browser\n/);
  assert(deploy.indexOf('uses: actions/upload-pages-artifact@')<deploy.indexOf('uses: actions/deploy-pages@'));
  assert.match(source,/workflow_dispatch:/);assert.match(deploy,/pages: write/);assert.match(deploy,/id-token: write/);
  assert.doesNotMatch(jobs.get('validate')+jobs.get('browser'),/pages: write|id-token: write/);
  const publishers=[];
  for(const filename of await readdir(root))if(/\.ya?ml$/.test(filename) && (await readFile(new URL(filename,root),'utf8')).includes('uses: actions/deploy-pages@'))publishers.push(filename);
  assert.deepEqual(publishers,['validate.yml']);
});
