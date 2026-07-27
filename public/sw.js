const CACHE_NAME = 'lockfile-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/router.js',
  '/js/i18n.js',
  '/js/skeleton.js',
  '/js/pages/dashboard.js',
  '/js/pages/documents.js',
  '/js/pages/folders.js',
  '/js/pages/tags.js',
  '/js/pages/scan.js',
  '/js/pages/search.js',
  '/js/pages/shared.js',
  '/js/pages/notifications.js',
  '/js/pages/approvals.js',
  '/js/pages/activity.js',
  '/js/pages/profile.js',
  '/js/pages/settings.js',
  '/js/pages/archive.js',
  '/js/pages/trash.js',
  '/js/pages/admin.js',
  '/js/pages/backup.js',
  '/js/config.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ message: 'Hors ligne — connexion indisponible' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        });
      })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
