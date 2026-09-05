// src/security/device.js

/**
 * Trusted Device Manager
 * Device fingerprinting, identification, and trust management.
 * Firebase-independent — reusable across platforms.
 */

import { storage } from './storage.js';
import { sha256, generateSecureToken } from './crypto.js';
import { DEVICE_KEY } from './constants.js';
import { logError } from '../utils/logger';

// ============================================================
// Device Information Collector
// ============================================================

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

function getPlatformType() {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return 'mobile';
  if (/Tablet|iPad/i.test(ua)) return 'tablet';
  return 'desktop';
}

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
 * Collect all device information.
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
    createdAt: Date.now(),
  };

  info.fingerprint = await generateDeviceFingerprint(info);
  return info;
}

// ============================================================
// Device Fingerprint Generator
// ============================================================

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
    navigator.hardwareConcurrency || 'unknown',
  ].join('|');

  return await sha256(fingerprintData);
}

// ============================================================
// Device ID Management
// ============================================================

export function generateDeviceId() {
  return `device_${generateSecureToken(16)}`;
}

export function getOrCreateDeviceId() {
  let deviceData = storage.get(DEVICE_KEY);

  if (!deviceData || !deviceData.deviceId) {
    const deviceId = generateDeviceId();
    deviceData = { deviceId, createdAt: Date.now(), lastActive: Date.now() };
    storage.set(DEVICE_KEY, deviceData);
  } else {
    deviceData.lastActive = Date.now();
    storage.set(DEVICE_KEY, deviceData);
  }

  return deviceData.deviceId;
}

export function getDeviceId() {
  const deviceData = storage.get(DEVICE_KEY);
  return deviceData?.deviceId || null;
}

// ============================================================
// Trusted Device Management
// ============================================================

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
      createdAt: info.createdAt || Date.now(),
    };

    storage.set(DEVICE_KEY, deviceData);
    return true;
  } catch (error) {
    logError('Failed to trust device', error);
    return false;
  }
}

export function removeTrust() {
  try {
    const deviceData = storage.get(DEVICE_KEY);
    if (deviceData) {
      deviceData.isTrusted = false;
      storage.set(DEVICE_KEY, deviceData);
    }
    return true;
  } catch (error) {
    logError('Failed to remove trust', error);
    return false;
  }
}

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
      createdAt: deviceData.createdAt || Date.now(),
    };
  } catch (error) {
    logError('Failed to get current device', error);
    return null;
  }
}

export function updateLastActive() {
  try {
    const deviceData = storage.get(DEVICE_KEY);
    if (deviceData) {
      deviceData.lastActive = Date.now();
      storage.set(DEVICE_KEY, deviceData);
    }
    return true;
  } catch (error) {
    logError('Failed to update last active', error);
    return false;
  }
}

// ============================================================
// Device Comparison
// ============================================================

export function compareFingerprints(fingerprint1, fingerprint2) {
  if (!fingerprint1 || !fingerprint2) return false;
  return fingerprint1 === fingerprint2;
}

export async function checkDeviceChanged() {
  const deviceData = storage.get(DEVICE_KEY);
  const currentInfo = await collectDeviceInfo();

  const oldFingerprint = deviceData?.fingerprint || null;
  const newFingerprint = currentInfo.fingerprint;

  if (!oldFingerprint) {
    return { changed: true, newFingerprint, oldFingerprint: null };
  }

  return { changed: oldFingerprint !== newFingerprint, newFingerprint, oldFingerprint };
}

// ============================================================
// Named Export & Default Export
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
  updateLastActive,
};

export default device;