// Delegated listeners also cover controls created by pagination and filters.
export function initializeButtonMotion(document) {
  const running = new WeakMap(), paginationFeedback = new WeakMap();
  const selector = 'button,a.button,a.repository-link';
  const pulse = [{transform:'scale(1)'},{transform:'scale(.86)',offset:.35},{transform:'scale(1.06)',offset:.72},{transform:'scale(1)'}];
  const spin = [{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}];
  const download = [{transform:'translateY(0)'},{transform:'translateY(3px)',offset:.5},{transform:'translateY(0)'}];

  function animateIcons(button) {
    const isRefresh = button.id === 'refresh-button';
    const isDownload = ['export-button','mobile-export-all-button'].includes(button.id);
    const frames = isRefresh ? spin : isDownload ? download : pulse;
    for (const icon of button.querySelectorAll(':scope > svg')) {
      if (typeof icon.animate !== 'function') continue;
      running.get(icon)?.cancel();
      const animation = icon.animate(frames,{duration:isRefresh?650:400,easing:'ease-in-out'});
      running.set(icon,animation);
      animation.finished.catch(()=>{});
      animation.addEventListener('finish',()=>{if(running.get(icon)===animation)running.delete(icon);},{once:true});
    }
  }

  function followPagination(button) {
    const pagination = button.closest('.pagination'), action = button.getAttribute('data-page');
    if (!pagination || !action) return;
    const previous = paginationFeedback.get(pagination);
    if (previous) { previous.observer.disconnect();clearTimeout(previous.timer); }
    let current = button;
    const observer = new MutationObserver(()=>{
      const replacement = [...pagination.querySelectorAll('button[data-page]')].find(item=>item.getAttribute('data-page')===action);
      if (replacement && replacement!==current) { current=replacement;animateIcons(replacement); }
    });
    observer.observe(pagination,{childList:true,subtree:true});
    const timer=setTimeout(()=>{observer.disconnect();paginationFeedback.delete(pagination);},400);
    paginationFeedback.set(pagination,{observer,timer});
  }

  function iconButton(target) {
    if (!(target instanceof Element)) return null;
    const button=target.closest(selector);
    return button && !button.matches(':disabled,[aria-disabled="true"],[aria-busy="true"]') && button.querySelector(':scope > svg') ? button : null;
  }

  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch')return;
    const button=iconButton(event.target);
    const previous=event.relatedTarget instanceof Element?event.relatedTarget.closest(selector):null;
    if(button && button!==previous)animateIcons(button);
  },true);

  document.addEventListener('focusin',event=>{
    const button=iconButton(event.target);
    if(button?.matches(':focus-visible'))animateIcons(button);
  },true);

  document.addEventListener('click', event => {
    const touch = 'pointerType' in event && event.pointerType==='touch';
    if (event.detail===0 || (!touch && document.defaultView?.matchMedia('(hover:hover) and (pointer:fine)').matches)) return;
    const button=iconButton(event.target);
    if(!button)return;
    animateIcons(button);
    // Pagination replaces its buttons synchronously when loading a page.
    followPagination(button);
  },true);
}
