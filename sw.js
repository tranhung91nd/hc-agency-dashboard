var CACHE_NAME = 'hc-agency-v1';
var URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf('supabase.co') >= 0 ||
      e.request.url.indexOf('graph.facebook.com') >= 0 ||
      e.request.url.indexOf('api.openai.com') >= 0 ||
      e.request.url.indexOf('api.anthropic.com') >= 0) {
    return;
  }
  e.respondWith(
    fetch(e.request).then(function(resp) {
      if (resp && resp.status === 200) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return resp;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
