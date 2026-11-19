const CACHE = 'lockin-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network only - no caching, always fresh
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
