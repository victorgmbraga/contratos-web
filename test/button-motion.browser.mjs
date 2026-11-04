import assert from 'node:assert/strict';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';

const app = createStaticServer(new URL('../dist-browser-test/', import.meta.url));
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const browser = await launchTestBrowser(),
  errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }),
    page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/');
  await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
  await page.evaluate(() => {
    const animate = SVGElement.prototype.animate;
    window.motionCalls = [];
    SVGElement.prototype.animate = function (...args) {
      const button = this.closest('button,a.repository-link');
      if (button)
        window.motionCalls.push({
          id: button.id,
          header: button.classList.contains('results-header-menu'),
          tag: this.tagName.toLowerCase(),
          path: this.getAttribute('d'),
          delay: args[1].delay,
          transforms: args[0].map(frame => frame.transform)
        });
      return animate.apply(this, args);
    };
  });
  const calls = id => page.evaluate(id => window.motionCalls.filter(call => call.id === id), id);
  async function hoverRefresh() {
    await page.mouse.move(0, 0);
    const before = await page.locator('#refresh-button').evaluate(node => {
      const rect = node.getBoundingClientRect(),
        style = getComputedStyle(node);
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        background: style.backgroundColor,
        transition: style.transitionProperty
      };
    });
    const count = (await calls('refresh-button')).length;
    await page.locator('#refresh-button').hover();
    await page.waitForFunction(
      color => getComputedStyle(document.querySelector('#refresh-button')).backgroundColor !== color,
      before.background
    );
    const after = await page.locator('#refresh-button').boundingBox(),
      recorded = await calls('refresh-button');
    assert.equal(recorded.length, count + 1, 'O hover deve iniciar uma animação, sem clique');
    assert.deepEqual(recorded.at(-1).transforms, ['rotate(0deg)', 'rotate(360deg)']);
    assert(
      Math.abs(before.x - after.x) < 0.1 &&
        Math.abs(before.y - after.y) < 0.1 &&
        Math.abs(before.width - after.width) < 0.1 &&
        Math.abs(before.height - after.height) < 0.1
    );
    assert(before.transition.includes('background-color') && before.transition.includes('color'));
  }
  await hoverRefresh();
  await page.locator('#theme-button').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await hoverRefresh();
  const hoverCount = (await calls('refresh-button')).length;
  await page.locator('#refresh-button').click();
  await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
  assert.equal((await calls('refresh-button')).length, hoverCount, 'O clique com mouse não reinicia a animação');

  await page.mouse.move(0, 0);
  await page.locator('#search-button').hover();
  let recorded = await calls('search-button');
  assert(recorded.at(-1).transforms.includes('translate(-2px,-1px)'), 'A lupa percorre a área de busca');
  await page.locator('#filters-button').hover();
  recorded = await calls('filters-button');
  assert.deepEqual(
    recorded.slice(-3).map(item => item.tag),
    ['path', 'path', 'path']
  );
  assert.deepEqual(
    recorded.slice(-3).map(item => item.delay),
    [0, 50, 100]
  );
  assert(recorded.at(-3).transforms.includes('translateX(2.5px)'));
  assert(recorded.at(-2).transforms.includes('translateX(-2.5px)'));
  await page.locator('.results-header-menu').first().hover();
  assert.equal(
    await page.evaluate(() => window.motionCalls.filter(item => item.header && item.tag === 'path').length),
    3,
    'O filtro da tabela usa o mesmo movimento em sequência'
  );
  await page.locator('#search').fill('firewall');
  await page.locator('#search').press('Enter');
  await page.waitForFunction(
    () => !document.querySelector('#refresh-button').disabled && !document.querySelector('#clear-button').hidden
  );
  await page.locator('#clear-button').hover();
  recorded = await calls('clear-button');
  assert.equal(recorded.at(-1).tag, 'path');
  assert(recorded.at(-1).transforms.includes('rotate(90deg)'));
  await page.locator('#export-button').hover();
  recorded = await calls('export-button');
  assert(recorded.at(-1).transforms.includes('translateY(3px)'));
  assert.equal(recorded.at(-1).tag, 'path');
  assert.match(recorded.at(-1).path, /^M12 3/);
  assert.equal(
    await page
      .locator('#export-button svg path')
      .nth(1)
      .evaluate(path => path.getAnimations().length),
    0,
    'A base do download permanece fixa'
  );
  const count = recorded.length,
    box = await page.locator('#export-button').boundingBox();
  await page.mouse.move(box.x + 2, box.y + 2);
  assert.equal((await calls('export-button')).length, count, 'Mover entre filhos do botão não reinicia o efeito');
  await page.locator('#theme-button').hover();
  recorded = await calls('theme-button');
  assert(recorded.some(item => item.tag === 'svg' && item.transforms.includes('rotate(-12deg)')));
  assert(recorded.some(item => item.tag === 'path' && item.transforms.includes('rotate(24deg) scale(1.12)')));
  await page.locator('#repository-link').hover();
  recorded = await calls('repository-link');
  assert(recorded.at(-1).transforms.includes('rotate(-12deg)'));
  await page.mouse.move(0, 0);
  await page.locator('#refresh-button').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'columns-button');
  recorded = await calls('columns-button');
  assert.equal(recorded.at(-1).tag, 'path');
  assert(recorded.at(-1).transforms.includes('scaleX(.55)'), 'O foco por teclado anima as divisórias');

  const disabled = await page.evaluate(() =>
    ['disabled', 'aria-disabled', 'aria-busy'].map(state => {
      const button = document.createElement('button');
      button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>';
      if (state === 'disabled') button.disabled = true;
      else button.setAttribute(state, 'true');
      document.body.append(button);
      button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
      const count = button.firstElementChild.getAnimations().length;
      button.remove();
      return count;
    })
  );
  assert.deepEqual(disabled, [0, 0, 0]);

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }),
    touchPage = await touchContext.newPage();
  touchPage.on('pageerror', error => errors.push(error.message));
  await touchPage.goto(origin + '/?q=pagina-ui');
  await touchPage.waitForFunction(() => {
    const next = document.querySelector('.results-paginator [data-page="next"]');
    return next && !next.disabled;
  });
  await touchPage.evaluate(() => {
    const original = document.querySelector('.results-paginator [data-page="next"]'),
      animate = SVGElement.prototype.animate;
    window.touchMotion = [];
    SVGElement.prototype.animate = function (...args) {
      const button = this.closest('button');
      if (button)
        window.touchMotion.push({
          id: button.id,
          page: button.dataset.page,
          tag: this.tagName.toLowerCase(),
          transforms: args[0].map(frame => frame.transform),
          replacement: button !== original,
          connected: button.isConnected
        });
      return animate.apply(this, args);
    };
  });
  await touchPage.locator('#more-actions-button').tap();
  assert.equal(
    await touchPage.evaluate(
      () => window.touchMotion.filter(item => item.id === 'more-actions-button' && item.tag === 'circle').length
    ),
    3,
    'O toque anima os três pontos'
  );
  await touchPage.keyboard.press('Escape');
  await touchPage.locator('.results-paginator [data-page="next"]').tap();
  await touchPage.waitForFunction(() =>
    window.touchMotion.some(item => item.page === 'next' && item.replacement && item.connected)
  );
  assert(
    await touchPage.evaluate(() =>
      window.touchMotion.some(item => item.page === 'next' && item.transforms.includes('translateX(3px)'))
    ),
    'A seta avança na direção da página'
  );
  await touchPage.waitForFunction(
    () => document.querySelector('.results-page.active')?.getAttribute('data-page') === '2'
  );
  assert.deepEqual(errors, []);
  console.log('PASS Ícones animam no hover e no foco; toque mantém feedback sem alterar a geometria dos botões');
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await browser.close();
  await app.close();
}
