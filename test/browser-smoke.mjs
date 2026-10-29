import { build } from 'vite';
import { access } from 'node:fs/promises';
import { beginBrowserDiagnostics, diagnoseBrowserFailure, endBrowserDiagnostics } from './browser-diagnostics.js';

const args=process.argv.slice(2),skipBuild=args.includes('--skip-build');
if(args.some(arg=>arg!=='--skip-build'))throw new Error('Use somente --skip-build para testar os builds existentes.');
if(skipBuild)await Promise.all(['../dist-browser/index.html','../dist-browser-test/index.html'].map(path=>access(new URL(path,import.meta.url))));
async function stage(name,run) {
  const start=performance.now();console.log('RUN '+name);await run();
  console.log(`TIME ${name}: ${((performance.now()-start)/1000).toFixed(2)} s`);
}
const runFile=name=>stage(name,async()=>{
  beginBrowserDiagnostics(name);
  try { await import('./'+name); }
  catch(error) { await diagnoseBrowserFailure(error); throw error; }
  finally { endBrowserDiagnostics(); }
});
await runFile('browser-diagnostics.browser.mjs');
await runFile('results-table.browser.mjs');
await runFile('pagination.browser.mjs');
if(!skipBuild)await stage('build-test',()=>build({mode:'test'}));
for(const name of ['ui-smoke.mjs','select-menu.browser.mjs','theme.browser.mjs','mobile.browser.mjs','detail-links.browser.mjs','details-overflow.browser.mjs','filter-options-cache.browser.mjs','accessibility.browser.mjs'])await runFile(name);
if(!skipBuild)await stage('build-production',()=>build());
await runFile('service-worker.browser.mjs');
await runFile('browser-artifact.mjs');
