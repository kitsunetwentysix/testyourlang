// Сначала сеть (чтобы новые темы появлялись сразу), без интернета — из кэша
const CACHE = 'legal-vocab-v6';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'topics.js', 'config.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png',
  'vendor/fonts/golos-cyrillic.woff2', 'vendor/fonts/golos-latin.woff2', 'vendor/fonts/literata-cyrillic.woff2', 'vendor/fonts/literata-latin.woff2',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
