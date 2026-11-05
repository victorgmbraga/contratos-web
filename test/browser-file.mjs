// Executa um único arquivo de teste de navegador num processo próprio, com as evidências de
// diagnóstico da sua etapa. Usado por browser-smoke.mjs; também pode ser chamado diretamente:
//   node test/browser-file.mjs ui-smoke-1.mjs
import { beginBrowserDiagnostics, diagnoseBrowserFailure, endBrowserDiagnostics } from './browser-diagnostics.js';

const name = process.argv[2];
if (!name || !/^[\w.-]+\.m?js$/.test(name)) throw new Error('Informe o nome de um arquivo de teste em test/.');
beginBrowserDiagnostics(name);
try {
  await import('./' + name);
} catch (error) {
  await diagnoseBrowserFailure(error);
  throw error;
} finally {
  endBrowserDiagnostics();
}
