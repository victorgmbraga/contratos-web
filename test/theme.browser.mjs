import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStaticServer} from './static-server.js';
import {launchTestBrowser} from './browser-launch.js';
import {THEME_STORAGE_KEY} from '../public/theme.js';

const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),context=await browser.newContext({colorScheme:'dark',viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const url=`http://127.0.0.1:${app.server.address().port}/?demo=1`;
const theme=()=>page.locator('html').getAttribute('data-theme');
const ready=()=>page.waitForFunction(()=>!document.querySelector('#export-button').disabled);
async function contrast(selectors) {
  const failures=await page.evaluate(selectors=>{
    const rgb=text=>text.match(/[\d.]+/g).map(Number);
    const luminance=channels=>channels.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const failures=[];
    for(const selector of selectors) {
      const node=document.querySelector(selector);if(!node){failures.push({selector,missing:true});continue;}
      let background=node;
      while(background.parentElement && rgb(getComputedStyle(background).backgroundColor)[3]===0)background=background.parentElement;
      const style=getComputedStyle(node),fg=luminance(rgb(style.color)),bg=luminance(rgb(getComputedStyle(background).backgroundColor));
      const ratio=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
      if(ratio<4.5)failures.push({selector,ratio,color:style.color,background:getComputedStyle(background).backgroundColor});
    }
    return failures;
  },selectors);
  assert.deepEqual(failures,[],'Contraste de texto abaixo de 4,5:1');
}
try {
  await page.goto(url);await ready();assert.equal(await theme(),'dark');
  assert.equal(await page.locator('#theme-button').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#theme-button .theme-icon-sun').isVisible(),true);
  assert.equal(await page.locator('#theme-button .theme-icon-moon').isVisible(),false);
  await page.locator('#theme-button').hover();await page.locator('#theme-button-tooltip').waitFor({state:'visible'});
  assert.equal(await page.locator('#theme-button-tooltip').innerText(),'Ativar modo claro');
  await contrast(['#theme-button-tooltip']);
  for(const [type,title] of [['edital','64 contratações'],['ata','24 atas'],['contrato','32 contratos']]) {
    await page.locator('#document-type').selectOption(type);
    await page.waitForFunction(title=>document.querySelector('#result-title').textContent===title,title);
    await contrast(['.brand','.results-col','.results-cell','.results-page','.results-page.active','#search-button','#repository-link','#result-title','#document-type']);
    assert.equal(await page.locator('.results-row').first().evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(23, 35, 49)');
    await page.locator('#filters-button').click();await page.locator('#filter-ufs:not(:disabled)').waitFor();
    await contrast(['#filters-title','.filters-body .panel-note','#draft-status','.filter-field label','#apply-filters']);
    await page.locator('#filter-ufs').click();await page.locator('#filter-suggestions-ufs').waitFor({state:'visible'});
    await contrast(['#filter-suggestions-ufs .suggestion']);
    await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
    await page.locator('.results-open').first().click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(tab=>tab.dataset.state==='loaded'));
    await contrast(['#details-kind','.detail-object','.detail-tab[aria-selected="true"]','.detail-grid dt','.detail-grid dd','.detail-links a']);
    assert.equal(await page.locator('#details-dialog').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(23, 35, 49)');
    await page.locator('.detail-tab').nth(1).click();
    await contrast(['.detail-tab[aria-selected="true"]']);
    if(type==='contrato')await page.screenshot({path:join(tmpdir(),'contratos-dark-details.png')});
    await page.locator('#details-dialog .close-dialog').click();
  }
  await page.locator('#columns-button').click();await contrast(['#columns-dialog h2','#column-list label']);
  await page.locator('#columns-dialog .close-dialog').click();
  await page.locator('#search').fill('falha-ui');await page.locator('#search-button').click();
  await page.waitForFunction(()=>document.querySelector('#notice').classList.contains('error'));await contrast(['#notice']);
  await page.locator('#search').fill('lenta-ui');await page.locator('#search-button').click();
  await page.locator('#table-loader').waitFor({state:'visible'});await contrast(['#table-loader-title','#table-loader-message']);await ready();
  const before=page.url();await page.locator('#theme-button').click();
  assert.equal(await theme(),'light');assert.equal(page.url(),before);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),THEME_STORAGE_KEY),'light');
  await page.reload();await ready();assert.equal(await theme(),'light');
  await page.emulateMedia({colorScheme:'light'});await page.emulateMedia({colorScheme:'dark'});assert.equal(await theme(),'light');
  const second=await context.newPage();await second.goto(page.url());await second.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.locator('#theme-button').focus();await page.keyboard.press('Enter');
  await second.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await second.close();
  await page.reload();await ready();assert.equal(await theme(),'dark');
  await page.goto(url);await ready();
  await page.setViewportSize({width:390,height:844});await page.locator('#more-actions-button').click();await page.locator('#theme-button').focus();
  const bounds=await page.locator('#theme-button').boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=390);
  assert.equal(await page.locator('#theme-button').evaluate(node=>node.closest('#header-content')!==null),true);
  await contrast(['.result-card-open','.result-card-object','.result-card-organ','.result-card-values dt','.result-card-values dd']);
  await page.keyboard.press('Escape');await page.screenshot({path:join(tmpdir(),'contratos-dark-mobile.png')});
  await page.goto(new URL('pncp-diagnostic.html',url).href);assert.equal(await theme(),'dark');await contrast(['h1','p','a']);
  assert.deepEqual(errors,[]);
  console.log('PASS Temas: sistema, alternância, persistência, sincronização entre abas, contraste, três tipos, modais, detalhes, avisos e tela pequena');
} finally {await browser.close();await app.close();}
