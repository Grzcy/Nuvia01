import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, getDocs, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const appId = 'jchat_1_0_0';
let realtimeUnsub = null;
let pollIntervalId = null;
let currentUserUid = null;

function escapeHtml(s){ return String(s||'').replace(/[&<>\"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c)); }

function createNotificationOverlay(callId, callData){
  try{
    const existing = document.getElementById('globalCallNotification'); if(existing) existing.remove();
    const overlay = document.createElement('div'); overlay.id = 'globalCallNotification';
    overlay.innerHTML = `
      <div class="global-call-notification">
        <div class="call-notification-content">
          <div class="caller-info">
            <div class="caller-avatar"><i class="fas fa-user-circle"></i></div>
            <div class="caller-details"><h3>${escapeHtml(callData.callerUsername||'Caller')}</h3><p>Incoming ${escapeHtml(callData.video? 'video':'voice')} call</p></div>
          </div>
          <div class="call-notification-actions">
            <button class="decline-call-btn" id="globalDeclineBtn"><i class="fas fa-phone-slash"></i></button>
            <button class="answer-call-btn" id="globalAnswerBtn"><i class="fas fa-phone"></i></button>
          </div>
        </div>
      </div>
    `;

    const styles = `
      <style id="globalCallNotificationStyles">#globalCallNotification{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:9999;backdrop-filter:blur(5px)}.global-call-notification{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:30px;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.5);text-align:center;min-width:300px;border:1px solid rgba(255,255,255,0.1)}.caller-avatar{font-size:4rem;color:#00d5ff;margin-bottom:15px}.caller-details h3{color:white;margin:0 0 10px 0;font-size:1.25rem}.caller-details p{color:#b0b0b0;margin:0}.call-notification-actions{display:flex;justify-content:center;gap:30px;margin-top:20px}.call-notification-actions button{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;font-size:1.2rem;color:white}.decline-call-btn{background:linear-gradient(135deg,#ff4757,#ff3838)}.answer-call-btn{background:linear-gradient(135deg,#2ed573,#1dd1a1);animation:pulse 2s infinite}@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(46,213,115,0.7)}70%{box-shadow:0 0 0 10px rgba(46,213,115,0)}100%{box-shadow:0 0 0 0 rgba(46,213,115,0)}}</style>`;

    const tmp = document.createElement('div'); tmp.innerHTML = styles; document.head.appendChild(tmp.firstElementChild);
    document.body.appendChild(overlay);

    const btnA = document.getElementById('globalAnswerBtn');
    const btnD = document.getElementById('globalDeclineBtn');
    if(btnA) btnA.addEventListener('click', () => { answerGlobalCall(callData.callerId); removeOverlay(); });
    if(btnD) btnD.addEventListener('click', () => { declineGlobalCall(callId).catch(()=>{}); removeOverlay(); });

    // Auto-decline after 30s
    setTimeout(()=>{ if(document.getElementById('globalCallNotification')){ declineGlobalCall(callId).catch(()=>{}); removeOverlay(); }}, 30000);
  }catch(e){ console.error('JCHAT_ERROR createNotificationOverlay', e); }
}

function removeOverlay(){ try{ const el=document.getElementById('globalCallNotification'); if(el) el.remove(); const s=document.getElementById('globalCallNotificationStyles'); if(s) s.remove(); }catch(e){}
}

function playRingtone(){ try{ const audio = new Audio(); audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqF'; audio.loop = true; audio.volume = 0.35; audio.play().catch(()=>{}); setTimeout(()=>{ try{ audio.pause(); }catch(e){} }, 20000);}catch(e){}}

async function answerGlobalCall(callerId){ try{ window.location.href = `/chat.html?partnerId=${encodeURIComponent(callerId)}`; }catch(e){ console.error('JCHAT_ERROR answerGlobalCall', e); } }

async function declineGlobalCall(callId){ try{ const db = getFirestore(); const callDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId); await updateDoc(callDocRef, { status: 'declined', endedAt: serverTimestamp() }); removeOverlay(); }catch(e){ console.error('JCHAT_ERROR declineGlobalCall', e); } }

function clearRealtime(){ try{ if(realtimeUnsub){ realtimeUnsub(); realtimeUnsub = null; } }catch(e){} }
function clearPoll(){ try{ if(pollIntervalId){ clearInterval(pollIntervalId); pollIntervalId = null; } }catch(e){}

async function pollForCalls(uid){ try{
  const db = getFirestore();
  const callsCol = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
  const q = query(callsCol, where('calleeId','==',uid), where('status','==','ringing'));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    const data = docSnap.data();
    createNotificationOverlay(docSnap.id, data);
    try{ playRingtone(); }catch(_){}
  });
} catch(e){ console.error('JCHAT_ERROR pollForCalls', e); } }

function setupRealtimeThenPollFallback(uid){
  try{
    const db = getFirestore();
    const callsCol = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
    const q = query(callsCol, where('calleeId','==',uid), where('status','==','ringing'));

    let sawEvent = false;
    try{
      realtimeUnsub = onSnapshot(q, (snap) => {
        if(!snap.empty) {
          snap.docChanges().forEach(change => {
            if(change.type === 'added'){
              const data = change.doc.data();
              createNotificationOverlay(change.doc.id, data);
              try{ playRingtone(); }catch(_){}
            }
          });
        }
        sawEvent = true;
        // clear polling if active
        if(pollIntervalId){ clearInterval(pollIntervalId); pollIntervalId = null; }
      }, (err) => {
        console.warn('JCHAT_WARN realtime onSnapshot failed, falling back to polling', err);
        clearRealtime();
        if(!pollIntervalId){ pollIntervalId = setInterval(()=>pollForCalls(uid), 2500); }
      });

      // After 3s, if no real-time event seen, start polling as fallback
      setTimeout(()=>{
        if(!sawEvent && !pollIntervalId){ pollIntervalId = setInterval(()=>pollForCalls(uid), 2500); }
      }, 3000);

    }catch(e){ console.warn('JCHAT_WARN realtime setup failed, starting poll', e); if(!pollIntervalId){ pollIntervalId = setInterval(()=>pollForCalls(uid), 2500); } }

  }catch(e){ console.error('JCHAT_ERROR setupRealtimeThenPollFallback', e); }
}

function cleanupAll(){ try{ clearRealtime(); clearPoll(); removeOverlay(); }catch(e){}
}

// Initialize listener on auth
(function init(){
  try{
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

    // Also stop listeners on page unload
    window.addEventListener('beforeunload', cleanupAll);
  }catch(e){ console.error('JCHAT_ERROR init global call service', e); }
})();

// Expose for debugging
window.answerGlobalCall = answerGlobalCall;
window.declineGlobalCall = declineGlobalCall;