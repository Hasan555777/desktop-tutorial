// src/security/constants.js

/**
 * 🔐 Lock System V2 - Constants
 * Centralized configuration for all security features
 */

// ── Version ──
export const APP_LOCK_VERSION = 2;

// ── PIN Settings ──
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_DURATION = 5 * 60 * 1000; // 5 minutes

// ── Session Settings ──
export const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
export const AUTO_LOCK_TIMEOUT = 3 * 60 * 1000; // 3 minutes

// ── Auto-Lock Settings ──
export const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const BACKGROUND_TIMEOUT = 30 * 1000; // 30 seconds
export const LOCK_ON_TAB_CHANGE = true;
export const LOCK_ON_BROWSER_CLOSE = true;
export const SESSION_ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'click',
  'keydown',
  'touchstart',
  'touchmove',
  'scroll',
  'wheel'
];

// ── Storage Keys ──
export const DEVICE_KEY = "worktrustbd_device";
export const SESSION_KEY = "worktrustbd_session";
export const PIN_HASH_KEY = "worktrustbd_pin_hash";
export const APP_LOCK_KEY = "worktrustbd_lock";
export const RECOVERY_CODES_KEY = "worktrustbd_recovery_codes";
export const SUSPICIOUS_ATTEMPTS_KEY = "worktrustbd_suspicious_attempts";
export const BIOMETRIC_CREDENTIAL_ID_KEY = "worktrustbd_biometric_credential_id";
export const DEVICE_FINGERPRINT_KEY = "worktrustbd_device_fingerprint";

// ── Recovery Settings ──
export const MAX_RECOVERY_ATTEMPTS = 3;
export const RECOVERY_LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
export const RECOVERY_CODE_LENGTH = 8;
export const RECOVERY_CODE_COUNT = 10;

// ── PBKDF2 Configuration ──
export const PBKDF2_ITERATIONS = 150000;
export const HASH_LENGTH = 256;
export const SALT_LENGTH = 16;

// ── Biometric Settings ──
export const BIOMETRIC_TIMEOUT = 60000; // 60 seconds
export const BIOMETRIC_AUTH_TIMEOUT = 30000; // 30 seconds

// ── Device Settings ──
export const MAX_DEVICES_PER_USER = 5;
export const DEVICE_SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 days