// Session manager: single active session per user (Firestore-based prototype)
// Usage: import { registerSession, unregisterSession } from './assets/js/session-manager.js'

import { doc, runTransaction, onSnapshot, updateDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js';

function generateId(){
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function getDeviceId(){
  try{
    const k = 'jchat-device-id';
    let d = localStorage.getItem(k);
    if(!d){ d = generateId(); localStorage.setItem(k,d); }
    return d;
  }catch(e){ return 'unknown-device'; }
}

// registerSession: claims session for current authenticated user and monitors for remote replaces
export async function registerSession(auth, db, appId){
  if(!auth || !db || !appId) throw new Error('Missing params');
  const currentUser = auth.currentUser;
  if(!currentUser) return null;

  const uid = currentUser.uid;
  const sessionKey = 'jchat-session';
  const deviceId = getDeviceId();
  let session = null;
  try{ session = JSON.parse(localStorage.getItem(sessionKey) || '{}'); }catch(e){ session = {}; }
  if(!session.sessionId){ session.sessionId = generateId(); session.deviceId = session.deviceId || deviceId; localStorage.setItem(sessionKey, JSON.stringify(session)); }
  const mySessionId = session.sessionId;

  const sessionDocRef = doc(db, 'artifacts', appId, 'sessions', uid);

  // Atomically set session as current
  try{
    await runTransaction(db, async (tx)=>{
      tx.set(sessionDocRef, {
        sessionId: mySessionId,
        deviceId,
        userAgent: navigator.userAgent || null,
        issuedAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      }, { merge: true });
    });
  }catch(e){ console.error('registerSession: txn failed', e); }

  // Listen for remote changes - if another session claims ownership, sign out
  const unsub = onSnapshot(sessionDocRef, (snap)=>{
    if(!snap.exists()) return;
    const data = snap.data();
    if(!data) return;
    const remoteId = data.sessionId;
    if(remoteId && remoteId !== mySessionId){
      // Another session claimed this account -> force sign out
      console.warn('Session replaced by remote:', remoteId, 'local:', mySessionId);
      try{ signOut(auth); showSessionReplacedMessage(); }catch(e){ console.error(e); }
    }
  });

  // Heartbeat: update lastSeen periodically
  const hb = setInterval(()=>{ updateDoc(sessionDocRef, { lastSeen: serverTimestamp() }).catch(()=>{}); }, 60000);

  // Return unregister function
  return function unregister(){ try{ unsub(); clearInterval(hb); }catch(e){} };
}

function showSessionReplacedMessage(){
  try{
    if(window && typeof window.showMessageBox === 'function'){
      window.showMessageBox('You were signed out because your account was used on another device.', 'warning');
    }else if(window && window.alert){ window.alert('You were signed out because your account was used on another device.'); }
  }catch(e){}
}

export async function unregisterSession(auth, db, appId){
  const user = auth.currentUser; if(!user) return;
  const uid = user.uid;
  const sessionDocRef = doc(db, 'artifacts', appId, 'sessions', uid);
  try{ await setDoc(sessionDocRef, { sessionId: null }, { merge: true }); }catch(e){ console.error('unregisterSession', e); }
}
