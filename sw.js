/*
 * sw.js — offline shell.
 *
 * The app itself needs no network at runtime; this simply keeps the files
 * cached so the tool opens at the yard with no signal. Data always lives in
 * localStorage, never in this cache.
 */
var CACHE = 'menzele-tire-tracker-v1';

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/css/styles.css',
  './assets/js/positions.js',
  './assets/js/svgutil.js',
  './assets/js/store.js',
  './assets/js/render-topdown.js',
  './assets/js/render-iso.js',
  './assets/js/ui.js',
  './assets/js/form.js',
  './assets/js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
