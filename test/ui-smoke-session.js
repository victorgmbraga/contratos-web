// Sessão compartilhada das partes do teste de interface (ui-smoke-*.mjs): servidor estático,
// navegador, observação das mensagens ao Worker e auxiliares. Cada parte abre uma página nova.
import { openAllFilters } from './filter-layout.js';
import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-launch.js';
import { defaults } from '../src/settings.js';
import { createStaticServer } from './static-server.js';
import { schema } from '../src/schema.js';

export async function startUiSession() {
  const config = { ...defaults, PNCP_REQUESTS_PER_SECOND: 100000 };
  const app = createStaticServer(new URL('../dist-browser-test/', import.meta.url));
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const browser = await launchTestBrowser(),
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage(),
    errors = [],
    checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const serviceEvent = 'service';
  const initialDomains = [];
  page.on(serviceEvent, message => {
    if (message.method === 'domains') initialDomains.push(message.payload);
  });
  const localApiRequests = [];
  page.on('request', r => {
    if (new URL(r.url()).pathname.startsWith('/api/')) localApiRequests.push(r.url());
  });
  {
    await page.exposeFunction('__observeService', message => page.emit('service', message));
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        postMessage(message, ...args) {
          window.__observeService(message);
          return super.postMessage(message, ...args);
        }
      };
    });
  }
  function waitQuery(predicate) {
    const pending = page
      .waitForEvent('service', { predicate: m => m.method === 'execute' && predicate(m.payload.query) })
      .then(m => m.payload.query);
    // A falha da espera não deve interromper o diagnóstico caso o clique também expire.
    pending.catch(() => {});
    return pending;
  }
  const check = name => {
    checks.push(name);
    console.log('PASS ' + name);
  };
  async function search(text) {
    await page.locator('#search').fill(text);
    await page.locator('#search-button').click();
  }
  async function exportCsv(scope = 'all') {
    await page.locator('#export-button').click();
    await page.locator('#export-menu').waitFor({ state: 'visible' });
    await page.locator(scope === 'page' ? '#export-page-button' : '#export-all-button').click();
  }
  const filter = name => page.locator(`#filter-${name}`);
  async function selectFilterOptions(name, values) {
    for (const value of Array.isArray(values) ? values : [values]) {
      await filter(name).click();
      await page.locator(`#filter-suggestions-${name} .suggestion[data-value=${JSON.stringify(value)}]`).click();
    }
  }
  async function assertFilterCatalog(type) {
    const catalog = schema(config);
    const caps = catalog.capabilities.filter(c => !c.reserved && c.state === 'enabled' && c.documents.includes(type));
    const before = page.url();
    await openAllFilters(page);
    assert.equal(await page.locator('#add-native, #native-field, #filters-dialog select[multiple]').count(), 0);
    assert.equal(await page.locator('#filter-groups .filter-field').count(), caps.length);
    const controls = await page.locator('#filter-groups .filter-field').evaluateAll(fields =>
      fields.map(field => {
        const input = field.querySelector('input,select');
        return {
          name: field.id.slice('filter-field-'.length),
          tag: input.tagName,
          type: input.type,
          role: input.getAttribute('role')
        };
      })
    );
    assert.deepEqual(controls.map(control => control.name).sort(), caps.map(cap => cap.name).sort());
    for (const cap of caps) {
      const control = controls.find(control => control.name === cap.name);
      if (cap.domain && cap.cardinality === 'multiple')
        assert.deepEqual(control, { name: cap.name, tag: 'INPUT', type: 'search', role: 'combobox' });
      else if (cap.domain || cap.type === 'boolean') assert.equal(control.tag, 'SELECT', cap.name);
      else
        assert.equal(control.type, cap.type === 'date' ? 'date' : cap.type === 'integer' ? 'number' : 'text', cap.name);
    }
    await page.locator('#filters-dialog .dialog-header .close-dialog').click();
    assert.equal(page.url(), before);
    return caps.length;
  }
  async function assertRepresentativeFilters() {
    if (await page.locator('#clear-button').isVisible()) await page.locator('#clear-button').click();
    await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
    await openAllFilters(page);
    await selectFilterOptions('ufs', 'DF');
    await filter('tipos_item').selectOption('S');
    await filter('srp').selectOption('false');
    await filter('data_publicacao_inicio').fill('2026-01-01');
    // Valores monetários usam o padrão brasileiro no campo e o decimal com ponto na API.
    await filter('valor_total_estimado_min').fill('R$ 1.234,56');
    await filter('ordem_classificacao_min').fill('0');
    await filter('codigo_ibge').fill('5300108');
    const request = waitQuery(input => input.pncp_filters.tipos_item === 'S');
    await page.locator('#apply-filters').click();
    assert.deepEqual((await request).pncp_filters, {
      ufs: ['DF'],
      tipos_item: 'S',
      srp: false,
      data_publicacao_inicio: '2026-01-01',
      valor_total_estimado_min: '1234.56',
      ordem_classificacao_min: 0,
      codigo_ibge: '5300108'
    });
    await page.waitForFunction(() => document.querySelector('#table-loader').hidden);
    await page.locator('#clear-button').click();
    await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
    check('Controles múltiplo, enum, booleano, data, decimal, inteiro e identificador enviam os tipos esperados');
  }
  async function finish() {
    assert.deepEqual(localApiRequests, []);
    check('Distribuição estática executa todas as ações sem API local');
    assert.deepEqual(errors, []);
    check('Sem erros JavaScript não tratados');
    console.log(JSON.stringify({ checks: checks.length, passed: checks, errors }));
  }
  async function close() {
    await browser.close();
    await app.close();
  }
  return {
    config,
    app,
    browser,
    context,
    page,
    errors,
    checks,
    serviceEvent,
    initialDomains,
    localApiRequests,
    waitQuery,
    check,
    search,
    exportCsv,
    filter,
    selectFilterOptions,
    assertFilterCatalog,
    assertRepresentativeFilters,
    finish,
    close
  };
}
