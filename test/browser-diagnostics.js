import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

let currentDiagnostics;

// Each suite owns its evidence. Successful suites never write an artifact.
export function createBrowserDiagnostics(directory, suite) {
  const name = suite.replace(/[^a-z0-9_.-]/gi, '_');
  const folder = join(directory, name);
  const browsers = new Map(), messages = [], warnings = [];
  let captured = false, contextNumber = 0, pageNumber = 0;
  const record = entry => {
    if (messages.length < 5000) messages.push({ time: new Date().toISOString(), ...entry });
  };
  const warn = (action, error) => warnings.push(`${action}: ${error?.message || String(error)}`);

  async function track(browser) {
    const contexts = [];
    browsers.set(browser, contexts);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
      const context = await newContext(...args);
      const id = ++contextNumber;
      const entry = { context, id, pages: new Map(), tracing: false };
      contexts.push(entry);
      context.on('page', page => {
        const pageId = ++pageNumber;
        entry.pages.set(page, pageId);
        page.on('console', message => record({ context: id, page: pageId, type: `console.${message.type()}`, text: message.text() }));
        page.on('pageerror', error => record({ context: id, page: pageId, type: 'pageerror', text: error.stack || error.message }));
        page.on('crash', () => record({ context: id, page: pageId, type: 'crash', text: 'A página encerrou inesperadamente.' }));
      });
      try { await context.tracing.start({ screenshots: true, snapshots: true, sources: true }); entry.tracing = true; }
      catch (error) { warn(`Início do trace do contexto ${id}`, error); }
      return context;
    };
    return browser;
  }

  async function capture(error) {
    if (captured) return;
    captured = true;
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'failure.txt'), (error?.stack || String(error)) + '\n');
    for (const [browser, contexts] of browsers) {
      const openContexts = new Set(browser.contexts());
      for (const entry of contexts) {
        if (!openContexts.has(entry.context)) continue;
        for (const [page, pageId] of entry.pages) {
          if (page.isClosed()) continue;
          try { await page.screenshot({ path: join(folder, `context-${entry.id}-page-${pageId}.png`), timeout: 5000 }); }
          catch (cause) { warn(`Captura da página ${pageId}`, cause); }
        }
        if (entry.tracing) {
          try { await entry.context.tracing.stop({ path: join(folder, `context-${entry.id}-trace.zip`) }); }
          catch (cause) { warn(`Trace do contexto ${entry.id}`, cause); }
        }
      }
    }
    await writeFile(join(folder, 'console.json'), JSON.stringify({ messages, warnings }, null, 2) + '\n');
  }
  return { track, capture };
}

export function beginBrowserDiagnostics(suite) {
  currentDiagnostics = process.env.COMPRAS_QA_DIAGNOSTICS_DIR
    ? createBrowserDiagnostics(process.env.COMPRAS_QA_DIAGNOSTICS_DIR, suite)
    : undefined;
}

export function endBrowserDiagnostics() { currentDiagnostics = undefined; }

export async function trackBrowser(browser, diagnostics = currentDiagnostics) {
  return diagnostics ? diagnostics.track(browser) : browser;
}

export async function diagnoseBrowserFailure(error) {
  if (!currentDiagnostics) return;
  try { await currentDiagnostics.capture(error); }
  catch (cause) { console.error('Não foi possível salvar as evidências do navegador:', cause); }
}
