// src/firebase/adminFunctions.js

import { db, auth } from '@/firebase';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  collection, 
  serverTimestamp,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
  orderBy,
  limit
} from 'firebase/firestore';

// ============================================================
// 📌 EMERGENCY UNLOCK
// ============================================================

/**
 * Admin - Emergency Unlock for App Lock
 * @param {string} userId - The user's UID
 * @returns {Promise<{success: boolean, remainingMinutes?: number, expiresAt?: Date, error?: string}>}
 */
export const emergencyUnlockUser = async (userId) => {
  try {
    // Check if admin is authenticated
    const admin = auth.currentUser;
    if (!admin) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if admin has admin role
    const adminDoc = await getDoc(doc(db, 'users', admin.uid));
    if (!adminDoc.exists() || adminDoc.data().role !== 'admin') {
      return { success: false, error: 'Not authorized' };
    }

    // Check if user exists
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = userSnap.data();
    
    // Set expiry to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Update user's appLock with emergency unlock
    await updateDoc(userRef, {
      'appLock.emergencyUnlock': {
        enabled: true,
        requestedBy: admin.uid,
        requestedByEmail: admin.email || 'admin',
        requestedAt: serverTimestamp(),
        expiresAt: expiresAt,
        reason: 'Admin requested emergency unlock'
      },
      updatedAt: serverTimestamp()
    });

    // Log to admin logs
    await addDoc(collection(db, 'adminLogs'), {
      action: 'emergency_unlock',
      userId: userId,
      userEmail: userData.email || 'unknown',
      adminId: admin.uid,
      adminEmail: admin.email || 'admin',
      timestamp: serverTimestamp(),
      expiresAt: expiresAt,
      reason: 'Admin requested emergency unlock'
    });

    return { 
      success: true, 
      remainingMinutes: 10,
      expiresAt: expiresAt
    };
  } catch (error) {
    console.error('❌ Emergency unlock error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📌 GET USER APP LOCK STATUS (Admin)
// ============================================================

/**
 * Get user's app lock status for admin
 * @param {string} userId - The user's UID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export const getUserAppLockStatus = async (userId) => {
  try {
    const admin = auth.currentUser;
    if (!admin) {
      return { success: false, error: 'Not authenticated' };
    }

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return { success: false, error: 'User not found' };
    }

    const data = userSnap.data();
    const appLock = data.appLock || {};

    return {
      success: true,
      data: {
        isEnabled: appLock.isEnabled || false,
        isLockedOut: appLock.isLockedOut || false,
        attempts: appLock.attempts || 0,
        lockedUntil: appLock.lockedUntil || null,
        emergencyUnlock: appLock.emergencyUnlock || null,
        hasPin: !!appLock.pinHash
      }
    };
  } catch (error) {
    console.error('❌ Get user app lock status error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📌 CLEAR USER APP LOCK (Admin)
// ============================================================

/**
 * Admin - Clear user's app lock (emergency reset)
 * @param {string} userId - The user's UID
 * @param {string} reason - Reason for clearing
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export const clearUserAppLock = async (userId, reason = 'Admin reset') => {
  try {
    const admin = auth.currentUser;
    if (!admin) {
      return { success: false, error: 'Not authenticated' };
    }

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return { success: false, error: 'User not found' };
    }

    // Clear all app lock data
    await updateDoc(userRef, {
      'appLock.isEnabled': false,
      'appLock.isLockedOut': false,
      'appLock.attempts': 0,
      'appLock.lockedUntil': null,
      'appLock.pinHash': null,
      'appLock.pinSalt': null,
      'appLock.emergencyUnlock': null,
      updatedAt: serverTimestamp()
    });

    // Log to admin logs
    await addDoc(collection(db, 'adminLogs'), {
      action: 'clear_app_lock',
      userId: userId,
      adminId: admin.uid,
      adminEmail: admin.email || 'admin',
      reason: reason,
      timestamp: serverTimestamp()
    });

    return { 
      success: true, 
      message: 'App lock cleared successfully'
    };
  } catch (error) {
    console.error('❌ Clear app lock error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📌 GET ADMIN LOGS
// ============================================================

/**
 * Get admin action logs
 * @param {number} limit - Number of logs to fetch
 * @param {string} action - Filter by action type
 * @returns {Promise<{success: boolean, logs?: Array, error?: string}>}
 */
export const getAdminLogs = async (limitCount = 100, action = null) => {
  try {
    const admin = auth.currentUser;
    if (!admin) {
      return { success: false, error: 'Not authenticated' };
    }

    let q = query(
      collection(db, 'adminLogs'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    if (action) {
      q = query(
        collection(db, 'adminLogs'),
        where('action', '==', action),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);
    const logs = [];
    snapshot.forEach((doc) => {
      logs.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return { success: true, logs };
  } catch (error) {
    console.error('❌ Get admin logs error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📌 GET ALL USERS (Admin)
// ============================================================

/**
 * Get all users with filters
 * @param {Object} filters - Filter options
 * @returns {Promise<{success: boolean, users?: Array, error?: string}>}
 */
export const getAllUsersAdmin = async (filters = {}) => {
  try {
    const admin = auth.currentUser;
    if (!admin) {
      return { success: false, error: 'Not authenticated' };
    }

    let q = collection(db, 'users');
    const constraints = [];

    // Add filters
    if (filters.role) {
      constraints.push(where('role', '==', filters.role));
    }

    if (filters.isVerified !== undefined) {
      constraints.push(where('isVerified', '==', filters.isVerified));
    }

    if (filters.isBanned !== undefined) {
      constraints.push(where('isBanned', '==', filters.isBanned));
    }

    // Always order by createdAt
    constraints.push(orderBy('createdAt', 'desc'));

    if (filters.limit) {
      constraints.push(limit(filters.limit));
    }

    q = query(collection(db, 'users'), ...constraints);

    const snapshot = await getDocs(q);
    const users = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Exclude admins from regular user list
      if (data.role !== 'admin') {
        users.push({
          id: doc.id,
          ...data
        });
      }
    });

    return { success: true, users };
  } catch (error) {
    console.error('❌ Get all users error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📌 BULK ACTION: EMERGENCY UNLOCK MULTIPLE USERS
// ============================================================

/**
 * Admin - Emergency unlock multiple users
 * @param {string[]} userIds - Array of user UIDs
 * @returns {Promise<{success: boolean, results?: Array, error?: string}>}
 */
export const bulkEmergencyUnlock = async (userIds) => {
  try {
    const admin = auth.currentUser;
    if (!admin) {
      return { success: false, error: 'Not authenticated' };
    }

    const results = [];
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    for (const userId of userIds) {
      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          results.push({ userId, success: false, error: 'User not found' });
          continue;
        }

        await updateDoc(userRef, {
          'appLock.emergencyUnlock': {
            enabled: true,
            requestedBy: admin.uid,
            requestedByEmail: admin.email || 'admin',
            requestedAt: serverTimestamp(),
            expiresAt: expiresAt,
            reason: 'Bulk emergency unlock by admin'
          },
          updatedAt: serverTimestamp()
        });

        results.push({ userId, success: true });
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    }

    // Log bulk action
    await addDoc(collection(db, 'adminLogs'), {
      action: 'bulk_emergency_unlock',
      userIds: userIds,
      count: userIds.length,
      adminId: admin.uid,
      adminEmail: admin.email || 'admin',
      timestamp: serverTimestamp(),
      results: results
    });

    return { 
      success: true, 
      results,
      message: `${results.filter(r => r.success).length} users unlocked, ${results.filter(r => !r.success).length} failed`
    };
  } catch (error) {
    console.error('❌ Bulk emergency unlock error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// 📌 EXPORT ALL
// ============================================================

export default {
  emergencyUnlockUser,
  getUserAppLockStatus,
  clearUserAppLock,
  getAdminLogs,
  getAllUsersAdmin,
  bulkEmergencyUnlock
};