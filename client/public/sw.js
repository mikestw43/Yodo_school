/* YODO service worker: only for notifications. No caching and no fetch handler, so nobody is ever
   served yesterday's app. Its job is to be awake when the phone is not. */

// The server sends the account's unread count with every push (the same number as the bell), so the
// icon is right even when notifications were read on another device. Unsupported is normal.
const applyBadge = async (count) => {
  try {
    if (count > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch (err) { /* not supported here */ }
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (err) { data = { body: event.data ? event.data.text() : '' }; }
  // iPhone already prints "YODO" above the title, so the title is the headline itself.
  const title = data.title || 'YODO';
  event.waitUntil((async () => {
    // Shown first, before anything that could stall: a push that shows nothing gets the
    // subscription revoked by Apple and Google.
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/apple-touch-icon.png',
      badge: '/icon-192.png',
      tag: data.tag || 'yodo',
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
      timestamp: Date.now(),
    });
    await applyBadge(typeof data.badge === 'number' ? data.badge : 1);
    // An open app refreshes its bell at once.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach((c) => c.postMessage({ type: 'yodo:refresh-notifications' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        // Bring the open app forward on that page instead of opening a second copy.
        if ('navigate' in client) await client.navigate(target).catch(() => {});
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
