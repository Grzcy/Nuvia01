// Global incoming call receiver (for Profile, Groups, etc.)
// Listens for Firestore call offers to the current user and shows an accept/decline UI with ringtone

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";

const firebaseConfig = typeof window.__firebase_config !== 'undefined' ? JSON.parse(window.__firebase_config) : {
  apiKey: "AIzaSyDz-8N0totzvMCvonF9pKj9RsoH3J8xL0w",
  authDomain: "jchat-1.firebaseapp.com",
  databaseURL: "https://jchat-1-default-rtdb.firebaseio.com",
  projectId: "jchat-1",
  storageBucket: "jchat-1.firebasestorage.app",
  appId: "1:328479683167:web:276c0b7e8ea44dd2d6a1ea",
  measurementId: "G-S6Z9GG0R9P"
};
const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'default-app-id';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Audio
const receiverToneUrl = "https://cdn.builder.io/o/assets%2Ff4f3997cc4554f07ac7fa298873cc5c0%2F24960e4017a64aa09db615c269e434cf?alt=media&token=24fed996-554d-4e2f-b37f-a4ae094ddb41&apiKey=f4f3997cc4554f07ac7fa298873cc5c0";
let receiverRingtone = (()=>{ try{ const a=new Audio(receiverToneUrl); a.loop=true; a.volume=0.35; return a; }catch(_){ return null; } })();

// UI state
let currentUser = null;
let activeCallRef = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallType = null; // 'voice' | 'video'
let callState = 'idle'; // idle|ringing|connected
let callDuration = 0;
let callDurationInterval = null;

// Overlay elements (created on demand when page lacks chat overlay)
let overlay, statusIcon, statusText, timerEl, acceptBtn, declineBtn, endBtn, toggleMuteBtn, toggleVideoBtn, localVideo, remoteVideo, pillEl, pillText, avatarEl, nameEl;

function ensureStyles(){
  if (document.getElementById('global-call-overlay-styles')) return;
  const css = `
    #callOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: none; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(6px); }
    #callOverlay.active { display: flex; }
    #callOverlay .content { display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center; background: var(--header-background); border:1px solid var(--border-light); border-radius: 16px; padding: 16px; width: min(92vw, 640px); box-shadow: 0 16px 48px rgba(0,0,0,.45); }
    #callOverlay .call-status-icon { font-size: 4rem; color: var(--white); text-shadow: 0 2px 0 rgba(0,0,0,0.25); }
    #callOverlay .call-status-text { font-size: 1.25rem; color: var(--white); margin: 0; }
    #callOverlay .call-timer { font-size: 1rem; color: var(--text-light); margin: 0; }
    #callOverlay .call-actions { display:flex; gap:12px; }
    #callOverlay .call-actions button { width: 56px; height: 56px; border-radius: 50%; border: none; color: #fff; cursor: pointer; display:flex; align-items:center; justify-content:center; font-size: 1.1rem; }
    #callOverlay .accept-call-btn { background: linear-gradient(135deg,#2ed573,#1dd1a1); }
    #callOverlay .decline-call-btn, #callOverlay .end-call-btn { background: linear-gradient(135deg,#ff4757,#ff3838); }
    #callOverlay .toggle-mute-btn, #callOverlay .toggle-video-btn { background: rgba(255,255,255,0.2); }
    #callOverlay .toggle-mute-btn.active, #callOverlay .toggle-video-btn.active { background: rgba(255,255,255,0.35); }
    #callOverlay .video-streams { position: relative; width: 100%; max-width: 640px; border-radius: 12px; overflow: hidden; background: #000; }
    #callOverlay .video-streams video { width: 100%; display: none; background: #000; }
    #callOverlay .video-streams #localVideo { position: absolute; right: 10px; bottom: 10px; width: 120px; height: 80px; border-radius: 8px; border: 2px solid var(--border-light); object-fit: cover; }
    #callOverlay.voice-call .video-streams { display: none; }
    #callOverlay .call-header { display:flex; align-items:center; gap:12px; width:100%; padding: 4px 4px 0; }
    #callOverlay .call-avatar { position: relative; width: 72px; height: 72px; border-radius: 50%; overflow: hidden; flex: 0 0 auto; }
    #callOverlay .call-avatar::before { content:""; position:absolute; inset:-2px; border-radius:inherit; padding:2px; background: linear-gradient(135deg, var(--blue), var(--pink)); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; opacity:.8; }
    #callOverlay .call-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
    #callOverlay .call-partner-meta { display:flex; flex-direction:column; gap:6px; min-width:0; }
    #callOverlay .call-partner-name { font-family:'Poppins',sans-serif; font-weight:800; font-size:1.1rem; color: var(--white); letter-spacing:-0.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #callOverlay .call-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; font-size:.8rem; border:1px solid var(--border-light); background: rgba(255,255,255,0.06); color: var(--white); }
    #callOverlay .call-pill.ringing { box-shadow: 0 0 12px rgba(0,213,255,0.25); }
    #callOverlay .call-pill.connected { box-shadow: 0 0 12px rgba(76,175,80,0.25); }
  `;
  const style = document.createElement('style');
  style.id = 'global-call-overlay-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

function ensureOverlay(){
  overlay = document.getElementById('callOverlay');
  if (!overlay){
    ensureStyles();
    overlay = document.createElement('div');
    overlay.id = 'callOverlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.innerHTML = `
      <div class="content">
        <div class="call-header">
          <div class="call-avatar"><img id="callPartnerAvatar" alt="Contact"></div>
          <div class="call-partner-meta"><div id="callPartnerName" class="call-partner-name">Contact</div><span id="callStatusPill" class="call-pill"><span id="callStatusPillText">Calling</span></span></div>
        </div>
        <div class="video-streams"><video id="remoteVideo" playsinline autoplay></video><video id="localVideo" playsinline autoplay muted></video></div>
        <i id="callStatusIcon" class="fas fa-phone call-status-icon" role="img" aria-label="Call Status"></i>
        <p id="callStatusText" class="call-status-text">Calling...</p>
        <p id="callTimer" class="call-timer" style="display:none">00:00</p>
        <div class="call-actions" id="callActions">
          <button id="acceptCallBtn" class="accept-call-btn" style="display:none" aria-label="Accept Call"><i class="fas fa-phone"></i></button>
          <button id="declineCallBtn" class="decline-call-btn" style="display:none" aria-label="Decline Call"><i class="fas fa-phone-slash"></i></button>
          <button id="toggleMuteBtn" class="toggle-mute-btn" style="display:none" title="Mute/Unmute" aria-label="Toggle Mute"><i class="fas fa-microphone"></i></button>
          <button id="toggleVideoBtn" class="toggle-video-btn" style="display:none" title="Video On/Off" aria-label="Toggle Video"><i class="fas fa-video"></i></button>
          <button id="endCallBtn" class="end-call-btn" style="display:none" aria-label="End Call"><i class="fas fa-phone-slash"></i></button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  statusIcon = document.getElementById('callStatusIcon');
  statusText = document.getElementById('callStatusText');
  timerEl = document.getElementById('callTimer');
  acceptBtn = document.getElementById('acceptCallBtn');
  declineBtn = document.getElementById('declineCallBtn');
  endBtn = document.getElementById('endCallBtn');
  toggleMuteBtn = document.getElementById('toggleMuteBtn');
  toggleVideoBtn = document.getElementById('toggleVideoBtn');
  localVideo = document.getElementById('localVideo');
  remoteVideo = document.getElementById('remoteVideo');
  pillEl = document.getElementById('callStatusPill');
  pillText = document.getElementById('callStatusPillText');
  avatarEl = document.getElementById('callPartnerAvatar');
  nameEl = document.getElementById('callPartnerName');
}

function setOverlayKind(kind){
  overlay.classList.remove('voice-call','video-call');
  overlay.classList.add(kind === 'voice' ? 'voice-call' : 'video-call');
}

function openOverlay(kind){ ensureOverlay(); overlay.classList.add('active'); setOverlayKind(kind); }
function closeOverlay(){ if (!overlay) return; overlay.classList.remove('active','voice-call','video-call'); }

function setPill(text, state){ if (pillEl){ pillEl.className = 'call-pill' + (state ? ' '+state : ''); } if (pillText) pillText.textContent = text; }
function resetUi(){
  if (statusIcon) statusIcon.className = 'fas fa-phone call-status-icon';
  if (statusText) statusText.textContent = 'Calling...';
  if (timerEl) timerEl.style.display = 'none';
  if (acceptBtn) acceptBtn.style.display = 'none';
  if (declineBtn) declineBtn.style.display = 'none';
  if (endBtn) endBtn.style.display = 'none';
  if (toggleMuteBtn){ toggleMuteBtn.style.display = 'none'; toggleMuteBtn.classList.remove('active'); toggleMuteBtn.querySelector('i').className = 'fas fa-microphone'; }
  if (toggleVideoBtn){ toggleVideoBtn.style.display = 'none'; toggleVideoBtn.classList.remove('active'); toggleVideoBtn.querySelector('i').className = 'fas fa-video'; }
  if (localVideo){ localVideo.style.display = 'none'; localVideo.srcObject = null; }
  if (remoteVideo){ remoteVideo.style.display = 'none'; remoteVideo.srcObject = null; }
}

function formatTimer(secs){ const m = String(Math.floor(secs/60)).padStart(2,'0'); const s = String(secs%60).padStart(2,'0'); return `${m}:${s}`; }

function notifyIfHidden(title, body, icon){
  try{
    if (!document.hidden) return;
    if (Notification && Notification.permission === 'granted'){ new Notification(title, { body, icon }); }
  }catch(_){ }
}

async function fetchUserProfile(uid){
  try{
    const ref = doc(db, 'artifacts', appId, 'users', uid, 'profiles', 'user_profile');
    const snap = await getDoc(ref);
    if (!snap.exists()) return { displayName: 'JCHAT User', profilePicId: null };
    const d = snap.data();
    return { displayName: d.displayName || d.username || 'JCHAT User', profilePicId: d.profilePicId || null };
  }catch(_){ return { displayName: 'JCHAT User', profilePicId: null }; }
}

function getCloudinaryUrl(id, t){
  if (!id) return null;
  if (id.startsWith('http://') || id.startsWith('https://')){
    if (id.includes('res.cloudinary.com')){
      const parts = id.split('/upload/');
      if (parts.length === 2) return `${parts[0]}/upload/${t}/${parts[1]}`;
    }
    return id;
  }
  return `https://res.cloudinary.com/dxld01rcp/image/upload/${t}/${id}`;
}

function createPeer(){
  const pc = new RTCPeerConnection({ iceServers:[
    { urls:'stun:stun.l.google.com:19302' },
    { urls:'stun:stun1.l.google.com:19302' },
    { urls:'stun:stun2.l.google.com:19302' },
    { urls:'stun:stun3.l.google.com:19302' },
    { urls:'stun:stun4.l.google.com:19302' },
  ]});
  pc.onicecandidate = (e)=>{ try{ if (e.candidate && activeCallRef){ updateDoc(activeCallRef, { receiverCandidates: arrayUnion(JSON.parse(JSON.stringify(e.candidate))) }); } }catch(_){ } };
  pc.ontrack = (ev)=>{
    const stream = ev.streams && ev.streams[0] ? ev.streams[0] : (remoteStream || new MediaStream());
    if (!ev.streams || !ev.streams[0]){ stream.addTrack(ev.track); }
    remoteStream = stream; if (remoteVideo){ remoteVideo.srcObject = stream; remoteVideo.style.display = 'block'; }
  };
  return pc;
}

// arrayUnion helper without importing full FieldValue in v11 modules
function serverArrayUnion(v){ return (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.arrayUnion) ? window.firebase.firestore.FieldValue.arrayUnion(v) : (Array.isArray(v) ? v : [v]); }

async function accept(activeDoc){
  if (callState !== 'ringing' || !activeDoc) return;
  callState = 'connected';
  if (statusText) statusText.textContent = 'Connected';
  setPill('Connected','connected');
  if (timerEl){ timerEl.style.display = 'block'; callDuration = 0; if (callDurationInterval) clearInterval(callDurationInterval); callDurationInterval = setInterval(()=>{ callDuration++; timerEl.textContent = formatTimer(callDuration); }, 1000); }
  try{ if (receiverRingtone){ receiverRingtone.pause(); receiverRingtone.currentTime = 0; } }catch(_){ }
  try{
    localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video: currentCallType === 'video' });
    if (localVideo){ localVideo.srcObject = localStream; if (currentCallType === 'video') localVideo.style.display = 'block'; }
    peerConnection = createPeer();
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    const snap = await getDoc(activeDoc);
    const data = snap.data() || {};
    const remoteOffer = new RTCSessionDescription(data.offer);
    await peerConnection.setRemoteDescription(remoteOffer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await updateDoc(activeDoc, { status:'accepted', answer: { type: answer.type, sdp: answer.sdp } });
    onSnapshot(activeDoc, async (s)=>{
      const d = s.data() || {};
      if (Array.isArray(d.callerCandidates) && d.callerCandidates.length){
        for (const c of d.callerCandidates){ try{ await peerConnection.addIceCandidate(new RTCIceCandidate(c)); }catch(_){ } }
        try{ await updateDoc(activeDoc, { callerCandidates: [] }); }catch(_){ }
      }
      if (d.status === 'ended' && callState !== 'idle') end(false);
    });
  }catch(_){ end(true); }
}

async function decline(activeDoc){ try{ if (receiverRingtone){ receiverRingtone.pause(); receiverRingtone.currentTime = 0; } }catch(_){ } try{ if (activeDoc){ await updateDoc(activeDoc, { status:'declined' }); } }catch(_){ } end(false); }

function toggleMute(){ if (!localStream) return; localStream.getAudioTracks().forEach(t=> t.enabled = !t.enabled); if (toggleMuteBtn){ const off = localStream.getAudioTracks().every(t=>!t.enabled); toggleMuteBtn.classList.toggle('active', off); toggleMuteBtn.querySelector('i').className = off ? 'fas fa-microphone-slash':'fas fa-microphone'; } }
function toggleVideo(){ if (!localStream) return; localStream.getVideoTracks().forEach(t=> t.enabled = !t.enabled); const off = localStream.getVideoTracks().every(t=>!t.enabled); if (toggleVideoBtn){ toggleVideoBtn.classList.toggle('active', off); toggleVideoBtn.querySelector('i').className = off ? 'fas fa-video-slash':'fas fa-video'; } if (localVideo) localVideo.style.display = off ? 'none':'block'; }

async function end(updateFirestore){
  try{ setPill('Ended','ended'); }catch(_){ }
  try{ if (receiverRingtone){ receiverRingtone.pause(); receiverRingtone.currentTime = 0; } }catch(_){ }
  if (callDurationInterval){ try{ clearInterval(callDurationInterval); }catch(_){ } callDurationInterval = null; }
  if (updateFirestore && activeCallRef){ try{ await updateDoc(activeCallRef, { status:'ended' }); }catch(_){ } }
  try{ if (peerConnection){ peerConnection.close(); } }catch(_){ }
  try{ if (localStream){ localStream.getTracks().forEach(t=>t.stop()); } }catch(_){ }
  try{ if (remoteStream){ remoteStream.getTracks().forEach(t=>t.stop()); } }catch(_){ }
  peerConnection = null; localStream = null; remoteStream = null; activeCallRef = null; callState = 'idle'; currentCallType = null; resetUi(); closeOverlay();
}

function bindControls(){
  acceptBtn?.addEventListener('click', ()=> accept(activeCallRef));
  declineBtn?.addEventListener('click', ()=> decline(activeCallRef));
  endBtn?.addEventListener('click', ()=> end(true));
  toggleMuteBtn?.addEventListener('click', toggleMute);
  toggleVideoBtn?.addEventListener('click', toggleVideo);
}

function unbindControls(){
  try{ acceptBtn?.replaceWith(acceptBtn.cloneNode(true)); }catch(_){ }
  try{ declineBtn?.replaceWith(declineBtn.cloneNode(true)); }catch(_){ }
  try{ endBtn?.replaceWith(endBtn.cloneNode(true)); }catch(_){ }
  try{ toggleMuteBtn?.replaceWith(toggleMuteBtn.cloneNode(true)); }catch(_){ }
  try{ toggleVideoBtn?.replaceWith(toggleVideoBtn.cloneNode(true)); }catch(_){ }
  // Re-query after clone
  acceptBtn = document.getElementById('acceptCallBtn');
  declineBtn = document.getElementById('declineCallBtn');
  endBtn = document.getElementById('endCallBtn');
  toggleMuteBtn = document.getElementById('toggleMuteBtn');
  toggleVideoBtn = document.getElementById('toggleVideoBtn');
}

function showIncomingUi({ displayName, profilePicId, callType }){
  ensureOverlay(); resetUi(); openOverlay(callType);
  currentCallType = callType; callState = 'ringing';
  if (statusIcon) statusIcon.className = `fas fa-${callType === 'video' ? 'video' : 'phone'} call-status-icon`;
  if (statusText) statusText.textContent = `Incoming ${callType} call from ${displayName}`;
  setPill('Ringing','ringing');
  const initial = (displayName||'J').charAt(0).toUpperCase();
  const url = profilePicId ? getCloudinaryUrl(profilePicId, 'w_72,h_72,c_fill,g_face,r_max') : `https://placehold.co/72x72/00d5ff/ffffff?text=${initial}`;
  if (avatarEl){ avatarEl.src = url; avatarEl.onerror = ()=>{ avatarEl.src = `https://placehold.co/72x72/00d5ff/ffffff?text=${initial}`; } }
  if (nameEl) nameEl.textContent = displayName || 'JCHAT User';
  if (acceptBtn) acceptBtn.style.display = 'block';
  if (declineBtn) declineBtn.style.display = 'block';
  if (endBtn) endBtn.style.display = 'none';
  if (toggleMuteBtn) toggleMuteBtn.style.display = 'none';
  if (toggleVideoBtn) toggleVideoBtn.style.display = 'none';
  try{ if (receiverRingtone){ receiverRingtone.currentTime = 0; receiverRingtone.play().catch(()=>{}); } }catch(_){ }
}

function listenForIncomingCalls(user){
  const col = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
  const qCalls = query(col, where('receiverId','==', user.uid), where('status','==','ringing'));
  onSnapshot(qCalls, async (snap)=>{
    if (snap.empty) return;
    // If already in a call, mark additional as busy
    if (callState !== 'idle'){
      snap.forEach(async d=>{ if (!activeCallRef || d.id !== activeCallRef.id){ try{ await updateDoc(d.ref, { status:'busy' }); }catch(_){ } } });
      return;
    }
    const d = snap.docs[0];
    activeCallRef = d.ref;
    const data = d.data();
    const callerId = data.callerId;
    const callType = data.callType === 'video' ? 'video' : 'voice';
    const profile = await fetchUserProfile(callerId);
    showIncomingUi({ displayName: profile.displayName, profilePicId: profile.profilePicId, callType });
    notifyIfHidden(`Incoming ${callType} call`, `from ${profile.displayName}`, profile.profilePicId ? getCloudinaryUrl(profile.profilePicId,'w_96,h_96,c_fill,g_face,r_max') : undefined);
  });
}

// Ask for notification permission in a gentle way (best-effort)
try{ if (window.Notification && Notification.permission === 'default'){ Notification.requestPermission().catch(()=>{}); } }catch(_){ }

onAuthStateChanged(auth, (u)=>{
  if (!u){ currentUser = null; return; }
  currentUser = u; ensureOverlay(); unbindControls(); bindControls(); listenForIncomingCalls(u);
});

// End call on unload to update status reliably
window.addEventListener('beforeunload', ()=>{ try{ if (activeCallRef) updateDoc(activeCallRef, { status:'ended' }); }catch(_){ } });
