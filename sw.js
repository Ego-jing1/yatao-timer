const CACHE='yatao-timer-v5-0-0';
const APP_SHELL=['./','./index.html','./style.css?v=5.0.0','./app.js?v=5.0.0','./manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  if(url.hostname.includes('supabase.co')||url.hostname.includes('jsdelivr.net'))return;
  if(req.mode==='navigate'){e.respondWith(fetch(req).catch(()=>caches.match('./index.html')));return}
  e.respondWith(caches.match(req).then(cached=>{
    const network=fetch(req).then(res=>{if(res&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res}).catch(()=>cached);
    return cached||network;
  }))
});
