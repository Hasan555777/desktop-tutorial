// src/firebase/adminFunctions.js

import { db, auth } from '../../../shared/firebase/index';
import { isAdminUser, isMainAdminUser, ADMIN_PERMISSIONS } from '../constants/admin';
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
    // 🔧 FIX: this used to check ONLY adminDoc.data().role === 'admin'.
    // But admin access elsewhere in the app (AdminDashboard.jsx, PrivateRoute)
    // is granted via role === 'admin' OR a whitelisted email
    // (constants/admin.js's isAdminUser — the actual "who counts as admin"
    // source of truth). A real admin logged in via the email whitelist
    // whose Firestore doc never got role: 'admin' set could see and use
    // the whole admin dashboard, but this function alone would silently
    // reject them with "Not authorized" — which is exactly what made
    // emergency unlock look broken. Using the same shared check fixes it.
    const adminDoc = await getDoc(doc(db, 'users', admin.uid));
    const adminRole = adminDoc.exists() ? adminDoc.data().role : null;
    if (!isAdminUser(admin, adminRole, adminDoc.data()?.adminDisabled)) {
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
// 📌 SET TEMPORARY PASSWORD (Admin)
// ============================================================
//
// A user's Firebase Auth password can only ever be changed for the
// CURRENTLY signed-in user via the client SDK (updatePassword()) —
// there is no client-side call that lets one account set another
// account's password. Doing that for an admin-initiated "forgot
// password" reset requires the Admin SDK, so this goes through the
// privileged backend in src/server/index.js instead of Firestore.
//
// Flow: admin sets a temp password here -> user logs in with it ->
// Login.jsx sees users/{uid}.mustChangePassword and routes them to
// Settings → Security -> user enters the temp password as their
// "current password" and picks a new one (existing handleChangePassword
// flow in settings/index.jsx) -> that flow clears mustChangePassword.

const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

/**
 * Generates a random temporary password: at least one uppercase, one
 * lowercase, one digit and one symbol, 10 characters total. Ambiguous
 * characters (0/O, 1/l/I) are excluded so it's easy to read back to a
 * user over phone/chat.
 */
const generateTemporaryPassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%';
  const all = upper + lower + digits + symbols;

  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 6 }, () => pick(all));

  // Shuffle so the required characters aren't always in the same spot.
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('');
};

/**
 * Admin - set a temporary password for a user (e.g. they're locked out
 * and forgot their password). The user is forced to change it themselves
 * on next login.
 * @param {string} userId - The user's UID
 * @returns {Promise<{success: boolean, tempPassword?: string, error?: string}>}
 */
export const setTemporaryPassword = async (userId) => {
  try {
    const admin = auth.currentUser;
    if (!admin) {
      return { success: false, error: 'Not authenticated' };
    }

    const adminDoc = await getDoc(doc(db, 'users', admin.uid));
    const adminRole = adminDoc.exists() ? adminDoc.data().role : null;
    if (!isAdminUser(admin, adminRole, adminDoc.data()?.adminDisabled)) {
      return { success: false, error: 'Not authorized' };
    }

    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) {
      return { success: false, error: 'User not found' };
    }

    const tempPassword = generateTemporaryPassword();
    const idToken = await admin.getIdToken();

    const response = await fetch(`${ADMIN_API_BASE_URL}/api/admin/set-temp-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ userId, tempPassword }),
    });

    let result = {};
    try {
      result = await response.json();
    } catch (parseError) {
      // Non-JSON error response (e.g. server unreachable) — fall through
      // to the generic error below.
    }

    if (!response.ok || !result.success) {
      return { success: false, error: result.message || result.error || 'Failed to set temporary password' };
    }

    return { success: true, tempPassword };
  } catch (error) {
    console.error('❌ Set temporary password error:', error);
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

    // 🔧 FIX: this function had no admin-role check at all — any
    // authenticated user calling it directly could emergency-unlock
    // any other user's app lock in bulk. Added the same isAdminUser
    // check used by emergencyUnlockUser and the rest of the admin area.
    const adminDoc = await getDoc(doc(db, 'users', admin.uid));
    const adminRole = adminDoc.exists() ? adminDoc.data().role : null;
    if (!isAdminUser(admin, adminRole, adminDoc.data()?.adminDisabled)) {
      return { success: false, error: 'Not authorized' };
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
// 🔧 ADD (#30/#31/#32 admin RBAC): sub-admin management. Real
// server-side enforcement is the Firestore rule on users/{userId}
// (only isMainAdmin() can change role/adminPermissions) — these
// client-side isMainAdminUser() checks are fast-feedback only, never
// the actual security boundary, same pattern as everywhere else in
// this file.
// ============================================================

/**
 * Promote an existing registered user to sub-admin with specific
 * permissions. There's no "create a brand new account from the admin
 * panel" here — client-side Firebase Auth can't create OTHER users'
 * accounts (that needs the Admin SDK / a Cloud Function). The real
 * flow is: the person registers normally, then a main admin finds
 * their account by email and grants sub-admin access.
 */
export const createSubAdmin = async (targetUserId, permissions) => {
  try {
    const admin = auth.currentUser;
    if (!admin || !isMainAdminUser(admin)) {
      return { success: false, error: 'শুধুমাত্র মেইন এডমিন সাব-এডমিন তৈরি করতে পারবেন।' };
    }

    const targetRef = doc(db, 'users', targetUserId);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) {
      return { success: false, error: 'ইউজার খুঁজে পাওয়া যায়নি।' };
    }
    const targetData = targetSnap.data();

    // Never allow granting adminManagement-equivalent power through
    // this — main-admin status is fixed to ADMIN_EMAILS only (#31:
    // "a sub-admin must not be able to create another admin with
    // higher privileges" — this closes that off structurally, since
    // there's no permission flag here that grants admin-creation at
    // all).
    const cleanPermissions = {};
    ADMIN_PERMISSIONS.forEach(p => { cleanPermissions[p] = !!permissions?.[p]; });

    await updateDoc(targetRef, {
      role: 'admin',
      adminPermissions: cleanPermissions,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'adminLogs'), {
      action: 'create_sub_admin',
      targetUserId,
      targetEmail: targetData.email || 'unknown',
      permissions: cleanPermissions,
      adminId: admin.uid,
      adminEmail: admin.email || 'admin',
      timestamp: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Create sub-admin error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Change an existing sub-admin's permission set.
 */
export const updateSubAdminPermissions = async (targetUserId, permissions) => {
  try {
    const admin = auth.currentUser;
    if (!admin || !isMainAdminUser(admin)) {
      return { success: false, error: 'শুধুমাত্র মেইন এডমিন পারমিশন পরিবর্তন করতে পারবেন।' };
    }

    const targetRef = doc(db, 'users', targetUserId);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) {
      return { success: false, error: 'ইউজার খুঁজে পাওয়া যায়নি।' };
    }
    const targetData = targetSnap.data();

    // A main admin (ADMIN_EMAILS) can't be edited through this path —
    // their access isn't permission-flag-based at all, so there's
    // nothing here to change, and it protects against a bug ever
    // accidentally demoting one (#31: "must not be able to modify
    // the Main Admin" — worth guarding even against admin-side
    // mistakes, not just malicious sub-admins).
    if (isMainAdminUser({ email: targetData.email })) {
      return { success: false, error: 'মেইন এডমিনের পারমিশন এভাবে পরিবর্তন করা যাবে না।' };
    }

    const cleanPermissions = {};
    ADMIN_PERMISSIONS.forEach(p => { cleanPermissions[p] = !!permissions?.[p]; });

    await updateDoc(targetRef, {
      adminPermissions: cleanPermissions,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'adminLogs'), {
      action: 'update_admin_permissions',
      targetUserId,
      targetEmail: targetData.email || 'unknown',
      permissions: cleanPermissions,
      adminId: admin.uid,
      adminEmail: admin.email || 'admin',
      timestamp: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Update sub-admin permissions error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Remove sub-admin access entirely (back to a regular user).
 */
export const removeSubAdmin = async (targetUserId) => {
  try {
    const admin = auth.currentUser;
    if (!admin || !isMainAdminUser(admin)) {
      return { success: false, error: 'শুধুমাত্র মেইন এডমিন সাব-এডমিন রিমুভ করতে পারবেন।' };
    }

    const targetRef = doc(db, 'users', targetUserId);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) {
      return { success: false, error: 'ইউজার খুঁজে পাওয়া যায়নি।' };
    }
    const targetData = targetSnap.data();

    if (isMainAdminUser({ email: targetData.email })) {
      return { success: false, error: 'মেইন এডমিনকে রিমুভ করা যাবে না।' };
    }

    await updateDoc(targetRef, {
      role: 'client',
      adminPermissions: null,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'adminLogs'), {
      action: 'remove_sub_admin',
      targetUserId,
      targetEmail: targetData.email || 'unknown',
      adminId: admin.uid,
      adminEmail: admin.email || 'admin',
      timestamp: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Remove sub-admin error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 🔧 ADD (requirements doc #20: "Disable Admin" as a distinct action
 * from "Remove Sub-Admin"): temporarily revoke a sub-admin's admin
 * access WITHOUT touching their role or adminPermissions — so
 * re-enabling instantly restores the exact same permission mix
 * instead of needing to be reconfigured from scratch. Sets
 * `adminDisabled` on their user doc; isAdminUser()/hasAdminPermission()
 * (constants/admin.js) both check this and deny access while it's
 * true. A main admin can never be disabled this way (checked here on
 * the client, and unconditionally true in isAdminUser regardless of
 * this flag, and only a main admin can write this field at all per
 * the Firestore rule).
 */
export const setSubAdminDisabled = async (targetUserId, disabled) => {
  try {
    const admin = auth.currentUser;
    if (!admin || !isMainAdminUser(admin)) {
      return { success: false, error: 'শুধুমাত্র মেইন এডমিন এডমিন অ্যাক্সেস নিষ্ক্রিয়/সক্রিয় করতে পারবেন।' };
    }

    const targetRef = doc(db, 'users', targetUserId);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) {
      return { success: false, error: 'ইউজার খুঁজে পাওয়া যায়নি।' };
    }
    const targetData = targetSnap.data();

    if (isMainAdminUser({ email: targetData.email })) {
      return { success: false, error: 'মেইন এডমিনকে নিষ্ক্রিয় করা যাবে না।' };
    }

    await updateDoc(targetRef, {
      adminDisabled: !!disabled,
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'adminLogs'), {
      action: disabled ? 'disable_admin' : 'enable_admin',
      targetUserId,
      targetEmail: targetData.email || 'unknown',
      adminId: admin.uid,
      adminEmail: admin.email || 'admin',
      timestamp: serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Set sub-admin disabled error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * List every user with role === 'admin', for the admin-management UI.
 */
export const getAllAdmins = async () => {
  try {
    const q = query(collection(db, 'users'), where('role', '==', 'admin'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('❌ Get all admins error:', error);
    return [];
  }
};

/**
 * Look up a registered user by email - used by the admin-management
 * UI to find who to promote to sub-admin.
 */
export const findUserByEmail = async (email) => {
  try {
    const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const d = snapshot.docs[0];
    return { id: d.id, ...d.data() };
  } catch (error) {
    console.error('❌ Find user by email error:', error);
    return null;
  }
};

// ============================================================
// 📌 EXPORT ALL
// ============================================================

export default {
  emergencyUnlockUser,
  getUserAppLockStatus,
  clearUserAppLock,
  setTemporaryPassword,
  getAdminLogs,
  getAllUsersAdmin,
  bulkEmergencyUnlock,
  createSubAdmin,
  updateSubAdminPermissions,
  removeSubAdmin,
  setSubAdminDisabled,
  getAllAdmins,
  findUserByEmail,
};