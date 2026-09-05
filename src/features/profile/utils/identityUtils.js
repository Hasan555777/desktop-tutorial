// ============================================================
// 📁 src/utils/identityUtils.js
// ============================================================
// Identity Verification Utilities - Duplicate Detection, Hashing, Masking
//
// 🆕 THIS REVISION: added runIdentityDuplicateCheck() — a single shared
// implementation of "hash the ID number, check for duplicates, save an
// identityRecords entry, flag the user + notify admins if a duplicate
// is found." Previously this logic lived only inside
// useRegisterFlow.js, duplicated by hand — meaning the registration
// flow and the Profile page's document-(re)upload flow could easily
// drift apart (and had: Profile's document upload didn't run any
// duplicate check at all, a real gap since a user can skip
// verification at registration and upload documents for the first
// time from Profile instead). Both useRegisterFlow.js and Profile.jsx
// now call this one function, so there's exactly one place this logic
// can ever live.

import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, runTransaction, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../../../shared/firebase/index';

// ============================================================
// 📌 CONSTANTS
// ============================================================

export const IDENTITY_TYPES = {
  NID: 'nid',
  BIRTH_CERTIFICATE: 'birth_certificate',
  PASSPORT: 'passport',
};

export const IDENTITY_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  DUPLICATE: 'duplicate',
  APPROVED: 'approved',
};

// ============================================================
// 📌 HASHING
// ============================================================

/**
 * Create SHA-256 hash of identity number
 */
export const hashIdentityNumber = async (number) => {
  if (!number || typeof number !== 'string') {
    throw new Error('Valid identity number is required');
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(number.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
};

/**
 * Mask identity number (show only last 4 digits)
 */
export const maskIdentityNumber = (number) => {
  if (!number || typeof number !== 'string') return 'N/A';
  if (number.length < 4) return '*'.repeat(number.length);
  
  const last4 = number.slice(-4);
  const maskLength = Math.min(number.length - 4, 8);
  const masked = '*'.repeat(maskLength) + last4;
  
  return masked;
};

// ============================================================
// 📌 DUPLICATE DETECTION
// ============================================================

/**
 * Detect duplicate identity by checking SHA-256 hash
 */
export const detectDuplicateIdentity = async (identityNumber, identityType, excludeUserId = null) => {
  try {
    const hash = await hashIdentityNumber(identityNumber);
    
    // ✅ Check both users collection and identityRecords collection
    let matches = [];
    
    // ── Check users collection ──
    const userQuery = query(
      collection(db, 'users'),
      where('identity.hashedId', '==', hash),
      where('identity.type', '==', identityType)
    );
    const userSnapshot = await getDocs(userQuery);
    const userMatches = userSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data(), source: 'users' }))
      .filter(user => user.id !== excludeUserId);
    matches.push(...userMatches);
    
    // ── Check identityRecords collection ──
    // 🔧 FIX: identityRecords documents are addDoc()-created — the doc ID
    // is a random auto-generated string, NOT the user's UID (unlike the
    // users collection, where doc.id IS the uid). The userId is only
    // stored as a field on each record. Comparing record.id !== excludeUserId
    // compared a random doc ID against the uid and could never match,
    // so a user's own earlier submission was never excluded — every
    // resubmission with the same real ID number matched their own prior
    // record and got auto-flagged as a duplicate of themselves. Filtering
    // on the userId field instead fixes this.
    const recordQuery = query(
      collection(db, 'identityRecords'),
      where('identityHash', '==', hash),
      where('identityType', '==', identityType)
    );
    const recordSnapshot = await getDocs(recordQuery);
    const recordMatches = recordSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data(), source: 'identityRecords' }))
      .filter(record => record.userId !== excludeUserId);
    matches.push(...recordMatches);
    
    return {
      isDuplicate: matches.length > 0,
      matches,
      hash,
      error: null
    };
    
  } catch (error) {
    console.error('❌ Duplicate detection error:', error);
    return {
      isDuplicate: false,
      matches: [],
      hash: null,
      error: error.message
    };
  }
};

/**
 * Check if a user has already been verified
 */
export const isIdentityVerified = (userData) => {
  return userData?.identity?.status === IDENTITY_STATUS.VERIFIED || 
         userData?.identity?.status === IDENTITY_STATUS.APPROVED;
};

/**
 * Check if a user has pending identity verification
 */
export const isIdentityPending = (userData) => {
  return userData?.identity?.status === IDENTITY_STATUS.PENDING;
};

/**
 * Check if a user is flagged as duplicate
 */
export const isDuplicateIdentity = (userData) => {
  return userData?.identity?.duplicateCheck?.isDuplicate === true;
};

// ============================================================
// 🆕 SHARED: IDENTITY DUPLICATE CHECK + AUTO-SAVE TO identityRecords
// ============================================================
// Used by BOTH the registration flow (useRegisterFlow.js) and the
// profile document-(re)upload flow (Profile.jsx / DocumentsTab.jsx),
// so the two entry points can never end up with different duplicate-
// detection behavior again.
//
// Never throws — a failure here is logged and swallowed. A duplicate-
// identity check is a warning system for admin review, not a gate on
// the user's document upload or registration; it must never block or
// fail either flow.
//
// Params:
//   userId            - the Firebase Auth uid this identity belongs to
//   uniqueId           - the user's WorkTrustbd uniqueId (for display)
//   fullName, phone, email - denormalized for the identityRecords row
//   identityNumber     - raw NID / birth-registration number
//   identityType        - 'nid' | 'birth_certificate'
//   documentFrontUrl / documentBackUrl - uploaded Cloudinary URLs
//
// Returns { isDuplicate, duplicateOfId } on success, or
// { skipped: true } / { error } if it couldn't run.
export const runIdentityDuplicateCheck = async ({
  userId,
  uniqueId,
  fullName,
  phone,
  email,
  identityNumber,
  identityType,
  documentFrontUrl = '',
  documentBackUrl = '',
}) => {
  const idNumber = (identityNumber || '').trim();
  if (!idNumber || !userId || !identityType) return { skipped: true };

  try {
    const dupCheck = await detectDuplicateIdentity(idNumber, identityType, userId);
    const hash = dupCheck.hash || await hashIdentityNumber(idNumber);
    const masked = maskIdentityNumber(idNumber);

    const isDuplicate = !!dupCheck.isDuplicate;
    const duplicateOfId = isDuplicate ? (dupCheck.matches?.[0]?.id || null) : null;
    const recordStatus = isDuplicate ? 'duplicate' : 'pending';

    // 🔧 FIX (identity DB history/status check): every resubmission
    // used to create a brand new identityRecords row without ever
    // touching earlier ones for the same user — after 2-3
    // resubmissions, an admin reviewing Identity DB would see 2-3
    // separate "pending" rows for the same person with no way to
    // tell which one is actually current, and the pending count/
    // filter would be inflated by stale rows nobody will ever act on
    // again. This only supersedes rows that are still 'pending' (an
    // admin's own approved/rejected/duplicate decision on an older
    // row is a real decision and is left alone, never silently
    // overwritten).
    try {
      const priorPendingQuery = query(
        collection(db, 'identityRecords'),
        where('userId', '==', userId),
        where('status', '==', 'pending')
      );
      const priorPendingSnap = await getDocs(priorPendingQuery);
      await Promise.all(
        priorPendingSnap.docs.map(d =>
          updateDoc(d.ref, { status: 'superseded', supersededAt: serverTimestamp() })
        )
      );
    } catch (supersedeErr) {
      console.warn('Superseding prior identity records failed (non-blocking):', supersedeErr.message);
    }

    await addDoc(collection(db, 'identityRecords'), {
      fullName: fullName || '',
      identityType,
      identityNumber: idNumber,
      identityHash: hash,
      phone: phone || '',
      email: email || '',
      address: '',
      documentFront: documentFrontUrl,
      documentBack: documentBackUrl,
      notes: isDuplicate
        ? `স্বয়ংক্রিয়ভাবে ডুপ্লিকেট শনাক্ত হয়েছে (${dupCheck.matches.length} টি মিল)`
        : '',
      userId,
      userUniqueId: uniqueId || '',
      autoAdded: true,
      status: recordStatus,
      isDuplicate,
      duplicateOf: duplicateOfId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'users', userId), {
      identity: {
        type: identityType,
        hashedId: hash,
        maskedNumber: masked,
        status: recordStatus,
        duplicateCheck: {
          isDuplicate,
          duplicateOf: duplicateOfId,
          checkedAt: new Date().toISOString(),
        },
      },
      ...(isDuplicate ? { needsReview: true } : {}),
    });

    if (isDuplicate) {
      try {
        await addDoc(collection(db, 'admin_notifications'), {
          title: '🚫 সম্ভাব্য ডুপ্লিকেট আইডি শনাক্ত',
          message: `${fullName || 'একজন ইউজার'} (${uniqueId || userId}) — একই ${identityType === 'nid' ? 'NID' : 'জন্ম নিবন্ধন'} নম্বর দিয়ে আগে থেকেই অন্য একটি অ্যাকাউন্ট/রেকর্ড খুঁজে পাওয়া গেছে। Identity DB / রিভিউ ট্যাব থেকে যাচাই করুন।`,
          type: 'duplicate_identity',
          event: 'duplicate_identity',
          icon: 'fa-solid fa-triangle-exclamation',
          colorClass: 'noti-danger',
          isRead: false,
          relatedUserId: userId,
          createdAt: serverTimestamp(),
        });
      } catch (notifyErr) {
        console.warn('Admin duplicate-identity notification failed (non-blocking):', notifyErr.message);
      }
    }

    return { isDuplicate, duplicateOfId };
  } catch (error) {
    console.error('Identity duplicate-check/save error (non-blocking):', error);
    return { error: error.message };
  }
};

// ============================================================
// 📌 ADMIN ACTIONS
// ============================================================

/**
 * Verify a user's identity (Admin action)
 */
export const verifyIdentity = async (userId, adminId) => {
  if (!userId || !adminId) {
    throw new Error('User ID and Admin ID are required');
  }
  
  try {
    await updateDoc(doc(db, 'users', userId), {
      'identity.status': IDENTITY_STATUS.VERIFIED,
      'identity.verifiedAt': serverTimestamp(),
      'identity.verifiedBy': adminId,
      'identity.duplicateCheck.isDuplicate': false,
      'identity.duplicateCheck.duplicateOf': null,
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('❌ Verify identity error:', error);
    throw error;
  }
};

/**
 * Reject a user's identity verification (Admin action)
 */
export const rejectIdentity = async (userId, adminId, reason = '') => {
  if (!userId || !adminId) {
    throw new Error('User ID and Admin ID are required');
  }
  
  try {
    await updateDoc(doc(db, 'users', userId), {
      'identity.status': IDENTITY_STATUS.REJECTED,
      'identity.rejectedAt': serverTimestamp(),
      'identity.rejectedBy': adminId,
      'identity.rejectReason': reason || 'Admin rejected identity verification',
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('❌ Reject identity error:', error);
    throw error;
  }
};

/**
 * Flag a user's identity as duplicate (Admin action)
 */
export const flagDuplicateIdentity = async (userId, duplicateOf, adminId, note = '') => {
  if (!userId || !duplicateOf || !adminId) {
    throw new Error('User ID, Duplicate Of, and Admin ID are required');
  }
  
  try {
    await updateDoc(doc(db, 'users', userId), {
      'identity.status': IDENTITY_STATUS.DUPLICATE,
      'identity.duplicateCheck.isDuplicate': true,
      'identity.duplicateCheck.duplicateOf': duplicateOf,
      'identity.duplicateCheck.checkedAt': serverTimestamp(),
      'identity.duplicateCheck.checkedBy': adminId,
      'identity.duplicateCheck.note': note || 'Flagged as duplicate by admin',
      'isVerified': false,
      'isComplete': false,
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('❌ Flag duplicate error:', error);
    throw error;
  }
};

/**
 * Merge two accounts (Admin action)
 */
export const mergeAccounts = async (sourceId, targetId, adminId, options = {}) => {
  if (!sourceId || !targetId || !adminId) {
    throw new Error('Source ID, Target ID, and Admin ID are required');
  }
  
  if (sourceId === targetId) {
    throw new Error('Cannot merge an account with itself');
  }
  
  try {
    await runTransaction(db, async (transaction) => {
      const sourceRef = doc(db, 'users', sourceId);
      const targetRef = doc(db, 'users', targetId);
      
      const sourceSnap = await transaction.get(sourceRef);
      const targetSnap = await transaction.get(targetRef);
      
      if (!sourceSnap.exists() || !targetSnap.exists()) {
        throw new Error('One or both users not found');
      }
      
      // Merge wallet balances
      if (options.mergeWallet !== false) {
        const sourceWalletRef = doc(db, 'wallets', sourceId);
        const targetWalletRef = doc(db, 'wallets', targetId);
        
        const sourceWalletSnap = await transaction.get(sourceWalletRef);
        const targetWalletSnap = await transaction.get(targetWalletRef);
        
        if (sourceWalletSnap.exists() && targetWalletSnap.exists()) {
          const sourceBalance = sourceWalletSnap.data().balance || 0;
          const targetBalance = targetWalletSnap.data().balance || 0;
          
          transaction.update(targetWalletRef, {
            balance: targetBalance + sourceBalance,
            totalEarned: (targetWalletSnap.data().totalEarned || 0) + (sourceWalletSnap.data().totalEarned || 0),
            updatedAt: serverTimestamp()
          });
        }
      }
      
      // Disable source account
      transaction.update(sourceRef, {
        'identity.status': IDENTITY_STATUS.DUPLICATE,
        'identity.mergedInto': targetId,
        'identity.mergedAt': serverTimestamp(),
        'identity.mergedBy': adminId,
        isActive: false,
        isBanned: true,
        isBlocked: true,
        banReason: 'Account merged into ' + targetId,
        updatedAt: serverTimestamp()
      });
      
      // Update target account
      transaction.update(targetRef, {
        'identity.duplicateCheck.hasDuplicate': false,
        'identity.duplicateCheck.duplicateAccounts': arrayRemove(sourceId),
        'identity.duplicateCheck.mergedFrom': arrayUnion(sourceId),
        updatedAt: serverTimestamp()
      });
    });
    
    return { success: true, message: 'Accounts merged successfully' };
    
  } catch (error) {
    console.error('❌ Merge accounts error:', error);
    throw error;
  }
};

// ============================================================
// 📌 DATA EXTRACTION
// ============================================================

/**
 * Extract identity number from user data
 */
export const extractIdentityInfo = (userData) => {
  if (!userData?.identity) {
    return { type: null, number: null, masked: null, hashed: null };
  }
  
  return {
    type: userData.identity.type || null,
    number: userData.identity.rawNumber || null,
    masked: userData.identity.maskedNumber || null,
    hashed: userData.identity.hashedId || null,
    status: userData.identity.status || null
  };
};

/**
 * Get identity display status
 */
export const getIdentityStatusDisplay = (userData) => {
  const status = userData?.identity?.status || 'none';
  const isDuplicate = userData?.identity?.duplicateCheck?.isDuplicate || false;
  
  const statusMap = {
    [IDENTITY_STATUS.VERIFIED]: { 
      label: '✅ Verified', 
      color: 'success', 
      icon: 'fa-solid fa-check-circle' 
    },
    [IDENTITY_STATUS.APPROVED]: { 
      label: '✅ Approved', 
      color: 'success', 
      icon: 'fa-solid fa-check-circle' 
    },
    [IDENTITY_STATUS.PENDING]: { 
      label: '⏳ Pending', 
      color: 'warning', 
      icon: 'fa-solid fa-clock' 
    },
    [IDENTITY_STATUS.REJECTED]: { 
      label: '❌ Rejected', 
      color: 'danger', 
      icon: 'fa-solid fa-times-circle' 
    },
    [IDENTITY_STATUS.DUPLICATE]: { 
      label: '🚫 Duplicate', 
      color: 'danger', 
      icon: 'fa-solid fa-ban' 
    },
    'none': { 
      label: 'Not Verified', 
      color: 'muted', 
      icon: 'fa-solid fa-circle' 
    }
  };
  
  if (isDuplicate) {
    return { 
      label: '🚫 Duplicate', 
      color: 'danger', 
      icon: 'fa-solid fa-ban' 
    };
  }
  
  return statusMap[status] || statusMap['none'];
};

// ============================================================
// 📌 NOTIFICATIONS
// ============================================================

/**
 * Create notification for identity verification events
 */
export const createIdentityNotification = async (userId, message, type = 'info') => {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId: userId,
      message: message,
      type: type,
      isUnread: true,
      event: 'IDENTITY_UPDATE',
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('❌ Create notification error:', error);
  }
};

// ============================================================
// 📌 IDENTITY DATABASE FUNCTIONS
// ============================================================

/**
 * Save identity record to identityRecords collection
 */
export const saveIdentityRecord = async (data) => {
  try {
    const docRef = await addDoc(collection(db, 'identityRecords'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error('❌ Save identity record error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Update identity record status
 */
export const updateIdentityRecordStatus = async (recordId, status, data = {}) => {
  try {
    await updateDoc(doc(db, 'identityRecords', recordId), {
      status: status,
      ...data,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('❌ Update identity record error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get identity records by user ID
 */
export const getIdentityRecordsByUser = async (userId) => {
  try {
    const q = query(
      collection(db, 'identityRecords'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('❌ Get identity records error:', error);
    return [];
  }
};

// ============================================================
// 📌 EXPORT DEFAULT
// ============================================================

export default {
  hashIdentityNumber,
  maskIdentityNumber,
  detectDuplicateIdentity,
  runIdentityDuplicateCheck,
  isIdentityVerified,
  isIdentityPending,
  isDuplicateIdentity,
  verifyIdentity,
  rejectIdentity,
  flagDuplicateIdentity,
  mergeAccounts,
  extractIdentityInfo,
  getIdentityStatusDisplay,
  createIdentityNotification,
  saveIdentityRecord,
  updateIdentityRecordStatus,
  getIdentityRecordsByUser,
  IDENTITY_TYPES,
  IDENTITY_STATUS,
};