/* 단서 GPT 서비스워커
   - 등록 주소가 ./sw.js?v=DATA_VERSION 이므로 파일이 새로 배포되면 캐시 이름이 바뀐다.
   - 새 캐시가 활성화되는 순간 이 앱의 이전 버전 캐시는 전부 삭제된다.
   - html/manifest 는 항상 네트워크 먼저(=최신 파일 우선), 실패하면 캐시로 열린다.
   - 같은 주소(github.io)에 올라간 다른 단서 앱(crimescene-*)의 캐시는 건드리지 않는다. */

const VER = (function(){
  try { return new URL(self.location.href).searchParams.get('v') || 'dev'; }
  catch(e){ return 'dev'; }
})();
const PREFIX = 'danseo-gpt-';
const CACHE = PREFIX + VER;
function isMine(k){ return k.indexOf(PREFIX) === 0; }
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(ASSETS.map(u => cache.add(u).catch(() => {})))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => isMine(k) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* 새 파일 확인용(_uc)·파일 만들기용(_ex) 요청은 서버의 실제 파일을 그대로 읽어야 한다 */
  if (url.searchParams.has('_uc') || url.searchParams.has('_ex')) return;

  const isDoc = req.mode === 'navigate'
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.webmanifest');

  if (isDoc) {
    event.respondWith((async () => {
      try {
        const bust = new URL(url.href);
        bust.searchParams.set('_sw', Date.now().toString(36));
        const fresh = await fetch(bust.href, { cache: 'no-store', credentials: 'same-origin' });
        if (!fresh || !fresh.ok) throw new Error('bad response');
        try {
          const cache = await caches.open(CACHE);
          await cache.put(new Request(url.href), fresh.clone());
        } catch (e) { }
        return fresh;
      } catch (e) {
        const hit = await caches.match(url.href, { ignoreSearch: true, cacheName: CACHE })
                 || await caches.match(url.href, { ignoreSearch: true });
        return hit || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return Response.error();
    }
  })());
});
