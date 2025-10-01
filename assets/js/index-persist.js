(function(){
  'use strict';
  var PERSIST_FLAG = 'nuvia:index:loaded';
  var SESSION_FLAG = 'nuviaFirstVisitShown';
  var SCROLL_KEY = 'nuvia:index:scrollY';
  var INPUT_PREFIX = 'nuvia:index:input:';

  function safeGetLS(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
  function safeSetLS(k,v){ try{ localStorage.setItem(k,v); }catch(_){ } }
  function safeGetSS(k){ try{ return sessionStorage.getItem(k); }catch(_){ return null; } }
  function safeSetSS(k,v){ try{ sessionStorage.setItem(k,v); }catch(_){ } }

  // If user has loaded index once before (ever), pre-mark session to skip loader
  if (safeGetLS(PERSIST_FLAG) === '1' && safeGetSS(SESSION_FLAG) !== '1') {
    safeSetSS(SESSION_FLAG, '1');
  }

  // Prevent redundant navigation to home when already on home
  function isHomePath(p){ return p === '/' || p.endsWith('/index.html') || p === 'index.html'; }
  document.addEventListener('click', function(ev){
    try{
      var a = ev.target && (ev.target.closest ? ev.target.closest('a') : null);
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href) return;
      // Only handle same-document navigations to home
      if (isHomePath(href.replace(location.origin,'')) && isHomePath(location.pathname)){
        ev.preventDefault(); ev.stopPropagation();
        // Optionally focus main content if present
        var mc = document.getElementById('main-content');
        if (mc && typeof mc.focus === 'function') mc.focus();
      }
    }catch(_){ }
  }, true);

  // Restore simple UI state ASAP
  function restoreScroll(){
    try{
      var y = parseInt(safeGetLS(SCROLL_KEY) || '0', 10);
      if (y && y > 0) { requestAnimationFrame(function(){ window.scrollTo(0, y); }); }
    }catch(_){ }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    restoreScroll();
  } else {
    document.addEventListener('DOMContentLoaded', restoreScroll, { once:true });
  }

  // Persist after first DOM is interactive
  function markLoaded(){ if (safeGetLS(PERSIST_FLAG) !== '1') safeSetLS(PERSIST_FLAG, '1'); }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    markLoaded();
  } else {
    document.addEventListener('DOMContentLoaded', markLoaded, { once:true });
  }

  // Save scroll position (throttled)
  var lastSave = 0;
  window.addEventListener('scroll', function(){
    var now = Date.now();
    if (now - lastSave < 200) return; // throttle ~5/sec
    lastSave = now;
    try{ safeSetLS(SCROLL_KEY, String(window.scrollY || window.pageYOffset || 0)); }catch(_){ }
  }, { passive:true });
  window.addEventListener('pagehide', function(){ try{ safeSetLS(SCROLL_KEY, String(window.scrollY || window.pageYOffset || 0)); }catch(_){ } });

  // Persist input values generically (non-password)
  document.addEventListener('input', function(e){
    try{
      var t = e.target;
      if (!t || !t.tagName) return;
      var tag = t.tagName.toLowerCase();
      var type = (t.type || '').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
      if (type === 'password') return;
      var key = t.id || t.name;
      if (!key) return;
      var storageKey = INPUT_PREFIX + key;
      var val = (type === 'checkbox') ? (t.checked ? '1' : '0') : (type === 'radio' ? (t.checked ? (t.value || 'on') : null) : String(t.value || ''));
      if (val === null) return;
      safeSetLS(storageKey, val);
    }catch(_){ }
  }, true);

  function restoreInputs(){
    try{
      var els = document.querySelectorAll('input, textarea, select');
      els.forEach(function(t){
        try{
          var tag = t.tagName.toLowerCase();
          var type = (t.type || '').toLowerCase();
          if (type === 'password') return;
          var key = t.id || t.name; if (!key) return;
          var storageKey = INPUT_PREFIX + key;
          var saved = safeGetLS(storageKey);
          if (saved == null) return;
          if (type === 'checkbox') { t.checked = (saved === '1'); }
          else if (type === 'radio') { if ((t.value || 'on') === saved) t.checked = true; }
          else { t.value = saved; }
        }catch(_){ }
      });
    }catch(_){ }
  }
  if (document.readyState === 'complete') restoreInputs();
  else window.addEventListener('load', restoreInputs, { once:true });
})();
