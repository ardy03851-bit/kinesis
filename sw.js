// Kinesis service worker: caches CDN runtime + models for fast, offline-capable reloads.
const VERSION = 'kinesis-v3.2';
const RUNTIME = 'kinesis-runtime-v1';
const SHELL = ['./', './index.html', './css/app.css', './js/main.js', './js/config.js', './js/icons.js', './js/tracker.js', './js/geometry.js', './js/overlay2d.js', './js/hand3d.js', './js/settings-ui.js', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-180.png', './assets/icon-maskable-512.png', './manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const CDN = /^(https:\/\/(cdn\.jsdelivr\.net|storage\.googleapis\.com|fonts\.googleapis\.com|fonts\.gstatic\.com))/;
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (CDN.test(req.url)) {
    // cache-first for immutable third-party assets
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  } else if (new URL(req.url).origin === location.origin) {
    // network-first for the app shell so updates land immediately
    e.respondWith(fetch(req).then((res) => { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); return res; }).catch(() => caches.match(req)));
  }
});
