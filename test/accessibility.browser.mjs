import { openAllFilters } from './filter-layout.js';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
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
const analyze = page =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
// Modal and drawer transitions change opacity; analyze only after they settle.
// Dois quadros deixam o navegador iniciar transições disparadas por layout (ex.: troca de viewport).
const settle = page =>
  page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function checkDetails(label) {
    await page.locator('#results-table tbody .results-open').first().click();
    await page.waitForFunction(
      () =>
        document.querySelector('#details-dialog')?.open === true &&
        document.querySelectorAll('#details-dialog .detail-tab').length > 0 &&
        [...document.querySelectorAll('#details-dialog .detail-tab')].every(tab => tab.dataset.state === 'loaded')
    );
    await settle(page);
    assert.deepEqual(describe(await analyze(page)), [], `violações no painel de detalhes (${label})`);
    await page.locator('#details-dialog .close-dialog').first().click();
    await page.waitForFunction(() => !document.querySelector('#details-dialog')?.open);
  }

  await page.goto(`${origin}/`);
  await page.waitForFunction(() => document.querySelector('#result-title')?.textContent === '64 editais');
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações na busca em desktop (tema claro)');

  await openAllFilters(page);
  await page.locator('#filter-groups .filter-field').first().waitFor();
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no modal de filtros (tema claro)');

  await page.locator('#filters-dialog .close-dialog').first().click();
  await page.locator('#columns-button').click();
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no diálogo de colunas (tema claro)');
  await page.locator('#columns-dialog .close-dialog').first().click();
  await page.locator('#export-button').click();
  await page.locator('#export-menu').waitFor({ state: 'visible' });
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no menu de exportação (tema claro)');
  await page.keyboard.press('Escape');
  await page.locator('#export-menu').waitFor({ state: 'hidden' });
  await checkDetails('edital, tema claro');

  for (const [type, title] of [
    ['ata', '24 atas'],
    ['contrato', '32 contratos']
  ]) {
    await page.locator('#document-type').selectOption(type);
    await page.waitForFunction(expected => document.querySelector('#result-title')?.textContent === expected, title);
    await settle(page);
    assert.deepEqual(describe(await analyze(page)), [], `violações na busca de ${type} (tema claro)`);
    await checkDetails(`${type}, tema claro`);
  }
  await page.locator('#document-type').selectOption('edital');
  await page.waitForFunction(() => document.querySelector('#result-title')?.textContent === '64 editais');

  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações na visualização móvel (tema claro)');
  await page.locator('#more-actions-button').click();
  await page.locator('#mobile-view-button').waitFor({ state: 'visible' });
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no menu Mais ações em mobile (tema claro)');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#theme-button').waitFor({ state: 'visible' });
  await page.locator('#theme-button').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações na busca em desktop (tema escuro)');

  await openAllFilters(page);
  await page.locator('#filter-groups .filter-field').first().waitFor();
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no modal de filtros (tema escuro)');
  await page.locator('#filters-dialog .close-dialog').first().click();

  await checkDetails('edital, tema escuro');

  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações na visualização móvel (tema escuro)');
  await page.locator('#more-actions-button').click();
  await page.locator('#mobile-view-button').waitFor({ state: 'visible' });
  await settle(page);
  assert.deepEqual(describe(await analyze(page)), [], 'violações no menu Mais ações em mobile (tema escuro)');
  await page.keyboard.press('Escape');

  assert.deepEqual(errors, [], 'erros JavaScript durante a verificação');
  console.log(
    'PASS Acessibilidade: axe sem violações críticas ou sérias em claro/escuro, editais/atas/contratos, filtros, exportação, detalhes e mobile'
  );
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await browser.close();
  app.server.close();
}
