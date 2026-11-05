import './browser-styles.css';
import './theme.js';
import { initializeButtonMotion } from './button-motion.js';
import { initializeSearchHelp } from './search-help.js';
import { createApplicationUI } from './app.js';
import { createWorkerService } from '../src/browser/service.js';

// O Worker é criado antes de a configuração chegar, para que os dois downloads ocorram em paralelo.
const config = fetch(new URL('./browser-config.json', document.baseURI), {
  cache: 'no-store',
  credentials: 'omit'
}).then(response => {
  if (!response.ok) throw new Error('Não foi possível carregar a configuração pública.');
  return response.json();
});
const service = createWorkerService(config);
window.addEventListener('pagehide', event => {
  if (!event.persisted) service.close();
});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register(new URL('./sw.js', document.baseURI)).catch(() => {});
}
initializeButtonMotion(document);
initializeSearchHelp(document, window);
createApplicationUI(service);
