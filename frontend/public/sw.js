const CACHE_NAME = 'neoai-pwa-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

// Install Event - Pre-cache Static Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll skipped optional assets:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Hybrid Caching Strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests or browser extension requests
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // Bypass service worker cache on local dev server to ensure instant hot reloads
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // Strategy 1: Network-First for API requests with Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match(req).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return new Response(
              JSON.stringify({ offline: true, message: "Offline mode: Showing cached data" }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Strategy 2: Cache-First for Static Assets (Images, JS, CSS, Fonts)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and requesting document navigation, return root app shell
          if (req.mode === 'navigate') {
            return caches.match('/');
          }
        });
    })
  );
});

// Listen for Push Notifications (Optional feature ready)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'Time for your daily 5-minute NeoAI practice!';
  event.waitUntil(
    self.registration.showNotification('NeoAI Literacy Assistant', {
      body: data,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png'
    })
  );
});
