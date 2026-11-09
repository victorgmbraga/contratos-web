import { demoFetch, demoDocuments } from './demo-fixtures.js';
export async function uiDemoFetch(url, init) {
  const u = new URL(url);
  if (u.pathname.endsWith('/contratos/2026/2/historico/quantidade')) return Response.json(1);
  if (u.pathname.endsWith('/contratos/2026/2/historico'))
    return Response.json(
      Array.from({ length: [2, 1, 0][Number(u.searchParams.get('pagina')) - 1] ?? 0 }, (_, i) => ({
        tipoLogManutencaoNome: `Evento ${i + 1}`,
        categoriaLogManutencaoNome: 'Contrato'
      }))
    );
  if (u.searchParams.get('q') === 'benchmark-ui') {
    const size = Number(u.searchParams.get('tam_pagina')),
      page = Number(u.searchParams.get('pagina'));
    const items = Array.from({ length: Math.min(size, 10000 - (page - 1) * size) }, (_, i) => ({
      ...demoDocuments[i % demoDocuments.length],
      id: `benchmark-${(page - 1) * size + i + 1}`,
      numero_controle_pncp: `benchmark-${(page - 1) * size + i + 1}`
    }));
    return Response.json({ items, total: 10000 });
  }
  if (u.searchParams.get('q') === 'falha-ui')
    return new Response('<html>falha</html>', { headers: { 'Content-Type': 'text/html' } });
  if (u.searchParams.get('q') === 'cancelar-ui')
    await new Promise((_, reject) => {
      init.signal.throwIfAborted();
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  if (u.searchParams.get('q') === 'lenta-ui') await new Promise(resolve => setTimeout(resolve, 500));
  if (u.searchParams.get('q') === 'janela-ui') {
    const size = Number(u.searchParams.get('tam_pagina')),
      page = Number(u.searchParams.get('pagina'));
    const docs = Array.from({ length: size }, (_, i) => ({
      ...demoDocuments[i % demoDocuments.length],
      id: `janela-${(page - 1) * size + i + 1}`,
      numero_controle_pncp: `janela-${(page - 1) * size + i + 1}`
    }));
    return Response.json({ items: docs, total: 4143240 });
  }
  if (['pagina-ui', 'csv-lenta-ui'].includes(u.searchParams.get('q'))) {
    const docs = Array.from({ length: 164 }, (_, i) => ({
      ...demoDocuments[i % demoDocuments.length],
      id: `pagina-${i + 1}`,
      numero_controle_pncp: `pagina-${i + 1}`
    }));
    const size = Number(u.searchParams.get('tam_pagina')),
      page = Number(u.searchParams.get('pagina'));
    // A partir da segunda página, a coleta do CSV só termina pelo cancelamento: um prazo fixo
    // deixava a exportação concluir antes do clique em Cancelar CSV (o WebKit espera a animação
    // do botão acabar antes de clicar).
    if (u.searchParams.get('q') === 'csv-lenta-ui' && page > 1)
      await new Promise((_, reject) => {
        init.signal.throwIfAborted();
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    return Response.json({ items: docs.slice((page - 1) * size, page * size), total: docs.length });
  }
  if (u.searchParams.get('q') === 'xss-ui')
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'xss',
            doc_type: '_doc',
            document_type: 'edital',
            description: '<img src=x onerror="window.pwned=true">',
            orgao_cnpj: '00000000000000',
            ano: '2026',
            numero_sequencial: '1'
          }
        ],
        total: 1
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  return demoFetch(url, init);
}
