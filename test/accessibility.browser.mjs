// Verificação automática de acessibilidade com axe; ver docs/validacao.md.
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { createStaticServer } from './static-server.js';
import { launchTestBrowser } from './browser-launch.js';

const app = createStaticServer(new URL('../dist-browser-test/', import.meta.url));
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await launchTestBrowser();
const serious = result => result.violations.filter(violation => ['critical', 'serious'].includes(violation.impact));
function describe(result) {
  for (const violation of result.violations) {
    console.log(`  ${violation.impact} ${violation.id}: ${violation.help} (${violation.nodes.length})`);
    for (const node of violation.nodes) console.log(`    ${node.target.join(' ')} :: ${node.failureSummary}`);
  }
  return serious(result).map(violation => `${violation.id} (${violation.nodes.length}): ${violation.help}`);
}
const analyze = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
// Modal and drawer transitions change opacity; analyze only after they settle.
const settle = page => page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => document.querySelector('#result-title')?.textContent === '64 contratações');
  await page.waitForTimeout(300);
  assert.deepEqual(describe(await analyze(page)), [], 'violações na busca em desktop');

  await page.locator('#filters-button').click();
  await page.locator('#filter-groups .filter-field').first().waitFor();
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no modal de filtros');

  await page.locator('#filters-dialog .close-dialog').first().click();
  await page.locator('#columns-button').click();
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no diálogo de colunas');
  await page.locator('#columns-dialog .close-dialog').first().click();
  await page.locator('#export-button').click();
  await page.locator('#export-menu').waitFor({ state: 'visible' });
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no menu de exportação');
  await page.keyboard.press('Escape');
  await page.locator('#export-menu').waitFor({ state: 'hidden' });
  await page.locator('#results-table tbody .results-open').first().click();
  await page.waitForFunction(() => document.querySelector('#details-dialog')?.open === true);
  await page.locator('#details-dialog .detail-tab').first().waitFor();
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no painel de detalhes');

  await page.locator('#details-dialog .close-dialog').first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações na visualização móvel');

  assert.deepEqual(errors, [], 'erros JavaScript durante a verificação');
  console.log('PASS Acessibilidade: axe sem violações críticas ou sérias em busca, filtros, menu de exportação, detalhes e mobile');
} finally {
  await browser.close();
  app.server.close();
}
