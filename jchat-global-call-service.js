import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const appId = 'jchat_1_0_0';
let globalUnsub = null;
let currentUserUid = null;

function createNotificationOverlay(callId, callData) {
  const existing = document.getElementById('globalCallNotification');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'globalCallNotification';
  overlay.innerHTML = `
    <div class="global-call-notification">
      <div class="call-notification-content">
        <div class="caller-info">
          <div class="caller-avatar"><i class="fas fa-user-circle"></i></div>
          <div class="caller-details"><h3>${escapeHtml(callData.callerUsername || 'Caller')}</h3><p>Incoming ${escapeHtml(callData.video ? 'video' : 'voice')} call</p></div>
        </div>
        <div class="call-notification-actions">
          <button class="decline-call-btn" id="globalDeclineBtn"><i class="fas fa-phone-slash"></i></button>
          <button class="answer-call-btn" id="globalAnswerBtn"><i class="fas fa-phone"></i></button>
        </div>
      </div>
    </div>
  `;

  const styles = `
    <style id="globalCallNotificationStyles">
      #globalCallNotification{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:9999;backdrop-filter:blur(5px)}
      .global-call-notification{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:30px;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.5);text-align:center;min-width:300px;border:1px solid rgba(255,255,255,0.1)}
      .caller-avatar{font-size:4rem;color:#00d5ff;margin-bottom:15px}
      .caller-details h3{color:white;margin:0 0 10px 0;font-size:1.25rem}
      .caller-details p{color:#b0b0b0;margin:0}
      .call-notification-actions{display:flex;justify-content:center;gap:30px;margin-top:20px}
      .call-notification-actions button{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;font-size:1.2rem;color:white}
      .decline-call-btn{background:linear-gradient(135deg,#ff4757,#ff3838)}
      .answer-call-btn{background:linear-gradient(135deg,#2ed573,#1dd1a1);animation:pulse 2s infinite}
      @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(46,213,115,0.7)}70%{box-shadow:0 0 0 10px rgba(46,213,115,0)}100%{box-shadow:0 0 0 0 rgba(46,213,115,0)}}
    </style>
  `;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = styles;
  document.head.appendChild(wrapper.firstElementChild);
  document.body.appendChild(overlay);

  const btnA = document.getElementById('globalAnswerBtn');
  const btnD = document.getElementById('globalDeclineBtn');
  if (btnA) btnA.addEventListener('click', () => { answerGlobalCall(callData.callerId); removeOverlay(); });
  if (btnD) btnD.addEventListener('click', () => { declineGlobalCall(callId).catch(()=>{}); removeOverlay(); });

  // Auto-decline after 30s
  setTimeout(() => { if (document.getElementById('globalCallNotification')) { declineGlobalCall(callId).catch(()=>{}); removeOverlay(); } }, 30000);
}

function removeOverlay(){ try{ const el=document.getElementById('globalCallNotification'); if(el) el.remove(); const s=document.getElementById('globalCallNotificationStyles'); if(s) s.remove(); }catch(e){}
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c)); }

function playRingtone(){ try{ const audio = new Audio(); audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqF'; audio.loop = true; audio.volume = 0.35; audio.play().catch(()=>{}); setTimeout(()=>{ try{ audio.pause(); }catch(e){} }, 20000); }catch(e){}
}

async function answerGlobalCall(callerId){ try{ // focus redirect to chat page
  window.location.href = `/chat.html?partnerId=${encodeURIComponent(callerId)}`;
}catch(e){ console.error('JCHAT_ERROR answerGlobalCall', e);} }

async function declineGlobalCall(callId){
  try{
    const db = getFirestore();
    const callDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId);
    await updateDoc(callDocRef, { status: 'declined', endedAt: serverTimestamp() });
    removeOverlay();
  }catch(e){ console.error('JCHAT_ERROR declineGlobalCall', e); }
}

function setupListenerFor(uid){
  try{
    const db = getFirestore();
    const callsCol = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
    const q = query(callsCol, where('calleeId', '==', uid), where('status', '==', 'ringing'));
    globalUnsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          createNotificationOverlay(change.doc.id, data);
          try{ playRingtone(); }catch(_){}
        }
      });
    }, (err) => { console.error('JCHAT_ERROR global call onSnapshot', err); });
  } catch (e) { console.error('JCHAT_ERROR setupListenerFor', e); }
}

function cleanupListener(){ try{ if (globalUnsub) { globalUnsub(); globalUnsub = null; } removeOverlay(); }catch(e){}
}

// Initialize
(function init(){
  try{
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
      if (user && user.uid) {
        currentUserUid = user.uid;
        setupListenerFor(user.uid);
      } else {
        cleanupListener();
        currentUserUid = null;
      }
    });
  }catch(e){ console.error('JCHAT_ERROR init global call service', e); }
})();

// Expose for debugging
window.answerGlobalCall = answerGlobalCall;
window.declineGlobalCall = declineGlobalCall;
