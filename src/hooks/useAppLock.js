// src/hooks/useAppLock.js

import { useState, useEffect, useCallback } from 'react';
import { auth, db } from '@/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// ✅ New Security Module imports
import { storage } from '@/security/storage';
import { 
  APP_LOCK_KEY, 
  PIN_HASH_KEY,
  MAX_PIN_ATTEMPTS,
  LOCK_DURATION,
  SESSION_KEY,
  DEVICE_KEY
} from '@/security/constants';
// ✅ FIX: verifyPin → verifyPinHash (rename করে import)
import { hashPin, verifyPin as verifyPinHash, generateSalt, generateSecureToken } from '@/security/crypto';
import device from '@/security/device';

// ✅ FIX: PIN দৈর্ঘ্য জানার কোনো উপায় ছিল না (AppLockScreen সবসময় ধরে নিত ৪ ডিজিট)।
// PIN সেট করার সময় length (সংবেদনশীল নয়, শুধু সংখ্যা) হ্যাশের পাশাপাশি সংরক্ষণ করা হচ্ছে,
// যাতে unlock স্ক্রিন জানে ঠিক কতটা ডিজিট আসার পর ভেরিফাই করতে হবে।
const DEFAULT_PIN_LENGTH = 4;

// ============================================================
// 🎯 useAppLock Hook V2
// ============================================================

export const useAppLock = () => {
  const user = auth.currentUser;
  
  // ── States ──
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
  // ✅ Load Settings from Secure Storage
  // ============================================================

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      
      try {
        const lockData = storage.get(APP_LOCK_KEY);
        const pinData = storage.get(PIN_HASH_KEY);
        const sessionData = storage.get(SESSION_KEY);
        const deviceData = storage.get(DEVICE_KEY);
        
        if (lockData?.enabled) {
          setIsEnabled(true);
        }
        
        if (pinData?.hash) {
          setHasPin(true);
          // ✅ FIX: PIN সেট করার সময় যে length সংরক্ষণ করা হয়েছিল সেটা লোড করা হচ্ছে
          setPinLength(pinData.length || DEFAULT_PIN_LENGTH);
        }
        
        if (sessionData?.token) {
          setSessionToken(sessionData.token);
        }
        
        if (deviceData?.id) {
          setDeviceId(deviceData.id);
        }
        
        // ✅ FIX: আগে locked out না থাকলে attempts কখনো storage থেকে লোড হতো না,
        // সবসময় ডিফল্ট 0 ধরে নিত। এখন locked/unlocked দুই ক্ষেত্রেই attempts সঠিকভাবে লোড হয়।
        if (lockData?.lockedUntil && lockData.lockedUntil > Date.now()) {
          setIsLockedOut(true);
          setLockedUntil(new Date(lockData.lockedUntil));
          setAttempts(lockData.attempts || 0);
          setRemainingAttempts(Math.max(0, MAX_PIN_ATTEMPTS - (lockData.attempts || 0)));
        } else {
          if (lockData?.lockedUntil) {
            // lockout মেয়াদ শেষ — পুরনো lock data মুছে ফেলা হচ্ছে
            storage.remove(APP_LOCK_KEY);
          }
          setIsLockedOut(false);
          setLockedUntil(null);
          setAttempts(lockData?.attempts || 0);
          setRemainingAttempts(Math.max(0, MAX_PIN_ATTEMPTS - (lockData?.attempts || 0)));
        }
        
        if (user?.uid) {
          await syncWithFirebase();
        }
        
      } catch (error) {
        console.error('❌ Error loading app lock settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  // ============================================================
  // ✅ Sync with Firebase
  // ============================================================

  const syncWithFirebase = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        
        if (data.appLock?.enabled) {
          setIsEnabled(true);
          if (data.appLock?.pinHash) {
            setHasPin(true);
          }
        }
      }
    } catch (error) {
      console.error('❌ Firebase sync error:', error);
    }
  }, [user]);

  // ============================================================
  // ✅ Save to Firebase
  // ============================================================

  const saveToFirebase = useCallback(async (data) => {
    if (!user?.uid) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        appLock: {
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
  // ✅ Set PIN (V2 - With Hashing + Device Info)
  // ============================================================

  const setPin = useCallback(async (pin) => {
    if (!pin || pin.length < 4) {
      return { success: false, error: 'PIN must be at least 4 digits' };
    }

    try {
      const salt = generateSalt();
      const result = await hashPin(pin, salt);
      
      // ✅ FIX: PIN-এর দৈর্ঘ্য (শুধু সংখ্যা, PIN নিজে নয়) সংরক্ষণ করা হচ্ছে
      // যাতে unlock screen জানে কখন সম্পূর্ণ PIN এসেছে
      storage.set(PIN_HASH_KEY, {
        hash: result.hash,
        salt: result.salt,
        iterations: result.iterations,
        algorithm: result.algorithm,
        length: pin.length
      });
      
      setHasPin(true);
      setPinLength(pin.length);
      
      const deviceId = device.getDeviceId();
      const deviceInfo = await device.collectDeviceInfo();
      const deviceFingerprint = await device.generateDeviceFingerprint(deviceInfo);
      
      await saveToFirebase({
        enabled: true,
        pinHash: result.hash,
        pinSalt: result.salt,
        iterations: result.iterations,
        algorithm: result.algorithm,
        pinLength: pin.length,
        deviceId: deviceId,
        deviceFingerprint: deviceFingerprint,
        deviceName: deviceInfo.name,
        devicePlatform: deviceInfo.platform,
        deviceOS: deviceInfo.os,
        deviceBrowser: deviceInfo.browser
      });
      
      await device.trustCurrentDevice();
      
      return { success: true };
    } catch (error) {
      console.error('❌ Set PIN error:', error);
      return { success: false, error: error.message };
    }
  }, [saveToFirebase]);

  // ============================================================
  // ✅ Verify PIN (V2 - With Hashing) - FIXED
  // ============================================================

  const verifyPin = useCallback(async (pin) => {
    // ✅ Check if locked out
    if (isLockedOut) {
      const now = Date.now();
      if (lockedUntil && lockedUntil.getTime() > now) {
        const remaining = Math.ceil((lockedUntil.getTime() - now) / 1000 / 60);
        return { 
          success: false, 
          error: `Too many attempts. Try again in ${remaining} minutes`,
          lockedOut: true,
          remainingMinutes: remaining
        };
      } else {
        setIsLockedOut(false);
        setLockedUntil(null);
        storage.remove(APP_LOCK_KEY);
        setAttempts(0);
        setRemainingAttempts(MAX_PIN_ATTEMPTS);
      }
    }

    // ✅ Get stored hash
    const pinData = storage.get(PIN_HASH_KEY);
    
    if (!pinData?.hash) {
      return { success: false, error: 'No PIN set' };
    }

    try {
      // ✅ FIX: verifyPinHash ব্যবহার করুন (crypto থেকে)
      const isValid = await verifyPinHash(pin, pinData.hash, pinData.salt);
      
      if (isValid) {
        // ✅ Success - Reset attempts
        storage.remove(APP_LOCK_KEY);
        setAttempts(0);
        setRemainingAttempts(MAX_PIN_ATTEMPTS);
        
        const token = generateSecureToken();
        storage.set(SESSION_KEY, { token, createdAt: Date.now() });
        setSessionToken(token);
        
        device.updateLastActive();
        
        return { success: true };
      }

      // ✅ Failed attempt
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setRemainingAttempts(Math.max(0, MAX_PIN_ATTEMPTS - newAttempts));
      
      storage.set(APP_LOCK_KEY, {
        enabled: true,
        attempts: newAttempts,
        lockedUntil: null
      });

      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        const lockTime = Date.now() + LOCK_DURATION;
        setIsLockedOut(true);
        setLockedUntil(new Date(lockTime));
        
        storage.set(APP_LOCK_KEY, {
          enabled: true,
          attempts: newAttempts,
          lockedUntil: lockTime
        });
        
        await saveToFirebase({
          enabled: true,
          lockedUntil: lockTime,
          attempts: newAttempts,
          lastAttempt: serverTimestamp()
        });
        
        return { 
          success: false, 
          error: `Too many failed attempts. Locked for 5 minutes`,
          lockedOut: true,
          remainingMinutes: 5
        };
      }

      return { 
        success: false, 
        error: `Invalid PIN. ${MAX_PIN_ATTEMPTS - newAttempts} attempts remaining`,
        remainingAttempts: MAX_PIN_ATTEMPTS - newAttempts
      };
      
    } catch (error) {
      console.error('❌ PIN verification error:', error);
      return { success: false, error: 'Verification failed' };
    }
  }, [attempts, isLockedOut, lockedUntil, saveToFirebase]);

  // ============================================================
  // ✅ Change PIN (NEW - Without toggling enabled state)
  // ⚠️ MUST BE DEFINED AFTER verifyPin
  // ============================================================

  const changePin = useCallback(async (oldPin, newPin) => {
    if (!oldPin || oldPin.length < 4) {
      return { success: false, error: 'Current PIN must be at least 4 digits' };
    }
    
    if (!newPin || newPin.length < 4) {
      return { success: false, error: 'New PIN must be at least 4 digits' };
    }

    if (newPin.length > 6) {
      return { success: false, error: 'New PIN must be at most 6 digits' };
    }

    // ✅ Verify old PIN first - verifyPin is now defined above
    const verification = await verifyPin(oldPin);
    if (!verification.success) {
      return { success: false, error: 'Current PIN is incorrect' };
    }
    
    try {
      // ✅ Set new PIN using existing setPin
      const result = await setPin(newPin);
      
      if (result.success) {
        // ✅ Keep app lock enabled - don't toggle
        setIsEnabled(true);
        storage.set(APP_LOCK_KEY, { 
          enabled: true, 
          attempts: 0, 
          lockedUntil: null 
        });
        setAttempts(0);
        setRemainingAttempts(MAX_PIN_ATTEMPTS);
        setIsLockedOut(false);
        setLockedUntil(null);
        
        // ✅ Update Firebase
        await saveToFirebase({
          enabled: true,
          attempts: 0,
          lockedUntil: null
        });
      }
      
      return result;
    } catch (error) {
      console.error('❌ Change PIN error:', error);
      return { success: false, error: error.message };
    }
  }, [setPin, verifyPin, saveToFirebase]);

  // ============================================================
  // ✅ Toggle App Lock
  // ============================================================

  const toggle = useCallback(async (pin = null) => {
    const newState = !isEnabled;
    
    if (newState) {
      if (!pin || pin.length < 4) {
        return { success: false, error: 'PIN must be at least 4 digits' };
      }
      
      const result = await setPin(pin);
      if (result.success) {
        setIsEnabled(true);
        storage.set(APP_LOCK_KEY, { enabled: true, attempts: 0, lockedUntil: null });
        
        await saveToFirebase({
          enabled: true,
          attempts: 0,
          lockedUntil: null
        });
        
        return { success: true, enabled: true };
      }
      return result;
    } else {
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
      
      await saveToFirebase({
        enabled: false,
        pinHash: null,
        pinSalt: null,
        attempts: 0,
        lockedUntil: null
      });
      
      return { success: true, enabled: false };
    }
  }, [isEnabled, setPin, saveToFirebase]);

  // ============================================================
  // ✅ Unlock
  // ============================================================

  const unlock = useCallback(async (pin) => {
    if (!isEnabled) {
      return { success: true, unlocked: true };
    }
    return await verifyPin(pin);
  }, [isEnabled, verifyPin]);

  // ============================================================
  // ✅ Reset Lockout
  // ============================================================

  const resetLockout = useCallback(async () => {
    setIsLockedOut(false);
    setLockedUntil(null);
    setAttempts(0);
    setRemainingAttempts(MAX_PIN_ATTEMPTS);
    
    storage.remove(APP_LOCK_KEY);
    
    if (user?.uid) {
      await saveToFirebase({
        enabled: isEnabled,
        attempts: 0,
        lockedUntil: null
      });
    }
    
    return { success: true };
  }, [isEnabled, user, saveToFirebase]);

  // ============================================================
  // ✅ Clear PIN
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
    
    if (user?.uid) {
      await saveToFirebase({
        enabled: false,
        pinHash: null,
        pinSalt: null,
        attempts: 0,
        lockedUntil: null
      });
    }
    
    return { success: true };
  }, [user, saveToFirebase]);

  // ============================================================
  // ✅ Check Emergency Unlock
  // ============================================================

  const checkEmergencyUnlock = useCallback(async () => {
    if (!user?.uid) return { available: false };

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return { available: false };
      
      const data = userSnap.data();
      const emergency = data.appLock?.emergencyUnlock;
      
      if (!emergency?.enabled) return { available: false };
      
      // Check if expired
      const expiresAt = emergency.expiresAt?.toDate?.() || new Date(emergency.expiresAt);
      if (expiresAt < new Date()) {
        // Auto-clear expired unlock
        await updateDoc(userRef, {
          'appLock.emergencyUnlock': null
        });
        return { available: false };
      }
      
      return {
        available: true,
        requestedBy: emergency.requestedByEmail || 'Admin',
        requestedAt: emergency.requestedAt?.toDate?.() || new Date(),
        expiresAt: expiresAt,
        remainingMinutes: Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000))
      };
    } catch (error) {
      console.error('❌ Check emergency unlock error:', error);
      return { available: false };
    }
  }, [user]);

  // ============================================================
  // ✅ Use Emergency Unlock
  // ============================================================

  const useEmergencyUnlock = useCallback(async () => {
    if (!user?.uid) return { success: false, error: 'No user' };

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return { success: false, error: 'User not found' };
      
      const data = userSnap.data();
      const emergency = data.appLock?.emergencyUnlock;
      
      if (!emergency?.enabled) {
        return { success: false, error: 'No emergency unlock available' };
      }
      
      // Check expiry
      const expiresAt = emergency.expiresAt?.toDate?.() || new Date(emergency.expiresAt);
      if (expiresAt < new Date()) {
        await updateDoc(userRef, {
          'appLock.emergencyUnlock': null
        });
        return { success: false, error: 'Emergency unlock expired' };
      }
      
      // ✅ Use the unlock - clear emergency flag and unlock
      await updateDoc(userRef, {
        'appLock.emergencyUnlock.usedAt': serverTimestamp(),
        'appLock.emergencyUnlock.enabled': false,
        'appLock.isLocked': false,
        'appLock.lockedUntil': null,
        'appLock.attempts': 0
      });
      
      // Also clear local storage
      storage.remove(APP_LOCK_KEY);
      storage.remove(PIN_HASH_KEY);
      storage.remove(SESSION_KEY);
      
      // Update local state
      setIsLockedOut(false);
      setLockedUntil(null);
      setAttempts(0);
      setRemainingAttempts(MAX_PIN_ATTEMPTS);
      
      return { 
        success: true, 
        message: 'Emergency unlock successful! Please set a new PIN.',
        requestedBy: emergency.requestedByEmail || 'Admin'
      };
    } catch (error) {
      console.error('❌ Emergency unlock error:', error);
      return { success: false, error: error.message };
    }
  }, [user]);

  // ============================================================
  // ✅ Return
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
    
    // ✅ Emergency Unlock Functions
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