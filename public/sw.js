/**
 * Minimaler Service Worker: cached die App-Shell, damit ein Kaltstart im
 * Flugmodus überhaupt möglich ist (Akzeptanzkriterium Phase 1).
 *
 * Bewusst klein gehalten — der eigentliche PWA-Feinschliff (Manifest, Icons,
 * vite-plugin-pwa/Workbox, autoUpdate) ist Phase 6. Diese Datei wird dort
 * ersetzt.
 *
 * API-Antworten werden absichtlich NICHT gecacht: die Offline-Fähigkeit der
 * Daten kommt aus IndexedDB, nicht aus dem HTTP-Cache. Sonst gäbe es zwei
 * konkurrierende Wahrheiten.
 */
const CACHE = 'espo-shell-v1';
const SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Die Bundles werden geladen, bevor dieser Worker die Kontrolle übernimmt —
 * sie landen also nicht von selbst im Cache. Die Seite meldet sie deshalb
 * nach der Aktivierung nach. (In Phase 6 erledigt das die Precache-Manifest-
 * Generierung von Workbox.)
 */
self.addEventListener('message', (event) => {
  const { type, assets } = event.data ?? {};
  if (type !== 'precache' || !Array.isArray(assets)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Einzeln, damit ein fehlschlagendes Asset nicht alles verwirft.
      Promise.allSettled(assets.map((url) => cache.add(url))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // API bleibt ungecacht

  // `ignoreVary` ist hier nicht optional: Vite (und viele Reverse-Proxies)
  // senden `Vary: Origin`. Der beim Precachen geholte Response trägt einen
  // anderen Origin-Header als die späteren Anfragen der Seite — ohne
  // ignoreVary liefert caches.match dann trotz vorhandenem Eintrag nichts,
  // und der Offline-Start scheitert an genau den Bundles, die im Cache liegen.
  const fromCache = (key) => caches.match(key, { ignoreVary: true });

  // Navigation: erst Netz (frische Shell), sonst die gecachte index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => fromCache('/index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Assets tragen Hash-Namen — cache-first ist damit sicher.
  event.respondWith(
    fromCache(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        }),
    ),
  );
});
