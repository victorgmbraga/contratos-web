const CACHE = 'contratos-web-assets-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('contratos-web-assets-') && key !== CACHE).map(key => caches.delete(key)));
    } catch { /* A ativação continua mesmo sem acesso ao cache. */ }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.includes('/assets/')) return;
  event.respondWith((async () => {
    try {
      const cached = await caches.match(request);
      if (cached) return cached;
    } catch { /* Cache indisponível: segue para a rede. */ }
    const response = await fetch(request);
    if (response.ok) {
      try {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      } catch { /* Quota ou cache bloqueado não impedem a resposta. */ }
    }
    return response;
  })());
});
