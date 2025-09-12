/**
 * JCHAT Global Call Service
 * This script enables receiving calls across all JCHAT pages
 */

(function() {
    'use strict';
    
    // Check if Firebase is available and we're on a JCHAT page
    if (typeof firebase === 'undefined' || !window.location.pathname.includes('.html')) {
        return;
    }
    
    let globalCallListener = null;
    let currentUser = null;
    let isGlobalCallServiceActive = false;
    
    // Initialize global call service when auth state changes
    function initializeGlobalCallService() {
        if (isGlobalCallServiceActive) return;
        
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                currentUser = user;
                setupGlobalCallListener();
                isGlobalCallServiceActive = true;
            } else {
                cleanup();
                isGlobalCallServiceActive = false;
            }
        });
    }
    
    /**
     * Sets up global call listener for incoming calls
     */
    function setupGlobalCallListener() {
        if (!currentUser || globalCallListener) return;
        
        try {
            const db = firebase.firestore();
            const appId = "jchat_1_0_0";
            const callsCollectionRef = firebase.firestore().collection(db, "artifacts", appId, "public", "data", "calls");
            const callsQuery = firebase.firestore().query(
                callsCollectionRef,
                firebase.firestore().where("receiverId", "==", currentUser.uid),
                firebase.firestore().where("status", "in", ["pending", "accepted"])
            );
            
            globalCallListener = firebase.firestore().onSnapshot(callsQuery, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    const callData = change.doc.data();
                    const callId = change.doc.id;
                    
                    if (change.type === "added" && callData.status === "pending") {
                        handleIncomingCall(callId, callData);
                    }
                });
            }, (error) => {
                console.error("JCHAT_ERROR: Global call listener error:", error);
            });
            
            console.log("JCHAT_DEBUG: Global call service initialized for user:", currentUser.uid);
            
        } catch (error) {
            console.error("JCHAT_ERROR: Failed to setup global call listener:", error);
        }
    }
    
    /**
     * Handles incoming call notification
     */
    function handleIncomingCall(callId, callData) {
        // Don't show notification if we're already on the Chat.html page with the caller
        const currentPage = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        const currentPartnerId = urlParams.get('partnerId');
        
        if (currentPage.includes('Chat.html') && currentPartnerId === callData.callerId) {
            console.log("JCHAT_DEBUG: Already on chat page with caller, skipping global notification");
            return;
        }
        
        // Show notification and play sound
        showGlobalCallNotification(callId, callData);
        playIncomingCallSound();
        
        // Show browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(`Incoming ${callData.type} call`, {
                body: `${callData.callerUsername} is calling you`,
                icon: '/favicon.ico',
                requireInteraction: true,
                actions: [
                    { action: 'answer', title: 'Answer' },
                    { action: 'decline', title: 'Decline' }
                ]
            });
            
            notification.onclick = () => {
                window.focus();
                redirectToCall(callData.callerId);
                notification.close();
            };
        }
    }
    
    /**
     * Shows global call notification overlay
     */
    function showGlobalCallNotification(callId, callData) {
        // Remove existing notification if any
        const existingNotification = document.getElementById('globalCallNotification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification overlay
        const notificationOverlay = document.createElement('div');
        notificationOverlay.id = 'globalCallNotification';
        notificationOverlay.innerHTML = `
            <div class="global-call-notification">
                <div class="call-notification-content">
                    <div class="caller-info">
                        <div class="caller-avatar">
                            <i class="fas fa-user-circle"></i>
                        </div>
                        <div class="caller-details">
                            <h3>${callData.callerUsername}</h3>
                            <p>Incoming ${callData.type} call</p>
                        </div>
                    </div>
                    <div class="call-notification-actions">
                        <button class="decline-call-btn" onclick="declineGlobalCall('${callId}')">
                            <i class="fas fa-phone-slash"></i>
                        </button>
                        <button class="answer-call-btn" onclick="answerGlobalCall('${callData.callerId}')">
                            <i class="fas fa-phone"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        const styles = `
            <style>
                #globalCallNotification {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                    backdrop-filter: blur(5px);
                }
                
                .global-call-notification {
                    background: linear-gradient(135deg, #1a1a2e, #16213e);
                    padding: 30px;
                    border-radius: 20px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
                    text-align: center;
                    min-width: 300px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .caller-info {
                    margin-bottom: 30px;
                }
                
                .caller-avatar {
                    font-size: 4rem;
                    color: #00d5ff;
                    margin-bottom: 15px;
                }
                
                .caller-details h3 {
                    color: white;
                    margin: 0 0 10px 0;
                    font-size: 1.5rem;
                    font-family: 'Poppins', sans-serif;
                }
                
                .caller-details p {
                    color: #b0b0b0;
                    margin: 0;
                    font-size: 1rem;
                }
                
                .call-notification-actions {
                    display: flex;
                    justify-content: center;
                    gap: 30px;
                }
                
                .call-notification-actions button {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    border: none;
                    cursor: pointer;
                    font-size: 1.5rem;
                    color: white;
                    transition: all 0.3s ease;
                }
                
                .decline-call-btn {
                    background: linear-gradient(135deg, #ff4757, #ff3838);
                }
                
                .decline-call-btn:hover {
                    transform: scale(1.1);
                    box-shadow: 0 10px 20px rgba(255, 71, 87, 0.4);
                }
                
                .answer-call-btn {
                    background: linear-gradient(135deg, #2ed573, #1dd1a1);
                    animation: pulse 2s infinite;
                }
                
                .answer-call-btn:hover {
                    transform: scale(1.1);
                    box-shadow: 0 10px 20px rgba(46, 213, 115, 0.4);
                }
                
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(46, 213, 115, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(46, 213, 115, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(46, 213, 115, 0); }
                }
            </style>
        `;
        
        // Add styles to head
        const styleElement = document.createElement('div');
        styleElement.innerHTML = styles;
        document.head.appendChild(styleElement.firstElementChild);
        
        // Add notification to body
        document.body.appendChild(notificationOverlay);
        
        // Auto-decline after 30 seconds
        setTimeout(() => {
            if (document.getElementById('globalCallNotification')) {
                declineGlobalCall(callId);
            }
        }, 30000);
    }
    
    /**
     * Plays incoming call sound
     */
    function playIncomingCallSound() {
        try {
            // Create audio context for call sound
            if (typeof Tone !== 'undefined') {
                const synth = new Tone.Synth().toDestination();
                
                // Play incoming call melody
                const playCallTone = () => {
                    synth.triggerAttackRelease('C5', '0.3');
                    setTimeout(() => synth.triggerAttackRelease('E5', '0.3'), 400);
                    setTimeout(() => synth.triggerAttackRelease('G5', '0.3'), 800);
                };
                
                playCallTone();
                const interval = setInterval(playCallTone, 2000);
                
                // Stop after 20 seconds
                setTimeout(() => clearInterval(interval), 20000);
                
            } else {
                // Fallback using HTML5 audio
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+HyvmEbBj2Y2/LCcyEFLIHO8tiJNwgZaLvt');
                audio.volume = 0.3;
                audio.loop = true;
                audio.play().catch(e => console.log('Audio play failed:', e));
                
                setTimeout(() => audio.pause(), 20000);
            }
        } catch (error) {
            console.error('JCHAT_ERROR: Failed to play call sound:', error);
        }
    }
    
    /**
     * Redirects to chat page for call
     */
    function redirectToCall(callerId) {
        const currentPage = window.location.pathname;
        if (!currentPage.includes('Chat.html')) {
            window.location.href = `Chat.html?partnerId=${callerId}`;
        }
    }
    
    /**
     * Global functions for call actions
     */
    window.answerGlobalCall = function(callerId) {
        const notification = document.getElementById('globalCallNotification');
        if (notification) {
            notification.remove();
        }
        redirectToCall(callerId);
    };
    
    window.declineGlobalCall = async function(callId) {
        try {
            const db = firebase.firestore();
            const appId = "jchat_1_0_0";
            const callDocRef = firebase.firestore().doc(db, "artifacts", appId, "public", "data", "calls", callId);
            
            await firebase.firestore().updateDoc(callDocRef, {
                status: 'declined',
                endTime: firebase.firestore().serverTimestamp()
            });
            
            const notification = document.getElementById('globalCallNotification');
            if (notification) {
                notification.remove();
            }
            
            console.log("JCHAT_DEBUG: Call declined globally");
            
        } catch (error) {
            console.error("JCHAT_ERROR: Failed to decline call:", error);
        }
    };
    
    /**
     * Cleanup function
     */
    function cleanup() {
        if (globalCallListener) {
            globalCallListener();
            globalCallListener = null;
        }
        
        const notification = document.getElementById('globalCallNotification');
        if (notification) {
            notification.remove();
        }
        
        currentUser = null;
    }
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            console.log('JCHAT_DEBUG: Notification permission:', permission);
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeGlobalCallService);
    } else {
        initializeGlobalCallService();
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    
})();