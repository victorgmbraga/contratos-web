import { openAllFilters } from './filter-layout.js';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';
import { routePncp } from './pncp-route.js';

// Artefato de produção: a relação de municípios é um asset com hash, carregado só ao usar o campo.
const app = createStaticServer(new URL('../dist-browser/', import.meta.url));
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const browser = await launchTestBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pncp = [];
  await routePncp(context, pncp);
  const page = await context.newPage(),
    errors = [],
    catalogRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/assets\/municipios-ibge-[\w-]+\.json$/.test(new URL(request.url()).pathname))
      catalogRequests.push(request.url());
  });
  await page.goto(`http://127.0.0.1:${app.server.address().port}/`);
  await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
  assert.equal(catalogRequests.length, 0, 'A relação não é baixada antes de usar o campo');
  await openAllFilters(page);
  const field = page.locator('#filter-municipios:not(:disabled)'),
    options = page.locator('#filter-suggestions-municipios .suggestion');
  await field.click();
  await page
    .locator('#filter-suggestions-municipios .suggestion-heading, #filter-suggestions-municipios .suggestion')
    .first()
    .waitFor();
  assert.equal(await options.count(), 27);
  assert.match(await page.locator('#filter-suggestions-municipios .suggestion-hint').innerText(), /5\.571 municípios/);
  await field.fill('b');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#filter-suggestions-municipios .suggestion')].every(node =>
      /^B/.test(node.textContent)
    )
  );
  assert.equal(await options.count(), 50);
  assert.match(await page.locator('#filter-suggestions-municipios .suggestion-hint').innerText(), /Mostrando 50 de/);
  await field.fill('brasília');
  await page.locator('#filter-suggestions-municipios .suggestion[data-value="5300108"]').click();
  assert.equal(await page.locator('#filter-selected-municipios .selected-option').innerText(), 'Brasília/DF ×');
  assert(!pncp.some(url => url.includes('/suggest')), 'Municípios não consultam o autocomplete do PNCP');
  await page.locator('#apply-filters').click();
  await page.waitForFunction(() =>
    document.querySelector('#native-chips').textContent.includes('Município: Brasília/DF')
  );
  assert.equal(new URL(page.url()).searchParams.get('municipios'), '5300108');
  console.log('PASS Municípios buscam na relação do IBGE desde a primeira letra, sem consultar o PNCP');

  // Recarregar: o nome volta pelo asset (cacheado) e a escolha aparece como recente.
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('#native-chips').textContent.includes('Município: Brasília/DF')
  );
  await openAllFilters(page);
  await field.click();
  await page.locator('#filter-suggestions-municipios .suggestion-heading').first().waitFor();
  assert.deepEqual(await page.locator('#filter-suggestions-municipios .suggestion-heading').allInnerTexts(), [
    'Usados recentemente',
    'Capitais'
  ]);
  assert.equal(await options.first().getAttribute('data-value'), '5300108');
  assert.equal(await options.first().getAttribute('aria-selected'), 'true');
  assert.equal(
    await page.locator('#filter-suggestions-municipios .suggestion-heading').first().getAttribute('aria-hidden'),
    'true'
  );
  console.log('PASS Município escolhido mantém o nome após recarregar e aparece entre os usados recentemente');

  // Títulos e orientações ficam fora da árvore da listbox; a orientação é anunciada à parte.
  const audit = async field => {
    // A lista surge com uma transição de opacidade; o contraste é medido depois dela.
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
    const result = await new AxeBuilder({ page })
      .include(`#filter-suggestions-${field}`)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    assert.deepEqual(
      result.violations.map(
        violation =>
          violation.id + ' ' + violation.nodes.map(n => n.html.slice(0, 120) + ' ' + n.failureSummary).join(' | ')
      ),
      [],
      field
    );
  };
  await audit('municipios');
  assert.match(await page.locator('#filter-options-status').innerText(), /5\.571 municípios/);
  await page.locator('#filter-orgaos:not(:disabled)').click();
  await page.locator('#filter-suggestions-orgaos .suggestion').first().waitFor();
  await audit('orgaos');
  console.log('PASS Listas com recentes, títulos e orientações passam no axe e anunciam a orientação');
  assert.deepEqual(errors, []);
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await browser.close();
  await app.close();
}
