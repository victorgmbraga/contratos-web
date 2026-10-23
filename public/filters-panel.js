import { compareDecimal } from '../src/validation.js';

// Modal de filtros: rascunho, editores de domínio, sugestões e amparos por normativo.
export function createFiltersPanel({ document, window, service, state, $: getElementById, el, documentName, openDialog, refreshSelects, getCache }) {
const $ = getElementById;
const filterFields=new Map();
let openFilterEditor=null;

function renderFilterStatuses() {
  const statuses=state.schema.statuses_by_document[state.query.document_type],statusNames={todos:'Todos',recebendo_proposta:'Recebendo propostas',propostas_encerradas:'Propostas encerradas',vigente:'Vigentes',nao_vigente:'Não vigentes'};
  $('draft-status').replaceChildren();for(const value of statuses){const option=el('option',statusNames[value] || value);option.value=value;$('draft-status').append(option);}
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
  refreshSelects(editor.input);updateDraftActions();
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
  state.draft=structuredClone(state.query);state.draft.q=$('search').value;
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
  return getCache().get({type:state.draft?.document_type || state.query.document_type,...(field==='amparos_legais'?{normatives:state.draft?.pncp_filters.normativos_base}:{}),field},{signal});
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
function apply() {
  if(state.legalPending || state.legalError)return null;
  state.draft.q=$('draft-search').value;state.draft.status=$('draft-status').value;
  return structuredClone(state.draft);
}
function onDialogClose() {
  stopFilterEditors();state.legalAbort?.abort();state.legalSeq++;
}
document.addEventListener('select-menu-open',closeFilterDropdown);
document.addEventListener('pointerdown',event=>{if(openFilterEditor && event.target!==openFilterEditor.input && !openFilterEditor.suggestions.contains(event.target))closeFilterDropdown();});
$('filters-dialog').querySelector('.filters-body')?.addEventListener('scroll',positionFilterDropdown);
window.addEventListener('resize',closeFilterDropdown);
return {open: openFilters, stop: stopFilterEditors, closeDropdown: closeFilterDropdown, positionDropdown: positionFilterDropdown, renderStatuses: renderFilterStatuses, setDraftFilter, clearDraft: clearDraftFilters, apply, onDialogClose};
}
