// Magic Loyalty Strategist — Service Worker (v2.0)
// Network-first for HTML (ensures updates propagate immediately)
// Cache-first for static vendor assets (fonts, libraries)
// v2.0: Network-first strategy for own assets, version-check support
// v1.1: Added scheme guard to prevent chrome-extension cache errors

var CACHE_NAME = 'magic-strategist-v3';

var VENDOR_ASSETS = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js'
];

// Install — cache vendor assets only (own assets use network-first)
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(VENDOR_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean ALL old caches immediately
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

// Message handler — allows the page to request a forced update
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch strategy:
//   - POST / Apps Script → pass through (never cache)
//   - Own assets (same origin) → network-first, cache fallback
//   - Vendor assets (CDN) → cache-first, network fallback
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Only handle http/https — skip chrome-extension://, data:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // API calls (to Apps Script) — always network, never cache
  if (event.request.method === 'POST' || url.hostname === 'script.google.com') {
    return;
  }

  // Same-origin assets (our HTML, JS, CSS, manifest) → network-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          if (cached) return cached;
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  // Vendor assets (fonts, marked.js) → cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});