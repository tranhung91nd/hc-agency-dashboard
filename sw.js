// HC Agency SW v19 — network-first cho HTML/JS/CSS, stale-while-revalidate cho ảnh
// Code (HTML/JS/CSS): luôn fetch network → fallback cache nếu offline.
//   → Deploy mới user thấy ngay lập tức, không cần reload 2 lần như SWR cũ.
// Ảnh + assets tĩnh khác: stale-while-revalidate (load nhanh từ cache).
var CACHE_NAME = 'hc-agency-v20';

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

function isCodeAsset(url) {
  // Code = HTML, JS, CSS — luôn cần fresh
  return /\.(html|js|css)(\?.*)?$/i.test(url) || url.endsWith('/') || /\/index\.html?$/i.test(url);
}

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;

  // Network-only cho mọi API call (data luôn cần fresh, không cache)
  if (url.indexOf('supabase.co') >= 0 ||
      url.indexOf('graph.facebook.com') >= 0 ||
      url.indexOf('api.openai.com') >= 0 ||
      url.indexOf('api.anthropic.com') >= 0 ||
      url.indexOf('api.telegram.org') >= 0 ||
      url.indexOf('vietqr.io') >= 0 ||
      url.indexOf('/api/') >= 0) {
    return;
  }

  // Network-first cho code (HTML/JS/CSS) → user luôn có bản mới nhất
  if (isCodeAsset(url)) {
    e.respondWith(
      fetch(e.request).then(function(resp) {
        if (resp && resp.status === 200) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return resp;
      }).catch(function() {
        return caches.match(e.request).then(function(cached) {
          return cached || Response.error();
        });
      })
    );
    return;
  }

  // Stale-while-revalidate cho ảnh + assets tĩnh khác
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
