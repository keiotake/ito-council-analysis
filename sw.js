// みんなの伊東市 — Service Worker
// オフライン対応＋キャッシュ戦略

const CACHE_VERSION = 'v1-2026-04-23';
const CACHE_NAME = `ito-council-${CACHE_VERSION}`;

// 起動時にキャッシュするリソース
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('ito-council-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 外部APIはキャッシュせずネットワーク直行（AIチャット・解説・投稿等）
  if (url.hostname !== self.location.hostname) {
    return;
  }

  // HTMLはネットワーク優先、失敗時キャッシュ
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copy)).catch(()=>{});
          return resp;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./')))
    );
    return;
  }

  // 静的アセットはキャッシュ優先、失敗/無ければネットワーク
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copy)).catch(()=>{});
        }
        return resp;
      });
    })
  );
});
