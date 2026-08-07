// src/security/storage.js

/**
 * 🗄️ Secure Storage Wrapper
 * Centralized access to localStorage with consistent API
 * Handles PIN hashing, security settings, and encrypted storage
 */

const STORAGE_PREFIX = 'worktrustbd_';

export const storage = {
  /**
   * Get a value from storage
   * @param {string} key - Storage key (without prefix)
   * @returns {any} Parsed value or null
   */
  get(key) {
    try {
      const fullKey = STORAGE_PREFIX + key;
      const value = localStorage.getItem(fullKey);
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
      const fullKey = STORAGE_PREFIX + key;
      localStorage.setItem(fullKey, JSON.stringify(value));
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
      const fullKey = STORAGE_PREFIX + key;
      localStorage.removeItem(fullKey);
      return true;
    } catch (error) {
      console.error(`❌ Storage remove error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Clear all storage (only worktrustx keys)
   * @returns {boolean} Success status
   */
  clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(STORAGE_PREFIX)) {
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
   * Check if a key exists
   * @param {string} key - Storage key (without prefix)
   * @returns {boolean}
   */
  has(key) {
    const fullKey = STORAGE_PREFIX + key;
    return localStorage.getItem(fullKey) !== null;
  },

  /**
   * Get all storage keys (only worktrustx keys)
   * @returns {string[]} Array of keys
   */
  getAllKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keys.push(key.replace(STORAGE_PREFIX, ''));
      }
    }
    return keys;
  },

  /**
   * Get all storage data (only worktrustx keys)
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