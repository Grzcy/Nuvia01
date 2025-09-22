// Session manager: single active session per user (Firestore-based prototype)
// Usage: import { registerSession, unregisterSession } from './assets/js/session-manager.js'

import { doc, runTransaction, onSnapshot, updateDoc, serverTimestamp, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js';
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

  // Try to set session document; prefer simple setDoc (more likely allowed by security rules) over transaction
  try{
    await setDoc(sessionDocRef, {
      sessionId: mySessionId,
      deviceId,
      userAgent: navigator.userAgent || null,
      issuedAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    }, { merge: true });
  }catch(e){
    console.error('registerSession: initial write failed', e);
    // If permission denied, bail out silently to avoid noisy errors and fallback to local-only session
    if(e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission')))) return null;
    // For other errors, attempt a transaction as a fallback
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
    }catch(txErr){
      console.error('registerSession: txn failed', txErr);
      if(txErr && (txErr.code === 'permission-denied' || (txErr.message && txErr.message.toLowerCase().includes('permission')))) return null;
    }
  }

  // Listen for remote changes - if another session claims ownership, sign out
  let unsub = null;
  try{
    unsub = onSnapshot(sessionDocRef, (snap)=>{
      try{
        if(!snap.exists()) return;
        const data = snap.data();
        if(!data) return;
        const remoteId = data.sessionId;
        if(remoteId && remoteId !== mySessionId){
          // Another session claimed this account -> force sign out
          console.warn('Session replaced by remote:', remoteId, 'local:', mySessionId);
          try{ signOut(auth); showSessionReplacedMessage(); }catch(e){ console.error(e); }
        }
      }catch(innerErr){
        console.error('session-manager: onSnapshot handler error', innerErr);
      }
    }, (err)=>{
      // Handle listener errors gracefully; suppress noisy permission-denied stack traces
      if(err && (err.code === 'permission-denied' || (err.message && err.message.toLowerCase().includes('permission')))){
        console.warn('session-manager: onSnapshot permission denied, unsubscribing');
        try{ if(unsub) unsub(); }catch(e){}
        return;
      }
      console.error('session-manager: onSnapshot error', err);
      try{ if(unsub) unsub(); }catch(e){}
    });
  }catch(err){
    console.error('session-manager: failed to attach onSnapshot', err);
  }

  // Heartbeat: update lastSeen periodically
  const hb = setInterval(()=>{
    updateDoc(sessionDocRef, { lastSeen: serverTimestamp() }).catch((err)=>{
      if(err && (err.code === 'permission-denied' || (err.message && err.message.toLowerCase().includes('permission')))){
        console.warn('session-manager: heartbeat permission denied, stopping heartbeat');
        try{ clearInterval(hb); if(unsub) unsub(); }catch(e){}
      }else{
        console.error('session-manager: heartbeat update failed', err);
      }
    });
  }, 60000);

  // Return unregister function
  return function unregister(){ try{ if(unsub) unsub(); clearInterval(hb); }catch(e){} };
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
