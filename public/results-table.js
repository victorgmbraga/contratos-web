import {createPagination} from './pagination.js';
export {paginationPages} from './pagination.js';

let tableSerial = 0;

export function createResultsTable({container, columns = [], renderCell, renderCard, footerContent, placeholder,
  paginationIcons = {}, menuIcon = '', onPageChange, onOpenDocument, onColumnAction, onColumnChange, onSort}) {
  const document = container.ownerDocument, window = document.defaultView;
  const lifetime = new window.AbortController(), {signal} = lifetime;
  let fields = [], rows = [], page = 1, lastPage = 1, busy = false, destroyed = false, menu = null, gesture = null;
  let rowViews = [];
  let cardsDirty = true;
  let sortOrder = null;
  const mobile = renderCard ? window.matchMedia('(max-width:700px)') : null;
  const originalFooterParent = footerContent?.parentNode;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const scroll = node('div','results-scroll'), table = node('table','results-grid'), cards = node('div','results-cards');
  cards.setAttribute('role','list'); cards.setAttribute('aria-label','Resultados da pesquisa em cartões');
  if (renderCard) {container.classList.add('results-has-cards');container.dataset.mobileView = 'cards';}
  table.setAttribute('aria-label','Resultados da pesquisa');
  const colgroup = node('colgroup'), head = node('thead','results-header'), body = node('tbody');
  table.append(colgroup, head, body);
  const empty = node('div','results-placeholder'), emptyText = placeholder || node('div',null,'Nenhum registro encontrado.');
  empty.append(emptyText); scroll.append(table, cards, empty);
  const footer = node('div','results-footer'), footerInner = node('div','results-footer-contents');
  const filterTooltip = node('div','tooltip results-filter-tooltip','Filtrar por esta coluna');
  filterTooltip.id = `results-filter-tooltip-${++tableSerial}`;
  filterTooltip.setAttribute('role','tooltip'); filterTooltip.hidden = true; document.body.append(filterTooltip);
  const counter = node('div','results-page-counter'), paginator = node('nav','results-paginator');
  const pagination = createPagination({document,element:paginator,label:'Paginação dos resultados',icons:paginationIcons,legacyClasses:true,onPageChange:target=>{if(!destroyed)return onPageChange?.(target);}});
  if (footerContent) counter.append(footerContent);
  footerInner.append(counter, paginator); footer.append(footerInner);
  container.classList.add('results-table'); container.replaceChildren(scroll, footer);

  function hideFilterTooltip() { filterTooltip.hidden = true; }
  function showFilterTooltip(button) {
    if (busy || destroyed || menu) return;
    document.querySelectorAll('[role="tooltip"]').forEach(tooltip=>{tooltip.hidden = true;});
    filterTooltip.hidden = false;
    const anchor = button.getBoundingClientRect(), box = filterTooltip.getBoundingClientRect(), gap = 8;
    const above = anchor.top - box.height - gap;
    filterTooltip.style.left = `${Math.max(gap,Math.min(anchor.left + (anchor.width - box.width) / 2,window.innerWidth - box.width - gap))}px`;
    filterTooltip.style.top = `${Math.max(gap,above >= gap ? above : Math.min(anchor.bottom + gap,window.innerHeight - box.height - gap))}px`;
  }
  function closeMenu(restoreFocus = false) {
    if (!menu) return;
    const previous = menu; menu = null;
    previous.root.remove(); previous.button.setAttribute('aria-expanded','false');
    if (restoreFocus && previous.button.isConnected) previous.button.focus({preventScroll:true});
  }
  function closeMovedMenu() {
    if (!menu) return;
    const anchor = menu.button.getBoundingClientRect();
    if (!menu.button.isConnected || menu.width !== window.innerWidth || menu.height !== window.innerHeight ||
      ['left','right','top','bottom'].some(key=>anchor[key] !== menu.anchor[key])) closeMenu();
  }
  function openMenu(column, button) {
    if (busy || destroyed) return;
    if (menu?.button === button) { closeMenu(true); return; }
    closeMenu();
    const root = node('div','results-menu'); root.setAttribute('role','menu'); root.setAttribute('aria-label',`Ações de ${column.title}`);
    const actions = [{label:'Filtrar por esta coluna',action:'filter'}];
    if (column.native_order) actions.push({label:'Ordenar crescente',action:'asc'},{label:'Ordenar decrescente',action:'desc'});
    for (const entry of actions) {
      const action = node('button','results-menu-item',entry.label); action.type = 'button'; action.setAttribute('role','menuitem');
      action.addEventListener('click',()=>{ closeMenu(true); onColumnAction?.(column.field,entry.action); }); root.append(action);
    }
    document.body.append(root); button.setAttribute('aria-expanded','true');
    const anchor = button.getBoundingClientRect(), bounds = root.getBoundingClientRect();
    menu = {root, button, anchor, width:window.innerWidth, height:window.innerHeight};
    root.style.left = `${Math.max(8,Math.min(anchor.left,window.innerWidth - bounds.width - 8))}px`;
    root.style.top = `${Math.max(8,anchor.bottom + bounds.height + 8 <= window.innerHeight ? anchor.bottom + 4 : anchor.top - bounds.height - 4)}px`;
    root.querySelector('button')?.focus();
    root.addEventListener('keydown',event=>{
      const buttons = [...root.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
      else if (event.key === 'Tab') closeMenu();
      else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    });
  }
  function finishGesture(cancel = false) {
    if (!gesture) return;
    const previous = gesture; gesture = null;
    container.classList.remove('results-dragging');
    head.querySelectorAll('[data-drop-target]').forEach(element=>element.removeAttribute('data-drop-target'));
    try { previous.element.releasePointerCapture(previous.id); } catch { /* Pointer already released. */ }
    if (cancel && previous.resize) resizeColumn(previous.field,previous.width,false);
    if (!cancel && previous.resize) onColumnChange?.(fields.map(field=>({...field})));
    if (!cancel && !previous.resize && previous.moved && previous.target) {
      moveColumn(previous.field,fields.findIndex(column=>column.field === previous.target));
    }
    if (!cancel && !previous.resize && !previous.moved && previous.column?.native_order) {
      const direction = sortOrder === previous.column.native_order.desc ? 'asc' : 'desc';
      onSort?.(previous.column.field,direction);
    }
  }
  function resizeColumn(field, width, notify = true) {
    const column = fields.find(column=>column.field === field);
    if (!column) return;
    column.width = Math.max(column.minWidth,Math.round(width));
    const index = fields.filter(column=>column.visible).indexOf(column);
    if (index < 0) return;
    colgroup.children[index].style.width = `${column.width}px`;
    head.querySelectorAll('.results-col-resize')[index].setAttribute('aria-valuenow',String(column.width));
    table.style.width = `${fields.filter(column=>column.visible).reduce((sum,column)=>sum+column.width,0)}px`;
    if (notify) onColumnChange?.(fields.map(field=>({...field})));
  }
  function moveColumn(field, targetIndex) {
    const index = fields.findIndex(column=>column.field === field);
    if (index < 0 || targetIndex < 0 || targetIndex >= fields.length || index === targetIndex) return;
    const [column] = fields.splice(index,1); fields.splice(targetIndex,0,column);
    rebuild();onColumnChange?.(fields.map(field=>({...field})));
    [...head.querySelectorAll('.results-col-label')].find(element=>element.dataset.field === field)?.focus({preventScroll:true});
  }
  function startGesture(event, column, resize) {
    if (busy || destroyed || event.button !== 0) return;
    finishGesture(true); closeMenu();
    gesture = {id:event.pointerId, column, field:column.field, element:event.currentTarget, x:event.clientX, width:column.width, resize, moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
    if (resize) event.preventDefault();
  }
  document.addEventListener('pointermove',event=>{
    if (!gesture || event.pointerId !== gesture.id) return;
    const delta = event.clientX - gesture.x;
    if (!gesture.moved && Math.abs(delta) < 5) return;
    gesture.moved = true; container.classList.add('results-dragging');
    if (gesture.resize) resizeColumn(gesture.field,gesture.width + delta,false);
    else {
      const target = document.elementFromPoint(event.clientX,event.clientY)?.closest('.results-col');
      head.querySelectorAll('[data-drop-target]').forEach(element=>element.removeAttribute('data-drop-target'));
      gesture.target = target && head.contains(target) ? target.dataset.field : null;
      if (gesture.target) target.dataset.dropTarget = 'true';
    }
  },{signal});
  document.addEventListener('pointerup',event=>{if(event.pointerId === gesture?.id)finishGesture();},{signal});
  document.addEventListener('pointercancel',event=>{if(event.pointerId === gesture?.id)finishGesture(true);},{signal});
  document.addEventListener('keydown',event=>{if(event.key === 'Escape' && gesture){event.preventDefault();finishGesture(true);}},{signal});
  window.addEventListener('blur',()=>finishGesture(true),{signal});
  window.addEventListener('resize',()=>{finishGesture(true);closeMovedMenu();hideFilterTooltip();},{signal});
  document.addEventListener('pointerdown',event=>{
    hideFilterTooltip();
    if (menu && !menu.root.contains(event.target) && !menu.button.contains(event.target)) closeMenu();
  },{signal});
  document.addEventListener('scroll',event=>{hideFilterTooltip();if(menu && !menu.root.contains(event.target))closeMovedMenu();},{signal,capture:true});
  document.addEventListener('keydown',event=>{if(event.key === 'Escape')hideFilterTooltip();},{signal});
  for (const eventName of ['focusin','pointerover']) document.addEventListener(eventName,event=>{
    if (event.target.closest?.('[aria-describedby]')?.getAttribute('aria-describedby') !== filterTooltip.id) hideFilterTooltip();
  },{signal});
  const resizeObserver = new window.ResizeObserver(closeMovedMenu); resizeObserver.observe(container);

  function renderRows() {
    const visible = fields.filter(column=>column.visible), nextViews = [];
    for (const [index,row] of (visible.length ? rows : []).entries()) {
      const previous = rowViews[index];
      if (previous && visible.every(column=>Object.is(previous.row[column.field],row[column.field]))) {
        previous.row = row; nextViews.push(previous); continue;
      }
      const tr = node('tr',`results-row${index % 2 ? ' results-row-even' : ''}`);
      const view = {element:tr,row};
      for (const column of visible) {
        const td = node('td','results-cell'); td.dataset.field = column.field;
        const content = renderCell ? renderCell(row[column.field],column) : node('span',null,row[column.field] ?? '—');
        if (column.field === 'titulo') {
          const button = node('button','results-open'); button.type = 'button';
          button.setAttribute('aria-label',`Ver detalhes: ${row[column.field] || 'documento'}`); button.append(content);
          button.addEventListener('click',()=>onOpenDocument?.(view.row)); td.append(button);
        } else td.append(content);
        tr.append(td);
      }
      tr.addEventListener('click',event=>{
        if (busy || event.target.closest('button,a,input,select') || window.getSelection()?.toString()) return;
        onOpenDocument?.(view.row);
      });
      nextViews.push(view);
    }
    if (nextViews.length !== rowViews.length || nextViews.some((view,index)=>view !== rowViews[index])) {
      const fragment = document.createDocumentFragment();
      for (const view of nextViews) fragment.append(view.element);
      body.replaceChildren(fragment);
    }
    rowViews = nextViews; empty.hidden = rows.length > 0 && visible.length > 0;
    if (!visible.length && rows.length) { empty.replaceChildren(node('div',null,'Selecione ao menos uma coluna.')); }
    else empty.replaceChildren(emptyText);
    if (renderCard) { cardsDirty = true; renderCards(); container.dataset.hasRows = String(rows.length > 0); }
  }
  function renderCards() {
    if (!renderCard || destroyed) return;
    if (!mobile.matches || container.dataset.mobileView !== 'cards') {
      if (cards.childElementCount) cards.replaceChildren();
      cardsDirty = true; return;
    }
    if (cardsDirty) {
      cards.replaceChildren(...rows.map(row=>{
        const card = node('article','result-card');card.setAttribute('role','listitem');
        card.append(renderCard(row));
        card.addEventListener('click',event=>{
          if (busy || event.target.closest('button,a,input,select') || window.getSelection()?.toString()) return;
          onOpenDocument?.(row);
        });
        const open = card.querySelector('.result-card-open');
        open?.addEventListener('click',()=>{if(!busy)onOpenDocument?.(row);});
        return card;
      }));
      cardsDirty = false;
    }
  }
  mobile?.addEventListener('change',renderCards,{signal});
  function renderPagination() {
    pagination.render({page,lastPage,busy});
  }
  function rebuild() {
    if (destroyed) return;
    finishGesture(true); closeMenu(); hideFilterTooltip();
    rowViews = []; body.replaceChildren();
    const visible = fields.filter(column=>column.visible), headerRow = node('tr');
    colgroup.replaceChildren();
    for (const column of visible) {
      const col = node('col'); col.style.width = `${column.width}px`; colgroup.append(col);
      const th = node('th','results-col'); th.scope = 'col'; th.dataset.field = column.field;
      const content = node('div','results-col-content'), title = node('div','results-col-title');
      const label = node('span','results-col-label',column.title); label.tabIndex = 0; label.dataset.field = column.field;
      label.setAttribute('role','button'); label.setAttribute('aria-label',`Mover coluna ${column.title}`);
      label.title = `${column.title} · Alt + ←/→ para mover`;
      label.addEventListener('pointerdown',event=>startGesture(event,column,false));
      label.addEventListener('keydown',event=>{
        if (event.altKey && ['ArrowLeft','ArrowRight'].includes(event.key)) {
          event.preventDefault(); const index = visible.indexOf(column) + (event.key === 'ArrowLeft' ? -1 : 1);
          if (visible[index]) moveColumn(column.field,fields.indexOf(visible[index]));
        }
      });
      title.append(label);
      if (column.filterable) {
        const button = node('button','results-header-menu'); button.type = 'button'; button.innerHTML = menuIcon;
        button.setAttribute('aria-label',`Filtrar ${column.title}`);
        if (column.native_order) {
          button.setAttribute('aria-haspopup','menu'); button.setAttribute('aria-expanded','false');
          button.addEventListener('click',()=>{hideFilterTooltip();openMenu(column,button);});
        } else {
          button.setAttribute('aria-describedby',filterTooltip.id);
          button.addEventListener('mouseenter',()=>showFilterTooltip(button));
          button.addEventListener('focus',()=>showFilterTooltip(button));
          button.addEventListener('mouseleave',hideFilterTooltip); button.addEventListener('blur',hideFilterTooltip);
          button.addEventListener('click',()=>{hideFilterTooltip();if(!busy && !destroyed)onColumnAction?.(column.field,'filter');});
        }
        title.append(button);
      }
      content.append(title); th.append(content);
      const handle = node('span','results-col-resize'); handle.tabIndex = 0;
      handle.setAttribute('role','separator'); handle.setAttribute('aria-label',`Largura da coluna ${column.title}`);
      handle.setAttribute('aria-orientation','vertical'); handle.setAttribute('aria-valuemin',String(column.minWidth)); handle.setAttribute('aria-valuenow',String(column.width));
      handle.addEventListener('pointerdown',event=>startGesture(event,column,true));
      handle.addEventListener('keydown',event=>{
        if (['ArrowLeft','ArrowRight','Home'].includes(event.key)) {
          event.preventDefault(); resizeColumn(column.field,event.key === 'Home' ? column.minWidth : column.width + (event.key === 'ArrowLeft' ? -10 : 10));
        }
      });
      th.append(handle); headerRow.append(th);
    }
    head.replaceChildren(headerRow); table.style.width = `${visible.reduce((sum,column)=>sum+column.width,0)}px`;
    table.hidden = visible.length === 0; updateSortState(); renderRows();
  }
  function updateSortState() {
    for (const th of head.querySelectorAll('th')) {
      const column = fields.find(field=>field.field === th.dataset.field);
      if (!column?.native_order) { th.removeAttribute('aria-sort'); continue; }
      th.setAttribute('aria-sort',sortOrder === column.native_order.asc ? 'ascending' : sortOrder === column.native_order.desc ? 'descending' : 'none');
    }
  }
  const api = {
    setColumns(columns) {
      fields = columns.map(column=>({...column,visible:column.visible !== false,minWidth:Math.max(85,column.minWidth || 85),width:Math.max(85,column.minWidth || 85,column.width || 180)}));
      rebuild();
    },
    setColumnVisibility(field, visible) {
      const column = fields.find(column=>column.field === field); if (column) { column.visible = !!visible; rebuild();onColumnChange?.(fields.map(field=>({...field}))); }
    },
    renderPage({rows:nextRows, page:nextPage, lastPage:nextLastPage}) {
      if (destroyed) return;
      rows = nextRows; page = nextPage; lastPage = nextLastPage;
      renderRows(); renderPagination(); scroll.scrollTop = 0;
    },
    setStatus(status) {
      if (destroyed) return;
      busy = status === 'loading'; container.setAttribute('aria-busy',String(busy)); container.inert = busy;
      if (busy) { finishGesture(true); closeMenu(); hideFilterTooltip(); } renderPagination();
    },
    clear() { rows = []; page = 1; lastPage = 1; renderRows(); renderPagination(); },
    setSortOrder(order) { sortOrder = order || null; updateSortState(); },
    getColumns() { return fields.map(column=>({...column})); },
    setMobileView(view) {
      if (!renderCard || !['cards','table'].includes(view) || destroyed) return;
      container.dataset.mobileView = view;scroll.scrollTop = 0;scroll.scrollLeft = 0;
      hideFilterTooltip();closeMenu();renderCards();
    },
    destroy() {
      if (destroyed) return;
      finishGesture(true); closeMenu(); destroyed = true; lifetime.abort(); resizeObserver.disconnect();
      filterTooltip.remove();
      if (footerContent && originalFooterParent?.isConnected) originalFooterParent.append(footerContent);
      container.replaceChildren(); container.classList.remove('results-table','results-has-cards'); container.inert = false;
      delete container.dataset.mobileView;delete container.dataset.hasRows;
      fields = []; rows = []; rowViews = [];
    },
  };
  api.setColumns(columns); api.setStatus('idle');
  return api;
}
