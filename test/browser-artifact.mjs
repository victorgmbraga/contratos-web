import assert from 'node:assert/strict';
import http from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { createStaticServer } from './static-server.js';
import { launchTestBrowser } from './browser-launch.js';
import { assertBrowserLayout } from './browser-layout.js';
import { demoDocument } from './demo-fixtures.js';
import { routePncp } from './pncp-route.js';
const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
assert.deepEqual(Object.keys(manifest.dependencies || {}),[], 'O artefato deve permanecer sem dependências de produção.');
const headersFile=await readFile(new URL('../dist-browser/_headers',import.meta.url),'utf8');
assert.match(headersFile,/Content-Security-Policy: [^\n]*frame-ancestors 'self'/, 'Cabeçalhos preservam frame-ancestors');
assert.match(headersFile,/X-Content-Type-Options: nosniff/);
assert.match(headersFile,/Referrer-Policy: no-referrer/);
assert.doesNotMatch(headersFile,/unsafe-inline/, 'O artefato não depende de estilos injetados');
assert.match(headersFile,/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
const swSource=await readFile(new URL('../dist-browser/sw.js',import.meta.url),'utf8');assert.match(swSource,/contratos-web-assets-[a-f0-9]{12}/);assert.doesNotMatch(swSource,/contratos-web-assets-v1/);
console.log('PASS Cabeçalhos de segurança do artefato (CSP, nosniff, referrer, cache imutável e versão do Service Worker)');
const browser = await launchTestBrowser();
const cors = http.createServer((req, res) => {
  if(req.url.startsWith('/allow'))res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json'); res.setHeader('Retry-After','3');
  if(req.url === '/allow-exposed')res.setHeader('Access-Control-Expose-Headers','Retry-After');
  res.end('{"value":true}');
});
await new Promise(resolve=>cors.listen(0,'127.0.0.1',resolve));
try {
  for(const prefix of ['/','/compras-web/']) {
    const app = createStaticServer(new URL('../dist-browser/',import.meta.url),prefix);
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const context = await browser.newContext();
  const pncpRequests = [];
  await routePncp(context, pncpRequests);
  await context.route('**/browser-config.json', route => route.fulfill({ json: { PNCP_REQUESTS_PER_SECOND: 100000, PNCP_MAX_RETRIES: 0 } }));
  const page = await context.newPage(), api = [], errors = [];
    page.on('request',r=>{const u=new URL(r.url());if(u.hostname==='127.0.0.1' && u.pathname.includes('/api/'))api.push(r.url());});
    page.on('pageerror',e=>errors.push(e.message));
    try {
      await page.goto(`http://127.0.0.1:${app.server.address().port}${prefix}`);
      await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
      for(const [type,title] of [['ata','24 atas'],['contrato','32 contratos'],['edital','64 contratações']]) {
        await page.locator('#document-type').selectOption(type);
        await page.waitForFunction(title=>document.querySelector('#result-title').textContent===title,title);
        assert.equal(await page.locator('#result-info').isVisible(),true,`Rodapé de ${type} em ${prefix}`);
        assert.match(await page.locator('#result-info').innerText(),/Exibindo 1-\d+ de/);
      }
      assert.deepEqual(api,[]); assert.deepEqual(errors,[]);
      await page.locator('#theme-button').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
      await page.reload();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
      await page.locator('#theme-button').click();
      console.log('PASS Artefato de produção, assets e Worker em '+prefix);
      await assertBrowserLayout(browser, `http://127.0.0.1:${app.server.address().port}${prefix}`);
      await page.goto(`http://127.0.0.1:${app.server.address().port}${prefix}?tipos_documento=contrato&possui_nfe=false&ordenacao=data&pagina=1#resultados`);
      await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='8 contratos');
      assert.equal(await page.locator('#document-type').inputValue(),'contrato');assert.equal(await page.locator('#order').inputValue(),'data');assert.equal(new URL(page.url()).searchParams.get('possui_nfe'),'false');assert.equal(new URL(page.url()).hash,'#resultados');
      console.log('PASS Link compartilhado no build de produção preserva filtro Não, ordenação e caminho em '+prefix);
      const nativeDetail=demoDocument('edital','1');
      await page.goto(`http://127.0.0.1:${app.server.address().port}${prefix}?detalhe=edital/00000000000000/2026/1&aba=arquivos&ufs=GO`);
      const waitDirect=()=>page.waitForFunction(()=>document.querySelector('#details-dialog').open && [...document.querySelectorAll('.detail-tab')].every(tab=>tab.dataset.state==='loaded') && !document.querySelector('#export-button').disabled);
      await waitDirect();
      assert.equal(await page.locator('#detail-tab-arquivos').getAttribute('aria-selected'),'true');
      assert((await page.locator('#detail-panel-detalhes dt').count())>12);
      assert.equal(await page.locator('#details-kind').innerText(),'Edital nº 1/2026');
      assert.equal(await page.locator('.detail-object').innerText(),nativeDetail.objetoCompra);
      assert.equal(new URL(page.url()).searchParams.has('demo'),false);
      assert.equal(pncpRequests.filter(url=>new URL(url).pathname==='/api/consulta/v1/orgaos/00000000000000/compras/2026/1').length,1);
      assert(!pncpRequests.some(url=>new URL(url).pathname==='/api/pncp/v1/orgaos/00000000000000/compras/2026/1'));
      assert(pncpRequests.some(url=>new URL(url).pathname==='/api/pncp/v1/orgaos/00000000000000/compras/2026/1/arquivos'));
      await page.reload();await waitDirect();
      assert.equal(await page.locator('#detail-tab-arquivos').getAttribute('aria-selected'),'true');assert.deepEqual(errors,[]);
      console.log('PASS Link direto no build de produção usa a API de consulta sem acessar a rota antiga com HTTP 301 em '+prefix);
      // Separate minimal origin: the application's CSP intentionally only permits PNCP.
      await page.goto(`http://127.0.0.1:${cors.address().port}/origin`);
      const result = await page.evaluate(async ({base}) => {
        const out={};
        for(const route of ['/allow','/deny','/allow-exposed']) {
          try {const response=await fetch(base+route,{mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});out[route]={json:await response.json(),after:response.headers.get('Retry-After')};}
          catch(e){out[route]={error:e.name};}
        }
        return out;
      }, { base: `http://localhost:${cors.address().port}` });
      assert.equal(result['/allow'].json.value,true); assert.equal(result['/allow'].after,null);
      assert.equal(result['/deny'].error,'TypeError'); assert.equal(result['/allow-exposed'].after,'3');
      console.log('PASS CORS real entre duas origens, controle negativo e cabeçalho exposto');
    } finally { await page.close(); await app.close(); }
  }

  const assets=await readdir(new URL('../dist-browser-test/assets/',import.meta.url));
  const workerFile=assets.find(name=>/^worker-.*\.js$/.test(name)); assert(workerFile);
  const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const page=await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${app.server.address().port}/pncp-diagnostic.html`);
    const report=await page.evaluate(async workerPath=>{
      const worker=new Worker(workerPath,{type:'module'}),pending=new Map();let seq=0,beats=0;const timer=setInterval(()=>beats++,10);
      worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;if(data.progress){task.progress?.(data.progress);return;}pending.delete(data.id);data.error?task.reject(data.error):task.resolve(data.result);};
      function call(message,progress){const id=String(++seq);return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject,progress});worker.postMessage({...message,id});});}
      try {
        await call({type:'init',version:1,config:{PNCP_REQUESTS_PER_SECOND:100000,PNCP_PAGE_SIZE:100}});
        const started=performance.now(),progress=[];
        const result=await call({method:'export',payload:{query:{q:'benchmark-ui'}}},p=>progress.push(p));
        const report={rows:result.metadata.exported_rows,bytes:result.chunks.reduce((n,c)=>n+c.byteLength,0),requests:result.metadata.upstream_requests,pages:progress.length,elapsed_ms:Math.round(performance.now()-started),interface_ticks:beats,metadata_has_documents:'data' in result.metadata,worker_heap_measurement:'unavailable'};
        let cancelId=String(seq+1),lastProgress;
        try {await call({method:'export',payload:{query:{q:'benchmark-ui'}}},p=>{lastProgress=p;worker.postMessage({type:'cancel',id:cancelId});});report.cancelled=false;}
        catch(e){report.cancelled=e.name==='AbortError';report.cancelled_after_rows=lastProgress?.rows;}
        const next=await call({method:'execute',payload:{query:{document_type:'ata'}}});report.recovered_total=next.total;
        return report;
      } finally {clearInterval(timer);worker.terminate();}
    }, './assets/'+workerFile);
    assert.equal(report.rows,10000);assert.equal(report.requests,100);assert.equal(report.pages,100);assert(report.interface_ticks>10);assert.equal(report.metadata_has_documents,false);assert.equal(report.cancelled,true);assert.equal(report.recovered_total,24);
    console.log('PASS Exportação de 10.000 documentos no Worker, interface responsiva e cancelamento '+JSON.stringify(report));
  } finally { await page.close();await app.close(); }
  const productionFiles=await readdir(new URL('../dist-browser/assets/',import.meta.url));
  for(const name of productionFiles.filter(n=>n.endsWith('.js'))) {
    const code=await readFile(new URL('../dist-browser/assets/'+name,import.meta.url),'utf8');
    assert(!/node:|EnvHttpProxyAgent|process\.env|benchmark-ui|falha-ui/.test(code),name+' contém dependência ou fixture indevida');
  }
  console.log('PASS Bundles de produção sem dependências de Node, variáveis do processo ou fixtures de teste');
} finally { await browser.close(); await new Promise(resolve=>cors.close(resolve)); }
