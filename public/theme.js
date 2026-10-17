export const THEME_STORAGE_KEY = 'contratos-web:theme';

export function initializeTheme({document = globalThis.document, window = globalThis.window} = {}) {
  const valid = value => value === 'light' || value === 'dark' ? value : null;
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  let preference = null, storage;
  try { storage = window.localStorage; preference = valid(storage.getItem(THEME_STORAGE_KEY)); } catch { /* Theme also works without storage. */ }
  const systemTheme = () => media?.matches ? 'dark' : 'light';
  function apply() {
    const dark = (preference || systemTheme()) === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.getElementById('theme-button')?.setAttribute('aria-pressed',String(dark));
    const tooltip = document.getElementById('theme-button-tooltip');
    if (tooltip) tooltip.textContent = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
  }
  function bind() {
    apply();
    document.getElementById('theme-button')?.addEventListener('click',()=>{
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { storage?.setItem(THEME_STORAGE_KEY,preference); } catch { /* Keep the choice for this page. */ }
      apply();
    });
  }
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
  media?.addEventListener('change',()=>{if (!preference) apply();});
  window.addEventListener('storage',event=>{
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    if (event.storageArea && event.storageArea !== storage) return;
    preference = valid(event.newValue); apply();
  });
}

if (globalThis.document && globalThis.window) initializeTheme();
