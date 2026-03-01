// Magic Loyalty Strategist — Service Worker (v1.1)
// Provides offline splash screen and caches static assets
// v1.1: Added scheme guard to prevent chrome-extension cache errors

var CACHE_NAME = 'magic-strategist-v2';
var STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js'
];

// Install — cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for API calls, cache-first for static assets
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Only handle http/https — skip chrome-extension://, data:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // API calls (to Apps Script) — always network, never cache
  if (event.request.method === 'POST' || url.hostname === 'script.google.com') {
    return; // Let the browser handle it normally
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;

      return fetch(event.request).then(function(response) {
        // Cache successful responses
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});