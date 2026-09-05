// ============================================================
// 📁 src/rules/accountRules.js
// ============================================================
/**
 * 👤 Account Rules - Enterprise Edition
 * 
 * Account Delete, Change Identity, Remove Verification, 
 * Edit Important Fields সংক্রান্ত Rules
 * 
 * @module rules/accountRules
 */

import { hasActiveDeal } from './dealRules';
import { RULE_CODES } from './constants/ruleCodes';
import { 
  MAX_IDENTITY_CHANGES,
  EMAIL_CHANGE_COOLDOWN,
  PHONE_CHANGE_COOLDOWN,
  MIN_COMPLETED_DEALS,
  MIN_TRUST_SCORE,
  
  IDENTITY_CHANGE_COOLDOWN,
  MERGE_ACCOUNT_REQUIREMENTS
} from './constants/security';

// ============================================================
// 📌 HELPER: Create Rule Result
// ============================================================

const createRuleResult = ({
  allowed,
  reason,
  message,
  severity = 'error',
  action = null,
  canOverride = false,
  data = null
}) => ({
  allowed,
  reason,
  message,
  severity,
  action,
  canOverride,
  data
});

// ============================================================
// 📌 ACCOUNT RULES
// ============================================================

export const accountRules = {
  /**
   * ✅ Delete Account Rule
   * 
   * Account Delete করার আগে সব শর্ত Check করে
   */
  canDeleteAccount: ({ 
    activeDeals = 0, 
    availableBalance = 0,
    lockedBalance = 0,
    escrowBalance = 0,
    pendingBalance = 0,
    pendingWithdrawals = 0,
    pendingDeposits = 0,
    hasInvestigation = false,
    role = 'client',
    hasPendingDispute = false,
    hasPendingRefund = false
  }) => {
    
    // ── Check 1: Active Deal ──
    const dealCheck = hasActiveDeal({ activeDeals });
    if (!dealCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_EXISTS,
        message: 'আপনার Active Deal রয়েছে। ডিল শেষ করে তারপর Account Delete করুন।',
        action: 'FINISH_DEAL'
      });
    }

    // ── Check 2: All Balances Check ──
    const totalBalance = availableBalance + lockedBalance + escrowBalance + pendingBalance;
    if (totalBalance > 0) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.BALANCE_EXISTS,
        message: `আপনার ওয়ালেটে ${totalBalance} টাকা আছে। ডিলিট করার আগে সব টাকা তুলে নিন।`,
        action: 'WITHDRAW_BALANCE',
        data: { availableBalance, lockedBalance, escrowBalance, pendingBalance }
      });
    }

    // ── Check 3: Pending Withdrawals ──
    if (pendingWithdrawals > 0) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PENDING_WITHDRAWALS_EXIST,
        message: `${pendingWithdrawals} টি Pending Withdrawal আছে। সেগুলো Complete হোক।`,
        action: 'COMPLETE_WITHDRAWALS'
      });
    }

    // ── Check 4: Pending Deposits ──
    if (pendingDeposits > 0) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PENDING_DEPOSITS_EXIST,
        message: `${pendingDeposits} টি Pending Deposit আছে। সেগুলো Complete হোক।`,
        action: 'COMPLETE_DEPOSITS'
      });
    }

    // ── Check 5: Pending Dispute ──
    if (hasPendingDispute) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PENDING_DISPUTE_EXISTS,
        message: 'একটি Pending Dispute আছে। প্রথমে তা Resolve করুন।',
        action: 'RESOLVE_DISPUTE'
      });
    }

    // ── Check 6: Pending Refund ──
    if (hasPendingRefund) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PENDING_REFUND_EXISTS,
        message: 'একটি Pending Refund আছে। প্রথমে তা Complete করুন।',
        action: 'COMPLETE_REFUND'
      });
    }

    // ── Check 7: Admin Investigation ──
    if (hasInvestigation) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.UNDER_INVESTIGATION,
        message: 'আপনার অ্যাকাউন্ট Investigation-এর অধীনে আছে।',
        severity: 'warning',
        action: 'CONTACT_SUPPORT'
      });
    }

    // ── Check 8: Admin Role Protection ──
    if (role === 'admin') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট Delete করা যাবে না।',
        severity: 'warning'
      });
    }

    // ── All checks passed ──
    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'আপনার অ্যাকাউন্ট Delete করা যাবে।',
      severity: 'success'
    });
  },

  /**
   * ✅ Change Identity Rule
   * 
   * NID, Birth Certificate, Passport Change করার শর্ত Check করে
   */
  canChangeIdentity: ({ 
    activeDeals = 0, 
    verificationStatus = 'pending',
    identityChangeCount = 0,
    hasFraudAlert = false,
    hasActiveVerification = false,
    lastIdentityChange = null,
    userRole = 'client'
  }) => {
    
    // ── Check 1: Active Deal ──
    const dealCheck = hasActiveDeal({ activeDeals });
    if (!dealCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_EXISTS,
        message: 'Active Deal থাকাকালীন Identity Change করা যাবে না।',
        action: 'FINISH_DEAL'
      });
    }

    // ── Check 2: Active Verification ──
    if (hasActiveVerification || verificationStatus === 'pending') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.VERIFICATION_PENDING,
        message: 'আপনার Verification প্রক্রিয়াধীন। সম্পন্ন হলে পরিবর্তন করুন।',
        action: 'WAIT_VERIFICATION'
      });
    }

    // ── Check 3: Identity Change Limit ──
    if (identityChangeCount >= MAX_IDENTITY_CHANGES) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.MAX_IDENTITY_CHANGES_REACHED,
        message: `সর্বোচ্চ ${MAX_IDENTITY_CHANGES} বার Identity Change করা যায়।`,
        severity: 'warning'
      });
    }

    // ── Check 4: Cooldown Period ──
    if (lastIdentityChange) {
      const daysSinceLastChange = Math.floor((Date.now() - new Date(lastIdentityChange)) / (1000 * 60 * 60 * 24));
      if (daysSinceLastChange < IDENTITY_CHANGE_COOLDOWN) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.IDENTITY_CHANGE_COOLDOWN,
          message: `${IDENTITY_CHANGE_COOLDOWN} দিন পর Identity Change করা যাবে। (${IDENTITY_CHANGE_COOLDOWN - daysSinceLastChange} দিন বাকি)`,
          action: 'WAIT_COOLDOWN',
          data: { daysRemaining: IDENTITY_CHANGE_COOLDOWN - daysSinceLastChange }
        });
      }
    }

    // ── Check 5: Fraud Alert ──
    if (hasFraudAlert) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.FRAUD_ALERT_ACTIVE,
        message: 'Fraud Alert-এর কারণে Identity Change করা যাবে না।',
        severity: 'critical',
        action: 'CONTACT_SUPPORT'
      });
    }

    // ── Check 6: Admin Role Protection ──
    if (userRole === 'admin') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্টের Identity Change করা যাবে না।',
        severity: 'warning'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Identity Change করা যাবে।',
      severity: 'success',
      data: { remainingChanges: MAX_IDENTITY_CHANGES - identityChangeCount - 1 }
    });
  },

  /**
   * ✅ Remove Verification Rule
   */
  canRemoveVerification: ({ 
    activeDeals = 0, 
    completedDeals = 0,
    trustScore = 0,
    hasDisputeHistory = false,
    hasPendingVerification = false,
    userRole = 'client'
  }) => {
    
    // ── Check 1: Active Deal ──
    const dealCheck = hasActiveDeal({ activeDeals });
    if (!dealCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_EXISTS,
        message: 'Active Deal থাকাকালীন Verification Remove করা যাবে না।',
        action: 'FINISH_DEAL'
      });
    }

    // ── Check 2: Pending Verification ──
    if (hasPendingVerification) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.VERIFICATION_PENDING,
        message: 'Verification প্রক্রিয়াধীন থাকলে Remove করা যাবে না।',
        action: 'WAIT_VERIFICATION'
      });
    }

    // ── Check 3: Minimum Completed Deals ──
    if (completedDeals < MIN_COMPLETED_DEALS) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.INSUFFICIENT_COMPLETED_DEALS,
        message: `সর্বনিম্ন ${MIN_COMPLETED_DEALS} টি Completed Deal থাকতে হবে। (বর্তমান: ${completedDeals})`,
        action: 'COMPLETE_DEALS'
      });
    }

    // ── Check 4: Trust Score ──
    if (trustScore < MIN_TRUST_SCORE) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.LOW_TRUST_SCORE,
        message: `Trust Score ${MIN_TRUST_SCORE}-এর বেশি হতে হবে। (বর্তমান: ${trustScore})`,
        action: 'IMPROVE_TRUST_SCORE'
      });
    }

    // ── Check 5: Dispute History ──
    if (hasDisputeHistory) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.DISPUTE_HISTORY_EXISTS,
        message: 'Dispute History থাকলে Verification Remove করা যাবে না।',
        action: 'RESOLVE_DISPUTES',
        severity: 'warning'
      });
    }

    // ── Check 6: Admin Role Protection ──
    if (userRole === 'admin') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট থেকে Verification Remove করা যাবে না।',
        severity: 'warning'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Verification Remove করা যাবে।',
      severity: 'success',
      action: 'CONFIRM_REMOVE'
    });
  },

  /**
   * ✅ Edit Important Fields Rule
   */
  canEditImportantFields: ({ 
    activeDeals = 0, 
    fieldType = 'name',
    isIdentityLocked = false,
    securityPolicy = 'moderate',
    verificationStatus = 'verified',
    userRole = 'client'
  }) => {
    
    // ── Check 1: Active Deal ──
    const dealCheck = hasActiveDeal({ activeDeals });
    if (!dealCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_EXISTS,
        message: 'Active Deal থাকাকালীন Important Fields Edit করা যাবে না।',
        action: 'FINISH_DEAL'
      });
    }

    // ── Check 2: Identity Lock ──
    if (isIdentityLocked) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.IDENTITY_LOCKED,
        message: 'Identity Locked থাকলে Edit করা যাবে না।',
        action: 'UNLOCK_IDENTITY',
        severity: 'warning'
      });
    }

    // ── Check 3: Verification Required ──
    if (verificationStatus !== 'verified' && fieldType !== 'name') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.VERIFICATION_REQUIRED,
        message: 'Verification সম্পন্ন না হলে Important Fields Edit করা যাবে না।',
        action: 'COMPLETE_VERIFICATION'
      });
    }

    // ── Check 4: Security Policy ──
    if (securityPolicy === 'strict') {
      const allowedFields = ['name'];
      if (!allowedFields.includes(fieldType)) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.STRICT_POLICY_RESTRICTION,
          message: 'Strict Policy-তে শুধুমাত্র Name Edit করা যায়।',
          severity: 'warning'
        });
      }
    }

    if (securityPolicy === 'moderate') {
      const allowedFields = ['name', 'phone', 'email'];
      if (!allowedFields.includes(fieldType)) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.FIELD_NOT_ALLOWED,
          message: 'Moderate Policy-তে Name, Phone, Email Edit করা যায়।',
          severity: 'warning'
        });
      }
    }

    // ── Check 5: Admin Role Protection ──
    if (userRole === 'admin' && fieldType !== 'name') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্টের Important Fields Edit করা যাবে না (Name ছাড়া)।',
        severity: 'warning'
      });
    }

    // ── Field-specific restrictions ──
    const result = { allowed: true };
    const extras = {};

    if (fieldType === 'email') {
      extras.requiresOTP = true;
      extras.requiresEmailVerification = true;
      extras.logoutAllDevices = true;
      extras.message = 'Email পরিবর্তন করতে OTP এবং Email Verification প্রয়োজন হবে। সব Device থেকে Logout হবে।';
    }

    if (fieldType === 'phone') {
      extras.requiresOTP = true;
      extras.requiresPIN = true;
      extras.message = 'Phone পরিবর্তন করতে OTP এবং PIN প্রয়োজন হবে।';
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: extras.message || `${fieldType} Edit করা যাবে।`,
      severity: 'success',
      data: extras
    });
  },

  /**
   * ✅ Change Email Rule
   */
  canChangeEmail: ({ 
    activeDeals = 0, 
    verificationStatus = 'verified',
    lastEmailChange = null,
    hasActiveOTP = false,
    userRole = 'client'
  }) => {
    
    const dealCheck = hasActiveDeal({ activeDeals });
    if (!dealCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_EXISTS,
        message: 'Active Deal থাকাকালীন Email Change করা যাবে না।',
        action: 'FINISH_DEAL'
      });
    }

    if (verificationStatus !== 'verified') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.VERIFICATION_REQUIRED,
        message: 'Verification সম্পন্ন না হলে Email Change করা যাবে না।',
        action: 'COMPLETE_VERIFICATION'
      });
    }

    if (lastEmailChange) {
      const daysSinceLastChange = Math.floor((Date.now() - new Date(lastEmailChange)) / (1000 * 60 * 60 * 24));
      if (daysSinceLastChange < EMAIL_CHANGE_COOLDOWN) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.EMAIL_CHANGE_COOLDOWN,
          message: `${EMAIL_CHANGE_COOLDOWN} দিন পর Email Change করা যাবে। (${EMAIL_CHANGE_COOLDOWN - daysSinceLastChange} দিন বাকি)`,
          action: 'WAIT_COOLDOWN',
          data: { daysRemaining: EMAIL_CHANGE_COOLDOWN - daysSinceLastChange }
        });
      }
    }

    if (!hasActiveOTP) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.OTP_VERIFICATION_REQUIRED,
        message: 'OTP Verification প্রয়োজন।',
        action: 'REQUEST_OTP'
      });
    }

    if (userRole === 'admin') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্টের Email Change করা যাবে না।',
        severity: 'warning'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Email Change করা যাবে।',
      severity: 'success',
      data: { logoutAllDevices: true, requiresOTP: true }
    });
  },

  /**
   * ✅ Change Phone Rule
   */
  canChangePhone: ({ 
    activeDeals = 0, 
    lastPhoneChange = null,
    hasActiveOTP = false,
    hasActivePIN = false,
    userRole = 'client'
  }) => {
    
    const dealCheck = hasActiveDeal({ activeDeals });
    if (!dealCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_EXISTS,
        message: 'Active Deal থাকাকালীন Phone Change করা যাবে না।',
        action: 'FINISH_DEAL'
      });
    }

    if (lastPhoneChange) {
      const daysSinceLastChange = Math.floor((Date.now() - new Date(lastPhoneChange)) / (1000 * 60 * 60 * 24));
      if (daysSinceLastChange < PHONE_CHANGE_COOLDOWN) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.PHONE_CHANGE_COOLDOWN,
          message: `${PHONE_CHANGE_COOLDOWN} দিন পর Phone Change করা যাবে। (${PHONE_CHANGE_COOLDOWN - daysSinceLastChange} দিন বাকি)`,
          action: 'WAIT_COOLDOWN',
          data: { daysRemaining: PHONE_CHANGE_COOLDOWN - daysSinceLastChange }
        });
      }
    }

    if (!hasActiveOTP) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.OTP_VERIFICATION_REQUIRED,
        message: 'OTP Verification প্রয়োজন।',
        action: 'REQUEST_OTP'
      });
    }

    if (!hasActivePIN) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PIN_VERIFICATION_REQUIRED,
        message: 'PIN Verification প্রয়োজন।',
        action: 'ENTER_PIN'
      });
    }

    if (userRole === 'admin') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্টের Phone Change করা যাবে না।',
        severity: 'warning'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Phone Change করা যাবে।',
      severity: 'success'
    });
  },

  /**
   * ✅ Merge Accounts Rule
   */
  canMergeAccounts: ({ 
    sourceAccount = null, 
    targetAccount = null,
    sourceActiveDeals = 0,
    targetActiveDeals = 0,
    sourceNID = null,
    targetNID = null,
    sourcePhone = null,
    targetPhone = null,
    sourceFaceVerified = false,
    targetFaceVerified = false,
    userRole = 'client'
  }) => {
    
    if (!sourceAccount || !targetAccount) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.INVALID_ACCOUNTS,
        message: 'বৈধ Account প্রয়োজন।',
        severity: 'error'
      });
    }

    // ── Check 1: Active Deals ──
    const sourceCheck = hasActiveDeal({ activeDeals: sourceActiveDeals });
    if (!sourceCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.SOURCE_ACCOUNT_HAS_ACTIVE_DEALS,
        message: 'Source Account-এ Active Deal আছে।',
        action: 'FINISH_SOURCE_DEALS'
      });
    }

    const targetCheck = hasActiveDeal({ activeDeals: targetActiveDeals });
    if (!targetCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.TARGET_ACCOUNT_HAS_ACTIVE_DEALS,
        message: 'Target Account-এ Active Deal আছে।',
        action: 'FINISH_TARGET_DEALS'
      });
    }

    // ── Check 2: Same NID ──
    if (MERGE_ACCOUNT_REQUIREMENTS.SAME_NID && sourceNID !== targetNID) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.NID_MISMATCH,
        message: 'দুই অ্যাকাউন্টের NID একই হতে হবে।',
        severity: 'warning'
      });
    }

    // ── Check 3: Same Phone ──
    if (MERGE_ACCOUNT_REQUIREMENTS.SAME_PHONE && sourcePhone !== targetPhone) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PHONE_MISMATCH,
        message: 'দুই অ্যাকাউন্টের Phone Number একই হতে হবে।',
        severity: 'warning'
      });
    }

    // ── Check 4: Face Verification ──
    if (MERGE_ACCOUNT_REQUIREMENTS.FACE_VERIFICATION && (!sourceFaceVerified || !targetFaceVerified)) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.FACE_VERIFICATION_REQUIRED,
        message: 'উভয় অ্যাকাউন্টে Face Verification সম্পন্ন হতে হবে।',
        action: 'COMPLETE_FACE_VERIFICATION'
      });
    }

    if (userRole === 'admin') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট Merge করা যাবে না।',
        severity: 'warning'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Account Merge করা যাবে।',
      severity: 'success',
      action: 'CONFIRM_MERGE',
      data: { 
        willPreserve: ['wallet', 'reputation', 'deals', 'transactions'],
        willRemove: ['sourceAccount']
      }
    });
  },

  /**
   * ✅ Close Account Rule
   */
  canCloseAccount: ({ 
    activeDeals = 0, 
    pendingTransactions = 0,
    availableBalance = 0,
    lockedBalance = 0,
    escrowBalance = 0,
    pendingDispute = 0,
    pendingRefund = 0,
    pendingWithdrawal = 0,
    pendingEscrow = 0,
    userRole = 'client'
  }) => {
    
    const dealCheck = hasActiveDeal({ activeDeals });
    if (!dealCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_EXISTS,
        message: 'Active Deal থাকাকালীন Account Close করা যাবে না।',
        action: 'FINISH_DEAL'
      });
    }

    const totalBalance = availableBalance + lockedBalance + escrowBalance;
    if (totalBalance > 0) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.BALANCE_EXISTS,
        message: `${totalBalance} টাকা Balance আছে। প্রথমে তুলে নিন।`,
        action: 'WITHDRAW_BALANCE'
      });
    }

    if (pendingTransactions > 0) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PENDING_TRANSACTIONS_EXIST,
        message: `${pendingTransactions} টি Pending Transaction আছে।`,
        action: 'COMPLETE_TRANSACTIONS'
      });
    }

    if (pendingDispute > 0 || pendingRefund > 0) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PENDING_DISPUTE_OR_REFUND,
        message: `${pendingDispute + pendingRefund} টি Pending Dispute/Refund আছে।`,
        action: 'RESOLVE_DISPUTES'
      });
    }

    if (pendingWithdrawal > 0 || pendingEscrow > 0) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PENDING_WITHDRAWAL_OR_ESCROW,
        message: `${pendingWithdrawal + pendingEscrow} টি Pending Withdrawal/Escrow আছে।`,
        action: 'COMPLETE_PENDING_ITEMS'
      });
    }

    if (userRole === 'admin') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট Close করা যাবে না।',
        severity: 'warning'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Account Close করা যাবে।',
      severity: 'success',
      action: 'CONFIRM_CLOSE',
      data: { 
        willDelete: ['profile', 'posts', 'chats', 'notifications'],
        willKeep: ['transactions', 'deals_history'] 
      }
    });
  },

  /**
   * ✅ Deactivate Account Rule
   */
  canDeactivateAccount: ({ 
    activeDeals = 0, 
    pendingTransactions = 0,
    userRole = 'client'
  }) => {
    
    const dealCheck = hasActiveDeal({ activeDeals });
    if (!dealCheck.allowed) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_EXISTS,
        message: 'Active Deal থাকাকালীন Account Deactivate করা যাবে না।',
        action: 'FINISH_DEAL'
      });
    }

    if (pendingTransactions > 0) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.PENDING_TRANSACTIONS_EXIST,
        message: `${pendingTransactions} টি Pending Transaction আছে।`,
        action: 'COMPLETE_TRANSACTIONS'
      });
    }

    if (userRole === 'admin') {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট Deactivate করা যাবে না।',
        severity: 'warning'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Account Deactivate করা যাবে।',
      severity: 'success',
      data: { reactivationPeriod: '30 days' }
    });
  }
};

// ============================================================
// 📌 EXPORT DEFAULT
// ============================================================

export default accountRules;