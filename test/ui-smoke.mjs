// UI verification against the static artifact; see docs/validacao.md.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { launchTestBrowser } from './browser-launch.js';
import { defaults } from '../src/settings.js';
import { createStaticServer } from './static-server.js';
import { schema } from '../src/schema.js';
import { FILTER_OPTIONS_PREFIX, FILTER_OPTIONS_TTL } from '../src/browser/filter-options-cache.js';
const config={...defaults,DEMO_MODE:true,PNCP_REQUESTS_PER_SECOND:100000};
const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const serviceEvent='service';
const initialDomains=[];
page.on(serviceEvent,message=>{if(message.method==='domains')initialDomains.push(message.payload);});
const localApiRequests=[];
page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))localApiRequests.push(r.url());});
{
  await page.exposeFunction('__observeService',message=>page.emit('service',message));
  await page.addInitScript(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {postMessage(message,...args){window.__observeService(message);return super.postMessage(message,...args);}};});
}
function waitQuery(predicate){
  return page.waitForEvent('service',{predicate:m=>m.method==='execute' && predicate(m.payload.query)}).then(m=>m.payload.query);
}
const check=name=>{checks.push(name);console.log('PASS '+name);};
async function search(text) {await page.locator('#search').fill(text);await page.locator('#search-button').click();}
const filter=name=>page.locator(`#filter-${name}`);
async function selectFilterOptions(name,values) {
  for(const value of Array.isArray(values)?values:[values]) {
    await filter(name).click();
    await page.locator(`#filter-suggestions-${name} .suggestion[data-value=${JSON.stringify(value)}]`).click();
  }
}
async function addEveryFilter(type) {
  const catalog=schema(config);
  const caps=catalog.capabilities.filter(c=>!c.reserved && c.state==='enabled' && c.documents.includes(type));
  await page.locator('#filters-button').click();
  assert.equal(await page.locator('#add-native, #native-field, #filters-dialog select[multiple]').count(),0);
  assert.equal(await page.locator('#filter-groups .filter-field').count(),caps.length);
  const visibleNames=await page.locator('#filter-groups .filter-field').evaluateAll(fields=>fields.map(field=>field.id.slice('filter-field-'.length)));
  assert.deepEqual(visibleNames.sort(),caps.map(cap=>cap.name).sort());
  for(const cap of caps){
    const input=filter(cap.name);
    if(['list','enum'].includes(cap.type)){
      if(cap.cardinality==='multiple'){await input.click();await page.locator(`#filter-suggestions-${cap.name} .suggestion`).first().click();}
      else {const first=await input.locator('option:not([value=""])').first().getAttribute('value');await input.selectOption(first);}
    }else if(cap.type==='boolean')await input.selectOption('false');
    else await input.fill(cap.type==='date'?'2026-09-01':cap.type==='integer'?'0':cap.name==='codigo_ibge'?'5300108':'0.00');
  }
  const request=waitQuery(input=>Object.keys(input.pncp_filters).length===caps.length);
  await page.locator('#apply-filters').click();const input=await request;assert.equal(input.document_type,type);assert.equal(Object.keys(input.pncp_filters).length,caps.length);
  await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);return caps.length;
}
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}`,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('.results-table'));
  assert.match(await page.locator('#source-badge').innerText(),/dados fictícios/);check('Demonstração marcada e interface disponível');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');check('Pesquisa inicial sem filtros executada automaticamente');
  await page.waitForFunction(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).length===8,FILTER_OPTIONS_PREFIX);
  assert.equal(initialDomains.length,8);
  assert.deepEqual(initialDomains.filter(payload=>payload.field===null).map(payload=>payload.type),['edital','ata','contrato']);
  const storedOptions=await page.evaluate(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).map(key=>JSON.parse(localStorage.getItem(key))),FILTER_OPTIONS_PREFIX);
  for(const entry of storedOptions){assert.equal(entry.expires_at-entry.fetched_at,FILTER_OPTIONS_TTL);assert(!Object.hasOwn(entry.value,'raw'));}
  for(let i=0;i<2;i++){await page.locator('#filters-button').click();await filter('ufs').waitFor();assert.equal(await page.locator('#filter-search, .filter-finder').count(),0);await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();}
  assert.equal(initialDomains.length,8);check('Inicialização pré-carrega e persiste as opções dos três tipos; reabrir filtros não consulta a fonte');
  for(const [type,title] of [['edital','64 contratações'],['ata','24 atas'],['contrato','32 contratos']]) {
    await page.locator('#document-type').selectOption(type);
    await page.waitForFunction(expected=>document.querySelector('#result-title').textContent===expected,title);
    const ufButton=page.getByRole('button',{name:'Filtrar UF',exact:true});
    assert.equal(await ufButton.getAttribute('aria-haspopup'),null);assert.equal(await ufButton.getAttribute('title'),null);
    await ufButton.hover();
    const tooltip=page.locator('#'+await ufButton.getAttribute('aria-describedby'));
    await tooltip.waitFor({state:'visible'});assert.equal(await tooltip.innerText(),'Filtrar por esta coluna');
    assert.equal(await page.getByRole('menu').count(),0);
    await page.locator('#filters-dialog').waitFor({state:'hidden'});
    await ufButton.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.id==='filter-ufs');
    assert.equal(await tooltip.isVisible(),false);
    await page.locator('#filter-suggestions-ufs .suggestion[data-value="DF"]').click();
    let applied=waitQuery(query=>query.document_type===type && query.pncp_filters.ufs?.[0]==='DF');
    await page.locator('#apply-filters').click();await applied;
    await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);
    assert.equal(new URL(page.url()).searchParams.get('ufs'),'DF');
    await page.getByRole('button',{name:'Filtrar Publicação',exact:true}).click();
    await page.getByRole('menuitem',{name:'Filtrar por esta coluna',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.id==='filter-data_publicacao_inicio');
    await filter('data_publicacao_inicio').fill('2026-01-01');
    applied=waitQuery(query=>query.document_type===type && query.pncp_filters.data_publicacao_inicio==='2026-01-01' && query.pncp_filters.ufs?.[0]==='DF');
    await page.locator('#apply-filters').click();await applied;
    await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);
    assert.equal(new URL(page.url()).searchParams.get('data_publicacao_inicio'),'2026-01-01');
    await page.locator('#clear-button').click();
    await page.waitForFunction(expected=>document.querySelector('#result-title').textContent===expected,title);
  }
  await page.locator('#document-type').selectOption('edital');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  check('Ícone filtra diretamente com tooltip nos três tipos; publicação conserva menu de filtros e ordenação');
  await page.locator('#filters-button').click();
  const closedSuggestions=[],observeClosed=message=>{if(message.method==='suggest')closedSuggestions.push(message.payload);};page.on('service',observeClosed);
  const unchangedQuery=page.url();
  await filter('modalidades').fill('eletronico');
  assert.equal(await page.locator('#filter-suggestions-modalidades .suggestion').count(),1);
  await filter('modalidades').press('ArrowDown');await filter('modalidades').press('Enter');
  assert.equal(await page.locator('#filter-selected-modalidades .selected-option').count(),1);
  assert.equal(await page.locator('#filter-suggestions-modalidades .suggestion').getAttribute('aria-selected'),'true');
  await filter('modalidades').press('Enter');assert.equal(await page.locator('#filter-selected-modalidades .selected-option').count(),0);
  await filter('modalidades').press('Escape');assert.equal(await filter('modalidades').getAttribute('aria-expanded'),'false');assert(await page.locator('#filters-dialog').isVisible());
  await filter('modalidades').fill('');
  for(const option of await page.locator('#filter-suggestions-modalidades .suggestion').all())await option.click();
  assert.equal(await page.locator('#filter-selected-modalidades .selected-option').count(),2);assert.equal(page.url(),unchangedQuery);assert.deepEqual(closedSuggestions,[]);page.off('service',observeClosed);
  await page.locator('#filters-title').click();assert.equal(await filter('modalidades').getAttribute('aria-expanded'),'false');
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  check('Filtros múltiplos usam busca local sem acentos, escolhas por teclado e marcações independentes; Escape fecha apenas as opções');
  await page.locator('#filters-button').click();
  const beforeDraft=page.url();
  const orgSuggestion=page.waitForEvent('service',{predicate:message=>message.method==='suggest' && message.payload.field==='orgaos'});
  const unitSuggestion=page.waitForEvent('service',{predicate:message=>message.method==='suggest' && message.payload.field==='unidades'});
  await filter('orgaos').fill('Ministério');await filter('unidades').fill('Unidade');
  await Promise.all([orgSuggestion,unitSuggestion]);
  await filter('orgaos').click();await page.locator('#filter-suggestions-orgaos .suggestion').first().click();
  await filter('unidades').click();await page.locator('#filter-suggestions-unidades .suggestion').first().click();
  assert.equal(await page.locator('#filter-selected-orgaos .selected-option').count(),1);
  assert.equal(await page.locator('#filter-selected-unidades .selected-option').count(),1);
  await page.locator('#filter-selected-orgaos .selected-option').click();
  assert.equal(await page.locator('#filter-selected-orgaos .selected-option').count(),0);
  assert.equal(await page.locator('#filter-selected-unidades .selected-option').count(),1);
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();assert.equal(page.url(),beforeDraft);
  await page.locator('#filters-button').click();assert.equal(await page.locator('.selected-option').count(),0);await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  check('Sugestões simultâneas de órgão e unidade são independentes; cancelar descarta seleções sem alterar a URL');
  const cachedPage=await page.context().newPage(),cachedDomains=[];
  try {
    cachedPage.on('pageerror',error=>errors.push(error.message));
    await cachedPage.exposeFunction('__observeCachedDomains',message=>{if(message.method==='domains')cachedDomains.push(message.payload);});
    await cachedPage.addInitScript(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {postMessage(message,...args){window.__observeCachedDomains(message);return super.postMessage(message,...args);}};});
    await cachedPage.goto(page.url(),{waitUntil:'load'});
    await cachedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
    for(const [type,title] of [['edital','64 contratações'],['ata','24 atas'],['contrato','32 contratos']]){
      await cachedPage.locator('#document-type').selectOption(type);
      await cachedPage.waitForFunction(expected=>document.querySelector('#result-title').textContent===expected,title);
      await cachedPage.locator('#filters-button').click();await cachedPage.locator('#filter-ufs').waitFor();
      await cachedPage.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
    }
    assert.equal(cachedDomains.length,0);check('Nova página reutiliza localStorage para filtros de edital, ata e contrato');
    await cachedPage.evaluate(({prefix,ttl})=>{
      localStorage.setItem('filter-cache-test-preference','preservar');
      for(const key of Object.keys(localStorage).filter(key=>key.startsWith(prefix))){const entry=JSON.parse(localStorage.getItem(key));entry.fetched_at=Date.now()-ttl;entry.expires_at=entry.fetched_at+ttl;localStorage.setItem(key,JSON.stringify(entry));}
    },{prefix:FILTER_OPTIONS_PREFIX,ttl:FILTER_OPTIONS_TTL});
    await cachedPage.reload({waitUntil:'load'});
    await cachedPage.waitForFunction(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).length===8 && Object.keys(localStorage).filter(key=>key.startsWith(prefix)).every(key=>JSON.parse(localStorage.getItem(key)).expires_at>Date.now()),FILTER_OPTIONS_PREFIX);
    await cachedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratos');
    assert.equal(cachedDomains.length,8);
    assert.equal(await cachedPage.evaluate(()=>localStorage.getItem('filter-cache-test-preference')),'preservar');
    check('Listas vencidas há quatro horas são renovadas sem apagar dados alheios');
  } finally {await cachedPage.close();}
  const sharedPage=await page.context().newPage(),sharedQueries=[];
  try {
    sharedPage.on('pageerror',error=>errors.push(error.message));
    await sharedPage.exposeFunction('__observeSharedQuery',message=>{if(message.method==='execute')sharedQueries.push(message.payload.query);});
    await sharedPage.addInitScript(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {postMessage(message,...args){window.__observeSharedQuery(message);return super.postMessage(message,...args);}};});
    const sharedBase=`http://127.0.0.1:${app.server.address().port}/`;
    await sharedPage.goto(sharedBase+'?demo=1&tipos_documento=edital&q=pagina-ui&ordenacao=data&pagina=2&ufs=SP%7CDF&srp=false&ordem_classificacao_min=0&item_quantidade_min=0.00#resultados');
    const waitSecond=()=>sharedPage.waitForFunction(()=>document.querySelector('.results-page.active')?.dataset.page==='2' && /101\s*[-–]\s*164/.test(document.querySelector('.results-page-counter')?.textContent || '') && !document.querySelector('#refresh-button').disabled);
    await waitSecond();assert.equal(sharedQueries.length,1);assert.equal(sharedQueries[0].page,2);assert.equal(sharedQueries[0].order,'data');assert.deepEqual(sharedQueries[0].pncp_filters,{ufs:['SP','DF'],srp:false,ordem_classificacao_min:0,item_quantidade_min:'0.00'});
    assert.equal(await sharedPage.locator('#search').inputValue(),'pagina-ui');assert.equal(new URL(sharedPage.url()).hash,'#resultados');check('Link compartilhado restaura critérios tipados e abre diretamente a segunda página');
    const sharedLink=sharedPage.url();await sharedPage.reload();await waitSecond();assert.equal(sharedQueries.length,2);assert.equal(sharedPage.url(),sharedLink);check('Recarregar mantém busca, filtros, ordenação e página da URL');
    await sharedPage.locator('#order').selectOption('-data');await sharedPage.waitForFunction(()=>document.querySelector('.results-page.active')?.dataset.page==='1' && !document.querySelector('#refresh-button').disabled);
    assert.equal(new URL(sharedPage.url()).searchParams.get('pagina'),'1');
    await sharedPage.goBack();await waitSecond();assert.equal(await sharedPage.locator('#order').inputValue(),'data');assert.equal(sharedPage.url(),sharedLink);
    await sharedPage.goForward();await sharedPage.waitForFunction(()=>document.querySelector('.results-page.active')?.dataset.page==='1' && !document.querySelector('#refresh-button').disabled);assert.equal(await sharedPage.locator('#order').inputValue(),'-data');check('Voltar e Avançar restauram a página e a ordenação sem recarregar a aplicação');
    await sharedPage.locator('#document-type').selectOption('contrato');await sharedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratos');
    assert.equal(new URL(sharedPage.url()).searchParams.get('tipos_documento'),'contrato');assert.equal(new URL(sharedPage.url()).searchParams.has('srp'),false);
    await sharedPage.locator('#filters-button').click();await sharedPage.locator('#draft-status').selectOption('vigente');await sharedPage.locator(`#filter-${'possui_nfe'}`).selectOption('false');await sharedPage.locator('#apply-filters').click();
    await sharedPage.waitForFunction(()=>!document.querySelector('#export-button').disabled);assert.equal(new URL(sharedPage.url()).searchParams.get('possui_nfe'),'false');assert.equal(new URL(sharedPage.url()).searchParams.get('status'),'vigente');
    const contractLink=sharedPage.url(),contractResult=await sharedPage.locator('#result-title').innerText();await sharedPage.reload();await sharedPage.waitForFunction(expected=>document.querySelector('#result-title').textContent===expected,contractResult);
    assert.equal(await sharedPage.locator('#document-type').inputValue(),'contrato');assert(await sharedPage.locator('.results-col[data-field="valor_global"]').isVisible());assert.equal(sharedQueries.at(-1).pncp_filters.possui_nfe,false);check('URL de contrato restaura status e filtro Não, com as colunas próprias');
    await sharedPage.locator('#document-type').selectOption('ata');await sharedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='24 atas');assert.equal(new URL(sharedPage.url()).searchParams.get('tipos_documento'),'ata');
    await sharedPage.goBack();await sharedPage.waitForFunction(expected=>document.querySelector('#result-title').textContent===expected,contractResult);assert.equal(sharedPage.url(),contractLink);
    await sharedPage.goForward();await sharedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='24 atas');await sharedPage.reload();await sharedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='24 atas');check('Links e histórico também restauram atas e alternam corretamente entre tipos');
    const beforeInvalid=sharedQueries.length;await sharedPage.goto(sharedBase+'?pagina=101&q=firewall');await sharedPage.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Parâmetros inválidos na URL'));
    assert.equal(sharedQueries.length,beforeInvalid);assert.equal(new URL(sharedPage.url()).searchParams.get('pagina'),'101');
    await sharedPage.locator('#clear-button').click();await sharedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');assert.equal(new URL(sharedPage.url()).searchParams.get('pagina'),'1');check('Parâmetros inválidos são exibidos sem pesquisa automática e podem ser corrigidos pela interface');
  } finally {await sharedPage.close();}
  const orderedPage=await context.newPage();
  try {
    const expectedOrders={edital:['-data','data','relevancia','numero_controle_pncp','-valor_total_estimado'],ata:['-data','data','relevancia','valor','-valor'],contrato:['-data','data','relevancia','numero_contratacao','numero_controle_pncp','data_inicio_vigencia','valor_global']};
    await orderedPage.addInitScript(()=>{
      const NativeWorker=window.Worker;window.__orderRequests=[];
      window.Worker=class extends NativeWorker {postMessage(message,...args){if(message.method==='execute')window.__orderRequests.push(message.payload.query);return super.postMessage(message,...args);}};
    });
    const orderedBase=`http://127.0.0.1:${app.server.address().port}/`;
    const waitOrdered=(type,order)=>orderedPage.waitForFunction(({type,order})=>window.__orderRequests.at(-1)?.document_type===type && window.__orderRequests.at(-1)?.order===order && !document.querySelector('#export-button').disabled,{type,order});
    await orderedPage.goto(orderedBase+'?demo=1');await waitOrdered('edital','-data');
    for(const [type,orders] of Object.entries(expectedOrders)) {
      if(type!=='edital'){await orderedPage.locator('#document-type').selectOption(type);await waitOrdered(type,'-data');}
      assert.deepEqual(await orderedPage.locator('#order option').evaluateAll(options=>options.map(option=>option.value)),orders);
      assert.equal(await orderedPage.locator('#order').inputValue(),'-data');
      for(const order of ['relevancia',...orders.slice(3)]) {
        await orderedPage.locator('#order').selectOption(order);await waitOrdered(type,order);
        assert.equal(new URL(orderedPage.url()).searchParams.get('ordenacao'),order);
        assert.equal(new URL(orderedPage.url()).searchParams.get('pagina'),'1');
        const href=orderedPage.url();await orderedPage.reload();await waitOrdered(type,order);
        assert.equal(await orderedPage.locator('#order').inputValue(),order);assert.equal(orderedPage.url(),href);
      }
    }
    check('Relevância sem texto e oito opções adicionais acompanham o tipo, o Worker, a URL e o recarregamento');
    await orderedPage.goto(orderedBase+'?demo=1&tipos_documento=ata&ordenacao=valor_global');
    await orderedPage.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Ordenação não disponível'));
    assert.equal(await orderedPage.evaluate(()=>window.__orderRequests.length),0);check('Link com ordenação incompatível é rejeitado antes de consultar o PNCP');
  } finally {await orderedPage.close();}
  assert.equal(await page.locator('.results-page-size').count(),0);check('Seletor de linhas removido');
  assert.equal(await page.locator('#app-header .header-toolbar .criteria-row').count(),1);
  for(const id of ['order','clear-button','cancel-button','retry-button','refresh-button','columns-button','export-button','repository-link'])assert.equal(await page.locator(`#app-header #${id}`).count(),1);
  assert.deepEqual(await page.locator('.header-toolbar > .result-actions').first().evaluate(node=>[...node.querySelectorAll('button')].map(button=>button.id)),['refresh-button','columns-button','copy-link-button','export-page-button','export-button','theme-button']);
  assert.equal(await page.locator('.results-footer .repository-link').count(),0);
  for(const [id,label,accessibleLabel=label] of [['search-button','Pesquisar'],['filters-button','Filtros'],['refresh-button','Atualizar resultados'],['columns-button','Selecionar colunas'],['export-button','Exportar CSV'],['repository-link','Repositório no GitHub','Repositório do Contratos Web no GitHub (abre em nova aba)']]){
    const button=page.locator(`#${id}`),tooltip=page.locator(`#${id}-tooltip`);
    assert.equal(await button.getAttribute('aria-label'),accessibleLabel);assert.equal(await button.getAttribute('title'),null);assert.equal(await button.locator('svg').count(),1);assert.equal(await button.locator('span:not(.count-badge)').count(),0);
    assert.equal(await button.getAttribute('aria-describedby'),`${id}-tooltip`);
    await button.hover();await tooltip.waitFor({state:'visible'});assert.equal(await tooltip.innerText(),label);
    const style=await tooltip.evaluate(node=>{const css=getComputedStyle(node);return {background:css.backgroundColor,color:css.color,border:css.borderColor};});
    assert.deepEqual(style,{background:'rgb(255, 255, 255)',color:'rgb(19, 61, 104)',border:'rgb(220, 228, 237)'});
    const box=await tooltip.boundingBox();assert(box.x>=8 && box.x+box.width<=page.viewportSize().width-8);assert(box.y>=8 && box.y+box.height<=page.viewportSize().height-8);
    await page.mouse.move(0,0);await tooltip.waitFor({state:'hidden'});
    await button.focus();await tooltip.waitFor({state:'visible'});await page.keyboard.press('Escape');await tooltip.waitFor({state:'hidden'});
    await page.locator('#search').focus();
  }
  check('Ações do cabeçalho e link do GitHub usam tooltips neutros com mouse, foco e Escape');
  assert.equal(await page.locator('.result-toolbar').count(),0);
  assert.equal(await page.locator('.results-footer .result-info').count(),1);
  const popupFields=await page.locator('.results-header-menu').evaluateAll(buttons=>buttons.map(button=>button.closest('.results-col')?.getAttribute('data-field')));
  assert(!popupFields.includes('titulo'));assert(!popupFields.includes('objeto_compra'));assert(!popupFields.includes('data_atualizacao_pncp'));assert(popupFields.includes('orgao_nome'));
  assert.equal(await page.locator('.results-header-menu .header-filter-icon').count(),popupFields.length);
  for(const field of ['orgao_nome','uf','data_publicacao_pncp']){
    const title=page.locator(`.results-col[data-field="${field}"] .results-col-title`);
    assert.equal(await title.locator('.results-header-menu').evaluate(node=>node===node.parentElement.lastElementChild),true);
  }
  assert.equal(await page.locator('.source-footer').count(),0);check('Ordenação e ações no cabeçalho, informações no rodapé da tabela');
  await search('janela-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='4.143.240 contratações');
  assert.match(await page.locator('.results-page-counter').innerText(),/Exibindo 1-100 de\s+4\.143\.240 contratações/);
  assert.equal(await page.locator('#notice').isVisible(),false);assert(await page.locator('#window-warning').isVisible());
  await page.locator('#window-warning').hover();await page.locator('#window-warning-tooltip').waitFor({state:'visible'});
  assert.match(await page.locator('#window-warning-tooltip').innerText(),/janela acessível é de 10000 documentos/);
  check('Total real e limite em tooltip');
  for(const [action,label]of [['first','Primeira página'],['prev','Página anterior'],['next','Próxima página'],['last','Última página']]) {
    const button=page.locator(`.results-page[data-page="${action}"]`);
    assert.equal(await button.locator('svg.pagination-icon').count(),1);
    assert.equal(await button.getAttribute('aria-label'),label);assert.equal(await button.getAttribute('title'),label);
  }
  check('Todos os botões de navegação usam ícones SVG com rótulos acessíveis');
  await search('pagina-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='164 contratações');
  assert.equal(await page.locator('#window-warning').isVisible(),false);
  // The component renders only the current remote page.
  await page.waitForFunction(()=>/1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || ''));check('Consulta nativa e primeira página de 100 documentos');
  await page.locator('.results-page[data-page="last"]').click();await page.waitForFunction(()=>/101\s*[-–]\s*164\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || ''));check('Ícone de última página abre a segunda página com 64 documentos');
  await page.locator('#refresh-button').click();await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);assert.equal(await page.locator('.results-page.active').getAttribute('data-page'),'2');assert.match(await page.locator('.results-page-counter').innerText(),/101\s*[-–]\s*164/);check('Atualizar mantém a segunda página');
  await page.locator('.results-page[data-page="first"]').click();await page.waitForFunction(()=>/1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || ''));check('Ícone de primeira página retorna ao início');
  await page.locator('.results-page[data-page="next"]').click();await page.waitForFunction(()=>/101\s*[-–]\s*164\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || ''));check('Ícone de próxima página avança');
  await page.locator('.results-page[data-page="prev"]').click();await page.waitForFunction(()=>/1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.results-page-counter')?.textContent || ''));check('Ícone de página anterior retorna');
  await search('firewall');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='6 contratações');assert.equal(await page.locator('.results-page.active').getAttribute('data-page'),'1');check('Novos critérios voltam à página 1');
  const tabRequests=[];const observeTabs=request=>{if(['details','documentRelated'].includes(request.method) && request.payload.document.type==='edital')tabRequests.push(request);};page.on(serviceEvent,observeTabs);
  await page.locator('.results-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#detail-tab-detalhes').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#detail-panel-detalhes dt').count(),12);check('Detalhes abre com seis abas e os doze campos solicitados');
  await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(button=>button.dataset.state==='loaded'));assert.equal(tabRequests.length,5);check('Cinco listagens carregam em background antes da troca de abas');
  assert.equal(await page.locator('#details-content .detail-links').count(),0);assert.equal(await page.locator('.details-actions #details-links a').count(),1);assert.equal(Math.round((await page.locator('#details-dialog').boundingBox()).width),888);check('Links junto ao botão de fechar e painel ampliado em 20%');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/details-tabs-desktop.png`});
  await page.locator('#detail-tab-detalhes').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#detail-tab-itens').getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await page.locator('#detail-tab-historico').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('#detail-tab-detalhes').getAttribute('aria-selected'),'true');check('Teclado navega entre abas com foco e seleção sincronizados');
  await page.locator('#detail-tab-itens').click();await page.locator('.item-card').first().waitFor();assert.match(await page.locator('.item-card').first().innerText(),/Homologado/);check('Detalhes carregam itens automaticamente');
  for(const [resource,pattern]of [['arquivos',/Baixar arquivo/],['atas',/Vigência/],['contratos',/Valor global/],['historico',/Justificativa/]]) {
    const section=page.locator(`.related-section[data-resource="${resource}"]`);await page.locator(`#detail-tab-${resource}`).click();await section.locator('.related-card').first().waitFor();assert.match(await section.innerText(),pattern);check(`Aba ${resource} exibe a listagem carregada`);
  }
  assert.equal(tabRequests.length,5);check('Trocar abas preserva dados sem repetir consultas');
  for(const resource of ['arquivos','historico']) {
    const section=page.locator(`.related-section[data-resource="${resource}"]`);await page.locator(`#detail-tab-${resource}`).click();assert.equal(await section.locator('.related-card').count(),10);
    await section.getByRole('button',{name:new RegExp(`^Próxima página de `)}).click();await page.waitForFunction(r=>document.querySelector(`.related-section[data-resource="${r}"] .item-pager [aria-current="page"]`)?.dataset.page==='2',resource);
    assert.equal(await section.locator('.related-card').count(),2);assert.equal(await section.locator('.item-pager [data-page="next"]').isDisabled(),true);check(`Paginação de ${resource} alcança a última página`);
  }
  const fileLink=page.locator('.related-section[data-resource="arquivos"] .related-card a').first();assert.equal(await fileLink.getAttribute('target'),'_blank');assert.equal(await fileLink.getAttribute('rel'),'noopener noreferrer');assert.match(await fileLink.getAttribute('href'),/^https:\/\/pncp.gov.br\//);
  await page.locator('#detail-tab-detalhes').click();const previousViewport=page.viewportSize();
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    await page.locator('#details-dialog').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
    assert.equal(await page.locator('#details-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
    if(width<=700)await page.locator('#details-section').selectOption('historico');else await page.locator('#detail-tab-historico').click();
    assert(await page.locator('#detail-panel-historico').isVisible());
    if(width<=700)await page.locator('#details-section').selectOption('detalhes');else await page.locator('#detail-tab-detalhes').click();
  }
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/details-tabs-mobile.png`});
  await page.setViewportSize(previousViewport);check('Abas, listagens e links cabem no painel em telas menores');
  await page.locator('#details-dialog .close-dialog').click();page.off(serviceEvent,observeTabs);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^compras-demo-/);assert.equal(await page.locator('#export-dialog').count(),0);check('CSV baixado diretamente por nova coleta, sem confirmação');
  await page.locator('#filters-button').click();await selectFilterOptions('ufs','GO');await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='0 contratações');check('Filtro nativo UF aplicado no serviço');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await filter('srp').selectOption('false');
  const srpRequest=waitQuery(input=>input.pncp_filters.srp===false);
  await page.locator('#apply-filters').click();assert.equal((await srpRequest).pncp_filters.srp,false);
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratações');check('Filtro SRP envia false e exibe somente registros correspondentes');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();
  for(const [name,ids]of [['fontes',['3','5']],['modos_disputa',['1','2']]]){
    await selectFilterOptions(name,ids);
  }
  const conditions=['indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional'];
  for(const name of conditions){await filter(name).selectOption('false');}
  const documentaryRequest=waitQuery(input=>input.pncp_filters.fontes?.length===2);
  await page.locator('#apply-filters').click();const documentaryFilters=(await documentaryRequest).pncp_filters;
  assert.deepEqual(documentaryFilters.fontes,['3','5']);assert.deepEqual(documentaryFilters.modos_disputa,['1','2']);assert(conditions.every(name=>documentaryFilters[name]===false));
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='11 contratações');check('Origem, modo de disputa e cinco condições documentais são aplicados juntos');
  await page.locator('#filters-button').click();
  for(const name of conditions){assert.equal(await filter(name).inputValue(),'false');}
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();check('Editar filtros documentais preserva Não');
  const documentaryDownload=page.waitForEvent('download');await page.locator('#export-button').click();const exported=await documentaryDownload;
  const documentaryCsv=await readFile(await exported.path(),'utf8');assert.equal(documentaryCsv.split('\r\n').length,13);check('CSV usa os mesmos filtros documentais e exporta todas as onze contratações');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();
  for(const [name,ids]of [['criterios_julgamento',['7']],['categorias_leilao',['1']],['beneficios',['1']]]){
    assert.match(await page.locator('#filter-groups').innerText(),/Os detalhes mostram todos os itens/);
    await selectFilterOptions(name,ids);
  }
  const itemConditions=['incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional','possui_emenda_parlamentar'];
  for(const name of itemConditions){await filter(name).selectOption('true');}
  const itemRequest=waitQuery(input=>input.pncp_filters.beneficios?.includes('1'));
  await page.locator('#apply-filters').click();const itemFilters=(await itemRequest).pncp_filters;assert(itemConditions.every(name=>itemFilters[name]===true));assert.deepEqual(itemFilters.categorias_leilao,['1']);
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='6 contratações');check('Emenda e seis filtros de itens são aplicados juntos');
  await page.locator('.results-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});await page.locator('#detail-tab-itens').click();await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===2);
  assert.match(await page.locator('.item-card').nth(1).innerText(),/Item complementar/);await page.locator('#details-dialog .close-dialog').click();check('Detalhes preservam os dois itens após a pesquisa filtrada');
  const itemDownload=page.waitForEvent('download');await page.locator('#export-button').click();const itemExport=await itemDownload;assert.equal((await readFile(await itemExport.path(),'utf8')).split('\r\n').length,8);check('CSV exporta seis contratações, sem multiplicar linhas pelos itens');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await filter('codigo_ibge').fill('5300108');
  const ibgeRequest=waitQuery(input=>input.pncp_filters.codigo_ibge==='5300108');
  await page.locator('#apply-filters').click();assert.equal((await ibgeRequest).pncp_filters.codigo_ibge,'5300108');check('Código IBGE preservado como texto na pesquisa');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratações');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await selectFilterOptions('amparos_legais',['19','98']);
  await selectFilterOptions('normativos_base','1');
  await page.waitForFunction(()=>document.querySelector('#legal-error').textContent.includes('incompatíveis') && !document.querySelector('#apply-filters').disabled);
  const legalRequest=waitQuery(input=>input.pncp_filters.normativos_base?.includes('1'));
  await page.locator('#apply-filters').click();const legalFilters=(await legalRequest).pncp_filters;assert.deepEqual(legalFilters.amparos_legais,['19']);assert.deepEqual(legalFilters.normativos_base,['1']);check('Normativo reconcilia amparos legais e aplica os critérios válidos');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='11 contratações');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await filter('anos').click();assert.equal(await page.locator('#filter-suggestions-anos .suggestion').innerText(),'2026');await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();check('Domínio de anos no formato real do PNCP');
  assert.equal(await addEveryFilter('edital'),71);check('Todos os 71 filtros de contratações podem ser preenchidos e aplicados no navegador');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#document-type').selectOption('contrato');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratos');
  assert(await page.locator('.results-col[data-field="valor_global"]').isVisible());assert.equal(await page.locator('.results-col[data-field="valor_total_estimado"]').count(),0);check('Troca para contratos consulta a fonte e apresenta as colunas próprias');
  await page.locator('#filters-button').click();await page.locator('#draft-status').selectOption('vigente');await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='16 contratos');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratos');check('Status Vigentes usa o domínio temporal de contratos e limpar mantém o tipo');
  const detailRequests=[];const observe=r=>{if(r.method==='details')detailRequests.push(r);};page.on(serviceEvent,observe);
  await page.locator('.results-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(button=>button.dataset.state==='loaded'));
  assert.equal(await page.locator('#detail-panel-detalhes dt').count(),34);assert.match(await page.locator('#details-content').innerText(),/Valor inicial/);assert.equal(await page.locator('.items-section').count(),0);assert.equal(detailRequests.length,0);check('Contrato carrega os dados nativos e cinco listas sem confundir seu sequencial com a compra');
  for(const resource of ['empenhos','instrumentocobranca','termos']){
    await page.locator(`#detail-tab-${resource}`).click();const section=page.locator(`#detail-panel-${resource}`);assert.equal(await section.locator('.related-card').count(),1);
    await section.locator('.related-card > button').first().click();await section.locator('.related-extra').waitFor({state:'visible'});
    if(resource==='termos')await section.locator('.related-extra a').first().waitFor();else await section.locator('.related-extra dl').waitFor();
    check(`Contrato exibe ${resource} e consulta os detalhes do registro selecionado`);
  }
  await page.locator('#detail-tab-detalhes').click();if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/contract-details-desktop.png`});
  await page.locator('#details-dialog .close-dialog').click();page.off(serviceEvent,observe);
  await page.locator('.results-row').filter({hasText:'Contrato de demonstração nº 2/2026'}).click();await page.waitForFunction(()=>document.querySelector('#detail-tab-historico')?.textContent==='Histórico (?)');await page.locator('#detail-tab-historico').click();
  const unknownHistory=page.locator('#detail-panel-historico'),historyNext=unknownHistory.getByRole('button',{name:'Próxima página de Histórico'}),historyPrevious=unknownHistory.getByRole('button',{name:'Página anterior de Histórico'});
  assert.equal(await unknownHistory.locator('.related-card').count(),2);assert.match(await unknownHistory.locator('.items-status').innerText(),/Quantidade desconhecida/);assert.equal(await unknownHistory.locator('.item-pager span').innerText(),'Página 1');
  await historyNext.click();await page.waitForFunction(()=>document.querySelector('#detail-panel-historico .item-pager span').textContent==='Página 2');assert.equal(await unknownHistory.locator('.related-card').count(),1);assert.equal(await historyNext.isEnabled(),true);
  await historyNext.click();await page.waitForFunction(()=>document.querySelector('#detail-panel-historico .item-pager span').textContent==='Página 3');assert.equal(await historyNext.isDisabled(),true);assert.equal(await historyPrevious.isEnabled(),true);assert.match(await unknownHistory.locator('.items-status').innerText(),/Fim do histórico/);assert.match(await unknownHistory.locator('.related-list').innerText(),/Nenhum registro/);assert.equal(await page.locator('#detail-tab-historico').innerText(),'Histórico (?)');
  await historyPrevious.click();await page.waitForFunction(()=>document.querySelector('#detail-panel-historico .item-pager span').textContent==='Página 2');assert.equal(await unknownHistory.locator('.related-card').count(),1);assert.equal(await historyNext.isEnabled(),true);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#details-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);await page.setViewportSize({width:1440,height:1000});
  await page.locator('#details-dialog .close-dialog').click();check('Histórico de contrato com contagem divergente exibe total desconhecido e permite avançar até uma página vazia');
  await page.locator('#filters-button').click();await selectFilterOptions('tipos_contrato','1');await filter('possui_nfe').selectOption('true');await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='8 contratos');
  const contractDownload=page.waitForEvent('download');await page.locator('#export-button').click();const exportedContracts=await contractDownload,contractCsv=await readFile(await exportedContracts.path(),'utf8');assert.equal(contractCsv.split('\r\n').length,10);assert(contractCsv.split('\r\n')[0].includes('"valor_global"'));check('Filtros exclusivos de contratos e CSV de oito contratos usam os mesmos critérios');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratos');assert.equal(await addEveryFilter('contrato'),32);check('Todos os 32 filtros de contratos podem ser preenchidos e aplicados no navegador');
  assert.deepEqual(await page.locator('#document-type option').evaluateAll(nodes=>nodes.map(n=>n.textContent)),['Editais e Avisos de Contratações','Atas de Registro de Preços','Contratos']);
  await page.locator('#document-type').selectOption('ata');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='24 atas');
  assert(await page.locator('.results-col[data-field="cancelado"]').isVisible());assert.equal(await page.locator('.results-col[data-field="valor_global"]').count(),0);check('Os três tipos oficiais estão disponíveis e atas apresentam colunas próprias');
  const ataRequests=[];const observeAta=r=>{if(['documentDetails','documentRelated'].includes(r.method) && r.payload.document.type==='ata')ataRequests.push(r);};page.on(serviceEvent,observeAta);
  await page.locator('.results-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(button=>button.dataset.state==='loaded'));
  assert.equal(ataRequests.length,5);assert.equal(await page.locator('#detail-panel-detalhes dt').count(),22);assert.match(await page.locator('#detail-panel-detalhes').innerText(),/Número da ata/);assert.equal(await page.locator('#detail-tab-itens').count(),0);assert.equal(await page.locator('#detail-tab-termos').count(),0);check('Ata carrega seus dados completos e quatro listas em background');
  await page.locator('#detail-tab-partesenvolvidas').click();assert.match(await page.locator('#detail-panel-partesenvolvidas').innerText(),/Gerenciadora/);await page.locator('#detail-tab-contratos').click();assert.match(await page.locator('#detail-panel-contratos').innerText(),/Valor global/);assert.equal(ataRequests.length,5);check('Partes envolvidas e contratos vinculados da ata aparecem sem repetir consultas');
  await page.locator('#detail-tab-detalhes').click();const ataOrigin=page.locator('#detail-panel-detalhes a').first();assert.match(await ataOrigin.getAttribute('href'),/\/app\/editais\//);assert.equal(await ataOrigin.getAttribute('rel'),'noopener noreferrer');
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    await page.locator('#details-dialog').evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
    assert(await page.locator('#details-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
  }
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/ata-details-mobile.png`});await page.setViewportSize({width:1440,height:1000});check('Detalhes de ata conservam vínculos seguros e layout em telas menores');
  await page.locator('#details-dialog .close-dialog').click();page.off(serviceEvent,observeAta);
  await page.locator('#filters-button').click();await page.locator('#draft-status').selectOption('vigente');await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='12 atas');
  const ataDownload=page.waitForEvent('download');await page.locator('#export-button').click();const exportedAtas=await ataDownload,ataCsv=await readFile(await exportedAtas.path(),'utf8');assert.equal(ataCsv.split('\r\n').length,14);assert(ataCsv.split('\r\n')[0].includes('"cancelado"'));assert(!ataCsv.split('\r\n')[0].includes('"valor_global"'));check('Vigência e CSV de atas conservam os mesmos critérios e colunas');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='24 atas');assert.equal(await addEveryFilter('ata'),16);check('Todos os 16 filtros de atas podem ser preenchidos e aplicados no navegador');
  await page.locator('#document-type').selectOption('edital');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');check('Voltar a contratações restaura colunas e critérios do tipo escolhido');
  await page.locator('#columns-button').click();const checkbox=page.locator('#column-list label').filter({hasText:'CNPJ do órgão'}).locator('input');await checkbox.check();await page.locator('#columns-dialog .close-dialog').click();assert(await page.locator('.results-col[data-field="orgao_cnpj"]').isVisible());check('Seleção de colunas');
  await search('csv-lenta-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='164 contratações');
  let cancelledDownloads=0;const observeDownload=()=>cancelledDownloads++;page.on('download',observeDownload);
  await page.locator('#export-button').click();
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Coletando'));
  assert(await page.locator('#cancel-export-button').isVisible());await page.locator('#cancel-export-button').click();
  await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);await page.waitForTimeout(600);
  assert.equal(cancelledDownloads,0);assert.match(await page.locator('#notice').innerText(),/Exportação cancelada/);page.off('download',observeDownload);check('Progresso e botão Cancelar CSV interrompem a coleta sem baixar arquivo parcial');
  await search('cancelar-ui');assert.equal(await page.locator('#search-button').isVisible(),false);assert(await page.locator('#cancel-button').isVisible());
  await page.locator('#cancel-button').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Consulta cancelada'));
  assert.deepEqual(await page.locator('#notice').evaluate(node=>{const message=node.querySelector('#notice-message').getBoundingClientRect(),button=node.querySelector('#notice-close').getBoundingClientRect();return [Math.round(message.height*10)/10,Math.round(button.height*10)/10];}),[18.2,18.2]);
  assert(await page.locator('#search-button').isVisible());assert.equal(await page.locator('#cancel-button').isVisible(),false);check('Cancelar substitui Pesquisar durante o carregamento e restaura o botão ao cancelar');
  assert(await page.locator('#notice-close').isVisible());await page.locator('#notice-close').click();assert.equal(await page.locator('#notice').isVisible(),false);check('Aviso de status pode ser fechado');
  await search('lenta-ui');await page.locator('#search').fill('firewall');await page.locator('#search').press('Enter');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='6 contratações');await page.waitForTimeout(600);assert.equal(await page.locator('#result-title').innerText(),'6 contratações');check('Resposta antiga não substitui a consulta atual');
  await search('falha-ui');await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('INVALID_UPSTREAM'));assert(await page.locator('#notice').isVisible());assert(await page.locator('#export-button').isDisabled());assert.match(await page.locator('#notice').innerText(),/resultado anterior/);check('Falha visível e exportação desabilitada');
  await search('xss-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='1 contratação');assert.equal(await page.evaluate(()=>window.pwned),undefined);assert.match(await page.locator('.object-text').innerText(),/<img/);check('Marcação da fonte é exibida como texto');
  await search('');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:process.env.COMPRAS_QA_SCREENSHOT_DIR+'/desktop.png',fullPage:true});
  for(const width of [320,390,768,1057,1440]) {
    await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
    await page.locator('#header-content').evaluate(node=>{node.scrollLeft=0;});
    const fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,centers:[...document.querySelectorAll('#app-header .brand,#app-header input,#app-header button,#app-header select,#source-badge,#repository-link')].filter(node=>node.getClientRects().length).map(node=>{const rect=node.getBoundingClientRect();return rect.top+rect.height/2;})}));
    assert(fit.scroll<=fit.width,`Overflow da página em ${width}px`);
    if(width<=700){
      assert.equal(await page.locator('#header-content').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
      for(const id of ['search','search-button','filters-button','document-type','order']){
        const bounds=await page.locator(`#${id}`).boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width,`${id} fora da tela em ${width}px`);
      }
      await page.locator('#more-actions-button').click();
      assert.equal(await page.locator('#more-actions #repository-link').count(),1);
      await page.locator('#repository-link').focus();
      const bounds=await page.locator('#repository-link').boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width,`GitHub inacessível em ${width}px`);
      await page.keyboard.press('Escape');
    }else{
    assert(Math.max(...fit.centers)-Math.min(...fit.centers)<=1,`Cabeçalho quebrou linha em ${width}px`);
    const repository=await page.locator('#repository-link').boundingBox();
    assert(repository.x>=0 && repository.y>=0 && repository.y<=20,`GitHub fora do canto superior em ${width}px`);
    assert.equal(await page.locator('#header-content #repository-link').count(),1);
    await page.mouse.move(width-8,400);await page.locator('#export-button').evaluate(node=>node.blur());await page.locator('#export-button').focus();
    const focused=await page.locator('#export-button').boundingBox();assert(focused.x>=-.5 && focused.x+focused.width<=repository.x,`Exportar não ficou visível sem sobrepor o GitHub em ${width}px`);
    assert(focused.x+focused.width<=width,`Exportar ficou fora da tela em ${width}px`);
    const shifted=await page.locator('#repository-link').boundingBox(),scroll=await page.locator('#header-content').evaluate(node=>node.scrollLeft);
    assert(Math.abs(shifted.x-(repository.x-scroll))<1,`GitHub não acompanhou a rolagem em ${width}px`);
    assert(shifted.x>=focused.x+focused.width+4,`GitHub sobrepôs Exportar em ${width}px`);
    const tooltip=page.locator('#export-button-tooltip');await tooltip.waitFor({state:'visible'});
    const box=await tooltip.boundingBox();assert(box.x>=8 && box.x+box.width<=width-8,`Tooltip cortado em ${width}px`);
    await page.locator('#repository-link').focus();await page.locator('#repository-link-tooltip').waitFor({state:'visible'});
    const visibleRepository=await page.locator('#repository-link').boundingBox();
    assert(visibleRepository.x>=0 && visibleRepository.x+visibleRepository.width<=width,`GitHub não ficou acessível pelo teclado em ${width}px`);
    }
    await page.locator('#filters-button').click();
    const bodyHeight=await page.locator('.filters-body').evaluate(body=>body.scrollHeight);
    await filter('modalidades').click();
    const checkDropdown=async()=>{
      const geometry=await page.evaluate(()=>{
        const input=document.querySelector('#filter-modalidades').getBoundingClientRect(),popup=document.querySelector('#filter-suggestions-modalidades'),bounds=popup.getBoundingClientRect();
        return {left:input.left,bottom:input.bottom,width:input.width,popupLeft:bounds.left,popupTop:bounds.top,popupWidth:bounds.width,popupBottom:bounds.bottom,visible:popup.contains(document.elementFromPoint(bounds.left+bounds.width/2,bounds.bottom-3))};
      });
      assert.equal(geometry.popupLeft,geometry.left);assert.equal(geometry.popupTop,geometry.bottom+4);assert.equal(geometry.popupWidth,geometry.width);assert(geometry.popupBottom<=844 && geometry.visible);
    };
    await checkDropdown();assert.equal(await page.locator('.filters-body').evaluate(body=>body.scrollHeight),bodyHeight);
    await page.locator('.filters-body').evaluate(body=>body.scrollTop+=24);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await checkDropdown();
    if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/filter-dropdown-${width}.png`});
    const modalFit=await page.locator('#filters-dialog').evaluate(dialog=>{
      const body=dialog.querySelector('.filters-body'),footer=dialog.querySelector('.dialog-footer'),rect=dialog.getBoundingClientRect(),top=footer.getBoundingClientRect().top,fields=dialog.querySelectorAll('.filter-field'),buttonsFit=[...footer.querySelectorAll('button')].every(button=>{const bounds=button.getBoundingClientRect();return bounds.left>=rect.left && bounds.right<=rect.right;});
      body.scrollTop=body.scrollHeight;
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,scrolls:body.scrollHeight>body.clientHeight,overflow:body.scrollWidth>body.clientWidth,footerFixed:top===footer.getBoundingClientRect().top,buttonsFit,lastBottom:fields[fields.length-1].getBoundingClientRect().bottom,footerTop:top};
    });
    assert(modalFit.left>=0 && modalFit.right<=width && modalFit.top>=0 && modalFit.bottom<=844);
    assert(modalFit.scrolls && !modalFit.overflow && modalFit.footerFixed && modalFit.buttonsFit && modalFit.lastBottom<=modalFit.footerTop,JSON.stringify({width,...modalFit}));
    await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  }
  check('Modal ampliado mantém rolagem interna e ações visíveis nas cinco larguras de tela');
  await page.setViewportSize({width:390,height:844});await page.locator('#filters-button').click();assert(await page.locator('#filters-dialog').isVisible());await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();check('Cabeçalho responsivo mantém busca e filtros visíveis e painéis sem overflow da página');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:process.env.COMPRAS_QA_SCREENSHOT_DIR+'/mobile.png',fullPage:true});
  {assert.deepEqual(localApiRequests,[]);check('Distribuição estática executa todas as ações sem API local');}
  assert.deepEqual(errors,[]);check('Sem erros JavaScript não tratados');
  console.log(JSON.stringify({checks:checks.length,passed:checks,errors}));
}finally{await browser.close();await app.close();}
