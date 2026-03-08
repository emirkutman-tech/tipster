// TIPSTER Service Worker v1.0
// Caches app shell for offline use, network-first for API calls

const CACHE_NAME = 'tipster-v1';
const CACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@300;400;500;600&family=Share+Tech+Mono&display=swap'
];

// ── Install: cache app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_URLS).catch(err => {
        console.warn('[SW] Some cache URLs failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for assets ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always network for Anthropic API calls
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for Google Fonts (allow refresh)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for app shell (HTML, icons, manifest)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for HTML pages
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Background Sync: refresh tips daily ──
self.addEventListener('periodicsync', event => {
  if (event.tag === 'tipster-daily-refresh') {
    event.waitUntil(
      // Notify the app to refresh tips on next open
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'DAILY_REFRESH' }));
      })
    );
  }
});

// ── Push Notifications (future use) ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '⚽ TIPSTER', {
      body: data.body || "Today's football tips are ready!",
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      tag: 'tipster-tips',
      renotify: true,
      data: { url: './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
