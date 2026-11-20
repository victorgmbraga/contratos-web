// Move the existing controls: their state, handlers and accessible names stay shared.
export function initializeMobileLayout({ document, window }) {
  const media = window.matchMedia?.('(max-width:700px)');
  if (!media) return { destroy() {} };
  const lifetime = new window.AbortController(),
    { signal } = lifetime;
  const panel = document.getElementById('more-actions'),
    trigger = document.getElementById('more-actions-button');
  const controls = [
    'refresh-button',
    'columns-button',
    'clear-button',
    'retry-button',
    'cancel-export-button',
    'theme-button',
    'repository-link'
  ].map(id => {
    const element = document.getElementById(id),
      marker = document.createComment(id);
    element.before(marker);
    return { element, marker };
  });
  const order = [
    'mobile-view-button',
    'refresh-button',
    'columns-button',
    'clear-button',
    'retry-button',
    'cancel-export-button',
    'mobile-export-all-button',
    'mobile-export-page-button',
    'mobile-export-full-button',
    'theme-button',
    'repository-link'
  ]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  function close() {
    if (panel.matches(':popover-open')) panel.hidePopover();
  }
  function position() {
    const anchor = trigger.getBoundingClientRect(),
      width = panel.getBoundingClientRect().width || parseFloat(window.getComputedStyle(panel).width);
    panel.style.top = `${anchor.bottom + 6}px`;
    panel.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))}px`;
    panel.style.right = 'auto';
    panel.style.maxHeight = `${Math.max(0, (window.visualViewport?.height || window.innerHeight) - anchor.bottom - 14)}px`;
  }
  function resize() {
    close();
    for (const { element, marker } of controls) {
      if (!media.matches) marker.after(element);
    }
    if (media.matches) for (const element of order) panel.append(element);
  }
  function viewport() {
    const view = window.visualViewport;
    if (!view || view.scale !== 1) return;
    document.documentElement.style.setProperty('--viewport-height', `${view.height}px`);
    document.documentElement.style.setProperty('--viewport-top', `${view.offsetTop}px`);
    if (panel.matches(':popover-open')) position();
  }
  panel.addEventListener(
    'beforetoggle',
    event => {
      if (event.newState === 'open') position();
    },
    { signal }
  );
  panel.addEventListener(
    'toggle',
    () => {
      const opened = panel.matches(':popover-open');
      trigger.setAttribute('aria-expanded', String(opened));
      if (opened) position();
    },
    { signal }
  );
  panel.addEventListener(
    'click',
    event => {
      if (event.target.closest('button,a') && !event.target.closest('.select-control')) close();
    },
    { signal }
  );
  media.addEventListener('change', resize, { signal });
  window.visualViewport?.addEventListener('resize', viewport, { signal });
  window.visualViewport?.addEventListener('scroll', viewport, { signal });
  window.addEventListener(
    'pagehide',
    event => {
      if (!event.persisted) destroy();
    },
    { signal }
  );
  function destroy() {
    close();
    lifetime.abort();
    for (const { element, marker } of controls) {
      marker.after(element);
      marker.remove();
    }
    document.documentElement.style.removeProperty('--viewport-height');
    document.documentElement.style.removeProperty('--viewport-top');
  }
  resize();
  viewport();
  return { destroy };
}
