(function(){
  'use strict';
  if (!('fetch' in window)) return;
  var ORIGINAL = window.fetch.bind(window);
  var RETRY_HOSTS = ['firestore.googleapis.com','www.gstatic.com','edge.fullstory.com'];
  function parseUrl(input){ try{ return (typeof input === 'string') ? new URL(input, location.href) : (input && input.url) ? new URL(input.url, location.href) : null; }catch(e){ return null; } }

  function shouldRetry(url){ try{ if(!url) return false; return RETRY_HOSTS.some(h=> url.hostname && url.hostname.indexOf(h) !== -1); }catch(_){ return false; } }

  function delay(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }

  window.fetch = function(input, init){
    var url = parseUrl(input);
    // Offline shortcut for navigations
    if (!navigator.onLine) {
      try{
        if (init && init.mode === 'navigate') {
          // Try to serve cached index or offline page
          return caches.open('nuvia-static-v2').then(function(c){ return c.match('/index.html').then(function(r){ return r || c.match('/offline.html'); }); }).then(function(r){ if(r) return r.clone(); return Promise.reject(new TypeError('Offline - no cache match')); });
        }
      }catch(_){ }
    }

    // Retry logic for specific hosts
    if (shouldRetry(url)){
      var attempts = 0;
      var max = 2;
      var backoff = [200, 600];
      function attempt(){
        attempts++;
        return ORIGINAL(input, init).catch(function(err){
          if (attempts <= max){ return delay(backoff[attempts-1] || 500).then(attempt); }
          // Dispatch event for app-level handling
          try{ window.dispatchEvent(new CustomEvent('nuvia:fetch:error', { detail: { url: url.href, message: err && err.message } })); }catch(_){ }
          return Promise.reject(err);
        });
      }
      try{ return attempt(); }catch(e){ return Promise.reject(e); }
    }

    // Default pass-through
    try{ return ORIGINAL(input, init); }catch(e){ return Promise.reject(e); }
  };

  // Global handlers to avoid noisy console errors and to hide loader if network fails
  window.addEventListener('unhandledrejection', function(ev){
    try{
      var reason = ev && ev.reason;
      console.warn('Unhandled rejection captured', reason);
      if (typeof window.hideLoader === 'function') try{ window.hideLoader(); }catch(_){ }
    }catch(_){ }
  });

  window.addEventListener('error', function(ev){
    try{ console.warn('Window error captured', ev && ev.message); if (typeof window.hideLoader === 'function') try{ window.hideLoader(); }catch(_){ } }catch(_){ }
  });
})();
