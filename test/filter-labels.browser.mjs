import assert from 'node:assert/strict';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';
import { routePncp } from './pncp-route.js';

const app = createStaticServer(new URL('../dist-browser/', import.meta.url));
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const browser = await launchTestBrowser();
try {
  const context = await browser.newContext();
  await routePncp(context);
  const names = { orgaos: 'INST. NAC. COLON. REFORMA AGRARIA - INCRA', unidades: 'UNIDADE DO INCRA' };
  let suggestions = 0;
  await context.route('https://pncp.gov.br/api/search/suggest?**', route => {
    suggestions++;
    const field = new URL(route.request().url()).searchParams.get('campo');
    return route.fulfill({
      json: { items: [{ id: 90939, nome: names[field] }] },
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}/`);
  await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
  await page.locator('#filters-button').click();
  for (const field of ['orgaos', 'unidades']) {
    await page.locator(`#filter-${field}:not(:disabled)`).fill('incra');
    await page.locator(`#filter-suggestions-${field} .suggestion[data-value="90939"]`).click();
  }
  await page.locator('#apply-filters').click();
  await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
  const queryUrl = page.url();
  assert.equal(new URL(queryUrl).searchParams.get('orgaos'), '90939');
  assert.equal(new URL(queryUrl).searchParams.get('unidades'), '90939');
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
  assert.equal(page.url(), queryUrl);
  for (const name of Object.values(names)) assert((await page.locator('#native-chips').innerText()).includes(name));
  await page.locator('#filters-button').click();
  for (const [field, name] of Object.entries(names)) {
    await page.locator(`#filter-${field}:not(:disabled)`).waitFor();
    assert((await page.locator(`#filter-selected-${field}`).innerText()).includes(name));
  }
  assert.equal(suggestions, 2, 'Recarregar não repete o autocomplete para recuperar os nomes');
  assert.deepEqual(errors, []);
  console.log('PASS Órgão e Unidade fora da lista inicial preservam os nomes no resumo e no modal após reload real');
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await browser.close();
  await app.close();
}
