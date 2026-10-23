// Tooltips da barra de ferramentas e do aviso de janela de resultados.
export function createTooltips({ window, state, $: getElementById, toolbarButtonIds }) {
const $ = getElementById;
function hideWindowTooltip() { $('window-warning-tooltip').hidden=true; }
function hideTooltips() {
  hideWindowTooltip();
  for(const id of toolbarButtonIds)$(`${id}-tooltip`).hidden=true;
  $('repository-link-tooltip').hidden=true;
}
function bindTooltip(marker,tooltip) {
  const show=()=>showTooltip(marker,tooltip),hide=()=>{tooltip.hidden=true;};
  marker.addEventListener('mouseenter',show);marker.addEventListener('mouseleave',hide);
  marker.addEventListener('focus',show);marker.addEventListener('blur',hide);
  marker.addEventListener('click',hide);
}
function showTooltip(marker,tooltip) {
  if(marker.hidden || !tooltip.textContent)return;
  hideTooltips();
  tooltip.hidden=false;
  positionTooltip(marker,tooltip);
}
function positionTooltip(marker,tooltip) {
  const anchor=marker.getBoundingClientRect(),box=tooltip.getBoundingClientRect(),gap=8;
  const left=Math.max(gap,Math.min(anchor.left+(anchor.width-box.width)/2,window.innerWidth-box.width-gap));
  const above=anchor.top-box.height-gap;
  const top=above>=gap?above:Math.min(anchor.bottom+gap,window.innerHeight-box.height-gap);
  tooltip.style.left=`${left}px`;tooltip.style.top=`${Math.max(gap,top)}px`;
}
function showWindowTooltip() {
  if(state.status!=='loading')showTooltip($('window-warning'),$('window-warning-tooltip'));
}
return { bindTooltip, hideTooltips, hideWindowTooltip, showWindowTooltip, positionTooltip };
}
