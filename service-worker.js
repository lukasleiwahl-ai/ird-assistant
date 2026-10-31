/* IRD Assistant PWA service worker — notification delivery and click routing. */
const SW_VERSION = 'ird-assistant-pwa-v2.7.9.11';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'IRD Assistant', body: event.data ? event.data.text() : 'There is a guest request that needs attention.' };
  }

  const title = String(payload.title || 'IRD Assistant');
  const options = {
    body: String(payload.body || 'A guest request needs attention.'),
    icon: payload.icon || './icon128.png',
    badge: payload.badge || './icon48.png',
    tag: String(payload.tag || SW_VERSION),
    renotify: Boolean(payload.renotify),
    requireInteraction: payload.requireInteraction !== false,
    data: {
      url: payload.url || './index.html?tab=tasks',
      requestId: payload.requestId || ''
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : './index.html?tab=tasks';
  event.waitUntil((async () => {
    const target = new URL(rawUrl, self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client && client.url.startsWith(self.registration.scope)) {
        await client.focus();
        if ('navigate' in client && client.url !== target) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
