// Service worker minimal : Chrome exige un handler `fetch` pour proposer
// l'installation. Réseau d'abord, cache en secours — l'app est servie en
// local, l'offline complet n'est pas l'objectif.
const CACHE = 'redacimg-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r ?? Response.error())),
  );
});
