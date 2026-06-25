
const CACHE='yatao-official-v1';
const ASSETS=['./','./index.html','./css/style.css?v=official1','./js/app.js?v=official1','./manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.mode==='navigate'){e.respondWith(fetch(req).catch(()=>caches.match('./index.html')));return}
  e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res})))
});
