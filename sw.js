// Arcuz service worker: offline caching for the Ruffle-hosted SWF game.
// Bump CACHE_VERSION whenever you change Arcuz.swf, index.html or the ruffle/ files.
const CACHE_VERSION = 'arcuz-v6';

// Core files cached on install. Anything else (Ruffle's .wasm and chunk
// files, etc.) is cached automatically the first time it is requested.
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './Arcuz.swf',
  './ruffle/ruffle.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Add files one by one so a single missing file doesn't break the install.
    await Promise.all(PRECACHE.map(async url => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] could not precache', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // only handle our own files

  // Pages: try the network first so updates show up, fall back to cache offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match(req, { ignoreSearch: true }))
            || (await caches.match('./index.html'))
            || Response.error();
      }
    })());
    return;
  }

  // Everything else (SWF, Ruffle runtime, WASM, icons): cache first, then network.
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      // Only cache complete, successful responses (not partial 206 ones).
      if (res && res.status === 200) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
