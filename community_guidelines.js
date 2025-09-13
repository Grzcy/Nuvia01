
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
        import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
        import { getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        const cloudinaryConfig = { cloudName: "dxld01rcp", uploadPreset: "Storage_preset" };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        const headerProfilePic = document.getElementById('headerProfilePic');
        const headerAvatarIcon = document.getElementById('headerAvatarIcon');
        const logoutButton = document.getElementById('logoutButton');
        const notificationCountElement = document.getElementById('notificationCount');
        const messageBox = document.getElementById('messageBox');
        const headerNavLinkProfile = document.getElementById('profileLink');

        let isAuthReady = false;

        const successSynth = new Tone.Synth().toDestination();
        const errorSynth = new Tone.Synth().toDestination();
        const infoSynth = new Tone.Synth().toDestination();
        successSynth.oscillator.type = "sine"; successSynth.envelope.attack = 0.01; successSynth.envelope.decay = 0.2; successSynth.envelope.sustain = 0.0; successSynth.envelope.release = 0.5;
        errorSynth.oscillator.type = "sawtooth"; errorSynth.envelope.attack = 0.01; errorSynth.envelope.decay = 0.3; errorSynth.envelope.sustain = 0.0; errorSynth.envelope.release = 0.5;
        infoSynth.oscillator.type = "triangle"; infoSynth.envelope.attack = 0.01; infoSynth.envelope.decay = 0.1; infoSynth.envelope.sustain = 0.0; infoSynth.envelope.release = 0.3;
        function playNotificationSound(type){ Tone.start(); if(type==='success'){successSynth.triggerAttackRelease("C5","8n");} else if(type==='error'){errorSynth.triggerAttackRelease("C3","8n");} else if(type==='info'){infoSynth.triggerAttackRelease("E4","16n");} }

        function showMessageBox(message, type, durationMs = 3000, isPersistent = false) {
            if (messageBox.timeoutId) { clearTimeout(messageBox.timeoutId); messageBox.timeoutId = null; }
            messageBox.innerHTML = `<i id="messageBoxIcon"></i><span id="messageBoxText"></span>`;
            const messageBoxIcon = document.getElementById('messageBoxIcon');
            const messageBoxText = document.getElementById('messageBoxText');
            messageBoxText.textContent = message; messageBox.className = 'message-box show ' + type;
            if (messageBoxIcon) {
                messageBoxIcon.className = '';
                if (type === 'success') { messageBoxIcon.classList.add('fas','fa-check-circle'); playNotificationSound('success'); }
                else if (type === 'error') { messageBoxIcon.classList.add('fas','fa-times-circle'); playNotificationSound('error'); }
                else if (type === 'info') { messageBoxIcon.classList.add('fas','fa-info-circle'); playNotificationSound('info'); }
                else if (type === 'warning') { messageBoxIcon.classList.add('fas','fa-exclamation-triangle'); playNotificationSound('info'); }
                else if (type === 'loading') { messageBoxIcon.classList.add('fas','fa-spinner','fa-spin'); }
            }
            if (type === 'loading') { messageBox.classList.add('loading-pulse'); } else { messageBox.classList.remove('loading-pulse'); }
            messageBox.style.display = 'flex'; messageBox.style.opacity = '1';
            if (!isPersistent) {
                messageBox.timeoutId = setTimeout(() => { messageBox.style.opacity = '0'; messageBox.addEventListener('transitionend', function handler(){ messageBox.style.display = 'none'; messageBox.removeEventListener('transitionend', handler); messageBox.classList.remove('loading-pulse'); }, { once: true }); }, durationMs);
            }
        }

        function getCloudinaryImageUrl(urlOrPublicId, transformations = "w_auto,f_auto,q_auto") {
            if (!urlOrPublicId) return null;
            if (urlOrPublicId.startsWith('http://') || urlOrPublicId.startsWith('https://')) return urlOrPublicId;
            return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/${transformations}/${urlOrPublicId}`;
        }

        function displayProfilePicture(imgElement, iconElement, profilePicId, usernameInitial, transformations) {
            if (!imgElement) return;
            if (profilePicId) {
                const imageUrl = getCloudinaryImageUrl(profilePicId, transformations);
                imgElement.src = imageUrl; imgElement.style.display = 'block'; if (iconElement) iconElement.style.display = 'none';
                imgElement.onerror = () => {
                    const bgColor = getComputedStyle(document.body).getPropertyValue('--card-background-color').trim();
                    const textColor = getComputedStyle(document.body).getPropertyValue('--text-color-primary').trim();
                    imgElement.src = `https://placehold.co/120x120/${bgColor.replace('#','')}/${textColor.replace('#','')}?text=${usernameInitial}`;
                    imgElement.style.display = 'block'; if (iconElement) iconElement.style.display = 'none';
                };
            } else {
                imgElement.src = ''; imgElement.style.display = 'none'; if (iconElement) iconElement.style.display = 'block';
            }
        }

        async function fetchAndDisplayHeaderProfile(user) {
            try {
                const privateProfileDocRef = doc(db, "artifacts", appId, "users", user.uid, "profiles", "user_profile");
                const publicProfileDocRef = doc(db, "artifacts", appId, "public", "data", "users", user.uid);
                const privateDocSnap = await getDoc(privateProfileDocRef);
                let profileData = privateDocSnap.exists() ? privateDocSnap.data() : null;
                const publicProfileSummary = {
                    username: profileData?.username || `User_${user.uid.substring(0,8)}`,
                    profilePicId: profileData?.profilePicId || user.photoURL || null,
                    jCoins: profileData?.jCoins || 0,
                    level: profileData?.level || 1,
                    userId: user.uid,
                    email: profileData?.email || "",
                    totalPosts: profileData?.totalPosts || 0,
                    totalGasEarned: profileData?.totalGasEarned || 0,
                    banned: profileData?.banned || false
                };
                await setDoc(publicProfileDocRef, publicProfileSummary, { merge: true });
                const usernameInitial = (publicProfileSummary.username || "N").charAt(0).toUpperCase();
                displayProfilePicture(headerProfilePic, headerAvatarIcon, publicProfileSummary.profilePicId, usernameInitial, "w_70,h_70,c_fill,g_face,r_max");
                headerNavLinkProfile.href = `/profile.html?userId=${user.uid}`;
                logoutButton.disabled = false;
            } catch (error) {
                const usernameInitial = (user.displayName || "N").charAt(0).toUpperCase();
                displayProfilePicture(headerProfilePic, headerAvatarIcon, user.photoURL, usernameInitial, "w_70,h_70,c_fill,g_face,r_max");
                showMessageBox(`Error loading header profile: ${error.message}`, 'error');
                logoutButton.disabled = false;
            }
        }

        async function fetchNotificationCount(userId) {
            try {
                const notificationsCollectionRef = collection(db, "artifacts", appId, "users", userId, "notifications");
                const q = query(notificationsCollectionRef, where("read", "==", false));
                onSnapshot(q, (querySnapshot) => {
                    const unreadCount = querySnapshot.size;
                    if (unreadCount > 0) { notificationCountElement.textContent = unreadCount; notificationCountElement.style.display = 'flex'; }
                    else { notificationCountElement.style.display = 'none'; }
                }, () => { notificationCountElement.style.display = 'none'; });
            } catch (_) { /* noop */ }
        }

        onAuthStateChanged(auth, async (user) => {
            if (user) { isAuthReady = true; await fetchAndDisplayHeaderProfile(user); fetchNotificationCount(user.uid); }
            else {
                isAuthReady = false; logoutButton.disabled = true; headerProfilePic.style.display = 'none'; headerAvatarIcon.style.display = 'block';
                try { await signInAnonymously(auth); showMessageBox("You are viewing as a guest.", 'info', 3000); } catch (_) { showMessageBox("Error logging in as guest.", 'error'); }
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('jchat-theme');
            const themes = ['theme-light-mode','theme-dark-mode','theme-glass-mode','theme-sunset-mode'];
            if (savedTheme && themes.includes(savedTheme)) { document.body.classList.remove(...themes); document.body.classList.add(savedTheme); }
            else { document.body.classList.add('theme-dark-mode'); }
        });

        window.addEventListener('storage', (event) => {
            if (event.key === 'jchat-theme') {
                const newTheme = event.newValue || 'theme-dark-mode';
                const themes = ['theme-light-mode','theme-dark-mode','theme-glass-mode','theme-sunset-mode'];
                if (themes.includes(newTheme)) { document.body.classList.remove(...themes); document.body.classList.add(newTheme); }
            }
        });

        logoutButton.addEventListener('click', async () => {
            if (!isAuthReady) return;
            logoutButton.disabled = true;
            try { await signOut(auth); showMessageBox("Logged out successfully! 👋", 'success'); setTimeout(()=>{ window.location.href = '/login.html'; }, 1500); }
            catch (_) { showMessageBox("Failed to log out. Please try again.", 'error'); logoutButton.disabled = false; }
        });
    