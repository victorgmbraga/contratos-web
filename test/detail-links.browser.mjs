import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';

const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),context=await browser.newContext(),errors=[],requests=[];
const page=await context.newPage(),base=`http://127.0.0.1:${app.server.address().port}/`;
page.on('pageerror',error=>errors.push(error.message));
await page.exposeFunction('__observeDetailLink',message=>requests.push(message));
await page.addInitScript(()=>{
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker {
    postMessage(message,...args){window.__observeDetailLink(message);return super.postMessage(message,...args);}
  };
});
const waitLoaded=()=>page.waitForFunction(()=>document.querySelector('#details-dialog').open && [...document.querySelectorAll('.detail-tab')].every(tab=>tab.dataset.state==='loaded') && !document.querySelector('#export-button').disabled);
const waitTab=tab=>page.waitForFunction(tab=>document.querySelector(`#detail-tab-${tab}`)?.getAttribute('aria-selected')==='true' && new URL(location.href).searchParams.get('aba')===tab,tab);
const calls=method=>requests.filter(message=>message.method===method).length;

try {
  for(const [type,identity,tab,resources] of [
    ['edital','edital/00000000000000/2026/1','itens',4],
    ['ata','ata/00000000000000/2026/1/1','partesenvolvidas',4],
    ['contrato','contrato/00000000000000/2026/1','historico',5],
  ]) {
    requests.length=0;
    // The selected document is in DF; the background search contains only GO.
    await page.goto(base+`?ufs=GO&detalhe=${identity}&aba=${tab}#resultados`);
    await waitLoaded();await waitTab(tab);
    assert.equal(await page.locator('#document-type').inputValue(),type);
    assert.equal(new URL(page.url()).searchParams.get('tipos_documento'),type);
    assert.equal(new URL(page.url()).searchParams.get('detalhe'),identity);
    assert.equal(new URL(page.url()).hash,'#resultados');
    assert.equal(calls('execute'),1);assert.equal(calls('documentDetails'),1);assert.equal(calls('documentRelated'),resources);
    assert.equal(calls('details'),type==='edital'?1:0);
    assert.match(await page.locator('#details-kind').innerText(),/nº 1\/2026/);
    assert.match(await page.locator('.detail-object').innerText(),/firewall/);
    assert.equal(await page.locator('.results-row').filter({hasText:'nº 1/2026'}).count(),0);
    assert.equal(await page.locator('#details-links').count(),0);

    const shared=page.url();await page.reload();await waitLoaded();await waitTab(tab);
    assert.equal(page.url(),shared);assert.equal(calls('execute'),2);assert.equal(calls('documentDetails'),2);
    const queries=calls('execute'),details=calls('documentDetails'),related=calls('documentRelated');
    await page.locator('#detail-tab-arquivos').click();await waitTab('arquivos');
    await page.locator('#detail-tab-arquivos').press('Home');await waitTab('detalhes');
    await page.goBack();await waitTab('arquivos');
    await page.goBack();await waitTab(tab);
    await page.goForward();await waitTab('arquivos');
    assert.equal(calls('execute'),queries);assert.equal(calls('documentDetails'),details);assert.equal(calls('documentRelated'),related);

    await page.locator('#details-dialog .close-dialog').click();
    await page.waitForFunction(()=>!document.querySelector('#details-dialog').open && !new URL(location.href).searchParams.has('detalhe'));
    assert.equal(new URL(page.url()).searchParams.has('aba'),false);assert.equal(new URL(page.url()).searchParams.get('ufs'),'GO');
    await page.goBack();await waitLoaded();await waitTab('arquivos');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#details-dialog').open && !new URL(location.href).searchParams.has('detalhe'));
    await page.goBack();await waitLoaded();await waitTab('arquivos');
    console.log(`PASS Link direto de ${type}: item fora da busca, aba, recarregamento, teclado e histórico sem repetir a busca`);
  }

  await page.goto(base+'?detalhe=contrato/00000000000000/2026/1');
  await waitLoaded();await waitTab('detalhes');
  await page.locator('#details-dialog .close-dialog').click();
  await page.waitForFunction(()=>!new URL(location.href).searchParams.has('detalhe'));
  const row=page.locator('.results-row').filter({hasText:'Contrato de demonstração nº 1/2026'});
  await row.click();await waitLoaded();
  assert.equal(new URL(page.url()).searchParams.get('detalhe'),'contrato/00000000000000/2026/1');
  assert.equal(await page.locator('#details-kind').innerText(),'Contrato de demonstração nº 1/2026');
  await page.locator('#detail-tab-termos').click();await waitTab('termos');
  const selected=page.url(),searches=calls('execute');
  await page.locator('#details-dialog .close-dialog').click();
  await page.waitForFunction(()=>!new URL(location.href).searchParams.has('detalhe'));
  await page.locator('#search').fill('Microsoft');await page.locator('#search-button').click();
  await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);
  assert.equal(new URL(page.url()).searchParams.has('detalhe'),false);
  await page.goBack();await page.waitForFunction(()=>document.querySelector('#search').value==='' && !document.querySelector('#export-button').disabled);
  await page.goBack();await waitLoaded();await waitTab('termos');assert.equal(page.url(),selected);
  assert.equal(calls('execute'),searches+1,'resultado em cache evita uma nova consulta ao voltar');
  console.log('PASS Clique na tabela escreve o link; nova busca remove a seleção e Voltar restaura o painel');

  const queries=calls('execute'),details=calls('documentDetails');
  await page.goto(base+'?detalhe=ata/00000000000000/2026/1/1&aba=empenhos');
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Parâmetros inválidos na URL'));
  assert.equal(calls('execute'),queries);assert.equal(calls('documentDetails'),details);
  assert.equal(await page.locator('#details-dialog').isVisible(),false);
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  assert.equal(new URL(page.url()).searchParams.has('detalhe'),false);assert.equal(new URL(page.url()).searchParams.has('aba'),false);
  assert.deepEqual(errors,[]);
  console.log('PASS Link com aba incompatível não consulta o PNCP e permite limpar a URL; sem erros JavaScript');
} catch(error) {await diagnoseBrowserFailure(error);throw error;} finally {await browser.close();await app.close();}
