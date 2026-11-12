/* Minibar Daily Operation PWA service worker — v1.3.5 */
const CACHE = 'mdo-shell-v1.3.5';
const SHELL = ['/', '/index.html', '/styles.css?v=1.3.5', '/app.js?v=1.3.5', '/manifest.webmanifest', '/icon.svg'];
const NETWORK_FIRST = new Set(['/', '/index.html', '/app.js', '/styles.css', '/manifest.webmanifest']);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('mdo-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const isShell = NETWORK_FIRST.has(url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isShell) {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        if (fresh && fresh.ok) await cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        return (await cache.match(request, {ignoreSearch:true})) || (await cache.match(url.pathname === '/' ? '/index.html' : url.pathname, {ignoreSearch:true}));
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
