import assert from 'node:assert/strict';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStaticServer} from './static-server.js';
import {launchTestBrowser} from './browser-launch.js';

const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),context=await browser.newContext({viewport:{width:1068,height:800},hasTouch:true}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const ready=()=>page.waitForFunction(()=>!document.querySelector('#export-button').disabled);
const menu=()=>page.locator('.select-menu:popover-open');
const control=id=>page.locator(`#${id}-control`);
async function choose(id,value){await control(id).click();await menu().locator(`[role="option"][data-value=${JSON.stringify(value)}]`).click();await page.waitForFunction(()=>document.querySelectorAll('.select-menu:popover-open').length===0);}
async function bounded(){
  const box=await menu().boundingBox(),viewport=page.viewportSize();
  assert(box.x>=7 && box.x+box.width<=viewport.width-7 && box.y>=7 && box.y+box.height<=viewport.height-7,JSON.stringify({box,viewport}));
  assert.equal(await menu().evaluate(node=>node.scrollWidth<=node.clientWidth),true);
}
async function contrast(){
  assert.equal(await page.evaluate(()=>{
    const rgb=value=>value.match(/[\d.]+/g).map(Number);
    const lum=values=>values.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll('.select-menu:popover-open [role="option"]:not([aria-disabled="true"]),#document-type-control')].every(node=>{
      let background=node;while(background.parentElement && rgb(getComputedStyle(background).backgroundColor)[3]===0)background=background.parentElement;
      const fg=lum(rgb(getComputedStyle(node).color)),bg=lum(rgb(getComputedStyle(background).backgroundColor));return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=4.5;
    });
  }),true,'Textos dos seletores mantêm contraste de pelo menos 4,5:1');
}
try {
  const url=`http://127.0.0.1:${app.server.address().port}/?demo=1`;
  await page.goto(url);await ready();
  for(const id of ['document-type','order'])assert((await control(id).boundingBox()).width<=180,'Seletores fechados preservam a largura do cabeçalho');
  assert.equal(await page.locator('#document-type').getAttribute('aria-hidden'),'true');
  assert.equal(await control('document-type').getAttribute('role'),'combobox');
  await control('document-type').click();await bounded();await contrast();
  assert.equal(await menu().getByRole('option',{selected:true}).count(),1);
  assert.equal(await control('document-type').getAttribute('aria-controls'),await menu().getAttribute('id'));
  await control('document-type').press('End');
  assert.equal(await page.locator('#document-type').inputValue(),'edital');
  await control('document-type').press('Enter');await ready();
  assert.equal(await page.locator('#document-type').inputValue(),'contrato');assert.equal(new URL(page.url()).searchParams.get('tipos_documento'),'contrato');
  const before=page.url();await control('document-type').press('Space');await control('document-type').press('Home');await control('document-type').press('Escape');
  assert.equal(page.url(),before);assert.equal(await control('document-type').evaluate(node=>node===document.activeElement),true);
  await control('document-type').press('a');await control('document-type').press('Enter');await ready();
  assert.equal(await page.locator('#document-type').inputValue(),'ata');
  await choose('order','valor');await ready();assert.equal(await control('order').locator('.select-value').innerText(),'Maior valor');
  await page.goBack();await ready();await page.waitForFunction(()=>document.querySelector('#order-control .select-value').textContent==='Mais recentes');
  await control('document-type').click();await control('document-type').press('Tab');assert.equal(await menu().count(),0);
  await choose('document-type','edital');await ready();
  await control('order').click();await page.locator('.brand').click();await ready();assert.equal(await menu().count(),0);
  await page.locator('#filters-button').click();await control('filter-srp').waitFor();
  assert.equal(await control('filter-srp').locator('.select-value').innerText(),'Selecionar');
  const filterUrl=page.url();await choose('filter-srp','false');assert.equal(page.url(),filterUrl);
  assert.equal(await page.locator('#filter-srp').inputValue(),'false');assert.equal(await control('filter-srp').locator('.select-value').innerText(),'Não');
  await page.locator('#filter-field-srp .filter-reset').click();assert.equal(await control('filter-srp').locator('.select-value').innerText(),'Selecionar');
  await page.locator('label[for="filter-srp-control"]').click();await control('filter-srp').press('Escape');
  assert.equal(await page.locator('#filters-dialog').evaluate(node=>node.open),true);
  await page.locator('#filter-ufs:not(:disabled)').click();assert.equal(await page.locator('#filter-suggestions-ufs').isVisible(),true);
  await control('filter-srp').click();await page.locator('#filter-suggestions-ufs').waitFor({state:'hidden'});await bounded();
  await menu().getByRole('option',{name:'Não',exact:true}).click();
  await page.locator('#apply-filters').click();await ready();assert.equal(new URL(page.url()).searchParams.get('srp'),'false');
  await page.locator('#clear-button').click();await ready();
  for(const width of [320,360,390,430]){
    await page.setViewportSize({width,height:800});await control('document-type').click();await bounded();await control('document-type').press('Escape');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await control('document-type').tap();await menu().getByRole('option',{name:'Atas de Registro de Preços',exact:true}).tap();await ready();
  assert.equal(await page.locator('#document-type').inputValue(),'ata');
  await control('document-type').tap();await menu().getByRole('option',{name:'Editais e Avisos de Contratações',exact:true}).tap();await ready();
  assert.equal(await page.locator('#document-type').inputValue(),'edital');
  await page.locator('#more-actions-button').click();await control('results-view').click();await bounded();
  assert.equal(await page.locator('#more-actions').evaluate(node=>node.matches(':popover-open')),true);
  await menu().getByRole('option',{name:'Tabela',exact:true}).click();assert.equal(await page.locator('.results-grid').isVisible(),true);
  await page.locator('#more-actions-button').click();await choose('results-view','cards');
  await page.locator('.result-card-open').first().click();await control('details-section').waitFor();
  await choose('details-section','historico');assert.equal(new URL(page.url()).searchParams.get('aba'),'historico');
  await page.waitForFunction(()=>document.querySelector('#detail-tab-historico').dataset.state==='loaded');
  assert.match(await control('details-section').locator('.select-value').innerText(),/^Histórico \(\d+\)$/);
  await control('details-section').click();await bounded();await control('details-section').press('Escape');
  await page.locator('#details-dialog .close-dialog').click();
  await page.locator('#filters-button').click();
  await control('draft-status').click();await page.locator('.filters-body').evaluate(node=>{node.scrollTop=10000;});
  await page.waitForFunction(()=>document.querySelectorAll('.select-menu:popover-open').length===0);
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  await page.setViewportSize({width:1068,height:800});await page.locator('#theme-button').click();
  await control('document-type').click();await bounded();await contrast();
  await page.screenshot({path:join(tmpdir(),'contratos-select-dark.png')});await control('document-type').press('Escape');

  // Dynamic controls, disabled/hidden options, form behavior and untrusted labels.
  await page.evaluate(()=>{
    const form=document.createElement('form');form.id='select-fixture';form.style.cssText='position:fixed;bottom:8px;left:8px;width:180px;z-index:20';
    const label=document.createElement('label');label.textContent='Escolha de verificação';const select=document.createElement('select');select.id='select-fixture-value';select.name='teste';select.disabled=true;
    select.append(new Option('Selecionar',''));
    for(let i=1;i<=35;i++){const option=new Option(`Opção ${i} com rótulo extenso`,String(i));option.disabled=i===2;option.hidden=i===3;select.append(option);}
    select.append(new Option('<img src=x onerror="window.selectInjection=true">','xss'));label.append(select);form.append(label);document.body.append(form);
  });
  await control('select-fixture-value').waitFor();assert.equal(await control('select-fixture-value').isDisabled(),true);
  await page.locator('#select-fixture-value').evaluate(node=>{node.disabled=false;});
  await control('select-fixture-value').click();await bounded();
  assert.equal(await menu().getByRole('option',{name:'Opção 3 com rótulo extenso',exact:true}).count(),0);
  assert.equal(await menu().getByRole('option',{name:'Opção 2 com rótulo extenso',exact:true}).getAttribute('aria-disabled'),'true');
  const above=await menu().boundingBox(),anchor=await control('select-fixture-value').boundingBox();assert(above.y+above.height<anchor.y);
  assert.equal(await menu().evaluate(node=>node.scrollHeight>node.clientHeight),true);
  await control('select-fixture-value').press('Home');await control('select-fixture-value').press('ArrowDown');await control('select-fixture-value').press('ArrowDown');
  const activeId=await control('select-fixture-value').getAttribute('aria-activedescendant');assert.match(await page.locator(`#${activeId}`).innerText(),/Opção 4/);
  await page.locator('#select-fixture-value option[value="4"]').evaluate(node=>{node.textContent='Opção quatro atualizada';});
  await page.waitForFunction(id=>document.getElementById(id).textContent.includes('atualizada'),activeId);
  assert.equal(await control('select-fixture-value').getAttribute('aria-activedescendant'),activeId);
  await control('select-fixture-value').press('Enter');
  assert.equal(await page.locator('#select-fixture').evaluate(node=>new FormData(node).get('teste')),'4');
  await page.locator('#select-fixture').evaluate(node=>node.reset());
  await page.waitForFunction(()=>document.querySelector('#select-fixture-value-control .select-value').textContent==='Selecionar');
  await choose('select-fixture-value','xss');assert.equal(await page.evaluate(()=>window.selectInjection),undefined);
  assert.equal(await page.locator('#select-fixture img').count(),0);
  await control('select-fixture-value').click();await page.locator('#select-fixture-value').evaluate(node=>{node.disabled=true;});
  await page.waitForFunction(()=>document.querySelector('#select-fixture-value-control').disabled && !document.querySelectorAll('.select-menu:popover-open').length);
  await page.locator('#select-fixture').evaluate(node=>node.remove());
  await page.waitForFunction(()=>document.querySelectorAll('.select-trigger').length===document.querySelectorAll('select').length);
  assert.deepEqual(errors,[]);
  console.log('PASS Seletores: três tipos, teclado, cancelamento, URL, filtros, menu Mais, detalhes, temas/contraste, telas pequenas, opções dinâmicas, formulários e segurança');
} finally {await browser.close();await app.close();}
