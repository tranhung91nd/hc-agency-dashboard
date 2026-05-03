// HC Agency SW v3 — stale-while-revalidate cho static assets
// Lần load đầu: như network (chưa có cache)
// Lần load thứ 2 trở đi: trả cache ngay → fetch mới ở background → update cache
// → Cảm nhận tải gần như tức thì sau lần đầu.
var CACHE_NAME = 'hc-agency-v4';

self.addEventListener('install', function(e) {
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
  var url = e.request.url;

  // Network-only cho mọi API call (data luôn cần fresh)
  if (url.indexOf('supabase.co') >= 0 ||
      url.indexOf('graph.facebook.com') >= 0 ||
      url.indexOf('api.openai.com') >= 0 ||
      url.indexOf('api.anthropic.com') >= 0 ||
      url.indexOf('api.telegram.org') >= 0 ||
      url.indexOf('vietqr.io') >= 0) {
    return;
  }

  // Stale-while-revalidate cho static (HTML/JS/CSS/ảnh)
  e.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(e.request).then(function(cached) {
        var networkPromise = fetch(e.request).then(function(resp) {
          if (resp && resp.status === 200) cache.put(e.request, resp.clone());
          return resp;
        }).catch(function() {
          return cached || Response.error();
        });
        return cached || networkPromise;
      });
    })
  );
});
