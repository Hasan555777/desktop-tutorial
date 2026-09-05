// src/security/recovery.js

/**
 * 🔄 Recovery & Backup Codes System
 * Secure recovery codes for App Lock reset
 * Uses SHA-256 hashing for secure storage
 */

import { storage } from './storage.js';
import { sha256, generateSecureToken } from './crypto.js';
import { RECOVERY_CODES_KEY, MAX_RECOVERY_ATTEMPTS, RECOVERY_LOCKOUT_DURATION } from './constants.js';

// ============================================================
// 📦 Types & Interfaces
// ============================================================

/**
 * @typedef {Object} RecoveryCode
 * @property {string} code - Original recovery code (display only)
 * @property {string} hash - SHA-256 hash of the code (stored)
 * @property {boolean} used - Whether this code has been used
 * @property {number} createdAt - Timestamp when code was created
 * @property {number} usedAt - Timestamp when code was used (if used)
 */

/**
 * @typedef {Object} RecoveryData
 * @property {RecoveryCode[]} codes - Array of recovery codes
 * @property {number} attempts - Failed recovery attempts
 * @property {number} lockedUntil - Lockout timestamp
 * @property {number} lastAttempt - Last attempt timestamp
 */

// ============================================================
// 🔧 Helper Functions
// ============================================================

/**
 * Generate a formatted recovery code
 * @returns {string} Formatted code (e.g., "A8KF-92LM")
 */
export function generateRecoveryCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 3) code += '-';
  }
  return code;
}

/**
 * Format recovery code for display
 * @param {string} code - Raw code
 * @returns {string} Formatted code
 */
export function formatRecoveryCode(code) {
  if (!code) return '';
  const clean = code.replace(/-/g, '').toUpperCase();
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  }
  return clean;
}

/**
// src/security/recovery.js

/**
 * Validate recovery code format
 * @param {string} code - Code to validate
 * @returns {boolean} True if valid format
 */
export function isValidRecoveryCode(code) {
  if (!code) return false;
  const clean = code.replace(/-/g, '').toUpperCase();
  // ✅ এখন 8 character (A-Z, 0-9) accept করবে
  return clean.length === 8 && /^[A-Z0-9]{8}$/.test(clean);
}

// ============================================================
// 🆕 Recovery Code Generation
// ============================================================

/**
 * Generate a set of recovery codes
 * @param {number} count - Number of codes to generate (default: 10)
 * @returns {Promise<RecoveryCode[]>} Array of recovery codes
 */
export async function generateRecoveryCodes(count = 10) {
  const codes = [];
  
  for (let i = 0; i < count; i++) {
    const code = generateRecoveryCode();
    const hash = await sha256(code);
    
    codes.push({
      code, // Original code (for display)
      hash, // Hashed code (for storage)
      used: false,
      createdAt: Date.now(),
      usedAt: null
    });
  }
  
  return codes;
}

// ============================================================
// 💾 Recovery Code Storage
// ============================================================

/**
 * Save recovery codes to secure storage
 * @param {RecoveryCode[]} codes - Array of recovery codes
 * @returns {boolean} Success status
 */
export function saveRecoveryCodes(codes) {
  try {
    // Store only hashes, not plain codes
    const hashes = codes.map(({ hash, used, createdAt, usedAt }) => ({
      hash,
      used,
      createdAt,
      usedAt
    }));
    
    storage.set(RECOVERY_CODES_KEY, {
      codes: hashes,
      attempts: 0,
      lockedUntil: null,
      lastAttempt: null
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to save recovery codes:', error);
    return false;
  }
}

/**
 * Get recovery codes data from storage
 * @returns {RecoveryData|null} Recovery data or null if not found
 */
export function getRecoveryData() {
  try {
    return storage.get(RECOVERY_CODES_KEY);
  } catch (error) {
    console.error('❌ Failed to get recovery data:', error);
    return null;
  }
}

/**
 * Check if recovery codes exist
 * @returns {boolean} True if codes exist
 */
export function hasRecoveryCodes() {
  const data = getRecoveryData();
  return data && data.codes && data.codes.length > 0;
}

// ============================================================
// ✅ Recovery Code Verification
// ============================================================

/**
 * Verify a recovery code
 * @param {string} code - Recovery code to verify
 * @returns {Promise<{success: boolean, message: string, remainingCodes?: number}>}
 */
export async function verifyRecoveryCode(code) {
  const clean = code.replace(/-/g, '').toUpperCase();
  
  // Validate format
  if (!isValidRecoveryCode(clean)) {
    return { success: false, message: 'Invalid recovery code format' };
  }
  
  // Get recovery data
  const data = getRecoveryData();
  if (!data || !data.codes || data.codes.length === 0) {
    return { success: false, message: 'No recovery codes available' };
  }
  
  // Check lockout
  if (data.lockedUntil && data.lockedUntil > Date.now()) {
    const remaining = Math.ceil((data.lockedUntil - Date.now()) / 1000 / 60);
    return { 
      success: false, 
      message: `Too many failed attempts. Try again in ${remaining} minutes`,
      lockedOut: true,
      remainingMinutes: remaining
    };
  }
  
  // Hash the input code
  const inputHash = await sha256(clean);
  
  // Find matching code
  let matchIndex = -1;
  let usedCodes = 0;
  
  for (let i = 0; i < data.codes.length; i++) {
    const stored = data.codes[i];
    if (stored.used) {
      usedCodes++;
      continue;
    }
    if (stored.hash === inputHash) {
      matchIndex = i;
      break;
    }
  }
  
  if (matchIndex === -1) {
    // Failed attempt
    const newAttempts = (data.attempts || 0) + 1;
    const updatedData = { ...data, attempts: newAttempts, lastAttempt: Date.now() };
    
    if (newAttempts >= MAX_RECOVERY_ATTEMPTS) {
      // Lock out
      updatedData.lockedUntil = Date.now() + RECOVERY_LOCKOUT_DURATION;
      storage.set(RECOVERY_CODES_KEY, updatedData);
      
      return {
        success: false,
        message: `Too many failed attempts. Locked for ${RECOVERY_LOCKOUT_DURATION / 60000} minutes`,
        lockedOut: true,
        remainingMinutes: RECOVERY_LOCKOUT_DURATION / 60000
      };
    }
    
    storage.set(RECOVERY_CODES_KEY, updatedData);
    
    return {
      success: false,
      message: `Invalid recovery code. ${MAX_RECOVERY_ATTEMPTS - newAttempts} attempts remaining`,
      remainingAttempts: MAX_RECOVERY_ATTEMPTS - newAttempts
    };
  }
  
  // Success - Mark code as used
  const codes = data.codes;
  codes[matchIndex].used = true;
  codes[matchIndex].usedAt = Date.now();
  
  const remainingCodes = codes.filter(c => !c.used).length;
  
  storage.set(RECOVERY_CODES_KEY, {
    ...data,
    codes,
    attempts: 0,
    lockedUntil: null
  });
  
  return {
    success: true,
    message: 'Recovery code verified successfully',
    remainingCodes,
    isLastCode: remainingCodes === 0
  };
}

// ============================================================
// 🔄 Recovery Code Management
// ============================================================

/**
 * Generate and save new recovery codes
 * @param {number} count - Number of codes to generate (default: 10)
 * @returns {Promise<{success: boolean, codes: string[], message: string}>}
 */
export async function regenerateRecoveryCodes(count = 10) {
  try {
    const codes = await generateRecoveryCodes(count);
    const success = saveRecoveryCodes(codes);
    
    if (!success) {
      return { success: false, codes: [], message: 'Failed to save recovery codes' };
    }
    
    // Return only the plain codes for display
    const plainCodes = codes.map(c => c.code);
    
    return {
      success: true,
      codes: plainCodes,
      message: `Generated ${count} new recovery codes`
    };
  } catch (error) {
    console.error('❌ Failed to regenerate recovery codes:', error);
    return { success: false, codes: [], message: error.message };
  }
}

/**
 * Get remaining recovery codes (hashes only)
 * @returns {Promise<{total: number, used: number, remaining: number}>}
 */
export function getRecoveryCodeStats() {
  const data = getRecoveryData();
  if (!data || !data.codes) {
    return { total: 0, used: 0, remaining: 0 };
  }
  
  const total = data.codes.length;
  const used = data.codes.filter(c => c.used).length;
  const remaining = total - used;
  
  return { total, used, remaining };
}

/**
 * Get recovery codes for display (only hashes, not plain codes)
 * @returns {Promise<{hash: string, used: boolean, createdAt: number}[]>}
 */
export function getRecoveryCodeHashes() {
  const data = getRecoveryData();
  if (!data || !data.codes) return [];
  
  return data.codes.map(({ hash, used, createdAt, usedAt }) => ({
    hash: hash.slice(0, 8) + '...', // Truncated for display
    used,
    createdAt,
    usedAt
  }));
}

/**
 * Reset recovery system (clear all codes)
 * @returns {boolean} Success status
 */
export function resetRecovery() {
  try {
    storage.remove(RECOVERY_CODES_KEY);
    return true;
  } catch (error) {
    console.error('❌ Failed to reset recovery:', error);
    return false;
  }
}

/**
 * Check if recovery is locked out
 * @returns {Promise<{lockedOut: boolean, remainingMinutes: number}>}
 */
export function checkRecoveryLockout() {
  const data = getRecoveryData();
  if (!data || !data.lockedUntil) {
    return { lockedOut: false, remainingMinutes: 0 };
  }
  
  if (data.lockedUntil > Date.now()) {
    const remaining = Math.ceil((data.lockedUntil - Date.now()) / 1000 / 60);
    return { lockedOut: true, remainingMinutes: remaining };
  }
  
  // Lockout expired
  data.lockedUntil = null;
  data.attempts = 0;
  storage.set(RECOVERY_CODES_KEY, data);
  
  return { lockedOut: false, remainingMinutes: 0 };
}

// ============================================================
// 🔐 PIN Reset Flow
// ============================================================

/**
 * Reset PIN using recovery code
 * @param {string} code - Recovery code
 * @param {string} newPin - New PIN to set
 * @param {Function} setPinFn - Function to set new PIN
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function resetPinWithRecovery(code, newPin, setPinFn) {
  // Verify recovery code first
  const verification = await verifyRecoveryCode(code);
  
  if (!verification.success) {
    return { success: false, message: verification.message };
  }
  
  // Validate new PIN
  if (!newPin || newPin.length < 4) {
    return { success: false, message: 'PIN must be at least 4 digits' };
  }
  
  try {
    // Set new PIN
    const result = await setPinFn(newPin);
    
    if (!result.success) {
      return { success: false, message: result.error || 'Failed to set new PIN' };
    }
    
    return {
      success: true,
      message: 'PIN reset successfully using recovery code',
      remainingCodes: verification.remainingCodes || 0
    };
  } catch (error) {
    console.error('❌ PIN reset error:', error);
    return { success: false, message: error.message };
  }
}

// ============================================================
// 📦 Named Export & Default Export
// ============================================================

export const recovery = {
  // Code Generation
  generateRecoveryCode,
  generateRecoveryCodes,
  formatRecoveryCode,
  isValidRecoveryCode,
  
  // Storage
  saveRecoveryCodes,
  getRecoveryData,
  hasRecoveryCodes,
  resetRecovery,
  
  // Verification
  verifyRecoveryCode,
  checkRecoveryLockout,
  
  // Management
  regenerateRecoveryCodes,
  getRecoveryCodeStats,
  getRecoveryCodeHashes,
  
  // PIN Reset
  resetPinWithRecovery
};

export default recovery;