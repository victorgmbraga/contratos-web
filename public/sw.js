const CACHE = 'contratos-web-assets-v1';

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter(key => key.startsWith('contratos-web-assets-') && key !== CACHE).map(key => caches.delete(key))
        );
      } catch {
        /* A ativação continua mesmo sem acesso ao cache. */
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url),
    assetsPrefix = new URL('./assets/', self.registration.scope).pathname;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(assetsPrefix)) return;
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
      } catch {
        /* Cache indisponível: segue para a rede. */
      }
      const response = await fetch(request);
      if (response.status === 200 && response.type === 'basic') {
        try {
          cache ||= await caches.open(CACHE);
          await cache.put(request, response.clone());
        } catch {
          /* Quota ou cache bloqueado não impedem a resposta. */
        }
      }
      return response;
    })()
  );
});
