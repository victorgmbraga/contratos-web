import { createApplicationUI } from '../public/app.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as tick } from 'node:timers/promises';
import { schema } from '../src/schema.js';
import { demoFetch,demoContracts,demoAtas,demoDocuments } from '../src/demo.js';
import { PncpClient } from '../src/pncp-core.js';
import { QueryService } from '../src/query-core.js';
import { config, service, document, query, memoryStorage } from './helpers.js';
import { FILTER_OPTIONS_TTL } from '../src/browser/filter-options-cache.js';
import { project } from '../src/adapter.js';

// Execute the actual app handlers with a minimal DOM and injected results view.
// These tests verify query state and requests, not browser rendering.
async function interfaceFixture(options={}) {
  const nodes=new Map(),all=[],pending=[],downloads=[];
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.value='';this.hidden=false;this.open=false;this.classList={add(){},toggle(){},contains(){return false;}};all.push(this);}
    set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}
    append(...children){this.children.push(...children);}replaceChildren(...children){
      const detach=node=>{if(!node || typeof node!=='object')return;if(node.id && nodes.get(node.id)===node)nodes.delete(node.id);for(const child of node.children || [])detach(child);};
      for(const node of this.children)detach(node);this.children=children;
    }
    get selectedOptions(){return this.children.filter(n=>n.selected);}
    click(){if(this.tagName==='a')downloads.push({href:this.href,filename:this.download});}remove(){}
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    async fire(name,extra={}){for(const fn of this.listeners[name] || [])await fn({target:this,preventDefault(){},stopPropagation(){},...extra});await settle();await Promise.allSettled(pending);await settle();}
    focus(){dom.activeElement=this;}scrollIntoView(){}
    setAttribute(name,value){(this.attributes??={})[name]=String(value);}getAttribute(name){return this.attributes?.[name] ?? null;}removeAttribute(name){delete this.attributes?.[name];}querySelectorAll(){return [];}querySelector(){return null;}showModal(){this.open=true;}
    close(){this.open=false;for(const fn of this.listeners.close || [])fn();}
  }
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new Element(match[1]);node.id=match[2];node.hidden=match[0].includes(' hidden');}
  const dom={body:new Element('body'),getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),createTextNode:text=>text,addEventListener(){},querySelectorAll:selector=>selector==='dialog'?all.filter(n=>n.tagName==='dialog'):[],querySelector(){return null;}};
  const cfg=config({DEMO_MODE:true,...options.config});
  const provider=async(url,init)=>{
    const result=await (options.itemFetcher || demoFetch)(url,init);
    return result instanceof Response?result:Response.json(result);
  };
  const core=new QueryService(cfg,new PncpClient(cfg,{fetcher:provider})),requests=[],itemRequests=[],relatedRequests=[],documentRequests=[],childRequests=[],exportRequests=[],domainRequests=[],suggestRequests=[];
  let detailFailures=options.detailFailures || 0;
  const service={async call(method,payload={},callOptions={}) {
    callOptions.signal?.throwIfAborted();
    let result;
    switch(method) {
      case 'schema':result=schema(cfg);break;
      case 'execute':
        requests.push(payload.query);
        result=options.queryHandler?await options.queryHandler(payload.query,callOptions,core):await core.execute(payload.query,callOptions.signal);break;
      case 'export':
        exportRequests.push(payload);
        result=options.exportHandler?await options.exportHandler(payload,callOptions,core):await core.export(payload.query,callOptions.signal);break;
      case 'domains':
        domainRequests.push(payload);
        result=options.domainHandler?await options.domainHandler(payload,callOptions,core):await core.domains(payload.type,payload.normatives,callOptions.signal,null,payload.field);break;
      case 'suggest':
        suggestRequests.push(payload);result=options.suggestHandler?await options.suggestHandler(payload,callOptions,core):await core.suggest(payload.type,payload.field,payload.q,payload.size,callOptions.signal);break;
      case 'details':
        itemRequests.push(payload);
        if(detailFailures-->0)throw Object.assign(new Error('Falha temporária dos itens.'),{code:'PNCP_HTTP_ERROR'});
        result=options.itemHandler?await options.itemHandler(payload,callOptions,core):await core.details(payload.document,payload.page,payload.size,callOptions.signal);break;
      case 'documentDetails':
        documentRequests.push(payload);
        result=options.documentHandler?await options.documentHandler(payload,callOptions,core):await core.documentDetails(payload.document,callOptions.signal);break;
      case 'documentRelated':case 'related':
        relatedRequests.push(payload);
        result=options.relatedHandler?await options.relatedHandler(payload,callOptions,core):await core.documentRelated(payload.document,payload.resource,payload.page,payload.size,callOptions.signal,undefined,payload.pagination_mode);break;
      case 'contractChild':
        childRequests.push(payload);result=await core.contractChild(payload.document,payload.resource,payload.sequence,callOptions.signal);break;
      default:throw new Error(`Unexpected method: ${method}`);
    }
    callOptions.signal?.throwIfAborted();
    if(result?.error)throw Object.assign(new Error(result.error.message),result.error);
    return method==='export'?{mime:'text/csv; charset=utf-8',filename:'compras-demo.csv',...result}:result;
  }};
  let finishReady;
  const tableFactory=options=>({options,columns:options.columns,rows:[],page:1,lastPage:1,
    ready:new Promise(resolve=>{finishReady=resolve;}),
    setStatus(status){this.status=status;},
    renderPage({rows,page,lastPage}){this.rows=rows;this.page=page;this.lastPage=lastPage;},
    clear(){this.rows=[];this.page=1;this.lastPage=1;},
    setColumns(columns){this.columns=columns;},
    setColumnVisibility(field,visible){this.columns.find(column=>column.field===field).visible=visible;},
    getColumns(){return this.columns;},destroy(){},
  });
  const entries=[options.href ?? 'https://example.test/contratos-web/'],windowListeners={};let historyIndex=0;
  const view={localStorage:options.storage,location:{get href(){return entries[historyIndex];}},addEventListener(name,fn){(windowListeners[name]??=[]).push(fn);},history:{
    get length(){return entries.length;},
    pushState(_state,_title,href){entries.splice(historyIndex+1);entries.push(new URL(href,entries[historyIndex]).href);historyIndex++;},
    replaceState(_state,_title,href){entries[historyIndex]=new URL(href,entries[historyIndex]).href;},
  }};
  const dispatchHistory=async()=>{for(const fn of windowListeners.popstate || [])await fn({type:'popstate'});await settle();await Promise.allSettled(pending);await settle();};
  const browser={view,entries,href:()=>view.location.href,async back(){if(historyIndex>0){historyIndex--;await dispatchHistory();}},async forward(){if(historyIndex<entries.length-1){historyIndex++;await dispatchHistory();}},async visit(href){view.history.pushState(null,'',href);await dispatchHistory();}};
  const uiCore=createApplicationUI(service,{document:dom,window:view,tableFactory,optionsCacheSettings:options.cacheSettings});
  await uiCore.ready;
  if(options.waitOptions!==false)await uiCore.state.optionsReady;
  await settle();assert.equal(nodes.get('startup-error').hidden,true);
  const startTable=async()=>{finishReady();await uiCore.state.started;await settle();};
  if(!options.deferTableReady)await startTable();
  const state=()=>structuredClone(uiCore.state.query);
  const openDocument=doc=>uiCore.state.table.options.onOpenDocument(doc);
  const tableColumns=()=>uiCore.state.table.getColumns();
  const request=params=>uiCore.loadResultsPage(params.page);
  const footer=()=>uiCore.state.table.options.footerContent;
  const draft=()=>structuredClone(uiCore.state.draft);
  const setFilter=(name,value)=>uiCore.setDraftFilter(name,value);
  const field=name=>nodes.get(`filter-${name}`);
  const fieldNames=()=>all.filter(node=>nodes.get(node.id)===node && node.className==='filter-field').map(node=>node.id.slice('filter-field-'.length));
  const choices=async name=>{
    const input=field(name);input.focus();await input.fire('focus');
    return nodes.get(`filter-suggestions-${name}`).children.filter(node=>node.tagName==='button');
  };
  const editFilter=async(name,value)=>{
    const input=field(name),cap=schema(cfg).capabilities.find(c=>c.name===name);
    if(input.disabled)return;
    if(cap.cardinality==='multiple' && cap.domain) {
      const desired=value || [];
      if(!desired.length){await nodes.get(`filter-field-${name}`).children[0].children[1].fire('click');return;}
      for(const button of await choices(name))if(button.getAttribute('aria-selected')==='true' && !desired.includes(button.dataset.value))await button.fire('click');
      for(const id of desired){const button=(await choices(name)).find(button=>button.dataset.value===id);assert(button,`Opção ${id} ausente em ${name}`);if(button.getAttribute('aria-selected')!=='true')await button.fire('click');}
    } else {
      input.value=value===undefined?'':String(value);await input.fire(cap.domain || cap.type==='boolean'?'change':'input');
    }
  };
  const renderedPage=()=>({page:uiCore.state.table.page,ids:uiCore.state.table.rows.map(row=>row.id)});
  return {nodes,all,requests,itemRequests,relatedRequests,documentRequests,childRequests,exportRequests,domainRequests,suggestRequests,downloads,state,draft,setFilter,field,fieldNames,options:choices,editFilter,openDocument,tableColumns,request,footer,startTable,renderedPage,optionsReady:uiCore.state.optionsReady,browser};
}
async function settle(){for(let i=0;i<8;i++)await tick();}

test('FILTER-YEARS-UI-01: preserva anos fora de AAAA nas opções, seleções, busca, URL e cache dos três tipos',async()=>{
  const storage=memoryStorage(),anos=['2026','20','20260','0002','0'],ordenados=['0','0002','20','2026','20260'];
  const provider=async(url,init)=>{
    const response=await demoFetch(url,init);
    if(!new URL(url).pathname.endsWith('/filters'))return response;
    const data=await response.json();data.filters.anos=anos.map(ano=>({ano}));return Response.json(data);
  };
  const ui=await interfaceFixture({storage,itemFetcher:provider});
  for(const type of ['edital','ata','contrato']){
    if(type!=='edital'){ui.nodes.get('document-type').value=type;await ui.nodes.get('document-type').fire('change');}
    await ui.nodes.get('filters-button').fire('click');
    assert.deepEqual((await ui.options('anos')).map(button=>button.dataset.value),ordenados);
    await ui.editFilter('anos',anos.slice(1));await ui.nodes.get('apply-filters').fire('click');
    assert.deepEqual(ui.requests.at(-1).pncp_filters.anos,anos.slice(1));assert.equal(new URL(ui.browser.href()).searchParams.get('anos'),'20|20260|0002|0');
    await ui.nodes.get('filters-button').fire('click');assert.deepEqual(ui.draft().pncp_filters.anos,anos.slice(1));ui.nodes.get('filters-dialog').close();
  }
  const restored=await interfaceFixture({storage,itemFetcher:provider,href:ui.browser.href()});
  assert.equal(restored.domainRequests.length,0);assert.deepEqual(restored.requests[0].pncp_filters.anos,anos.slice(1));
  await restored.nodes.get('filters-button').fire('click');assert.deepEqual((await restored.options('anos')).map(button=>button.dataset.value),ordenados);
});

test('DETAIL-TABS-01: rótulos, campos, vínculos ARIA e links de cabeçalho correspondem ao documento aberto',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(document(1,{title:'Edital nº 1/2026',item_url:'/compras/00000000000000/2026/1',link_sistema_origem:'https://example.test/compra/1'})));
  assert.equal(ui.nodes.get('details-kind').textContent,'Edital nº 1/2026');
  const tabs=ui.nodes.get('details-content').children.find(n=>n.className==='detail-tabs');
  assert.deepEqual(tabs.children.map(n=>n.textContent),['Detalhes (12)','Itens (2)','Arquivos (12)','Atas de Registro de Preço (3)','Contratos/Empenhos (2)','Histórico (12)']);assert.equal(tabs.getAttribute('role'),'tablist');
  for(const [index,button]of tabs.children.entries()){const panel=ui.nodes.get(button.getAttribute('aria-controls'));assert.equal(panel.getAttribute('role'),'tabpanel');assert.equal(panel.getAttribute('aria-labelledby'),button.id);assert.equal(panel.hidden,index!==0);assert.equal(button.getAttribute('aria-selected'),String(index===0));assert.equal(button.tabIndex,index===0?0:-1);}
  const grid=ui.nodes.get('detail-panel-detalhes').children[0];assert.deepEqual(grid.children.map(n=>n.children[0].textContent),['Controle PNCP','Órgão','CNPJ do órgão','Unidade','UF','Município','Modalidade','Situação','Publicação','Atualização','Valor estimado','Valor homologado']);
  assert.deepEqual(ui.nodes.get('details-links').children.map(n=>n.textContent),['Abrir no PNCP','Sistema de origem']);assert(!ui.nodes.get('details-content').children.some(n=>n.className==='detail-links'));
  await ui.openDocument(project(document(2,{title:'Edital nº 2/2026'})));assert.equal(ui.nodes.get('details-kind').textContent,'Edital nº 2/2026');assert.equal(ui.nodes.get('details-links').children.length,1);assert(!ui.nodes.get('details-links').children.some(n=>n.href==='https://example.test/compra/1'));
});
test('DETAIL-TABS-02: teclado percorre abas sem novas chamadas e mantém apenas um painel visível',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(document(1)));const initial=ui.relatedRequests.length+ui.itemRequests.length;
  await ui.nodes.get('detail-tab-detalhes').fire('keydown',{key:'ArrowRight'});assert.equal(ui.nodes.get('detail-tab-itens').getAttribute('aria-selected'),'true');assert.equal(ui.nodes.get('detail-panel-itens').hidden,false);assert.equal(ui.nodes.get('detail-panel-detalhes').hidden,true);
  await ui.nodes.get('detail-tab-itens').fire('keydown',{key:'End'});assert.equal(ui.nodes.get('detail-tab-historico').tabIndex,0);
  await ui.nodes.get('detail-tab-historico').fire('keydown',{key:'ArrowRight'});assert.equal(ui.nodes.get('detail-tab-detalhes').tabIndex,0);
  await ui.nodes.get('detail-tab-detalhes').fire('keydown',{key:'ArrowLeft'});assert.equal(ui.nodes.get('detail-tab-historico').tabIndex,0);
  await ui.nodes.get('detail-tab-historico').fire('keydown',{key:'Home'});assert.equal(ui.nodes.get('detail-tab-detalhes').tabIndex,0);
  assert.equal(ui.relatedRequests.length+ui.itemRequests.length,initial);assert.equal(ui.nodes.get('details-content').children.filter(n=>n.getAttribute?.('role')==='tabpanel' && !n.hidden).length,1);
});
test('DETAIL-TABS-03: abertura é imediata e consulta as cinco listas com no máximo duas requisições simultâneas',async()=>{
  let active=0,peak=0;const queued=[],started=[];
  const handler=(payload,options,core)=>{active++;peak=Math.max(peak,active);started.push(payload);return new Promise(resolve=>queued.push(async()=>{const {document,resource,page,size}=payload;const result=resource?await core.documentRelated(document,resource,page,size,options.signal):await core.details(document,page,size,options.signal);active--;resolve(result);}));};
  const ui=await interfaceFixture({itemHandler:handler,relatedHandler:handler});const opening=ui.openDocument(project(document(1)));await settle();assert.equal(ui.nodes.get('details-dialog').open,true);assert.equal(started.length,2);assert.equal(ui.nodes.get('detail-tab-detalhes').getAttribute('aria-selected'),'true');
  const historyTab=ui.nodes.get('detail-tab-historico');assert.equal(historyTab.textContent,'Histórico');assert.equal(historyTab.getAttribute('aria-busy'),'true');assert.equal(historyTab.getAttribute('aria-label'),'Histórico: carregando');
  assert.equal(historyTab.children.find(node=>node.className==='detail-tab-spinner').getAttribute('aria-hidden'),'true');
  for(let round=0;round<4;round++){await Promise.all(queued.splice(0).map(release=>release()));await settle();}
  await opening;assert.equal(started.length,5);assert.equal(peak,2);assert.equal(active,0);assert.equal(historyTab.textContent,'Histórico (12)');assert.equal(historyTab.getAttribute('aria-busy'),'false');
});

test('RELATED-UI-01: quatro abas carregam em background e exibem dados e links corretos',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(document(1)));
  const sections=ui.nodes.get('details-content').children.filter(n=>n.className==='related-section');assert.equal(sections.length,4);assert.equal(ui.relatedRequests.length,4);
  for(const section of sections){assert.equal(section.hidden,true);assert.match(section.children[0].textContent,/\(\d+\)$/);assert(section.children[3].children.length>0);assert.equal(section.getAttribute('aria-busy'),'false');}
  assert.equal(ui.relatedRequests.length,4);
  const files=sections.find(s=>s.dataset.resource==='arquivos');assert.equal(files.children[3].children[0].children.at(-1).textContent,'Baixar arquivo');assert.match(files.children[3].children[0].children.at(-1).href,/\/arquivos\/1$/);
  const atas=sections.find(s=>s.dataset.resource==='atas');assert.match(atas.children[3].children[0].children.at(-1).href,/\/app\/atas\//);
  const contracts=sections.find(s=>s.dataset.resource==='contratos');assert.match(contracts.children[3].children[1].children[1].children.at(-1).children[1].textContent,/9\.007\.199\.254\.740\.993,12345/);
  const history=sections.find(s=>s.dataset.resource==='historico');assert(history.children[3].children[1].children[1].children.some(field=>field.children[1].textContent==='Exigência Legal'));
  await ui.nodes.get('detail-tab-arquivos').fire('click');assert.equal(files.hidden,false);assert.equal(ui.relatedRequests.length,4);
});
test('RELATED-UI-02: paginação de arquivos e histórico é independente dos itens e das outras seções',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(document(1)));const sections=ui.nodes.get('details-content').children.filter(n=>n.className==='related-section');
  for(const resource of ['arquivos','historico']){const section=sections.find(s=>s.dataset.resource===resource);await ui.nodes.get(`detail-tab-${resource}`).fire('click');const pager=section.children[4];assert.equal(pager.hidden,false);await pager.children[2].fire('click');assert.equal(section.children[3].children.length,2);assert.equal(pager.children[2].disabled,true);assert.equal(pager.children[1].textContent,'Página 2 de 2');await pager.children[0].fire('click');assert.equal(section.children[3].children.length,10);}
  assert.equal(ui.itemRequests.length,1);assert.equal(ui.relatedRequests.length,8);assert.equal(ui.nodes.get('detail-tab-arquivos').textContent,'Arquivos (12)');assert.equal(ui.nodes.get('detail-tab-historico').textContent,'Histórico (12)');
});
test('RELATED-UI-03: falha em uma listagem permite repetir e não impede as outras',async()=>{
  let failures=1;const ui=await interfaceFixture({relatedHandler:async(payload,options,core)=>{if(payload.resource==='arquivos' && failures-->0)throw new Error('Arquivos indisponíveis.');return core.documentRelated(payload.document,payload.resource,payload.page,payload.size,options.signal);}});
  await ui.openDocument(project(document(1)));const sections=ui.nodes.get('details-content').children.filter(n=>n.className==='related-section'),files=sections[0];assert.equal(files.children[1].children[0].hidden,false);assert.equal(files.children[2].textContent,'Arquivos indisponíveis.');assert.equal(ui.nodes.get('detail-tab-arquivos').textContent,'Arquivos (—)');
  const atas=sections[1];assert.equal(atas.children[3].children.length,3);assert.equal(ui.nodes.get('detail-tab-atas').textContent,'Atas de Registro de Preço (3)');
  await files.children[1].children[0].fire('click');assert.equal(files.children[3].children.length,10);assert.equal(files.children[1].children[0].hidden,true);assert.equal(ui.itemRequests.length,1);
});
test('RELATED-UI-04: HTTP 404 de contratos exibe zero, listas vazias e ausência de identificação são tratadas',async()=>{
  const ui=await interfaceFixture({itemFetcher:url=>url.includes('/contratos/contratacao/')?Promise.resolve(new Response(null,{status:404})):demoFetch(url)});await ui.openDocument(project(document(5)));let sections=ui.nodes.get('details-content').children.filter(n=>n.className==='related-section');
  for(const section of sections){assert.match(section.children[3].children[0].textContent,/Nenhum registro/);assert.equal(section.children[4].hidden,true);assert.match(ui.nodes.get(`detail-tab-${section.dataset.resource}`).textContent,/\(0\)$/);}
  assert.equal(ui.nodes.get('detail-tab-contratos').textContent,'Contratos/Empenhos (0)');assert.equal(ui.nodes.get('detail-tab-contratos').dataset.state,'loaded');assert.equal(ui.nodes.get('detail-panel-contratos').children[1].children[0].hidden,true);
  const count=ui.relatedRequests.length;await ui.openDocument(project(document(1,{numero_sequencial:null})));sections=ui.nodes.get('details-content').children.filter(n=>n.className==='related-section');for(const section of sections){assert.match(section.children[2].textContent,/não forneceu CNPJ/);assert.match(ui.nodes.get(`detail-tab-${section.dataset.resource}`).textContent,/\(—\)$/);}assert.equal(ui.relatedRequests.length,count);
});
test('RELATED-UI-05: fechar os detalhes cancela todas as consultas e descarta uma resposta atrasada',async()=>{
  const resolutions=[],signals=[];const ui=await interfaceFixture({relatedHandler:(payload,options,core)=>{if(payload.document.sequencial==='1'){signals.push(options.signal);return new Promise(resolve=>resolutions.push(resolve));}return core.documentRelated(payload.document,payload.resource,payload.page,payload.size,options.signal);}});
  const pending=ui.openDocument(project(document(1)));await settle();const section=ui.nodes.get('details-content').children.find(n=>n.className==='related-section');ui.nodes.get('details-dialog').close();assert(signals.length>0);assert(signals.every(signal=>signal.aborted));
  await ui.openDocument(project(document(2)));for(const resolve of resolutions)resolve(({page:1,size:10,data:[{titulo:'Resposta antiga'}],total:1,total_pages:1,has_more:false}));await pending;assert.equal(section.children[3].children.length,0);assert(!ui.all.some(n=>n.textContent==='Resposta antiga'));assert(!ui.relatedRequests.some(p=>p.document.sequencial==='1' && ['contratos','historico'].includes(p.resource)));
});

test('HEADER-UI-01: ordenação e todas as ações dos resultados ficam no cabeçalho',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const header=html.match(/<header\b[^>]*id="app-header"[^>]*>([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header);assert.match(header,/class="header-toolbar"/);
  assert.match(header,/id="search-button"[^>]*>[\s\S]*?<\/button>\s*<button[^>]*id="cancel-button"/);
  assert.doesNotMatch(html,/class="result-toolbar"/);
  assert.match(header,/id="filters-button"[\s\S]*?<\/button>\s*<button[^>]*id="clear-button"/);
  for(const id of ['order','clear-button','cancel-button','retry-button','refresh-button','columns-button','export-button','cancel-export-button','repository-link']) {
    assert.match(header,new RegExp(`id="${id}"`));
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`,'g'))].length,1);
  }
});

test('HEADER-UI-02: busca, filtros e ações usam somente ícones com nomes acessíveis',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const [id,label]of [['search-button','Pesquisar'],['cancel-button','Cancelar pesquisa'],['filters-button','Filtros'],['clear-button','Limpar filtros'],['refresh-button','Atualizar resultados'],['columns-button','Selecionar colunas'],['export-button','Exportar CSV'],['cancel-export-button','Cancelar CSV']]) {
    const button=html.match(new RegExp(`<button(?=[^>]*id="${id}")([^>]*)>([\\s\\S]*?)<\\/button>`));
    assert.ok(button);assert.match(button[1],/class="[^"]*\bicon-only\b/);
    assert.match(button[1],new RegExp(`aria-label="${label}"`));assert.doesNotMatch(button[1],/\btitle=/);
    assert.match(button[1],new RegExp(`aria-describedby="${id}-tooltip"`));
    assert.match(html,new RegExp(`<div id="${id}-tooltip" class="tooltip" role="tooltip" hidden>${label}<\/div>`));
    assert.match(button[2],/^<svg\b[^>]*aria-hidden="true"[^>]*>[\s\S]*<\/svg>(?:<span id="filter-count"[^>]*><\/span>)?$/);
    assert.equal(button[2].replace(/<[^>]+>/g,''),'');
  }
});

test('HEADER-UI-03: botão de menu do cabeçalho aparece somente em colunas filtráveis',async()=>{
  const ui=await interfaceFixture();
  const columns=Object.fromEntries(ui.tableColumns().map(column=>[column.field,column]));
  for(const field of ['titulo','objeto_compra','data_atualizacao_pncp','orgao_cnpj','tem_resultado'])assert.equal(columns[field].filterable,false,field);
  for(const field of ['orgao_nome','uf','data_publicacao_pncp','valor_total_estimado'])assert.equal(columns[field].filterable,true,field);
});

test('ORDER-UI-01: seletor acompanha o tipo, preserva a ordenação do link e restaura o padrão ao trocar de documento',async()=>{
  const ui=await interfaceFixture({href:'https://example.test/?tipos_documento=edital&ordenacao=-valor_total_estimado'}),options=()=>ui.nodes.get('order').children.map(option=>option.value);
  assert.deepEqual(options(),['-data','data','relevancia','numero_controle_pncp','-valor_total_estimado']);assert.equal(ui.nodes.get('order').value,'-valor_total_estimado');assert.equal(ui.requests[0].order,'-valor_total_estimado');
  ui.nodes.get('document-type').value='contrato';await ui.nodes.get('document-type').fire('change');
  assert.deepEqual(options(),['-data','data','relevancia','numero_contratacao','numero_controle_pncp','data_inicio_vigencia','valor_global']);assert.equal(ui.state().order,'-data');
  ui.nodes.get('order').value='valor_global';await ui.nodes.get('order').fire('change');assert.equal(ui.requests.at(-1).order,'valor_global');assert.equal(new URL(ui.browser.href()).searchParams.get('ordenacao'),'valor_global');
  ui.nodes.get('document-type').value='ata';await ui.nodes.get('document-type').fire('change');assert.deepEqual(options(),['-data','data','relevancia','valor','-valor']);assert.equal(ui.state().order,'-data');
  await ui.browser.back();assert.equal(ui.nodes.get('document-type').value,'contrato');assert.equal(ui.nodes.get('order').value,'valor_global');assert(options().includes('valor_global'));assert(!options().includes('valor'));
});

test('EXPORT-UI-01: um clique baixa o CSV dos últimos critérios concluídos sem modal',async()=>{
  const ui=await interfaceFixture();ui.nodes.get('search').value='firewall';await ui.nodes.get('search-form').fire('submit');
  const completed=ui.state();ui.nodes.get('search').value='texto ainda não pesquisado';
  await ui.nodes.get('export-button').fire('click');
  assert.equal(ui.nodes.has('export-dialog'),false);assert.equal(ui.nodes.has('download-csv'),false);
  assert.equal(ui.exportRequests.length,1);assert.deepEqual(ui.exportRequests[0],{query:completed});
  assert.equal(ui.downloads.length,1);assert.equal(ui.downloads[0].filename,'compras-demo.csv');
  assert.match(ui.nodes.get('notice').textContent,/6 linhas exportadas/);
  assert.equal(ui.nodes.get('export-button').disabled,false);assert.equal(ui.nodes.get('export-button').getAttribute('aria-busy'),'false');
});

test('EXPORT-UI-02: geração desabilita o botão e impede exportações duplicadas',async()=>{
  let finish;
  const ui=await interfaceFixture({exportHandler:(input,options,core)=>new Promise(resolve=>{finish=async()=>{
    const result=await core.export(input.query,options.signal);
    resolve(result);
  };})});
  const exporting=ui.nodes.get('export-button').fire('click');await settle();
  assert.equal(ui.nodes.get('export-button').disabled,true);assert.equal(ui.nodes.get('export-button').getAttribute('aria-busy'),'true');
  assert.match(ui.nodes.get('notice').textContent,/gerando CSV/);
  await ui.nodes.get('export-button').fire('click');assert.equal(ui.exportRequests.length,1);
  await finish();await exporting;assert.equal(ui.downloads.length,1);assert.equal(ui.nodes.get('export-button').disabled,false);
  assert.equal(ui.nodes.get('export-button-tooltip').textContent,'Exportar CSV');
  assert.equal(ui.nodes.get('export-button').getAttribute('title'),null);
});

test('EXPORT-UI-03: falha é exibida acima da tabela e permite tentar exportar novamente',async()=>{
  const ui=await interfaceFixture({exportHandler:()=>({error:{code:'EXPORT_TOO_BROAD',message:'Delimite a pesquisa.'}})});
  await ui.nodes.get('export-button').fire('click');
  assert.equal(ui.downloads.length,0);assert.equal(ui.nodes.get('notice').className,'notice error');
  assert.match(ui.nodes.get('notice').textContent,/Falha ao exportar CSV: Delimite a pesquisa/);
  assert.equal(ui.nodes.get('export-button').disabled,false);assert.equal(ui.nodes.get('export-button').getAttribute('aria-busy'),'false');
  await ui.nodes.get('export-button').fire('click');assert.equal(ui.exportRequests.length,2);
});

test('EXPORT-UI-04: uma nova consulta cancela a exportação e descarta seu download tardio',async()=>{
  let finish,signal;
  const ui=await interfaceFixture({exportHandler:(input,options)=>{signal=options.signal;return new Promise(resolve=>{finish=()=>resolve({chunks:[new TextEncoder().encode('csv antigo')],metadata:{exported_rows:1}});});}});
  const exporting=ui.nodes.get('export-button').fire('click');await settle();
  await ui.request({page:1});assert.equal(signal.aborted,true);assert.equal(ui.nodes.get('export-button').disabled,false);
  finish();await exporting;assert.equal(ui.downloads.length,0);assert.equal(ui.nodes.get('notice').hidden,true);
  assert.equal(ui.nodes.get('export-button').getAttribute('aria-busy'),'false');
});

test('STARTUP-UI-01: abrir a aplicação consulta a primeira página sem texto ou filtros',async()=>{
  const ui=await interfaceFixture();assert.equal(ui.requests.length,1);
  assert.deepEqual(ui.requests[0],{
    api_version:'2.0',document_type:'edital',q:'',status:'todos',
    pncp_filters:{},order:'-data',page:1,size:100,
  });
  assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
  assert.equal(ui.nodes.get('table-loader').hidden,true);assert.equal(ui.nodes.get('export-button').disabled,false);
});

test('STARTUP-UI-02: falha da pesquisa inicial usa o aviso de consulta e permite tentar novamente',async()=>{
  let fail=true;
  const ui=await interfaceFixture({queryHandler:async(input,options,core)=>fail
    ?({error:{code:'PNCP_UNAVAILABLE',message:'PNCP indisponível.'}})
    :(await core.execute(input,options.signal))});
  assert.equal(ui.requests.length,1);assert.equal(ui.nodes.get('startup-error').hidden,true);
  assert.match(ui.nodes.get('notice').textContent,/PNCP indisponível/);
  assert.equal(ui.nodes.get('retry-button').hidden,false);assert.equal(ui.nodes.get('table-loader').hidden,true);
  fail=false;await ui.nodes.get('retry-button').fire('click');
  assert.equal(ui.requests.length,2);assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
  assert.equal(ui.nodes.get('notice').hidden,true);
});

test('QUERY-URL-UI-01: link inicial restaura contrato, texto, filtros, status, ordenação e página sem consultar a primeira',async()=>{
  const href='https://example.test/contratos-web/?demo=1&tipos_documento=contrato&q=firewall&status=vigente&ordenacao=data&pagina=3&ufs=SP%7CDF&possui_nfe=false&valor_global_min=0.00#resultados';
  const ui=await interfaceFixture({href,queryHandler:async(input,options,core)=>({...await core.execute({document_type:input.document_type,size:100},options.signal),page:input.page,total:500,last_page:5,last_row:500})});
  assert.equal(ui.requests.length,1);assert.deepEqual(ui.requests[0],{api_version:'2.0',document_type:'contrato',q:'firewall',status:'vigente',order:'data',page:3,size:100,pncp_filters:{ufs:['SP','DF'],possui_nfe:false,valor_global_min:'0.00'}});
  assert.equal(ui.nodes.get('search').value,'firewall');assert.equal(ui.nodes.get('document-type').value,'contrato');assert.equal(ui.nodes.get('order').value,'data');assert(ui.tableColumns().some(column=>column.field==='valor_global'));assert.equal(ui.state().page,3);
  assert.equal(ui.browser.entries.length,1);const url=new URL(ui.browser.href());assert.equal(url.searchParams.get('demo'),'1');assert.equal(url.hash,'#resultados');
  await ui.nodes.get('filters-button').fire('click');assert.equal(ui.nodes.get('draft-status').value,'vigente');assert.equal(ui.draft().pncp_filters.possui_nfe,false);
});

test('QUERY-URL-UI-02: alterações aplicadas, páginas e detalhes atualizam a URL; rascunhos preservam o link',async()=>{
  const source=service(Array.from({length:164},(_,i)=>document(i+1)));
  const ui=await interfaceFixture({queryHandler:input=>source.service.execute(input)}),params=()=>new URL(ui.browser.href()).searchParams;
  ui.nodes.get('search').value='Obras + reparos & manutenção';await ui.nodes.get('search-form').fire('submit');assert.equal(params().get('q'),'Obras + reparos & manutenção');assert.equal(params().get('pagina'),'1');
  await ui.request({page:2});assert.equal(params().get('pagina'),'2');assert.equal(ui.state().page,2);
  const unchanged=ui.browser.href();await ui.nodes.get('filters-button').fire('click');await ui.setFilter('srp',false);assert.equal(ui.browser.href(),unchanged);ui.nodes.get('filters-dialog').close();assert.equal(ui.browser.href(),unchanged);
  await ui.nodes.get('filters-button').fire('click');await ui.setFilter('srp',false);await ui.nodes.get('apply-filters').fire('click');assert.equal(params().get('srp'),'false');assert.equal(params().get('pagina'),'1');
  ui.nodes.get('order').value='data';await ui.nodes.get('order').fire('change');assert.equal(params().get('ordenacao'),'data');
  await ui.openDocument(project(document(1)));assert.equal(params().get('detalhe'),'edital/00000000000000/2026/1');assert.equal(params().get('aba'),'detalhes');
  await ui.nodes.get('clear-button').fire('click');assert.equal(params().has('q'),false);assert.equal(params().has('srp'),false);assert.equal(params().get('ordenacao'),'-data');assert.equal(params().get('pagina'),'1');
});

test('QUERY-URL-UI-03: Voltar e Avançar restauram critérios, página, colunas e tipo sem criar novas entradas',async()=>{
  const ui=await interfaceFixture({queryHandler:async(input,options,core)=>({...await core.execute({document_type:input.document_type,size:100},options.signal),page:input.page,total:500,last_page:5,last_row:500})});
  ui.nodes.get('search').value='firewall';await ui.nodes.get('search-form').fire('submit');await ui.request({page:2});
  const shared=ui.browser.href(),expected=ui.state();
  ui.nodes.get('document-type').value='contrato';await ui.nodes.get('document-type').fire('change');
  await ui.nodes.get('filters-button').fire('click');await ui.setFilter('possui_nfe',false);ui.nodes.get('draft-status').value='vigente';await ui.nodes.get('apply-filters').fire('click');
  const length=ui.browser.entries.length,requests=ui.requests.length;
  await ui.browser.back();assert.equal(ui.requests.length,requests+1);assert.equal(ui.state().document_type,'contrato');assert.deepEqual(ui.state().pncp_filters,{});
  await ui.browser.back();assert.equal(ui.browser.href(),shared);assert.deepEqual(ui.state(),expected);assert.equal(ui.nodes.get('search').value,'firewall');assert(ui.tableColumns().some(column=>column.field==='valor_total_estimado'));assert.equal(ui.browser.entries.length,length);
  await ui.browser.forward();assert.equal(ui.state().document_type,'contrato');assert.equal(ui.state().page,1);assert.equal(ui.nodes.get('search').value,'');assert(ui.tableColumns().some(column=>column.field==='valor_global'));
  await ui.browser.forward();assert.equal(ui.state().pncp_filters.possui_nfe,false);assert.equal(ui.state().status,'vigente');assert.equal(ui.browser.entries.length,length);
});

test('QUERY-URL-UI-04: atualizar, repetir falha e exportar preservam a página e não duplicam o histórico',async()=>{
  let failed=true;const source=service(Array.from({length:164},(_,i)=>document(i+1))),ui=await interfaceFixture({href:'https://example.test/?q=firewall&pagina=2',queryHandler:input=>{
    if(failed)throw new Error('Fonte indisponível');return source.service.execute(input);
  }});
  assert.equal(ui.requests[0].page,2);assert.equal(ui.browser.entries.length,1);failed=false;
  await ui.nodes.get('retry-button').fire('click');assert.equal(ui.requests.at(-1).page,2);assert.equal(ui.state().page,2);
  await ui.nodes.get('refresh-button').fire('click');assert.equal(ui.requests.at(-1).page,2);assert.equal(ui.browser.entries.length,1);
  await ui.nodes.get('export-button').fire('click');assert.equal(ui.exportRequests.at(-1).query.page,2);assert.equal(ui.exportRequests.at(-1).query.q,'firewall');assert.equal(ui.browser.entries.length,1);
});

test('QUERY-URL-UI-05: URL inválida mostra erro sem pesquisa inicial e pode ser corrigida pela interface',async()=>{
  for(const search of ['?pagina=101','?tipos_documento=contrato&srp=false','?srp=0','?q=a&q=b']){
    const ui=await interfaceFixture({href:'https://example.test/'+search});assert.equal(ui.requests.length,0);assert.equal(ui.nodes.get('startup-error').hidden,true);
    assert.match(ui.nodes.get('notice').textContent,/Parâmetros inválidos na URL/);assert.equal(ui.nodes.get('retry-button').hidden,true);assert.equal(ui.nodes.get('clear-button').hidden,false);assert.equal(ui.nodes.get('export-button').disabled,true);
    assert.equal(ui.browser.href(),'https://example.test/'+search);
    await ui.nodes.get('clear-button').fire('click');assert.equal(ui.requests.length,1);assert.equal(ui.requests[0].page,1);assert.equal(ui.nodes.get('notice').hidden,true);assert.equal(new URL(ui.browser.href()).searchParams.has('srp'),false);
  }
});

test('QUERY-URL-UI-06: navegar no histórico cancela a busca pendente e resposta antiga não muda URL ou resultado',async()=>{
  let finish,signal;const ui=await interfaceFixture({queryHandler:async(input,options,core)=>{
    if(input.q==='atrasada'){signal=options.signal;await new Promise(resolve=>{finish=resolve;});}
    return core.execute({...input,q:''});
  }});
  const original=ui.browser.href();ui.nodes.get('search').value='atrasada';const searching=ui.nodes.get('search-form').fire('submit');await settle();
  const goingBack=ui.browser.back();await settle();assert.equal(signal.aborted,true);assert.equal(ui.browser.href(),original);assert.equal(ui.state().q,'');
  finish();await searching;await goingBack;assert.equal(ui.browser.href(),original);assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
});

test('QUERY-URL-UI-07: navegação durante a inicialização utiliza a URL atual na primeira consulta',async()=>{
  const ui=await interfaceFixture({deferTableReady:true,href:'https://example.test/?q=antigo'});
  await ui.browser.visit('https://example.test/?tipos_documento=ata&ordenacao=data&pagina=1');assert.equal(ui.requests.length,0);
  await ui.startTable();assert.equal(ui.requests.length,1);assert.equal(ui.requests[0].document_type,'ata');assert.equal(ui.requests[0].q,'');assert.equal(ui.requests[0].order,'data');assert.equal(ui.nodes.get('result-title').textContent,'24 atas');
});

test('TABLE-FOOTER-01: total real no rodapé, aviso de janela no marcador e demais avisos acima da tabela',async()=>{
  let total=4143240,extraWarning=false,fail=false;
  const source=service([],{handler:u=>{
    const size=Number(u.searchParams.get('tam_pagina')),page=Number(u.searchParams.get('pagina'));
    return Response.json({items:Array.from({length:size},(_,i)=>document((page-1)*size+i+1)),total});
  }});
  const ui=await interfaceFixture({queryHandler:async input=>{
    if(fail)return ({error:{code:'PNCP_UNAVAILABLE',message:'PNCP indisponível.'}});
    const result=await source.service.execute(input);
    if(extraWarning)result.warnings.push({code:'MISSING_IDENTITY',message:'Há documentos sem identidade de negócio na página.'});
    return (result);
  }});
  assert.equal(ui.footer(),ui.nodes.get('result-info'));assert.equal(ui.nodes.get('result-info').hidden,false);
  const result=await ui.request({page:1});
  assert.equal(result.last_row,10000);assert.equal(result.last_page,100);
  assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 1-100 de ');
  assert.equal(ui.nodes.get('result-title').textContent,'4.143.240 contratações');
  const warning=ui.nodes.get('window-warning');assert.equal(warning.hidden,false);
  assert.equal(ui.nodes.get('window-warning-tooltip').textContent,'Refine a pesquisa para acessar todos os resultados. A janela acessível é de 10000 documentos.');
  assert.equal(ui.nodes.get('window-warning-tooltip').hidden,true);assert.equal(ui.nodes.get('notice').hidden,true);
  extraWarning=true;await ui.request({page:100});
  assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 9.901-10.000 de ');
  assert.equal(ui.nodes.get('notice').hidden,false);
  assert.equal(ui.nodes.get('notice').textContent,'Há documentos sem identidade de negócio na página.');
  fail=true;await assert.rejects(ui.request({page:1}),e=>e.code==='PNCP_UNAVAILABLE');
  assert.match(ui.nodes.get('notice').textContent,/PNCP indisponível/);assert.match(ui.nodes.get('notice').textContent,/resultado anterior/);
  assert.equal(ui.nodes.get('notice').className,'notice error');assert.equal(warning.hidden,false);
  fail=false;extraWarning=false;total=10000;await ui.request({page:1});
  assert.equal(warning.hidden,true);assert.equal(ui.nodes.get('notice').hidden,true);
});

test('TABLE-FOOTER-02: intervalo usa os dados da página curta e apresenta zero para consulta vazia',async()=>{
  const source=service(Array.from({length:164},(_,i)=>document(i+1))),empty=service([]);
  let noResults=false;
  const ui=await interfaceFixture({queryHandler:async input=>(await (noResults?empty:source).service.execute(input))});
  await ui.request({page:1});assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 1-100 de ');
  await ui.request({page:2});assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 101-164 de ');
  assert.equal(ui.nodes.get('result-title').textContent,'164 contratações');
  noResults=true;await ui.request({page:1});
  assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 0-0 de ');assert.equal(ui.nodes.get('result-title').textContent,'0 contratações');
  assert.equal(ui.nodes.get('window-warning').hidden,true);
});

test('TABLE-LOADER-01: consulta, atualização e paginação mostram loader; sucesso, falha e cancelamento o removem',async()=>{
  const source=service(Array.from({length:164},(_,i)=>document(i+1))),waiting=[];
  const ui=await interfaceFixture({deferTableReady:true,queryHandler:(input,{signal})=>new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException('Consulta cancelada.','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    waiting.push({finish:async()=>{signal.removeEventListener('abort',abort);resolve((await source.service.execute(input)));},fail:()=>{signal.removeEventListener('abort',abort);resolve(({error:{code:'PNCP_UNAVAILABLE',message:'PNCP indisponível.'}}));}});
  })});
  const loader=ui.nodes.get('table-loader'),table=ui.nodes.get('results-table'),title=ui.nodes.get('table-loader-title');
  const busy=value=>{assert.equal(loader.hidden,!value);assert.equal(table.inert,value);assert.equal(table.getAttribute('aria-busy'),String(value));assert.equal(ui.nodes.get('search-button').hidden,value);assert.equal(ui.nodes.get('cancel-button').hidden,!value);};
  busy(false);
  const initial=ui.startTable();await settle();busy(true);assert.equal(title.textContent,'Carregando contratações');assert.equal(ui.nodes.get('cancel-button').hidden,false);
  await waiting[0].finish();await initial;busy(false);
  const refresh=ui.nodes.get('refresh-button').fire('click');await settle();busy(true);assert.equal(title.textContent,'Atualizando contratações');
  await waiting[1].finish();await refresh;busy(false);
  const second=ui.request({page:2});await settle();busy(true);assert.equal(title.textContent,'Carregando página 2');
  await waiting[2].finish();const result=await second;assert.equal(result.data.length,64);busy(false);
  const failure=ui.request({page:1}).catch(error=>error);await settle();busy(true);
  waiting[3].fail();assert.equal((await failure).code,'PNCP_UNAVAILABLE');busy(false);
  const cancelled=ui.request({page:2}).catch(error=>error);await settle();busy(true);
  await ui.nodes.get('cancel-button').fire('click');assert.equal((await cancelled).name,'AbortError');busy(false);
});

test('TABLE-LOADER-02: resposta antiga não oculta o loader da consulta mais recente',async()=>{
  const source=service([document(1)]),waiting=[];
  const ui=await interfaceFixture({deferTableReady:true,queryHandler:input=>new Promise(resolve=>{
    // Simula uma fonte que entrega a resposta mesmo depois do cancelamento.
    waiting.push(async()=>resolve((await source.service.execute(input))));
  })});
  const first=ui.request({page:1}).catch(error=>error);await settle();
  const latest=ui.request({page:1});await settle();
  await waiting[0]();assert.equal((await first).name,'AbortError');
  assert.equal(ui.nodes.get('table-loader').hidden,false);assert.equal(ui.nodes.get('results-table').inert,true);
  assert.equal(ui.nodes.get('search-button').hidden,true);assert.equal(ui.nodes.get('cancel-button').hidden,false);
  await waiting[1]();await latest;
  assert.equal(ui.nodes.get('table-loader').hidden,true);assert.equal(ui.nodes.get('results-table').inert,false);
  assert.equal(ui.nodes.get('search-button').hidden,false);assert.equal(ui.nodes.get('cancel-button').hidden,true);
});

test('FILTERS-UI-01: aplicar texto, período e status envia apenas critérios nativos',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  assert.equal(ui.requests.length,1);ui.nodes.get('draft-search').value='Oracle';
  ui.nodes.get('filter-data_publicacao_inicio').value='2026-09-01';await ui.nodes.get('filter-data_publicacao_inicio').fire('input');
  ui.nodes.get('filter-data_publicacao_fim').value='2026-09-30';await ui.nodes.get('filter-data_publicacao_fim').fire('input');
  ui.nodes.get('draft-status').value='recebendo_proposta';await ui.nodes.get('apply-filters').fire('click');
  assert.equal(ui.requests.length,2);
  assert.deepEqual(ui.requests[1],{api_version:'2.0',document_type:'edital',q:'Oracle',status:'recebendo_proposta',pncp_filters:{data_publicacao_inicio:'2026-09-01',data_publicacao_fim:'2026-09-30'},order:'-data',page:1,size:100});
  assert.equal(ui.itemRequests.length,0);
});

test('FILTERS-UI-02: cancelar mantém a consulta; limpar remove todos os critérios',async()=>{
  const ui=await interfaceFixture();ui.nodes.get('search').value='firewall';await ui.nodes.get('search-form').fire('submit');
  const before=ui.state();await ui.nodes.get('filters-button').fire('click');
  ui.nodes.get('draft-search').value='texto cancelado';ui.nodes.get('filter-data_publicacao_inicio').value='2026-09-20';await ui.nodes.get('filter-data_publicacao_inicio').fire('input');ui.nodes.get('filters-dialog').close();
  assert.deepEqual(ui.state(),before);assert.equal(ui.requests.length,2);
  await ui.nodes.get('clear-button').fire('click');assert.equal(ui.requests.length,3);
  assert.equal(ui.state().q,'');assert.equal(ui.state().status,'todos');assert.deepEqual(ui.state().pncp_filters,{});
  assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
});

test('FILTERS-UI-03: datas removidas do formulário não permanecem na requisição',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  ui.nodes.get('filter-data_publicacao_inicio').value='2026-09-01';await ui.nodes.get('filter-data_publicacao_inicio').fire('input');
  ui.nodes.get('filter-data_publicacao_inicio').value='';await ui.nodes.get('filter-data_publicacao_inicio').fire('input');
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests[1].pncp_filters,{});
});

test('DETAILS-UI-01: abrir uma linha carrega itens automaticamente e usa o link /app/editais',async()=>{
  const ui=await interfaceFixture(),doc=project(document(1,{item_url:'/compras/00000000000000/2026/1'}));
  const columns=ui.tableColumns();assert.equal(columns[0].field,'titulo');assert.equal(columns[0].visible,true);assert.equal(columns.find(c=>c.field==='municipio_nome').visible,true);
  await ui.openDocument(doc);assert.equal(ui.nodes.get('details-dialog').open,true);assert.equal(ui.itemRequests.length,1);
  assert.deepEqual(ui.itemRequests[0],{document:{type:'edital',cnpj:'00000000000000',ano:'2026',sequencial:'1'},page:1,size:100});
  assert(ui.all.some(n=>n.className==='item-card'));assert.equal(ui.all.find(n=>n.textContent==='Abrir no PNCP').href,'https://pncp.gov.br/app/editais/00000000000000/2026/1');
  assert(!ui.all.some(n=>n.textContent==='Atualizar itens'));
  assert.equal(ui.all.find(n=>n.textContent==='Tentar consultar itens').hidden,true);
});
test('DETAILS-UI-02: ausência de identificação mostra aviso sem tentar consultar itens',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(document(1,{orgao_cnpj:null})));
  assert.equal(ui.itemRequests.length,0);assert(ui.all.some(n=>n.className==='items-status' && /não forneceu CNPJ/.test(n.textContent)));
});
test('DETAILS-UI-03: erro no carregamento automático permite repetir a consulta de itens',async()=>{
  const ui=await interfaceFixture({detailFailures:1});await ui.openDocument(project(document(1)));
  assert.equal(ui.itemRequests.length,1);const retry=ui.all.find(n=>n.textContent==='Tentar consultar itens');assert(retry);assert.equal(retry.hidden,false);
  await retry.fire('click');assert.equal(ui.itemRequests.length,2);assert(ui.all.some(n=>n.className==='item-card'));assert.equal(retry.hidden,true);
});

test('DETAILS-UI-04: mostra 109 itens e mantém a última página sem oferecer uma página vazia',async()=>{
  let total=109;const itemPages=[];
  const ui=await interfaceFixture({itemFetcher:url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/itens/quantidade'))return Promise.resolve((total));
    if(u.pathname.endsWith('/itens')) {
      const page=Number(u.searchParams.get('pagina'));itemPages.push(page);
      return Promise.resolve((Array.from({length:total},(_,i)=>({numeroItem:i+1,descricao:`Item ${i+1}`})).slice((page-1)*100,page*100)));
    }
    return demoFetch(url);
  }});
  await ui.openDocument(project(document(1)));
  const section=ui.nodes.get('details-content').children.find(n=>n.className==='items-section');
  const [toolbar,itemStatus,list,pager]=section.children,[previous,pageLabel,next]=pager.children;
  assert.equal(toolbar.children[0].textContent,'Itens da contratação (109)');
  assert.match(itemStatus.textContent,/Itens 1–100 de 109/);assert.equal(pageLabel.textContent,'Página 1 de 2');
  assert.equal(previous.disabled,true);assert.equal(next.disabled,false);
  await next.fire('click');
  assert.equal(list.children.length,9);assert.equal(list.children[0].children[0].textContent,'Item 101');
  assert.match(itemStatus.textContent,/Itens 101–109 de 109/);assert.equal(pageLabel.textContent,'Página 2 de 2');
  assert.equal(next.disabled,true);assert.equal(previous.disabled,false);assert.deepEqual(itemPages,[1,2]);
  assert(!ui.all.some(n=>/Fim dos itens confirmado/.test(n.textContent || '')));
  await previous.fire('click');assert.equal(pageLabel.textContent,'Página 1 de 2');assert.equal(next.disabled,false);
  await next.fire('click');
  await previous.fire('click');total=1;await next.fire('click');
  assert.equal(toolbar.children[0].textContent,'Itens da contratação (1)');
  assert.equal(pageLabel.textContent,'Página 1 de 1');assert.equal(list.children.length,1);assert.equal(pager.hidden,true);
  assert.match(itemStatus.textContent,/Itens 1–1 de 1/);assert.equal(next.disabled,true);
});

test('DETAILS-UI-05: contratação sem itens mostra total zero e oculta a paginação',async()=>{
  const ui=await interfaceFixture({itemFetcher:url=>new URL(url).pathname.endsWith('/itens/quantidade')?Promise.resolve((0)):demoFetch(url)});
  await ui.openDocument(project(document(1)));
  const section=ui.nodes.get('details-content').children.find(n=>n.className==='items-section'),[toolbar,itemStatus,list,pager]=section.children;
  assert.equal(toolbar.children[0].textContent,'Itens da contratação (0)');assert.match(itemStatus.textContent,/0 itens/);
  assert.equal(list.children[0].textContent,'Esta contratação não possui itens.');assert.equal(pager.hidden,true);
});

test('DETAILS-UI-06: quantidade e valores do PNCP preservam precisão, zero e ausência de informação',async()=>{
  const ui=await interfaceFixture({itemFetcher:url=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/itens/quantidade'))return Promise.resolve((4));
    if(path.endsWith('/itens'))return Promise.resolve(new Response(`[
      {"numeroItem":1,"quantidade":1234.56789,"valorUnitarioEstimado":9007199254740993.12345,"valorTotal":111222333444555666.98765},
      {"numeroItem":2,"quantidade":0,"valorUnitarioEstimado":0,"valorTotal":0},
      {"numeroItem":3,"quantidade":null,"valorTotal":null},
      {"numeroItem":4,"quantidade":30.0000,"valorUnitarioEstimado":3296.01,"valorTotal":98880.3}
    ]`,{headers:{'Content-Type':'application/json'}}));
    return demoFetch(url);
  }});
  await ui.openDocument(project(document(1)));
  const values=ui.all.filter(n=>n.className==='item-values');assert.equal(values.length,4);
  assert.deepEqual(values[0].children.map(n=>n.children[0].textContent),['Quantidade','Valor unitário estimado','Valor total estimado']);
  assert.deepEqual(values.map(n=>n.children.map(field=>field.children[1].textContent)),[
    ['1.234,56789','R$ 9.007.199.254.740.993,12345','R$ 111.222.333.444.555.666,98765'],
    ['0','R$ 0,00','R$ 0,00'],
    ['—','—','—'],
    ['30','R$ 3.296,01','R$ 98.880,30'],
  ]);
});

test('FILTERS-UI-04: mostra todos os filtros compatíveis, agrupados, sem seletor nem botão de adicionar',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  const groups=ui.nodes.get('filter-groups').children;
  assert.deepEqual(groups.map(g=>g.children[0].textContent),['Contratação','Item','Resultado do item','Fornecedor']);
  const caps=schema(config()).capabilities.filter(c=>!c.reserved && c.state==='enabled' && c.documents.includes('edital'));
  assert.deepEqual(ui.fieldNames(),groups.flatMap(g=>g.children.at(-1).children.map(f=>f.id.slice('filter-field-'.length))));
  assert.deepEqual([...ui.fieldNames()].sort(),caps.map(c=>c.name).sort());
  assert.equal(ui.fieldNames().length,71);assert.equal(ui.field('tipos_contrato'),undefined);assert.equal(ui.nodes.has('add-native'),false);assert.equal(ui.nodes.has('native-field'),false);
  for(const cap of caps){const input=ui.field(cap.name);assert.equal(input.disabled || false,false);assert.equal(input.value,'');if(cap.cardinality==='multiple')assert.equal(input.tagName,'input');}
  assert.deepEqual(ui.draft().pncp_filters,{});
});

test('FILTER-OPTIONS-UI-01: inicializa todas as listas e reabrir filtros dos três tipos não faz consultas',async()=>{
  const storage=memoryStorage(),ui=await interfaceFixture({storage});assert.equal(ui.domainRequests.length,8);assert.equal(storage.data.size,8);
  assert.deepEqual(ui.domainRequests.filter(request=>request.field===null).map(request=>request.type),['edital','ata','contrato']);
  for(const type of ['edital','ata','contrato']){
    if(type!=='edital'){ui.nodes.get('document-type').value=type;await ui.nodes.get('document-type').fire('change');}
    for(let i=0;i<2;i++){await ui.nodes.get('filters-button').fire('click');assert.equal(ui.field('ufs').disabled,false);assert((await ui.options('ufs')).length>0);ui.nodes.get('filters-dialog').close();}
  }
  assert.equal(ui.domainRequests.length,8);
});

test('FILTER-OPTIONS-UI-02: nova inicialização reusa o armazenamento até quatro horas e atualiza depois',async()=>{
  const storage=memoryStorage();let time=1000;const options={storage,cacheSettings:{now:()=>time}};
  const first=await interfaceFixture(options);assert.equal(first.domainRequests.length,8);
  time+=FILTER_OPTIONS_TTL-1;const cached=await interfaceFixture(options);assert.equal(cached.domainRequests.length,0);await cached.nodes.get('filters-button').fire('click');assert.equal(cached.domainRequests.length,0);
  time++;const refreshed=await interfaceFixture(options);assert.equal(refreshed.domainRequests.length,8);await refreshed.nodes.get('filters-button').fire('click');assert.equal(refreshed.domainRequests.length,8);
});

test('FILTER-OPTIONS-UI-03: aba aberta invalida memória após quatro horas e recupera falha de pré-carga',async()=>{
  let time=1000,failed=true;const ui=await interfaceFixture({cacheSettings:{now:()=>time},domainHandler:(payload,options,core)=>{
    if(payload.type==='edital' && payload.field===null && failed){failed=false;throw new Error('Indisponível');}
    return core.domains(payload.type,payload.normatives,options.signal,null,payload.field);
  }});
  assert.equal(ui.requests.length,1);assert.equal(ui.nodes.get('startup-error').hidden,true);assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
  await ui.nodes.get('filters-button').fire('click');assert.equal(ui.field('ufs').disabled,false);assert.equal(ui.domainRequests.length,9);ui.nodes.get('filters-dialog').close();
  time+=FILTER_OPTIONS_TTL;await ui.nodes.get('filters-button').fire('click');assert.equal(ui.domainRequests.length,15);assert.equal(ui.field('ufs').disabled,false);
});

test('FILTER-OPTIONS-UI-04: pré-carga lenta não bloqueia a tabela e abrir filtros compartilha a chamada pendente',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const ui=await interfaceFixture({waitOptions:false,domainHandler:async(payload,options,core)=>{
    await gate;return core.domains(payload.type,payload.normatives,options.signal,null,payload.field);
  }});
  assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');assert.equal(ui.domainRequests.length,1);
  const opening=ui.nodes.get('filters-button').fire('click');await settle();assert.equal(ui.field('ufs').disabled,true);assert.equal(ui.domainRequests.length,1);
  release();await opening;await ui.optionsReady;
  assert.equal(ui.field('ufs').disabled,false);assert.equal(ui.domainRequests.length,8);
});

test('FILTERS-UI-05: edição envia Não, ignora campos intocados e só pesquisa ao aplicar',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  await ui.editFilter('srp',false);assert.equal(ui.requests.length,1);assert.deepEqual(ui.state().pncp_filters,{});
  await ui.nodes.get('apply-filters').fire('click');
  assert.deepEqual(ui.requests.at(-1).pncp_filters,{srp:false});assert.equal(ui.nodes.get('result-title').textContent,'32 contratações');
});

test('FILTERS-UI-06: enum tem opção neutra e catálogo inativo usa seleção múltipla',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  assert.equal(ui.field('tipos_margens_preferencia').tagName,'select');assert.equal(ui.field('tipos_margens_preferencia').children[0].value,'');
  await ui.editFilter('tipos_margens_preferencia','2');assert.equal(ui.draft().pncp_filters.tipos_margens_preferencia,'2');
  assert.equal(ui.field('naturezas_juridicas').getAttribute('role'),'combobox');const choices=await ui.options('naturezas_juridicas');assert.equal(choices[0].dataset.value,'0000');assert.match(choices[0].getAttribute('aria-label'),/inativa/);
  assert(ui.domainRequests.some(request=>request.field==='naturezas_juridicas'));
  await ui.editFilter('tipos_margens_preferencia',undefined);assert.equal(ui.draft().pncp_filters.tipos_margens_preferencia,undefined);
});

test('FILTERS-UI-07: mudar normativo atualiza opções e remove amparos incompatíveis sem afetar outros domínios',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  await ui.editFilter('amparos_legais',['1','19','98']);await ui.editFilter('normativos_base',['1']);
  assert.deepEqual(ui.draft().pncp_filters,{amparos_legais:['1','19'],normativos_base:['1']});
  assert.equal(ui.nodes.get('apply-filters').disabled,false);assert.equal(ui.nodes.get('legal-error').hidden,false);
  const request=ui.domainRequests.at(-1);assert.equal(request.field,'amparos_legais');assert.deepEqual(request.normatives,['1']);
  assert(!(await ui.options('amparos_legais')).some(o=>o.dataset.value==='98'));assert((await ui.options('ufs')).some(o=>o.dataset.value==='DF'));
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests.at(-1).pncp_filters,{amparos_legais:['1','19'],normativos_base:['1']});assert.equal(ui.nodes.get('result-title').textContent,'32 contratações');
});

test('FILTERS-UI-08: falha de reconciliação bloqueia aplicar e permite tentar novamente',async()=>{
  let attempts=0;
  const ui=await interfaceFixture({domainHandler:async(payload,options,core)=>{
    if(payload.field==='amparos_legais' && attempts++===0)throw new Error('Indisponível');
    return core.domains(payload.type,payload.normatives,options.signal,null,payload.field);
  }});await ui.nodes.get('filters-button').fire('click');
  await ui.editFilter('amparos_legais',['19','98']);await ui.editFilter('normativos_base',['1']);
  assert.equal(ui.nodes.get('apply-filters').disabled,true);const before=ui.requests.length;await ui.nodes.get('apply-filters').fire('click');assert.equal(ui.requests.length,before);
  await ui.nodes.get('filter-error-amparos_legais').children.at(-1).fire('click');assert.equal(ui.nodes.get('apply-filters').disabled,false);assert.deepEqual(ui.draft().pncp_filters.amparos_legais,['19']);
});

test('FILTERS-UI-09: resposta tardia de amparos não altera um novo rascunho',async()=>{
  let resolve;
  const ui=await interfaceFixture({domainHandler:async(payload,options,core)=>{
    if(payload.field==='amparos_legais' && payload.normatives?.[0]==='1')return new Promise(done=>{resolve=done;});
    return core.domains(payload.type,payload.normatives,options.signal,null,payload.field);
  }});await ui.nodes.get('filters-button').fire('click');await ui.editFilter('amparos_legais',['19','98']);
  const normative=(await ui.options('normativos_base')).find(button=>button.dataset.value==='1');
  const pending=normative.fire('click');await settle();assert.equal(ui.nodes.get('apply-filters').disabled,true);assert.equal(ui.field('amparos_legais').disabled,true);
  await ui.editFilter('amparos_legais',['19']);assert.equal(ui.nodes.get('apply-filters').disabled,true);
  ui.nodes.get('filters-dialog').close();await ui.nodes.get('filters-button').fire('click');
  resolve(({filters:{amparos_legais:[{id:'19',label:'Amparo'}]}}));await pending;
  assert.deepEqual(ui.draft().pncp_filters,{});assert.equal(ui.nodes.get('apply-filters').disabled,false);
});

test('FILTERS-UI-10: sistemas de origem e modos de disputa usam múltiplos IDs por padrão',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  for(const [name,values]of [['fontes',['3','5']],['modos_disputa',['1','2']]]){assert.equal(ui.field(name).getAttribute('role'),'combobox');await ui.editFilter(name,values);}
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests.at(-1).pncp_filters,{fontes:['3','5'],modos_disputa:['1','2']});assert.equal(ui.nodes.get('result-title').textContent,'43 contratações');
});

test('FILTERS-UI-11: condições documentais preservam Não ao reabrir e permitem voltar à opção neutra',async()=>{
  const ui=await interfaceFixture(),names=['indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional'];
  await ui.nodes.get('filters-button').fire('click');
  for(const name of names){assert.equal(ui.nodes.get(`filter-help-${name}`).hidden,true);assert.equal(ui.field(name).getAttribute('aria-describedby'),null);await ui.editFilter(name,false);}
  await ui.nodes.get('apply-filters').fire('click');assert(names.every(name=>ui.requests.at(-1).pncp_filters[name]===false));assert.equal(ui.nodes.get('result-title').textContent,'16 contratações');
  assert(ui.nodes.get('native-chips').children.every(n=>n.textContent.endsWith(': Não')));
  await ui.nodes.get('filters-button').fire('click');for(const name of names){assert.equal(ui.field(name).value,'false');await ui.editFilter(name,undefined);}
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests.at(-1).pncp_filters,{});assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
});

test('FILTERS-UI-12: domínio indisponível bloqueia só seus campos e permite tentar novamente',async()=>{
  let failed=true;const ui=await interfaceFixture({domainHandler:async(payload,options,core)=>failed?{error:{message:'Origem indisponível'}}:core.domains(payload.type,payload.normatives,options.signal,null,payload.field)});
  await ui.nodes.get('filters-button').fire('click');assert.equal(ui.field('fontes').disabled,true);assert.equal(ui.nodes.get('filter-error-fontes').hidden,false);
  await ui.editFilter('fontes',['3']);assert.deepEqual(ui.draft().pncp_filters,{});
  await ui.editFilter('srp',false);assert.deepEqual(ui.draft().pncp_filters,{srp:false});
  failed=false;await ui.nodes.get('filter-error-fontes').children.at(-1).fire('click');assert.equal(ui.field('fontes').disabled,false);await ui.editFilter('fontes',['3']);
  assert.deepEqual(ui.draft().pncp_filters,{srp:false,fontes:['3']});
});

test('FILTERS-UI-13: filtros de itens usam domínios e informam o alcance dos detalhes',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  assert(ui.nodes.get('filter-groups').children.some(g=>g.children.some(n=>n.textContent?.includes('Os detalhes mostram todos os itens'))));
  for(const [name,ids]of [['criterios_julgamento',['7']],['categorias_leilao',['1']],['beneficios',['1']]]){assert.equal(ui.field(name).getAttribute('role'),'combobox');await ui.editFilter(name,ids);}
  for(const name of ['possui_emenda_parlamentar','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'])await ui.editFilter(name,true);
  await ui.nodes.get('apply-filters').fire('click');const filters=ui.requests.at(-1).pncp_filters;
  assert.deepEqual(filters.criterios_julgamento,['7']);assert.deepEqual(filters.categorias_leilao,['1']);assert.deepEqual(filters.beneficios,['1']);assert.equal(filters.possui_emenda_parlamentar,true);assert.equal(ui.nodes.get('result-title').textContent,'6 contratações');
});

test('FILTERS-UI-14: Não é preservado ao editar condições de itens e emenda',async()=>{
  const ui=await interfaceFixture(),names=['possui_emenda_parlamentar','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'];
  await ui.nodes.get('filters-button').fire('click');for(const name of names)await ui.editFilter(name,false);
  await ui.nodes.get('apply-filters').fire('click');assert(names.every(name=>ui.requests.at(-1).pncp_filters[name]===false));assert.equal(ui.nodes.get('result-title').textContent,'16 contratações');
  await ui.nodes.get('filters-button').fire('click');for(const name of names)assert.equal(ui.field(name).value,'false');
});

test('FILTERS-UI-15: Não é preservado nos cinco booleanos restantes',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  const names=['permite_adesao','indicador_subcontratacao','indicador_aplicacao_margem_preferencia','indicador_aplicacao_beneficio_me_epp','indicador_aplicacao_criterio_desempate'];
  for(const name of names)await ui.editFilter(name,false);
  await ui.nodes.get('apply-filters').fire('click');assert(names.every(name=>ui.requests.at(-1).pncp_filters[name]===false));assert.equal(ui.nodes.get('result-title').textContent,'16 contratações');
  await ui.nodes.get('filters-button').fire('click');for(const name of names)assert.equal(ui.field(name).value,'false');
});

test('FILTERS-UI-16: países, reserva, inteiro zero, percentual e data mantêm seus formatos',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  for(const [name,value]of [['paises_fornecedor',['BRA']],['reservas_remanescentes',['2']],['ordem_classificacao_min','0'],['resultado_percentual_desconto_min','0.00'],['data_homologacao_inicio','2026-09-01']])await ui.editFilter(name,value);
  await ui.nodes.get('apply-filters').fire('click');const filters=ui.requests.at(-1).pncp_filters;assert.deepEqual(filters.paises_fornecedor,['BRA']);assert.deepEqual(filters.reservas_remanescentes,['2']);assert.equal(filters.ordem_classificacao_min,0);assert.equal(filters.resultado_percentual_desconto_min,'0.00');assert.equal(filters.data_homologacao_inicio,'2026-09-01');
});

test('FILTERS-UI-17: normativo atualiza amparos ainda sem seleção e reabrir preserva os outros domínios',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  await ui.editFilter('normativos_base',['1']);assert.equal(ui.field('amparos_legais').disabled,false);assert(!(await ui.options('amparos_legais')).some(o=>o.dataset.value==='98'));
  await ui.editFilter('ufs',['DF']);await ui.nodes.get('apply-filters').fire('click');const before=ui.domainRequests.length;
  await ui.nodes.get('filters-button').fire('click');assert.equal(ui.domainRequests.length,before);assert((await ui.options('ufs')).some(o=>o.dataset.value==='GO'));assert((await ui.options('modalidades')).length>0);
  assert.deepEqual(ui.draft().pncp_filters,{normativos_base:['1'],ufs:['DF']});
});

test('FILTERS-UI-18: campos com sugestões mantêm seleções independentes e permitem remover uma delas',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  const orgao=(await ui.options('orgaos'))[0],fornecedor=(await ui.options('fornecedores'))[0];
  await orgao.fire('click');const orgaos=ui.draft().pncp_filters.orgaos;await fornecedor.fire('click');
  assert.deepEqual(ui.draft().pncp_filters.orgaos,orgaos);assert.equal(ui.draft().pncp_filters.fornecedores.length,1);
  const suppliers=ui.draft().pncp_filters.fornecedores;
  await ui.nodes.get('filter-selected-orgaos').children[0].fire('click');assert.equal(ui.draft().pncp_filters.orgaos,undefined);assert.deepEqual(ui.draft().pncp_filters.fornecedores,suppliers);assert.equal(ui.requests.length,1);
  ui.nodes.get('filters-dialog').close();await ui.nodes.get('filters-button').fire('click');assert.deepEqual(ui.draft().pncp_filters,{});
});

test('FILTERS-UI-19: falha de amparos sem seleção permite pesquisar só pelo normativo e recuperar as opções',async()=>{
  const ui=await interfaceFixture({domainHandler:(payload,options,core)=>payload.normatives?.length?Promise.reject(new Error('Indisponível')):core.domains(payload.type,payload.normatives,options.signal,null,payload.field)});
  await ui.nodes.get('filters-button').fire('click');await ui.editFilter('normativos_base',['1']);assert.equal(ui.nodes.get('apply-filters').disabled,false);assert.equal(ui.field('amparos_legais').disabled,true);
  await ui.editFilter('normativos_base',[]);assert.equal(ui.field('amparos_legais').disabled,false);assert.deepEqual(ui.draft().pncp_filters,{});
});

test('FILTERS-UI-20: limpar campos remove false, zero e listas sem pesquisar antes de aplicar',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  for(const [name,value]of [['srp',false],['ordem_classificacao_min',0],['ufs',['DF']]]) {
    await ui.editFilter(name,value);const clear=ui.nodes.get(`filter-field-${name}`).children[0].children[1];assert.equal(clear.hidden,false);
    await clear.fire('click');assert.equal(clear.hidden,true);assert.equal(ui.draft().pncp_filters[name],undefined);
  }
  assert.deepEqual(ui.draft().pncp_filters,{});assert.equal(ui.requests.length,1);await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests.at(-1).pncp_filters,{});
});

test('FILTERS-UI-21: múltiplos usam busca local sem acentos, alternam opções e preservam a consulta',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  const input=ui.field('modalidades'),popup=ui.nodes.get('filter-suggestions-modalidades');
  assert.equal(input.tagName,'input');assert.equal(input.getAttribute('role'),'combobox');assert.equal(popup.getAttribute('aria-multiselectable'),'true');
  input.focus();await input.fire('focus');input.value='eletronico';await input.fire('input');
  const choices=popup.children.filter(node=>node.tagName==='button');assert.equal(choices.length,1);assert.match(choices[0].getAttribute('aria-label'),/Eletrônico/);
  assert.equal(ui.suggestRequests.length,0);assert.deepEqual(ui.draft().pncp_filters,{});
  await input.fire('keydown',{key:'ArrowDown'});await input.fire('keydown',{key:'Enter'});
  assert.deepEqual(ui.draft().pncp_filters.modalidades,[choices[0].dataset.value]);assert.equal(choices[0].getAttribute('aria-selected'),'true');
  await input.fire('keydown',{key:'Enter'});assert.equal(ui.draft().pncp_filters.modalidades,undefined);
  await input.fire('keydown',{key:'Escape'});assert.equal(input.getAttribute('aria-expanded'),'false');assert.equal(ui.nodes.get('filters-dialog').open,true);assert.equal(ui.requests.length,1);
});

test('FILTERS-UI-23: município do fornecedor ausente da lista inicial permite sugestões, aplicação e cache', {timeout:10000},async()=>{
  const storage=memoryStorage(),suggestUrls=[];
  let suggested;
  const called=new Promise(resolve=>{suggested=resolve;});
  const provider=async(url,init)=>{
    const parsed=new URL(url);
    if(parsed.pathname.endsWith('/suggest')){
      suggestUrls.push(parsed);
      suggested();
      return Response.json({items:[{id:5300108,nome:'Brasília - DF'}]});
    }
    const response=await demoFetch(url,init);
    if(!parsed.pathname.endsWith('/filters'))return response;
    const data=await response.json();
    delete data.filters.municipios_fornecedor;
    delete data.filters.modalidades;
    return Response.json(data);
  };
  const ui=await interfaceFixture({storage,itemFetcher:provider});
  await ui.nodes.get('filters-button').fire('click');
  const input=ui.field('municipios_fornecedor');
  assert.equal(input.disabled,false);
  assert.equal(ui.nodes.get('filter-error-municipios_fornecedor').hidden,true);
  assert.equal(ui.field('modalidades').disabled,true);
  assert.match(ui.nodes.get('filter-error-modalidades').children[0].textContent,/O PNCP não forneceu opções/);
  await ui.options('municipios_fornecedor');
  input.value='Br';await input.fire('input');assert.equal(ui.suggestRequests.length,0);
  input.value='Brasília';await input.fire('input');await called;await settle();
  const url=suggestUrls[0];
  assert.equal(url.origin,'https://pncp.gov.br');assert.equal(url.pathname,'/api/search/suggest');
  assert.deepEqual(Object.fromEntries(url.searchParams),{tipos_documento:'edital',campo:'municipios_fornecedor',q:'Brasília',tam_pagina:'20'});
  const option=(await ui.options('municipios_fornecedor'))[0];
  assert.equal(option.dataset.value,'5300108');assert.equal(option.getAttribute('aria-label'),'Brasília - DF');
  await option.fire('click');await ui.nodes.get('apply-filters').fire('click');
  assert.deepEqual(ui.requests.at(-1).pncp_filters.municipios_fornecedor,['5300108']);
  assert.equal(new URL(ui.browser.href()).searchParams.get('municipios_fornecedor'),'5300108');
  const restored=await interfaceFixture({storage,itemFetcher:provider,href:ui.browser.href()});
  assert.equal(restored.domainRequests.length,0);
  await restored.nodes.get('filters-button').fire('click');
  assert.equal(restored.field('municipios_fornecedor').disabled,false);
  assert.deepEqual(restored.draft().pncp_filters.municipios_fornecedor,['5300108']);
});

test('FILTERS-UI-22: refocar uma busca remota pendente preserva o carregamento e aguarda as novas opções',async()=>{
  let started,finish;const called=new Promise(resolve=>{started=resolve;});
  const ui=await interfaceFixture({suggestHandler:()=>new Promise(resolve=>{finish=resolve;started();})});
  await ui.nodes.get('filters-button').fire('click');const input=ui.field('orgaos'),popup=ui.nodes.get('filter-suggestions-orgaos');
  input.focus();await input.fire('focus');input.value='novo órgão';await input.fire('input');await called;
  await input.fire('blur');await input.fire('focus');assert.equal(input.getAttribute('aria-expanded'),'true');assert.equal(popup.children.filter(node=>node.tagName==='button').length,0);assert.match(popup.children[0].textContent,/Consultando opções/);
  await input.fire('click');assert.equal(popup.children.filter(node=>node.tagName==='button').length,0);
  finish({items:[{id:'77',label:'Novo órgão'}]});await settle();const option=popup.children.find(node=>node.tagName==='button');assert.equal(option.dataset.value,'77');
  await option.fire('click');assert.deepEqual(ui.draft().pncp_filters.orgaos,['77']);assert.equal(ui.requests.length,1);
});

test('CONTRACTS-UI-01: trocar o tipo reinicia critérios, colunas e status e permite consultar e exportar contratos',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');await ui.setFilter('srp',true);await ui.nodes.get('apply-filters').fire('click');
  ui.nodes.get('document-type').value='contrato';await ui.nodes.get('document-type').fire('change');
  assert.equal(ui.state().document_type,'contrato');assert.deepEqual(ui.state().pncp_filters,{});assert.equal(ui.nodes.get('result-title').textContent,'32 contratos');assert(ui.tableColumns().some(c=>c.field==='valor_global'));assert(!ui.tableColumns().some(c=>c.field==='valor_total_estimado'));
  assert.deepEqual(ui.nodes.get('draft-status').children.map(o=>o.value),['todos','vigente','nao_vigente']);
  const domainsBefore=ui.domainRequests.length;await ui.nodes.get('filters-button').fire('click');assert(ui.field('tipos_contrato'));assert.equal(ui.field('item_quantidade_min'),undefined);assert.equal(ui.domainRequests.length,domainsBefore);assert(ui.domainRequests.some(request=>request.type==='contrato' && request.field===null));
  await ui.editFilter('tipos_contrato',['1']);
  await ui.editFilter('possui_nfe',true);await ui.nodes.get('apply-filters').fire('click');assert.equal(ui.nodes.get('result-title').textContent,'8 contratos');
  await ui.nodes.get('export-button').fire('click');assert.equal(ui.exportRequests.at(-1).query.document_type,'contrato');assert.deepEqual(ui.exportRequests.at(-1).query.pncp_filters,{tipos_contrato:['1'],possui_nfe:true});
  await ui.nodes.get('clear-button').fire('click');assert.equal(ui.state().document_type,'contrato');assert.equal(ui.nodes.get('result-title').textContent,'32 contratos');
  ui.nodes.get('document-type').value='edital';await ui.nodes.get('document-type').fire('change');assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');assert(ui.tableColumns().some(c=>c.field==='valor_total_estimado'));
});

test('CONTRACTS-UI-02: detalhes de contratos exibem os campos próprios sem buscar itens com o sequencial do contrato',async()=>{
  const ui=await interfaceFixture();ui.nodes.get('document-type').value='contrato';await ui.nodes.get('document-type').fire('change');await ui.openDocument(project(demoContracts[0]));
  assert.equal(ui.nodes.get('details-kind').textContent,demoContracts[0].title);
  assert.equal(ui.itemRequests.length,0);assert(!ui.all.some(n=>n.className==='items-section'));
  const values=ui.nodes.get('detail-panel-detalhes').children[0].children.map(wrap=>wrap.children[1].textContent);assert(values.includes('R$ 10.000,50'));assert(values.includes('01234567000189'));
});

test('CONTRACTS-UI-03: resposta de contrato atrasada não substitui a pesquisa após voltar a edital',async()=>{
  let finishContract;const ui=await interfaceFixture({queryHandler:async(input,options,core)=>input.document_type==='contrato'?new Promise(resolve=>{finishContract=async()=>resolve((await core.execute(input)));}):(await core.execute(input))});
  const selector=ui.nodes.get('document-type');selector.value='contrato';const toContract=selector.listeners.change[0]();await settle();assert(finishContract);
  selector.value='edital';const toEdital=selector.listeners.change[0]();await settle();await finishContract();await toContract;await toEdital;await settle();
  assert.equal(ui.state().document_type,'edital');assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');assert.equal(ui.nodes.get('export-button').disabled,false);
});

test('ATAS-UI-01: trocar para atas ajusta status, colunas, filtros, contagem e CSV',async()=>{
  const ui=await interfaceFixture();ui.nodes.get('document-type').value='ata';await ui.nodes.get('document-type').fire('change');
  assert.equal(ui.state().document_type,'ata');assert.equal(ui.nodes.get('result-title').textContent,'24 atas');
  assert(ui.tableColumns().some(c=>c.field==='cancelado'));assert(!ui.tableColumns().some(c=>c.field==='valor_total_estimado'));
  assert.deepEqual(ui.nodes.get('draft-status').children.map(c=>c.value),['todos','vigente','nao_vigente']);
  await ui.nodes.get('filters-button').fire('click');assert.equal(ui.fieldNames().length,16);assert.equal(ui.field('situacoes_item'),undefined);ui.nodes.get('draft-status').value='vigente';await ui.nodes.get('apply-filters').fire('click');assert.equal(ui.nodes.get('result-title').textContent,'12 atas');
  await ui.nodes.get('export-button').fire('click');assert.equal(ui.exportRequests.at(-1).query.document_type,'ata');assert.equal(ui.exportRequests.at(-1).query.status,'vigente');
  await ui.nodes.get('clear-button').fire('click');assert.equal(ui.state().document_type,'ata');assert.equal(ui.nodes.get('result-title').textContent,'24 atas');
});

test('ATAS-UI-02: o painel de ata carrega detalhes completos e quatro listas com identidades corretas',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(demoAtas[2]));
  assert.equal(ui.itemRequests.length,0);assert.equal(ui.documentRequests.length,1);assert.equal(ui.relatedRequests.length,4);assert.deepEqual(ui.documentRequests[0],{document:{type:'ata',cnpj:'00000000000000',ano:'2026',sequencial_compra:'3',sequencial:'3'}});
  assert(ui.relatedRequests.every(r=>r.document.type==='ata' && r.document.sequencial_compra==='3' && r.document.sequencial==='3'));
  const tabs=ui.nodes.get('details-content').children.find(n=>n.className==='detail-tabs');assert.deepEqual(tabs.children.map(b=>b.textContent),['Detalhes (22)','Partes envolvidas (1)','Contratos (2)','Arquivos (12)','Histórico (12)']);
  assert.equal(ui.nodes.get('details-kind').textContent,demoAtas[2].title);
  const titles=ui.nodes.get('detail-panel-detalhes').children[0].children.map(f=>f.children[0].textContent);assert(titles.includes('Número da ata'));assert(titles.includes('Permite adesão'));assert(!titles.includes('Valor estimado'));assert(!titles.includes('Fornecedor'));
  const origin=ui.nodes.get('detail-panel-detalhes').children[0].children.find(f=>f.children[0].textContent==='Contratação de origem');assert.match(origin.children[1].children[0].href,/\/editais\/00000000000000\/2026\/3$/);
  await ui.nodes.get('detail-tab-partesenvolvidas').fire('click');const parties=ui.nodes.get('detail-panel-partesenvolvidas');assert.equal(parties.hidden,false);assert.equal(ui.relatedRequests.length,4);
});

test('CONTRACTS-UI-04: os dados nativos e cinco listas do contrato carregam antes da seleção das abas',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(demoContracts[0]));
  assert.equal(ui.documentRequests.length,1);assert.equal(ui.relatedRequests.length,5);assert.equal(ui.itemRequests.length,0);
  const tabs=ui.nodes.get('details-content').children.find(n=>n.className==='detail-tabs');assert.deepEqual(tabs.children.map(b=>b.textContent),['Detalhes (34)','Empenhos (1)','Instrumentos de cobrança (1)','Termos (1)','Arquivos (12)','Histórico (12)']);
  assert(ui.relatedRequests.every(r=>r.document.type==='contrato' && r.document.sequencial==='1'));
  const fields=ui.nodes.get('detail-panel-detalhes').children[0].children.map(w=>[w.children[0].textContent,w.children[1].textContent]);assert(fields.some(([label,value])=>label==='Valor da parcela' && value==='R$ 100,0000'));assert(fields.some(([label,value])=>label==='Processo' && value==='DEMO-1/2026'));assert(!fields.some(([label])=>label==='Modalidade'));
});

test('CONTRACTS-UI-05: arquivos de termos e detalhes de empenhos/instrumentos consultam somente o filho escolhido',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(demoContracts[0]));assert.equal(ui.childRequests.length,0);
  for(const resource of ['termos','empenhos','instrumentocobranca']){
    await ui.nodes.get(`detail-tab-${resource}`).fire('click');const card=ui.nodes.get(`detail-panel-${resource}`).children[3].children[0],button=card.children[2],extra=card.children[3];
    await button.fire('click');assert.equal(extra.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');assert(extra.children.length>0);
    assert.deepEqual(ui.childRequests.at(-1),{document:{type:'contrato',cnpj:'00000000000000',ano:'2026',sequencial:'1'},resource,sequence:'1'});
    await button.fire('click');assert.equal(extra.hidden,true);await button.fire('click');assert.equal(extra.hidden,false);
  }
  assert.equal(ui.childRequests.length,3);assert.equal(ui.relatedRequests.length,5);
});

test('CONTRACTS-UI-06: HTTP 404 de empenhos e instrumentos de cobrança exibe abas vazias sem erro',async()=>{
  const ui=await interfaceFixture({itemFetcher:(url,init)=>/\/contratos\/\d+\/\d+\/(empenhos|instrumentocobranca)(?:\?|$)/.test(url)?Promise.resolve(new Response(null,{status:404})):demoFetch(url,init)});
  await ui.openDocument(project(demoContracts[0]));
  for(const [resource,title]of [['empenhos','Empenhos'],['instrumentocobranca','Instrumentos de cobrança']]){
    const tab=ui.nodes.get(`detail-tab-${resource}`),panel=ui.nodes.get(`detail-panel-${resource}`);
    assert.equal(tab.textContent,`${title} (0)`);assert.equal(tab.dataset.state,'loaded');assert.equal(panel.children[1].children[0].hidden,true);
    assert.match(panel.children[2].textContent,/^0 registros/);assert.equal(panel.children[3].children[0].textContent,`Nenhum registro em ${title}.`);assert.equal(panel.children[4].hidden,true);
    await tab.fire('click');assert.equal(panel.hidden,false);
  }
  assert.equal(ui.nodes.get('detail-tab-termos').dataset.state,'loaded');assert.equal(ui.nodes.get('detail-tab-arquivos').textContent,'Arquivos (12)');assert.equal(ui.nodes.get('detail-tab-historico').textContent,'Histórico (12)');assert.equal(ui.relatedRequests.length,5);
});

test('CONTRACTS-UI-07: emenda parlamentar booleana carrega os detalhes e exibe Não ou Sim',async()=>{
  for(const [value,label]of [[false,'Não'],[true,'Sim']]){
    const ui=await interfaceFixture({itemFetcher:async(url,init)=>{
      const response=await demoFetch(url,init);
      return new URL(url).pathname==='/api/pncp/v1/orgaos/00000000000000/contratos/2026/1'?Response.json({...await response.json(),emendaParlamentar:value}):response;
    }});
    await ui.openDocument(project(demoContracts[0]));
    const panel=ui.nodes.get('detail-panel-detalhes'),field=panel.children[0].children.find(f=>f.children[0].textContent==='Emenda parlamentar');
    assert(field);assert.equal(field.children[1].textContent,label);assert.equal(ui.nodes.get('detail-tab-detalhes').dataset.state,'loaded');assert.equal(panel.children[2].hidden,true);
    assert.equal(ui.documentRequests.length,1);assert.equal(ui.relatedRequests.length,5);
  }
});

test('CONTRACTS-UI-08: histórico com total desconhecido preserva navegação manual e para somente na página vazia',async()=>{
  let counts=0;const ui=await interfaceFixture({itemFetcher:(url,init)=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/contratos/2026/1/historico/quantidade')){counts++;return Response.json(1);}
    if(u.pathname.endsWith('/contratos/2026/1/historico'))return Response.json(Array.from({length:[2,1,0][Number(u.searchParams.get('pagina'))-1]},(_,i)=>({tipoLogManutencaoNome:`Evento ${i+1}`})));
    return demoFetch(url,init);
  }});
  await ui.openDocument(project(demoContracts[0]));await ui.nodes.get('detail-tab-historico').fire('click');
  const tab=ui.nodes.get('detail-tab-historico'),panel=ui.nodes.get('detail-panel-historico'),pager=panel.children[4];
  assert.equal(tab.textContent,'Histórico (?)');assert.equal(tab.dataset.state,'loaded');assert.equal(panel.children[0].textContent,'Histórico (?)');assert.equal(panel.children[1].children[0].hidden,true);
  assert.match(panel.children[2].textContent,/Quantidade desconhecida/);assert.equal(panel.children[3].children.length,2);assert.equal(pager.hidden,false);assert.equal(pager.children[1].textContent,'Página 1');assert.equal(pager.children[0].disabled,true);assert.equal(pager.children[2].disabled,false);
  await pager.children[2].fire('click');assert.equal(pager.children[1].textContent,'Página 2');assert.equal(panel.children[3].children.length,1);assert.equal(pager.children[2].disabled,false);assert.equal(tab.textContent,'Histórico (?)');
  assert.equal(ui.relatedRequests.at(-1).pagination_mode,'until_empty');
  await pager.children[2].fire('click');assert.equal(pager.children[1].textContent,'Página 3');assert.equal(pager.children[2].disabled,true);assert.equal(pager.children[0].disabled,false);assert.equal(pager.hidden,false);assert.match(panel.children[3].children[0].textContent,/Nenhum registro/);assert.match(panel.children[2].textContent,/Fim do histórico/);assert.equal(counts,1);
  await pager.children[0].fire('click');assert.equal(pager.children[1].textContent,'Página 2');assert.equal(panel.children[3].children.length,1);assert.equal(pager.children[2].disabled,false);
  await ui.openDocument(project(demoContracts[1]));assert.equal(ui.nodes.get('detail-tab-historico').textContent,'Histórico (12)');assert.equal(ui.relatedRequests.at(-1).pagination_mode,undefined);
});

test('DOCUMENTS-UI-01: falha de detalhes conserva a busca, permite tentar novamente e não impede as listas',async()=>{
  let failed=true;const ui=await interfaceFixture({documentHandler:async(url,options,core)=>{if(failed)return ({error:{message:'Falha de detalhes.'}});return (await core.documentDetails(project(demoAtas[0])._document,options.signal));}});
  await ui.openDocument(project(demoAtas[0]));const panel=ui.nodes.get('detail-panel-detalhes');assert.equal(ui.nodes.get('detail-tab-detalhes').dataset.state,'error');assert.equal(panel.children[0].children.length,14);assert.match(panel.children[1].textContent,/Falha de detalhes/);assert.equal(panel.children[2].hidden,false);assert.equal(ui.relatedRequests.length,4);assert.equal(ui.nodes.get('detail-tab-arquivos').dataset.state,'loaded');
  failed=false;await panel.children[2].fire('click');assert.equal(ui.nodes.get('detail-tab-detalhes').textContent,'Detalhes (22)');assert.equal(ui.documentRequests.length,2);assert.equal(ui.relatedRequests.length,4);
});

test('DOCUMENTS-UI-02: fechar ou trocar o documento cancela detalhes pendentes e ignora respostas antigas',async()=>{
  let finish,signal;const ui=await interfaceFixture({documentHandler:(payload,options,core)=>{if(payload.document.type==='ata'){signal=options.signal;return new Promise(resolve=>{finish=()=>resolve(({fields:[{title:'Registro antigo',value:'Antigo'}],objeto:'Objeto antigo'}));});}return core.documentDetails(payload.document,options.signal);}});
  const opening=ui.openDocument(project(demoAtas[0]));await settle();assert(signal);ui.nodes.get('details-dialog').close();assert.equal(signal.aborted,true);
  await ui.openDocument(project(demoContracts[0]));finish();await opening;assert.equal(ui.nodes.get('details-kind').textContent,demoContracts[0].title);assert(!ui.all.some(n=>n.textContent==='Registro antigo'));assert.equal(ui.itemRequests.length,0);
});

test('DOCUMENTS-UI-03: ausência de identificadores originais preserva campos da busca sem fazer consultas',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project({...demoAtas[0],numero_sequencial_compra_ata:null}));
  assert.equal(ui.documentRequests.length,0);assert.equal(ui.relatedRequests.length,0);assert.equal(ui.itemRequests.length,0);
  assert.equal(ui.nodes.get('detail-tab-detalhes').dataset.state,'unavailable');assert.equal(ui.nodes.get('detail-panel-detalhes').children[0].children.length,14);
  for(const name of ['partesenvolvidas','contratos','arquivos','historico'])assert.equal(ui.nodes.get(`detail-tab-${name}`).dataset.state,'unavailable');
});

test('DOCUMENTS-UI-04: falha em arquivos de termo fica visível e uma nova tentativa consulta somente esse registro',async()=>{
  let failed=true;const ui=await interfaceFixture({itemFetcher:url=>url.includes('/termos/1/arquivos') && failed?Promise.resolve(new Response(null,{status:503})):demoFetch(url)});
  await ui.openDocument(project(demoContracts[0]));const card=ui.nodes.get('detail-panel-termos').children[3].children[0],button=card.children[2],extra=card.children[3];
  await button.fire('click');assert.equal(extra.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');assert.match(extra.children[0].textContent,/PNCP/);assert.equal(button.textContent,'Tentar novamente');
  failed=false;await button.fire('click');assert.equal(extra.hidden,false);assert.equal(extra.children.length,2);assert.equal(ui.childRequests.length,2);assert.equal(ui.relatedRequests.length,5);
});
test('DETAIL-LINK-UI-01: links diretos dos três tipos restauram documento e aba mesmo com busca vazia',async()=>{
  for(const [type,path,tab]of [['edital','edital/00000000000000/2026/1','itens'],['ata','ata/00000000000000/2026/3/3','partesenvolvidas'],['contrato','contrato/00000000000000/2026/1','historico']]) {
    const ui=await interfaceFixture({href:'https://example.test/contratos-web/?demo=1&utm_source=teste&detalhe='+path+'&aba='+tab+'#resultados',queryHandler:async(input,options,core)=>({...await core.execute(input,options.signal),data:[],total:0,last_page:1,last_row:0})});
    assert.equal(ui.state().document_type,type);assert.equal(ui.requests.length,1);assert.equal(ui.nodes.get('details-dialog').open,true);assert.equal(ui.nodes.get('detail-tab-'+tab).getAttribute('aria-selected'),'true');
    assert.equal(ui.documentRequests.length,1);assert.equal(ui.documentRequests[0].document.type,type);assert.equal(ui.relatedRequests.length,type==='contrato'?5:4);assert.equal(ui.itemRequests.length,type==='edital'?1:0);
    assert.equal(ui.nodes.get('detail-tab-detalhes').dataset.state,'loaded');assert(!ui.nodes.get('details-kind').textContent.includes('00000000000000'));
    const url=new URL(ui.browser.href());assert.equal(url.searchParams.get('detalhe'),path);assert.equal(url.searchParams.get('aba'),tab);assert.equal(url.searchParams.get('tipos_documento'),type);assert.equal(url.searchParams.get('utm_source'),'teste');assert.equal(url.hash,'#resultados');assert.equal(ui.browser.entries.length,1);
  }
});

test('DETAIL-LINK-UI-02: abrir, trocar abas e fechar sincroniza parâmetros sem repetir a busca no histórico',async()=>{
  const ui=await interfaceFixture({href:'https://example.test/contratos-web/?demo=1&ufs=DF#resultados'}),search=ui.browser.href();
  await ui.openDocument(project(demoDocuments[0]));const opened=ui.browser.href();assert.equal(new URL(opened).searchParams.get('aba'),'detalhes');
  await ui.nodes.get('detail-tab-arquivos').fire('click');const files=ui.browser.href();
  await ui.nodes.get('detail-tab-arquivos').fire('keydown',{key:'End'});assert.equal(new URL(ui.browser.href()).searchParams.get('aba'),'historico');
  const requests=ui.requests.length,items=ui.itemRequests.length,related=ui.relatedRequests.length,length=ui.browser.entries.length;
  await ui.browser.back();assert.equal(ui.browser.href(),files);assert.equal(ui.nodes.get('detail-tab-arquivos').getAttribute('aria-selected'),'true');
  await ui.browser.back();assert.equal(ui.browser.href(),opened);assert.equal(ui.nodes.get('detail-tab-detalhes').getAttribute('aria-selected'),'true');
  await ui.browser.back();assert.equal(ui.browser.href(),search);assert.equal(ui.nodes.get('details-dialog').open,false);assert.equal(ui.requests.length,requests);assert.equal(ui.itemRequests.length,items);assert.equal(ui.relatedRequests.length,related);
  await ui.browser.forward();assert.equal(ui.browser.href(),opened);assert.equal(ui.nodes.get('details-dialog').open,true);await ui.browser.forward();assert.equal(ui.browser.href(),files);assert.equal(ui.nodes.get('detail-tab-arquivos').getAttribute('aria-selected'),'true');assert.equal(ui.browser.entries.length,length);assert.equal(ui.requests.length,requests);
  ui.nodes.get('details-dialog').close();const closed=new URL(ui.browser.href());assert.equal(closed.searchParams.has('detalhe'),false);assert.equal(closed.searchParams.has('aba'),false);assert.equal(closed.searchParams.get('ufs'),'DF');assert.equal(closed.hash,'#resultados');
  await ui.browser.back();assert.equal(ui.nodes.get('details-dialog').open,true);assert.equal(ui.nodes.get('detail-tab-arquivos').getAttribute('aria-selected'),'true');
});

test('DETAIL-LINK-UI-03: nova busca fecha detalhes e não transporta o documento para os próximos critérios',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(demoDocuments[0]));await ui.nodes.get('detail-tab-itens').fire('click');
  ui.nodes.get('document-type').value='contrato';await ui.nodes.get('document-type').fire('change');
  assert.equal(ui.nodes.get('details-dialog').open,false);const url=new URL(ui.browser.href());assert.equal(url.searchParams.has('detalhe'),false);assert.equal(url.searchParams.has('aba'),false);assert.equal(ui.state().document_type,'contrato');
  await ui.browser.back();assert.equal(ui.state().document_type,'edital');assert.equal(ui.nodes.get('details-dialog').open,true);assert.equal(ui.nodes.get('detail-tab-itens').getAttribute('aria-selected'),'true');
});

test('DETAIL-LINK-UI-04: link inválido não consulta detalhes e pode ser corrigido ao limpar os critérios',async()=>{
  for(const parameters of ['aba=itens','detalhe=edital/123/2026/1','detalhe=contrato/00000000000000/2026/1&aba=itens','detalhe=ata/00000000000000/2026/1']) {
    const ui=await interfaceFixture({href:'https://example.test/?'+parameters});assert.equal(ui.requests.length,0);assert.equal(ui.documentRequests.length,0);assert.equal(ui.nodes.get('details-dialog').open,false);assert.match(ui.nodes.get('notice').textContent,/Parâmetros inválidos na URL/);
    await ui.nodes.get('clear-button').fire('click');assert.equal(ui.requests.length,1);assert.equal(new URL(ui.browser.href()).searchParams.has('detalhe'),false);assert.equal(new URL(ui.browser.href()).searchParams.has('aba'),false);
  }
});

test('DETAIL-LINK-UI-05: falha da busca não impede carregar o documento identificado no link',async()=>{
  const ui=await interfaceFixture({href:'https://example.test/?detalhe=contrato/00000000000000/2026/1&aba=arquivos',queryHandler:()=>Promise.reject(new Error('Pesquisa indisponível'))});
  assert.equal(ui.nodes.get('details-dialog').open,true);assert.equal(ui.nodes.get('detail-tab-detalhes').dataset.state,'loaded');assert.equal(ui.nodes.get('detail-tab-arquivos').textContent,'Arquivos (12)');assert.match(ui.nodes.get('notice').textContent,/Pesquisa indisponível/);
});

test('DETAIL-LINK-UI-06: navegar para outro documento cancela a carga antiga e ignora sua resposta',async()=>{
  let finish,signal;
  const ui=await interfaceFixture({deferTableReady:true,href:'https://example.test/?detalhe=contrato/00000000000000/2026/1&aba=arquivos',documentHandler:(payload,options,core)=>{
    if(payload.document.type==='contrato'){signal=options.signal;return new Promise(resolve=>{finish=()=>resolve({fields:[{title:'Antigo',value:'Antigo'}],objeto:'Objeto antigo',titulo:'Título antigo'});});}
    return core.documentDetails(payload.document,options.signal);
  }});
  const opening=ui.startTable();await settle();assert.equal(ui.nodes.get('details-dialog').open,true);
  await ui.browser.visit('https://example.test/?detalhe=ata/00000000000000/2026/3/3&aba=historico');assert.equal(signal.aborted,true);
  const title=ui.nodes.get('details-kind').textContent;finish();await opening;assert.equal(ui.nodes.get('details-kind').textContent,title);assert.equal(ui.nodes.get('detail-tab-historico').getAttribute('aria-selected'),'true');assert.equal(new URL(ui.browser.href()).searchParams.get('detalhe'),'ata/00000000000000/2026/3/3');
});

test('DETAIL-LINK-UI-07: fechar durante a carga remove a seleção e impede reabertura por resposta atrasada',async()=>{
  let finish,signal;const ui=await interfaceFixture({deferTableReady:true,href:'https://example.test/?detalhe=contrato/00000000000000/2026/1',documentHandler:(payload,options)=>{signal=options.signal;return new Promise(resolve=>{finish=()=>resolve({fields:[],objeto:'Antigo',titulo:'Antigo'});});}});
  const opening=ui.startTable();await settle();ui.nodes.get('details-dialog').close();assert.equal(signal.aborted,true);assert.equal(new URL(ui.browser.href()).searchParams.has('detalhe'),false);
  finish();await opening;assert.equal(ui.nodes.get('details-dialog').open,false);assert.equal(new URL(ui.browser.href()).searchParams.has('detalhe'),false);
});

test('TABLE-STATE-01: falha de outra página preserva linhas e página confirmadas na view',async()=>{
  let failed=false;
  const ui=await interfaceFixture({queryHandler:(input,options,core)=>failed?Promise.reject(new Error('Fonte indisponível')):core.execute(input,options.signal)});
  const confirmed=ui.renderedPage();failed=true;
  await assert.rejects(ui.request({page:2}),/Fonte indisponível/);
  assert.deepEqual(ui.renderedPage(),confirmed);assert.equal(ui.state().page,2);
  assert.equal(ui.nodes.get('table-loader').hidden,true);assert.equal(ui.nodes.get('results-table').inert,false);
});
