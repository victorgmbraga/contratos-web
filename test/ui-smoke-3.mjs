// Teste de interface contra o artefato estático, parte 3 de 3: contratos, atas, colunas, cancelamentos e avisos. Ver docs/validacao.md.
import { openAllFilters } from './filter-layout.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { diagnoseBrowserFailure } from './browser-diagnostics.js';
import { startUiSession } from './ui-smoke-session.js';

const session = await startUiSession();
const { app, page, serviceEvent, check, search, exportCsv, filter, selectFilterOptions, assertFilterCatalog } = session;
try {
  // Parte 3: contratos, atas, colunas, cancelamentos e avisos, a partir dos 64 editais.
  await page.goto(`http://127.0.0.1:${app.server.address().port}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  await page.locator('#document-type').selectOption('contrato');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '32 contratos');
  assert(await page.locator('.results-col[data-field="valor_global"]').isVisible());
  assert.equal(await page.locator('.results-col[data-field="valor_total_estimado"]').count(), 0);
  check('Troca para contratos consulta a fonte e apresenta as colunas próprias');
  await page.locator('#status').selectOption('vigente');
  await openAllFilters(page);
  await page.locator('#apply-filters').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '16 contratos');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '32 contratos');
  check('Status Vigentes usa o domínio temporal de contratos e limpar mantém o tipo');
  const detailRequests = [];
  const observe = r => {
    if (r.method === 'details') detailRequests.push(r);
  };
  page.on(serviceEvent, observe);
  await page.locator('.results-row').first().click();
  await page.locator('#details-dialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.detail-tab')].every(button => button.dataset.state === 'loaded')
  );
  // UF e Município aparecem juntos como Localidade da Unidade (Município/UF).
  assert.equal(await page.locator('#detail-panel-detalhes dt').count(), 31);
  assert.match(await page.locator('#details-content').innerText(), /Valor inicial/);
  assert.match(await page.locator('#detail-panel-detalhes').innerText(), /Localidade da Unidade\n[^\n]+\/[A-Z]{2}/);
  assert.equal(await page.locator('#detail-panel-detalhes dt:text-is("UF")').count(), 0);
  assert.equal(await page.locator('.items-section').count(), 0);
  assert.equal(detailRequests.length, 0);
  check('Contrato carrega os dados nativos e cinco listas sem confundir seu sequencial com a compra');
  for (const resource of ['empenhos', 'instrumentocobranca', 'termos']) {
    await page.locator(`#detail-tab-${resource}`).click();
    const section = page.locator(`#detail-panel-${resource}`);
    assert.equal(await section.locator('.related-card').count(), 1);
    await section.locator('.related-card > button').first().click();
    await section.locator('.related-extra').waitFor({ state: 'visible' });
    if (resource === 'termos') await section.locator('.related-extra a').first().waitFor();
    else await section.locator('.related-extra dl').waitFor();
    check(`Contrato exibe ${resource} e consulta os detalhes do registro selecionado`);
  }
  await page.locator('#detail-tab-detalhes').click();
  if (process.env.CONTRATOS_QA_SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.CONTRATOS_QA_SCREENSHOT_DIR}/contract-details-desktop.png` });
  await page.locator('#details-dialog .close-dialog').click();
  page.off(serviceEvent, observe);
  await page.locator('.results-row').filter({ hasText: 'Contrato de demonstração nº 2/2026' }).click();
  await page.waitForFunction(() => document.querySelector('#detail-tab-historico')?.textContent === 'Histórico (?)');
  await page.locator('#detail-tab-historico').click();
  const unknownHistory = page.locator('#detail-panel-historico'),
    historyNext = unknownHistory.getByRole('button', { name: 'Próxima página de Histórico' }),
    historyPrevious = unknownHistory.getByRole('button', { name: 'Página anterior de Histórico' });
  assert.equal(await unknownHistory.locator('.related-card').count(), 2);
  assert.match(await unknownHistory.locator('.items-status').innerText(), /Quantidade desconhecida/);
  assert.equal(await unknownHistory.locator('.item-pager span').innerText(), 'Página 1');
  await historyNext.click();
  await page.waitForFunction(
    () => document.querySelector('#detail-panel-historico .item-pager span').textContent === 'Página 2'
  );
  assert.equal(await unknownHistory.locator('.related-card').count(), 1);
  assert.equal(await historyNext.isEnabled(), true);
  await historyNext.click();
  await page.waitForFunction(
    () => document.querySelector('#detail-panel-historico .item-pager span').textContent === 'Página 3'
  );
  assert.equal(await historyNext.isDisabled(), true);
  assert.equal(await historyPrevious.isEnabled(), true);
  assert.match(await unknownHistory.locator('.items-status').innerText(), /Fim do histórico/);
  assert.match(await unknownHistory.locator('.related-list').innerText(), /Nenhum registro/);
  assert.equal(await page.locator('#detail-tab-historico').innerText(), 'Histórico (?)');
  await historyPrevious.click();
  await page.waitForFunction(
    () => document.querySelector('#detail-panel-historico .item-pager span').textContent === 'Página 2'
  );
  assert.equal(await unknownHistory.locator('.related-card').count(), 1);
  assert.equal(await historyNext.isEnabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#details-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#details-dialog .close-dialog').click();
  check(
    'Histórico de contrato com contagem divergente exibe total desconhecido e permite avançar até uma página vazia'
  );
  await openAllFilters(page);
  await selectFilterOptions('tipos_contrato', '1');
  await filter('possui_nfe').selectOption('true');
  await page.locator('#apply-filters').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '8 contratos');
  const contractDownload = page.waitForEvent('download');
  await exportCsv();
  const exportedContracts = await contractDownload,
    contractCsv = await readFile(await exportedContracts.path(), 'utf8');
  assert.equal(contractCsv.split('\r\n').length, 10);
  assert(contractCsv.split('\r\n')[0].includes('"valor_global"'));
  check('Filtros exclusivos de contratos e CSV de oito contratos usam os mesmos critérios');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '32 contratos');
  assert.equal(await assertFilterCatalog('contrato'), 31);
  check('Os 31 filtros de contratos têm controles compatíveis com seus tipos');
  assert.deepEqual(await page.locator('#document-type option').evaluateAll(nodes => nodes.map(n => n.textContent)), [
    'Editais e Avisos de Contratações',
    'Atas de Registro de Preços',
    'Contratos'
  ]);
  await page.locator('#document-type').selectOption('ata');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '24 atas');
  assert(await page.locator('.results-col[data-field="cancelado"]').isVisible());
  assert.equal(await page.locator('.results-col[data-field="valor_global"]').count(), 0);
  check('Os três tipos oficiais estão disponíveis e atas apresentam colunas próprias');
  const ataRequests = [];
  const observeAta = r => {
    if (['documentDetails', 'documentRelated'].includes(r.method) && r.payload.document.type === 'ata')
      ataRequests.push(r);
  };
  page.on(serviceEvent, observeAta);
  await page.locator('.results-row').first().click();
  await page.locator('#details-dialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.detail-tab')].every(button => button.dataset.state === 'loaded')
  );
  assert.equal(ataRequests.length, 5);
  assert.equal(await page.locator('#detail-panel-detalhes dt').count(), 19);
  assert.match(await page.locator('#detail-panel-detalhes').innerText(), /Número da ata/);
  assert.equal(await page.locator('#detail-tab-itens').count(), 0);
  assert.equal(await page.locator('#detail-tab-termos').count(), 0);
  check('Ata carrega seus dados completos e quatro listas em background');
  await page.locator('#detail-tab-partesenvolvidas').click();
  assert.match(await page.locator('#detail-panel-partesenvolvidas').innerText(), /Gerenciadora/);
  await page.locator('#detail-tab-contratos').click();
  assert.match(await page.locator('#detail-panel-contratos').innerText(), /Valor global/);
  assert.equal(ataRequests.length, 5);
  check('Partes envolvidas e contratos vinculados da ata aparecem sem repetir consultas');
  await page.locator('#detail-tab-detalhes').click();
  const ataControl = page.locator('#detail-panel-detalhes dt:text-is("Controle PNCP") + dd a');
  assert.match(await ataControl.getAttribute('href'), /\/app\/atas\//);
  // Controle PNCP e a contratação de origem abrem a lista, ambos em destaque.
  assert.deepEqual((await page.locator('#detail-panel-detalhes .detail-highlight dt').allInnerTexts()).slice(0, 2), [
    'Controle PNCP',
    'Contratação de origem'
  ]);
  assert.deepEqual((await page.locator('#detail-panel-detalhes dt').allInnerTexts()).slice(0, 2), [
    'Controle PNCP',
    'Contratação de origem'
  ]);
  await page.locator('#detail-panel-detalhes dt:text-is("Contratação de origem") + dd button').click();
  await page.waitForFunction(
    () =>
      new URL(location.href).searchParams.get('detalhe')?.startsWith('edital/') &&
      document.querySelector('#detail-tab-itens')
  );
  await page.waitForFunction(() => document.querySelector('#details-kind').textContent.includes('Edital'));
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('#detail-tab-partesenvolvidas'));
  check('Detalhes de ata conservam os vínculos e a navegação para a contratação de origem');
  await page.locator('#details-dialog .close-dialog').click();
  page.off(serviceEvent, observeAta);
  await page.locator('#status').selectOption('vigente');
  await openAllFilters(page);
  await page.locator('#apply-filters').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '12 atas');
  const ataDownload = page.waitForEvent('download');
  await exportCsv();
  const exportedAtas = await ataDownload,
    ataCsv = await readFile(await exportedAtas.path(), 'utf8');
  assert.equal(ataCsv.split('\r\n').length, 14);
  assert(ataCsv.split('\r\n')[0].includes('"cancelado"'));
  assert(!ataCsv.split('\r\n')[0].includes('"valor_global"'));
  check('Vigência e CSV de atas conservam os mesmos critérios e colunas');
  await page.locator('#clear-button').click();
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '24 atas');
  assert.equal(await assertFilterCatalog('ata'), 16);
  check('Os 16 filtros de atas têm controles compatíveis com seus tipos');
  await page.locator('#document-type').selectOption('edital');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  check('Voltar a contratações restaura colunas e critérios do tipo escolhido');
  await page.locator('#columns-button').click();
  const checkbox = page.locator('#column-list label').filter({ hasText: 'CNPJ do órgão' }).locator('input');
  await checkbox.check();
  await page.locator('#columns-dialog .close-dialog').click();
  assert(await page.locator('.results-col[data-field="orgao_cnpj"]').isVisible());
  check('Seleção de colunas');
  await search('csv-lenta-ui');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '164 editais');
  let cancelledDownloads = 0;
  const observeDownload = () => cancelledDownloads++;
  page.on('download', observeDownload);
  await exportCsv();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Coletando'));
  assert(await page.locator('#cancel-export-button').isVisible());
  await page.locator('#cancel-export-button').click();
  await page.waitForFunction(() => !document.querySelector('#export-button').disabled);
  await page.waitForTimeout(600);
  assert.equal(cancelledDownloads, 0);
  assert.match(await page.locator('#notice').innerText(), /Exportação cancelada/);
  page.off('download', observeDownload);
  check('Progresso e botão Cancelar CSV interrompem a coleta sem baixar arquivo parcial');
  await search('cancelar-ui');
  assert.equal(await page.locator('#search-button').isVisible(), false);
  assert(await page.locator('#cancel-button').isVisible());
  await page.locator('#cancel-button').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Consulta cancelada'));
  assert.deepEqual(
    await page.locator('#notice').evaluate(node => {
      const message = node.querySelector('#notice-message').getBoundingClientRect(),
        button = node.querySelector('#notice-close').getBoundingClientRect();
      return [Math.round(message.height * 10) / 10, Math.round(button.height * 10) / 10];
    }),
    [18.2, 18.2]
  );
  assert(await page.locator('#search-button').isVisible());
  assert.equal(await page.locator('#cancel-button').isVisible(), false);
  check('Cancelar substitui Pesquisar durante o carregamento e restaura o botão ao cancelar');
  assert(await page.locator('#notice-close').isVisible());
  await page.locator('#notice-close').click();
  assert.equal(await page.locator('#notice').isVisible(), false);
  check('Aviso de status pode ser fechado');
  await search('lenta-ui');
  await page.locator('#search').fill('firewall');
  await page.locator('#search').press('Enter');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '6 editais');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#result-title').innerText(), '6 editais');
  check('Resposta antiga não substitui a consulta atual');
  await search('falha-ui');
  await page.waitForFunction(() => document.querySelector('#notice').dataset.code === 'INVALID_UPSTREAM');
  assert(await page.locator('#notice').isVisible());
  assert.match(await page.locator('#notice').innerText(), /conteúdo diferente de JSON/);
  assert.doesNotMatch(await page.locator('#notice').innerText(), /INVALID_UPSTREAM/);
  assert(await page.locator('#export-button').isDisabled());
  assert.match(await page.locator('#notice').innerText(), /resultado anterior/);
  check('Falha visível com mensagem humana, código como dado e exportação desabilitada');
  await search('xss-ui');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '1 edital');
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.match(await page.locator('.object-text').innerText(), /<img/);
  check('Marcação da fonte é exibida como texto');
  await search('');
  await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 editais');
  if (process.env.CONTRATOS_QA_SCREENSHOT_DIR)
    await page.screenshot({ path: process.env.CONTRATOS_QA_SCREENSHOT_DIR + '/desktop.png', fullPage: true });
  await session.finish();
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  await session.close();
}
