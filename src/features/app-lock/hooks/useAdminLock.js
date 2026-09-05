// src/hooks/useAdminLock.js
//
// New (admin dashboard lock security requirement) — separate,
// admin-scoped lock on top of the existing App Lock system (that one
// guards the whole app for regular users; this one specifically
// guards the /admin route, on-demand, with its own password + a
// recovery password set in advance). Reuses hashPin/verifyPin from
// security/crypto.js (the same PBKDF2 hashing already used for the
// app lock PIN) rather than inventing a new hashing scheme.
//
// Storage: users/{uid}.adminLock = {
//   enabled, passwordHash, passwordSalt,
//   recoveryHash, recoverySalt, lockedAt
// }
// Already covered by the existing users/{userId} Firestore rule
// (owner can update their own doc except role) — no rules change
// needed since this is just more fields on the same document.

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../shared/firebase/index';
import { hashPin, verifyPin } from '../../../shared/security/crypto';
import { logger } from '../../../shared/utils/logger';

export const useAdminLock = (currentUser) => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadState = useCallback(async () => {
    if (!currentUser?.uid) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'users', currentUser.uid));
      const adminLock = snap.exists() ? snap.data().adminLock : null;
      setIsConfigured(!!adminLock?.enabled);
      setIsLocked(!!adminLock?.enabled && !!adminLock?.lockedAt);
    } catch (error) {
      logger.error('Failed to load admin lock state:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => { loadState(); }, [loadState]);

  // ── First-time setup: admin sets both their unlock password and a
  // recovery password (used only if they forget the first one). ──
  const setupLock = useCallback(async (password, recoveryPassword) => {
    if (!currentUser?.uid) return { success: false, error: 'Not authenticated' };
    if (!password || password.length < 6) {
      return { success: false, error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে' };
    }
    if (!recoveryPassword || recoveryPassword.length < 6) {
      return { success: false, error: 'রিকভারি পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে' };
    }
    if (password === recoveryPassword) {
      return { success: false, error: 'পাসওয়ার্ড এবং রিকভারি পাসওয়ার্ড আলাদা হতে হবে' };
    }
    try {
      const passwordHashed = await hashPin(password);
      const recoveryHashed = await hashPin(recoveryPassword);
      await updateDoc(doc(db, 'users', currentUser.uid), {
        adminLock: {
          enabled: true,
          passwordHash: passwordHashed.hash,
          passwordSalt: passwordHashed.salt,
          recoveryHash: recoveryHashed.hash,
          recoverySalt: recoveryHashed.salt,
          lockedAt: null,
          createdAt: serverTimestamp(),
        },
      });
      setIsConfigured(true);
      return { success: true };
    } catch (error) {
      logger.error('Admin lock setup error:', error);
      return { success: false, error: 'সেটআপ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' };
    }
  }, [currentUser?.uid]);

  // ── Lock the dashboard on demand ──
  const lockDashboard = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        'adminLock.lockedAt': serverTimestamp(),
      });
      setIsLocked(true);
    } catch (error) {
      logger.error('Admin lock error:', error);
    }
  }, [currentUser?.uid]);

  // ── Unlock with the normal password ──
  const unlockDashboard = useCallback(async (password) => {
    if (!currentUser?.uid) return { success: false, error: 'Not authenticated' };
    try {
      const snap = await getDoc(doc(db, 'users', currentUser.uid));
      const adminLock = snap.data()?.adminLock;
      if (!adminLock?.passwordHash) return { success: false, error: 'লক সেটআপ করা নেই' };

      const result = await verifyPin(password, adminLock.passwordHash, adminLock.passwordSalt);
      if (!result) return { success: false, error: 'ভুল পাসওয়ার্ড' };

      await updateDoc(doc(db, 'users', currentUser.uid), { 'adminLock.lockedAt': null });
      setIsLocked(false);
      return { success: true };
    } catch (error) {
      logger.error('Admin unlock error:', error);
      return { success: false, error: 'আনলক করতে ব্যর্থ হয়েছে' };
    }
  }, [currentUser?.uid]);

  // ── Recovery unlock: pre-set recovery password, for when the
  // regular password is forgotten. Also resets the main password to
  // force the admin to set a new one right after — otherwise the
  // recovery password would become a silent permanent second
  // password nobody remembers changing. ──
  const recoveryUnlock = useCallback(async (recoveryPassword) => {
    if (!currentUser?.uid) return { success: false, error: 'Not authenticated' };
    try {
      const snap = await getDoc(doc(db, 'users', currentUser.uid));
      const adminLock = snap.data()?.adminLock;
      if (!adminLock?.recoveryHash) return { success: false, error: 'রিকভারি পাসওয়ার্ড সেটআপ করা নেই' };

      const result = await verifyPin(recoveryPassword, adminLock.recoveryHash, adminLock.recoverySalt);
      if (!result) return { success: false, error: 'ভুল রিকভারি পাসওয়ার্ড' };

      await updateDoc(doc(db, 'users', currentUser.uid), {
        'adminLock.lockedAt': null,
        'adminLock.enabled': false, // force re-setup with a new password+recovery pair
      });
      setIsLocked(false);
      setIsConfigured(false);
      return { success: true, needsResetup: true };
    } catch (error) {
      logger.error('Admin recovery unlock error:', error);
      return { success: false, error: 'রিকভারি আনলক ব্যর্থ হয়েছে' };
    }
  }, [currentUser?.uid]);

  return { isConfigured, isLocked, loading, setupLock, lockDashboard, unlockDashboard, recoveryUnlock, refresh: loadState };
};
