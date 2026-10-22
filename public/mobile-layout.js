// Move the existing controls: their state, handlers and accessible names stay shared.
export function initializeMobileLayout({document, window}) {
  const media = window.matchMedia?.('(max-width:700px)');
  if (!media) return {destroy() {}};
  const lifetime = new window.AbortController(), {signal} = lifetime;
  const panel = document.getElementById('more-actions'), trigger = document.getElementById('more-actions-button');
  const toolbar = document.querySelector('.header-toolbar'), triggerMarker = document.createComment('more-actions-button');
  trigger.before(triggerMarker);
  const detailLinks = document.getElementById('details-links'), detailLinksMarker = document.createComment('details-links');
  detailLinks.before(detailLinksMarker);
  const controls = ['refresh-button','columns-button','clear-button','retry-button','cancel-export-button','export-page-button','export-button','theme-button','repository-link'].map(id => {
    const element = document.getElementById(id), marker = document.createComment(id);
    element.before(marker);
    return {element, marker};
  });
  function close() { if (panel.matches(':popover-open')) panel.hidePopover(); }
  function position() {
    const anchor = trigger.getBoundingClientRect(), width = panel.getBoundingClientRect().width || parseFloat(window.getComputedStyle(panel).width);
    panel.style.top = `${anchor.bottom + 6}px`;
    panel.style.left = `${Math.max(8,Math.min(anchor.right-width,window.innerWidth-width-8))}px`;
    panel.style.right = 'auto';
    panel.style.maxHeight = `${Math.max(0,(window.visualViewport?.height || window.innerHeight) - anchor.bottom - 14)}px`;
  }
  function resize() {
    const focused = document.activeElement;
    close();
    for (const {element,marker} of controls) {
      if (media.matches) panel.append(element);
      else marker.after(element);
    }
    if (media.matches) toolbar.after(trigger);else triggerMarker.after(trigger);
    if (media.matches) document.getElementById('details-content').prepend(detailLinks);else detailLinksMarker.after(detailLinks);
    if (focused===trigger && media.matches) trigger.focus({preventScroll:true});
    if (detailLinks.contains(focused)) focused.focus({preventScroll:true});
  }
  function viewport() {
    const view = window.visualViewport;
    if (!view || view.scale !== 1) return;
    document.documentElement.style.setProperty('--viewport-height',`${view.height}px`);
    document.documentElement.style.setProperty('--viewport-top',`${view.offsetTop}px`);
    if (panel.matches(':popover-open')) position();
  }
  panel.addEventListener('beforetoggle',event=>{if(event.newState==='open')position();},{signal});
  panel.addEventListener('toggle',()=>{const opened=panel.matches(':popover-open');trigger.setAttribute('aria-expanded',String(opened));if(opened)position();},{signal});
  panel.addEventListener('click',event=>{if(event.target.closest('button,a') && !event.target.closest('.select-control'))close();},{signal});
  panel.addEventListener('change',close,{signal});
  media.addEventListener('change',resize,{signal});
  window.visualViewport?.addEventListener('resize',viewport,{signal});
  window.visualViewport?.addEventListener('scroll',viewport,{signal});
  window.addEventListener('pagehide',event=>{if(!event.persisted)destroy();},{signal});
  function destroy() {
    close(); lifetime.abort();
    for (const {element,marker} of controls) {marker.after(element);marker.remove();}
    triggerMarker.after(trigger);triggerMarker.remove();
    detailLinksMarker.after(detailLinks);detailLinksMarker.remove();
    document.documentElement.style.removeProperty('--viewport-height');
    document.documentElement.style.removeProperty('--viewport-top');
  }
  resize(); viewport();
  return {destroy};
}
