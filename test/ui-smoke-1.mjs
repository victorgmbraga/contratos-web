// Teste de interface contra o artefato estático, parte 1 de 3: inicialização, cabeçalho, filtros, URLs e paginação. Ver docs/validacao.md.
import { openAllFilters } from './filter-layout.js';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FILTER_OPTIONS_PREFIX, FILTER_OPTIONS_TTL } from '../src/browser/filter-options-cache.js';
import { assertHeaderControls } from './header-controls.js';
import { startUiSession } from './ui-smoke-session.js';

const session = await startUiSession();
const { app, context, page, errors, initialDomains, waitQuery, check, search, exportCsv, filter } = session;
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.results-table'));
  assert.equal(await page.locator('#source-badge').count(), 0);
  check('Interface disponível sem aviso de demonstração');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  check('Pesquisa inicial sem filtros executada automaticamente');
  const filtersButton = page.locator('#filters-button'),
    filtersTooltip = page.locator('#filters-button-tooltip');
  async function closeAndWait(selector, action) {
    await page.evaluate(selector => {
      window.dialogClosed = false;
      document.querySelector(selector).addEventListener(
        'close',
        () => {
          window.dialogClosed = true;
        },
        { once: true }
      );
    }, selector);
    await action();
    await page.waitForFunction(() => window.dialogClosed, undefined, { timeout: 5000 });
  }
  await page.mouse.move(0, 0);
  // Busca → Dicas de busca → Pesquisar → Filtros.
  await page.locator('#search').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'filters-button');
  await filtersTooltip.waitFor({ state: 'visible' });
  await page.keyboard.press('Enter');
  await page.locator('#filters-dialog').waitFor({ state: 'visible' });
  assert.equal(await filtersTooltip.isVisible(), false);
  await closeAndWait('#filters-dialog', () => page.keyboard.press('Escape'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'filters-button');
  assert.equal(await filtersTooltip.isVisible(), false, 'O foco restaurado ao fechar não deve reabrir o tooltip');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await filtersTooltip.waitFor({ state: 'visible' });
  await page.keyboard.press('Enter');
  await page.locator('#filters-dialog').waitFor({ state: 'visible' });
  await closeAndWait('#filters-dialog', () => page.locator('#filters-dialog .dialog-header .close-dialog').click());
  assert.equal(await filtersTooltip.isVisible(), false);
  await page.mouse.move(0, 0);
  await filtersButton.hover();
  await filtersTooltip.waitFor({ state: 'visible' });
  await filtersButton.click();
  await page.locator('#filters-dialog').waitFor({ state: 'visible' });
  await closeAndWait('#filters-dialog', () => page.keyboard.press('Escape'));
  await page.waitForTimeout(250);
  assert.equal(await filtersTooltip.isVisible(), false, 'O tooltip permanece oculto com o ponteiro sobre o botão');
  await page.mouse.move(0, 0);
  await filtersButton.hover();
  await filtersTooltip.waitFor({ state: 'visible' });
  await filtersButton.click();
  await page.locator('#filters-dialog').waitFor({ state: 'visible' });
  await closeAndWait('#filters-dialog', () => page.locator('#apply-filters').click());
  assert.equal(await filtersTooltip.isVisible(), false);
  await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
  const ufFilter = page.getByRole('button', { name: 'Filtrar UF', exact: true }),
    ufTooltip = page.locator('#' + (await ufFilter.getAttribute('aria-describedby')));
  await ufFilter.focus();
  await ufTooltip.waitFor({ state: 'visible' });
  await ufFilter.press('Enter');
  await page.locator('#filters-dialog').waitFor({ state: 'visible' });
  await closeAndWait('#filters-dialog', () => page.locator('#filters-dialog .dialog-header .close-dialog').click());
  assert.equal(await ufTooltip.isVisible(), false, 'O tooltip do filtro de coluna também deve ser ocultado');
  await page.mouse.move(0, 0);
  await ufFilter.hover();
  await ufTooltip.waitFor({ state: 'visible' });
  await ufFilter.click();
  await page.locator('#filters-dialog').waitFor({ state: 'visible' });
  await closeAndWait('#filters-dialog', () => page.locator('#filters-dialog').evaluate(dialog => dialog.close()));
  await page.waitForTimeout(250);
  assert.equal(await ufTooltip.isVisible(), false, 'O tooltip da coluna permanece oculto com o ponteiro sobre o botão');
  await page.mouse.move(0, 0);
  await ufFilter.hover();
  await ufTooltip.waitFor({ state: 'visible' });
  await page.mouse.move(0, 0);
  check('Fechar ou aplicar filtros oculta os tooltips e preserva o foco e a próxima interação');
  await assertHeaderControls(page);
  check('Ações do cabeçalho têm nomes acessíveis, ícones, tooltips e menu de exportação operante');
  await page.waitForFunction(
    prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length === 8,
    FILTER_OPTIONS_PREFIX
  );
  assert.equal(initialDomains.length, 8);
  assert.deepEqual(
    initialDomains.filter(payload => payload.field === null).map(payload => payload.type),
    ['edital', 'ata', 'contrato']
  );
  const storedOptions = await page.evaluate(
    prefix =>
      Object.keys(localStorage)
        .filter(key => key.startsWith(prefix))
        .map(key => JSON.parse(localStorage.getItem(key))),
    FILTER_OPTIONS_PREFIX
  );
  for (const entry of storedOptions) {
    assert.equal(entry.expires_at - entry.fetched_at, FILTER_OPTIONS_TTL);
    assert(!Object.hasOwn(entry.value, 'raw'));
  }
  for (let i = 0; i < 2; i++) {
    await openAllFilters(page);
    await filter('ufs').waitFor();
    assert.equal(await page.locator('#filter-search').inputValue(), '');
    await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  }
  assert.equal(initialDomains.length, 8);
  check('Inicialização pré-carrega e persiste as opções dos três tipos; reabrir filtros não consulta a fonte');
  for (const [type, title] of [
    ['edital', '64 editais'],
    ['ata', '24 atas'],
    ['contrato', '32 contratos']
  ]) {
    await page.locator('#document-type').selectOption(type);
    await page.waitForFunction(expected => document.querySelector('#result-title').textContent === expected, title);
    const ufButton = page.getByRole('button', { name: 'Filtrar UF', exact: true });
    assert.equal(await ufButton.getAttribute('aria-haspopup'), null);
    assert.equal(await ufButton.getAttribute('title'), null);
    await ufButton.hover();
    const tooltip = page.locator('#' + (await ufButton.getAttribute('aria-describedby')));
    await tooltip.waitFor({ state: 'visible' });
    assert.equal(await tooltip.innerText(), 'Filtrar por esta coluna');
    assert.equal(await page.getByRole('menu').count(), 0);
    await page.locator('#filters-dialog').waitFor({ state: 'hidden' });
    await ufButton.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'filter-ufs');
    assert.equal(await tooltip.isVisible(), false);
    await page.locator('#filter-suggestions-ufs .suggestion[data-value="DF"]').click();
    let applied = waitQuery(query => query.document_type === type && query.pncp_filters.ufs?.[0] === 'DF');
    await page.locator('#apply-filters').click();
    await applied;
    await page.waitForFunction(() => !document.querySelector('#export-button').disabled);
    assert.equal(new URL(page.url()).searchParams.get('ufs'), 'DF');
    await page.getByRole('button', { name: 'Filtrar Publicação', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Filtrar por esta coluna', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'filter-data_publicacao_inicio');
    await filter('data_publicacao_inicio').fill('2026-01-01');
    applied = waitQuery(
      query =>
        query.document_type === type &&
        query.pncp_filters.data_publicacao_inicio === '2026-01-01' &&
        query.pncp_filters.ufs?.[0] === 'DF'
    );
    await page.locator('#apply-filters').click();
    await applied;
    await page.waitForFunction(() => !document.querySelector('#export-button').disabled);
    assert.equal(new URL(page.url()).searchParams.get('data_publicacao_inicio'), '2026-01-01');
    await page.locator('#clear-button').click();
    await page.waitForFunction(expected => document.querySelector('#result-title').textContent === expected, title);
  }
  await page.locator('#document-type').selectOption('edital');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  check('Ícone filtra diretamente com tooltip nos três tipos; publicação conserva menu de filtros e ordenação');
  await openAllFilters(page);
  const closedSuggestions = [],
    observeClosed = message => {
      if (message.method === 'suggest') closedSuggestions.push(message.payload);
    };
  page.on('service', observeClosed);
  const unchangedQuery = page.url();
  await filter('modalidades').fill('eletronico');
  assert.equal(await page.locator('#filter-suggestions-modalidades .suggestion').count(), 1);
  await filter('modalidades').press('ArrowDown');
  await filter('modalidades').press('Enter');
  assert.equal(await page.locator('#filter-selected-modalidades .selected-option').count(), 1);
  assert.equal(await page.locator('#filter-suggestions-modalidades .suggestion').getAttribute('aria-selected'), 'true');
  await filter('modalidades').press('Enter');
  assert.equal(await page.locator('#filter-selected-modalidades .selected-option').count(), 0);
  await filter('modalidades').press('Escape');
  assert.equal(await filter('modalidades').getAttribute('aria-expanded'), 'false');
  assert(await page.locator('#filters-dialog').isVisible());
  await filter('modalidades').fill('');
  for (const option of await page.locator('#filter-suggestions-modalidades .suggestion').all()) await option.click();
  assert.equal(await page.locator('#filter-selected-modalidades .selected-option').count(), 2);
  assert.equal(page.url(), unchangedQuery);
  assert.deepEqual(closedSuggestions, []);
  page.off('service', observeClosed);
  await page.locator('#filters-title').click();
  assert.equal(await filter('modalidades').getAttribute('aria-expanded'), 'false');
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  check(
    'Filtros múltiplos usam busca local sem acentos, escolhas por teclado e marcações independentes; Escape fecha apenas as opções'
  );
  await openAllFilters(page);
  const beforeDraft = page.url();
  const orgSuggestion = page.waitForEvent('service', {
    predicate: message => message.method === 'suggest' && message.payload.field === 'orgaos'
  });
  const unitSuggestion = page.waitForEvent('service', {
    predicate: message => message.method === 'suggest' && message.payload.field === 'unidades'
  });
  await filter('orgaos').fill('Ministério');
  await filter('unidades').fill('Unidade');
  await Promise.all([orgSuggestion, unitSuggestion]);
  await filter('orgaos').click();
  await page.locator('#filter-suggestions-orgaos .suggestion').first().click();
  await filter('unidades').click();
  await page.locator('#filter-suggestions-unidades .suggestion').first().click();
  assert.equal(await page.locator('#filter-selected-orgaos .selected-option').count(), 1);
  assert.equal(await page.locator('#filter-selected-unidades .selected-option').count(), 1);
  await page.locator('#filter-selected-orgaos .selected-option').click();
  assert.equal(await page.locator('#filter-selected-orgaos .selected-option').count(), 0);
  assert.equal(await page.locator('#filter-selected-unidades .selected-option').count(), 1);
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  assert.equal(page.url(), beforeDraft);
  await openAllFilters(page);
  assert.equal(await page.locator('.selected-option').count(), 0);
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  check('Sugestões simultâneas de órgão e unidade são independentes; cancelar descarta seleções sem alterar a URL');
  const cachedPage = await page.context().newPage(),
    cachedDomains = [];
  try {
    cachedPage.on('pageerror', error => errors.push(error.message));
    await cachedPage.exposeFunction('__observeCachedDomains', message => {
      if (message.method === 'domains') cachedDomains.push(message.payload);
    });
    await cachedPage.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        postMessage(message, ...args) {
          window.__observeCachedDomains(message);
          return super.postMessage(message, ...args);
        }
      };
    });
    await cachedPage.goto(page.url(), { waitUntil: 'load' });
    await cachedPage.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
    for (const [type, title] of [
      ['edital', '64 editais'],
      ['ata', '24 atas'],
      ['contrato', '32 contratos']
    ]) {
      await cachedPage.locator('#document-type').selectOption(type);
      await cachedPage.waitForFunction(
        expected => document.querySelector('#result-title').textContent === expected,
        title
      );
      await cachedPage.locator('#filters-button').click();
      await cachedPage.locator('#filter-ufs').waitFor();
      await cachedPage.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
    }
    assert.equal(cachedDomains.length, 0);
    check('Nova página reutiliza localStorage para filtros de edital, ata e contrato');
    await cachedPage.evaluate(
      ({ prefix, ttl }) => {
        localStorage.setItem('filter-cache-test-preference', 'preservar');
        for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix))) {
          const entry = JSON.parse(localStorage.getItem(key));
          entry.fetched_at = Date.now() - ttl;
          entry.expires_at = entry.fetched_at + ttl;
          localStorage.setItem(key, JSON.stringify(entry));
        }
      },
      { prefix: FILTER_OPTIONS_PREFIX, ttl: FILTER_OPTIONS_TTL }
    );
    await cachedPage.reload({ waitUntil: 'load' });
    await cachedPage.waitForFunction(
      prefix =>
        Object.keys(localStorage).filter(key => key.startsWith(prefix)).length === 8 &&
        Object.keys(localStorage)
          .filter(key => key.startsWith(prefix))
          .every(key => JSON.parse(localStorage.getItem(key)).expires_at > Date.now()),
      FILTER_OPTIONS_PREFIX
    );
    await cachedPage.waitForFunction(() => document.querySelector('#result-title').textContent === '32 contratos');
    assert.equal(cachedDomains.length, 8);
    assert.equal(await cachedPage.evaluate(() => localStorage.getItem('filter-cache-test-preference')), 'preservar');
    check('Listas vencidas há quatro horas são renovadas sem apagar dados alheios');
  } catch (error) {
    await diagnoseBrowserFailure(error);
    throw error;
  } finally {
    await cachedPage.close();
  }
  const sharedPage = await page.context().newPage(),
    sharedQueries = [];
  try {
    sharedPage.on('pageerror', error => errors.push(error.message));
    await sharedPage.exposeFunction('__observeSharedQuery', message => {
      if (message.method === 'execute') sharedQueries.push(message.payload.query);
    });
    await sharedPage.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        postMessage(message, ...args) {
          window.__observeSharedQuery(message);
          return super.postMessage(message, ...args);
        }
      };
    });
    const sharedBase = `http://127.0.0.1:${app.server.address().port}/`;
    await sharedPage.goto(
      sharedBase +
        '?tipos_documento=edital&q=pagina-ui&ordenacao=data&pagina=2&ufs=SP%7CDF&srp=false&ordem_classificacao_min=0&item_quantidade_min=0.00#resultados'
    );
    const waitSecond = () =>
      sharedPage.waitForFunction(
        () =>
          document.querySelector('.results-page.active')?.dataset.page === '2' &&
          /101\s*[-–]\s*164/.test(document.querySelector('.results-page-counter')?.textContent || '') &&
          !document.querySelector('#refresh-button').disabled
      );
    await waitSecond();
    assert.equal(sharedQueries.length, 1);
    assert.equal(sharedQueries[0].page, 2);
    assert.equal(sharedQueries[0].order, 'data');
    assert.deepEqual(sharedQueries[0].pncp_filters, {
      ufs: ['SP', 'DF'],
      srp: false,
      ordem_classificacao_min: 0,
      item_quantidade_min: '0.00'
    });
    assert.equal(await sharedPage.locator('#search').inputValue(), 'pagina-ui');
    assert.equal(new URL(sharedPage.url()).hash, '#resultados');
    check('Link compartilhado restaura critérios tipados e abre diretamente a segunda página');
    const sharedLink = sharedPage.url();
    await sharedPage.reload();
    await waitSecond();
    assert.equal(sharedQueries.length, 2);
    assert.equal(sharedPage.url(), sharedLink);
    check('Recarregar mantém busca, filtros, ordenação e página da URL');
    await sharedPage.locator('#order').selectOption('-data');
    await sharedPage.waitForFunction(
      () =>
        document.querySelector('.results-page.active')?.dataset.page === '1' &&
        !document.querySelector('#refresh-button').disabled
    );
    assert.equal(new URL(sharedPage.url()).searchParams.get('pagina'), '1');
    await sharedPage.goBack();
    await waitSecond();
    assert.equal(await sharedPage.locator('#order').inputValue(), 'data');
    assert.equal(sharedPage.url(), sharedLink);
    await sharedPage.goForward();
    await sharedPage.waitForFunction(
      () =>
        document.querySelector('.results-page.active')?.dataset.page === '1' &&
        !document.querySelector('#refresh-button').disabled
    );
    assert.equal(await sharedPage.locator('#order').inputValue(), '-data');
    check('Voltar e Avançar restauram a página e a ordenação sem recarregar a aplicação');
    await sharedPage.locator('#document-type').selectOption('contrato');
    await sharedPage.waitForFunction(() => document.querySelector('#result-title').textContent === '32 contratos');
    assert.equal(new URL(sharedPage.url()).searchParams.get('tipos_documento'), 'contrato');
    assert.equal(new URL(sharedPage.url()).searchParams.has('srp'), false);
    await sharedPage.locator('#status').selectOption('vigente');
    await openAllFilters(sharedPage);
    await sharedPage.locator(`#filter-${'possui_nfe'}`).selectOption('false');
    await sharedPage.locator('#apply-filters').click();
    await sharedPage.waitForFunction(() => !document.querySelector('#export-button').disabled);
    assert.equal(new URL(sharedPage.url()).searchParams.get('possui_nfe'), 'false');
    assert.equal(new URL(sharedPage.url()).searchParams.get('status'), 'vigente');
    const contractLink = sharedPage.url(),
      contractResult = await sharedPage.locator('#result-title').innerText();
    await sharedPage.reload();
    await sharedPage.waitForFunction(
      expected => document.querySelector('#result-title').textContent === expected,
      contractResult
    );
    assert.equal(await sharedPage.locator('#document-type').inputValue(), 'contrato');
    assert(await sharedPage.locator('.results-col[data-field="valor_global"]').isVisible());
    assert.equal(sharedQueries.at(-1).pncp_filters.possui_nfe, false);
    check('URL de contrato restaura status e filtro Não, com as colunas próprias');
    await sharedPage.locator('#document-type').selectOption('ata');
    await sharedPage.waitForFunction(() => document.querySelector('#result-title').textContent === '24 atas');
    assert.equal(new URL(sharedPage.url()).searchParams.get('tipos_documento'), 'ata');
    await sharedPage.goBack();
    await sharedPage.waitForFunction(
      expected => document.querySelector('#result-title').textContent === expected,
      contractResult
    );
    assert.equal(sharedPage.url(), contractLink);
    await sharedPage.goForward();
    await sharedPage.waitForFunction(() => document.querySelector('#result-title').textContent === '24 atas');
    await sharedPage.reload();
    await sharedPage.waitForFunction(() => document.querySelector('#result-title').textContent === '24 atas');
    check('Links e histórico também restauram atas e alternam corretamente entre tipos');
    const beforeInvalid = sharedQueries.length;
    await sharedPage.goto(sharedBase + '?pagina=101&q=firewall');
    await sharedPage.waitForFunction(() =>
      document.querySelector('#notice').textContent.includes('Parâmetros inválidos na URL')
    );
    assert.equal(sharedQueries.length, beforeInvalid);
    assert.equal(new URL(sharedPage.url()).searchParams.get('pagina'), '101');
    await sharedPage.locator('#clear-button').click();
    await sharedPage.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
    assert.equal(new URL(sharedPage.url()).searchParams.get('pagina'), '1');
    check('Parâmetros inválidos são exibidos sem pesquisa automática e podem ser corrigidos pela interface');
  } catch (error) {
    await diagnoseBrowserFailure(error);
    throw error;
  } finally {
    await sharedPage.close();
  }
  const orderedPage = await context.newPage();
  try {
    const expectedOrders = {
      edital: ['-data', 'data', 'relevancia', 'numero_controle_pncp', '-valor_total_estimado'],
      ata: ['-data', 'data', 'relevancia', 'valor', '-valor'],
      contrato: [
        '-data',
        'data',
        'relevancia',
        'numero_contratacao',
        'numero_controle_pncp',
        'data_inicio_vigencia',
        'valor_global'
      ]
    };
    await orderedPage.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__orderRequests = [];
      window.Worker = class extends NativeWorker {
        postMessage(message, ...args) {
          if (message.method === 'execute') window.__orderRequests.push(message.payload.query);
          return super.postMessage(message, ...args);
        }
      };
    });
    const orderedBase = `http://127.0.0.1:${app.server.address().port}/`;
    const waitOrdered = (type, order) =>
      orderedPage.waitForFunction(
        ({ type, order }) =>
          window.__orderRequests.at(-1)?.document_type === type &&
          window.__orderRequests.at(-1)?.order === order &&
          !document.querySelector('#export-button').disabled,
        { type, order }
      );
    await orderedPage.goto(orderedBase + '');
    await waitOrdered('edital', '-data');
    for (const [type, orders] of Object.entries(expectedOrders)) {
      if (type !== 'edital') {
        await orderedPage.locator('#document-type').selectOption(type);
        await waitOrdered(type, '-data');
      }
      assert.deepEqual(
        await orderedPage.locator('#order option').evaluateAll(options => options.map(option => option.value)),
        orders
      );
      assert.equal(await orderedPage.locator('#order').inputValue(), '-data');
      for (const order of ['relevancia', ...orders.slice(3)]) {
        await orderedPage.locator('#order').selectOption(order);
        await waitOrdered(type, order);
        assert.equal(new URL(orderedPage.url()).searchParams.get('ordenacao'), order);
        assert.equal(new URL(orderedPage.url()).searchParams.get('pagina'), '1');
        const href = orderedPage.url();
        await orderedPage.reload();
        await waitOrdered(type, order);
        assert.equal(await orderedPage.locator('#order').inputValue(), order);
        assert.equal(orderedPage.url(), href);
      }
    }
    check('Relevância sem texto e oito opções adicionais acompanham o tipo, o Worker, a URL e o recarregamento');
    await orderedPage.goto(orderedBase + '?tipos_documento=ata&ordenacao=valor_global');
    await orderedPage.waitForFunction(() =>
      document.querySelector('#notice').textContent.includes('Ordenação não disponível')
    );
    assert.equal(await orderedPage.evaluate(() => window.__orderRequests.length), 0);
    check('Link com ordenação incompatível é rejeitado antes de consultar o PNCP');
  } catch (error) {
    await diagnoseBrowserFailure(error);
    throw error;
  } finally {
    await orderedPage.close();
  }
  assert.equal(await page.locator('.results-page-size').count(), 0);
  check('Seletor de linhas removido');
  assert.equal(await page.locator('#app-header .header-toolbar .criteria-row').count(), 1);
  for (const id of [
    'order',
    'clear-button',
    'cancel-button',
    'retry-button',
    'refresh-button',
    'columns-button',
    'export-button',
    'repository-link'
  ])
    assert.equal(await page.locator(`#app-header #${id}`).count(), 1);
  assert.deepEqual(
    await page
      .locator('.header-toolbar > .result-actions')
      .first()
      .evaluate(node => [...node.querySelectorAll('button')].map(button => button.id)),
    ['refresh-button', 'columns-button', 'export-button', 'theme-button']
  );
  assert.equal(await page.locator('.results-footer .repository-link').count(), 0);
  for (const [id, label, accessibleLabel = label] of [
    ['search-button', 'Pesquisar'],
    ['filters-button', 'Filtros'],
    ['refresh-button', 'Atualizar resultados'],
    ['columns-button', 'Selecionar colunas'],
    ['export-button', 'Exportar'],
    ['repository-link', 'Repositório no GitHub', 'Repositório do Contratos Web no GitHub (abre em nova aba)']
  ]) {
    const button = page.locator(`#${id}`),
      tooltip = page.locator(`#${id}-tooltip`);
    assert.equal(await button.getAttribute('aria-label'), accessibleLabel);
    assert.equal(await button.getAttribute('title'), null);
    assert.equal(await button.locator('svg').count(), 1);
    assert.equal(await button.locator('span:not(.count-badge)').count(), 0);
    // O tooltip repete o nome acessível e não é anunciado novamente como descrição.
    assert.equal(await button.getAttribute('aria-describedby'), null);
    await button.hover();
    await tooltip.waitFor({ state: 'visible' });
    assert.equal(await tooltip.innerText(), label);
    const style = await tooltip.evaluate(node => {
      const css = getComputedStyle(node);
      return { background: css.backgroundColor, color: css.color, border: css.borderColor };
    });
    assert.deepEqual(style, {
      background: 'rgb(255, 255, 255)',
      color: 'rgb(19, 61, 104)',
      border: 'rgb(220, 228, 237)'
    });
    const box = await tooltip.boundingBox();
    assert(box.x >= 8 && box.x + box.width <= page.viewportSize().width - 8);
    assert(box.y >= 8 && box.y + box.height <= page.viewportSize().height - 8);
    await page.mouse.move(0, 0);
    await tooltip.waitFor({ state: 'hidden' });
    await button.focus();
    await tooltip.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await tooltip.waitFor({ state: 'hidden' });
    await page.locator('#search').focus();
  }
  check('Ações do cabeçalho e link do GitHub usam tooltips neutros com mouse, foco e Escape');
  await page.locator('#export-button').click();
  await page.locator('#export-menu').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#export-button').getAttribute('aria-expanded') === 'true');
  assert.deepEqual(
    await page.locator('#export-menu [role="menuitem"]').evaluateAll(nodes => nodes.map(node => node.id)),
    ['export-all-button', 'export-page-button']
  );
  await page.waitForFunction(() => document.activeElement.id === 'export-all-button');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'export-page-button');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'export-all-button');
  await page.keyboard.press('Escape');
  await page.locator('#export-menu').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#export-button').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'export-button');
  await page.keyboard.press('ArrowDown');
  await page.locator('#export-menu').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement.id === 'export-all-button');
  await page.keyboard.press('Escape');
  check('Menu Exportar reúne consulta completa e página atual com teclado');
  assert.equal(await page.locator('.result-toolbar').count(), 0);
  assert.equal(await page.locator('.results-footer .result-info').count(), 1);
  const popupFields = await page
    .locator('.results-header-menu')
    .evaluateAll(buttons => buttons.map(button => button.closest('.results-col')?.getAttribute('data-field')));
  assert(!popupFields.includes('titulo'));
  assert(!popupFields.includes('objeto_compra'));
  assert(!popupFields.includes('data_atualizacao_pncp'));
  assert(popupFields.includes('orgao_nome'));
  assert.equal(await page.locator('.results-header-menu .header-filter-icon').count(), popupFields.length);
  for (const field of ['orgao_nome', 'uf', 'data_publicacao_pncp']) {
    const title = page.locator(`.results-col[data-field="${field}"] .results-col-title`);
    assert.equal(
      await title.locator('.results-header-menu').evaluate(node => node === node.parentElement.lastElementChild),
      true
    );
  }
  assert.equal(await page.locator('.source-footer').count(), 0);
  check('Ordenação e ações no cabeçalho, informações no rodapé da tabela');
  await search('janela-ui');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '4.143.240 editais');
  assert.match(await page.locator('.results-page-counter').innerText(), /Exibindo 1-100 de\s+4\.143\.240 editais/);
  assert.equal(await page.locator('#notice').isVisible(), false);
  assert(await page.locator('#window-warning').isVisible());
  await page.locator('#window-warning').hover();
  await page.locator('#window-warning-tooltip').waitFor({ state: 'visible' });
  assert.match(await page.locator('#window-warning-tooltip').innerText(), /janela acessível é de 10000 documentos/);
  check('Total real e limite em tooltip');
  for (const [action, label] of [
    ['first', 'Primeira página'],
    ['prev', 'Página anterior'],
    ['next', 'Próxima página'],
    ['last', 'Última página']
  ]) {
    const button = page.locator(`.results-page[data-page="${action}"]`);
    assert.equal(await button.locator('svg.pagination-icon').count(), 1);
    assert.equal(await button.getAttribute('aria-label'), label);
    assert.equal(await button.getAttribute('title'), label);
  }
  check('Todos os botões de navegação usam ícones SVG com rótulos acessíveis');
  await search('pagina-ui');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '164 editais');
  assert.equal(await page.locator('#window-warning').isVisible(), false);
  // The component renders only the current remote page.
  await page.waitForFunction(() =>
    /1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || '')
  );
  check('Consulta nativa e primeira página de 100 documentos');
  await page.locator('.results-page[data-page="last"]').click();
  await page.waitForFunction(() =>
    /101\s*[-–]\s*164\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || '')
  );
  check('Ícone de última página abre a segunda página com 64 documentos');
  await page.locator('#refresh-button').click();
  await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
  assert.equal(await page.locator('.results-page.active').getAttribute('data-page'), '2');
  assert.match(await page.locator('.results-page-counter').innerText(), /101\s*[-–]\s*164/);
  check('Atualizar mantém a segunda página');
  const pageDownloadPromise = page.waitForEvent('download');
  await exportCsv('page');
  const pageDownload = await pageDownloadPromise;
  assert.equal((await readFile(await pageDownload.path(), 'utf8')).split('\r\n').length, 66);
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('(página 2)'));
  check('Exportar página atual baixa somente os 64 registros visíveis');
  await page.locator('.results-page[data-page="first"]').click();
  await page.waitForFunction(() =>
    /1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || '')
  );
  check('Ícone de primeira página retorna ao início');
  await page.locator('.results-page[data-page="next"]').click();
  await page.waitForFunction(() =>
    /101\s*[-–]\s*164\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || '')
  );
  check('Ícone de próxima página avança');
  await page.locator('.results-page[data-page="prev"]').click();
  await page.waitForFunction(() =>
    /1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || '')
  );
  check('Ícone de página anterior retorna');
  await search('firewall');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '6 editais');
  assert.equal(await page.locator('.results-page.active').getAttribute('data-page'), '1');
  check('Novos critérios voltam à página 1');
  await session.finish();
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await session.close();
}
