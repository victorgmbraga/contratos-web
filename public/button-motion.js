// Delegated listeners also cover controls created by pagination and filters.
export function initializeButtonMotion(document) {
  const running = new WeakMap(),
    paginationFeedback = new WeakMap();
  const selector = 'button,a.button,a.repository-link';
  const pulse = [
    { transform: 'scale(1)' },
    { transform: 'scale(.9)', offset: 0.35 },
    { transform: 'scale(1.05)', offset: 0.72 },
    { transform: 'scale(1)' }
  ];
  const spin = [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }];
  const search = [
    { transform: 'translate(0,0)' },
    { transform: 'translate(-2px,-1px)', offset: 0.3 },
    { transform: 'translate(1px,1px)', offset: 0.65 },
    { transform: 'translate(0,0)' }
  ];
  const download = [
    { transform: 'translateY(0)' },
    { transform: 'translateY(3px)', offset: 0.45 },
    { transform: 'translateY(-1px)', offset: 0.7 },
    { transform: 'translateY(0)' }
  ];
  const columns = [
    { transform: 'scaleX(1)' },
    { transform: 'scaleX(.55)', offset: 0.4 },
    { transform: 'scaleX(1.18)', offset: 0.72 },
    { transform: 'scaleX(1)' }
  ];
  const tilt = [
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(-12deg)', offset: 0.25 },
    { transform: 'rotate(9deg)', offset: 0.55 },
    { transform: 'rotate(0deg)' }
  ];
  const rays = [
    { transform: 'rotate(0deg) scale(1)' },
    { transform: 'rotate(24deg) scale(1.12)', offset: 0.5 },
    { transform: 'rotate(0deg) scale(1)' }
  ];
  const cross = [
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(90deg)', offset: 0.6 },
    { transform: 'rotate(0deg)' }
  ];
  const dots = [
    { transform: 'translateY(0)' },
    { transform: 'translateY(-3px)', offset: 0.45 },
    { transform: 'translateY(0)' }
  ];
  const bars = direction => [
    { transform: 'translateX(0)' },
    { transform: `translateX(${direction * 2.5}px)`, offset: 0.4 },
    { transform: `translateX(${-direction}px)`, offset: 0.7 },
    { transform: 'translateX(0)' }
  ];
  const nudge = direction => [
    { transform: 'translateX(0)' },
    { transform: `translateX(${direction * 3}px)`, offset: 0.45 },
    { transform: 'translateX(0)' }
  ];

  function movements(button, icon) {
    const paths = [...icon.querySelectorAll('path')],
      rects = [...icon.querySelectorAll('rect')];
    const one = (target, frames, duration = 520, delay = 0) => [{ target, frames, duration, delay }];
    if (button.id === 'refresh-button') return one(icon, spin, 650);
    if (button.id === 'search-button') return one(icon, search, 560);
    if (button.id === 'filters-button' || button.classList.contains('results-header-menu')) {
      if (paths.length >= 3)
        return paths.slice(0, 3).map((target, index) => ({
          target,
          frames: bars(index % 2 === 0 ? 1 : -1),
          duration: 480,
          delay: index * 50
        }));
    }
    if (button.id === 'columns-button' && paths[0]) return one(paths[0], columns, 560);
    if (['export-button', 'mobile-export-all-button'].includes(button.id) && paths[0])
      return one(paths[0], download, 560);
    if (button.id === 'mobile-export-page-button' && paths[0]) return one(paths[0], columns, 500);
    if (button.id === 'theme-button')
      return icon.classList.contains('theme-icon-sun') && paths[0] ? one(paths[0], rays, 600) : one(icon, tilt, 600);
    if (button.id === 'repository-link') return one(icon, tilt, 600);
    if (['cancel-button', 'cancel-export-button', 'clear-button'].includes(button.id) && paths.length)
      return one(paths.at(-1), cross, 520);
    if (button.id === 'more-actions-button') {
      const circles = [...icon.querySelectorAll('circle')];
      if (circles.length)
        return circles.map((target, index) => ({ target, frames: dots, duration: 360, delay: index * 65 }));
    }
    if (button.id === 'mobile-view-button') {
      if (icon.classList.contains('view-icon-cards') && rects.length)
        return rects.map((target, index) => ({ target, frames: pulse, duration: 400, delay: index * 45 }));
      if (paths[0]) return one(paths[0], columns, 500);
    }
    const page = button.getAttribute('data-page');
    if (button.closest('.pagination') && ['first', 'prev', 'next', 'last'].includes(page))
      return one(icon, nudge(['first', 'prev'].includes(page) ? -1 : 1), 520);
    return one(icon, pulse, 420);
  }

  function animateIcons(button) {
    for (const icon of button.querySelectorAll(':scope > svg')) {
      for (const animation of running.get(icon) || []) animation.cancel();
      const animations = [];
      for (const { target, frames, duration, delay } of movements(button, icon)) {
        if (typeof target.animate !== 'function') continue;
        const animation = target.animate(frames, { duration, delay, easing: 'ease-in-out' });
        animations.push(animation);
      }
      if (!animations.length) continue;
      running.set(icon, animations);
      Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
        if (running.get(icon) === animations) running.delete(icon);
      });
    }
  }

  function followPagination(button) {
    const pagination = button.closest('.pagination'),
      action = button.getAttribute('data-page');
    if (!pagination || !action) return;
    const previous = paginationFeedback.get(pagination);
    if (previous) {
      previous.observer.disconnect();
      clearTimeout(previous.timer);
    }
    let current = button;
    const observer = new MutationObserver(() => {
      const replacement = [...pagination.querySelectorAll('button[data-page]')].find(
        item => item.getAttribute('data-page') === action
      );
      if (replacement && replacement !== current) {
        current = replacement;
        animateIcons(replacement);
      }
    });
    observer.observe(pagination, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      paginationFeedback.delete(pagination);
    }, 400);
    paginationFeedback.set(pagination, { observer, timer });
  }

  function iconButton(target) {
    if (!(target instanceof Element)) return null;
    const button = target.closest(selector);
    return button &&
      !button.matches(':disabled,[aria-disabled="true"],[aria-busy="true"]') &&
      button.querySelector(':scope > svg')
      ? button
      : null;
  }

  document.addEventListener(
    'pointerover',
    event => {
      if (event.pointerType === 'touch') return;
      const button = iconButton(event.target);
      const previous = event.relatedTarget instanceof Element ? event.relatedTarget.closest(selector) : null;
      if (button && button !== previous) animateIcons(button);
    },
    true
  );

  document.addEventListener(
    'focusin',
    event => {
      const button = iconButton(event.target);
      if (button?.matches(':focus-visible')) animateIcons(button);
    },
    true
  );

  document.addEventListener(
    'click',
    event => {
      const touch = 'pointerType' in event && event.pointerType === 'touch';
      if (
        event.detail === 0 ||
        (!touch && document.defaultView?.matchMedia('(hover:hover) and (pointer:fine)').matches)
      )
        return;
      const button = iconButton(event.target);
      if (!button) return;
      animateIcons(button);
      // Pagination replaces its buttons synchronously when loading a page.
      followPagination(button);
    },
    true
  );
}
