const DIGIRISE_CACHE_VERSION = 'digirise-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/partner.html',
  '/admin.html',
  '/css/shared.css',
  '/css/index.css',
  '/css/partner.css',
  '/css/admin.css',
  'css/digirise-nextgen.css',
  '/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(DIGIRISE_CACHE_VERSION).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('Some assets failed to pre-cache:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== DIGIRISE_CACHE_VERSION;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // NEVER cache or intercept Firebase requests — 
  // always go to network for anything realtime-related
  if (url.includes('firebaseio.com') || 
      url.includes('firebasedatabase.app') || 
      url.includes('googleapis.com')) {
    return;
  }

  // For JS files, always prefer network (so app logic 
  // updates are never stuck on stale cache)
  if (url.endsWith('.js')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // For static HTML/CSS, network-first with cache fallback
  // (cache-first causes stale CSS during development)
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
