
const CACHE = 'yatao-timer-v2-1-0';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css?v=2.1.0',
  './js/app.js?v=2.1.0',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 只处理 GET；绝不拦截 Supabase Auth/REST/Storage 的 POST/PUT 请求
  if (req.method !== 'GET') return;
  if (url.hostname.includes('supabase.co') || url.hostname.includes('jsdelivr.net')) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
