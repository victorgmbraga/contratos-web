import assert from 'node:assert/strict';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';

const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${app.server.address().port}`;
const browser=await launchTestBrowser(),errors=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/');
  await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
  await page.evaluate(()=>{
    const animate=SVGElement.prototype.animate;
    window.motionCalls=[];
    SVGElement.prototype.animate=function(...args){
      const button=this.closest('button,a.repository-link');
      if(button)window.motionCalls.push({id:button.id,transforms:args[0].map(frame=>frame.transform)});
      return animate.apply(this,args);
    };
  });
  const calls=id=>page.evaluate(id=>window.motionCalls.filter(call=>call.id===id),id);
  async function hoverRefresh() {
    await page.mouse.move(0,0);
    const before=await page.locator('#refresh-button').evaluate(node=>{
      const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,background:style.backgroundColor,transition:style.transitionProperty};
    });
    const count=(await calls('refresh-button')).length;
    await page.locator('#refresh-button').hover();
    await page.waitForFunction(color=>getComputedStyle(document.querySelector('#refresh-button')).backgroundColor!==color,before.background);
    const after=await page.locator('#refresh-button').boundingBox(),recorded=await calls('refresh-button');
    assert.equal(recorded.length,count+1,'O hover deve iniciar uma animação, sem clique');
    assert.deepEqual(recorded.at(-1).transforms,['rotate(0deg)','rotate(360deg)']);
    assert(Math.abs(before.x-after.x)<.1 && Math.abs(before.y-after.y)<.1 && Math.abs(before.width-after.width)<.1 && Math.abs(before.height-after.height)<.1);
    assert(before.transition.includes('background-color') && before.transition.includes('color'));
  }
  await hoverRefresh();
  await page.locator('#theme-button').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await hoverRefresh();
  const hoverCount=(await calls('refresh-button')).length;
  await page.locator('#refresh-button').click();
  await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
  assert.equal((await calls('refresh-button')).length,hoverCount,'O clique com mouse não reinicia a animação');

  await page.mouse.move(0,0);
  await page.locator('#export-button').hover();
  let recorded=await calls('export-button');
  assert(recorded.at(-1).transforms.includes('translateY(3px)'));
  const count=recorded.length,box=await page.locator('#export-button').boundingBox();
  await page.mouse.move(box.x+2,box.y+2);
  assert.equal((await calls('export-button')).length,count,'Mover entre filhos do botão não reinicia o efeito');
  await page.mouse.move(0,0);
  await page.locator('#refresh-button').focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'columns-button');
  recorded=await calls('columns-button');
  assert(recorded.at(-1).transforms.includes('scale(.86)'),'O foco por teclado anima o ícone');

  const disabled=await page.evaluate(()=>['disabled','aria-disabled','aria-busy'].map(state=>{
    const button=document.createElement('button');button.innerHTML='<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>';
    if(state==='disabled')button.disabled=true;else button.setAttribute(state,'true');
    document.body.append(button);button.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));
    const count=button.firstElementChild.getAnimations().length;button.remove();return count;
  }));
  assert.deepEqual(disabled,[0,0,0]);

  const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),touchPage=await touchContext.newPage();
  touchPage.on('pageerror',error=>errors.push(error.message));
  await touchPage.goto(origin+'/?q=pagina-ui');
  await touchPage.waitForFunction(()=>{const next=document.querySelector('.results-paginator [data-page="next"]');return next && !next.disabled;});
  await touchPage.evaluate(()=>{
    const original=document.querySelector('.results-paginator [data-page="next"]'),animate=SVGElement.prototype.animate;
    window.touchMotion=[];
    SVGElement.prototype.animate=function(...args){
      const button=this.closest('button');
      if(button)window.touchMotion.push({id:button.id,page:button.dataset.page,replacement:button!==original,connected:button.isConnected});
      return animate.apply(this,args);
    };
  });
  await touchPage.locator('#more-actions-button').tap();
  assert(await touchPage.evaluate(()=>window.touchMotion.some(item=>item.id==='more-actions-button')),'O toque mantém feedback em dispositivos sem hover');
  await touchPage.keyboard.press('Escape');
  await touchPage.locator('.results-paginator [data-page="next"]').tap();
  await touchPage.waitForFunction(()=>window.touchMotion.some(item=>item.page==='next' && item.replacement && item.connected));
  await touchPage.waitForFunction(()=>document.querySelector('.results-page.active')?.getAttribute('data-page')==='2');
  assert.deepEqual(errors,[]);
  console.log('PASS Ícones animam no hover e no foco; toque mantém feedback sem alterar a geometria dos botões');
} catch(error) {await diagnoseBrowserFailure(error);throw error;} finally {await browser.close();await app.close();}
