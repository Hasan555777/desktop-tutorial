// src/firebase.js

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import {
  initializeFirestore,
  CACHE_SIZE_UNLIMITED,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getMessaging, isSupported, onMessage } from 'firebase/messaging';
import { logError, logInfo } from '../utils/logger';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// ============================================================
// Auth Setup with Persistence
// ============================================================
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((error) => {
  logError('Auth persistence error', error);
});

// Shared Google provider — reuse this everywhere instead of creating a new
// GoogleAuthProvider() elsewhere, so scopes/params stay in one place.
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ============================================================
// Firestore Setup with Offline Support
// ============================================================
// NOTE: experimentalAutoDetectLongPolling lets the SDK negotiate the best
// transport per-network. Forcing long polling for every user (the previous
// `experimentalForceLongPolling: true`) unnecessarily slows down the
// majority of users who don't need it — only restrictive corporate
// proxies/firewalls typically need long polling.
const db = initializeFirestore(app, {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  experimentalAutoDetectLongPolling: true,
});

try {
  enableIndexedDbPersistence(db)
    .then(() => logInfo('Firestore offline persistence enabled'))
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        // Another tab already holds the persistence lock — fall back to
        // multi-tab mode instead of leaving persistence disabled.
        enableMultiTabIndexedDbPersistence(db).catch((multiErr) => {
          logError('Multi-tab persistence failed', multiErr);
        });
      } else if (err.code !== 'unimplemented') {
        logError('Firestore persistence error', err);
      }
    });
} catch (error) {
  logError('Persistence setup error', error);
}

// ============================================================
// Storage / Functions
// ============================================================
const storage = getStorage(app);
const functions = getFunctions(app);

// ============================================================
// Firebase Cloud Messaging (FCM)
// ============================================================
const messaging = isSupported().then((supported) => {
  if (!supported) return null;
  return getMessaging(app);
});

// ============================================================
// Foreground Notification Listener
// ============================================================
export const listenForForegroundMessages = async (callback) => {
  const messagingInstance = await messaging;
  if (!messagingInstance) return;

  onMessage(messagingInstance, (payload) => {
    if (callback) callback(payload);
  });
};

// ============================================================
// Exports
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
  signInWithRedirect,
};

export default app;