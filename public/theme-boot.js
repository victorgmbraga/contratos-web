(function () {
  var key = 'contratos-web:theme';
  var theme = null;
  try {
    var stored = window.localStorage.getItem(key);
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch (error) { /* Storage may be blocked; the system preference still applies. */ }
  if (!theme) theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
