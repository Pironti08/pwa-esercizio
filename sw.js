// sw.js — Service Worker: mette in cache le risorse statiche per il funzionamento offline.
// Tutti i percorsi sono relativi alla posizione di sw.js, quindi valgono anche in un sottopercorso
// (https://utente.github.io/mini-sheet-pwa/). Se cambi un file, incrementa CACHE_VERSION.

const CACHE_VERSION = 'v1';
const CACHE = `mini-foglio-${CACHE_VERSION}`;
const PRECACHE = [
  './', './index.html', './manifest.json',
  './css/bootstrap.min.css', './css/style.css',
  './js/app.js', './js/engine.js', './js/coordinates.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

// INSTALL: scarica e salva tutte le risorse; skipWaiting attiva subito la nuova versione.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

// ACTIVATE: elimina le cache di versioni precedenti e prende il controllo delle pagine aperte.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mini-foglio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// FETCH: "stale-while-revalidate" per le richieste della stessa origine.
// Risponde subito dalla cache (veloce, funziona offline) e intanto aggiorna la copia dalla rete.
// Nessuna richiesta verso server esterni viene intercettata o inviata.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error(); // offline: apri comunque l'app
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
