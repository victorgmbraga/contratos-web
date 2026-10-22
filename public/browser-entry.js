import './browser-styles.css';
import './theme.js';
import { createApplicationUI } from './app.js';
import { createWorkerService } from '../src/browser/service.js';

const service = { async call(...args) { return (await ready).call(...args); } };
const ready = (async () => {
  const response = await fetch(new URL('./browser-config.json', document.baseURI), { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Não foi possível carregar a configuração pública.');
  const config = await response.json();
  const demo = new URL(location.href).searchParams.get('demo');
  if (demo === '1') config.DEMO_MODE = true;
  const worker = createWorkerService(config);
  window.addEventListener('pagehide', event => { if (!event.persisted) worker.close(); });
  return worker;
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register(new URL('./sw.js', document.baseURI)).catch(() => {});
}
createApplicationUI(service);
