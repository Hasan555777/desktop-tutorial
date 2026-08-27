// src/hooks/useAppLock.js

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { logError } from '@/utils/logger';

import { storage } from '@/security/storage';
import {
  APP_LOCK_KEY,
  PIN_HASH_KEY,
  MAX_PIN_ATTEMPTS,
  LOCK_DURATION,
  SESSION_KEY,
  DEVICE_KEY,
} from '@/security/constants';
import { hashPin, verifyPin as verifyPinHash, generateSalt, generateSecureToken } from '@/security/crypto';
import device from '@/security/device';

// PIN দৈর্ঘ্য (সংবেদনশীল নয়, শুধু সংখ্যা) হ্যাশের পাশাপাশি সংরক্ষণ করা হয়,
// যাতে unlock স্ক্রিন জানে ঠিক কতটা ডিজিট আসার পর ভেরিফাই করতে হবে।
const DEFAULT_PIN_LENGTH = 4;

// ============================================================
// useAppLock Hook
// ============================================================

export const useAppLock = () => {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || null;

  const [isEnabled, setIsEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pinLength, setPinLength] = useState(DEFAULT_PIN_LENGTH);
  const [isLoading, setIsLoading] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [remainingAttempts, setRemainingAttempts] = useState(MAX_PIN_ATTEMPTS);
  const [sessionToken, setSessionToken] = useState(null);
  const [deviceId, setDeviceId] = useState(null);

  // ============================================================
  // Save to Firebase
  //
  // CRITICAL: Firestore's updateDoc() replaces a nested map wholesale
  // unless you use dot-notation paths — it does NOT deep-merge. The
  // previous version wrote `{ appLock: { ...data, updatedAt } }`, which
  // meant every call (e.g. a plain enable/disable toggle) silently wiped
  // out unrelated fields like pinHash/deviceFingerprint that a previous
  // call had saved. Writing with `appLock.<field>` dot-paths instead makes
  // every call a true partial update.
  // ============================================================
  const saveToFirebase = useCallback(
    async (data) => {
      if (!userId) return false;

      try {
        const userRef = doc(db, 'users', userId);
        const updates = {};
        Object.entries(data).forEach(([key, value]) => {
          updates[`appLock.${key}`] = value;
        });
        updates['appLock.updatedAt'] = serverTimestamp();

        await updateDoc(userRef, updates);
        return true;
      } catch (error) {
        logError('AppLock Firebase save error', error);
        return false;
      }
    },
    [userId]
  );

  // ============================================================
  // Sync with Firebase
  // ============================================================
  const syncWithFirebase = useCallback(async () => {
    if (!userId) return;

    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.appLock?.enabled) {
          setIsEnabled(true);
          if (data.appLock?.pinHash) setHasPin(true);
        }
      }
    } catch (error) {
      logError('AppLock Firebase sync error', error);
    }
  }, [userId]);

  // ============================================================
  // Load Settings from Secure Storage
  // ============================================================
  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);

      try {
        const lockData = storage.get(APP_LOCK_KEY);
        const pinData = storage.get(PIN_HASH_KEY);
        const sessionData = storage.get(SESSION_KEY);
        const deviceData = storage.get(DEVICE_KEY);

        if (lockData?.enabled) setIsEnabled(true);

        if (pinData?.hash) {
          setHasPin(true);
          setPinLength(pinData.length || DEFAULT_PIN_LENGTH);
        }

        if (sessionData?.token) setSessionToken(sessionData.token);
        if (deviceData?.id) setDeviceId(deviceData.id);

        if (lockData?.lockedUntil && lockData.lockedUntil > Date.now()) {
          setIsLockedOut(true);
          setLockedUntil(new Date(lockData.lockedUntil));
          setAttempts(lockData.attempts || 0);
          setRemainingAttempts(Math.max(0, MAX_PIN_ATTEMPTS - (lockData.attempts || 0)));
        } else {
          if (lockData?.lockedUntil) {
            storage.remove(APP_LOCK_KEY);
          }
          setIsLockedOut(false);
          setLockedUntil(null);
          setAttempts(lockData?.attempts || 0);
          setRemainingAttempts(Math.max(0, MAX_PIN_ATTEMPTS - (lockData?.attempts || 0)));
        }

        if (userId) {
          await syncWithFirebase();
        }
      } catch (error) {
        logError('Error loading app lock settings', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [userId, syncWithFirebase]);

  // ============================================================
  // Set PIN
  // ============================================================
  const setPin = useCallback(
    async (pin) => {
      if (!pin || pin.length < 4) {
        return { success: false, error: 'PIN must be at least 4 digits' };
      }

      try {
        const salt = generateSalt();
        const result = await hashPin(pin, salt);

        storage.set(PIN_HASH_KEY, {
          hash: result.hash,
          salt: result.salt,
          iterations: result.iterations,
          algorithm: result.algorithm,
          length: pin.length,
        });

        setHasPin(true);
        setPinLength(pin.length);

        const currentDeviceId = device.getDeviceId();
        const deviceInfo = await device.collectDeviceInfo();
        const deviceFingerprint = await device.generateDeviceFingerprint(deviceInfo);

        await saveToFirebase({
          enabled: true,
          pinHash: result.hash,
          pinSalt: result.salt,
          iterations: result.iterations,
          algorithm: result.algorithm,
          pinLength: pin.length,
          deviceId: currentDeviceId,
          deviceFingerprint,
          deviceName: deviceInfo.name,
          devicePlatform: deviceInfo.platform,
          deviceOS: deviceInfo.os,
          deviceBrowser: deviceInfo.browser,
        });

        await device.trustCurrentDevice();

        return { success: true };
      } catch (error) {
        logError('Set PIN error', error);
        return { success: false, error: error.message };
      }
    },
    [saveToFirebase]
  );

  // ============================================================
  // Verify PIN
  // ============================================================
  const verifyPin = useCallback(
    async (pin) => {
      if (isLockedOut) {
        const now = Date.now();
        if (lockedUntil && lockedUntil.getTime() > now) {
          const remaining = Math.ceil((lockedUntil.getTime() - now) / 1000 / 60);
          return {
            success: false,
            error: `Too many attempts. Try again in ${remaining} minutes`,
            lockedOut: true,
            remainingMinutes: remaining,
          };
        }
        setIsLockedOut(false);
        setLockedUntil(null);
        storage.remove(APP_LOCK_KEY);
        setAttempts(0);
        setRemainingAttempts(MAX_PIN_ATTEMPTS);
      }

      const pinData = storage.get(PIN_HASH_KEY);
      if (!pinData?.hash) {
        return { success: false, error: 'No PIN set' };
      }

      try {
        const isValid = await verifyPinHash(pin, pinData.hash, pinData.salt);

        if (isValid) {
          storage.remove(APP_LOCK_KEY);
          setAttempts(0);
          setRemainingAttempts(MAX_PIN_ATTEMPTS);

          const token = generateSecureToken();
          storage.set(SESSION_KEY, { token, createdAt: Date.now() });
          setSessionToken(token);

          device.updateLastActive();

          return { success: true };
        }

        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setRemainingAttempts(Math.max(0, MAX_PIN_ATTEMPTS - newAttempts));

        storage.set(APP_LOCK_KEY, { enabled: true, attempts: newAttempts, lockedUntil: null });

        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          const lockTime = Date.now() + LOCK_DURATION;
          setIsLockedOut(true);
          setLockedUntil(new Date(lockTime));

          storage.set(APP_LOCK_KEY, { enabled: true, attempts: newAttempts, lockedUntil: lockTime });

          await saveToFirebase({
            enabled: true,
            lockedUntil: lockTime,
            attempts: newAttempts,
            lastAttempt: serverTimestamp(),
          });

          return {
            success: false,
            error: 'Too many failed attempts. Locked for 5 minutes',
            lockedOut: true,
            remainingMinutes: 5,
          };
        }

        return {
          success: false,
          error: `Invalid PIN. ${MAX_PIN_ATTEMPTS - newAttempts} attempts remaining`,
          remainingAttempts: MAX_PIN_ATTEMPTS - newAttempts,
        };
      } catch (error) {
        logError('PIN verification error', error);
        return { success: false, error: 'Verification failed' };
      }
    },
    [attempts, isLockedOut, lockedUntil, saveToFirebase]
  );

  // ============================================================
  // Change PIN — must be defined after verifyPin
  // ============================================================
  const changePin = useCallback(
    async (oldPin, newPin) => {
      if (!oldPin || oldPin.length < 4) {
        return { success: false, error: 'Current PIN must be at least 4 digits' };
      }
      if (!newPin || newPin.length < 4) {
        return { success: false, error: 'New PIN must be at least 4 digits' };
      }
      if (newPin.length > 6) {
        return { success: false, error: 'New PIN must be at most 6 digits' };
      }

      const verification = await verifyPin(oldPin);
      if (!verification.success) {
        return { success: false, error: 'Current PIN is incorrect' };
      }

      try {
        const result = await setPin(newPin);

        if (result.success) {
          setIsEnabled(true);
          storage.set(APP_LOCK_KEY, { enabled: true, attempts: 0, lockedUntil: null });
          setAttempts(0);
          setRemainingAttempts(MAX_PIN_ATTEMPTS);
          setIsLockedOut(false);
          setLockedUntil(null);

          await saveToFirebase({ enabled: true, attempts: 0, lockedUntil: null });
        }

        return result;
      } catch (error) {
        logError('Change PIN error', error);
        return { success: false, error: error.message };
      }
    },
    [setPin, verifyPin, saveToFirebase]
  );

  // ============================================================
  // Toggle App Lock
  // ============================================================
  const toggle = useCallback(
    async (pin = null) => {
      const newState = !isEnabled;

      if (newState) {
        if (!pin || pin.length < 4) {
          return { success: false, error: 'PIN must be at least 4 digits' };
        }

        const result = await setPin(pin);
        if (result.success) {
          setIsEnabled(true);
          storage.set(APP_LOCK_KEY, { enabled: true, attempts: 0, lockedUntil: null });
          await saveToFirebase({ enabled: true, attempts: 0, lockedUntil: null });
          return { success: true, enabled: true };
        }
        return result;
      }

      setIsEnabled(false);
      setHasPin(false);
      setPinLength(DEFAULT_PIN_LENGTH);
      setAttempts(0);
      setRemainingAttempts(MAX_PIN_ATTEMPTS);
      setIsLockedOut(false);
      setLockedUntil(null);

      storage.remove(APP_LOCK_KEY);
      storage.remove(PIN_HASH_KEY);
      storage.remove(SESSION_KEY);

      await saveToFirebase({ enabled: false, pinHash: null, pinSalt: null, attempts: 0, lockedUntil: null });

      return { success: true, enabled: false };
    },
    [isEnabled, setPin, saveToFirebase]
  );

  // ============================================================
  // Unlock
  // ============================================================
  const unlock = useCallback(
    async (pin) => {
      if (!isEnabled) return { success: true, unlocked: true };
      return await verifyPin(pin);
    },
    [isEnabled, verifyPin]
  );

  // ============================================================
  // Reset Lockout
  // ============================================================
  const resetLockout = useCallback(async () => {
    setIsLockedOut(false);
    setLockedUntil(null);
    setAttempts(0);
    setRemainingAttempts(MAX_PIN_ATTEMPTS);

    storage.remove(APP_LOCK_KEY);

    if (userId) {
      await saveToFirebase({ enabled: isEnabled, attempts: 0, lockedUntil: null });
    }

    return { success: true };
  }, [isEnabled, userId, saveToFirebase]);

  // ============================================================
  // Clear PIN
  // ============================================================
  const clearPin = useCallback(async () => {
    storage.remove(PIN_HASH_KEY);
    storage.remove(APP_LOCK_KEY);
    storage.remove(SESSION_KEY);
    storage.remove(DEVICE_KEY);

    setHasPin(false);
    setPinLength(DEFAULT_PIN_LENGTH);
    setIsEnabled(false);
    setAttempts(0);
    setRemainingAttempts(MAX_PIN_ATTEMPTS);
    setIsLockedOut(false);
    setLockedUntil(null);
    setSessionToken(null);
    setDeviceId(null);

    if (userId) {
      await saveToFirebase({ enabled: false, pinHash: null, pinSalt: null, attempts: 0, lockedUntil: null });
    }

    return { success: true };
  }, [userId, saveToFirebase]);

  // ============================================================
  // Check Emergency Unlock
  // ============================================================
  const checkEmergencyUnlock = useCallback(async () => {
    if (!userId) return { available: false };

    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return { available: false };

      const data = userSnap.data();
      const emergency = data.appLock?.emergencyUnlock;
      if (!emergency?.enabled) return { available: false };

      const expiresAt = emergency.expiresAt?.toDate?.() || new Date(emergency.expiresAt);
      if (expiresAt < new Date()) {
        await updateDoc(userRef, { 'appLock.emergencyUnlock': null });
        return { available: false };
      }

      return {
        available: true,
        requestedBy: emergency.requestedByEmail || 'Admin',
        requestedAt: emergency.requestedAt?.toDate?.() || new Date(),
        expiresAt,
        remainingMinutes: Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000)),
      };
    } catch (error) {
      logError('Check emergency unlock error', error);
      return { available: false };
    }
  }, [userId]);

  // ============================================================
  // Use Emergency Unlock
  //
  // CRITICAL FIX: this used to clear the local PIN (storage.remove) without
  // disabling `appLock.enabled`. Next app open, the lock screen would
  // reappear asking for a PIN that no longer exists — verifyPin() always
  // returns "No PIN set", permanently locking the user out. Now we also
  // disable app lock (locally + in Firestore) so the user lands in a normal,
  // unlocked app and can set a fresh PIN from Settings whenever they choose.
  // ============================================================
  const useEmergencyUnlock = useCallback(async () => {
    if (!userId) return { success: false, error: 'No user' };

    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return { success: false, error: 'User not found' };

      const data = userSnap.data();
      const emergency = data.appLock?.emergencyUnlock;
      if (!emergency?.enabled) {
        return { success: false, error: 'No emergency unlock available' };
      }

      const expiresAt = emergency.expiresAt?.toDate?.() || new Date(emergency.expiresAt);
      if (expiresAt < new Date()) {
        await updateDoc(userRef, { 'appLock.emergencyUnlock': null });
        return { success: false, error: 'Emergency unlock expired' };
      }

      await updateDoc(userRef, {
        'appLock.emergencyUnlock.usedAt': serverTimestamp(),
        'appLock.emergencyUnlock.enabled': false,
        'appLock.enabled': false,
        'appLock.pinHash': null,
        'appLock.pinSalt': null,
        'appLock.isLocked': false,
        'appLock.lockedUntil': null,
        'appLock.attempts': 0,
      });

      storage.remove(APP_LOCK_KEY);
      storage.remove(PIN_HASH_KEY);
      storage.remove(SESSION_KEY);

      setIsEnabled(false);
      setHasPin(false);
      setIsLockedOut(false);
      setLockedUntil(null);
      setAttempts(0);
      setRemainingAttempts(MAX_PIN_ATTEMPTS);

      return {
        success: true,
        message: 'Emergency unlock successful! Please set a new PIN.',
        requestedBy: emergency.requestedByEmail || 'Admin',
      };
    } catch (error) {
      logError('Emergency unlock error', error);
      return { success: false, error: error.message };
    }
  }, [userId]);

  // ============================================================
  // Return
  // ============================================================
  return {
    isEnabled,
    hasPin,
    pinLength,
    isLoading,
    attempts,
    isLockedOut,
    lockedUntil,
    remainingAttempts,
    sessionToken,
    deviceId,

    setPin,
    verifyPin,
    toggle,
    changePin,
    unlock,
    resetLockout,
    clearPin,

    checkEmergencyUnlock,
    useEmergencyUnlock,

    getLockTimeRemaining: useCallback(() => {
      if (!isLockedOut || !lockedUntil) return 0;
      return Math.max(0, lockedUntil.getTime() - Date.now());
    }, [isLockedOut, lockedUntil]),

    checkLockoutStatus: useCallback(() => {
      if (isLockedOut && lockedUntil) {
        if (lockedUntil.getTime() <= Date.now()) {
          resetLockout();
          return { lockedOut: false };
        }
        return { lockedOut: true, remaining: lockedUntil.getTime() - Date.now() };
      }
      return { lockedOut: false };
    }, [isLockedOut, lockedUntil, resetLockout]),
  };
};

export default useAppLock;











// rules_version = '2';

// service cloud.firestore {
//   match /databases/{database}/documents {

//     // ------------------------------------------------------------
//     // Helpers
//     // ------------------------------------------------------------
//     function isSignedIn() {
//       return request.auth != null;
//     }

//     function isOwner(userId) {
//       return isSignedIn() && request.auth.uid == userId;
//     }

//     function isAdmin() {
//       return isSignedIn() &&
//         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
//         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
//     }

//     // ------------------------------------------------------------
//     // users/{userId}
//     // Fields written by the client (App.js / AuthContext.jsx):
//     //   displayName, photoURL, isOnline, lastSeen, savedPosts,
//     //   notification.token/platform/updatedAt/enabled, fcmToken, fcmUpdatedAt
//     // Fields that must ONLY ever change via admin action or a trusted
//     // backend (Cloud Function) — never directly by the owning client:
//     //   role, isVerified, verificationStatus, isBanned, isBlocked,
//     //   documentVerified, faceVerified, documentsUploaded,
//     //   verificationMethod, completionScore, totalReviews, totalRating,
//     //   averageRating
//     // Without this, a signed-in user could call updateDoc on their own
//     // document and self-verify or clear a ban.
//     // ------------------------------------------------------------
//     function userTrustFieldsUnchanged() {
//       let before = resource.data;
//       let after = request.resource.data;
//       return
//         after.get('role', null) == before.get('role', null) &&
//         after.get('isVerified', null) == before.get('isVerified', null) &&
//         after.get('verificationStatus', null) == before.get('verificationStatus', null) &&
//         after.get('isBanned', null) == before.get('isBanned', null) &&
//         after.get('isBlocked', null) == before.get('isBlocked', null) &&
//         after.get('documentVerified', null) == before.get('documentVerified', null) &&
//         after.get('faceVerified', null) == before.get('faceVerified', null) &&
//         after.get('documentsUploaded', null) == before.get('documentsUploaded', null) &&
//         after.get('verificationMethod', null) == before.get('verificationMethod', null) &&
//         after.get('completionScore', null) == before.get('completionScore', null) &&
//         after.get('totalReviews', null) == before.get('totalReviews', null) &&
//         after.get('totalRating', null) == before.get('totalRating', null) &&
//         after.get('averageRating', null) == before.get('averageRating', null);
//     }

//     match /users/{userId} {
//       // SECURITY: restricted to owner/admin because this document holds
//       // sensitive fields (appLock.pinHash/pinSalt, biometric.credentialId,
//       // notification.token) that must never be readable by other users.
//       // If pages like /profile/:userId need to show public info
//       // (displayName, photoURL, averageRating) for OTHER users, that data
//       // should live in a separate `publicProfiles/{uid}` document (kept in
//       // sync via a Cloud Function) rather than reading this document
//       // directly — tell me if that page needs adjusting and I'll wire it up.
//       allow read: if isOwner(userId) || isAdmin();

//       // New accounts always start unverified, unbanned, role 'client' —
//       // matches ensureUserDocument() in AuthContext.jsx.
//       allow create: if isOwner(userId) &&
//         request.resource.data.role == 'client' &&
//         request.resource.data.isVerified == false &&
//         request.resource.data.isBanned == false &&
//         request.resource.data.isBlocked == false;

//       allow update: if (isOwner(userId) && userTrustFieldsUnchanged()) || isAdmin();

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // posts/{postId}
//     // App.js: any signed-in user can create a post with status 'pending'.
//     // Only an admin may move a post to 'approved' / 'rejected'.
//     // Everyone (incl. signed-out) can read approved posts; owner can read
//     // their own pending/rejected posts.
//     // ------------------------------------------------------------
//     match /posts/{postId} {
//       allow read: if resource.data.status == 'approved'
//         || (isSignedIn() && resource.data.userId == request.auth.uid)
//         || isAdmin();

//       allow create: if isSignedIn() &&
//         request.resource.data.userId == request.auth.uid &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.isPublished == false;

//       // Owner may edit their own pending post's content, but cannot touch
//       // moderation fields. Admin may update moderation fields freely.
//       allow update: if (
//         isSignedIn() &&
//         resource.data.userId == request.auth.uid &&
//         resource.data.status == 'pending' &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.userId == resource.data.userId
//       ) || isAdmin();

//       allow delete: if isSignedIn() && resource.data.userId == request.auth.uid || isAdmin();
//     }

//     // ------------------------------------------------------------
//     // deals/{dealId}
//     // App.js reads deals where the current user is in `participants`.
//     // Only participants (or admin) may read/update a deal; deal creation
//     // and status transitions should generally go through a trusted backend
//     // (Cloud Function) once money is involved — this rule only covers the
//     // client read/update paths actually used by App.js.
//     // ------------------------------------------------------------
//     match /deals/{dealId} {
//       allow read: if isSignedIn() &&
//         request.auth.uid in resource.data.participants;

//       allow create: if isSignedIn() &&
//         request.auth.uid in request.resource.data.participants;

//       allow update: if isSignedIn() &&
//         request.auth.uid in resource.data.participants &&
//         request.auth.uid in request.resource.data.participants;

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // chats/{chatId}
//     // App.js reads chats where the current user is in `participants`, and
//     // reads a per-user unreadCount map keyed by uid.
//     // ------------------------------------------------------------
//     match /chats/{chatId} {
//       allow read: if isSignedIn() &&
//         request.auth.uid in resource.data.participants;

//       allow create: if isSignedIn() &&
//         request.auth.uid in request.resource.data.participants;

//       // Participants can update the chat (send messages, adjust their own
//       // unreadCount entry) but cannot remove other participants or edit
//       // someone else's unread counter.
//       allow update: if isSignedIn() &&
//         request.auth.uid in resource.data.participants &&
//         request.auth.uid in request.resource.data.participants;

//       allow delete: if false; // chats are never hard-deleted from the client
//     }

//     // ------------------------------------------------------------
//     // Default deny — anything not explicitly matched above is blocked.
//     // ------------------------------------------------------------
//     match /{document=**} {
//       allow read, write: if false;
//     }
//   }
// }
