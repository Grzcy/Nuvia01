(function(){
  const style = document.createElement('style');
  style.textContent = `
  .ws-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:9999}
  .ws-card{width:min(520px,92vw);max-height:90vh;overflow:auto;background:var(--bg-primary,#0b1220);border:1px solid var(--border-light,#374151);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  .ws-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border-light,#374151)}
  .ws-hd h3{margin:0;font-size:18px;font-weight:800;background-image:linear-gradient(90deg,#ff7ac6,#6aa7ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  .ws-bd{padding:16px 18px}
  .ws-ft{display:flex;gap:10px;padding:12px 18px;border-top:1px solid var(--border-light,#374151)}
  .ws-btn{flex:1;padding:10px 12px;border-radius:10px;border:1px solid var(--border-light,#374151);background:var(--bg-tertiary,#111827);color:var(--text-primary,#e5e7eb);cursor:pointer}
  .ws-btn.primary{background-image:linear-gradient(90deg,#ff7ac6,#6aa7ff);border:0;color:#0b1220;font-weight:800}
  .ws-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--border-light,#374151)}
  .ws-row:last-child{border-bottom:none}
  .ws-ok{color:#22c55e}
  .ws-warn{color:#eab308}
  .ws-fail{color:#ef4444}
  .security-badge{position:fixed;bottom:18px;right:18px;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:9999px;background:var(--bg-primary,#0b1220);border:1px solid var(--border-light,#374151);box-shadow:0 1px 3px rgba(0,0,0,.2);color:var(--text-primary,#e5e7eb);z-index:200;cursor:pointer;user-select:none;transition:transform .2s ease;backdrop-filter:saturate(120%) blur(6px);animation:wsPulse 4s ease-in-out infinite}
  .security-badge:hover{transform:translateY(-1px)}
  .security-badge .icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 30% 30%,rgba(255,122,198,.35),rgba(106,167,255,.25))}
  .security-badge .icon i{background-image:linear-gradient(90deg,#ff7ac6,#6aa7ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  .security-badge .label{font-weight:700;font-size:13px;background-image:linear-gradient(90deg,#ff7ac6,#6aa7ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  @keyframes wsPulse{0%,100%{box-shadow:0 1px 3px rgba(0,0,0,.2),0 0 10px rgba(255,122,198,.35),0 0 18px rgba(106,167,255,.35)}50%{box-shadow:0 1px 3px rgba(0,0,0,.2),0 0 16px rgba(255,122,198,.55),0 0 28px rgba(106,167,255,.55)}}
  `;
  document.head.appendChild(style);
  const hideStyle = document.createElement('style');
  hideStyle.textContent = '.security-badge{display:none!important}';
  document.head.appendChild(hideStyle);
  function removeSecurityBadges(){
    document.querySelectorAll('.security-badge').forEach(function(el){ el.remove(); });
  }
  removeSecurityBadges();
  const badgeObserver = new MutationObserver(function(){ removeSecurityBadges(); });
  badgeObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

  function el(tag, attrs, html){ const e=document.createElement(tag); if(attrs) Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v)); if(html!=null) e.innerHTML=html; return e; }

  function deviceChecks(){
    const https = location.protocol === 'https:';
    const secure = window.isSecureContext === true;
    const sw = 'serviceWorker' in navigator;
    const swActive = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    const notif = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
    return { https, secure, sw, swActive, notif };
  }

  function renderModal(){
    if (document.getElementById('wsModal')) return;
    const modal = el('div', { id:'wsModal', class:'ws-modal', role:'dialog', 'aria-modal':'true' });
    const card = el('div', { class:'ws-card' });
    const hd = el('div', { class:'ws-hd' });
    hd.appendChild(el('h3', null, 'Security Center'));
    const close = el('button', { class:'ws-btn', style:'flex:0 0 auto;padding:6px 10px' }, '<i class="fas fa-times"></i>');
    close.addEventListener('click', ()=> modal.style.display='none');
    hd.appendChild(close);

    const bd = el('div', { class:'ws-bd' });
    const checks = deviceChecks();
    const items = [
      ['HTTPS Connection', checks.https],
      ['Secure Context', checks.secure],
      ['Service Worker', checks.swActive || checks.sw],
      ['Notifications API', checks.notif === 'granted' || checks.notif === 'default']
    ];
    items.forEach(([label, ok])=>{
      const row = el('div', { class:'ws-row' });
      row.appendChild(el('div', null, label));
      row.appendChild(el('div', { class: ok ? 'ws-ok' : 'ws-warn' }, ok ? '<i class="fas fa-check"></i>' : '<i class="fas fa-exclamation-triangle"></i>'));
      bd.appendChild(row);
    });
    const tips = el('div', { style:'margin-top:12px;font-size:13px;color:var(--text-secondary,#cbd5e1)'}, 'Your PIN and sensitive preferences are stored locally. Use a strong PIN and keep your device secure.');
    bd.appendChild(tips);

    const ft = el('div', { class:'ws-ft' });
    const goSecurity = el('button', { class:'ws-btn primary' }, 'Open Security Settings');
    goSecurity.addEventListener('click', ()=>{
      const settings = document.getElementById('settingsSection');
      if (settings){ settings.style.display='block'; settings.scrollIntoView({behavior:'smooth', block:'start'}); }
      modal.style.display='none';
    });
    const closeBtn = el('button', { class:'ws-btn' }, 'Close');
    closeBtn.addEventListener('click', ()=> modal.style.display='none');
    ft.appendChild(goSecurity); ft.appendChild(closeBtn);

    card.appendChild(hd); card.appendChild(bd); card.appendChild(ft);
    modal.appendChild(card);
    document.body.appendChild(modal);
  }

  function ensureBadge(){
    if (document.getElementById('securityBadge')) return;
    const badge = el('div', { id:'securityBadge', class:'security-badge', title:'Security Center' }, '<div class="icon"><i class="fas fa-shield-alt"></i></div><div class="label">Protected</div>');
    badge.addEventListener('click', ()=>{
      renderModal();
      const m = document.getElementById('wsModal'); if (m) m.style.display='flex';
    });
    document.body.appendChild(badge);
  }

  const start = ()=>{ renderModal(); /* ensureBadge(); */ };
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
