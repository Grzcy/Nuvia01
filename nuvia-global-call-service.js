import { getFirestore, collection, query, where, onSnapshot, getDocs, getDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";

const appId = (typeof globalThis !== 'undefined' && typeof globalThis.__app_id !== 'undefined') ? globalThis.__app_id : (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id');
let realtimeUnsub = null;
let pollIntervalId = null;
let currentUserUid = null;

function escapeHtml(s){ return String(s||'').replace(/[&<>\"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c)); }

function createNotificationOverlay(callId, callData){
  try{
    const existing = document.getElementById('globalCallNotification'); if(existing) existing.remove();
    const overlay = document.createElement('div'); overlay.id = 'globalCallNotification';
    const isVideo = (callData && (callData.callType === 'video' || callData.video === true));
    const callerName = callData && (callData.callerUsername || callData.callerDisplayName || callData.callerName) || 'Caller';
    overlay.innerHTML = `
      <div class="global-call-notification">
        <div class="call-notification-content">
          <div class="caller-info">
            <div class="caller-avatar"><img id="globalCallerAvatar" alt="Caller"/></div>
            <div class="caller-details"><h3 id="globalCallerName">${escapeHtml(callerName)}</h3><p>Incoming ${isVideo ? 'video' : 'voice'} call</p></div>
          </div>
          <div class="call-notification-actions">
            <button class="decline-call-btn" id="globalDeclineBtn" aria-label="Decline"><i class="fas fa-phone-slash"></i></button>
            <button class="answer-call-btn" id="globalAnswerBtn" aria-label="Answer"><i class="fas fa-phone"></i></button>
          </div>
        </div>
      </div>
    `;

    const styles = `
      <style id="globalCallNotificationStyles">#globalCallNotification{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:9999;backdrop-filter:blur(5px)}.global-call-notification{background:var(--header-background,linear-gradient(135deg,#1a1a2e,#16213e));padding:24px;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.5);text-align:center;min-width:300px;border:1px solid var(--border-light,rgba(255,255,255,0.1))}.caller-avatar{width:84px;height:84px;border-radius:50%;overflow:hidden;margin:0 auto 12px auto;border:2px solid var(--border-light,rgba(255,255,255,0.2))}.caller-avatar img{width:100%;height:100%;object-fit:cover;display:block}.caller-details h3{color:var(--white,#fff);margin:0 0 6px 0;font-size:1.2rem}.caller-details p{color:var(--text-light,#b0b0b0);margin:0}.call-notification-actions{display:flex;justify-content:center;gap:24px;margin-top:16px}.call-notification-actions button{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;font-size:1.1rem;color:#fff}.decline-call-btn{background:linear-gradient(135deg,#ff4757,#ff3838)}.answer-call-btn{background:linear-gradient(135deg,#2ed573,#1dd1a1);animation:pulse 2s infinite}@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(46,213,115,0.7)}70%{box-shadow:0 0 0 10px rgba(46,213,115,0)}100%{box-shadow:0 0 0 0 rgba(46,213,115,0)}}</style>`;

    const tmp = document.createElement('div'); tmp.innerHTML = styles; document.head.appendChild(tmp.firstElementChild);
    document.body.appendChild(overlay);

    const btnA = document.getElementById('globalAnswerBtn');
    const btnD = document.getElementById('globalDeclineBtn');
    if(btnA) btnA.addEventListener('click', () => { answerGlobalCall(callData.callerId); removeOverlay(); });
    if(btnD) btnD.addEventListener('click', () => { declineGlobalCall(callId).catch(()=>{}); removeOverlay(); });

    // Resolve caller display name and avatar
    try{
      const db = getFirestore();
      const uid = callData && callData.callerId;
      if (uid) {
        const nameEl = overlay.querySelector('#globalCallerName');
        const avatarImg = overlay.querySelector('#globalCallerAvatar');
        getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', uid)).then(s=>{
          const d = s.exists()? s.data(): null;
          const name = d && (d.username || d.displayName);
          if (name && nameEl) nameEl.textContent = String(name);
        }).catch(()=>{});
        getDoc(doc(db, 'artifacts', appId, 'users', uid, 'profiles', 'user_profile')).then(s=>{
          const d = s.exists()? s.data(): null;
          const pic = d && (d.profilePicId || d.photoURL || null);
          const name = (d && (d.displayName || d.username)) || callerName || 'User';
          const initial = String(name).charAt(0).toUpperCase();
          const url = pic ? cloudinaryUrl(pic, 'w_84,h_84,c_fill,g_face,r_max') : `https://placehold.co/84x84/00d5ff/ffffff?text=${initial}`;
          if (avatarImg){ avatarImg.src = url; avatarImg.onerror = ()=>{ avatarImg.src = `https://placehold.co/84x84/00d5ff/ffffff?text=${initial}`; }; }
        }).catch(()=>{});
      }
    }catch(_){ }

    // Browser notification when hidden
    try{ if (document.hidden && window.Notification && Notification.permission === 'granted'){ const isVid = (callData && (callData.callType === 'video' || callData.video === true)); new Notification(isVid ? 'Incoming video call' : 'Incoming voice call', { body: callerName ? `From ${callerName}` : 'Incoming call' }); } }catch(_){ }
    setTimeout(()=>{ if(document.getElementById('globalCallNotification')){ declineGlobalCall(callId).catch(()=>{}); removeOverlay(); }}, 30000);
  }catch(e){ console.error('NUVIA_ERROR createNotificationOverlay', e); }
}

function removeOverlay(){ try{ const el=document.getElementById('globalCallNotification'); if(el) el.remove(); const s=document.getElementById('globalCallNotificationStyles'); if(s) s.remove(); }catch(e){}
}

function playRingtone(){ try{ const audio = new Audio('https://cdn.builder.io/o/assets%2Fc5542eb63b564e86810556e73a332186%2Ffa802bcb41594c9fb0a35733e90d7cee?alt=media&token=adb505bd-f77f-4840-a50b-b13c040e0dca&apiKey=c5542eb63b564e86810556e73a332186'); audio.loop = true; audio.volume = 0.35; audio.play().catch(()=>{}); setTimeout(()=>{ try{ audio.pause(); }catch(e){} }, 20000);}catch(e){} }

async function answerGlobalCall(callerId){ try{ if(!callerId) return; window.location.href = `/chat.html?partnerId=${encodeURIComponent(callerId)}`; }catch(e){ console.error('NUVIA_ERROR answerGlobalCall', e); } }

async function declineGlobalCall(callId){ try{ const db = getFirestore(); const callDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId); await updateDoc(callDocRef, { status: 'declined', endedAt: serverTimestamp() }); removeOverlay(); }catch(e){ console.error('NUVIA_ERROR declineGlobalCall', e); } }

function clearRealtime(){ try{ if(realtimeUnsub){ realtimeUnsub(); realtimeUnsub = null; } }catch(e){} }
function clearPoll(){ try{ if(pollIntervalId){ clearInterval(pollIntervalId); pollIntervalId = null; } }catch(e){} }

async function pollForCalls(uid){ try{
  const db = getFirestore();
  const callsCol = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
  const q = query(callsCol, where('receiverId','==',uid), where('status','==','ringing'));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    const data = docSnap.data();
    createNotificationOverlay(docSnap.id, data);
    try{ playRingtone(); }catch(_){ }
  });
} catch(e){ console.error('NUVIA_ERROR pollForCalls', e); } }

function setupRealtimeThenPollFallback(uid){
  try{
    const db = getFirestore();
    const callsCol = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
    const q = query(callsCol, where('receiverId','==',uid), where('status','==','ringing'));

    let sawEvent = false;
    try{
      realtimeUnsub = onSnapshot(q, (snap) => {
        if(!snap.empty) {
          snap.docChanges().forEach(change => {
            if(change.type === 'added'){
              const data = change.doc.data();
              createNotificationOverlay(change.doc.id, data);
              try{ playRingtone(); }catch(_){ }
            }
          });
        }
        sawEvent = true;
        if(pollIntervalId){ clearInterval(pollIntervalId); pollIntervalId = null; }
      }, (err) => {
        console.warn('NUVIA_WARN realtime onSnapshot failed, falling back to polling', err);
        clearRealtime();
        if(!pollIntervalId){ pollIntervalId = setInterval(()=>pollForCalls(uid), 2500); }
      });

      setTimeout(()=>{
        if(!sawEvent && !pollIntervalId){ pollIntervalId = setInterval(()=>pollForCalls(uid), 2500); }
      }, 3000);

    }catch(e){ console.warn('NUVIA_WARN realtime setup failed, starting poll', e); if(!pollIntervalId){ pollIntervalId = setInterval(()=>pollForCalls(uid), 2500); } }

  }catch(e){ console.error('NUVIA_ERROR setupRealtimeThenPollFallback', e); }

  try{
    const dbBackup = getFirestore();
    const callsColBackup = collection(dbBackup, 'artifacts', appId, 'public', 'data', 'calls');
    const qBackup = query(callsColBackup, where('receiverId','==',uid), where('status','==','ringing'));
    onSnapshot(qBackup, async (snap) => {
      if (!snap.empty) {
        for (const change of snap.docChanges()) {
          if (change.type === 'added') {
            const data = change.doc.data();
            try {
              const presRef = doc(dbBackup, 'artifacts', appId, 'public', 'data', 'users', data.receiverId || uid);
              const presSnap = await getDoc(presRef);
              const pres = presSnap.exists() ? presSnap.data() : null;
              const isOnline = pres ? Boolean(pres.online) : navigator.onLine !== false;
              if (isOnline) {
                createNotificationOverlay(change.doc.id, data);
                try{ playRingtone(); }catch(_){ }
              }
            } catch (e) {
              console.error('NUVIA_ERROR backup listener', e);
              createNotificationOverlay(change.doc.id, data);
              try{ playRingtone(); }catch(_){ }
            }
          }
        }
      }
    });
  }catch(e){}
}

function cleanupAll(){ try{ clearRealtime(); clearPoll(); removeOverlay(); }catch(e){}
}

function cloudinaryUrl(id, t){ try{ if(!id) return null; if(String(id).startsWith('http')){ if(id.includes('res.cloudinary.com')){ const parts = String(id).split('/upload/'); if(parts.length===2) return `${parts[0]}/upload/${t}/${parts[1]}`; } return id; } return `https://res.cloudinary.com/dxld01rcp/image/upload/${t}/${id}`; }catch(_){ return null; }
}

try{ if (window.Notification && Notification.permission === 'default'){ Notification.requestPermission().catch(()=>{}); } }catch(_){ }

(function init(){
  try{
    if ((typeof window !== 'undefined') && (window.__nuviaHasCallUI || document.getElementById('callOverlay'))){ try{ console.log('NUVIA global call service: call UI present, skipping service init'); }catch(_){ } return; }
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
      if(user && user.uid){
        currentUserUid = user.uid;
        cleanupAll();
        setupRealtimeThenPollFallback(user.uid);
      } else {
        currentUserUid = null;
        cleanupAll();
      }
    });

    window.addEventListener('beforeunload', cleanupAll);
  }catch(e){ console.error('NUVIA_ERROR init global call service', e); }
})();

window.answerGlobalCall = answerGlobalCall;
window.declineGlobalCall = declineGlobalCall;
