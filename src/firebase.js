// src/firebase.js

import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect
} from "firebase/auth";
import { 
  getFirestore, 
  initializeFirestore,
  CACHE_SIZE_UNLIMITED,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getMessaging, isSupported, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// ✅ Initialize App
const app = initializeApp(firebaseConfig);

// ============================================================
// ✅ Auth Setup with Persistence
// ============================================================
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log('✅ Auth persistence set to LOCAL');
  })
  .catch((error) => {
    console.error('❌ Auth persistence error:', error);
  });

// ✅ Google Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// ============================================================
// ✅ Firestore Setup with Offline Support
// ============================================================
const db = initializeFirestore(app, {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  experimentalForceLongPolling: true,
});

// ✅ Enable Offline Persistence
try {
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log('✅ Firestore offline persistence enabled');
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('⚠️ Multiple tabs open, trying multi-tab persistence...');
        enableMultiTabIndexedDbPersistence(db)
          .then(() => {
            console.log('✅ Firestore multi-tab persistence enabled');
          })
          .catch((multiErr) => {
            console.warn('⚠️ Multi-tab persistence failed:', multiErr);
          });
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ Browser doesn\'t support persistence');
      } else {
        console.warn('⚠️ Persistence error:', err);
      }
    });
} catch (error) {
  console.warn('⚠️ Persistence setup error:', error);
}

// ============================================================
// ✅ Storage
// ============================================================
const storage = getStorage(app);

// ============================================================
// ✅ Functions
// ============================================================
const functions = getFunctions(app);

// ============================================================
// ✅ Firebase Cloud Messaging (FCM)
// ============================================================
const messaging = isSupported().then((supported) => {
  if (!supported) {
    console.warn("⚠️ Firebase Messaging is not supported in this browser.");
    return null;
  }

  console.log("✅ Firebase Messaging is supported.");
  return getMessaging(app);
});

// ============================================================
// ✅ Foreground Notification Listener
// ============================================================
export const listenForForegroundMessages = async (callback) => {
  const messagingInstance = await messaging;

  if (!messagingInstance) {
    console.warn("⚠️ Messaging not supported.");
    return;
  }

  onMessage(messagingInstance, (payload) => {
    console.log("📩 Foreground Message:", payload);

    if (callback) {
      callback(payload);
    }
  });
};

// ============================================================
// ✅ Exports
// ============================================================
export { 
  app, 
  auth, 
  db, 
  storage, 
  functions,
  messaging,
  googleProvider,
  signInWithPopup,
  signInWithRedirect
};

export default app;