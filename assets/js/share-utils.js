(function(){
  function buildShareUrl(postId, options){
    var base = (location.origin || '') + '/share/' + encodeURIComponent(postId);
    if (options && options.appId) base += ('?appId=' + encodeURIComponent(options.appId));
    return base;
  }
  function sharePost(postId, options){
    var url = buildShareUrl(postId, options||{});
    var title = (options && options.title) || 'Nuvia';
    if (navigator.share){ return navigator.share({ title: title, url: url }).catch(function(){}); }
    try { navigator.clipboard.writeText(url); alert('Link copied'); } catch(_) { window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank'); }
  }
  window.NuviaShare = { buildShareUrl: buildShareUrl, sharePost: sharePost };
})();

// Global scroll/state persistence and instant "Back" behavior
(function(){
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch(_){ }
  function safeGet(k){ try{ return sessionStorage.getItem(k); }catch(_){ return null; } }
  function safeSet(k,v){ try{ sessionStorage.setItem(k,v); }catch(_){ } }
  var pageKey = (location.pathname + location.search) || '/';
  var SCROLL_KEY = 'nuvia:scroll:' + pageKey;

  function restore(){
    try{
      var y = parseInt(safeGet(SCROLL_KEY) || '0', 10);
      if (y && y > 0) { requestAnimationFrame(function(){ window.scrollTo(0, y); }); }
    }catch(_){ }
  }
  function save(){ try{ safeSet(SCROLL_KEY, String(window.scrollY || window.pageYOffset || 0)); }catch(_){ } }
  var last = 0; function onScroll(){ var n = Date.now(); if (n - last < 200) return; last = n; save(); }

  if (document.readyState === 'complete' || document.readyState === 'interactive') restore();
  else document.addEventListener('DOMContentLoaded', restore, { once:true });
  window.addEventListener('pageshow', function(e){ if (e && e.persisted) restore(); });
  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('pagehide', save);

  function isBackEl(el){
    var a = el && el.closest ? el.closest('a,button') : null; if(!a) return false;
    var label = ((a.getAttribute('aria-label')||'') + ' ' + (a.textContent||'')).trim();
    var rel = (a.getAttribute('rel')||'').toLowerCase();
    var cls = (a.className||'');
    var href = (a.getAttribute('href')||'').trim().toLowerCase();
    if (a.hasAttribute('data-back')) return true;
    if (/\bback\b/i.test(label)) return true;
    if (/\bback\b/i.test(cls)) return true;
    if (rel === 'prev') return true;
    if (cls.indexOf('home-back-fab') !== -1) return true;
    if (href === 'javascript:history.back()') return true;
    return false;
  }

  document.addEventListener('click', function(ev){
    try{
      var target = ev.target;
      var el = target && (target.closest ? target.closest('a,button') : null);
      if (!el) return;
      if (!isBackEl(el)) return;
      var prev = document.referrer || '';
      var canGoBack = history.length > 1 && prev.indexOf(location.origin) === 0;
      if (canGoBack){ ev.preventDefault(); ev.stopPropagation(); save(); history.back(); }
    }catch(_){ }
  }, true);
})();
