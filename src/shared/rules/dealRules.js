// ============================================================
// 📁 src/rules/dealRules.js
// ============================================================
/**
 * 🤝 Deal Rules - Enterprise Edition
 *
 * @module rules/dealRules
 */

// ============================================================
// 📌 CONSTANTS
// ============================================================

export const DEAL_STATUS = {
  // Draft/Initial States
  DRAFT: 'draft',
  WAITING_PAYMENT: 'waiting_payment',
  WAITING_ACCEPT: 'waiting_accept',

  // Active States (এগুলোকে Active Deal হিসেবে বিবেচনা করা হবে)
  PENDING: 'pending',
  ACTIVE: 'active',
  STARTED: 'started',
  FUNDED: 'funded',
  PROCESSING: 'processing',
  REVIEW: 'review',
  REVIEWING: 'reviewing',
  EXTENDED: 'extended',
  DISPUTED: 'disputed',
  OVERDUE: 'overdue',

  // Terminal States
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};

/**
 * Active Deal Statuses — যেসব Status-কে "Active" হিসেবে বিবেচনা করা হবে।
 *
 * ⚠️ এটাই একমাত্র সোর্স অফ ট্রুথ — chatHelpers.js-এর active-deal
 * চেকগুলো এখান থেকেই এই লিস্ট ইমপোর্ট করে, যাতে দুই জায়গায় আলাদা
 * status list রাখার কারণে ড্রিফট (যেমন আগে হয়েছিল: 'overdue'/'pending'
 * miss হয়ে যাওয়া) আর না ঘটে।
 */
export const ACTIVE_DEAL_STATUSES = [
  DEAL_STATUS.PENDING,
  DEAL_STATUS.ACTIVE,
  DEAL_STATUS.STARTED,
  DEAL_STATUS.FUNDED,
  DEAL_STATUS.PROCESSING,
  DEAL_STATUS.REVIEW,
  DEAL_STATUS.REVIEWING,
  DEAL_STATUS.EXTENDED,
  DEAL_STATUS.DISPUTED,
  DEAL_STATUS.OVERDUE,
];

export const TERMINAL_STATUSES = [
  DEAL_STATUS.COMPLETED,
  DEAL_STATUS.CANCELLED,
  DEAL_STATUS.REJECTED,
  DEAL_STATUS.EXPIRED,
];

// ============================================================
// 📌 CONFIGURATION
// ============================================================

export const DEAL_CONFIG = {
  MAX_EXTENSIONS: 3,
  MAX_EXTENSION_DAYS: 30,
  AUTO_COMPLETE_DAYS: 7,
  MIN_DISPUTE_REASON_LENGTH: 10,
  EXTENSION_BASE_FEE: 100, // BDT
  EXTENSION_PER_DAY_FEE: 50, // BDT
};

// ============================================================
// 📌 CORE RULE: hasActiveDeal()
// ============================================================

export const hasActiveDeal = (params) => {
  const { activeDeals = 0, deals = null, activeStatuses = ACTIVE_DEAL_STATUSES } = params || {};

  if (typeof activeDeals === 'number' && activeDeals > 0) {
    return { allowed: false, reason: 'ACTIVE_DEAL_EXISTS' };
  }

  if (Array.isArray(deals) && deals.length > 0) {
    const activeDealsList = deals.filter((deal) => activeStatuses.includes(deal.status));
    if (activeDealsList.length > 0) {
      return { allowed: false, reason: 'ACTIVE_DEAL_EXISTS' };
    }
  }

  return { allowed: true };
};

// ============================================================
// 📌 DEAL CANCEL RULES
// ============================================================

export const dealCancelRules = {
  canCancel: ({ deal, initiator }) => {
    if (!deal) return { allowed: false, reason: 'DEAL_NOT_FOUND' };

    if (TERMINAL_STATUSES.includes(deal.status)) {
      return { allowed: false, reason: 'DEAL_TERMINAL_STATE' };
    }

    if ([DEAL_STATUS.DRAFT, DEAL_STATUS.WAITING_PAYMENT, DEAL_STATUS.WAITING_ACCEPT].includes(deal.status)) {
      return { allowed: true };
    }

    if (ACTIVE_DEAL_STATUSES.includes(deal.status)) {
      if (initiator === 'admin') return { allowed: true };
      return { allowed: false, reason: 'NEEDS_ADMIN_APPROVAL' };
    }

    return { allowed: true };
  },

  getRefundPolicy: (deal) => {
    const status = deal?.status;

    if ([DEAL_STATUS.DRAFT, DEAL_STATUS.WAITING_PAYMENT, DEAL_STATUS.WAITING_ACCEPT].includes(status)) {
      return { fullRefund: true, processingFee: 0 };
    }

    if (ACTIVE_DEAL_STATUSES.includes(status)) {
      return { fullRefund: false, processingFee: 5, percentage: 85 };
    }

    return { fullRefund: false, processingFee: 100 };
  },
};

// ============================================================
// 📌 DEAL CLOSE RULES
// ============================================================

export const dealCloseRules = {
  canClose: ({ deal, initiator }) => {
    if (!deal) return { allowed: false, reason: 'DEAL_NOT_FOUND' };
    if (!ACTIVE_DEAL_STATUSES.includes(deal.status)) return { allowed: false, reason: 'DEAL_NOT_ACTIVE' };
    if (initiator === 'admin') return { allowed: true };
    return { allowed: false, reason: 'NEEDS_MUTUAL_AGREEMENT' };
  },

  shouldAutoComplete: (deal) => {
    if (!deal?.deadline) return { shouldAutoComplete: false, daysOverdue: 0 };

    const deadline = deal.deadline?.toDate?.() || new Date(deal.deadline);
    const now = new Date();
    const autoCompleteAfter = DEAL_CONFIG.AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000;
    const timePassed = now - deadline;

    return {
      shouldAutoComplete: timePassed > autoCompleteAfter,
      daysOverdue: Math.floor(timePassed / (24 * 60 * 60 * 1000)),
    };
  },
};

// ============================================================
// 📌 DEADLINE RULES
// ============================================================

export const dealDeadlineRules = {
  canExtend: ({ deal, requestedDays, initiator }) => {
    const { MAX_EXTENSIONS, MAX_EXTENSION_DAYS } = DEAL_CONFIG;

    if (!deal) return { allowed: false, reason: 'DEAL_NOT_FOUND' };
    if (!ACTIVE_DEAL_STATUSES.includes(deal.status)) return { allowed: false, reason: 'DEAL_NOT_ACTIVE' };

    const currentExtensions = deal.extensionCount || 0;
    if (currentExtensions >= MAX_EXTENSIONS) return { allowed: false, reason: 'MAX_EXTENSIONS_REACHED' };
    if (requestedDays > MAX_EXTENSION_DAYS) return { allowed: false, reason: 'EXTENSION_TOO_LONG' };
    if (!['buyer', 'seller', 'admin'].includes(initiator)) return { allowed: false, reason: 'UNAUTHORIZED' };

    return {
      allowed: true,
      remainingExtensions: MAX_EXTENSIONS - currentExtensions,
      maxDays: MAX_EXTENSION_DAYS,
      fee: DEAL_CONFIG.EXTENSION_BASE_FEE + requestedDays * DEAL_CONFIG.EXTENSION_PER_DAY_FEE,
    };
  },

  getExtensionFee: (deal, days) => {
    const { EXTENSION_BASE_FEE, EXTENSION_PER_DAY_FEE } = DEAL_CONFIG;
    return EXTENSION_BASE_FEE + days * EXTENSION_PER_DAY_FEE;
  },
};

// ============================================================
// 📌 DISPUTE RULES
// ============================================================

export const dealDisputeRules = {
  canDispute: ({ deal, user, reason }) => {
    const { MIN_DISPUTE_REASON_LENGTH } = DEAL_CONFIG;

    if (!deal) return { allowed: false, reason: 'DEAL_NOT_FOUND' };
    if (!ACTIVE_DEAL_STATUSES.includes(deal.status)) return { allowed: false, reason: 'DEAL_NOT_ACTIVE' };

    const isParticipant = deal.buyerId === user?.uid || deal.sellerId === user?.uid;
    if (!isParticipant && user?.role !== 'admin') return { allowed: false, reason: 'NOT_PARTICIPANT' };

    if (!reason || reason.trim().length < MIN_DISPUTE_REASON_LENGTH) {
      return { allowed: false, reason: 'INVALID_REASON' };
    }

    return { allowed: true };
  },

  getResolutionTimeline: () => ({
    reviewTime: '24-48 hours',
    adminResponse: '72 hours',
    maxResolution: '7 days',
  }),

  getResolutionProcess: () => ({
    steps: ['Review evidence', 'Contact both parties', 'Make decision', 'Notify parties', 'Execute decision'],
    appealWindow: '48 hours',
  }),
};

// ============================================================
// 📌 STATUS HELPERS
// ============================================================

export const dealStatusHelpers = {
  isActive: (deal) => Boolean(deal && ACTIVE_DEAL_STATUSES.includes(deal.status)),
  isTerminal: (deal) => Boolean(deal && TERMINAL_STATUSES.includes(deal.status)),
  getActiveDeals: (deals) => deals?.filter((deal) => ACTIVE_DEAL_STATUSES.includes(deal.status)) || [],
  getActiveDealCount: (deals) => dealStatusHelpers.getActiveDeals(deals).length,
};

// ============================================================
// 📌 EXPORT ALL
// ============================================================

export default {
  DEAL_STATUS,
  ACTIVE_DEAL_STATUSES,
  TERMINAL_STATUSES,
  DEAL_CONFIG,
  hasActiveDeal,
  dealCancelRules,
  dealCloseRules,
  dealDeadlineRules,
  dealDisputeRules,
  dealStatusHelpers,
};
