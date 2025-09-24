self.addEventListener('install', (e)=>{ self.skipWaiting(); });
self.addEventListener('activate', (e)=>{ self.clients.claim(); });

self.addEventListener('push', (event)=>{
  try{
    const data = (()=>{ try{ return event.data && event.data.json ? event.data.json() : null; }catch(_){ return null; } })();
    const title = (data && (data.title || data.notification?.title)) || 'New message';
    const body = (data && (data.body || data.notification?.body)) || 'You have a new notification';
    const icon = (data && (data.icon || data.notification?.icon)) || '/favicon.ico';
    const tag = (data && (data.tag || data.notification?.tag)) || 'nuvia-chat';
    const badge = (data && data.badge) || undefined;
    const url = (data && (data.url || data.link || data.click_action)) || '/chat.html';
    const actions = (data && data.actions) || [];
    event.waitUntil(self.registration.showNotification(title, { body, icon, tag, badge, data:{ url }, actions }));
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
