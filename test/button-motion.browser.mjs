import assert from 'node:assert/strict';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';

const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',hasTouch:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}/`);
  await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
  await page.evaluate(()=>{
    window.motionEvidence=[];
    document.addEventListener('click',event=>{
      const button=event.target.closest('button,a.repository-link');
      if(!button || !['refresh-button','columns-button','export-button','more-actions-button'].includes(button.id))return;
      const icon=button.querySelector(':scope > svg');
      const animation=icon?.getAnimations().at(-1);
      window.motionEvidence.push({id:button.id,transforms:animation?.effect.getKeyframes().map(frame=>frame.transform) || []});
      if(button.id==='refresh-button'){
        const observer=new MutationObserver(()=>{
          if(!button.disabled)return;
          window.refreshDuringLoad={disabled:button.disabled,running:icon.getAnimations().some(item=>item.playState==='running')};
          observer.disconnect();
        });
        observer.observe(button,{attributes:true,attributeFilter:['disabled']});
      }
    },true);
  });

  async function colorFeedback() {
    await page.mouse.move(0,0);
    const before=await page.locator('#refresh-button').evaluate(node=>{
      const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,background:style.backgroundColor,transition:style.transitionProperty};
    });
    await page.locator('#refresh-button').hover();
    await page.waitForFunction(color=>getComputedStyle(document.querySelector('#refresh-button')).backgroundColor!==color,before.background);
    const after=await page.locator('#refresh-button').boundingBox();
    assert(Math.abs(before.x-after.x)<.1 && Math.abs(before.y-after.y)<.1 && Math.abs(before.width-after.width)<.1 && Math.abs(before.height-after.height)<.1,'O botão deve permanecer na mesma posição e tamanho');
    assert(before.transition.includes('background-color') && before.transition.includes('color'));
  }
  await colorFeedback();
  await page.locator('#theme-button').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await colorFeedback();

  await page.locator('#search').fill('lenta-ui');
  await page.locator('#search').press('Enter');
  await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
  await page.locator('#refresh-button').click();
  await page.waitForFunction(()=>window.refreshDuringLoad);
  assert.deepEqual(await page.evaluate(()=>window.refreshDuringLoad),{disabled:true,running:true});
  let evidence=await page.evaluate(()=>window.motionEvidence.at(-1));
  assert.equal(evidence.id,'refresh-button');assert.deepEqual(evidence.transforms,['rotate(0deg)','rotate(360deg)']);
  await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
  await page.locator('#refresh-button').focus();await page.keyboard.press('Enter');
  evidence=await page.evaluate(()=>window.motionEvidence.at(-1));
  assert.equal(evidence.id,'refresh-button');assert.deepEqual(evidence.transforms,['rotate(0deg)','rotate(360deg)']);
  await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);

  await page.locator('#columns-button').focus();await page.keyboard.press('Enter');
  await page.locator('#columns-dialog[open]').waitFor();
  evidence=await page.evaluate(()=>window.motionEvidence.at(-1));
  assert.equal(evidence.id,'columns-button');assert(evidence.transforms.some(transform=>/^scale\(0?\.86\)$/.test(transform)));
  await page.locator('#columns-dialog .close-dialog').click();
  await page.locator('#export-button').click();
  evidence=await page.evaluate(()=>window.motionEvidence.at(-1));
  assert.equal(evidence.id,'export-button');assert(evidence.transforms.includes('translateY(3px)'));
  await page.keyboard.press('Escape');

  const disabled=await page.evaluate(()=>{
    return ['disabled','aria-disabled','aria-busy'].map(state=>{
      const button=document.createElement('button');
      button.innerHTML='<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>';
      if(state==='disabled')button.disabled=true;else button.setAttribute(state,'true');
      document.body.append(button);button.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const count=button.firstElementChild.getAnimations().length;button.remove();return count;
    });
  });
  assert.deepEqual(disabled,[0,0,0]);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#more-actions-button').tap();
  evidence=await page.evaluate(()=>window.motionEvidence.at(-1));
  assert.equal(evidence.id,'more-actions-button');assert(evidence.transforms.some(transform=>/^scale\(0?\.86\)$/.test(transform)));
  await page.goto(`http://127.0.0.1:${app.server.address().port}/?q=pagina-ui`);
  await page.waitForFunction(()=>{const next=document.querySelector('.results-paginator [data-page="next"]');return next && !next.disabled;});
  await page.evaluate(()=>{
    const original=document.querySelector('.results-paginator [data-page="next"]'),animate=SVGElement.prototype.animate;
    window.paginationMotion=[];
    SVGElement.prototype.animate=function(...args){
      const button=this.closest('button[data-page="next"]');
      if(button)window.paginationMotion.push({replacement:button!==original,connected:button.isConnected});
      return animate.apply(this,args);
    };
  });
  await page.locator('.results-paginator [data-page="next"]').tap();
  await page.waitForFunction(()=>window.paginationMotion.some(motion=>motion.replacement && motion.connected));
  await page.waitForFunction(()=>document.querySelector('.results-page.active')?.getAttribute('data-page')==='2');
  assert.deepEqual(errors,[]);
  console.log('PASS Botões preservam a geometria, mudam de cor e animam os ícones por mouse, teclado e toque');
} catch(error) {await diagnoseBrowserFailure(error);throw error;} finally {await browser.close();await app.close();}
