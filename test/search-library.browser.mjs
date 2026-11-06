import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';
import { routePncp } from './pncp-route.js';

// Buscas prontas e buscas salvas no painel do campo de busca (artefato de produção).
const app = createStaticServer(new URL('../dist-browser/', import.meta.url));
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const browser = await launchTestBrowser();
const searchRequest = page =>
  page.waitForRequest(request => request.url().startsWith('https://pncp.gov.br/api/search/?'));
try {
  for (const [width, colorScheme] of [
    [1280, 'light'],
    [390, 'dark']
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
    await routePncp(context);
    const page = await context.newPage(),
      errors = [],
      presetRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/assets\/search-presets-[\w-]+\.json$/.test(new URL(request.url()).pathname))
        presetRequests.push(request.url());
    });
    const url = `http://127.0.0.1:${app.server.address().port}/`;
    await page.goto(url);
    await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
    const open = async () => {
      await page.locator('#search-help-button').click();
      await page.locator('#search-help').waitFor();
    };
    // As listas de termos ficam fora do JavaScript inicial e só são baixadas ao abrir o painel.
    assert.equal(presetRequests.length, 0, 'Buscas prontas baixadas antes de abrir o painel');
    await open();
    await page.locator('#search-presets .search-library-name').first().waitFor();
    assert.equal(presetRequests.length, 1);
    const presets = page.locator('#search-presets .search-library-name');
    assert.equal(await presets.count(), 9);
    assert.equal(await presets.first().innerText(), 'Microsoft');
    assert.equal(
      await page.locator('#search-presets .search-library-note').first().innerText(),
      'Editais · 52 termos · 3 filtros'
    );
    assert.equal(await page.locator('#saved-searches-empty').isVisible(), true);
    // A busca pronta aplica texto e filtros e pesquisa na hora; o link guarda tudo.
    let request = searchRequest(page);
    await page.locator('#search-presets .search-library-choice').first().click();
    let params = new URL((await request).url()).searchParams;
    assert.equal(params.get('q').length, 693);
    assert.match(params.get('q'), /^microsoft OR m365 OR o365 OR /);
    assert.equal(params.get('tipos_item'), 'S');
    assert.equal(params.get('situacoes'), '1');
    assert.equal(params.get('situacoes_item'), '1|2');
    assert.equal(await page.locator('#search').inputValue(), params.get('q'));
    assert.equal(await page.locator('#filter-count').innerText(), '3');
    assert.equal(new URL(page.url()).searchParams.get('tipos_item'), 'S');
    assert.equal(await page.locator('#search-help').evaluate(node => node.matches(':popover-open')), false);
    // Salva a busca digitada (ainda não pesquisada), com o nome escolhido.
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
    await page.locator('#search').fill('firewall');
    await open();
    await page.locator('#save-search-name').fill('Firewall');
    await page.locator('#save-search-form button[type=submit]').click();
    assert.equal(await page.locator('#save-search-status').innerText(), 'Busca “Firewall” salva neste navegador.');
    assert.deepEqual(await page.locator('#saved-searches .search-library-name').allInnerTexts(), ['Firewall']);
    assert.equal(await page.locator('#saved-searches-empty').isVisible(), false);
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
    const audit = await new AxeBuilder({ page })
      .include('#search-help')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    assert.deepEqual(
      audit.violations.map(violation => violation.id),
      [],
      `axe em ${width}px`
    );
    // Depois de recarregar, a busca salva continua disponível e pesquisa ao ser escolhida.
    await page.goto(url);
    await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
    await open();
    request = searchRequest(page);
    await page.locator('#saved-searches .search-library-choice').click();
    params = new URL((await request).url()).searchParams;
    assert.equal(params.get('q'), 'firewall');
    await page.waitForFunction(() => document.querySelector('#result-title').textContent === '6 editais');
    await open();
    await page.locator('#saved-searches .search-library-remove').click();
    assert.equal(await page.locator('#saved-searches .search-library-choice').count(), 0);
    assert.equal(await page.locator('#save-search-status').innerText(), 'Busca “Firewall” removida.');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'save-search-name');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS Buscas prontas pesquisam com texto e filtros; buscas salvas persistem, pesquisam e são removidas');
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await browser.close();
  await app.close();
}
