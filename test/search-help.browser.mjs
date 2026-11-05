import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';
import { routePncp } from './pncp-route.js';

// Dicas de busca: operadores do PNCP, exemplos que preenchem o campo, teclado e acessibilidade.
const app = createStaticServer(new URL('../dist-browser/', import.meta.url));
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const browser = await launchTestBrowser();
try {
  for (const [width, colorScheme] of [
    [1280, 'light'],
    [390, 'dark']
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme });
    const pncp = [];
    await routePncp(context, pncp);
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${app.server.address().port}/`);
    await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
    const trigger = page.locator('#search-help-button'),
      panel = page.locator('#search-help'),
      search = page.locator('#search');
    // O campo mantém o rótulo e descreve os operadores para leitores de tela.
    assert.equal(await search.evaluate(node => node.labels[0].textContent.trim()), 'Busca textual no PNCP');
    assert.match(await page.locator('#search-help-summary').textContent(), /OR em maiúsculas/);
    const field = await page.locator('.search-field').boundingBox(),
      button = await trigger.boundingBox();
    assert(button.x + button.width <= field.x + field.width, 'Botão dentro do campo');
    assert(Math.abs(button.y + button.height / 2 - (field.y + field.height / 2)) <= 1, 'Botão centralizado no campo');
    await trigger.click();
    await panel.waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    const box = await panel.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width, `Painel cabe na tela em ${width}px`);
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
    const audit = await new AxeBuilder({ page })
      .include('#search-help')
      .include('.search-field')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    assert.deepEqual(
      audit.violations.map(violation => violation.id),
      []
    );
    assert.deepEqual(await page.locator('.search-help-example').allInnerTexts(), [
      'microsoft office',
      'microsoft OR o365 OR office',
      'office NOT microsoft',
      '"microsoft office"'
    ]);
    // A lista de campos pesquisados pelo PNCP fica recolhida e abre pelo teclado.
    const fields = page.locator('.search-help-fields');
    assert.equal(await fields.getAttribute('open'), null);
    await fields.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await fields.getAttribute('open'), '');
    const items = await fields.locator('li').allInnerTexts();
    assert.equal(items.length, 11);
    assert(items.includes('Descrição ou informação complementar dos itens'));
    const open = await panel.boundingBox();
    assert(
      open.y + open.height <= (await page.evaluate(() => innerHeight)) + 1,
      'Painel aberto cabe na altura da tela'
    );
    const contrast = await new AxeBuilder({ page }).include('#search-help').withTags(['wcag2aa']).analyze();
    assert.deepEqual(
      contrast.violations.map(violation => violation.id),
      []
    );
    // Escape fecha e devolve o foco ao botão.
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () =>
        !document.querySelector('#search-help').matches(':popover-open') &&
        document.querySelector('#search-help-button').getAttribute('aria-expanded') === 'false'
    );
    assert.equal(await page.evaluate(() => document.activeElement.id), 'search-help-button');
    // O exemplo preenche a busca sem pesquisar; Enter confirma e o texto vai ao PNCP como digitado.
    await trigger.click();
    // Só pesquisas contam: a pré-carga das listas de filtros pode continuar em segundo plano.
    const searches = () => pncp.filter(url => url.startsWith('https://pncp.gov.br/api/search/?')).length;
    const before = searches();
    await page.locator('.search-help-example', { hasText: 'microsoft OR o365 OR office' }).click();
    await page.waitForFunction(() => !document.querySelector('#search-help').matches(':popover-open'));
    assert.equal(await search.inputValue(), 'microsoft OR o365 OR office');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'search');
    assert.equal(searches(), before, 'Escolher um exemplo não pesquisa');
    const request = page.waitForRequest(r => r.url().startsWith('https://pncp.gov.br/api/search/?'));
    await page.keyboard.press('Enter');
    assert.equal(new URL((await request).url()).searchParams.get('q'), 'microsoft OR o365 OR office');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS Dicas de busca explicam OR, NOT e aspas, preenchem a busca e passam no axe em 1280 e 390 px');
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await browser.close();
  await app.close();
}
