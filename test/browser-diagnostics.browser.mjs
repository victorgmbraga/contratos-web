import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserDiagnostics } from './browser-diagnostics.js';
import { launchTestBrowser } from './browser-launch.js';

const directory = await mkdtemp(join(tmpdir(), 'contratos-browser-evidence-'));
const diagnostics = createBrowserDiagnostics(directory, 'falha-controlada');
const browser = await launchTestBrowser({ diagnostics });
try {
  const context = await browser.newContext(), page = await context.newPage();
  await page.setContent('<main><h1>Diagnóstico de teste</h1></main>');
  const pageError = page.waitForEvent('pageerror');
  await page.evaluate(() => {
    console.error('Mensagem de diagnóstico controlada');
    setTimeout(() => { throw new Error('Erro de página controlado'); }, 0);
  });
  await pageError;
  assert.deepEqual(await readdir(directory), [], 'Uma execução bem-sucedida não deve gerar artefatos.');
  await diagnostics.capture(new Error('Falha controlada da suíte'));
  const folder = join(directory, 'falha-controlada');
  assert.match(await readFile(join(folder, 'failure.txt'), 'utf8'), /Falha controlada da suíte/);
  const logs = JSON.parse(await readFile(join(folder, 'console.json'), 'utf8'));
  assert(logs.messages.some(message => message.type === 'console.error' && message.text.includes('Mensagem de diagnóstico controlada')));
  assert(logs.messages.some(message => message.type === 'pageerror' && message.text.includes('Erro de página controlado')));
  assert.deepEqual(logs.warnings, []);
  const screenshot = await readFile(join(folder, 'context-1-page-1.png'));
  assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const trace = await readFile(join(folder, 'context-1-trace.zip'));
  assert.equal(trace.subarray(0, 2).toString(), 'PK');
  assert(trace.length > 1000);
  console.log('PASS Falha controlada produz screenshot, trace e logs; execução sem falha não grava artefatos');
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
