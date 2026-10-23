// Native selects retain their values, events, form behavior and intrinsic sizing.
// An accessible combobox and a top-layer list replace only their presentation.
export function initializeSelectMenus({document, window}) {
  if (!window.MutationObserver) return {refresh() {}, destroy() {}};
  const controls = new Map(), lifetime = new window.AbortController(), {signal} = lifetime;
  let serial = 0, opened = null, destroyed = false;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const normalize = text => text.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('pt-BR');
  function renderValue(control) {
    const option = control.source.selectedOptions[0];
    control.value.textContent = (opened===control?option?.label:option?.dataset.closedLabel || option?.label) || 'Selecionar';
  }
  function close(restoreFocus = false) {
    const control = opened;
    if (!control) return;
    opened = null;
    renderValue(control);
    if (control.menu.matches(':popover-open')) control.menu.hidePopover();
    control.button.setAttribute('aria-expanded','false');
    control.button.removeAttribute('aria-activedescendant');
    control.typed = '';
    if (restoreFocus && control.button.isConnected && !control.button.disabled) control.button.focus({preventScroll:true});
  }
  function enabled(option) { return !option.disabled && !option.hidden && !option.parentElement?.disabled; }
  function position() {
    const c = opened;if (!c) return;
    const anchor = c.button.getBoundingClientRect(), view = window.visualViewport;
    const left = view?.offsetLeft || 0, top = view?.offsetTop || 0, width = view?.width || window.innerWidth, height = view?.height || window.innerHeight, gap = 6, edge = 8;
    // A top-layer popover escapes the clipping bounds of its outer containers.
    const host = c.button.closest(':popover-open');
    const ancestors = [host,c.button.closest('.filters-body'),c.button.closest('#details-content'),c.button.closest('#header-content')].filter(element=>element && (!host || host.contains(element)));
    if (!anchor.width || !anchor.height || anchor.bottom <= top || anchor.top >= top+height || ancestors.some(element=>{
      const box = element.getBoundingClientRect();return anchor.bottom < box.top || anchor.top > box.bottom || anchor.right < box.left || anchor.left > box.right;
    })) {close();return;}
    c.menu.style.width = 'max-content';
    c.menu.style.minWidth = `${Math.min(anchor.width,width-edge*2)}px`;
    c.menu.style.maxWidth = `${Math.min(Math.max(anchor.width,340),width-edge*2)}px`;
    const below = top+height-anchor.bottom-gap-edge, above = anchor.top-top-gap-edge;
    const up = below < Math.min(180,c.menu.scrollHeight) && above > below;
    c.menu.style.maxHeight = `${Math.max(0,Math.min(300,up?above:below))}px`;
    c.menu.style.left = `${Math.max(left+edge,Math.min(anchor.left,left+width-c.menu.getBoundingClientRect().width-edge))}px`;
    c.menu.style.top = `${up?anchor.top-gap-c.menu.getBoundingClientRect().height:anchor.bottom+gap}px`;
  }
  function active(control,index,scroll = true) {
    control.active = index;
    control.items.forEach((item,i)=>{item.element.dataset.active = String(i===index);});
    const option = control.items[index]?.element;
    if (option) {
      control.button.setAttribute('aria-activedescendant',option.id);
      if (scroll) option.scrollIntoView({block:'nearest'});
    } else control.button.removeAttribute('aria-activedescendant');
  }
  function renderOptions(c) {
    c.items = [];c.menu.replaceChildren();
    let group = null;
    for (const option of c.source.options) {
      if (option.hidden) continue;
      if (option.parentElement.tagName === 'OPTGROUP' && option.parentElement !== group) {
        group = option.parentElement;
        c.menu.append(node('div','select-menu-group',group.label));
      }
      const item = node('div','select-option'),check = node('span','select-option-check','✓');
      item.id = `${c.menu.id}-option-${c.items.length}`;item.dataset.value = option.value;
      item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));
      item.setAttribute('aria-disabled',String(!enabled(option)));check.setAttribute('aria-hidden','true');
      item.append(node('span','select-option-label',option.label),check);c.menu.append(item);
      c.items.push({option,element:item});
    }
    if (!c.items.length) c.menu.append(node('div','select-menu-empty','Nenhuma opção disponível.'));
  }
  function refresh(source) {
    const list = source?[controls.get(source)]:controls.values();
    for (const c of list) {
      if (!c) continue;
      const previousActive = c.items[c.active]?.option, selected = c.source.selectedOptions[0], selectionChanged = c.selected !== selected;
      c.selected = selected;
      renderValue(c);
      c.button.disabled = c.source.disabled;
      c.button.dataset.empty = String(c.source.value==='');
      for (const attr of ['aria-describedby','aria-busy','aria-invalid','aria-required']) {
        const value = c.source.getAttribute(attr);
        if (value === null) c.button.removeAttribute(attr);else c.button.setAttribute(attr,value);
      }
      const label = c.source.getAttribute('aria-label') || c.labels.map(({element})=>{
        const copy = element.cloneNode(true);copy.querySelectorAll('select,.select-control').forEach(node=>node.remove());return copy.textContent.trim();
      }).filter(Boolean).join(' ') || 'Selecionar opção';
      c.button.setAttribute('aria-label',label);c.menu.setAttribute('aria-label',label);
      if (opened === c) {
        if (c.button.disabled || !c.source.isConnected) close();
        else {
          renderOptions(c);
          let index = c.items.findIndex(item=>item.option===(selectionChanged?selected:previousActive));
          if(index<0)index=c.items.findIndex(item=>item.option.selected);
          active(c,index);position();
        }
      }
    }
  }
  function open(c) {
    if (c.button.disabled || !c.source.isConnected) return;
    if (opened === c) {close();return;}
    close();
    // A single-choice menu replaces any other open selector or suggestion list.
    document.dispatchEvent(new window.Event('select-menu-open'));
    opened = c;refresh(c.source);
    if (opened !== c) return;
    c.menu.showPopover();c.button.setAttribute('aria-expanded','true');position();
    active(c,c.items.findIndex(item=>item.option.selected));
  }
  function choose(c,index) {
    const item = c.items[index];if (!item || !enabled(item.option)) return;
    const changed = c.source.selectedIndex !== item.option.index;
    c.source.selectedIndex = item.option.index;close(true);refresh(c.source);
    if (changed) {
      c.source.dispatchEvent(new window.Event('input',{bubbles:true}));
      c.source.dispatchEvent(new window.Event('change',{bubbles:true}));
    }
  }
  function keydown(c,event) {
    if (event.ctrlKey || event.metaKey || event.isComposing) return;
    const isOpen = opened === c;
    if (event.key==='Escape' && isOpen) {event.preventDefault();event.stopPropagation();close(true);return;}
    if (event.key==='Tab') {if(isOpen)close();return;}
    if (event.key==='Enter' || event.key===' ') {
      event.preventDefault();if(isOpen)choose(c,c.active);else open(c);return;
    }
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();if (!isOpen) open(c);
      const valid = c.items.map((item,index)=>enabled(item.option)?index:-1).filter(index=>index>=0);
      if (!valid.length) return;
      let next;
      if (event.key==='Home') next = valid[0];else if(event.key==='End') next = valid.at(-1);
      else {const index = valid.indexOf(c.active);next = valid[Math.max(0,Math.min(valid.length-1,index+(event.key==='ArrowDown'?1:-1)))];}
      active(c,next);return;
    }
    if (event.key.length===1 && !event.altKey) {
      event.preventDefault();if(!isOpen)open(c);
      const now = Date.now();c.typed = now-c.typedAt>700?'':c.typed;c.typedAt=now;c.typed+=normalize(event.key);
      const query = [...c.typed].every(char=>char===c.typed[0])?c.typed[0]:c.typed;
      const items = [...c.items.slice(c.active+1),...c.items.slice(0,c.active+1)];
      const found = items.find(item=>enabled(item.option) && normalize(item.option.label).startsWith(query));
      if (found) active(c,c.items.indexOf(found));
    }
  }
  function enhance(source) {
    if (controls.has(source) || source.multiple || source.size>1) return;
    const wrapper = node('span','select-control'),button = node('button','select-trigger'),value = node('span','select-value'),chevron = node('span','select-chevron'),menu = node('div','select-menu');
    chevron.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
    const id = ++serial;button.id = `${source.id || `select-${id}`}-control`;button.type='button';
    button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
    menu.id = `select-menu-${id}`;menu.setAttribute('popover','auto');menu.setAttribute('role','listbox');
    button.setAttribute('aria-controls',menu.id);chevron.setAttribute('aria-hidden','true');button.append(value,chevron);
    const labels = [...source.labels].map(element=>({element,original:element.getAttribute('for')}));
    const c = {source,wrapper,button,value,menu,labels,items:[],active:-1,typed:'',typedAt:0,tabIndex:source.getAttribute('tabindex'),ariaHidden:source.getAttribute('aria-hidden'),lifetime:new window.AbortController()};
    const local = {signal:c.lifetime.signal};controls.set(source,c);
    source.before(wrapper);wrapper.append(source,button,menu);source.classList.add('select-source');
    source.tabIndex=-1;source.setAttribute('aria-hidden','true');labels.forEach(({element})=>{element.htmlFor=button.id;});
    source.addEventListener('focus',()=>{if(!button.disabled)button.focus();},local);
    source.addEventListener('input',()=>refresh(source),local);source.addEventListener('change',()=>refresh(source),local);
    button.addEventListener('click',()=>open(c),local);button.addEventListener('keydown',event=>keydown(c,event),local);
    button.addEventListener('blur',()=>{if(opened===c)close();},local);
    menu.addEventListener('mousedown',event=>event.preventDefault(),local);
    menu.addEventListener('click',event=>{
      // Menus can live inside a label; suppress its default activation of the trigger.
      event.preventDefault();const option=event.target.closest('[role="option"]');
      if(option)choose(c,c.items.findIndex(item=>item.element===option));
    },local);
    menu.addEventListener('pointermove',event=>{const index=c.items.findIndex(item=>item.element===event.target.closest('[role="option"]'));if(index>=0 && enabled(c.items[index].option))active(c,index,false);},local);
    menu.addEventListener('toggle',()=>{if(opened===c && !menu.matches(':popover-open'))close();},local);
    refresh(source);
  }
  function remove(c) {
    if (opened===c) close();c.lifetime.abort();
    c.labels.forEach(({element,original})=>{if(original===null)element.removeAttribute('for');else element.setAttribute('for',original);});
    for (const [attr,value] of [['tabindex',c.tabIndex],['aria-hidden',c.ariaHidden]]) {if(value===null)c.source.removeAttribute(attr);else c.source.setAttribute(attr,value);}
    c.source.classList.remove('select-source');c.wrapper.replaceWith(c.source);controls.delete(c.source);
  }
  function scan(root) {
    if (root.nodeType!==1) return;
    if(root.tagName==='SELECT')enhance(root);else root.querySelectorAll('select').forEach(enhance);
  }
  const observer = new window.MutationObserver(records=>{
    const changed = new Set();
    for(const record of records) {
      const source = (record.target.nodeType===1?record.target:record.target.parentElement)?.closest('select');if(source)changed.add(source);
      if(record.type==='childList')record.addedNodes.forEach(scan);
    }
    for(const c of controls.values())if(!c.source.isConnected)remove(c);
    for(const source of changed)refresh(source);
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','selected','label','value','data-closed-label','aria-label','aria-describedby','aria-busy','aria-invalid','hidden']});
  document.addEventListener('pointerdown',event=>{if(opened && !opened.wrapper.contains(event.target))close();},{signal});
  document.addEventListener('scroll',event=>{if(opened && !opened.menu.contains(event.target))position();},{signal,capture:true});
  document.addEventListener('close',()=>close(),{signal,capture:true});
  document.addEventListener('reset',()=>window.queueMicrotask(()=>refresh()),{signal});
  window.addEventListener('resize',()=>close(),{signal});
  window.visualViewport?.addEventListener('resize',position,{signal});
  window.visualViewport?.addEventListener('scroll',position,{signal});
  window.addEventListener('pagehide',event=>{if(!event.persisted)destroy();},{signal});
  function destroy() {
    if(destroyed)return;destroyed=true;close();observer.disconnect();lifetime.abort();
    for(const c of controls.values())remove(c);
  }
  scan(document.body);
  return {refresh,destroy};
}
