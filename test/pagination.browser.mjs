/* global paginationFixture, tableFixture */
import assert from 'node:assert/strict';
import {createStaticServer} from './static-server.js';
import {launchTestBrowser} from './browser-launch.js';

const app=createStaticServer(new URL('../',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),page=await browser.newPage({viewport:{width:1068,height:844}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}/test/results-table-fixture.html`);
  await page.evaluate(async()=>{
    await new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/public/mobile.css';link.onload=resolve;document.head.append(link);});
    const {createPagination}=await import('/public/pagination.js');
    const fixture={state:{page:50,lastPage:100},calls:[],pause:false};
    const pagination=createPagination({document,className:'item-pager',label:'Paginação de Arquivos',subject:'Arquivos',hideSinglePage:true,onPageChange:target=>{
      fixture.calls.push(target);pagination.setBusy(true);
      const finish=()=>{fixture.state.page=target;fixture.state.hasMore=target<3;pagination.render({...fixture.state,busy:false});};
      if(fixture.pause)return new Promise(resolve=>{fixture.finish=()=>{finish();resolve();};});
      finish();
    }});
    fixture.render=state=>{fixture.state={...state};pagination.render({...state,busy:false});};
    fixture.pagination=pagination;fixture.render(fixture.state);window.paginationFixture=fixture;
    const drawer=document.createElement('dialog'),content=document.createElement('div');drawer.className='drawer';drawer.id='pagination-dialog';content.id='details-content';
    content.append(pagination.element);drawer.append(content);document.body.append(drawer);drawer.showModal();
    await Promise.all(drawer.getAnimations().map(animation=>animation.finished));
  });
  const pager=page.getByRole('navigation',{name:'Paginação de Arquivos'});
  const button=action=>pager.locator(`[data-page="${action}"]`);
  const pages=()=>pager.locator('.pagination-pages button').allTextContents();
  assert.deepEqual(await pages(),['48','49','50','51','52']);
  await button('next').click();assert.equal(await button(51).getAttribute('aria-current'),'page');
  await button(49).press('Enter');assert.equal(await button(49).getAttribute('aria-current'),'page');
  await button('last').click();assert.deepEqual(await pages(),['96','97','98','99','100']);assert.equal(await button('last').isDisabled(),true);
  await button('first').click();assert.equal(await button('prev').isDisabled(),true);
  assert.equal(await button(1).evaluate(node=>node===document.activeElement),true);
  await page.evaluate(()=>{paginationFixture.pause=true;});await button('next').click();
  assert.equal(await pager.locator('button:enabled').count(),0);
  await page.evaluate(()=>paginationFixture.finish());
  assert.equal(await button(2).getAttribute('aria-current'),'page');assert.equal(await button('next').evaluate(node=>node===document.activeElement),true);
  await page.evaluate(()=>{paginationFixture.pause=false;tableFixture.instance.renderPage({rows:tableFixture.rows,page:3,lastPage:100});});
  assert.equal(await button('next').evaluate(node=>node===document.activeElement),true,'A paginação principal não rouba o foco dos detalhes');
  for(const theme of ['light','dark'])for(const width of [320,360,390,430,700,1068]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;paginationFixture.render({page:6235,lastPage:6237});},theme);
    await page.locator('#pagination-dialog').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
    const visiblePages=await pager.locator('.pagination-pages button:visible').allTextContents();
    assert.deepEqual(visiblePages,width<=400?['6234','6235','6236']:['6233','6234','6235','6236','6237']);
    const geometry=await pager.evaluate(nav=>{
      const box=nav.getBoundingClientRect(),buttons=[...nav.querySelectorAll('button')].filter(button=>button.getClientRects().length);
      return {left:box.left,right:box.right,width:box.width,scroll:nav.scrollWidth,client:nav.clientWidth,
        fits:buttons.every(button=>button.scrollWidth<=button.clientWidth+1),heights:buttons.map(button=>button.getBoundingClientRect().height)};
    });
    assert(geometry.left>=0 && geometry.right<=width && geometry.scroll<=geometry.client && geometry.fits,JSON.stringify({width,theme,...geometry}));
    if(width<=700)assert(geometry.heights.every(height=>height>=44));
  }
  await page.evaluate(()=>paginationFixture.render({page:1,lastPage:null,hasMore:true}));
  assert.equal(await pager.locator('button').count(),2);assert.equal(await pager.locator('.pagination-pages').count(),0);
  assert.equal(await pager.locator('.pagination-label').innerText(),'Página 1');assert.equal(await button('prev').isDisabled(),true);
  await button('next').click();await button('next').click();
  assert.equal(await pager.locator('.pagination-label').innerText(),'Página 3');assert.equal(await button('next').isDisabled(),true);
  await button('prev').click();assert.equal(await pager.locator('.pagination-label').innerText(),'Página 2');assert.equal(await button('next').isEnabled(),true);
  await page.evaluate(()=>paginationFixture.render({page:1,lastPage:1}));assert.equal(await pager.isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS Paginação compartilhada: cinco páginas, atalhos, teclado/foco, carregamento, total desconhecido, limites e temas em 320–1068 px');
} finally {await browser.close();await app.close();}
