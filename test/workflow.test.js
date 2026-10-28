import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

test('WORKFLOW-01: Pages publica apenas o artefato do job que passou em Chromium e Firefox',async()=>{
  const root=new URL('../.github/workflows/',import.meta.url),source=await readFile(new URL('validate.yml',root),'utf8');
  const jobs=new Map([...source.matchAll(/^ {2}([a-z][a-z_-]*):\n((?:(?: {4,}.*)?\n)*)/gm)].map(match=>[match[1],match[2]]));
  const validate=jobs.get('validate'),deploy=jobs.get('deploy');assert(validate);assert(deploy);
  assert.match(deploy,/needs: validate/);assert.match(deploy,/github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  const firefox=validate.indexOf('COMPRAS_QA_BROWSER: firefox'),budget=validate.indexOf('npm run test:budget'),upload=validate.indexOf('uses: actions/upload-pages-artifact@');
  assert(firefox>0 && budget>firefox && upload>budget,'O artefato deve ser enviado após os testes e a verificação de tamanho');
  assert.match(validate,/if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.match(source,/workflow_dispatch:/);assert.match(deploy,/pages: write/);assert.match(deploy,/id-token: write/);
  const publishers=[];for(const filename of await readdir(root))if(/\.ya?ml$/.test(filename) && (await readFile(new URL(filename,root),'utf8')).includes('uses: actions/deploy-pages@'))publishers.push(filename);
  assert.deepEqual(publishers,['validate.yml'],'Não pode existir outro caminho de publicação que ignore a validação');
});
