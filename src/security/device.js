// src/security/device.js

/**
 * 📱 Trusted Device Manager
 * Device fingerprinting, identification, and trust management
 * Firebase-independent - reusable across platforms
 */

import { storage } from './storage.js';
import { sha256, generateSecureToken } from './crypto.js';
import { DEVICE_KEY } from './constants.js';

// ============================================================
// 📦 Types & Interfaces
// ============================================================

/**
 * @typedef {Object} DeviceInfo
 * @property {string} deviceId - Unique device identifier
 * @property {string} fingerprint - Device fingerprint (hash)
 * @property {string} name - Device name (user-friendly)
 * @property {string} browser - Browser name
 * @property {string} os - Operating system
 * @property {string} platform - Platform (web, mobile, etc.)
 * @property {string} language - Browser language
 * @property {string} timezone - Timezone
 * @property {string} screenResolution - Screen resolution
 * @property {boolean} touchSupport - Touch support
 * @property {boolean} isTrusted - Trust status
 * @property {number} lastActive - Last activity timestamp
 * @property {number} createdAt - Creation timestamp
 */

// ============================================================
// 🔍 Device Information Collector
// ============================================================

/**
 * Get browser name from user agent
 */
function getBrowserName() {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Opera')) return 'Opera';
  if (ua.includes('Brave')) return 'Brave';
  return 'Unknown';
}

/**
 * Get operating system from user agent
 */
function getOSName() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS')) return 'iOS';
  if (ua.includes('iPhone')) return 'iOS';
  if (ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

/**
 * Get platform type
 */
function getPlatformType() {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
    return 'mobile';
  }
  if (/Tablet|iPad/i.test(ua)) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Get device name (user-friendly)
 */
function getDeviceName() {
  const parts = [];
  const os = getOSName();
  const browser = getBrowserName();
  const platform = getPlatformType();
  
  if (os !== 'Unknown') parts.push(os);
  if (browser !== 'Unknown') parts.push(browser);
  if (platform === 'mobile') parts.push('📱');
  else if (platform === 'tablet') parts.push('📟');
  
  return parts.join(' ') || 'Unknown Device';
}

/**
 * Collect all device information
 * @returns {Promise<DeviceInfo>}
 */
export async function collectDeviceInfo() {
  const info = {
    deviceId: null,
    fingerprint: null,
    name: getDeviceName(),
    browser: getBrowserName(),
    os: getOSName(),
    platform: getPlatformType(),
    language: navigator.language || 'en-US',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    isTrusted: false,
    lastActive: Date.now(),
    createdAt: Date.now()
  };

  info.fingerprint = await generateDeviceFingerprint(info);
  return info;
}

// ============================================================
// 🖐️ Device Fingerprint Generator
// ============================================================

/**
 * Generate a stable device fingerprint
 * @param {DeviceInfo} info - Device information
 * @returns {Promise<string>} SHA-256 fingerprint
 */
export async function generateDeviceFingerprint(info) {
  const fingerprintData = [
    info.browser || 'unknown',
    info.os || 'unknown',
    info.platform || 'unknown',
    info.language || 'en-US',
    info.timezone || 'UTC',
    info.screenResolution || '0x0',
    info.touchSupport ? 'touch' : 'no-touch',
    navigator.deviceMemory || 'unknown',
    navigator.hardwareConcurrency || 'unknown'
  ].join('|');

  return await sha256(fingerprintData);
}

// ============================================================
// 🆔 Device ID Management
// ============================================================

/**
 * Generate a new device ID
 * @returns {string} Device ID
 */
export function generateDeviceId() {
  return `device_${generateSecureToken(16)}`;
}

/**
 * Get or create device ID
 * @returns {string} Device ID
 */
export function getOrCreateDeviceId() {
  let deviceData = storage.get(DEVICE_KEY);
  
  if (!deviceData || !deviceData.deviceId) {
    const deviceId = generateDeviceId();
    deviceData = {
      deviceId,
      createdAt: Date.now(),
      lastActive: Date.now()
    };
    storage.set(DEVICE_KEY, deviceData);
  } else {
    deviceData.lastActive = Date.now();
    storage.set(DEVICE_KEY, deviceData);
  }
  
  return deviceData.deviceId;
}

/**
 * Get current device ID without updating
 * @returns {string|null} Device ID or null if not exists
 */
export function getDeviceId() {
  const deviceData = storage.get(DEVICE_KEY);
  return deviceData?.deviceId || null;
}

// ============================================================
// 🛡️ Trusted Device Management
// ============================================================

/**
 * Check if current device is trusted
 * @returns {Promise<boolean>}
 */
export async function isTrusted() {
  const deviceData = storage.get(DEVICE_KEY);
  if (!deviceData) return false;
  
  if (deviceData.isTrusted) return true;
  
  if (deviceData.fingerprint) {
    const currentInfo = await collectDeviceInfo();
    return deviceData.fingerprint === currentInfo.fingerprint;
  }
  
  return false;
}

/**
 * Mark current device as trusted
 * @param {string} name - Optional device name
 * @returns {Promise<boolean>}
 */
export async function trustCurrentDevice(name = null) {
  try {
    const deviceId = getOrCreateDeviceId();
    const info = await collectDeviceInfo();
    
    const deviceData = {
      deviceId,
      fingerprint: info.fingerprint,
      name: name || info.name,
      isTrusted: true,
      lastActive: Date.now(),
      createdAt: info.createdAt || Date.now()
    };
    
    storage.set(DEVICE_KEY, deviceData);
    return true;
  } catch (error) {
    console.error('❌ Failed to trust device:', error);
    return false;
  }
}

/**
 * Remove trust from current device
 * @returns {boolean}
 */
export function removeTrust() {
  try {
    const deviceData = storage.get(DEVICE_KEY);
    if (deviceData) {
      deviceData.isTrusted = false;
      storage.set(DEVICE_KEY, deviceData);
    }
    return true;
  } catch (error) {
    console.error('❌ Failed to remove trust:', error);
    return false;
  }
}

/**
 * Get current device information
 * @returns {Promise<DeviceInfo|null>}
 */
export async function getCurrentDevice() {
  try {
    const deviceData = storage.get(DEVICE_KEY);
    if (!deviceData) return null;
    
    const info = await collectDeviceInfo();
    
    return {
      deviceId: deviceData.deviceId,
      fingerprint: deviceData.fingerprint || info.fingerprint,
      name: deviceData.name || info.name,
      browser: info.browser,
      os: info.os,
      platform: info.platform,
      language: info.language,
      timezone: info.timezone,
      screenResolution: info.screenResolution,
      touchSupport: info.touchSupport,
      isTrusted: deviceData.isTrusted || false,
      lastActive: deviceData.lastActive || Date.now(),
      createdAt: deviceData.createdAt || Date.now()
    };
  } catch (error) {
    console.error('❌ Failed to get current device:', error);
    return null;
  }
}

/**
 * Update last active timestamp
 * @returns {boolean}
 */
export function updateLastActive() {
  try {
    const deviceData = storage.get(DEVICE_KEY);
    if (deviceData) {
      deviceData.lastActive = Date.now();
      storage.set(DEVICE_KEY, deviceData);
    }
    return true;
  } catch (error) {
    console.error('❌ Failed to update last active:', error);
    return false;
  }
}

// ============================================================
// 🔄 Device Comparison
// ============================================================

/**
 * Compare two device fingerprints
 * @param {string} fingerprint1 - First fingerprint
 * @param {string} fingerprint2 - Second fingerprint
 * @returns {boolean} True if same device
 */
export function compareFingerprints(fingerprint1, fingerprint2) {
  if (!fingerprint1 || !fingerprint2) return false;
  return fingerprint1 === fingerprint2;
}

/**
 * Check if device has changed since last stored fingerprint
 * @returns {Promise<{changed: boolean, newFingerprint: string, oldFingerprint: string|null}>}
 */
export async function checkDeviceChanged() {
  const deviceData = storage.get(DEVICE_KEY);
  const currentInfo = await collectDeviceInfo();
  
  const oldFingerprint = deviceData?.fingerprint || null;
  const newFingerprint = currentInfo.fingerprint;
  
  if (!oldFingerprint) {
    return { changed: true, newFingerprint, oldFingerprint: null };
  }
  
  return {
    changed: oldFingerprint !== newFingerprint,
    newFingerprint,
    oldFingerprint
  };
}

// ============================================================
// 📦 Named Export & Default Export
// ============================================================

export const device = {
  getDeviceId,
  getOrCreateDeviceId,
  generateDeviceId,
  collectDeviceInfo,
  getDeviceName,
  getBrowserName,
  getOSName,
  getPlatformType,
  generateDeviceFingerprint,
  compareFingerprints,
  checkDeviceChanged,
  isTrusted,
  trustCurrentDevice,
  removeTrust,
  getCurrentDevice,
  updateLastActive
};

export default device;