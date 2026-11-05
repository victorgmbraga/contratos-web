// Teste de interface contra o artefato estático, parte 2 de 3: detalhes, CSV e filtros de editais. Ver docs/validacao.md.
import { openAllFilters } from './filter-layout.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { startUiSession } from './ui-smoke-session.js';

const session = await startUiSession();
const {
  app,
  page,
  serviceEvent,
  waitQuery,
  check,
  search,
  exportCsv,
  filter,
  selectFilterOptions,
  assertFilterCatalog,
  assertRepresentativeFilters
} = session;
try {
  // Parte 2: detalhes, CSV e filtros de editais, a partir da pesquisa "firewall" (seis editais).
  await page.goto(`http://127.0.0.1:${app.server.address().port}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  await search('firewall');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '6 editais');
  const tabRequests = [];
  const observeTabs = request => {
    if (['details', 'documentRelated'].includes(request.method) && request.payload.document.type === 'edital')
      tabRequests.push(request);
  };
  page.on(serviceEvent, observeTabs);
  await page.locator('.results-row').first().click();
  await page.locator('#details-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#detail-tab-detalhes').getAttribute('aria-selected'), 'true');
  assert((await page.locator('#detail-panel-detalhes dt').count()) > 12);
  assert.match(await page.locator('#detail-panel-detalhes').innerText(), /Modo de disputa/);
  const detailLabels = await page.locator('#detail-panel-detalhes dt').allInnerTexts();
  // Campos principais primeiro, com valores adjacentes e fonte normal.
  assert.deepEqual(detailLabels.slice(0, 7), [
    'Controle PNCP',
    'Fonte',
    'Órgão',
    'Situação',
    'Valor total estimado',
    'Valor total homologado',
    'Publicação no PNCP'
  ]);
  assert.deepEqual(
    await page
      .locator('#detail-panel-detalhes .detail-highlight dd')
      .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontWeight)),
    ['400', '400', '400', '400', '400', '400', '400']
  );
  assert.equal(await page.locator('.detail-summary').count(), 0);
  check('Detalhes abre com seis abas e todos os campos disponíveis');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.detail-tab')].every(button => button.dataset.state === 'loaded')
  );
  assert.equal(tabRequests.length, 5);
  check('Cinco listagens carregam em background antes da troca de abas');
  assert.equal(await page.locator('#details-links').count(), 0);
  assert.equal(await page.locator('.detail-links').count(), 0);
  assert.equal(Math.round((await page.locator('#details-dialog').boundingBox()).width), 888);
  check('Painel ampliado em 20% sem links no cabeçalho');
  if (process.env.CONTRATOS_QA_SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.CONTRATOS_QA_SCREENSHOT_DIR}/details-tabs-desktop.png` });
  await page.locator('#detail-tab-detalhes').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#detail-tab-itens').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#detail-tab-historico').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#detail-tab-detalhes').getAttribute('aria-selected'), 'true');
  check('Teclado navega entre abas com foco e seleção sincronizados');
  await page.locator('#detail-tab-itens').click();
  await page.locator('.item-card').first().waitFor();
  assert.match(await page.locator('.item-card').first().innerText(), /Homologado/);
  check('Detalhes carregam itens automaticamente');
  for (const [resource, pattern] of [
    ['arquivos', /Baixar arquivo/],
    ['atas', /Vigência/],
    ['contratos', /Valor global/],
    ['historico', /Justificativa/]
  ]) {
    const section = page.locator(`.related-section[data-resource="${resource}"]`);
    await page.locator(`#detail-tab-${resource}`).click();
    await section.locator('.related-card').first().waitFor();
    assert.match(await section.innerText(), pattern);
    check(`Aba ${resource} exibe a listagem carregada`);
  }
  assert.equal(tabRequests.length, 5);
  check('Trocar abas preserva dados sem repetir consultas');
  for (const resource of ['arquivos', 'historico']) {
    const section = page.locator(`.related-section[data-resource="${resource}"]`);
    await page.locator(`#detail-tab-${resource}`).click();
    assert.equal(await section.locator('.related-card').count(), 10);
    await section.getByRole('button', { name: new RegExp(`^Próxima página de `) }).click();
    await page.waitForFunction(
      r =>
        document.querySelector(`.related-section[data-resource="${r}"] .item-pager [aria-current="page"]`)?.dataset
          .page === '2',
      resource
    );
    assert.equal(await section.locator('.related-card').count(), 2);
    assert.equal(await section.locator('.item-pager [data-page="next"]').isDisabled(), true);
    check(`Paginação de ${resource} alcança a última página`);
  }
  const fileLink = page.locator('.related-section[data-resource="arquivos"] .related-card a').first();
  assert.equal(await fileLink.getAttribute('target'), '_blank');
  assert.equal(await fileLink.getAttribute('rel'), 'noopener noreferrer');
  assert.match(await fileLink.getAttribute('href'), /^https:\/\/pncp.gov.br\//);
  await page.locator('#detail-tab-detalhes').click();
  await page.locator('#details-dialog .close-dialog').click();
  page.off(serviceEvent, observeTabs);
  const downloadPromise = page.waitForEvent('download');
  await exportCsv();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^contratos-web-/);
  assert.equal(await page.locator('#export-dialog').count(), 0);
  check('CSV baixado por nova coleta, sem confirmação');
  await openAllFilters(page);
  await selectFilterOptions('ufs', 'GO');
  await page.locator('#apply-filters').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '0 editais');
  check('Filtro nativo UF aplicado no serviço');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  await openAllFilters(page);
  await filter('srp').selectOption('false');
  const srpRequest = waitQuery(input => input.pncp_filters.srp === false);
  await page.locator('#apply-filters').click();
  assert.equal((await srpRequest).pncp_filters.srp, false);
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '32 editais');
  check('Filtro SRP envia false e exibe somente registros correspondentes');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  await openAllFilters(page);
  for (const [name, ids] of [
    ['fontes', ['3', '5']],
    ['modos_disputa', ['1', '2']]
  ]) {
    await selectFilterOptions(name, ids);
  }
  const conditions = [
    'indicador_orcamento_sigiloso',
    'tem_ata_registro_preco',
    'tem_contrato_empenho',
    'tem_nfe_contrato',
    'exigencia_conteudo_nacional'
  ];
  for (const name of conditions) {
    await filter(name).selectOption('false');
  }
  const documentaryRequest = waitQuery(input => input.pncp_filters.fontes?.length === 2);
  await page.locator('#apply-filters').click();
  const documentaryFilters = (await documentaryRequest).pncp_filters;
  assert.deepEqual(documentaryFilters.fontes, ['3', '5']);
  assert.deepEqual(documentaryFilters.modos_disputa, ['1', '2']);
  assert(conditions.every(name => documentaryFilters[name] === false));
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '11 editais');
  check('Origem, modo de disputa e cinco condições documentais são aplicados juntos');
  await openAllFilters(page);
  for (const name of conditions) {
    assert.equal(await filter(name).inputValue(), 'false');
  }
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  check('Editar filtros documentais preserva Não');
  const documentaryDownload = page.waitForEvent('download');
  await exportCsv();
  const exported = await documentaryDownload;
  const documentaryCsv = await readFile(await exported.path(), 'utf8');
  assert.equal(documentaryCsv.split('\r\n').length, 13);
  check('CSV usa os mesmos filtros documentais e exporta todas as onze contratações');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  await openAllFilters(page);
  for (const [name, ids] of [
    ['criterios_julgamento', ['7']],
    ['categorias_leilao', ['1']],
    ['beneficios', ['1']]
  ]) {
    await selectFilterOptions(name, ids);
  }
  const itemConditions = [
    'incentivo_produtivo_basico',
    'aplicabilidade_margem_preferencia_normal',
    'aplicabilidade_margem_preferencia_adicional',
    'possui_emenda_parlamentar'
  ];
  for (const name of itemConditions) {
    await filter(name).selectOption('true');
  }
  const itemRequest = waitQuery(input => input.pncp_filters.beneficios?.includes('1'));
  await page.locator('#apply-filters').click();
  const itemFilters = (await itemRequest).pncp_filters;
  assert(itemConditions.every(name => itemFilters[name] === true));
  assert.deepEqual(itemFilters.categorias_leilao, ['1']);
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '6 editais');
  check('Emenda e seis filtros de itens são aplicados juntos');
  await page.locator('.results-row').first().click();
  await page.locator('#details-dialog').waitFor({ state: 'visible' });
  await page.locator('#detail-tab-itens').click();
  await page.waitForFunction(() => document.querySelectorAll('.item-card').length === 2);
  assert.match(await page.locator('.item-card').nth(1).innerText(), /Item complementar/);
  await page.locator('#details-dialog .close-dialog').click();
  check('Detalhes preservam os dois itens após a pesquisa filtrada');
  const itemDownload = page.waitForEvent('download');
  await exportCsv();
  const itemExport = await itemDownload;
  assert.equal((await readFile(await itemExport.path(), 'utf8')).split('\r\n').length, 8);
  check('CSV exporta seis contratações, sem multiplicar linhas pelos itens');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  await openAllFilters(page);
  await filter('codigo_ibge').fill('5300108');
  const ibgeRequest = waitQuery(input => input.pncp_filters.codigo_ibge === '5300108');
  await page.locator('#apply-filters').click();
  assert.equal((await ibgeRequest).pncp_filters.codigo_ibge, '5300108');
  check('Código IBGE preservado como texto na pesquisa');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '32 editais');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  await openAllFilters(page);
  await selectFilterOptions('amparos_legais', ['19', '98']);
  await selectFilterOptions('normativos_base', '1');
  await page.waitForFunction(
    () =>
      document.querySelector('#legal-error').textContent.includes('incompatíveis') &&
      !document.querySelector('#apply-filters').disabled
  );
  const legalRequest = waitQuery(input => input.pncp_filters.normativos_base?.includes('1'));
  await page.locator('#apply-filters').click();
  const legalFilters = (await legalRequest).pncp_filters;
  assert.deepEqual(legalFilters.amparos_legais, ['19']);
  assert.deepEqual(legalFilters.normativos_base, ['1']);
  check('Normativo reconcilia amparos legais e aplica os critérios válidos');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '11 editais');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  await openAllFilters(page);
  await filter('anos').click();
  assert.equal(await page.locator('#filter-suggestions-anos .suggestion').innerText(), '2026');
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  check('Domínio de anos no formato real do PNCP');
  assert.equal(await assertFilterCatalog('edital'), 73);
  await assertRepresentativeFilters();
  check('Os 73 filtros de editais têm controles compatíveis com seus tipos');
  await session.finish();
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await session.close();
}
