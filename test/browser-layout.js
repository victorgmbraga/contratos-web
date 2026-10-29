import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { routePncp } from './pncp-route.js';
const baseline=JSON.parse(await readFile(new URL('./layout-baseline.json',import.meta.url),'utf8'));
const normalizeFonts=styles=>Object.fromEntries(Object.entries(styles).map(([selector,style])=>[selector,{...style,fontFamily:style.fontFamily.replace(/["']/g,'')}]));

const layoutSelectors = ['#app-header', '.search-field', '#search-button', '#results-table', '.results-header', '.results-col', '.results-col-content', '.results-col-title', '.results-row', '.results-row-even', '.results-cell', '.results-footer', '.results-footer-contents', '.results-page-counter', '.results-paginator', '.results-page', '.results-page.active'];
async function snapshot(page,width) {
  if(width<=700){
    // O baseline visual usa a tabela; force-a antes de medir para não disputar
    // com o evento de mídia que libera as linhas no modo cartões.
    await page.evaluate(()=>{
      const button=document.querySelector('#mobile-view-button');
      if(button?.dataset.view==='table')button.click();
    });
    await page.locator('.results-grid').waitFor({state:'visible'});
  }
  for(const selector of layoutSelectors)await page.locator(selector).first().waitFor({state:'attached'});
  return page.evaluate(async selectors => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const properties = ['backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'borderTopColor', 'borderTopWidth', 'borderBottomColor', 'borderBottomWidth', 'borderRightColor', 'borderRightWidth', 'borderRadius', 'display', 'gap', 'minHeight'];
    return Object.fromEntries(selectors.map(selector => {
      const node = document.querySelector(selector), style = getComputedStyle(node);
      return [selector, { ...Object.fromEntries(properties.map(key => [key, style[key]])) }];
    }));
  },layoutSelectors);
}

// Recorded visual baseline: application colors, spacing and table typography.
// Intrinsic heights depend on row content, fonts and browser, so only CSS is fixed.
export async function assertBrowserLayout(browser, url) {
  const context = await browser.newContext();
  await routePncp(context);
  const page = await context.newPage();
  try {
    await page.goto(url);
    for (const [type, title] of [['edital','64 contratações'], ['ata','24 atas'], ['contrato','32 contratos']]) {
      if (await page.locator('#document-type').inputValue() !== type) await page.locator('#document-type').selectOption(type);
      await page.waitForFunction(title => document.querySelector('#result-title').textContent === title, title);
      for (const viewport of [{width:1440,height:1000}, {width:1068,height:630}, {width:390,height:844}]) {
        await page.setViewportSize(viewport);
        const expected=Object.fromEntries(Object.entries(baseline.styles).map(([selector,style])=>[selector,{...style,...baseline.viewport_overrides[viewport.width][selector]}]));
        // Browsers serialize quoted family names differently in computed CSS.
        const actual=normalizeFonts(await snapshot(page,viewport.width)),reference=normalizeFonts(expected),differences=[];
        for(const [selector,properties] of Object.entries(reference))for(const [property,value] of Object.entries(properties)) {
          if(actual[selector][property]!==value)differences.push({selector,property,expected:value,actual:actual[selector][property]});
        }
        assert.deepEqual(differences,[], `Layout ${type} em ${viewport.width}px difere da referência visual`);
      }
    }
    console.log('PASS Layout estático preserva cores, espaçamento e tipografia: três tipos e três tamanhos de tela');
  } catch(error) {await diagnoseBrowserFailure(error);throw error;} finally { await context.close(); }
}
