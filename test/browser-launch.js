import { pathToFileURL } from 'node:url';
import { trackBrowser } from './browser-diagnostics.js';

export async function launchTestBrowser({ diagnostics } = {}) {
  const playwright = await import(process.env.COMPRAS_QA_PLAYWRIGHT_MODULE || 'playwright');
  const name = process.env.COMPRAS_QA_BROWSER || 'chromium';
  if (!['chromium','firefox','webkit'].includes(name)) throw new Error('COMPRAS_QA_BROWSER inválido.');
  let options = { headless: true };
  const executablePath = process.env.COMPRAS_QA_BROWSER_EXECUTABLE || process.env.COMPRAS_QA_CHROMIUM_EXECUTABLE;
  if (executablePath) options.executablePath = executablePath;
  if (name === 'chromium' && process.env.COMPRAS_QA_CHROMIUM_MODULE) {
    const { default: binary } = await import(pathToFileURL(process.env.COMPRAS_QA_CHROMIUM_MODULE));
    options.executablePath ||= await binary.executablePath();
  }
  if (name === 'chromium' && options.executablePath) options.args = ['--no-sandbox','--disable-dev-shm-usage'];
  return trackBrowser(await playwright[name].launch(options), diagnostics);
}
