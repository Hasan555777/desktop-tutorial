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
  data = null,
}) => ({
  allowed,
  reason,
  message,
  severity,
  action,
  canOverride,
  data,
});

// ============================================================
// 📌 CHAT RULES
// ============================================================

export const chatRules = {
  /**
   * ✅ Block User Rule
   */
  canBlockUser: ({
    blockerId,
    targetId,
    targetRole = 'client',
    hasActiveDealWithTarget = false,
    isAdmin = false,
    blockCount = 0,
  }) => {
    if (blockerId === targetId) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CANNOT_BLOCK_SELF,
        message: 'আপনি নিজেকে Block করতে পারবেন না।',
      });
    }

    if (hasActiveDealWithTarget && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_WITH_TARGET,
        message: 'এই User-এর সাথে আপনার Active Deal আছে। Deal শেষ করে তারপর Block করুন।',
        action: 'FINISH_DEAL',
      });
    }

    if (targetRole === 'admin' && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট Block করা যাবে না।',
        severity: 'warning',
      });
    }

    const MAX_BLOCK_LIMIT = 50;
    if (blockCount >= MAX_BLOCK_LIMIT && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.BLOCK_LIMIT_REACHED,
        message: `আপনি সর্বোচ্চ ${MAX_BLOCK_LIMIT} জন User Block করতে পারেন।`,
        severity: 'warning',
        action: 'CONTACT_SUPPORT',
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'User Block করা যাবে।',
      severity: 'success',
      action: 'CONFIRM_BLOCK',
      data: {
        blockedAt: new Date().toISOString(),
        blockId: `BLK-${Date.now()}`,
      },
    });
  },

  /**
   * ✅ Unblock User Rule
   */
  canUnblockUser: ({ blockerId, targetId, isAdmin = false }) => {
    if (blockerId === targetId) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CANNOT_BLOCK_SELF,
        message: 'Invalid operation.',
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'User Unblock করা যাবে।',
      severity: 'success',
    });
  },

  /**
   * ✅ Hide Conversation Rule
   *
   * Hide মানে শুধু User-এর Inbox থেকে Conversation সরানো।
   * Database থেকে কিছুই Delete হয় না, তাই সবসময় Allowed।
   */
  canHideConversation: () => {
    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Conversation Hide করা যাবে।',
      severity: 'success',
      data: {
        hiddenAt: new Date().toISOString(),
        restoreAvailable: true,
      },
    });
  },

  /**
   * ✅ Delete Conversation Rule
   */
  canDeleteConversation: ({
    isAdmin = false,
    isChatOwner = false,
    hasActiveDeal = false,
    isGroupChat = false,
  }) => {
    if (!isChatOwner && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.UNAUTHORIZED,
        message: 'শুধুমাত্র Chat Owner বা Admin Delete করতে পারে।',
      });
    }

    if (hasActiveDeal && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_IN_CHAT,
        message: 'এই Chat-এ Active Deal আছে। Deal শেষ করে তারপর Delete করুন।',
        action: 'FINISH_DEAL',
      });
    }

    if (isGroupChat && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.GROUP_CHAT_PROTECTED,
        message: 'Group Chat Delete করতে Admin অনুমতি প্রয়োজন।',
        severity: 'warning',
        action: 'CONTACT_ADMIN',
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
        permanent: true,
      },
    });
  },

  /**
   * ✅ Start Conversation Rule
   */
  canStartConversation: ({
    senderId,
    receiverId,
    isVerified = false,
    isAdmin = false,
    targetRole = 'client',
  }) => {
    if (senderId === receiverId) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CANNOT_CHAT_SELF,
        message: 'আপনি নিজের সাথে Chat করতে পারবেন না।',
      });
    }

    if (targetRole === 'admin' && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin-এর সাথে সরাসরি Chat শুরু করা যাবে না।',
        severity: 'warning',
        action: 'CONTACT_SUPPORT',
      });
    }

    if (!isVerified && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.VERIFICATION_REQUIRED,
        message: 'Chat শুরু করতে Verification সম্পন্ন করতে হবে।',
        action: 'COMPLETE_VERIFICATION',
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Conversation শুরু করা যাবে।',
      severity: 'success',
      data: {
        startedAt: new Date().toISOString(),
        conversationId: `CONV-${Date.now()}`,
      },
    });
  },

  /**
   * ✅ Send Message Rule
   *
   * Note: Active Deal Required নেই — User আগে Chat করবে, তারপর Deal করবে।
   */
  canSendMessage: ({
    isBlocked = false,
    isSenderBlocked = false,
    isMuted = false,
    isVerified = false,
    isAdmin = false,
    hasActiveDeal = false,
    messageType = 'text',
    messageLength = 0,
  }) => {
    if (isBlocked) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.USER_BLOCKED,
        message: 'আপনি এই User-কে Block করেছেন। Message পাঠাতে পারবেন না।',
        action: 'UNBLOCK_USER',
      });
    }

    if (isSenderBlocked) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.SENDER_BLOCKED,
        message: 'এই User আপনাকে Block করেছেন। Message পাঠাতে পারবেন না।',
      });
    }

    if (isMuted && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CONVERSATION_MUTED,
        message: 'এই Conversation Mute করা আছে। Message পাঠাতে পারবেন না।',
        action: 'UNMUTE_CONVERSATION',
      });
    }

    if (!isVerified && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.VERIFICATION_REQUIRED,
        message: 'Message পাঠাতে Verification সম্পন্ন করতে হবে।',
        action: 'COMPLETE_VERIFICATION',
      });
    }

    if (messageType === 'text') {
      const MIN_MESSAGE_LENGTH = 1;
      const MAX_MESSAGE_LENGTH = 5000;

      if (messageLength < MIN_MESSAGE_LENGTH) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.MESSAGE_TOO_SHORT,
          message: 'Message খুব ছোট। দয়া করে কিছু লিখুন।',
        });
      }

      if (messageLength > MAX_MESSAGE_LENGTH) {
        return createRuleResult({
          allowed: false,
          reason: RULE_CODES.MESSAGE_TOO_LONG,
          message: `Message খুব বড়। সর্বোচ্চ ${MAX_MESSAGE_LENGTH} অক্ষর।`,
        });
      }
    }

    if (messageType === 'image' || messageType === 'file') {
      return createRuleResult({
        allowed: true,
        reason: RULE_CODES.ALLOWED,
        message: 'File পাঠানো যাবে।',
        severity: 'success',
        data: {
          maxFileSize: '10MB',
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        },
      });
    }

    if (messageType === 'offer' && !hasActiveDeal && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ACTIVE_DEAL_REQUIRED_FOR_OFFER,
        message: 'Offer পাঠাতে Active Deal প্রয়োজন।',
        action: 'START_DEAL',
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Message পাঠানো যাবে।',
      severity: 'success',
      data: {
        sentAt: new Date().toISOString(),
        messageId: `MSG-${Date.now()}`,
      },
    });
  },

  /**
   * ✅ Mute Conversation Rule
   */
  canMuteConversation: ({ isAdmin = false, isChatOwner = false, muteDuration = '24h' }) => {
    if (!isChatOwner && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.UNAUTHORIZED,
        message: 'শুধুমাত্র Chat Owner বা Admin Mute করতে পারে।',
      });
    }

    const validDurations = ['1h', '24h', '7d', 'forever'];
    if (!validDurations.includes(muteDuration) && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.INVALID_MUTE_DURATION,
        message: 'বৈধ Mute Duration দিন। (1h, 24h, 7d, forever)',
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
        willExpire: muteDuration !== 'forever',
      },
    });
  },

  /**
   * ✅ Unmute Conversation Rule
   */
  canUnmuteConversation: ({ isAdmin = false, isChatOwner = false }) => {
    if (!isChatOwner && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.UNAUTHORIZED,
        message: 'শুধুমাত্র Chat Owner বা Admin Unmute করতে পারে।',
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'Conversation Unmute করা যাবে।',
      severity: 'success',
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
    isAdmin = false,
    reportCount = 0,
  }) => {
    if (reporterId === targetId) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.CANNOT_REPORT_SELF,
        message: 'আপনি নিজেকে Report করতে পারবেন না।',
      });
    }

    if (targetRole === 'admin' && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.ADMIN_ACCOUNT_PROTECTED,
        message: 'Admin অ্যাকাউন্ট Report করা যাবে না।',
        severity: 'warning',
      });
    }

    const MIN_REASON_LENGTH = 10;
    const MAX_REASON_LENGTH = 500;

    if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.INVALID_REASON,
        message: `দয়া করে কমপক্ষে ${MIN_REASON_LENGTH} অক্ষরের একটি বৈধ কারণ দিন।`,
        action: 'PROVIDE_REASON',
      });
    }

    if (reason.trim().length > MAX_REASON_LENGTH) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.REASON_TOO_LONG,
        message: `Reason খুব বড়। সর্বোচ্চ ${MAX_REASON_LENGTH} অক্ষর।`,
      });
    }

    const MAX_REPORTS_PER_DAY = 5;
    if (reportCount >= MAX_REPORTS_PER_DAY && !isAdmin) {
      return createRuleResult({
        allowed: false,
        reason: RULE_CODES.REPORT_LIMIT_REACHED,
        message: `আপনি আজ সর্বোচ্চ ${MAX_REPORTS_PER_DAY} টি Report করতে পারেন।`,
        severity: 'warning',
        action: 'TRY_LATER',
      });
    }

    return createRuleResult({
      allowed: true,
      reason: RULE_CODES.ALLOWED,
      message: 'User Report করা যাবে।',
      severity: 'success',
      action: 'CONFIRM_REPORT',
      data: {
        reportId: `RPT-${Date.now()}`,
        reportedAt: new Date().toISOString(),
        estimatedResponse: 'Within 24 hours',
      },
    });
  },

  /**
   * ✅ Get Block Duration Rule
   */
  getBlockDuration: ({ blockCount = 0, violationType = 'general' }) => {
    if (blockCount === 0) return { duration: '24h', label: '24 hours' };
    if (blockCount === 1) return { duration: '7d', label: '7 days' };
    if (blockCount === 2) return { duration: '30d', label: '30 days' };
    if (blockCount >= 3) return { duration: 'permanent', label: 'Permanent' };

    if (violationType === 'fraud') return { duration: 'permanent', label: 'Permanent (Fraud)' };
    if (violationType === 'harassment') return { duration: '30d', label: '30 days' };

    return { duration: '24h', label: '24 hours' };
  },
};

export default chatRules;
