import { createFilterOptionsCache } from '../src/browser/filter-options-cache.js';
import { readQueryUrl, writeQueryUrl } from '../src/browser/query-url.js';
import { readDetailUrl, writeDetailUrl } from '../src/browser/detail-url.js';
import { compareDecimal } from '../src/validation.js';
import { createResultsTable } from './results-table.js';
import { paginationIcons } from './pagination.js';
import { initializeMobileLayout } from './mobile-layout.js';
import { initializeSelectMenus } from './select-menu.js';
import { fmtInt, createCellRenderer } from './format.js';
import { createColumnLayout } from './column-layout.js';
import { createTooltips } from './tooltips.js';
import { createDetailsPanel } from './details-panel.js';

export function createApplicationUI(service,{document=globalThis.document,window=globalThis.window,tableFactory=createResultsTable,optionsCacheSettings={}}={}) {
const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; };
const clone = value => structuredClone(value);
const documentName=(type=state.query.document_type)=>state.schema.document_types.find(d=>d.id===type);
const TABLE_PAGE_SIZE = 100;
const RESULT_CACHE_TTL = 30000;
const RESULT_CACHE_LIMIT = 20;
const filterHeaderIcon='<svg class="header-filter-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M7 12h10m-7 5h4"/></svg>';
const filterLabel=name=>state.schema.capabilities.find(c=>c.name===name)?.label || name;
const state={schema:null,query:null,lastQuery:null,lastResult:null,table:null,placeholder:null,seq:0,abort:null,status:'idle',draft:null,domains:null,domainAbort:null,domainSeq:0,legalAbort:null,legalSeq:0,legalPending:false,legalError:false,detailAbort:null,detailSeq:0,detailSelection:null,detailDoc:null,detailActivate:null,exportAbort:null,exportSeq:0,resultCache:new Map()};
let filterOptionsCache;
let selectMenus;
const filterFields=new Map();
let openFilterEditor=null;
let urlMode='replace',urlError=null,tableReady=false,queryRequested=false,exportWarning=false;
const toolbarButtonIds=['theme-button','search-button','cancel-button','filters-button','clear-button','refresh-button','columns-button','export-page-button','export-button','cancel-export-button'];
const renderCell=createCellRenderer(el);
const columnLayout=createColumnLayout({window,state});
const tooltips=createTooltips({window,state,$,toolbarButtonIds});
const details=createDetailsPanel({document,window,service,state,$,el,documentName,openDialog,syncDetailUrl,refreshSelects:node=>selectMenus?.refresh(node)});
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
function storeCachedResult(query,result) {
  state.resultCache.set(resultCacheKey(query),{at:Date.now(),result});pruneResultCache();
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
  state.table?.setMobileView?.(view);
  const select=$('results-view');if(select)select.value=view;
}
function setConnectivity(message,kind='warning') {
  const node=$('connectivity-notice');if(!node)return;
  node.textContent=message || '';node.dataset.kind=kind;node.hidden=!message;
}
function updateOnlineStatus() {
  if(window.navigator?.onLine===false)setConnectivity('Sem conexão. Verifique a rede para consultar o PNCP.','offline');
  else if($('connectivity-notice')?.dataset.kind==='offline')setConnectivity('');
}
function updateExportButton() {
  const busy=!!state.exportAbort,ready=['success','empty'].includes(state.status),hasPage=!!state.lastResult?.data?.length;
  $('export-button').disabled=busy || !ready;
  $('export-page-button').disabled=busy || !ready || !hasPage;
  $('export-button').setAttribute('aria-busy',String(busy));$('export-page-button').setAttribute('aria-busy',String(busy));
  $('cancel-export-button').hidden=!busy;
  if(!busy)$('cancel-export-button-tooltip').hidden=true;
  $('export-button-tooltip').textContent=busy?'Consultando e gerando CSV…':'Exportar CSV';
  $('export-page-button-tooltip').textContent=busy?'Consultando e gerando CSV…':'Exportar página atual';
  if(busy){$('export-button-tooltip').hidden=true;$('export-page-button-tooltip').hidden=true;}
  $('export-button').setAttribute('aria-label',busy?'Gerando CSV':'Exportar CSV');
  $('export-page-button').setAttribute('aria-label',busy?'Gerando CSV':'Exportar página atual');
}
function status(value,query=state.query) {
  state.status=value;
  const busy=value==='loading';
  if(busy)tooltips.hideTooltips();
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
  $('document-type').value=q.document_type;
  const count=Object.keys(q.pncp_filters).length+(q.status==='todos'?0:1);
  $('filter-count').hidden=!count;$('filter-count').textContent=String(count);$('clear-button').hidden=!count && !q.q;
  if($('clear-button').hidden)$('clear-button-tooltip').hidden=true;
  $('native-chips').replaceChildren();
  for(const [key,value]of Object.entries(q.pncp_filters)) {
    const cap=state.schema.capabilities.find(c=>c.name===key),options=state.domains?.filters[cap?.domain] || [];
    const label=Array.isArray(value)?value.map(id=>options.find(o=>o.id===id)?.label || id).join(', '):typeof value==='boolean'?(value?'Sim':'Não'):String(value);
    $('native-chips').append(el('span',`${filterLabel(key)}: ${label}`,'filter-chip'));
  }
  selectMenus?.refresh();
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
  if(action==='filter' && (definition.domain || definition.native_range))return openFilters(definition);
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
    const clear=el('button','Limpar filtros','button');clear.type='button';clear.addEventListener('click',()=>{state.query=defaultQuery();$('search').value='';updateCriteria();execute();});actions.append(clear);
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
  $('result-title').textContent=`${fmtInt(result.total)} ${documentName(query.document_type)[result.total===1?'singular':'plural']}`;
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
  state.abort?.abort();state.exportAbort?.abort();state.exportSeq++;state.exportAbort=null;
  if(supersededExport)exportWarning=true;
  const seq=++state.seq;const controller=new AbortController();state.abort=controller;
  const cached=cache && !force?takeCachedResult(query):null;
  if(cached){state.abort=null;syncQueryUrl(query);renderResult(cached,query);return cached;}
  status('loading',query);
  notice('');
  try {
    syncQueryUrl(query);
    const result=await service.call('execute',{query},{signal:controller.signal});
    if(seq!==state.seq)throw new DOMException('Resposta anterior descartada.','AbortError');
    storeCachedResult(query,result);renderResult(result,query);setConnectivity('');return result;
  }catch(error) {
    if(seq===state.seq) {
      exportWarning=false;
      if(error.name==='AbortError'){status('cancelled');notice('Consulta cancelada. Nenhum novo resultado foi aplicado.','warning');}
      else {status('error');$('notice').dataset.code=error.code || '';notice(`${error.message}${state.lastResult?'\nA tabela mantém o resultado anterior.':''}`,'error');if(error.retryable || ['PNCP_UNAVAILABLE','PNCP_TRANSPORT_ERROR','PNCP_TIMEOUT','OPERATION_TIMEOUT'].includes(error.code))setConnectivity('O PNCP está instável. A tabela mantém o último resultado confirmado.','warning');}
    }
    throw error;
  }finally{if(seq===state.seq)state.abort=null;}
}
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
function renderFilterStatuses() {
  const statuses=state.schema.statuses_by_document[state.query.document_type],statusNames={todos:'Todos',recebendo_proposta:'Recebendo propostas',propostas_encerradas:'Propostas encerradas',vigente:'Vigentes',nao_vigente:'Não vigentes'};
  $('draft-status').replaceChildren();for(const value of statuses){const option=el('option',statusNames[value] || value);option.value=value;$('draft-status').append(option);}
}
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
  state.abort?.abort();state.exportAbort?.abort();stopFilterEditors();state.legalAbort?.abort();
  state.seq++;state.domainSeq++;state.legalSeq++;
  $('filters-dialog').close();if(!preserveDetails)details.close(false);
  state.query=clone(query);state.domains=null;state.draft=null;urlError=null;
  $('search').value=query.q;
  if(typeChanged) {
    state.lastQuery=null;state.lastResult=null;
    $('result-info').hidden=true;$('result-title').textContent='Resultados';$('window-warning').hidden=true;tooltips.hideWindowTooltip();
    state.schema.columns=state.schema.columns_by_document[type];state.table.clear();
    state.table.setColumns(tableColumnDefinitions());renderColumnChoices();
  }
  renderFilterStatuses();updateCriteria();
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
    details.close(false);state.abort?.abort();state.exportAbort?.abort();state.seq++;state.exportSeq++;state.exportAbort=null;
    invalidQueryUrl(error);
  }
}
function stopFilterEditors() {
  closeFilterDropdown();
  state.domainAbort?.abort();state.domainSeq++;
  for(const editor of filterFields.values()){editor.suggestAbort?.abort();clearTimeout(editor.suggestTimer);editor.suggestSeq++;}
}
function currentEditor(editor) {
  return editor.draft===state.draft && editor.seq===state.domainSeq && $('filters-dialog').open;
}
function syncFilterEditor(editor) {
  if(!editor)return;
  const value=state.draft.pncp_filters[editor.cap.name];
  editor.clear.hidden=value===undefined;
  if(editor.selected) {
    editor.selected=(value || []).map(id=>editor.options?.find(o=>o.id===id) || editor.selected.find(o=>o.id===id) || {id,label:id});
    renderSelectedOptions(editor);updateFilterChoices(editor);
  } else editor.input.value=value===undefined?'':String(value);
  selectMenus?.refresh(editor.input);updateDraftActions();
}
function updateDraftActions() {
  if(!state.draft)return;
  const active=Object.keys(state.draft.pncp_filters).length,count=$('filter-active-count');
  if(count)count.textContent=active?`${active} ${active===1?'filtro ativo':'filtros ativos'}`:'Nenhum filtro ativo';
  $('clear-draft-filters').disabled=active===0;
}
function clearDraftFilters() {
  if(!state.draft)return;
  state.legalAbort?.abort();state.legalSeq++;state.legalPending=false;state.legalError=false;
  if($('legal-error'))$('legal-error').hidden=true;if($('apply-filters'))$('apply-filters').disabled=false;
  state.draft.pncp_filters={};
  for(const editor of filterFields.values())syncFilterEditor(editor);
  updateDraftActions();
}
async function setDraftFilter(name,value) {
  const draft=state.draft,previous=JSON.stringify(draft.pncp_filters[name]);
  if(value===undefined)delete draft.pncp_filters[name];else draft.pncp_filters[name]=value;
  syncFilterEditor(filterFields.get(name));
  if(name==='amparos_legais') {
    if(state.legalPending)return;
    state.legalAbort?.abort();state.legalSeq++;state.legalPending=false;state.legalError=false;$('apply-filters').disabled=false;$('legal-error').hidden=true;
    return;
  }
  if(name!=='normativos_base' || (previous===JSON.stringify(value) && !state.legalError && !filterFields.get('amparos_legais')?.input.disabled))return;
  state.legalAbort?.abort();const seq=++state.legalSeq,controller=new AbortController();state.legalAbort=controller;
  const editor=filterFields.get('amparos_legais');
  state.legalPending=true;state.legalError=false;$('apply-filters').disabled=true;$('legal-error').hidden=true;
  if(editor){if(openFilterEditor===editor)closeFilterDropdown();editor.input.disabled=true;editor.loadSeq++;}
  try {
    const domains=await getDomains(controller.signal,'amparos_legais');
    if(seq!==state.legalSeq || draft!==state.draft)return;
    const options=domains.filters.amparos_legais;
    if(!Array.isArray(options))throw new Error('O PNCP não forneceu os amparos deste normativo.');
    const ids=new Set(options.map(o=>o.id)),before=draft.pncp_filters.amparos_legais || [];
    const valid=before.filter(id=>ids.has(id));
    if(valid.length)draft.pncp_filters.amparos_legais=valid;else delete draft.pncp_filters.amparos_legais;
    if(editor)populateFilterOptions(editor,domains);
    $('legal-error').hidden=valid.length===before.length;
    $('legal-error').textContent='Amparos incompatíveis foram removidos. Confira a seleção antes de pesquisar.';
  }catch(error){if(seq===state.legalSeq && error.name!=='AbortError'){
    state.legalError=!!draft.pncp_filters.amparos_legais?.length;
    $('legal-error').textContent='Não foi possível conferir os amparos. Remova o filtro de amparo ou selecione novamente o normativo para tentar outra vez.';$('legal-error').hidden=false;
    if(editor)filterDomainError(editor,error);
  }}finally{if(seq===state.legalSeq){state.legalPending=false;$('apply-filters').disabled=state.legalError;}}
}
async function openFilters(column=null) {
  stopFilterEditors();state.legalAbort?.abort();state.legalSeq++;state.legalPending=false;state.legalError=false;$('apply-filters').disabled=false;
  $('legal-error').hidden=true;
  state.draft=clone(state.query);state.draft.q=$('search').value;
  renderFilterStatuses();
  $('draft-search').value=state.draft.q;$('draft-status').value=state.draft.status;
  filterFields.clear();$('filter-groups').replaceChildren();$('filter-popups').replaceChildren();
  $('filters-title').textContent=`Filtros · ${documentName().label}`;
  openDialog('filters-dialog');
  const controller=new AbortController();state.domainAbort=controller;
  const base=getDomains(controller.signal);base.catch(()=>{});
  const loads=[],target=column?.domain || column?.native_range?.[0];
  for(const groupName of ['Contratação','Item','Resultado do item','Fornecedor','Contrato']) {
    const caps=state.schema.capabilities.filter(c=>!c.reserved && c.state==='enabled' && c.group===groupName && c.documents.includes(state.draft.document_type));
    if(!caps.length)continue;
    const group=el('fieldset',undefined,'filter-group'),legend=el('legend',groupName==='Contratação' && state.draft.document_type!=='edital'?'Documento':groupName==='Contrato' && state.draft.document_type==='ata'?'Ata':groupName);
    group.append(legend);
    if(groupName==='Item' && state.draft.document_type==='edital')group.append(el('p','Filtros de itens, resultados e fornecedores selecionam contratações. Os detalhes mostram todos os itens, inclusive os que não correspondem ao filtro. Condições diferentes podem corresponder a itens ou resultados diferentes.','panel-note'));
    const grid=el('div',undefined,'filter-grid');group.append(grid);$('filter-groups').append(group);
    for(const cap of caps) {
      const editor=createFilterEditor(cap);filterFields.set(cap.name,editor);grid.append(editor.area);
      if(cap.domain)loads.push(loadFilterOptions(editor,controller.signal,cap.domain_source==='search' && !(cap.name==='amparos_legais' && state.draft.pncp_filters.normativos_base?.length)?base:undefined).then(()=>{
        if(cap.name===target && currentEditor(editor) && !editor.input.disabled && document.activeElement===editor.area)editor.input.focus({preventScroll:true});
      }));
    }
  }
  $('filters-dialog').querySelector('.filters-body')?.scrollTo(0,0);
  updateDraftActions();
  const editor=filterFields.get(target);
  if(editor && currentEditor(editor)) {
    editor.area.scrollIntoView({block:'center'});
    if(editor.input.disabled){editor.area.tabIndex=-1;editor.area.focus({preventScroll:true});}
    else editor.input.focus({preventScroll:true});
  }
  await Promise.all(loads);
}
async function getDomains(signal,field=null) {
  return filterOptionsCache.get({type:state.draft?.document_type || state.query.document_type,...(field==='amparos_legais'?{normatives:state.draft?.pncp_filters.normativos_base}:{}),field},{signal});
}
function createFilterEditor(cap) {
  const area=el('div',undefined,'filter-field');area.id=`filter-field-${cap.name}`;
  const label=el('label',cap.label || cap.name),input=el(cap.domain || cap.type==='boolean'?'select':'input');
  const heading=el('div',undefined,'filter-field-heading'),clear=el('button',undefined,'text-button filter-reset');clear.type='button';clear.hidden=true;clear.setAttribute('aria-label',`Limpar ${cap.label}`);
  clear.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const help=el('p',cap.help_text || '','filter-help');help.id=`filter-help-${cap.name}`;help.hidden=!help.textContent;
  const error=el('p',undefined,'inline-error');error.id=`filter-error-${cap.name}`;error.setAttribute('role','status');error.hidden=true;
  const editor={cap,area,input,help,error,clear,draft:state.draft,seq:state.domainSeq,loadSeq:0,suggestSeq:0};
  if(cap.domain && cap.cardinality==='multiple') {
    editor.input=el('input');editor.input.type='search';editor.input.placeholder=cap.domain_kind==='suggest'?'Digite ao menos 3 caracteres':'Buscar e selecionar opções';editor.input.autocomplete='off';
    editor.selected=[];
  } else if(cap.domain) {
    input.disabled=true;
  } else if(cap.type==='boolean') {
    for(const [value,text]of [['','Selecionar'],['true','Sim'],['false','Não']]){const option=el('option',text);option.value=value;input.append(option);}
  } else {
    input.type=cap.type==='date'?'date':cap.type==='integer'?'number':'text';
    if(cap.type==='decimal')input.inputMode='decimal';
    if(cap.input_hint)input.placeholder=cap.input_hint;
    if(cap.name==='codigo_ibge'){input.inputMode='numeric';input.maxLength=7;}
    if(cap.type==='integer'){input.min='0';input.step='1';}
  }
  editor.input.id=`filter-${cap.name}`;if(!help.hidden)editor.input.setAttribute('aria-describedby',help.id);label.setAttribute('for',editor.input.id);heading.append(label,clear);area.append(heading,editor.input,help);
  clear.addEventListener('click',()=>setDraftFilter(cap.name,undefined));
  if(editor.selected) {
    const selected=el('div',undefined,'selected-options');selected.id=`filter-selected-${cap.name}`;editor.selectedArea=selected;
    const suggestions=el('div',undefined,'suggestions filter-options-popup');suggestions.id=`filter-suggestions-${cap.name}`;suggestions.setAttribute('role','listbox');suggestions.setAttribute('aria-label',cap.label);suggestions.setAttribute('aria-multiselectable','true');suggestions.hidden=true;editor.suggestions=suggestions;
    editor.input.setAttribute('role','combobox');editor.input.setAttribute('aria-autocomplete','list');editor.input.setAttribute('aria-expanded','false');editor.input.setAttribute('aria-controls',suggestions.id);
    area.append(selected);$('filter-popups').append(suggestions);
    editor.input.addEventListener('focus',()=>openFilterDropdown(editor));
    editor.input.addEventListener('click',()=>openFilterDropdown(editor));
    editor.input.addEventListener('blur',()=>{if(openFilterEditor===editor)closeFilterDropdown();});
    editor.input.addEventListener('keydown',event=>filterDropdownKeydown(editor,event));
    editor.input.addEventListener('input',()=>searchFilterOptions(editor));
    editor.input.disabled=true;
  } else {
    editor.input.addEventListener(cap.domain || cap.type==='boolean'?'change':'input',()=>editFilter(editor));
  }
  area.append(error);syncFilterEditor(editor);
  return editor;
}
async function editFilter(editor) {
  if(!currentEditor(editor) || editor.input.disabled)return;
  const {cap,input}=editor;let value;
  if(cap.type==='list')value=editor.selected.map(o=>o.id);
  else value=input.value;
  if(value==='' || Array.isArray(value) && !value.length)value=undefined;
  else if(cap.type==='boolean')value=value==='true';
  else if(cap.type==='integer')value=Number(value);
  await setDraftFilter(cap.name,value);
}
function populateFilterOptions(editor,domains) {
  const {cap,input}=editor;
  // Suggest-only domains may be absent from /filters; typing still queries /suggest.
  const options=domains.filters[cap.domain] === undefined && cap.domain_kind==='suggest'?[]:domains.filters[cap.domain];
  if(!Array.isArray(options) || (!options.length && cap.domain_kind!=='suggest'))throw new Error('O PNCP não forneceu opções para este domínio.');
  state.domains={...domains,filters:{...state.domains?.filters,...domains.filters}};
  editor.options=cap.name==='anos'?[...options].sort((a,b)=>{
    const x=/^-?\d+(?:\.\d+)?$/.test(a.id),y=/^-?\d+(?:\.\d+)?$/.test(b.id);
    return x && y?compareDecimal(a.id,b.id):x?-1:y?1:a.label.localeCompare(b.label,'pt-BR');
  }):options;editor.error.hidden=true;
  const warning=domains.warnings?.find(w=>w.domain===cap.domain);
  if(warning){editor.error.textContent=warning.message;editor.error.hidden=false;}
  if(editor.selected){editor.visibleOptions=null;if(openFilterEditor===editor)showSuggestions(editor,filterChoices(editor));}
  else {
    input.replaceChildren();
    const empty=el('option','Selecionar');empty.value='';input.append(empty);
    for(const option of options){const opt=el('option',option.label+(option.active===false?' (inativa)':''));opt.value=option.id;input.append(opt);}
  }
  input.disabled=false;input.setAttribute('aria-busy','false');syncFilterEditor(editor);
}
function filterDomainError(editor,error) {
  if(openFilterEditor===editor)closeFilterDropdown();
  editor.input.disabled=true;editor.input.setAttribute('aria-busy','false');editor.error.replaceChildren(el('span',error.message+' '));editor.error.hidden=false;
  const retry=el('button','Tentar novamente','text-button');retry.type='button';retry.addEventListener('click',()=>editor.cap.name==='amparos_legais'?setDraftFilter('normativos_base',state.draft.pncp_filters.normativos_base):loadFilterOptions(editor,state.domainAbort.signal));editor.error.append(retry);
}
async function loadFilterOptions(editor,signal,source) {
  const token=++editor.loadSeq;editor.input.disabled=true;editor.input.setAttribute('aria-busy','true');
  try {
    const domains=await (source || getDomains(signal,editor.cap.name));
    if(currentEditor(editor) && token===editor.loadSeq)populateFilterOptions(editor,domains);
  }catch(error){if(error.name!=='AbortError' && currentEditor(editor) && token===editor.loadSeq)filterDomainError(editor,error);}
}
const normalizedOptionText=value=>String(value).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('pt-BR');
function filterChoices(editor) {
  if(editor.cap.domain_kind==='suggest')return editor.visibleOptions || (editor.options || []).slice(0,20);
  const text=normalizedOptionText(editor.input.value.trim());
  return (editor.options || []).filter(option=>normalizedOptionText(option.label+' '+option.id).includes(text));
}
function closeFilterDropdown() {
  if(!openFilterEditor)return;
  openFilterEditor.suggestions.hidden=true;openFilterEditor.input.setAttribute('aria-expanded','false');openFilterEditor.input.removeAttribute('aria-activedescendant');
  openFilterEditor=null;
}
function positionFilterDropdown() {
  const editor=openFilterEditor;if(!editor || !editor.input.getBoundingClientRect)return;
  const anchor=editor.input.getBoundingClientRect(),body=$('filters-dialog').querySelector('.filters-body').getBoundingClientRect();
  if(anchor.top<body.top-1 || anchor.bottom>body.bottom+1){closeFilterDropdown();return;}
  const popup=editor.suggestions;
  popup.style.left=`${anchor.left}px`;popup.style.top=`${anchor.bottom+4}px`;popup.style.width=`${anchor.width}px`;
  popup.style.maxHeight=`${Math.min(224,Math.max(0,window.innerHeight-anchor.bottom-16))}px`;
}
function openFilterDropdown(editor) {
  if(!currentEditor(editor) || editor.input.disabled)return;
  if(openFilterEditor===editor){positionFilterDropdown();return;}
  if(openFilterEditor!==editor)closeFilterDropdown();
  editor.input.scrollIntoView({block:'nearest',inline:'nearest'});
  openFilterEditor=editor;editor.suggestions.hidden=false;editor.input.setAttribute('aria-expanded','true');
  if(editor.cap.domain_kind!=='suggest' || editor.input.value.trim().length<3 || editor.visibleOptions)showSuggestions(editor,filterChoices(editor));
  positionFilterDropdown();
}
function updateFilterChoices(editor) {
  for(const {option,button,check}of editor.choices || []) {
    const selected=editor.selected.some(value=>value.id===option.id);
    button.setAttribute('aria-selected',String(selected));check.textContent=selected?'✓':'';
  }
}
function activeFilterChoice(editor,index) {
  const choices=editor.choices || [];editor.activeIndex=index;
  for(const [i,{button}]of choices.entries())button.dataset.active=String(i===index);
  const choice=choices[index];
  if(choice){editor.input.setAttribute('aria-activedescendant',choice.button.id);choice.button.scrollIntoView({block:'nearest'});}
  else editor.input.removeAttribute('aria-activedescendant');
}
async function toggleFilterChoice(editor,option) {
  if(!currentEditor(editor) || editor.input.disabled)return;
  editor.selected=editor.selected.some(value=>value.id===option.id)?editor.selected.filter(value=>value.id!==option.id):[...editor.selected,option];
  await editFilter(editor);positionFilterDropdown();
}
function filterDropdownKeydown(editor,event) {
  if(event.key==='Escape' && openFilterEditor===editor){event.preventDefault();event.stopPropagation();closeFilterDropdown();return;}
  if(event.key==='Tab'){if(openFilterEditor===editor)closeFilterDropdown();return;}
  if(['ArrowDown','ArrowUp'].includes(event.key)) {
    event.preventDefault();if(openFilterEditor!==editor)openFilterDropdown(editor);
    const length=editor.choices?.length || 0;if(!length)return;
    activeFilterChoice(editor,event.key==='ArrowDown'?((editor.activeIndex ?? -1)+1)%length:((editor.activeIndex ?? 0)-1+length)%length);
  } else if(event.key==='Enter' && openFilterEditor===editor) {
    event.preventDefault();const choice=editor.choices?.[editor.activeIndex>=0?editor.activeIndex:0];if(choice)return toggleFilterChoice(editor,choice.option);
  }
}
function searchFilterOptions(editor) {
  if(!currentEditor(editor) || editor.input.disabled)return;
  clearTimeout(editor.suggestTimer);editor.suggestAbort?.abort();const token=++editor.suggestSeq;
  editor.error.hidden=true;editor.visibleOptions=null;
  if(openFilterEditor!==editor)openFilterDropdown(editor);
  const q=editor.input.value.trim();
  if(editor.cap.domain_kind!=='suggest' || q.length<3){showSuggestions(editor,filterChoices(editor));return;}
  editor.choices=[];editor.input.removeAttribute('aria-activedescendant');
  const loading=el('p','Consultando opções do PNCP…','panel-note');loading.setAttribute('role','status');editor.suggestions.replaceChildren(loading);
  editor.suggestTimer=setTimeout(async()=>{
    const controller=new AbortController();editor.suggestAbort=controller;
    try{const result=await service.call('suggest',{type:editor.draft.document_type,field:editor.cap.name,q,size:20},{signal:controller.signal});if(currentEditor(editor) && token===editor.suggestSeq)showSuggestions(editor,result.items);}
    catch(error){if(error.name!=='AbortError' && currentEditor(editor) && token===editor.suggestSeq){editor.choices=[];editor.suggestions.replaceChildren(el('p','Sugestões indisponíveis. Tente novamente.','panel-note'));editor.error.textContent=error.message;editor.error.hidden=false;}}
  },450);
}
function showSuggestions(editor,options) {
  const list=editor.suggestions;list.replaceChildren();editor.visibleOptions=options;editor.choices=[];editor.activeIndex=-1;editor.input.removeAttribute('aria-activedescendant');
  if(!options.length){const empty=el('p','Nenhuma opção encontrada.','panel-note');empty.setAttribute('role','status');list.append(empty);}
  for(const [index,option]of options.entries()) {
    const label=option.label+(option.active===false?' (inativa)':''),button=el('button',undefined,'suggestion'),check=el('span',undefined,'suggestion-check');check.setAttribute('aria-hidden','true');button.type='button';button.tabIndex=-1;
    button.id=`filter-option-${editor.cap.name}-${index}`;button.dataset.value=option.id;button.setAttribute('role','option');button.setAttribute('aria-label',label);button.append(check,el('span',label));
    button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>toggleFilterChoice(editor,option));
    editor.choices.push({option,button,check});list.append(button);
  }
  updateFilterChoices(editor);positionFilterDropdown();
}
function renderSelectedOptions(editor) {
  const area=editor.selectedArea;area.replaceChildren();
  for(const option of editor.selected){const button=el('button',option.label+' ×','selected-option');button.type='button';button.setAttribute('aria-label',`Remover ${option.label} de ${editor.cap.label}`);button.addEventListener('click',async()=>{editor.selected=editor.selected.filter(o=>o.id!==option.id);await editFilter(editor);});area.append(button);}
}
async function exportCsv(scope='all') {
  if(!state.lastQuery || state.exportAbort || !['success','empty'].includes(state.status))return;
  if(scope==='page' && !state.lastResult?.data?.length)return;
  const query=clone(state.lastQuery);if(scope==='page')query.page=state.lastResult.page;
  const seq=++state.exportSeq;const controller=new AbortController();state.exportAbort=controller;
  const started=Date.now();
  updateExportButton();notice(scope==='page'?'Consultando o PNCP e gerando CSV da página atual. Os dados podem diferir da tabela.':'Consultando o PNCP e gerando CSV dos últimos critérios concluídos. Os dados podem diferir da tabela.');
  try {
    const result=await service.call('export',scope==='page'?{query,scope:'page'}:{query},{signal:controller.signal,onProgress:progress=>{
      if(seq!==state.exportSeq)return;
      const elapsed=(Date.now()-started)/1000,remaining=progress.rows>0 && progress.total>progress.rows?Math.max(1,Math.ceil((progress.total-progress.rows)/(progress.rows/elapsed))):0;
      notice(`Coletando ${fmtInt(progress.rows)} de ${fmtInt(progress.total)} documentos para CSV…${remaining?` Cerca de ${remaining} s restantes.`:''}`);
    }});
    if(seq!==state.exportSeq || controller.signal.aborted)return;
    const blob=new Blob(result.chunks,{type:result.mime});
    const href=URL.createObjectURL(blob),link=el('a');link.href=href;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),10000);
    notice(`${result.metadata.exported_rows} linhas exportadas${scope==='page'?` (página ${result.metadata.page})`:''}.`);
  }catch(error){if(seq===state.exportSeq && error.name!=='AbortError'){$('notice').dataset.code=error.code || '';notice(`Falha ao exportar CSV: ${error.message}`,'error');}}
  finally{if(seq===state.exportSeq){state.exportAbort=null;updateExportButton();}}
}
async function init() {
  state.schema=await service.call('schema');
  filterOptionsCache=createFilterOptionsCache(service,state.schema,{getStorage:()=>window.localStorage,...optionsCacheSettings});
  state.optionsReady=filterOptionsCache.preload();
  state.query=defaultQuery();
  try {if(window.location?.href)state.query=readLocationState().query;}
  catch(error){urlError=error;}
  state.schema.columns=state.schema.columns_by_document[state.query.document_type];
  $('search').value=state.query.q;
  $('source-badge').hidden=!state.schema.demo;
  renderFilterStatuses();
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
  $('results-view').addEventListener('change',()=>setMobileView($('results-view').value));
  $('export-page-button').addEventListener('click',()=>exportCsv('page'));
  $('reset-columns').addEventListener('click',()=>{columnLayout.clear(state.query.document_type);state.table.setColumns(tableColumnDefinitions());renderColumnChoices();});
  $('clear-draft-filters').addEventListener('click',clearDraftFilters);
  renderColumnChoices();
  $('document-type').addEventListener('change',changeDocumentType);
  $('app-header').addEventListener('focusin',event=>event.target.scrollIntoView({block:'nearest',inline:'nearest'}));
  $('search-form').addEventListener('submit',event=>{event.preventDefault();return execute();});
  $('filters-button').addEventListener('click',()=>openFilters());$('columns-button').addEventListener('click',()=>openDialog('columns-dialog'));
  $('refresh-button').addEventListener('click',async()=>{
    if(!state.lastQuery)return;
    const {page}=state.lastQuery;state.query=clone(state.lastQuery);$('search').value=state.query.q;updateCriteria();
    await loadPage(page,'push',{force:true});
  });
  $('retry-button').addEventListener('click',()=>loadPage(state.query.page,'push',{force:true}));
  $('cancel-button').addEventListener('click',()=>{state.abort?.abort();});
  $('cancel-export-button').addEventListener('click',()=>{state.exportAbort?.abort();notice('Exportação cancelada.');});
  $('notice-close').addEventListener('click',()=>{notice('');});
  $('order').addEventListener('change',()=>{state.query.order=$('order').value;return execute();});
  $('clear-button').addEventListener('click',()=>{state.query=defaultQuery();$('search').value='';updateCriteria();return execute();});
  $('apply-filters').addEventListener('click',()=>{if(state.legalPending || state.legalError)return;state.draft.q=$('draft-search').value;state.draft.status=$('draft-status').value;state.query=clone(state.draft);$('search').value=state.query.q;$('filters-dialog').close();updateCriteria();return execute();});
  $('filters-dialog').addEventListener('close',()=>{stopFilterEditors();state.legalAbort?.abort();state.legalSeq++;});
  document.addEventListener('select-menu-open',closeFilterDropdown);
  document.addEventListener('pointerdown',event=>{if(openFilterEditor && event.target!==openFilterEditor.input && !openFilterEditor.suggestions.contains(event.target))closeFilterDropdown();});
  $('filters-dialog').querySelector('.filters-body')?.addEventListener('scroll',positionFilterDropdown);
  window.addEventListener('resize',closeFilterDropdown);
  $('details-dialog').addEventListener('close',()=>{if(!$('details-dialog').open)details.close();});
  $('export-button').addEventListener('click',exportCsv);
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
    const target=event.target,editable=target && (target.closest?.('input,textarea,select,[contenteditable="true"]') || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName) || target.isContentEditable);
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
  updateCriteria();setMobileView('cards');status('idle');
  state.started=Promise.resolve(state.table.ready).then(()=>{
    tableReady=true;if(window.location?.href)return restoreQueryUrl();if(urlError)invalidQueryUrl(urlError);else return loadPage(state.query.page,'replace');
  });
  state.started.catch(error=>notice(`Falha ao iniciar a pesquisa: ${error.message}.`,'error'));
}
const ready=init().catch(error=>{$('startup-error').hidden=false;$('startup-error').textContent=`Não foi possível iniciar a interface: ${error.message}. Recarregue a página.`;notice('Falha ao carregar o esquema da aplicação.','error');});

return {ready,state,loadResultsPage,setDraftFilter};
}
