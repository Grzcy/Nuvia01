import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";
import { getCloudinaryImageUrl } from './avatar-utils.js';

(function(){
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyDz-8N0totzvMCvonF9pKj9RsoH3J8xL0w",
    authDomain: "jchat-1.firebaseapp.com",
    databaseURL: "https://jchat-1-default-rtdb.firebaseio.com",
    projectId: "jchat-1",
    storageBucket: "jchat-1.firebasestorage.app",
    messagingSenderId: "328479683167",
    appId: "1:328479683167:web:276c0b7e8ea44dd2d6a1ea",
    measurementId: "G-S6Z9GG0R9P"
  };
  const appId = typeof __app_id !== 'undefined' ? __app_id : (typeof window !== 'undefined' && window.__nuviaAppId ? window.__nuviaAppId : 'default-app-id');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const els = {
    metric: document.getElementById('metricSelect'),
    tf: document.getElementById('tfSelect'),
    search: document.getElementById('searchInput'),
    list: document.getElementById('leaderboardList'),
    loading: document.getElementById('stateLoading'),
    empty: document.getElementById('stateEmpty'),
    error: document.getElementById('stateError'),
    prev: document.getElementById('prevPageBtn'),
    next: document.getElementById('nextPageBtn'),
    notifBadge: document.getElementById('notificationCount'),
    headerPic: document.getElementById('headerProfilePic'),
    headerIcon: document.getElementById('headerAvatarIcon'),
    profileLink: document.getElementById('profileLink'),
    podiumGas: document.getElementById('podiumGas'),
    podiumJc: document.getElementById('podiumJc'),
    podiumLevel: document.getElementById('podiumLevel'),
    modal: document.getElementById('userDetailModal'),
    modalClose: document.getElementById('userModalClose'),
    mAvatar: document.getElementById('userModalAvatar'),
    mName: document.getElementById('userModalName'),
    mLevel: document.getElementById('userModalLevel'),
    mJc: document.getElementById('userModalJc'),
    mGas: document.getElementById('userModalGas'),
    mProfileLink: document.getElementById('userModalProfileLink')
  };

  const PAGE_SIZE = 25;
  const pages = []; // array of result arrays for client-side prev navigation
  let currentPageIndex = -1;
  let lastDocSnap = null; // Firestore cursor for next

  const metricMap = {
    jCoins: { baseField: 'jCoins', daily: 'jcDaily', weekly: 'jcWeekly', monthly: 'jcMonthly', label: 'JCoins', icon: 'fa-coins' },
    level:  { baseField: 'level',  daily: null,      weekly: null,       monthly: null,       label: 'Level',  icon: 'fa-signal' },
    xp:     { baseField: 'gas',    daily: 'xpDaily', weekly: 'xpWeekly', monthly: 'xpMonthly',label: 'XP',     icon: 'fa-bolt' }
  };

  function parseParams(){
    const u = new URL(location.href);
    const metric = u.searchParams.get('metric') || 'jCoins';
    const tf = (u.searchParams.get('tf') || 'all');
    const q = (u.searchParams.get('q') || '').trim();
    if (els.metric) els.metric.value = metricMap[metric] ? metric : 'jCoins';
    if (els.tf) els.tf.value = ['all','daily','weekly','monthly'].includes(tf) ? tf : 'all';
    if (els.search) els.search.value = q;
  }
  function syncParams(){
    const u = new URL(location.href);
    u.searchParams.set('metric', els.metric.value);
    u.searchParams.set('tf', els.tf.value);
    const q = (els.search.value||'').trim();
    if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
    history.replaceState(null, '', u.toString());
  }

  function getActiveField(){
    const m = els.metric.value;
    const tf = els.tf.value;
    const mm = metricMap[m] || metricMap.jCoins;
    if (tf === 'all' || !mm[tf]) return mm.baseField; // level only supports all
    return mm[tf];
  }

  function show(el){ if(el) el.style.display='block'; }
  function hide(el){ if(el) el.style.display='none'; }
  function clearList(){ if(els.list){ els.list.innerHTML=''; } }

  async function openUserDetails(userId, seed){
    try{
      const col = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      let data = seed || null;
      if (!data){
        const snap = await getDocs(query(col, orderBy('userId'))); // fallback to get list if direct getDoc path is unknown
        const found = [];
        snap.forEach(d=>{ if(d.id===userId || (d.data()&&d.data().userId===userId)) found.push({id:d.id, ...d.data()}); });
        data = found[0] || null;
      }
      if (!data){ return; }
      els.mName.textContent = data.username || ('User_'+String(userId).slice(0,6));
      els.mLevel.textContent = `Level ${Number(data.level||0)}`;
      els.mJc.textContent = Number(data.jCoins||0).toLocaleString();
      els.mGas.textContent = Number(data.gas||0).toLocaleString();
      els.mProfileLink.href = `profile.html?userId=${encodeURIComponent(userId)}`;
      const pic = data.profilePicId || null;
      els.mAvatar.src = pic ? getCloudinaryImageUrl(pic, 'w_220,h_220,c_fill,g_face,r_max') : 'assets/User.png';
      els.modal.classList.add('show'); els.modal.setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
    }catch(_){ }
  }

  function closeUserDetails(){ try{ els.modal.classList.remove('show'); els.modal.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }catch(_){ }}

  function renderRows(items){
    clearList();
    if (!items || items.length===0){ show(els.empty); return; }
    hide(els.empty);
    const m = els.metric.value; const field = getActiveField();
    items.forEach((it, idx)=>{
      const rank = (currentPageIndex*PAGE_SIZE) + idx + 1;
      const username = it.username || ('User_'+(it.userId||'').slice(0,6));
      const value = it[field] ?? it[metricMap[m].baseField] ?? 0;
      const level = it.level ?? null;
      const profilePicId = it.profilePicId || null;
      const isMe = (auth.currentUser && it.userId && auth.currentUser.uid === it.userId);

      const row = document.createElement('div');
      row.className = 'row' + (isMe ? ' highlight' : '');
      row.setAttribute('role','listitem');

      const rankEl = document.createElement('div');
      rankEl.className = 'rank-badge';
      rankEl.textContent = String(rank);

      const userCell = document.createElement('div');
      userCell.className = 'user-cell';
      const avatar = document.createElement('div'); avatar.className='avatar';
      const img = document.createElement('img');
      img.alt = username;
      if (profilePicId){ img.src = getCloudinaryImageUrl(profilePicId, 'w_120,h_120,c_fill,g_face,r_max'); }
      else { img.src = 'assets/User.png'; }
      avatar.appendChild(img);
      const nameWrap = document.createElement('div');
      const nameEl = document.createElement('div'); nameEl.className='name'; nameEl.textContent = username;
      const metaEl = document.createElement('div'); metaEl.className='meta'; metaEl.textContent = (level?`Level ${level}`:'');
      nameWrap.appendChild(nameEl); nameWrap.appendChild(metaEl);
      userCell.appendChild(avatar); userCell.appendChild(nameWrap);

      const val = document.createElement('div');
      val.className = 'value-badge';
      const i = document.createElement('i'); i.className = `fas ${metricMap[m].icon}`; i.setAttribute('aria-hidden','true');
      const span = document.createElement('span'); span.textContent = (typeof value === 'number') ? value.toLocaleString() : String(value);
      val.appendChild(i); val.appendChild(span);

      row.appendChild(rankEl); row.appendChild(userCell); row.appendChild(val);
      // Make row clickable for details
      row.setAttribute('tabindex','0'); row.setAttribute('role','button');
      row.addEventListener('click', ()=> openUserDetails(it.userId, it));
      row.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openUserDetails(it.userId, it); }});
      els.list.appendChild(row);
    });
  }

  function setLoading(on){ if(on){ hide(els.empty); hide(els.error); show(els.loading); } else { hide(els.loading); } }

  async function fetchTopThree(field){
    try{
      const col = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const qy = query(col, orderBy(field, 'desc'), limit(3));
      const snap = await getDocs(qy);
      const list = [];
      snap.forEach(d=>{ const v=d.data()||{}; v.userId=v.userId||d.id; list.push(v); });
      return list;
    }catch(e){ console.warn('fetchTopThree', field, e); return []; }
  }

  function renderPodium(container, items, field, icon){
    try{
      if (!container) return;
      container.innerHTML = '';
      const top = items.slice(0,3);
      top.forEach((it, i)=>{
        const username = it.username || ('User_'+(it.userId||'').slice(0,6));
        const profilePicId = it.profilePicId || null;
        const value = it[field] ?? 0;
        const item = document.createElement('div'); item.className='podium-item'; item.setAttribute('role','listitem');
        const r = document.createElement('div'); r.className='podium-rank'; r.textContent=String(i+1);
        const user = document.createElement('div'); user.className='podium-user';
        const av = document.createElement('div'); av.className='podium-avatar'; const img=document.createElement('img'); img.alt=username; img.src = profilePicId ? getCloudinaryImageUrl(profilePicId,'w_120,h_120,c_fill,g_face,r_max') : 'assets/User.png'; av.appendChild(img);
        const nm = document.createElement('div'); nm.className='podium-name'; nm.textContent=username;
        user.appendChild(av); user.appendChild(nm);
        const val = document.createElement('div'); val.className='podium-value'; const ic=document.createElement('i'); ic.className=`fas ${icon}`; ic.setAttribute('aria-hidden','true'); const sp=document.createElement('span'); sp.textContent=(typeof value==='number'? value.toLocaleString(): String(value)); val.appendChild(ic); val.appendChild(sp);
        item.appendChild(r); item.appendChild(user); item.appendChild(val);
        item.setAttribute('tabindex','0'); item.setAttribute('role','button');
        item.addEventListener('click', ()=> openUserDetails(it.userId, it));
        item.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openUserDetails(it.userId, it); }});
        container.appendChild(item);
      });
      if (!top.length){ const none=document.createElement('div'); none.className='meta'; none.textContent='No data'; container.appendChild(none); }
    }catch(_){ }
  }

  async function loadPodium(){
    const [gasTop, jcTop, lvlTop] = await Promise.all([
      fetchTopThree('gas'),
      fetchTopThree('jCoins'),
      fetchTopThree('level')
    ]);
    renderPodium(els.podiumGas, gasTop, 'gas', 'fa-bolt');
    renderPodium(els.podiumJc, jcTop, 'jCoins', 'fa-coins');
    renderPodium(els.podiumLevel, lvlTop, 'level', 'fa-signal');
  }

  async function fetchPage(reset=false){
    try{
      setLoading(true);
      if(reset){ pages.length = 0; currentPageIndex = -1; lastDocSnap = null; clearList(); }
      const field = getActiveField();
      let col = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      // Order by selected metric desc; Firestore requires the field to exist or treat missing as null (placed first). We'll still use desc.
      const q = query(col, orderBy(field, 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(lastDocSnap ? q.startAfter ? q.startAfter(lastDocSnap) : q : q);
      const items = [];
      snap.forEach(d=>{ const v = d.data()||{}; v.userId = v.userId || d.id; items.push(v); });

      // Client-side search filter (username contains)
      const qStr = (els.search.value||'').trim().toLowerCase();
      let filtered = items;
      if (qStr){ filtered = items.filter(it => (it.username||'').toLowerCase().includes(qStr)); }

      pages.push(filtered);
      currentPageIndex = pages.length - 1;
      lastDocSnap = snap.docs.length ? snap.docs[snap.docs.length-1] : lastDocSnap;

      renderRows(filtered);
      setLoading(false);
      updatePagerButtons(snap.docs.length);
    }catch(e){ console.error('leaderboard fetch error', e); setLoading(false); hide(els.empty); show(els.error); }
  }

  function updatePagerButtons(count){
    if (els.prev) els.prev.disabled = currentPageIndex <= 0;
    if (els.next) els.next.disabled = !lastDocSnap || (typeof count === 'number' && count < PAGE_SIZE);
  }

  function onControlsChanged(){ syncParams(); // timeframe cannot apply to level except 'all'
    if (els.metric.value === 'level') els.tf.value = 'all';
    // reset and fetch anew
    fetchPage(true);
  }

  function bindControls(){
    els.metric?.addEventListener('change', onControlsChanged);
    els.tf?.addEventListener('change', onControlsChanged);
    let t=null; els.search?.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>{ onControlsChanged(); }, 240); });
    els.next?.addEventListener('click', ()=>{ fetchPage(false); });
    els.prev?.addEventListener('click', ()=>{ if(currentPageIndex>0){ currentPageIndex--; renderRows(pages[currentPageIndex]); updatePagerButtons(PAGE_SIZE); } });
  }

  function initHeaderUI(user){
    try{
      // Minimal header avatar and link if signed in
      if (user){
        const usernameInitial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
        if (els.profileLink) els.profileLink.href = `profile.html?userId=${user.uid}`;
        if (els.headerPic && els.headerIcon){
          if (user.photoURL){
            els.headerPic.src = getCloudinaryImageUrl(user.photoURL, 'w_70,h_70,c_fill,g_face,r_max');
            els.headerPic.style.display='block'; els.headerIcon.style.display='none';
          } else {
            els.headerPic.src = 'assets/User.png';
            els.headerPic.style.display='block'; els.headerIcon.style.display='none';
          }
        }
      }
    }catch(_){}
  }

  function boot(){
    // modal bindings
    els.modalClose?.addEventListener('click', closeUserDetails);
    els.modal?.addEventListener('click', (e)=>{ if(e.target===els.modal) closeUserDetails(); });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && els.modal?.classList.contains('show')) closeUserDetails(); });
    parseParams();
    bindControls();
    // Start auth; anonymous sign-in helps if Firestore requires auth for reads
    onAuthStateChanged(auth, async (user)=>{
      if (!user){ try{ await signInAnonymously(auth); }catch(_){ /* ignore */ } }
      initHeaderUI(user || auth.currentUser || null);
      loadPodium();
      fetchPage(true);
    });
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot, { once:true }); }
  else { boot(); }
})();
