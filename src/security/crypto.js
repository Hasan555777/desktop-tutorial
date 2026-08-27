// src/security/crypto.js

/**
 * 🔐 Cryptographic Utilities
 * PIN Hashing using PBKDF2, SHA-256, Encryption, Token Generation
 * Uses Web Crypto API for secure cryptographic operations
 */

import { 
  PBKDF2_ITERATIONS, 
  HASH_LENGTH, 
  SALT_LENGTH 
} from './constants.js';

// ============================================================
// 🔄 Utility Functions
// ============================================================

/**
 * Convert ArrayBuffer to Base64 string
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate a cryptographically secure random salt
 * @returns {string} Base64 encoded salt
 */
export function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64(salt.buffer);
}

// ============================================================
// 🔐 PIN Hashing Functions (PBKDF2)
// ============================================================

/**
 * Hash a PIN using PBKDF2 with salt
 * @param {string} pin - The PIN to hash
 * @param {string} salt - Base64 encoded salt (optional, generated if not provided)
 * @returns {Promise<{hash: string, salt: string, iterations: number, hashLength: number, algorithm: string}>}
 */
export async function hashPin(pin, salt = null) {
  if (!pin || pin.length < 4) {
    throw new Error('PIN must be at least 4 characters');
  }

  // Generate salt if not provided
  if (!salt) {
    salt = generateSalt();
  }

  const saltBuffer = base64ToArrayBuffer(salt);
  const pinBuffer = new TextEncoder().encode(pin);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      pinBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      key,
      HASH_LENGTH
    );

    const hash = arrayBufferToBase64(hashBuffer);
    
    return {
      hash,
      salt,
      iterations: PBKDF2_ITERATIONS,
      hashLength: HASH_LENGTH,
      algorithm: 'PBKDF2-SHA256'
    };
  } catch (error) {
    console.error('❌ Hash generation error:', error);
    throw new Error('Failed to hash PIN');
  }
}

/**
 * Verify a PIN against a stored hash
 * @param {string} pin - The PIN to verify
 * @param {string} hash - Stored hash to verify against
 * @param {string} salt - Salt used for hashing
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, hash, salt) {
  if (!pin || !hash || !salt) {
    return false;
  }

  try {
    // Hash the provided PIN with the same salt
    const result = await hashPin(pin, salt);
    
    // Compare the hashes
    return result.hash === hash;
  } catch (error) {
    console.error('❌ PIN verification error:', error);
    return false;
  }
}

/**
 * SHA-256 hash (for additional security)
 * @param {string} message - Message to hash
 * @returns {Promise<string>} Base64 encoded hash
 */
export async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}

/**
 * Generate a cryptographically secure random token
 * @param {number} length - Length of the token in bytes
 * @returns {string} Base64 encoded token
 */
export function generateSecureToken(length = 32) {
  const buffer = crypto.getRandomValues(new Uint8Array(length));
  return arrayBufferToBase64(buffer.buffer);
}

// ============================================================
// 📦 Default Export
// ============================================================

export default {
  hashPin,
  verifyPin,
  generateSalt,
  generateSecureToken,
  sha256,
  arrayBufferToBase64,
  base64ToArrayBuffer,
};