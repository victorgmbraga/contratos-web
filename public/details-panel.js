import { createPagination } from './pagination.js';
import { money, date, time, fmtInt, quantity, formatCnpj, formatCpfCnpj } from './format.js';
import { detailDocumentPath } from '../src/browser/detail-url.js';
import { controlLink, indexedDocumentFields, joinOrganizationFields } from '../src/document-details.js';

const DETAIL_PAGE_SIZE = 10;

// Painel de detalhes: seleção do documento, abas, itens e listagens vinculadas.
export function createDetailsPanel({ document, window, service, state, session, $: getElementById, el, documentName, openDialog, syncDetailUrl, refreshSelects }) {
const $ = getElementById;
function closeDetails(sync=true) {
  const previous=state.detailSelection;
  state.detailAbort?.abort();session.next('detail');state.detailSelection=null;state.detailDoc=null;state.detailActivate=null;
  if($('details-dialog').open)$('details-dialog').close();
  if(sync && previous)syncDetailUrl();
}
function sameDocument(left,right) {
  return !!left && !!right && detailDocumentPath(left)===detailDocumentPath(right);
}
function directDetailRow(document) {
  const {type,cnpj,ano,sequencial,sequencial_compra}=document;
  const control=cnpj+'-'+(type==='contrato'?'2':'1')+'-'+String(type==='ata'?sequencial_compra:sequencial).padStart(6,'0')+'/'+ano+(type==='ata'?'-'+sequencial.padStart(6,'0'):'');
  return {tipo_documento:type,titulo:control,numero_controle_pncp:control,orgao_cnpj:cnpj,url_pncp:controlLink(control),_document:document,_purchase:type==='edital'?{cnpj,ano,sequencial}:null,_detail_from_url:true,_direct_link:true};
}
function restoreDetailSelection(selection,searchReady=Promise.resolve()) {
  if(!selection){closeDetails(false);return Promise.resolve();}
  if($('details-dialog').open && sameDocument(state.detailSelection?.document,selection.document)) {
    state.detailActivate(selection.tab);return Promise.resolve();
  }
  const indexed=state.lastResult?.data.find(doc=>sameDocument(detailIdentity(doc),selection.document));
  const row=indexed?{...indexed,_direct_link:true}:directDetailRow(selection.document);
  return openDetails(row,{tab:selection.tab,sync:false,searchReady});
}
async function searchRowFor(identity,searchReady,doc,signal) {
  const control=doc.numero_controle_pncp;
  const matches=row=>sameDocument(detailIdentity(row),identity) || !!(control && row.numero_controle_pncp===control);
  const find=()=>state.lastResult?.data.find(matches) || null;
  const found=find();if(found)return found;
  await Promise.resolve(searchReady).catch(()=>{});
  const indexed=find();if(indexed)return indexed;
  if(!control)return null;
  try {
    const query={api_version:'2.0',document_type:doc.tipo_documento,q:control,status:'todos',pncp_filters:{},order:'-data',page:1,size:10};
    const result=await service.call('execute',{query},{signal});
    return result.data.find(matches) || null;
  } catch { return null; }
}

function safeAnchor(label,value) {
  try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol) || url.username || url.password)return null;const link=el('a',label);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';return link;}catch{return null;}
}
function detailScheduler() {
  let active=0;const waiting=[];
  function pump() {
    while(active<2 && waiting.length) {
      const job=waiting.shift();job.cleanup();
      if(job.signal.aborted){job.reject(job.signal.reason);continue;}
      active++;
      Promise.resolve().then(()=>{job.signal.throwIfAborted();return job.task();}).then(job.resolve,job.reject).finally(()=>{active--;pump();});
    }
  }
  return (task,signal)=>new Promise((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return;}
    const job={task,signal,resolve,reject,cleanup:()=>signal.removeEventListener('abort',abort)};
    const abort=()=>{const index=waiting.indexOf(job);if(index>=0){waiting.splice(index,1);job.cleanup();reject(signal.reason);}};
    signal.addEventListener('abort',abort,{once:true});waiting.push(job);pump();
  });
}
function detailIdentity(doc) {
  const d=doc._document || (doc.tipo_documento==='edital' && doc._purchase?{type:'edital',...doc._purchase}:null);
  if(!d)return null;
  return d;
}
function internalControlAnchor(label,document) {
  const button=el('button',label,'text-button');
  button.type='button';button.setAttribute('aria-label',`Abrir ${label} no Contratos Web`);
  button.addEventListener('click',()=>{openDetails(directDetailRow(document));});
  return button;
}
function appendFields(container,fields,className='related-values') {
  const values=el('dl',undefined,className);
  for(const field of fields){
    const wrap=el('div'),value=el('dd');
    const type=field.mask==='cpf-cnpj'?'cpf-cnpj':field.mask==='cnpj'?'cnpj':field.type;
    const text=field.value==null?'—':type==='decimal'?money(field.value):type==='date'?date(field.value):type==='datetime'?time(field.value):type==='boolean'?(field.value?'Sim':'Não'):type==='cnpj'?formatCnpj(field.value):type==='cpf-cnpj'?formatCpfCnpj(field.value):String(field.value);
    const link=field.document?internalControlAnchor(text,field.document):field.url?safeAnchor(text,field.url):null;
    if(link)value.append(link);else value.textContent=text;
    wrap.append(el('dt',field.title),value);values.append(wrap);
  }
  container.append(values);return values;
}
function relatedSection(resource,title,doc,token,signal,schedule,updateCount) {
  const section=el('section',undefined,'related-section');section.dataset.resource=resource;
  const heading=el('h3',title,'detail-panel-title'),toolbar=el('div',undefined,'items-toolbar'),retry=el('button','Tentar novamente','button small'),status=el('p','Preparando consulta…','items-status'),list=el('div',undefined,'related-list');
  retry.hidden=true;toolbar.append(retry);
  const pagination=createPagination({document,className:'item-pager',label:`Paginação de ${title}`,subject:title,hideSinglePage:true,onPageChange:load}),pager=pagination.element;
  retry.setAttribute('aria-label',`Consultar ${title} novamente`);
  status.setAttribute('role','status');section.append(heading,toolbar,list,status,pager);
  let loaded=false,page=1,untilEmpty=false,controller=null,seq=0;
  const showFields=(card,fields)=>{const values=el('dl',undefined,'related-values');for(const [name,value]of fields){const field=el('div');field.append(el('dt',name),el('dd',value ?? '—'));values.append(field);}card.append(values);};
  async function load(target) {
    controller?.abort();controller=new AbortController();const request=++seq;
    const current=()=>session.current('detail',token) && request===seq && !signal.aborted;
    retry.hidden=true;pagination.setBusy(true);section.setAttribute('aria-busy','true');status.textContent='Preparando consulta…';
    if(!loaded)updateCount(null,'loading');
    try {
      const requestSignal=AbortSignal.any([signal,controller.signal]);
      const result=await schedule(async()=>{status.textContent='Consultando o PNCP…';return service.call('documentRelated',{document:detailIdentity(doc),resource,page:target,size:DETAIL_PAGE_SIZE,...(untilEmpty?{pagination_mode:'until_empty'}:{})},{signal:requestSignal});},requestSignal);
      if(!current())return;loaded=true;page=result.page;untilEmpty ||= result.pagination_mode==='until_empty';list.replaceChildren();
      for(const record of result.data) {
        const card=el('article',undefined,'related-card');
        if(record.fields) {
          card.append(el('h4',`${{partesenvolvidas:'Parte envolvida',termos:'Termo',empenhos:'Empenho',instrumentocobranca:'Instrumento de cobrança'}[resource]}`));
          appendFields(card,record.fields);
          if(record.sequencial && ['termos','empenhos','instrumentocobranca'].includes(resource)){
            const button=el('button',resource==='termos'?'Arquivos do termo':'Ver detalhes','button small'),extra=el('div',undefined,'related-extra');extra.hidden=true;
            button.setAttribute('aria-expanded','false');card.append(button,extra);let fetched=false,busy=false,failed=false;
            button.addEventListener('click',async()=>{
              if(busy)return;extra.hidden=failed?false:!extra.hidden;failed=false;button.setAttribute('aria-expanded',String(!extra.hidden));
              if(extra.hidden || fetched)return;
              busy=true;button.disabled=true;extra.replaceChildren(el('p','Consultando o PNCP…','panel-note'));
              try {
                const data=await schedule(async()=>{return service.call('contractChild',{document:detailIdentity(doc),resource,sequence:record.sequencial},{signal:requestSignal});},requestSignal);
                if(!current())return;extra.replaceChildren();
                if(data.fields)appendFields(extra,data.fields);
                if(data.files){for(const file of data.files){const fileCard=el('article',undefined,'related-card');fileCard.append(el('h4',file.titulo ?? 'Arquivo sem título'));appendFields(fileCard,[{title:'Tipo',value:file.tipo},{title:'Publicação',type:'datetime',value:file.data_publicacao}]);const link=safeAnchor('Baixar arquivo',file.url);if(link)fileCard.append(link);extra.append(fileCard);}if(!data.files.length)extra.append(el('p','Este termo não possui arquivos.','panel-note'));}
                fetched=true;
              }catch(error){if(current() && error.name!=='AbortError'){extra.replaceChildren(el('p',error.message,'inline-error'));failed=true;button.textContent='Tentar novamente';}}
              finally{busy=false;button.disabled=false;}
            });
          }
        } else if(resource==='arquivos') {
          card.append(el('h4',record.titulo ?? 'Arquivo sem título'));
          showFields(card,[['Tipo',record.tipo],['Inclusão',time(record.data_publicacao)]]);
        } else if(resource==='historico') {
          card.append(el('h4',record.evento ?? 'Evento não informado'));
          showFields(card,[['Nome',record.nome],['Data/Hora do evento',time(record.data_evento)],['Justificativa',record.justificativa]]);
        } else {
          card.append(el('h4',`${resource==='atas'?'Ata':'Contrato/Empenho'} ${record.numero ?? '—'}${record.ano?'/'+record.ano:''}`));
          showFields(card,[['Controle PNCP',record.numero_controle_pncp],...(record.orgao_nome?[['Órgão',record.orgao_nome]]:[]),['Assinatura',date(record.data_assinatura)],['Vigência',`${date(record.vigencia_inicio)} a ${date(record.vigencia_fim)}`],...(resource==='atas'?[['Cancelamento',record.data_cancelamento?time(record.data_cancelamento):'—']]:[['Fornecedor',record.fornecedor_nome],['Valor global',money(record.valor_global)]])]);
        }
        if(!record.fields && resource!=='historico') {const link=safeAnchor(resource==='arquivos'?'Baixar arquivo':'Abrir no PNCP',record.url);if(link)card.append(link);else card.append(el('p','Link não disponível.','panel-note'));}
        list.append(card);
      }
      if(!result.data.length)list.append(el('p',`Nenhum registro em ${title}.`,'panel-note'));
      const unknownTotal=result.total===null;
      heading.textContent=`${title} (${unknownTotal?'?':fmtInt(result.total)})`;
      updateCount(result.total,'loaded');
      const first=result.data.length?(page-1)*result.size+1:0,last=result.data.length?first+result.data.length-1:0;
      const summary=unknownTotal?`${result.data.length?`${fmtInt(result.data.length)} ${result.data.length===1?'registro':'registros'} nesta página`:'Fim do histórico: nenhum registro nesta página'} · Quantidade desconhecida: contagem inconsistente do PNCP` : result.total===0?'0 registros':`Registros ${fmtInt(first)}–${fmtInt(last)} de ${fmtInt(result.total)}`;
      status.textContent=summary;
      pagination.render({page,lastPage:unknownTotal?null:result.total_pages,hasMore:result.has_more});
    }catch(error){if(current() && error.name!=='AbortError'){
      if(error.code==='PAGE_OUT_OF_RANGE' && Number.isSafeInteger(error.details?.last_page) && error.details.last_page>=1 && error.details.last_page<target)return load(error.details.last_page);
      status.textContent=error.message;retry.hidden=false;
      if(!loaded)updateCount(null,'error');
    }}finally{if(current()){pagination.setBusy(false);section.setAttribute('aria-busy','false');}}
  }
  if(detailIdentity(doc)) {
    retry.addEventListener('click',()=>load(page));
  } else {status.textContent='A fonte não forneceu CNPJ, ano e sequencial originais suficientes para consultar esta listagem.';updateCount(null,'unavailable');}
  return {section,load:()=>detailIdentity(doc)?load(1):Promise.resolve()};
}
async function openDetails(doc,{tab='detalhes',sync=true,searchReady=Promise.resolve()}={}) {
  state.detailAbort?.abort();const token=session.next('detail');
  const detailController=new AbortController();state.detailAbort=detailController;
  const identity=detailIdentity(doc);state.detailDoc=doc;state.detailSelection=identity?{document:identity,tab}:null;
  const schedule=detailScheduler(),loads=[],tabs=[];
  const content=$('details-content');content.replaceChildren();
  const objectSummary=el('p',doc.objeto_compra ?? (doc._detail_from_url?'Carregando detalhes do documento…':'Objeto não informado.'),'detail-object');content.append(objectSummary);
  const more=el('button','Ver descrição completa','text-button detail-object-more');more.type='button';more.hidden=true;more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-controls','description-dialog');content.append(more);
  const updateSummary=()=>{more.hidden=!(window.matchMedia?.('(min-width:701px)').matches && objectSummary.scrollHeight>objectSummary.clientHeight+1);};
  const summaryObserver=window.ResizeObserver?new window.ResizeObserver(updateSummary):null;summaryObserver?.observe(objectSummary);
  detailController.signal.addEventListener('abort',()=>{summaryObserver?.disconnect();if($('description-dialog').open)$('description-dialog').close();},{once:true});
  more.addEventListener('click',()=>{$('description-content').textContent=objectSummary.textContent;openDialog('description-dialog');});
  const kind=doc.tipo_documento,names=documentName(kind);
  $('details-kind').textContent=doc.titulo ?? '—';
  $('details-dialog').setAttribute('aria-label',`Detalhes: ${names.singular}`);
  const nav=el('div',undefined,'detail-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label',`Seções: ${names.singular}`);content.append(nav);
  const sectionLabel=el('label',undefined,'detail-section-choice'),sectionSelect=el('select'),sectionSpinner=el('span',undefined,'detail-tab-spinner');
  sectionSelect.id='details-section';sectionSelect.setAttribute('aria-label','Seção dos detalhes');sectionSpinner.hidden=true;sectionSpinner.setAttribute('aria-hidden','true');
  sectionLabel.append(sectionSelect,sectionSpinner);content.append(sectionLabel);
  function activate(index,focus=false,write=true) {
    tabs.forEach((tab,i)=>{tab.button.setAttribute('aria-selected',String(i===index));tab.button.tabIndex=i===index?0:-1;tab.panel.hidden=i!==index;});
    if(state.detailSelection){state.detailSelection.tab=tabs[index].button.dataset.resource;if(write)syncDetailUrl();}
    sectionSelect.value=tabs[index].button.dataset.resource;sectionSelect.setAttribute('aria-controls',tabs[index].panel.id);
    sectionSelect.setAttribute('aria-busy',tabs[index].button.getAttribute('aria-busy'));
    sectionSpinner.hidden=tabs[index].button.getAttribute('aria-busy')!=='true';
    refreshSelects(sectionSelect);
    if(focus){tabs[index].button.focus();tabs[index].button.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  sectionSelect.addEventListener('change',()=>{const index=tabs.findIndex(tab=>tab.button.dataset.resource===sectionSelect.value);if(index>=0)activate(index);});
  function addTab(resource,title,panel) {
    const button=el('button',title,'detail-tab'),index=tabs.length;button.type='button';button.id=`detail-tab-${resource}`;button.dataset.resource=resource;
    panel.id=`detail-panel-${resource}`;panel.hidden=true;panel.tabIndex=0;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-selected','false');button.tabIndex=-1;
    button.addEventListener('click',()=>activate(index));
    button.addEventListener('keydown',event=>{
      let target;
      if(event.key==='ArrowRight')target=(index+1)%tabs.length;else if(event.key==='ArrowLeft')target=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=tabs.length-1;else return;
      event.preventDefault();activate(target,true);
    });
    const option=el('option',title);option.value=resource;sectionSelect.append(option);
    nav.append(button);content.append(panel);tabs.push({button,panel});
    const update=(count,phase)=>{
      const loading=count===null && phase==='loading';
      button.textContent=loading?title:`${title} (${count===null?phase==='loaded'?'?':'—':fmtInt(count)})`;
      if(loading){const spinner=el('span',undefined,'detail-tab-spinner');spinner.setAttribute('aria-hidden','true');button.append(spinner);}
      button.setAttribute('aria-label',loading?`${title}: carregando`:button.textContent);
      button.setAttribute('aria-busy',String(loading));button.dataset.state=phase;
      option.textContent=loading?`${title} — carregando`:button.textContent;
      if(sectionSelect.value===resource){sectionSpinner.hidden=!loading;sectionSelect.setAttribute('aria-busy',String(loading));}
    };
    update(null,'loading');return update;
  }
  const common=['numero_controle_pncp','orgao_nome','orgao_cnpj','unidade_orgao_nome_unidade','unidade_orgao_codigo_unidade','uf','municipio_nome'];
  const fieldNames=[...common,...(kind==='edital'?['modalidade_nome','situacao_compra_nome_pncp','data_publicacao_pncp','data_atualizacao_pncp','valor_total_estimado','valor_total_homologado']:kind==='ata'?['modalidade_nome','data_publicacao_pncp','data_atualizacao_pncp','data_assinatura','data_inicio_vigencia','data_fim_vigencia','cancelado','permite_adesao']:['tipo_contrato_nome','fornecedor_nome','fornecedor_ni','valor_global','data_assinatura','data_inicio_vigencia','data_fim_vigencia','data_publicacao_pncp','data_atualizacao_pncp'])];
  const fields=kind==='edital' && doc._raw?indexedDocumentFields(doc._raw):joinOrganizationFields(fieldNames.map(name=>{const column=state.schema.columns_by_document[kind].find(c=>c.field===name),value=doc[name];return {field:name,title:column.title,type:column.mask==='cpf-cnpj'?'cpf-cnpj':column.mask==='cnpj'?'cnpj':column.type,value,...(name==='numero_controle_pncp' && value?{url:controlLink(value)}:{})};}),'schema');
  const detailPanel=el('section',undefined,'detail-information');
  let grid=appendFields(detailPanel,fields,'detail-grid');
  const updateDetails=addTab('detalhes','Detalhes',detailPanel);updateDetails(fields.length,'loaded');
  const forceDetails=!!(doc._detail_from_url || doc._direct_link);
  if(kind!=='edital' || forceDetails){
    const detailStatus=el('p','Preparando consulta dos detalhes…','items-status'),retryDetails=el('button','Tentar novamente','button small');retryDetails.hidden=true;detailStatus.setAttribute('role','status');detailPanel.append(detailStatus,retryDetails);
    async function loadDetails(){
      retryDetails.hidden=true;detailStatus.hidden=false;detailPanel.setAttribute('aria-busy','true');
      try {
        const data=await schedule(async()=>{detailStatus.textContent='Consultando detalhes no PNCP…';return service.call('documentDetails',{document:detailIdentity(doc)},{signal:detailController.signal});},detailController.signal);
        if(!session.current('detail',token))return;
        const holder=el('div');grid=appendFields(holder,data.fields,'detail-grid');detailPanel.replaceChildren(grid,detailStatus,retryDetails);
        updateDetails(data.fields.length,'loaded');if(data.objeto)objectSummary.textContent=data.objeto;else if(doc._detail_from_url)objectSummary.textContent='Objeto não informado.';updateSummary();
        if(forceDetails){const indexed=state.lastResult?.data.find(row=>sameDocument(detailIdentity(row),identity));$('details-kind').textContent=data.titulo || indexed?.titulo || doc.titulo;}
        detailStatus.textContent='';detailStatus.hidden=true;
      }catch(error){if(session.current('detail',token) && error.name!=='AbortError'){
        if(forceDetails){
          const row=await searchRowFor(identity,searchReady,doc,detailController.signal);
          if(!session.current('detail',token))return;
          if(row){
            const fallbackFields=row._raw?indexedDocumentFields(row._raw):[];
            if(fallbackFields.length){const holder=el('div');grid=appendFields(holder,fallbackFields,'detail-grid');detailPanel.replaceChildren(grid,detailStatus,retryDetails);}
            if(row.titulo)$('details-kind').textContent=row.titulo;
            if(row.objeto_compra){objectSummary.textContent=row.objeto_compra;updateSummary();}
            updateDetails(fallbackFields.length || fields.length,'loaded');
            detailStatus.textContent='O PNCP não retornou os detalhes completos. Exibindo os dados da busca.';
            detailStatus.hidden=false;retryDetails.hidden=false;
            return;
          }
        }
        detailStatus.textContent=`${error.message}${doc._detail_from_url?' Tente carregar os detalhes novamente.':' Os dados disponíveis na busca permanecem visíveis.'}`;if(doc._detail_from_url)objectSummary.textContent='Objeto indisponível.';retryDetails.hidden=false;updateDetails(null,'error');
      }}
      finally{if(session.current('detail',token))detailPanel.setAttribute('aria-busy','false');}
    }
    if(detailIdentity(doc)){retryDetails.addEventListener('click',loadDetails);loads.push({resource:'detalhes',load:loadDetails});updateDetails(null,'loading');}
    else {detailStatus.textContent='A fonte não forneceu os identificadores originais para consultar os detalhes completos.';updateDetails(null,'unavailable');}
  }
  if(kind==='edital'){
  const section=el('section',undefined,'items-section'),toolbar=el('div',undefined,'items-toolbar'),retry=el('button','Tentar consultar itens','button small'),itemsTitle=el('h3','Itens da contratação');retry.hidden=true;toolbar.append(itemsTitle,retry);section.append(toolbar);
  const itemStatus=el('p','Preparando consulta de itens…','items-status'),list=el('div',undefined,'items-list'),pagination=createPagination({document,className:'item-pager',label:'Paginação de Itens',subject:'Itens',hideSinglePage:true,onPageChange:itemPage}),pager=pagination.element;section.append(list,itemStatus,pager);
  itemStatus.setAttribute('role','status');
  const updateItems=addTab('itens','Itens',section);
  let page=1,controller=null,itemsLoaded=false,itemSeq=0;
  async function itemPage(target) {
    controller?.abort();controller=new AbortController();const request=++itemSeq;
    const current=()=>session.current('detail',token) && request===itemSeq && !detailController.signal.aborted;
    retry.hidden=true;pagination.setBusy(true);itemStatus.textContent='Consultando itens no PNCP…';
    section.setAttribute('aria-busy','true');if(!itemsLoaded)updateItems(null,'loading');
    try {
      const p=doc._purchase,signal=AbortSignal.any([detailController.signal,controller.signal]);
      const result=await schedule(async()=>{return service.call('details',{document:{type:'edital',...p},page:target,size:DETAIL_PAGE_SIZE},{signal});},signal);
      if(!current())return;page=result.page;list.replaceChildren();
      itemsLoaded=true;updateItems(result.total_items,'loaded');
      for(const item of result.data) {
        const card=el('article',undefined,'item-card');card.append(el('h4',`Item ${item.numeroItem ?? '—'}`),el('p',item.descricao ?? 'Descrição não informada.'),el('div',`${item.materialOuServico==='S'?'Serviço':item.materialOuServico==='M'?'Material':'Tipo não informado'} · ${item.situacaoCompraItemNome ?? 'Situação não informada'} · Catálogo: ${item.catalogo?.nome ?? '—'} / ${item.catalogoCodigoItem ?? '—'}`,'item-meta'));
        const values=el('dl',undefined,'item-values');
        for(const [label,value] of [['Quantidade',quantity(item.quantidade)],['Valor unitário estimado',money(item.valorUnitarioEstimado)],['Valor total estimado',money(item.valorTotal)]]) {
          const field=el('div');field.append(el('dt',label),el('dd',value));values.append(field);
        }
        card.append(values);list.append(card);
      }
      if(!result.data.length)list.append(el('p','Esta contratação não possui itens.','panel-note'));
      const first=result.data.length?(page-1)*result.size+1:0,last=result.data.length?first+result.data.length-1:0;
      itemsTitle.textContent=`Itens da contratação (${fmtInt(result.total_items)})`;
      itemStatus.textContent=result.total_items===0?'0 itens':`Itens ${fmtInt(first)}–${fmtInt(last)} de ${fmtInt(result.total_items)}`;pagination.render({page,lastPage:result.total_pages,hasMore:result.has_more});
    }catch(error){if(current() && error.name!=='AbortError'){
      if(error.code==='PAGE_OUT_OF_RANGE' && Number.isSafeInteger(error.details?.last_page) && error.details.last_page>=1 && error.details.last_page<target)return itemPage(error.details.last_page);
      itemStatus.textContent=error.message;retry.hidden=false;
      if(!itemsLoaded)updateItems(null,'error');
    }}finally{if(current()){pagination.setBusy(false);section.setAttribute('aria-busy','false');}}
  }
  if(!doc._purchase){itemStatus.textContent='A fonte não forneceu CNPJ, ano e sequencial originais suficientes para consultar itens.';updateItems(null,'unavailable');}
  else {retry.addEventListener('click',()=>itemPage(page));loads.push({resource:'itens',load:()=>itemPage(1)});}
  }
  const sections={edital:[['arquivos','Arquivos'],['atas','Atas de Registro de Preço'],['contratos','Contratos/Empenhos'],['historico','Histórico']],ata:[['partesenvolvidas','Partes envolvidas'],['contratos','Contratos'],['arquivos','Arquivos'],['historico','Histórico']],contrato:[['empenhos','Empenhos'],['instrumentocobranca','Instrumentos de cobrança'],['termos','Termos'],['arquivos','Arquivos'],['historico','Histórico']]};
  for(const [resource,title]of sections[kind]){
    /** @type {(count: any, phase: any) => void} */
    let updateCount=()=>{};
    const related=relatedSection(resource,title,doc,token,detailController.signal,schedule,(count,phase)=>updateCount(count,phase));
    updateCount=addTab(resource,title,related.section);if(!detailIdentity(doc))updateCount(null,'unavailable');
    loads.push({resource,load:related.load});
  }
  state.detailActivate=resource=>activate(Math.max(0,tabs.findIndex(tab=>tab.button.dataset.resource===resource)),false,false);
  state.detailActivate(tab);openDialog('details-dialog');if(sync)syncDetailUrl();
  // Start the visible tab first; the remaining first pages continue in background.
  const priority=[tab,'detalhes','itens',...sections[kind].map(([resource])=>resource)],seen=new Set(),ordered=[];
  for(const resource of priority){const entry=loads.find(item=>item.resource===resource);if(entry && !seen.has(entry)){seen.add(entry);ordered.push(entry);}}
  for(const entry of loads)if(!seen.has(entry))ordered.push(entry);
  await Promise.all(ordered.map(entry=>entry.load()));
}
return { open: openDetails, close: closeDetails, restore: restoreDetailSelection };
}
