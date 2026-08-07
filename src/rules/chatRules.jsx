// ============================================================
// 📁 src/rules/chatRules.js
// ============================================================
/**
 * 💬 Chat Rules - Enterprise Edition
 * 
 * User Block, Conversation Hide, Delete Conversation,
 * Send Message ইত্যাদির Business Rules
 * 
 * @module rules/chatRules
 */

import { RULE_CODES } from './constants/ruleCodes';
import { hasActiveDeal } from './dealRules';

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
// 📌 CHAT RULES
// ============================================================

export const chatRules = {
  /**
   * ✅ Block User Rule
   * 
   * একজন User-কে Block করার শর্ত Check করে
   * 
   * @param {Object} params
   * @param {string} params.blockerId - যে Block করছে তার UID
   * @param {string} params.targetId - যাকে Block করা হচ্ছে তার UID
   * @param {string} params.targetRole - টার্গেটের Role ('admin', 'client', etc.)
   * @param {boolean} params.hasActiveDealWithTarget - টার্গেটের সাথে Active Deal আছে?
   * @param {boolean} params.isAdmin - ব্লকার কি Admin?
   * @param {number} params.blockCount - ব্লকার ইতিমধ্যে কতজনকে Block করেছে
   * 
   * @returns {Object} { allowed: boolean, reason?: string, message?: string }
   */
  canBlockUser: ({
    blockerId,
    targetId,
    targetRole = 'client',
    hasActiveDealWithTarget = false,
    isAdmin = false,
    blockCount = 0
  }) => {
    
    // ── Check 1: Same User ──
    if (blockerId === targetId) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CANNOT_BLOCK_SELF,
        message: 'আপনি নিজেকে Block করতে পারবেন না।'
      });
    }

    // ── Check 2: Active Deal with Target ──
    if (hasActiveDealWithTarget && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_WITH_TARGET,
        message: 'এই User-এর সাথে আপনার Active Deal আছে। Deal শেষ করে তারপর Block করুন।',
        action: 'FINISH_DEAL'
      });
    }

    // ── Check 3: Admin Protection ──
    if (targetRole === 'admin' && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট Block করা যাবে না।',
        severity: 'warning'
      });
    }

    // ── Check 4: Block Limit (Spam Protection) ──
    const MAX_BLOCK_LIMIT = 50;
    if (blockCount >= MAX_BLOCK_LIMIT && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.BLOCK_LIMIT_REACHED,
        message: `আপনি সর্বোচ্চ ${MAX_BLOCK_LIMIT} জন User Block করতে পারেন।`,
        severity: 'warning',
        action: 'CONTACT_SUPPORT'
      });
    }

    // ── Check 5: Cannot Block if Already Blocked ──
    // (This check will be done by the calling function with isAlreadyBlocked param)
    // if (isAlreadyBlocked) {
    //   return createRuleResult({
    //     allowed: false,
    //     reason: RULE_CODES.ALREADY_BLOCKED,
    //     message: 'আপনি ইতিমধ্যে এই User-কে Block করেছেন।'
    //   });
    // }

    // ── All checks passed ──
    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'User Block করা যাবে।',
      severity: 'success',
      action: 'CONFIRM_BLOCK',
      data: {
        blockedAt: new Date().toISOString(),
        blockId: `BLK-${Date.now()}`
      }
    });
  },

  /**
   * ✅ Unblock User Rule
   */
  canUnblockUser: ({
    blockerId,
    targetId,
    isAdmin = false
  }) => {
    
    if (blockerId === targetId) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CANNOT_BLOCK_SELF,
        message: 'Invalid operation.'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'User Unblock করা যাবে।',
      severity: 'success'
    });
  },

  /**
   * ✅ Hide Conversation Rule
   * 
   * Hide মানে শুধু User-এর Inbox থেকে Conversation সরানো।
   * Database থেকে কিছুই Delete হয় না।
   * তাই সবসময় Allowed।
   */
  canHideConversation: ({
    userId,
    chatId,
    isAdmin = false
  }) => {
    
    // Always allowed - just hiding from UI
    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Conversation Hide করা যাবে।',
      severity: 'success',
      data: {
        hiddenAt: new Date().toISOString(),
        restoreAvailable: true
      }
    });
  },

  /**
   * ✅ Delete Conversation Rule
   * 
   * Conversation Delete করার শর্ত Check করে
   */
  canDeleteConversation: ({
    userId,
    chatId,
    isAdmin = false,
    isChatOwner = false,
    hasActiveDeal = false,
    isGroupChat = false
  }) => {
    
    // ── Check 1: Authorization ──
    if (!isChatOwner && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.UNAUTHORIZED,
        message: 'শুধুমাত্র Chat Owner বা Admin Delete করতে পারে।'
      });
    }

    // ── Check 2: Active Deal ──
    if (hasActiveDeal && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_IN_CHAT,
        message: 'এই Chat-এ Active Deal আছে। Deal শেষ করে তারপর Delete করুন।',
        action: 'FINISH_DEAL'
      });
    }

    // ── Check 3: Group Chat Protection ──
    if (isGroupChat && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.GROUP_CHAT_PROTECTED,
        message: 'Group Chat Delete করতে Admin অনুমতি প্রয়োজন।',
        severity: 'warning',
        action: 'CONTACT_ADMIN'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Conversation Delete করা যাবে।',
      severity: 'success',
      action: 'CONFIRM_DELETE',
      data: {
        deletedAt: new Date().toISOString(),
        permanent: true
      }
    });
  },

  /**
   * ✅ Start Conversation Rule
   * 
   * নতুন Conversation শুরু করার শর্ত Check করে
   */
  canStartConversation: ({
    senderId,
    receiverId,
    isVerified = false,
    isAdmin = false,
    targetRole = 'client',
    hasActiveDeal = false
  }) => {
    
    // ── Check 1: Same User ──
    if (senderId === receiverId) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CANNOT_CHAT_SELF,
        message: 'আপনি নিজের সাথে Chat করতে পারবেন না।'
      });
    }

    // ── Check 2: Admin Protection ──
    if (targetRole === 'admin' && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin-এর সাথে সরাসরি Chat শুরু করা যাবে না।',
        severity: 'warning',
        action: 'CONTACT_SUPPORT'
      });
    }

    // ── Check 3: Verification Required ──
    if (!isVerified && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.VERIFICATION_REQUIRED,
        message: 'Chat শুরু করতে Verification সম্পন্ন করতে হবে।',
        action: 'COMPLETE_VERIFICATION'
      });
    }

    // ── Check 4: Daily Limit ──
    // (This will be checked by calling function with dailyChatCount)
    // const MAX_DAILY_CHATS = 10;
    // if (dailyChatCount >= MAX_DAILY_CHATS && !isAdmin) {
    //   return createRuleResult({
    //     allowed: false,
    //     reason: RULE_CODES.DAILY_CHAT_LIMIT_REACHED,
    //     message: `আপনি আজ সর্বোচ্চ ${MAX_DAILY_CHATS} টি নতুন Chat শুরু করতে পারেন।`
    //   });
    // }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Conversation শুরু করা যাবে।',
      severity: 'success',
      data: {
        startedAt: new Date().toISOString(),
        conversationId: `CONV-${Date.now()}`
      }
    });
  },

  /**
   * ✅ Send Message Rule
   * 
   * Message পাঠানোর শর্ত Check করে
   * 
   * Note: Active Deal Required নেই। কারণ User আগে Chat করবে, তারপর Deal করবে।
   */
  canSendMessage: ({
    senderId,
    receiverId,
    isBlocked = false,
    isSenderBlocked = false,
    isMuted = false,
    isVerified = false,
    isAdmin = false,
    hasActiveDeal = false,
    messageType = 'text', // 'text' | 'image' | 'file' | 'offer'
    messageLength = 0
  }) => {
    
    // ── Check 1: Blocked Check ──
    if (isBlocked) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.USER_BLOCKED,
        message: 'আপনি এই User-কে Block করেছেন। Message পাঠাতে পারবেন না।',
        action: 'UNBLOCK_USER'
      });
    }

    // ── Check 2: Sender Blocked ──
    if (isSenderBlocked) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.SENDER_BLOCKED,
        message: 'এই User আপনাকে Block করেছেন। Message পাঠাতে পারবেন না।'
      });
    }

    // ── Check 3: Muted Check ──
    if (isMuted && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CONVERSATION_MUTED,
        message: 'এই Conversation Mute করা আছে। Message পাঠাতে পারবেন না।',
        action: 'UNMUTE_CONVERSATION'
      });
    }

    // ── Check 4: Verification Required ──
    if (!isVerified && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.VERIFICATION_REQUIRED,
        message: 'Message পাঠাতে Verification সম্পন্ন করতে হবে।',
        action: 'COMPLETE_VERIFICATION'
      });
    }

    // ── Check 5: Message Length ──
    if (messageType === 'text') {
      const MIN_MESSAGE_LENGTH = 1;
      const MAX_MESSAGE_LENGTH = 5000;
      
      if (messageLength < MIN_MESSAGE_LENGTH) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.MESSAGE_TOO_SHORT,
          message: 'Message খুব ছোট। দয়া করে কিছু লিখুন।'
        });
      }
      
      if (messageLength > MAX_MESSAGE_LENGTH) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.MESSAGE_TOO_LONG,
          message: `Message খুব বড়। সর্বোচ্চ ${MAX_MESSAGE_LENGTH} অক্ষর।`
        });
      }
    }

    // ── Check 6: File Type Restriction ──
    if (messageType === 'image' || messageType === 'file') {
      // File size and type check will be done by calling function
      return createRuleResult({
        allowed: true,
        reason: RULE_CODES.ALLOWED,
        message: 'File পাঠানো যাবে।',
        severity: 'success',
        data: {
          maxFileSize: '10MB',
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        }
      });
    }

    // ── Check 7: Offer Message (Proposal) ──
    if (messageType === 'offer') {
      if (!hasActiveDeal && !isAdmin) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.ACTIVE_DEAL_REQUIRED_FOR_OFFER,
          message: 'Offer পাঠাতে Active Deal প্রয়োজন।',
          action: 'START_DEAL'
        });
      }
    }

    // ── Check 8: Rate Limiting ──
    // (Will be checked by calling function)
    // const MESSAGE_LIMIT = 50; // messages per minute
    // if (messagesInLastMinute >= MESSAGE_LIMIT && !isAdmin) {
    //   return createRuleResult({
    //     allowed: false,
    //     reason: RULE_CODES.RATE_LIMIT_EXCEEDED,
    //     message: 'আপনি খুব দ্রুত Message পাঠাচ্ছেন। একটু বিরতি নিন।'
    //   });
    // }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Message পাঠানো যাবে।',
      severity: 'success',
      data: {
        sentAt: new Date().toISOString(),
        messageId: `MSG-${Date.now()}`
      }
    });
  },

  /**
   * ✅ Mute Conversation Rule
   */
  canMuteConversation: ({
    userId,
    chatId,
    isAdmin = false,
    isChatOwner = false,
    muteDuration = '24h' // '1h' | '24h' | '7d' | 'forever'
  }) => {
    
    if (!isChatOwner && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.UNAUTHORIZED,
        message: 'শুধুমাত্র Chat Owner বা Admin Mute করতে পারে।'
      });
    }

    const validDurations = ['1h', '24h', '7d', 'forever'];
    if (!validDurations.includes(muteDuration) && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.INVALID_MUTE_DURATION,
        message: 'বৈধ Mute Duration দিন। (1h, 24h, 7d, forever)'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Conversation Mute করা যাবে।',
      severity: 'success',
      data: {
        mutedAt: new Date().toISOString(),
        duration: muteDuration,
        willExpire: muteDuration !== 'forever'
      }
    });
  },

  /**
   * ✅ Unmute Conversation Rule
   */
  canUnmuteConversation: ({
    userId,
    chatId,
    isAdmin = false,
    isChatOwner = false
  }) => {
    
    if (!isChatOwner && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.UNAUTHORIZED,
        message: 'শুধুমাত্র Chat Owner বা Admin Unmute করতে পারে।'
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Conversation Unmute করা যাবে।',
      severity: 'success'
    });
  },

  /**
   * ✅ Report User Rule
   */
  canReportUser: ({
    reporterId,
    targetId,
    targetRole = 'client',
    reason = '',
    hasActiveDeal = false,
    isAdmin = false,
    reportCount = 0
  }) => {
    
    // ── Check 1: Same User ──
    if (reporterId === targetId) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CANNOT_REPORT_SELF,
        message: 'আপনি নিজেকে Report করতে পারবেন না।'
      });
    }

    // ── Check 2: Admin Protection ──
    if (targetRole === 'admin' && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট Report করা যাবে না।',
        severity: 'warning'
      });
    }

    // ── Check 3: Valid Reason ──
    const MIN_REASON_LENGTH = 10;
    const MAX_REASON_LENGTH = 500;
    
    if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.INVALID_REASON,
        message: `দয়া করে কমপক্ষে ${MIN_REASON_LENGTH} অক্ষরের একটি বৈধ কারণ দিন।`,
        action: 'PROVIDE_REASON'
      });
    }

    if (reason.trim().length > MAX_REASON_LENGTH) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.REASON_TOO_LONG,
        message: `Reason খুব বড়। সর্বোচ্চ ${MAX_REASON_LENGTH} অক্ষর।`
      });
    }

    // ── Check 4: Report Limit ──
    const MAX_REPORTS_PER_DAY = 5;
    if (reportCount >= MAX_REPORTS_PER_DAY && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.REPORT_LIMIT_REACHED,
        message: `আপনি আজ সর্বোচ্চ ${MAX_REPORTS_PER_DAY} টি Report করতে পারেন।`,
        severity: 'warning',
        action: 'TRY_LATER'
      });
    }

    // ── Check 5: Duplicate Report ──
    // (Will be checked by calling function)
    // if (isDuplicateReport) {
    //   return createRuleResult({
    //     allowed: false,
    //     reason: RULE_CODES.DUPLICATE_REPORT,
    //     message: 'আপনি ইতিমধ্যে এই User-কে Report করেছেন।'
    //   });
    // }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'User Report করা যাবে।',
      severity: 'success',
      action: 'CONFIRM_REPORT',
      data: {
        reportId: `RPT-${Date.now()}`,
        reportedAt: new Date().toISOString(),
        estimatedResponse: 'Within 24 hours'
      }
    });
  },

  /**
   * ✅ Get Block Duration Rule
   */
  getBlockDuration: ({
    blockCount = 0,
    violationType = 'general' // 'general' | 'spam' | 'harassment' | 'fraud'
  }) => {
    
    // First time: 24 hours
    if (blockCount === 0) {
      return { duration: '24h', label: '24 hours' };
    }
    
    // Second time: 7 days
    if (blockCount === 1) {
      return { duration: '7d', label: '7 days' };
    }
    
    // Third time: 30 days
    if (blockCount === 2) {
      return { duration: '30d', label: '30 days' };
    }
    
    // Multiple violations: Permanent
    if (blockCount >= 3) {
      return { duration: 'permanent', label: 'Permanent' };
    }

    // Violation-specific
    if (violationType === 'fraud') {
      return { duration: 'permanent', label: 'Permanent (Fraud)' };
    }

    if (violationType === 'harassment') {
      return { duration: '30d', label: '30 days' };
    }

    return { duration: '24h', label: '24 hours' };
  }
};

// ============================================================
// 📌 EXPORT DEFAULT
// ============================================================

export default chatRules;