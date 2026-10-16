import {launchTestBrowser} from './browser-launch.js';
import {createStaticServer} from './static-server.js';
const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(`http://127.0.0.1:${app.server.address().port}/?q=janela-ui`);
  await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);
  await page.locator('#columns-button').click();
  for(const checkbox of await page.locator('#column-list input').all())await checkbox.check();
  await page.locator('#columns-dialog .close-dialog').click();
  const samples=[];
  for(let i=0;i<8;i++)samples.push(await page.evaluate(async()=>{
    const root=document.querySelector('#results-table'),start=performance.now();
    await new Promise(resolve=>{
      const observer=new MutationObserver(()=>{if(root.getAttribute('aria-busy')==='false'){observer.disconnect();resolve();}});
      observer.observe(root,{attributes:true,attributeFilter:['aria-busy']});
      document.querySelector('#refresh-button').click();
    });
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return performance.now()-start;
  }));
  const nodes=await page.locator('#results-table *').count();
  console.log(JSON.stringify({scenario:'100 rows, all columns, refresh to two animation frames',samples_ms:samples.slice(1),median_ms:samples.slice(1).sort((a,b)=>a-b)[3],dom_nodes:nodes}));
} finally {await browser.close();await app.close();}
