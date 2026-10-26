import { createFilterOptionsCache } from '../src/browser/filter-options-cache.js';
import { readQueryUrl, writeQueryUrl } from '../src/browser/query-url.js';
import { readDetailUrl, writeDetailUrl } from '../src/browser/detail-url.js';
import { createResultsTable } from './results-table.js';
import { paginationIcons } from './pagination.js';
import { initializeMobileLayout } from './mobile-layout.js';
import { initializeSelectMenus } from './select-menu.js';
import { fmtInt, createCellRenderer } from './format.js';
import { createColumnLayout } from './column-layout.js';
import { createTooltips } from './tooltips.js';
import { createDetailsPanel } from './details-panel.js';
import { createFiltersPanel } from './filters-panel.js';
import { createSession } from './session.js';
import { createProgressEstimator } from './progress.js';

export function createApplicationUI(service,{document=globalThis.document,window=globalThis.window,tableFactory=createResultsTable,optionsCacheSettings={}}={}) {
// Elementos variam entre input, select, button e dialog; os contratos do DOM
// são verificados nos testes de navegador, não pelo verificador de tipos.
/** @param {string} id @returns {any} */
const $ = id => document.getElementById(id);
/** @param {string} tag @param {string} [text] @param {string} [className] @returns {any} */
const el = (tag, text, className) => { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; };
const clone = value => structuredClone(value);
const documentName=(type=state.query.document_type)=>state.schema.document_types.find(d=>d.id===type);
const TABLE_PAGE_SIZE = 100;
const RESULT_CACHE_TTL = 30000;
const RESULT_CACHE_LIMIT = 20;
const filterHeaderIcon='<svg class="header-filter-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M7 12h10m-7 5h4"/></svg>';
const filterLabel=name=>state.schema.capabilities.find(c=>c.name===name)?.label || name;
const state={schema:null,query:null,lastQuery:null,lastResult:null,table:null,placeholder:null,abort:null,status:'idle',draft:null,domains:null,domainAbort:null,legalAbort:null,legalPending:false,legalError:false,detailAbort:null,detailSelection:null,detailActivate:null,exportAbort:null,mobileView:'cards',resultCache:new Map()};
const session=createSession();
let filterOptionsCache;
let selectMenus;
let urlMode='replace',urlError=null,tableReady=false,queryRequested=false,exportWarning=false,searchFocusReturn=false;
const toolbarButtonIds=['theme-button','search-button','cancel-button','filters-button','clear-button','refresh-button','columns-button','export-button','cancel-export-button'];
const renderCell=createCellRenderer(el);
const columnLayout=createColumnLayout({window,state});
const tooltips=createTooltips({window,state,$,toolbarButtonIds});
const details=createDetailsPanel({document,window,service,state,session,$,el,documentName,openDialog,syncDetailUrl,refreshSelects:node=>selectMenus?.refresh(node)});
const filters=createFiltersPanel({document,window,service,state,session,$,el,documentName,openDialog,refreshSelects:node=>selectMenus?.refresh(node),getCache:()=>filterOptionsCache});
function resultCacheKey(query) { return writeQueryUrl('https://cache.invalid/',query,state.schema); }
function pruneResultCache() {
  const now=Date.now();
  for(const [key,entry]of state.resultCache)if(now-entry.at>=RESULT_CACHE_TTL)state.resultCache.delete(key);
  while(state.resultCache.size>RESULT_CACHE_LIMIT)state.resultCache.delete(state.resultCache.keys().next().value);
}
function takeCachedResult(query) {
  const key=resultCacheKey(query),entry=state.resultCache.get(key);
  if(!entry)return null;
  if(Date.now()-entry.at>=RESULT_CACHE_TTL){state.resultCache.delete(key);return null;}
  state.resultCache.delete(key);state.resultCache.set(key,entry);return entry.result;
}
function cacheableResult(result) {
  return {...result,data:result.data.map(row=>{
    if(!row._raw)return row;
    const lean={...row};delete lean._raw;return lean;
  })};
}
function storeCachedResult(query,result) {
  state.resultCache.set(resultCacheKey(query),{at:Date.now(),result:cacheableResult(result)});pruneResultCache();
}
function syncQueryUrl(query) {
  const mode=urlMode;urlMode='push';
  if(!window.location?.href || !window.history)return;
  const href=writeDetailUrl(writeQueryUrl(window.location.href,query,state.schema),state.detailSelection);
  if(href!==window.location.href)window.history[mode==='replace'?'replaceState':'pushState'](null,'',href);
}
function syncDetailUrl(mode='push') {
  if(!window.location?.href || !window.history)return;
  const href=writeDetailUrl(window.location.href,state.detailSelection);
  if(href!==window.location.href)window.history[mode==='replace'?'replaceState':'pushState'](null,'',href);
}
function readLocationState() {
  const href=new URL(window.location.href),selection=readDetailUrl(href.href);
  if(selection && !href.searchParams.has('tipos_documento'))href.searchParams.set('tipos_documento',selection.document.type);
  return {query:readQueryUrl(href.href,state.schema,TABLE_PAGE_SIZE),selection};
}
function invalidQueryUrl(error) {
  urlError=error;status('error');$('retry-button').hidden=true;$('clear-button').hidden=false;
  notice(`Parâmetros inválidos na URL: ${error.message} Corrija o link ou ajuste os critérios e pesquise novamente.`,'error');
}
function notice(message,kind='') { $('notice-message').textContent=message;$('notice').className='notice '+kind;$('notice').hidden=!message; }
function setMobileView(view) {
  if(!['cards','table'].includes(view))return;
  state.mobileView=view;state.table?.setMobileView?.(view);
  const button=$('mobile-view-button');if(!button)return;
  const next=view==='cards'?'table':'cards',label=next==='table'?'Ver como tabela':'Ver como cartões';
  button.setAttribute('aria-label',label);button.dataset.view=next;
}
function setConnectivity(message,kind='warning') {
  const node=$('connectivity-notice');if(!node)return;
  node.textContent=message || '';node.dataset.kind=kind;node.hidden=!message;
}
function updateOnlineStatus() {
  if(window.navigator?.onLine===false)setConnectivity('Sem conexão. Verifique a rede para consultar o PNCP.','offline');
  else if($('connectivity-notice')?.dataset.kind==='offline')setConnectivity('');
}
function isMobileViewport() {
  return window.matchMedia?.('(max-width:700px)')?.matches===true;
}
function exportMenuOpen() {
  return $('export-menu')?.matches?.(':popover-open')===true;
}
function closeExportMenu() {
  const menu=$('export-menu');
  if(exportMenuOpen())menu.hidePopover();
  $('export-button').setAttribute('aria-expanded','false');
}
function positionExportMenu() {
  const menu=$('export-menu'),anchor=isMobileViewport()?$('more-actions-button'):$('export-button');
  if(!menu || !anchor)return;
  const anchorRect=anchor.getBoundingClientRect(),viewportWidth=window.innerWidth;
  const width=menu.getBoundingClientRect().width || parseFloat(window.getComputedStyle?.(menu).width) || 290;
  menu.style.top=`${anchorRect.bottom+6}px`;
  menu.style.left=`${Math.max(8,Math.min(anchorRect.right-width,viewportWidth-width-8))}px`;
  menu.style.right='auto';
  menu.style.maxHeight=`${Math.max(120,(window.visualViewport?.height || window.innerHeight)-anchorRect.bottom-14)}px`;
}
function enabledExportOptions() {
  return [$('export-all-button'),$('export-page-button')].filter(option=>option && !option.disabled);
}
function updateExportButton() {
  const busy=!!state.exportAbort,ready=['success','empty'].includes(state.status),hasPage=!!state.lastResult?.data?.length;
  $('export-button').disabled=busy || !ready;
  $('export-all-button').disabled=busy || !ready;
  $('export-page-button').disabled=busy || !ready || !hasPage;
  $('mobile-export-all-button').disabled=busy || !ready;
  $('mobile-export-page-button').disabled=busy || !ready || !hasPage;
  $('export-button').setAttribute('aria-busy',String(busy));
  $('mobile-export-all-button').setAttribute('aria-busy',String(busy));
  $('mobile-export-page-button').setAttribute('aria-busy',String(busy));
  $('cancel-export-button').hidden=!busy;
  if(!busy)$('cancel-export-button-tooltip').hidden=true;
  $('export-button-tooltip').textContent=busy?'Consultando e gerando CSV…':'Exportar';
  if(busy)$('export-button-tooltip').hidden=true;
  $('export-button').setAttribute('aria-label',busy?'Gerando CSV':'Exportar');
  if(busy || !ready)closeExportMenu();
}
function status(value,query=state.query) {
  const searchHadFocus=document.activeElement===$('search-button'),cancelHadFocus=document.activeElement===$('cancel-button');
  state.status=value;
  const busy=value==='loading';
  if(busy){tooltips.hideTooltips();$('result-status').textContent='';}
  $('table-loader').hidden=!busy;
  $('results-table').setAttribute('aria-busy',String(busy));$('results-table').inert=busy;
  state.table?.setStatus(value);
  if(busy) {
    const label=documentName(query.document_type).plural;
    $('table-loader-title').textContent=query.page>1?`Carregando página ${fmtInt(query.page)}`:state.lastResult?`Atualizando ${label}`:`Carregando ${label}`;
    $('table-loader-message').textContent='Consultando o PNCP. Aguarde um instante.';
  }
  $('search-button').hidden=busy;$('cancel-button').hidden=!busy;$('retry-button').hidden=value!=='error';
  if(!busy)$('cancel-button-tooltip').hidden=true;
  $('refresh-button').disabled=!state.lastQuery || busy;
  updateExportButton();
  $('search-button').disabled=false;
  if(busy && searchHadFocus){searchFocusReturn=true;$('cancel-button').focus({preventScroll:true});}
  else if(!busy && searchFocusReturn && (cancelHadFocus || document.activeElement===$('cancel-button') || document.activeElement===document.body)){searchFocusReturn=false;$('search-button').focus({preventScroll:true});}
  else if(!busy)searchFocusReturn=false;
}
function openDialog(id) { tooltips.hideTooltips();const dialog=$(id);if(!dialog.open)dialog.showModal(); }
function closeDialog(dialog) { dialog.close(); }
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')tooltips.hideTooltips();
});
for(const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)closeDialog(dialog);}});
  dialog.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>closeDialog(dialog)));
}
function updateCriteria() {
  const q=state.query,order=$('order');order.replaceChildren();
  for(const value of state.schema.orders_by_document[q.document_type]){const option=el('option',state.schema.order_labels[value]);option.value=value;order.append(option);}
  order.value=q.order;
  $('document-type').value=q.document_type;$('search').value=q.q;
  const count=Object.keys(q.pncp_filters).length+(q.status==='todos'?0:1),filterLabelText=count?`Filtros (${fmtInt(count)} ${count===1?'ativo':'ativos'})`:'Filtros';
  $('filter-count').hidden=!count;$('filter-count').textContent=String(count);$('clear-button').hidden=!count && !q.q;
  $('filters-button').setAttribute('aria-label',filterLabelText);$('filters-button-tooltip').textContent=filterLabelText;
  if($('clear-button').hidden)$('clear-button-tooltip').hidden=true;
  $('native-chips').replaceChildren();
  for(const [key,value]of Object.entries(q.pncp_filters)) {
    const cap=state.schema.capabilities.find(c=>c.name===key),options=state.domains?.filters[cap?.domain] || [];
    const label=Array.isArray(value)?value.map(id=>options.find(o=>o.id===id)?.label || id).join(', '):typeof value==='boolean'?(value?'Sim':'Não'):String(value);
    $('native-chips').append(el('span',`${filterLabel(key)}: ${label}`,'filter-chip'));
  }
  selectMenus?.refresh();
}
function mergeDomains(domains) {
  if(!domains?.filters)return;
  state.domains={...domains,filters:{...state.domains?.filters,...domains.filters}};
}
async function hydrateDomains(type) {
  if(!filterOptionsCache || !state.schema || !state.query || state.query.document_type!==type || !Object.keys(state.query.pncp_filters).length)return;
  const caps=state.schema.capabilities.filter(cap=>cap.domain && !cap.reserved && cap.documents.includes(type));
  const activeDomains=new Set(Object.keys(state.query.pncp_filters).map(name=>caps.find(cap=>cap.name===name)?.domain).filter(Boolean));
  const fields=new Map(caps.filter(cap=>activeDomains.has(cap.domain)).map(cap=>[cap.name,cap]));
  const requests=[{type},...[...fields.values()].map(cap=>({type,field:cap.name}))];
  for(const request of requests){
    try {
      const domains=await filterOptionsCache.get(request);
      if(state.query?.document_type!==type)return;
      mergeDomains(domains);
    } catch { /* As opções continuam indisponíveis; os filtros seguem funcionando. */ }
  }
  if(state.query?.document_type===type)updateCriteria();
}
function renderCard(doc) {
  const content=el('div'),heading=el('h2'),open=el('button',doc.titulo || 'Documento sem título','result-card-open');
  open.type='button';open.setAttribute('aria-label',`Ver detalhes: ${doc.titulo || 'documento'}`);heading.append(open);
  const object=el('p',doc.objeto_compra || 'Objeto não informado.','result-card-object');
  const organ=el('p',doc.orgao_nome || 'Órgão não informado.','result-card-organ');
  const location=el('p',[doc.municipio_nome,doc.uf].filter(Boolean).join(' / ') || 'Local não informado.','result-card-location');
  content.append(heading,object,organ,location);
  const fields=el('dl',undefined,'result-card-values'),kind=doc.tipo_documento;
  const names=kind==='edital'?['valor_total_estimado','data_publicacao_pncp']:kind==='contrato'?['valor_global','data_inicio_vigencia']:['data_inicio_vigencia','data_fim_vigencia'];
  for(const name of names){
    const column=state.schema.columns_by_document[kind].find(column=>column.field===name),pair=el('div'),value=el('dd');
    value.append(renderCell(doc[name],column));pair.append(el('dt',column.title),value);fields.append(pair);
  }
  content.append(fields);
  if(kind==='edital')content.append(renderCell(doc.situacao_compra_nome_pncp,{field:'situacao_compra_nome_pncp'}));
  else if(kind==='ata' && doc.cancelado!==null && doc.cancelado!==undefined)content.append(el('span',doc.cancelado?'Cancelada':'Não cancelada','status-cell'));
  return content;
}
function columnAction(field,action) {
  const definition=state.schema.columns.find(column=>column.field===field);
  if(!definition)return;
  if(action==='filter' && (definition.domain || definition.native_range))return filters.open(definition);
  if(!definition.native_order?.[action])return;
  state.query.order=definition.native_order[action];
  updateCriteria();return execute();
}
function hasActiveCriteria(query) { return !!(query.q || query.status!=='todos' || Object.keys(query.pncp_filters).length); }
function renderPlaceholder(query,empty) {
  state.placeholder.replaceChildren(el('p',empty?`Nenhum registro encontrado em ${documentName(query.document_type).label}.`:'Informe uma pesquisa e consulte os documentos do PNCP.'));
  if(!empty)return;
  const actions=el('div',undefined,'empty-actions');
  if(hasActiveCriteria(query)) {
    const clear=el('button','Limpar filtros','button');clear.type='button';clear.addEventListener('click',()=>{state.query=defaultQuery();updateCriteria();execute();});actions.append(clear);
  }
  const refresh=el('button','Atualizar','button');refresh.type='button';refresh.addEventListener('click',()=>loadPage(state.query.page,'push',{force:true}));actions.append(refresh);
  state.placeholder.append(actions);
}
function renderResult(result,query) {
  state.lastQuery=clone(query);state.lastResult=result;
  if(window.navigator?.onLine!==false)setConnectivity('');
  $('result-info').hidden=false;
  renderPlaceholder(query,result.data.length===0);
  state.table.setSortOrder?.(query.order);
  const first=result.data.length?(result.page-1)*result.size+1:0;
  const last=result.data.length?first+result.data.length-1:0;
  $('result-range').textContent=`Exibindo ${fmtInt(first)}-${fmtInt(last)} de `;$('result-range').hidden=false;
  const names=documentName(query.document_type);
  $('result-title').textContent=`${fmtInt(result.total)} ${names[result.total===1?'singular':'plural']}`;
  $('result-status').textContent=result.data.length?`${fmtInt(result.total)} ${names[result.total===1?'singular':'plural']}. Exibindo ${fmtInt(first)} a ${fmtInt(last)}.`:`Nenhum registro encontrado em ${names.label}.`;
  const windowWarning=result.warnings.find(w=>w.code==='WINDOW_LIMITED');
  $('window-warning').hidden=!windowWarning;
  $('window-warning-tooltip').textContent=windowWarning?.message || '';
  tooltips.hideWindowTooltip();
  const warnings=result.warnings.filter(w=>w.code!=='WINDOW_LIMITED');
  notice(warnings.map(w=>w.message).join('\n'),warnings.length?'warning':'');
  if(exportWarning){notice('A exportação em andamento foi cancelada pela nova consulta.','warning');exportWarning=false;}
  state.table.renderPage({rows:result.data,page:result.page,pageSize:result.size,lastPage:result.last_page});
  status(result.data.length?'success':'empty');
}
async function loadResultsPage(targetPage,{force=false,cache=false}={}) {
  if(!state.query)return {data:[],last_page:1,last_row:0};
  queryRequested=true;
  const query=clone(state.query);
  query.page=Number(targetPage || 1);query.size=TABLE_PAGE_SIZE;
  state.query.page=query.page;urlError=null;
  const supersededExport=!!state.exportAbort;
  state.abort?.abort();state.exportAbort?.abort();session.next('export');state.exportAbort=null;
  if(supersededExport)exportWarning=true;
  const seq=session.next('query');const controller=new AbortController();state.abort=controller;
  const cached=cache && !force?takeCachedResult(query):null;
  if(cached){state.abort=null;syncQueryUrl(query);renderResult(cached,query);return cached;}
  status('loading',query);
  notice('');
  try {
    syncQueryUrl(query);
    const result=await service.call('execute',{query},{signal:controller.signal});
    if(!session.current('query',seq))throw new DOMException('Resposta anterior descartada.','AbortError');
    storeCachedResult(query,result);renderResult(result,query);setConnectivity('');return result;
  }catch(error) {
    if(session.current('query',seq)) {
      exportWarning=false;
      if(error.name==='AbortError'){status('cancelled');notice('Consulta cancelada. Nenhum novo resultado foi aplicado.','warning');}
      else {status('error');$('notice').dataset.code=error.code || '';notice(`${error.message}${state.lastResult?'\nA tabela mantém o resultado anterior.':''}`,'error');if(error.retryable || ['PNCP_UNAVAILABLE','PNCP_TRANSPORT_ERROR','PNCP_TIMEOUT','OPERATION_TIMEOUT'].includes(error.code))setConnectivity('O PNCP está instável. A tabela mantém o último resultado confirmado.','warning');}
    }
    throw error;
  }finally{if(session.current('query',seq))state.abort=null;}
}
/** @param {number} page @param {string} [mode] @param {{cache?: boolean, force?: boolean}} [options] */
function loadPage(page,mode='push',options={cache:true}) {
  state.query.page=page;urlMode=mode;
  return loadResultsPage(page,options).catch(()=>{});
}
function execute() {
  details.close(false);
  state.query.q=$('search').value;state.query.order=$('order').value;
  urlError=null;
  updateCriteria();
  return loadPage(1,'push',{force:true});
}
function defaultQuery(type=state.query?.document_type || 'edital') {return {api_version:'2.0',document_type:type,q:'',status:'todos',pncp_filters:{},order:'-data',page:1,size:TABLE_PAGE_SIZE};}
function tableColumnDefinitions() {
  const columns=state.schema.columns,base=[columns.find(c=>c.field==='titulo'),...columns.filter(c=>c.field!=='titulo')].filter(Boolean);
  const layout=columnLayout.read(state.query?.document_type),byField=new Map(base.map(column=>[column.field,column])),ordered=[];
  for(const field of layout?.order || []){const column=byField.get(field);if(column){ordered.push(column);byField.delete(field);}}
  ordered.push(...byField.values());
  return ordered.map(column=>{
    const width=Number(layout?.width?.[column.field]),visible=layout && Object.hasOwn(layout.visible,column.field)?!!layout.visible[column.field]:!!column.visible;
    return {...column,width:Number.isFinite(width)?Math.max(85,Math.round(width)):column.width || 180,minWidth:85,visible,filterable:!!(column.domain || column.native_range)};
  });
}
function renderColumnChoices() {
  $('column-list').replaceChildren();
  const columns=state.table?.getColumns?.() || state.schema.columns;
  for(const column of columns) {
    const label=el('label',undefined,'checkbox-label'),input=el('input');input.type='checkbox';input.checked=!!column.visible;
    input.addEventListener('change',()=>state.table.setColumnVisibility(column.field,input.checked));label.append(input,document.createTextNode(column.title));$('column-list').append(label);
  }
}
function applyQuery(query,{preserveDetails=false}={}) {
  const type=query.document_type,typeChanged=type!==state.query.document_type;
  state.abort?.abort();state.exportAbort?.abort();filters.stop();state.legalAbort?.abort();
  session.next('query');session.next('domains');session.next('legal');
  $('filters-dialog').close();if(!preserveDetails)details.close(false);
  state.query=clone(query);state.domains=null;state.draft=null;urlError=null;
  if(typeChanged) {
    state.lastQuery=null;state.lastResult=null;
    $('result-info').hidden=true;$('result-title').textContent='Resultados';$('result-status').textContent='';$('window-warning').hidden=true;tooltips.hideWindowTooltip();
    state.schema.columns=state.schema.columns_by_document[type];state.table.clear();
    state.table.setColumns(tableColumnDefinitions());renderColumnChoices();
  }
  filters.renderStatuses();updateCriteria();void hydrateDomains(type);
}
function changeDocumentType() {
  const type=$('document-type').value;if(type===state.query.document_type)return;
  applyQuery(defaultQuery(type));return execute();
}
async function restoreQueryUrl() {
  if(!tableReady)return;
  try {
    const {query,selection}=readLocationState();
    const changed=!queryRequested || writeQueryUrl('https://query.invalid/',query,state.schema)!==writeQueryUrl('https://query.invalid/',state.query,state.schema);
    if(changed)applyQuery(query,{preserveDetails:true});
    let finishResults;const resultsReady=new Promise(resolve=>{finishResults=resolve;});
    const detailRestore=details.restore(selection,resultsReady);
    const results=changed?loadPage(query.page,'replace'):Promise.resolve();
    results.then(finishResults,finishResults);
    if(!changed)syncDetailUrl('replace');
    await Promise.all([results,detailRestore]);
  } catch(error) {
    details.close(false);state.abort?.abort();state.exportAbort?.abort();session.next('query');session.next('export');state.exportAbort=null;
    invalidQueryUrl(error);
  }
}
async function exportCsv(scope='all') {
  if(!state.lastQuery || state.exportAbort || !['success','empty'].includes(state.status))return;
  if(scope==='page' && !state.lastResult?.data?.length)return;
  const query=clone(state.lastQuery);if(scope==='page')query.page=state.lastResult.page;
  const seq=session.next('export');const controller=new AbortController();state.exportAbort=controller;
  const estimator=createProgressEstimator();
  updateExportButton();notice(scope==='page'?'Consultando o PNCP e gerando CSV da página atual. Os dados podem diferir da tabela.':'Consultando o PNCP e gerando CSV dos últimos critérios concluídos. Os dados podem diferir da tabela.');
  try {
    const result=await service.call('export',scope==='page'?{query,scope:'page'}:{query},{signal:controller.signal,onProgress:progress=>{
      if(!session.current('export',seq))return;
      const remaining=estimator.update({rows:progress.rows,total:progress.total});
      notice(`Coletando ${fmtInt(progress.rows)} de ${fmtInt(progress.total)} documentos para CSV…${remaining?` Cerca de ${remaining} s restantes.`:''}`);
    }});
    if(!session.current('export',seq) || controller.signal.aborted)return;
    const blob=new Blob(result.chunks,{type:result.mime});
    const href=URL.createObjectURL(blob),link=el('a');link.href=href;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),10000);
    notice(`${result.metadata.exported_rows} linhas exportadas${scope==='page'?` (página ${result.metadata.page})`:''}.`);
  }catch(error){if(session.current('export',seq) && error.name!=='AbortError'){$('notice').dataset.code=error.code || '';notice(`Falha ao exportar CSV: ${error.message}`,'error');}}
  finally{if(session.current('export',seq)){state.exportAbort=null;updateExportButton();}}
}
async function init() {
  state.schema=await service.call('schema');
  filterOptionsCache=createFilterOptionsCache(service,state.schema,{getStorage:()=>window.localStorage,...optionsCacheSettings});
  state.optionsReady=filterOptionsCache.preload();
  state.query=defaultQuery();
  try {if(window.location?.href)state.query=readLocationState().query;}
  catch(error){urlError=error;}
  state.schema.columns=state.schema.columns_by_document[state.query.document_type];
  filters.renderStatuses();
  state.placeholder=el('div','Informe uma pesquisa e consulte as contratações do PNCP.');
  const resultInfo=$('result-info');
  state.table=tableFactory({
    container:$('results-table'),columns:tableColumnDefinitions(),renderCell,renderCard,footerContent:resultInfo,
    placeholder:state.placeholder,paginationIcons,menuIcon:filterHeaderIcon,
    onPageChange:page=>loadPage(page),onOpenDocument:doc=>details.open(doc),onColumnAction:columnAction,onColumnChange:columnLayout.save,onSort:columnAction,
  });
  resultInfo.hidden=false;
  initializeMobileLayout({document,window});
  selectMenus=initializeSelectMenus({document,window});
  $('mobile-view-button').addEventListener('click',()=>setMobileView(state.mobileView==='cards'?'table':'cards'));
  $('mobile-export-all-button').addEventListener('click',()=>exportCsv());
  $('mobile-export-page-button').addEventListener('click',()=>exportCsv('page'));
  const exportMenu=$('export-menu');
  $('export-all-button').addEventListener('click',()=>{closeExportMenu();return exportCsv();});
  $('export-page-button').addEventListener('click',()=>{closeExportMenu();return exportCsv('page');});
  $('export-button').addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp'].includes(event.key) || $('export-button').disabled || exportMenuOpen())return;
    event.preventDefault();exportMenu.showPopover?.();enabledExportOptions()[0]?.focus({preventScroll:true});
  });
  exportMenu.addEventListener('beforetoggle',event=>{if(event.newState==='open')positionExportMenu();});
  exportMenu.addEventListener('toggle',()=>{
    const open=exportMenuOpen();$('export-button').setAttribute('aria-expanded',String(open));
    if(open){positionExportMenu();enabledExportOptions()[0]?.focus({preventScroll:true});}
    else if(document.activeElement===document.body || exportMenu.contains?.(document.activeElement)){
      const trigger=isMobileViewport()?$('more-actions-button'):$('export-button');
      if(trigger && !trigger.disabled)trigger.focus({preventScroll:true});
    }
  });
  exportMenu.addEventListener('keydown',event=>{
    const options=enabledExportOptions();if(!options.length)return;
    const current=options.indexOf(document.activeElement),focus=option=>option.focus({preventScroll:true});
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      const next=current<0?(event.key==='ArrowDown'?0:options.length-1):(current+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      focus(options[next]);
    } else if(event.key==='Home'){event.preventDefault();focus(options[0]);}
    else if(event.key==='End'){event.preventDefault();focus(options[options.length-1]);}
    else if(event.key==='Escape'){
      event.preventDefault();closeExportMenu();const trigger=isMobileViewport()?$('more-actions-button'):$('export-button');
      if(trigger && !trigger.disabled)trigger.focus({preventScroll:true});
    } else if(event.key==='Tab')closeExportMenu();
  });
  window.addEventListener('resize',closeExportMenu);
  $('reset-columns').addEventListener('click',()=>{columnLayout.clear(state.query.document_type);state.table.setColumns(tableColumnDefinitions());renderColumnChoices();});
  $('clear-draft-filters').addEventListener('click',()=>filters.clearDraft());
  renderColumnChoices();
  $('document-type').addEventListener('change',changeDocumentType);
  $('app-header').addEventListener('focusin',event=>/** @type {any} */ (event.target).scrollIntoView({block:'nearest',inline:'nearest'}));
  $('search-form').addEventListener('submit',event=>{event.preventDefault();return execute();});
  $('filters-button').addEventListener('click',()=>filters.open());$('columns-button').addEventListener('click',()=>openDialog('columns-dialog'));
  $('refresh-button').addEventListener('click',async()=>{
    if(!state.lastQuery)return;
    const {page}=state.lastQuery;state.query=clone(state.lastQuery);updateCriteria();
    await loadPage(page,'push',{force:true});
  });
  $('retry-button').addEventListener('click',()=>loadPage(state.query.page,'push',{force:true}));
  $('cancel-button').addEventListener('click',()=>{state.abort?.abort();});
  $('cancel-export-button').addEventListener('click',()=>{state.exportAbort?.abort();notice('Exportação cancelada.');});
  $('notice-close').addEventListener('click',()=>{notice('');});
  $('order').addEventListener('change',()=>{state.query.order=$('order').value;return execute();});
  $('clear-button').addEventListener('click',()=>{state.query=defaultQuery();updateCriteria();return execute();});
  $('apply-filters').addEventListener('click',()=>{const draft=filters.apply();if(!draft)return;state.query=draft;$('filters-dialog').close();updateCriteria();return execute();});
  $('filters-dialog').addEventListener('close',()=>filters.onDialogClose());
  $('details-dialog').addEventListener('close',()=>{if(!$('details-dialog').open)details.close();});
  for(const id of toolbarButtonIds)tooltips.bindTooltip($(id),$(`${id}-tooltip`));
  tooltips.bindTooltip($('repository-link'),$('repository-link-tooltip'));
  $('window-warning').addEventListener('mouseenter',tooltips.showWindowTooltip);
  $('window-warning').addEventListener('mouseleave',tooltips.hideWindowTooltip);
  $('window-warning').addEventListener('focus',tooltips.showWindowTooltip);
  $('window-warning').addEventListener('blur',tooltips.hideWindowTooltip);
  window.addEventListener('resize',tooltips.hideTooltips);
  window.addEventListener('popstate',restoreQueryUrl);
  window.addEventListener('online',updateOnlineStatus);window.addEventListener('offline',updateOnlineStatus);updateOnlineStatus();
  document.addEventListener('keydown',event=>{
    const target=/** @type {any} */ (event.target),editable=target && (target.closest?.('input,textarea,select,[contenteditable="true"]') || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName) || target.isContentEditable);
    const dialogOpen=[...document.querySelectorAll('dialog')].some(dialog=>dialog.open);
    const shortcut=(event.key==='/' && !event.ctrlKey && !event.metaKey && !event.altKey) || ((event.ctrlKey||event.metaKey) && !event.altKey && event.key.toLowerCase()==='k');
    if(!shortcut || editable || dialogOpen)return;
    event.preventDefault();$('search').focus();$('search').select?.();
  });
  window.addEventListener('pagehide',event=>{if(!event.persisted){filterOptionsCache.close();state.table.destroy();}});
  document.addEventListener('scroll',event=>{
    const button=document.activeElement;
    // Ao focar uma ação em telas menores, o cabeçalho rola para torná-la visível.
    if(event.target===$('header-content') && (toolbarButtonIds.includes(button?.id) || button?.id==='repository-link')) {
      const tooltip=$(`${button.id}-tooltip`),anchor=button.getBoundingClientRect();
      if(!tooltip.hidden && anchor.left>=0 && anchor.right<=window.innerWidth) {
        tooltips.positionTooltip(button,tooltip);return;
      }
    }
    tooltips.hideTooltips();
  },true);
  updateCriteria();void hydrateDomains(state.query.document_type);setMobileView('cards');status('idle');
  state.started=Promise.resolve(state.table.ready).then(()=>{
    tableReady=true;if(window.location?.href)return restoreQueryUrl();if(urlError)invalidQueryUrl(urlError);else return loadPage(state.query.page,'replace');
  });
  state.started.catch(error=>notice(`Falha ao iniciar a pesquisa: ${error.message}.`,'error'));
}
const ready=init().catch(error=>{$('startup-error').hidden=false;$('startup-error').textContent=`Não foi possível iniciar a interface: ${error.message}. Recarregue a página.`;notice('Falha ao carregar o esquema da aplicação.','error');});

return {ready,state,loadResultsPage,setDraftFilter:filters.setDraftFilter};
}
