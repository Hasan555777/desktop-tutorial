// src/security/storage.js
// ============================================================
// 🔧 FIX APPLIED: every key is now automatically namespaced by the
// current Firebase uid.
//
// Before: fullKey was just `worktrustbd_${key}` — the SAME
// localStorage entry regardless of which account was logged in. On a
// shared/family device, if User A set an App Lock PIN and later
// logged out WITHOUT disabling App Lock first, User B logging in on
// the same browser would inherit User A's PIN hash, biometric
// credential id, lockout state, and trusted-device flag — none of
// which User B ever set. useAppLock.js / useBiometric.js / recovery.js
// / device.js all call these methods with plain constant keys
// (PIN_HASH_KEY, APP_LOCK_KEY, BIOMETRIC_CREDENTIAL_ID_KEY, DEVICE_KEY,
// RECOVERY_CODES_KEY) and never scoped them by user themselves.
//
// Fix: storage.js now reads `auth.currentUser?.uid` itself and
// appends it to the key before touching localStorage. This means
// every existing caller becomes correctly per-account WITHOUT any
// changes needed on their end. When there's no logged-in user (e.g.
// device fingerprinting before login), it falls back to an
// unscoped/"anon" key exactly as before, so pre-login flows are
// unaffected.
// ============================================================

import { auth } from '@/firebase';

const STORAGE_PREFIX = 'worktrustbd_';

/**
 * Builds the final localStorage key, namespaced by the current user.
 * Falls back to an unscoped "anon" bucket when nobody is logged in
 * (matches the old behavior for pre-login flows like device fingerprinting).
 */
const buildKey = (key) => {
  const uid = auth.currentUser?.uid || 'anon';
  return `${STORAGE_PREFIX}${uid}_${key}`;
};

export const storage = {
  /**
   * Get a value from storage
   * @param {string} key - Storage key (without prefix)
   * @returns {any} Parsed value or null
   */
  get(key) {
    try {
      const value = localStorage.getItem(buildKey(key));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`❌ Storage get error for key "${key}":`, error);
      return null;
    }
  },

  /**
   * Set a value in storage
   * @param {string} key - Storage key (without prefix)
   * @param {any} value - Value to store
   * @returns {boolean} Success status
   */
  set(key, value) {
    try {
      localStorage.setItem(buildKey(key), JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`❌ Storage set error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Remove a value from storage
   * @param {string} key - Storage key (without prefix)
   * @returns {boolean} Success status
   */
  remove(key) {
    try {
      localStorage.removeItem(buildKey(key));
      return true;
    } catch (error) {
      console.error(`❌ Storage remove error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Clear all storage FOR THE CURRENT USER ONLY (only their
   * worktrustbd_{uid}_ keys — does not touch other accounts'
   * data that may exist in this browser's localStorage).
   * @returns {boolean} Success status
   */
  clear() {
    try {
      const uid = auth.currentUser?.uid || 'anon';
      const userPrefix = `${STORAGE_PREFIX}${uid}_`;
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(userPrefix)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('❌ Storage clear error:', error);
      return false;
    }
  },

  /**
   * Check if a key exists (for the current user)
   * @param {string} key - Storage key (without prefix)
   * @returns {boolean}
   */
  has(key) {
    return localStorage.getItem(buildKey(key)) !== null;
  },

  /**
   * Get all storage keys for the CURRENT user only
   * @returns {string[]} Array of keys (without prefix/uid)
   */
  getAllKeys() {
    const uid = auth.currentUser?.uid || 'anon';
    const userPrefix = `${STORAGE_PREFIX}${uid}_`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(userPrefix)) {
        keys.push(key.replace(userPrefix, ''));
      }
    }
    return keys;
  },

  /**
   * Get all storage data for the CURRENT user only
   * @returns {Object} All stored data
   */
  getAll() {
    const data = {};
    const keys = this.getAllKeys();
    keys.forEach(key => {
      data[key] = this.get(key);
    });
    return data;
  }
};

export default storage;