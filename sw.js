const CACHE_NAME = 'nuvia-static-v2';
const PRECACHE = ['/', '/index.html', '/explore.html', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE);
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    } catch (_) {}
    await self.clients.claim();
  })());
});

// Normalize some legacy uppercase routes to lowercase
function normalizePath(pathname) {
  switch (pathname) {
    case '/Chat.html': return '/chat.html';
    case '/Find_Friends.html': return '/find_friends.html';
    case '/Wallet.html': return '/wallet.html';
    case '/Report.html': return '/report.html';
    default: return null;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin === location.origin) {
    const normalized = normalizePath(url.pathname);
    if (normalized) {
      // Redirect to lowercase preserving query/hash
      const target = normalized + url.search + url.hash;
      event.respondWith(Response.redirect(target, 301));
      return;
    }

    // App Shell-style navigate handling with offline fallback
    if (req.mode === 'navigate') {
      event.respondWith((async () => {
        try {
          const res = await fetch(req);
          // Stale-while-revalidate: update cache best-effort
          const cache = await caches.open(CACHE_NAME);
          cache.put(url.pathname || '/index.html', res.clone()).catch(()=>{});
          return res;
        } catch (_) {
          const cache = await caches.open(CACHE_NAME);
          // Prefer exact page if cached; otherwise offline page (no generic index fallback)
          const exact = await cache.match(url.pathname || '/index.html');
          if (exact) return exact;
          const offline = await cache.match('/offline.html');
          if (offline) return offline;
          return Response.error();
        }
      })());
      return;
    }

    // Cache-first for GET same-origin html/css/js assets
    if (req.method === 'GET') {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok && (req.destination === 'document' || req.destination === 'script' || req.destination === 'style' || req.destination === 'image' || req.destination === 'font')) {
            cache.put(req, res.clone()).catch(()=>{});
          }
          return res;
        } catch (e) {
          // If request was document, use offline fallback
          if (req.destination === 'document') {
            const off = await cache.match('/offline.html');
            if (off) return off;
          }
          throw e;
        }
      })());
      return;
    }
  }
});

self.addEventListener('push', (event)=>{
  try{
    const data = (()=>{ try{ return event.data && event.data.json ? event.data.json() : null; }catch(_){ return null; } })();
    const title = (data && (data.title || data.notification?.title)) || 'New message';
    const body = (data && (data.body || data.notification?.body)) || 'You have a new notification';
    const icon = (data && (data.icon || data.notification?.icon)) || '/favicon.ico';
    const tag = (data && (data.tag || data.notification?.tag)) || 'nuvia-chat';
    const badge = (data && data.badge) || undefined;
    const urlClick = (data && (data.url || data.link || data.click_action)) || '/chat.html';
    const actions = (data && data.actions) || [];
    event.waitUntil(self.registration.showNotification(title, { body, icon, tag, badge, data:{ url: urlClick }, actions }));
  }catch(_){ }
});

self.addEventListener('notificationclick', (event)=>{
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/chat.html';
  event.waitUntil((async()=>{
    const allClients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const client = allClients.find(c => c.url.includes(url));
    if (client) { client.focus(); } else { self.clients.openWindow(url); }
  })());
});
