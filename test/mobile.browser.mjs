import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStaticServer} from './static-server.js';
import {launchTestBrowser} from './browser-launch.js';

const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),context=await browser.newContext({viewport:{width:360,height:800},hasTouch:true});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
await page.exposeFunction('__observeMobile',message=>{if(message.method==='execute')requests.push(message.payload.query);});
await page.addInitScript(()=>{const Native=Worker;window.Worker=class extends Native{postMessage(message,...args){window.__observeMobile(message);super.postMessage(message,...args);}};});
const url=`http://127.0.0.1:${app.server.address().port}/?demo=1`;
const ready=()=>page.waitForFunction(()=>document.querySelector('#results-table').getAttribute('aria-busy')==='false' && !document.querySelector('#export-button').disabled);
const more=()=>page.locator('#more-actions-button').click();
async function fits(selector,{height=false,touch=false}={}) {
  const box=await page.locator(selector).first().boundingBox();assert(box,`${selector} visível`);
  assert(box.x>=-1 && box.x+box.width<=page.viewportSize().width+1,`${selector} cabe horizontalmente`);
  if(height)assert(box.y>=-1 && box.y+box.height<=page.viewportSize().height+1,`${selector} cabe verticalmente`);
  if(touch)assert(box.width>=43.99 && box.height>=43.99,`${selector} possui área de toque de 44 px (${box.width} × ${box.height})`);
}
try {
  await page.goto(url);await ready();
  for(const width of [320,360,390,430,700]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.locator('#header-content').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const selector of ['#search','#search-button','#filters-button','#document-type','#order','#more-actions-button','.results-paginator'])await fits(selector,{height:true});
    for(const selector of ['#search-button','#filters-button','#more-actions-button','.results-page[data-page="prev"]','.results-page[data-page="next"]'])await fits(selector,{touch:true});
    assert.equal(await page.locator('.results-grid').isVisible(),false);assert.equal(await page.locator('.result-card').first().isVisible(),true);
    assert.equal(await page.locator('.results-scroll').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
  }
  await page.setViewportSize({width:360,height:800});
  for(const [type,title,count] of [['edital','64 contratações',71],['ata','24 atas',16],['contrato','32 contratos',32]]){
    await page.locator('#document-type').selectOption(type);await ready();assert.equal(await page.locator('#result-title').innerText(),title);
    await fits('.result-card');
    const titleBefore=await page.locator('.result-card-open').first().innerText();
    await page.locator('.result-card-open').first().press('Enter');
    assert.equal(await page.locator('#details-kind').innerText(),titleBefore);
    await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(tab=>tab.dataset.state==='loaded'));
    assert.equal(await page.locator('.detail-tabs').isVisible(),false);
    assert.deepEqual(await page.locator('#details-section option').allTextContents(),await page.locator('.detail-tab').allTextContents());
    assert.equal(await page.locator('.detail-grid').first().evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),1);
    await fits('#details-dialog',{height:true});await fits('#details-section',{touch:true});
    await page.locator('#details-section').selectOption('historico');
    assert.equal(new URL(page.url()).searchParams.get('aba'),'historico');assert.equal(await page.locator('#detail-panel-historico').isVisible(),true);
    const link=page.url();await page.reload();await ready();
    await page.waitForFunction(()=>document.querySelector('#details-section')?.value==='historico');assert.equal(page.url(),link);
    await page.locator('#details-content').evaluate(node=>{node.scrollTop=10000;});await fits('#details-dialog .close-dialog',{height:true,touch:true});
    await page.locator('#details-dialog .close-dialog').click();
    await page.locator('#filters-button').click();assert.equal(await page.locator('.filter-field').count(),count);
    assert.equal(await page.locator('#filters-dialog').evaluate(node=>Math.round(node.getBoundingClientRect().width)),360);
    const options=await page.locator('#filter-group-jump option').evaluateAll(options=>options.map(option=>option.value));
    await page.locator('#filter-group-jump').selectOption(options.at(-1));
    assert.equal(await page.locator('.filters-body').evaluate(node=>node.scrollTop>0),true);
    await fits('#apply-filters',{height:true,touch:true});await fits('#filters-dialog .close-dialog[aria-label="Fechar"]',{height:true,touch:true});
    await page.locator('#filter-group-jump').selectOption('filters-basics');
    await page.locator('#draft-search').fill('descartar');await page.locator('#filters-dialog .dialog-footer .close-dialog').click();
    assert.equal(await page.locator('#search').inputValue(),'');
  }
  await page.locator('#document-type').selectOption('edital');await ready();
  await page.locator('#filters-button').click();
  await page.locator('#filter-group-jump').selectOption({label:'Contratação'});
  await page.locator('#filter-ufs:not(:disabled)').click();
  await page.locator('#filter-suggestions-ufs [data-value="DF"]').click();await fits('#apply-filters',{height:true});
  await page.locator('#apply-filters').click();await ready();assert.equal(new URL(page.url()).searchParams.get('ufs'),'DF');
  await fits('#clear-button',{touch:true,height:true});await page.locator('#clear-button').click();await ready();
  await page.locator('#search').fill('pagina-ui');await page.locator('#search-button').click();await ready();
  assert.equal(await page.locator('.result-card').count(),100);
  await page.locator('.results-page-jump input').fill('2');await page.locator('.results-page-jump input').press('Enter');await ready();
  assert.equal(new URL(page.url()).searchParams.get('pagina'),'2');assert.equal(await page.locator('.result-card').count(),64);
  assert.equal(await page.locator('.results-page[data-page="next"]').isDisabled(),true);
  await page.locator('.results-page[data-page="prev"]').click();await ready();assert.equal(new URL(page.url()).searchParams.get('pagina'),'1');
  assert.equal(await page.locator('.results-page-jump input').evaluate(node=>node===document.activeElement),true);
  const countBefore=requests.length;await page.locator('.results-page-jump input').fill('3');await page.locator('.results-page-jump input').press('Enter');
  assert.equal(await page.locator('.results-page-jump input').evaluate(node=>node.validity.rangeOverflow),true);assert.equal(requests.length,countBefore);
  await more();await page.locator('#results-view').selectOption('table');
  assert.equal(await page.locator('.results-grid').isVisible(),true);assert.equal(await page.locator('.results-cards').isVisible(),false);
  const filter=page.getByRole('button',{name:'Filtrar Órgão',exact:true});await filter.click();
  await page.waitForFunction(()=>document.activeElement?.id==='filter-orgaos');await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  await more();await page.locator('#columns-button').click();await page.locator('#column-list label').filter({hasText:'CNPJ do órgão'}).locator('input').check();
  await page.locator('#columns-dialog .close-dialog').click();assert.equal(await page.locator('.results-col[data-field="orgao_cnpj"]').count(),1);
  await more();await page.locator('#results-view').selectOption('cards');
  await more();await page.locator('#theme-button').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await more();const github=page.locator('#repository-link');await fits('#repository-link',{touch:true,height:true});assert.match(await github.getAttribute('href'),/github.com\/victorgmbraga\/contratos-web$/);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#more-actions').evaluate(node=>node.matches(':popover-open')),false);
  await more();const download=page.waitForEvent('download');await page.locator('#export-button').click();assert.match((await download).suggestedFilename(),/\.csv$/);await ready();
  await more();await page.locator('#refresh-button').click();await ready();assert.equal(requests.at(-1).q,'pagina-ui');
  await page.setViewportSize({width:1068,height:630});
  assert.equal(await page.locator('#more-actions-button').isVisible(),false);assert.equal(await page.locator('.results-grid').isVisible(),true);
  for(const id of ['theme-button','repository-link','refresh-button','columns-button','export-button']){
    assert.equal(await page.locator(`#more-actions #${id}`).count(),0);assert.equal(await page.locator(`#${id}`).isVisible(),true);
  }
  await page.setViewportSize({width:600,height:360});await fits('#filters-button',{height:true});await page.locator('#filters-button').click();await fits('#apply-filters',{height:true});
  await page.setViewportSize({width:360,height:400});await page.locator('#draft-search').click();await fits('#apply-filters',{height:true});await fits('#draft-search',{height:true});
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  await page.setViewportSize({width:360,height:800});
  await page.locator('#clear-button').click();await ready();await page.screenshot({path:join(tmpdir(),'contratos-mobile-cards.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS Mobile: 320/360/390/430/700 px, três tipos, cartões/tabela, ações, filtros, detalhes/URL, toque, paginação, paisagem e viewport reduzido');
} finally {await browser.close();await app.close();}
