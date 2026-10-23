import assert from 'node:assert/strict';
import {createStaticServer} from './static-server.js';
import {launchTestBrowser} from './browser-launch.js';

const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),errors=[];
const text='Descrição completa com serviços, materiais e condições da contratação. '.repeat(60)+'<img src=x onerror=alert(1)>';
try {
 const page=await browser.newPage({viewport:{width:1068,height:630}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(text=>{
  const NativeWorker=Worker;
  window.Worker=class extends NativeWorker {
   constructor(...args){super(...args);this.requests=new Map();this.addEventListener('message',event=>{
    const method=this.requests.get(event.data.id),result=event.data.result;
    if(method==='execute'&&result?.data)for(const row of result.data)row.objeto_compra=text;
    if(method==='documentDetails'&&result)result.objeto=text;
   });}
   postMessage(message,...args){this.requests.set(message.id,message.method);return super.postMessage(message,...args);}
  };
 },text);
 for(const type of ['edital','ata','contrato']){
  await page.goto(`http://127.0.0.1:${app.server.address().port}/?demo=1&tipos_documento=${type}`);
  await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);
  assert.equal(await page.locator('.result-card').count(),0,'Desktop não monta cartões ocultos');
  await page.locator('.results-open').first().click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(tab=>tab.dataset.state==='loaded'));
  const more=page.getByRole('button',{name:'Ver descrição completa',exact:true});await more.waitFor();
  await page.locator('#details-dialog').evaluate(dialog=>Promise.all(dialog.getAnimations().map(animation=>animation.finished)));
  const geometry=await page.locator('#details-dialog').evaluate(dialog=>{
   const panel=dialog.querySelector('[role="tabpanel"]:not([hidden])'),tabs=dialog.querySelector('.detail-tabs');
   return {top:panel.getBoundingClientRect().top,height:panel.clientHeight,tabs:tabs.getBoundingClientRect().bottom,viewport:innerHeight};
  });
  assert(geometry.tabs<geometry.viewport&&geometry.height>=80,JSON.stringify(geometry));
  await more.click();assert.equal(await page.locator('#description-content').innerText(),text);assert.equal(await page.locator('#description-dialog img').count(),0);
  await page.locator('#description-content').evaluate(node=>{node.scrollTop=node.scrollHeight;});
  const close=await page.getByRole('button',{name:'Fechar descrição',exact:true}).boundingBox();assert(close.y>=0&&close.y+close.height<=630);
  await page.keyboard.press('Escape');await page.locator('#description-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#details-dialog').isVisible(),true);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.detail-tabs')).display==='none');
  await more.waitFor({state:'hidden'});assert.equal(await page.locator('.detail-object').innerText(),text);
  await page.setViewportSize({width:1068,height:630});await more.waitFor();
  await more.click();await page.goBack();await page.waitForFunction(()=>!document.querySelector('#details-dialog').open&&!document.querySelector('#description-dialog').open);
  await page.locator('#description-dialog').waitFor({state:'hidden'});await page.locator('#details-dialog').waitFor({state:'hidden'});
 }
 // Switching views always renders the latest rows, and releases hidden card nodes.
 await page.goto(`http://127.0.0.1:${app.server.address().port}/?demo=1&q=pagina-ui`);await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);
 assert.equal(await page.locator('.result-card').count(),0);
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelectorAll('.result-card').length===100);
 await page.getByRole('button',{name:'Próxima página',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.result-card').length===64);
 const title=await page.locator('.result-card-open').first().innerText();
 await page.setViewportSize({width:1068,height:844});await page.waitForFunction(()=>document.querySelectorAll('.result-card').length===0);
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelectorAll('.result-card').length===64);
 assert.equal(await page.locator('.result-card-open').first().innerText(),title);
 assert.deepEqual(errors,[]);
 console.log('PASS Descrições extensas: abas acessíveis, leitura completa segura, fechamento e histórico nos três tipos; cartões sob demanda com dados atuais e liberação ao retornar ao desktop');
} finally {await browser.close();await app.close();}
