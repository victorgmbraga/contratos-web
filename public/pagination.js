// Ícones Lucide (ISC/MIT): THIRD_PARTY_LICENSES.md.
export const paginationIcons = {
  first:'<svg class="pagination-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m17 18-6-6 6-6"/><path d="M7 6v12"/></svg>',
  prev:'<svg class="pagination-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 18-6-6 6-6"/></svg>',
  next:'<svg class="pagination-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6"/></svg>',
  last:'<svg class="pagination-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 18 6-6-6-6"/><path d="M17 6v12"/></svg>',
};

export function paginationPages(page, lastPage, limit = 5) {
  const count = Math.min(limit, lastPage), first = Math.max(1, Math.min(page - Math.floor(count/2), lastPage - count + 1));
  return Array.from({length:count}, (_, index) => first + index);
}

export function createPagination({document, element = document.createElement('nav'), className = '', label = 'Paginação',
  subject = '', icons = paginationIcons, hideSinglePage = false, legacyClasses = false, onPageChange}) {
  element.className = [element.className,'pagination',className].filter(Boolean).join(' ');
  element.setAttribute('aria-label',label);
  let state = {page:1,lastPage:1,hasMore:false,busy:false}, controls = [], focusAction = null;
  const suffix = subject ? ` de ${subject}` : '';

  function render(patch = {}) {
    const focused = controls.find(control=>control.button === document.activeElement)?.action;
    if (focused !== undefined) focusAction = focused;
    state = {...state,...patch};
    const {page,lastPage,busy,hasMore} = state, known = lastPage !== null;
    element.hidden = hideSinglePage && known && lastPage <= 1;
    element.setAttribute('aria-busy',String(busy));
    element.dataset.totalKnown = String(known);
    element.dataset.longPages = String(String(lastPage ?? page).length > 3);
    element.replaceChildren(); controls = [];
    const add = (action,title,target,disabled,icon) => {
      const button = document.createElement('button');
      button.className = `pagination-button${legacyClasses?' results-page':''}`;
      button.type = 'button'; button.dataset.page = String(action); button.title = title;
      button.setAttribute('aria-label',title); button.disabled = busy || disabled;
      if (icon) button.innerHTML = icon; else button.textContent = String(action);
      if (action === page) {button.classList.add('active');button.setAttribute('aria-current','page');}
      button.addEventListener('click',()=>{
        if (!state.busy && !button.disabled) return Promise.resolve(onPageChange?.(target)).catch(()=>{});
      });
      controls.push({action:String(action),button}); return button;
    };
    if (known) element.append(add('first',`Primeira página${suffix}`,1,page <= 1,icons.first));
    element.append(add('prev',`Página anterior${suffix}`,page-1,page <= 1,icons.prev));
    if (known) {
      const numbered = document.createElement('span');
      numbered.className = `pagination-pages${legacyClasses?' results-pages':''}`;
      const compact = new Set(paginationPages(page,lastPage,3));
      for (const number of paginationPages(page,lastPage)) {
        const button = add(number,`Página ${number}${suffix}`,number,false);
        button.dataset.compactPage = String(compact.has(number));numbered.append(button);
      }
      element.append(numbered);
    } else {
      const current = document.createElement('span');current.className = 'pagination-label';
      current.textContent = `Página ${page}`;element.append(current);
    }
    element.append(add('next',`Próxima página${suffix}`,page+1,known?page >= lastPage:!hasMore,icons.next));
    if (known) element.append(add('last',`Última página${suffix}`,lastPage,page >= lastPage,icons.last));
    if (!busy && focusAction !== null) {
      if (focused !== undefined || document.activeElement === document.body) {
        const available = ({button})=>!button.disabled && (!button.getClientRects || button.getClientRects().length > 0);
        (controls.find(control=>control.action === focusAction && available(control))
          || controls.find(control=>control.button.getAttribute('aria-current') === 'page' && available(control))
          || controls.find(available))?.button.focus({preventScroll:true});
      }
      focusAction = null;
    }
  }
  render();
  return {element,render,setBusy:busy=>render({busy})};
}
