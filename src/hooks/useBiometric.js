// src/hooks/useBiometric.js

import { useState, useEffect, useCallback } from 'react';
import { auth, db } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

// ✅ Security Module imports
import { storage } from '@/security/storage';
import { BIOMETRIC_CREDENTIAL_ID_KEY } from '@/security/constants';
import { generateSecureToken } from '@/security/crypto';

// ============================================================
// 📦 Constants
// ============================================================

const BIOMETRIC_STORAGE_KEY = 'workhub_biometric_enabled';
const BIOMETRIC_TYPE_KEY = 'workhub_biometric_type';

// ============================================================
// 🔐 Helper Functions
// ============================================================

const generateChallenge = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return array;
};

// ✅ FIX: আগে user.id সবসময় খালি Uint8Array(16) (সব-জিরো) পাঠানো হতো —
// অর্থাৎ WebAuthn-এর কাছে সব ইউজার একই "id" দিয়ে রেজিস্টার হতো। এই
// ডিভাইসে একাধিক অ্যাকাউন্ট ব্যবহার করা হলে biometric credential
// account-এর সাথে ভুলভাবে mix/override হয়ে যেতে পারত (এক অ্যাকাউন্টের
// আঙুলের ছাপ দিয়ে অন্য অ্যাকাউন্ট খুলে যাওয়ার ঝুঁকি)।
// এখন Firebase uid থেকে deterministic, unique bytes তৈরি করা হচ্ছে।
const getUserIdBytes = (uid) => {
  const safeUid = uid || 'anonymous';
  const encoder = new TextEncoder();
  const encoded = encoder.encode(safeUid);
  // WebAuthn user.id সর্বোচ্চ 64 বাইট পর্যন্ত হতে পারে
  return encoded.slice(0, 64);
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
  
  // iOS
  if (/iPhone|iPad|iPod/.test(ua)) {
    if (ua.includes('FaceID') || /iPhone (X|11|12|13|14|15|16)/.test(ua)) {
      return 'face';
    }
    return 'fingerprint';
  }
  
  // Android
  if (/Android/.test(ua)) {
    if (/fingerprint/i.test(ua)) return 'fingerprint';
    if (/face/i.test(ua)) return 'face';
    if (/iris/i.test(ua)) return 'iris';
    return 'fingerprint';
  }
  
  // Windows Hello
  if (/Windows/.test(ua) && ua.includes('Hello')) {
    return 'face';
  }
  
  // Mac
  if (/Mac/.test(ua)) {
    return 'fingerprint';
  }
  
  return 'unknown';
};

// ============================================================
// 🎯 useBiometric Hook V2 - FIXED
// ============================================================

export const useBiometric = () => {
  const user = auth.currentUser;
  
  // ── States ──
  const [isSupported, setIsSupported] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [credentialId, setCredentialId] = useState(null);

  // ============================================================
  // ✅ Save to Firebase
  // ============================================================

  const saveToFirebase = useCallback(async (data) => {
    if (!user?.uid) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        biometric: {
          ...data,
          updatedAt: serverTimestamp()
        }
      });
      return true;
    } catch (error) {
      console.error('❌ Firebase save error:', error);
      return false;
    }
  }, [user]);

  // ============================================================
  // ✅ Register Biometric
  // ============================================================

  const registerBiometric = useCallback(async () => {
    if (!isAvailable) {
      setError('বায়োমেট্রিক উপলব্ধ নেই');
      return { success: false, error: 'Biometric not available' };
    }

    try {
      // ✅ Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported');
      }

      // ✅ WebAuthn registration
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: generateChallenge(),
          rp: {
            name: 'WorkTrustbd',
            id: window.location.hostname,
          },
          user: {
            // ✅ FIX: uid থেকে unique id তৈরি — আগে সবসময় খালি bytes ছিল
            id: getUserIdBytes(user?.uid),
            name: user?.email || 'user',
            displayName: user?.displayName || 'User',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
          attestation: 'none',
          excludeCredentials: credentialId ? [{
            type: 'public-key',
            id: new Uint8Array(
              (() => {
                try {
                  return atob(credentialId).split('').map(c => c.charCodeAt(0));
                } catch {
                  return [];
                }
              })()
            )
          }] : [],
        }
      });

      if (credential) {
        const id = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        
        // ✅ Save credential ID to secure storage
        storage.set(BIOMETRIC_CREDENTIAL_ID_KEY, id);
        setCredentialId(id);
        
        // ✅ Save biometric type
        if (biometricType) {
          localStorage.setItem(BIOMETRIC_TYPE_KEY, biometricType);
        }
        
        // ✅ Enable biometric (only if credential exists)
        setIsEnabled(true);
        
        await saveToFirebase({
          enabled: true,
          type: biometricType,
          credentialId: id,
          registeredAt: serverTimestamp()
        });
        
        return { success: true, credential: id };
      }

      return { success: false, error: 'Registration failed' };

    } catch (error) {
      console.error('❌ Biometric registration error:', error);
      setError(getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  }, [isAvailable, biometricType, credentialId, user, saveToFirebase]);

  // ============================================================
  // ✅ Authenticate with Biometric - FIXED
  // ============================================================

  const authenticate = useCallback(async () => {
    // ❌ BUG 1 FIXED: Check if biometric is available AND enabled
    if (!isAvailable) {
      console.warn('⚠️ Biometric not available');
      return false;
    }

    // ❌ BUG 3 FIXED: Check if credential ID exists
    if (!credentialId) {
      console.warn('⚠️ No biometric credential found');
      return false;
    }

    try {
      // ✅ Check WebAuthn support
      if (!window.PublicKeyCredential) {
        console.warn('⚠️ WebAuthn not supported');
        return false;
      }

      // ✅ WebAuthn authentication
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: generateChallenge(),
          rpId: window.location.hostname,
          timeout: 30000,
          userVerification: 'required',
          allowCredentials: [{
            type: 'public-key',
            id: new Uint8Array(
              (() => {
                try {
                  return atob(credentialId).split('').map(c => c.charCodeAt(0));
                } catch {
                  return [];
                }
              })()
            ),
          }],
        }
      });
      
      if (credential) {
        // ✅ Update last used
        await saveToFirebase({
          enabled: true,
          lastUsed: serverTimestamp()
        });
        return true;
      }
      return false;

    } catch (error) {
      if (error.name === 'NotAllowedError') {
        console.warn('⚠️ Biometric authentication cancelled by user');
      } else if (error.name === 'NotSupportedError') {
        console.warn('⚠️ Biometric not supported on this device');
      } else {
        console.error('❌ Biometric authentication error:', error);
        setError(getErrorMessage(error));
      }
      return false;
    }
  }, [isAvailable, credentialId, saveToFirebase]);

  // ============================================================
  // ✅ Toggle Biometric - FIXED
  // ============================================================

  const toggle = useCallback(async () => {
    const newState = !isEnabled;
    
    if (newState) {
      const result = await registerBiometric();
      if (result.success) {
        return { success: true, enabled: true };
      }
      return { success: false, enabled: false, error: result.error };
    } else {
      // ❌ BUG 2 FIXED: Disable biometric properly
      setIsEnabled(false);
      
      // ✅ Clear credential from secure storage
      storage.remove(BIOMETRIC_CREDENTIAL_ID_KEY);
      setCredentialId(null);
      
      // ✅ Clear old localStorage keys
      localStorage.removeItem(BIOMETRIC_STORAGE_KEY);
      localStorage.removeItem(BIOMETRIC_TYPE_KEY);
      
      await saveToFirebase({
        enabled: false,
        credentialId: null
      });
      
      return { success: true, enabled: false };
    }
  }, [isEnabled, registerBiometric, saveToFirebase]);

  // ============================================================
  // ✅ Check Biometric Support - FIXED
  // ============================================================

  const checkBiometricSupport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // ✅ Check WebAuthn support
      const webauthnSupported = 
        window.PublicKeyCredential && 
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

      let available = false;

      if (webauthnSupported) {
        try {
          available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        } catch (error) {
          console.warn('⚠️ WebAuthn check error:', error);
          available = false;
        }
      }

      setIsAvailable(available);
      
      if (available) {
        setIsSupported(true);
        const type = detectBiometricType();
        setBiometricType(type);
      } else {
        setIsSupported(false);
      }

      // ❌ BUG 2 FIXED: Check credential from secure storage, not localStorage
      const savedCredentialId = storage.get(BIOMETRIC_CREDENTIAL_ID_KEY);
      if (savedCredentialId) {
        setCredentialId(savedCredentialId);
        setIsEnabled(true);
      } else {
        setIsEnabled(false);
      }

      // ✅ Load saved type (optional, for display)
      const savedType = localStorage.getItem(BIOMETRIC_TYPE_KEY);
      if (savedType) {
        setBiometricType(savedType);
      }

    } catch (error) {
      console.error('❌ Biometric check error:', error);
      setError(error.message);
      setIsSupported(false);
      setIsAvailable(false);
      setIsEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ============================================================
  // ✅ Get Biometric Label & Icon
  // ============================================================

  const getBiometricLabel = useCallback(() => {
    switch (biometricType) {
      case 'fingerprint': return '🔐 ফিঙ্গারপ্রিন্ট লক';
      case 'face': return '😊 ফেস লক';
      case 'iris': return '👁️ আইরিস লক';
      default: return '🔐 বায়োমেট্রিক লক';
    }
  }, [biometricType]);

  const getBiometricIcon = useCallback(() => {
    switch (biometricType) {
      case 'fingerprint': return 'fa-solid fa-fingerprint';
      case 'face': return 'fa-solid fa-face-smile';
      case 'iris': return 'fa-regular fa-eye';
      default: return 'fa-solid fa-lock';
    }
  }, [biometricType]);

  // ============================================================
  // ✅ Initialize on Mount
  // ============================================================

  useEffect(() => {
    checkBiometricSupport();
  }, [checkBiometricSupport]);

  // ============================================================
  // ✅ Return
  // ============================================================

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