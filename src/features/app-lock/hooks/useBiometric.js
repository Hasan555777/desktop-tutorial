// src/hooks/useBiometric.js

import { useState, useEffect, useCallback } from 'react';
import { db } from '../../../shared/firebase/index';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../../shared/context/AuthContext';
import { logError } from '../../../shared/utils/logger';

import { storage } from '../../../shared/security/storage';
import { BIOMETRIC_CREDENTIAL_ID_KEY } from '../../../shared/security/constants';

// ============================================================
// Constants
// ============================================================
const BIOMETRIC_TYPE_KEY = 'workhub_biometric_type';

// ============================================================
// Helpers
// ============================================================
const generateChallenge = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return array;
};

// Deterministic, unique WebAuthn user.id bytes derived from the Firebase
// uid. Previously this was always an empty 16-byte buffer, meaning every
// account on the same device registered under the same WebAuthn identity —
// on a shared/multi-account device, one account's fingerprint could unlock
// a different account.
const getUserIdBytes = (uid) => {
  const safeUid = uid || 'anonymous';
  const encoder = new TextEncoder();
  return encoder.encode(safeUid).slice(0, 64);
};

const decodeCredentialId = (credentialId) => {
  try {
    return new Uint8Array(
      atob(credentialId)
        .split('')
        .map((c) => c.charCodeAt(0))
    );
  } catch {
    return new Uint8Array([]);
  }
};

const getErrorMessage = (error) => {
  switch (error.name) {
    case 'NotAllowedError':
      return 'আপনি বায়োমেট্রিক অ্যাক্সেস ডিনাই করেছেন। সেটিংস থেকে অনুমতি দিন।';
    case 'NotSupportedError':
      return 'আপনার ডিভাইসে বায়োমেট্রিক সাপোর্টেড নয়।';
    case 'SecurityError':
      return 'সিকিউরিটি ইস্যু। HTTPS ব্যবহার করুন।';
    case 'TimeoutError':
      return 'সময় শেষ! আবার চেষ্টা করুন।';
    case 'InvalidStateError':
      return 'ইতিমধ্যে একটি যাচাই প্রক্রিয়া চলছে।';
    default:
      return error.message || 'বায়োমেট্রিক যাচাই ব্যর্থ হয়েছে।';
  }
};

const detectBiometricType = () => {
  const ua = navigator.userAgent;

  if (/iPhone|iPad|iPod/.test(ua)) {
    if (ua.includes('FaceID') || /iPhone (X|11|12|13|14|15|16)/.test(ua)) return 'face';
    return 'fingerprint';
  }

  if (/Android/.test(ua)) {
    if (/fingerprint/i.test(ua)) return 'fingerprint';
    if (/face/i.test(ua)) return 'face';
    if (/iris/i.test(ua)) return 'iris';
    return 'fingerprint';
  }

  if (/Windows/.test(ua) && ua.includes('Hello')) return 'face';
  if (/Mac/.test(ua)) return 'fingerprint';

  return 'unknown';
};

// ============================================================
// useBiometric Hook
// ============================================================

export const useBiometric = () => {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || null;

  const [isSupported, setIsSupported] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [credentialId, setCredentialId] = useState(null);

  // ============================================================
  // Save to Firebase
  //
  // CRITICAL: same nested-map overwrite issue as useAppLock.js — updateDoc
  // replaces a non-dotted nested object wholesale. A plain "update lastUsed
  // on successful auth" call used to wipe out `type`/`credentialId` that a
  // previous registerBiometric() call had saved. Dot-notation paths make
  // every call a true partial update instead.
  // ============================================================
  const saveToFirebase = useCallback(
    async (data) => {
      if (!userId) return false;

      try {
        const userRef = doc(db, 'users', userId);
        const updates = {};
        Object.entries(data).forEach(([key, value]) => {
          updates[`biometric.${key}`] = value;
        });
        updates['biometric.updatedAt'] = serverTimestamp();

        await updateDoc(userRef, updates);
        return true;
      } catch (err) {
        logError('Biometric Firebase save error', err);
        return false;
      }
    },
    [userId]
  );

  // ============================================================
  // Register Biometric
  // ============================================================
  const registerBiometric = useCallback(async () => {
    if (!isAvailable) {
      setError('বায়োমেট্রিক উপলব্ধ নেই');
      return { success: false, error: 'Biometric not available' };
    }

    try {
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported');
      }

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: generateChallenge(),
          rp: { name: 'WorkTrustbd', id: window.location.hostname },
          user: {
            id: getUserIdBytes(userId),
            name: currentUser?.email || 'user',
            displayName: currentUser?.displayName || 'User',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
          attestation: 'none',
          excludeCredentials: credentialId ? [{ type: 'public-key', id: decodeCredentialId(credentialId) }] : [],
        },
      });

      if (credential) {
        const id = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

        storage.set(BIOMETRIC_CREDENTIAL_ID_KEY, id);
        setCredentialId(id);

        if (biometricType) {
          localStorage.setItem(BIOMETRIC_TYPE_KEY, biometricType);
        }

        setIsEnabled(true);

        await saveToFirebase({
          enabled: true,
          type: biometricType,
          credentialId: id,
          registeredAt: serverTimestamp(),
        });

        return { success: true, credential: id };
      }

      return { success: false, error: 'Registration failed' };
    } catch (err) {
      logError('Biometric registration error', err);
      const message = getErrorMessage(err);
      setError(message);
      return { success: false, error: message };
    }
  }, [isAvailable, biometricType, credentialId, userId, currentUser, saveToFirebase]);

  // ============================================================
  // Authenticate with Biometric
  // ============================================================
  const authenticate = useCallback(async () => {
    if (!isAvailable) return false;
    if (!credentialId) return false;

    try {
      if (!window.PublicKeyCredential) return false;

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: generateChallenge(),
          rpId: window.location.hostname,
          timeout: 30000,
          userVerification: 'required',
          allowCredentials: [{ type: 'public-key', id: decodeCredentialId(credentialId) }],
        },
      });

      if (credential) {
        await saveToFirebase({ enabled: true, lastUsed: serverTimestamp() });
        return true;
      }
      return false;
    } catch (err) {
      if (err.name !== 'NotAllowedError' && err.name !== 'NotSupportedError') {
        logError('Biometric authentication error', err);
        setError(getErrorMessage(err));
      }
      return false;
    }
  }, [isAvailable, credentialId, saveToFirebase]);

  // ============================================================
  // Toggle Biometric
  // ============================================================
  const toggle = useCallback(async () => {
    const newState = !isEnabled;

    if (newState) {
      const result = await registerBiometric();
      if (result.success) return { success: true, enabled: true };
      return { success: false, enabled: false, error: result.error };
    }

    setIsEnabled(false);
    storage.remove(BIOMETRIC_CREDENTIAL_ID_KEY);
    setCredentialId(null);
    localStorage.removeItem(BIOMETRIC_TYPE_KEY);

    await saveToFirebase({ enabled: false, credentialId: null });

    return { success: true, enabled: false };
  }, [isEnabled, registerBiometric, saveToFirebase]);

  // ============================================================
  // Check Biometric Support
  // ============================================================
  const checkBiometricSupport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const webauthnSupported =
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

      let available = false;
      if (webauthnSupported) {
        try {
          available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        } catch (err) {
          logError('WebAuthn availability check failed', err);
          available = false;
        }
      }

      setIsAvailable(available);

      if (available) {
        setIsSupported(true);
        setBiometricType(detectBiometricType());
      } else {
        setIsSupported(false);
      }

      const savedCredentialId = storage.get(BIOMETRIC_CREDENTIAL_ID_KEY);
      if (savedCredentialId) {
        setCredentialId(savedCredentialId);
        setIsEnabled(true);
      } else {
        setIsEnabled(false);
      }

      const savedType = localStorage.getItem(BIOMETRIC_TYPE_KEY);
      if (savedType) setBiometricType(savedType);
    } catch (err) {
      logError('Biometric check error', err);
      setError(err.message);
      setIsSupported(false);
      setIsAvailable(false);
      setIsEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getBiometricLabel = useCallback(() => {
    switch (biometricType) {
      case 'fingerprint':
        return '🔐 ফিঙ্গারপ্রিন্ট লক';
      case 'face':
        return '😊 ফেস লক';
      case 'iris':
        return '👁️ আইরিস লক';
      default:
        return '🔐 বায়োমেট্রিক লক';
    }
  }, [biometricType]);

  const getBiometricIcon = useCallback(() => {
    switch (biometricType) {
      case 'fingerprint':
        return 'fa-solid fa-fingerprint';
      case 'face':
        return 'fa-solid fa-face-smile';
      case 'iris':
        return 'fa-regular fa-eye';
      default:
        return 'fa-solid fa-lock';
    }
  }, [biometricType]);

  useEffect(() => {
    checkBiometricSupport();
  }, [checkBiometricSupport]);

  return {
    isSupported,
    isAvailable,
    isEnabled,
    biometricType,
    isLoading,
    error,
    credentialId,

    authenticate,
    toggle,
    registerBiometric,
    checkBiometricSupport,
    getBiometricLabel,
    getBiometricIcon,
  };
};

export default useBiometric;