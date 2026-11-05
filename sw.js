/* Service Worker - 每日英语听力
   策略：
   - HTML/CSS/JS 静态资源：首次缓存，后续优先缓存（stale-while-revalidate）
   - 音频：缓存优先，未命中则网络请求后存入 cache
   - RSS/API 请求：网络优先（拿最新内容）
*/

const CACHE_STATIC = 'hl_static_v4';
const CACHE_AUDIO = 'hl_audio';
const STATIC_ASSETS = [
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_STATIC && k !== CACHE_AUDIO)
            .map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 音频：缓存优先，未命中存缓存
  if (req.destination === 'audio' || /\.mp3(\?|$)/.test(url.href) || /\.m4a(\?|$)/.test(url.href)) {
    event.respondWith(
      caches.open(CACHE_AUDIO).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const resp = await fetch(req);
          // 成功且不是 no-cors 的 opaque（200/206 才存）
          if (resp.ok || resp.status === 206) {
            cache.put(req, resp.clone());
          }
          return resp;
        } catch (e) {
          return new Response('', { status: 480, statusText: 'Offline audio not cached' });
        }
      })
    );
    return;
  }

  // RSS / 资料源：网络优先（拿最新内容），失败读缓存
  if (/\.(xml|rss)(\?|$)/.test(url.href) || url.hostname.includes('ximalaya') || url.hostname.includes('simplecast') || url.hostname.includes('captivate') || url.hostname.includes('news.cgtn.com') || url.hostname.includes('redcircle')) {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_STATIC).then(c => c.put(req, copy));
        }
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 静态资源：stale-while-revalidate
  event.respondWith(
    caches.match(req).then(hit => {
      const fetchPromise = fetch(req).then(resp => {
        caches.open(CACHE_STATIC).then(c => c.put(req, resp));
        return resp;
      }).catch(() => hit);
      return hit || fetchPromise;
    })
  );
});
