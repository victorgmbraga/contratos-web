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
async function headerLayout(width) {
  const boxes=await page.evaluate(()=>Object.fromEntries(Object.entries({type:'#document-type-control',order:'#order-control',more:'#more-actions-button',search:'.search-field',submit:'#search-button',filters:'#filters-button'}).map(([name,selector])=>{
    const {x,y,width,height}=document.querySelector(selector).getBoundingClientRect();return [name,{x,y,width,height}];
  })));
  assert.equal(await page.locator('.brand').isVisible(),false);
  assert.equal(boxes.type.width,boxes.order.width);assert(boxes.type.width<=140 && boxes.type.width>100);
  if(width>=358)assert.equal(boxes.type.width,140);
  assert.equal(boxes.search.y,boxes.submit.y);assert.equal(boxes.search.y,boxes.filters.y);
  assert.deepEqual(await page.locator('.search-row>button:visible').evaluateAll(nodes=>nodes.map(node=>node.id)),['search-button','filters-button']);
  assert.equal(boxes.type.y,boxes.order.y);
  assert(boxes.search.y+boxes.search.height<boxes.type.y,'Busca ocupa a primeira linha e seletores a segunda');
  assert.equal(boxes.more.width,44);assert.equal(boxes.more.height,44);
  assert.equal(boxes.type.y,boxes.more.y,'Seletores e Mais ficam na segunda linha');
  assert(boxes.order.x+boxes.order.width<boxes.more.x,'Mais fica à direita dos seletores');
  await page.locator('#search').focus();
  const sequence=['search-button','filters-button','document-type-control','order-control','more-actions-button'];
  for(const id of sequence){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),id,'Ordem do teclado acompanha o cabeçalho');}
  await more();await page.locator('#more-actions').waitFor({state:'visible'});
  const popup=await page.locator('#more-actions').boundingBox();
  assert(popup.x>=0 && popup.x+popup.width<=width);
  assert(popup.y>=boxes.more.y+boxes.more.height);
  assert(popup.x<=boxes.more.x+boxes.more.width && popup.x+popup.width>=boxes.more.x,'Menu abre junto ao botão');
  await page.keyboard.press('Escape');
}
try {
  await page.goto(url);await ready();
  for(const width of [320,352,358,360,390,430,560,700]){
    await page.locator('#document-type-control').focus();
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'document-type-control','Redimensionar preserva o foco do seletor');
    await headerLayout(width);
    assert.equal(await page.locator('#header-content').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const selector of ['#search','#search-button','#filters-button','#document-type','#order','#more-actions-button','.results-paginator'])await fits(selector,{height:true});
    for(const selector of ['#search-button','#filters-button','#more-actions-button'])await fits(selector,{touch:true});
    for(const action of ['first','prev','next','last'])await fits(`.results-page[data-page="${action}"]`,{height:true});
    assert.equal(await page.locator('.results-paginator').evaluate(node=>Math.abs(node.getBoundingClientRect().width-node.parentElement.getBoundingClientRect().width)<1),true);
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
  assert.equal(await page.locator('.search-row #clear-button').count(),0);
  await more();await fits('#clear-button',{touch:true,height:true});await page.locator('#clear-button').click();await ready();
  await page.locator('#search').fill('benchmark-ui');await page.locator('#search-button').click();await ready();
  await page.getByRole('button',{name:'Última página',exact:true}).click();await ready();
  assert.deepEqual(await page.locator('.results-pages button').allTextContents(),['96','97','98','99','100']);
  for(const width of [320,360,390,430,700]){
    await page.setViewportSize({width,height:844});
    await fits('.results-paginator',{height:true});
    assert.equal(await page.locator('.results-paginator button:visible').count(),9);
    assert.equal(await page.locator('.results-paginator').evaluate(nav=>nav.scrollWidth<=nav.clientWidth && [...nav.querySelectorAll('button')].every(button=>button.scrollWidth<=button.clientWidth+1)),true);
  }
  await page.setViewportSize({width:360,height:800});
  await page.locator('#search').fill('pagina-ui');await page.locator('#search-button').click();await ready();
  assert.equal(await page.locator('.result-card').count(),100);
  await page.getByRole('button',{name:'Página 2',exact:true}).click();await ready();
  assert.equal(new URL(page.url()).searchParams.get('pagina'),'2');assert.equal(await page.locator('.result-card').count(),64);
  assert.equal(await page.locator('.results-page[data-page="next"]').isDisabled(),true);
  await page.locator('.results-page[data-page="prev"]').click();await ready();assert.equal(new URL(page.url()).searchParams.get('pagina'),'1');
  assert.equal(await page.locator('.results-page.active').evaluate(node=>node===document.activeElement),true);
  assert.equal(await page.getByRole('button',{name:'Página 3',exact:true}).count(),0);
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
  const selectedType=await page.locator('#document-type').inputValue(),selectedOrder=await page.locator('#order').inputValue();
  await page.locator('#document-type-control').focus();
  await page.setViewportSize({width:1068,height:630});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'document-type-control');
  assert.equal(await page.locator('.brand').isVisible(),true);
  assert.equal(await page.locator('#more-actions-button').evaluate(node=>node.nextElementSibling.id),'search-form');
  assert.equal(await page.locator('#search-form #clear-button').count(),1);
  assert.equal(await page.locator('.header-toolbar').evaluate(node=>node.previousElementSibling.id),'source-badge');
  assert.equal(await page.locator('#document-type').inputValue(),selectedType);assert.equal(await page.locator('#order').inputValue(),selectedOrder);
  for(const id of ['document-type','order'])assert.equal(await page.locator(`#${id}`).count(),1);
  assert.equal(await page.locator('#more-actions-button').isVisible(),false);assert.equal(await page.locator('.results-grid').isVisible(),true);
  for(const id of ['theme-button','repository-link','refresh-button','columns-button','export-button']){
    assert.equal(await page.locator(`#more-actions #${id}`).count(),0);assert.equal(await page.locator(`#${id}`).isVisible(),true);
  }
  await page.setViewportSize({width:600,height:360});await fits('#filters-button',{height:true});await page.locator('#filters-button').click();await fits('#apply-filters',{height:true});
  await page.setViewportSize({width:360,height:400});await page.locator('#draft-search').click();await fits('#apply-filters',{height:true});await fits('#draft-search',{height:true});
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  await page.setViewportSize({width:360,height:800});
  await more();await page.locator('#clear-button').click();await ready();await page.screenshot({path:join(tmpdir(),'contratos-mobile-cards.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS Mobile: 320–700 px, cabeçalho em duas linhas sem marca, menu ancorado e limpar filtros, teclado/foco e retorno ao desktop, três tipos, cartões/tabela, filtros, detalhes/URL, toque e paginação');
} finally {await browser.close();await app.close();}
