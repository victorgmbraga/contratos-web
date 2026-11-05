// Painel "Dicas de busca": operadores aceitos pela busca textual do PNCP (OR, NOT e aspas).
// Os exemplos preenchem o campo de busca sem pesquisar; Enter ou o botão de lupa confirmam.
export function initializeSearchHelp(document, window) {
  const panel = document.getElementById('search-help'),
    trigger = document.getElementById('search-help-button'),
    field = trigger?.closest('.search-field'),
    input = document.getElementById('search');
  if (!panel || !trigger || !field || !input || typeof panel.showPopover !== 'function') return;
  function position() {
    const anchor = field.getBoundingClientRect(),
      viewport = window.visualViewport?.width || window.innerWidth,
      width = Math.min(380, viewport - 16);
    panel.style.width = `${width}px`;
    panel.style.top = `${anchor.bottom + 6}px`;
    panel.style.left = `${Math.max(8, Math.min(anchor.right - width, viewport - width - 8))}px`;
    panel.style.maxHeight = `${Math.max(160, (window.visualViewport?.height || window.innerHeight) - anchor.bottom - 14)}px`;
  }
  panel.addEventListener('beforetoggle', event => {
    if (event.newState === 'open') position();
  });
  panel.addEventListener('toggle', () => {
    trigger.setAttribute('aria-expanded', String(panel.matches(':popover-open')));
  });
  panel.addEventListener('click', event => {
    const example = event.target.closest?.('.search-help-example');
    if (!example) return;
    input.value = example.dataset.query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    panel.hidePopover();
    input.focus();
    input.setSelectionRange?.(input.value.length, input.value.length);
  });
  window.addEventListener('resize', () => {
    if (panel.matches(':popover-open')) panel.hidePopover();
  });
}
