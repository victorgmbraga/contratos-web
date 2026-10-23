import { demoFetch } from './demo-fixtures.js';

// The production artifact always talks to the real PNCP; browser tests serve the
// synthetic corpus through context routing so no network access is required.
export async function routePncp(context, requests = []) {
  await context.route('https://pncp.gov.br/**', async route => {
    const url = route.request().url();
    requests.push(url);
    if (new URL(url).pathname === '/api/pncp/v1/orgaos/00000000000000/compras/2026/1') {
      await route.fulfill({ status: 301, json: { status: '301', message: 'Este endpoint foi movido para: https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}' } });
      return;
    }
    const response = await demoFetch(url);
    await route.fulfill({
      status: response.status,
      headers: { ...Object.fromEntries(response.headers), 'Access-Control-Allow-Origin': '*' },
      body: await response.text(),
    });
  });
}
