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

/**
 * Deal Status Constants
 * Enterprise Level - প্রতিটি Status-এর স্পষ্ট সংজ্ঞা
 */
export const DEAL_STATUS = {
  // Draft/Initial States
  DRAFT: 'draft',                     // খসড়া, এখনও সম্পূর্ণ হয়নি
  WAITING_PAYMENT: 'waiting_payment', // Buyer-এর Payment Waiting
  WAITING_ACCEPT: 'waiting_accept',   // Seller-এর Acceptance Waiting
  
  // Active States (যেগুলোকে Active Deal হিসেবে বিবেচনা করা হবে)
  PENDING: 'pending',                 // Escrow পেন্ডিং, Buyer Accept করেনি
  ACTIVE: 'active',                   // চালু আছে, কাজ চলছে
  STARTED: 'started',                 // কাজ শুরু হয়েছে
  FUNDED: 'funded',                   // Escrow ফান্ডেড হয়েছে
  PROCESSING: 'processing',           // প্রসেসিং হচ্ছে
  REVIEW: 'review',                   // রিভিউ চলছে
  REVIEWING: 'reviewing',             // রিভিউ চলছে
  EXTENDED: 'extended',               // এক্সটেন্ডেড হয়েছে
  DISPUTED: 'disputed',               // ডিসপিউট চলছে
  
  // Terminal States
  COMPLETED: 'completed',             // সম্পন্ন হয়েছে
  CANCELLED: 'cancelled',             // বাতিল হয়েছে
  REJECTED: 'rejected',               // প্রত্যাখ্যান হয়েছে
  EXPIRED: 'expired',                 // মেয়াদ শেষ
};

/**
 * Active Deal Statuses
 * যেসব Status-কে "Active" হিসেবে বিবেচনা করা হবে
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
];

/**
 * Terminal Statuses
 * যে Status-গুলোতে Deal আর Active নয়
 */
export const TERMINAL_STATUSES = [
  DEAL_STATUS.COMPLETED,
  DEAL_STATUS.CANCELLED,
  DEAL_STATUS.REJECTED,
  DEAL_STATUS.EXPIRED,
];

// ============================================================
// 📌 CONFIGURATION (Constants থেকে আনা)
// ============================================================

export const DEAL_CONFIG = {
  MAX_EXTENSIONS: 3,
  MAX_EXTENSION_DAYS: 30,
  AUTO_COMPLETE_DAYS: 7,
  MIN_DISPUTE_REASON_LENGTH: 10,
  EXTENSION_BASE_FEE: 100,  // BDT
  EXTENSION_PER_DAY_FEE: 50, // BDT
};

// ============================================================
// 📌 CORE RULE: hasActiveDeal()
// ============================================================

/**
 * ✅ Core Function — Active Deal Check
 * 
 * এই ফাংশন শুধু একটি প্রশ্নের উত্তর দেয়:
 * "এই User-এর Active Deal আছে কি নেই?"
 * 
 * @param {Object} params
 * @param {number} params.activeDeals - ইউজারের Active Deal সংখ্যা
 * @param {Array} params.deals - (Optional) ডিলের Array
 * @param {Array} params.activeStatuses - (Optional) কাস্টম Status List
 * 
 * @returns {Object} { allowed: boolean, reason?: string }
 * 
 * @example
 * // Basic Usage
 * const result = hasActiveDeal({ activeDeals: 2 });
 * // { allowed: false, reason: "ACTIVE_DEAL_EXISTS" }
 * 
 * // With Deals Array
 * const result = hasActiveDeal({ 
 *   deals: [{ status: 'active' }, { status: 'completed' }] 
 * });
 */
export const hasActiveDeal = (params) => {
  const { 
    activeDeals = 0, 
    deals = null,
    activeStatuses = ACTIVE_DEAL_STATUSES
  } = params || {};

  // Option 1: Direct count check
  if (typeof activeDeals === 'number' && activeDeals > 0) {
    return {
      allowed: false,
      reason: "ACTIVE_DEAL_EXISTS"
    };
  }

  // Option 2: Deals array check
  if (Array.isArray(deals) && deals.length > 0) {
    const activeDealsList = deals.filter(deal => 
      activeStatuses.includes(deal.status)
    );

    if (activeDealsList.length > 0) {
      return {
        allowed: false,
        reason: "ACTIVE_DEAL_EXISTS"
      };
    }
  }

  // No active deals
  return {
    allowed: true
  };
};

// ============================================================
// 📌 DEAL CANCEL RULES
// ============================================================

export const dealCancelRules = {
  /**
   * Deal Cancel করা যাবে কিনা Check করে
   * 
   * @param {Object} params
   * @param {Object} params.deal - Deal Object
   * @param {string} params.initiator - 'buyer' | 'seller' | 'admin'
   * 
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  canCancel: ({ deal, initiator }) => {
    if (!deal) {
      return { allowed: false, reason: "DEAL_NOT_FOUND" };
    }

    // Terminal deals cannot be cancelled
    if (TERMINAL_STATUSES.includes(deal.status)) {
      return { allowed: false, reason: "DEAL_TERMINAL_STATE" };
    }

    // Draft/Initial deals can be cancelled easily
    if ([DEAL_STATUS.DRAFT, DEAL_STATUS.WAITING_PAYMENT, DEAL_STATUS.WAITING_ACCEPT].includes(deal.status)) {
      return { allowed: true };
    }

    // Active deals need admin approval
    if (ACTIVE_DEAL_STATUSES.includes(deal.status)) {
      if (initiator === 'admin') {
        return { allowed: true };
      }
      return { allowed: false, reason: "NEEDS_ADMIN_APPROVAL" };
    }

    return { allowed: true };
  },

  /**
   * Deal Cancel করার পর Refund Policy
   */
  getRefundPolicy: (deal) => {
    const status = deal?.status;
    
    // Full refund for initial states
    if ([DEAL_STATUS.DRAFT, DEAL_STATUS.WAITING_PAYMENT, DEAL_STATUS.WAITING_ACCEPT].includes(status)) {
      return { fullRefund: true, processingFee: 0 };
    }
    
    // Partial refund for active deals
    if (ACTIVE_DEAL_STATUSES.includes(status)) {
      return { fullRefund: false, processingFee: 5, percentage: 85 };
    }
    
    // No refund for terminal states
    return { fullRefund: false, processingFee: 100 };
  }
};

// ============================================================
// 📌 DEAL CLOSE RULES
// ============================================================

export const dealCloseRules = {
  /**
   * Deal Close করা যাবে কিনা Check করে
   */
  canClose: ({ deal, initiator }) => {
    if (!deal) {
      return { allowed: false, reason: "DEAL_NOT_FOUND" };
    }

    // Only active deals can be closed
    if (!ACTIVE_DEAL_STATUSES.includes(deal.status)) {
      return { allowed: false, reason: "DEAL_NOT_ACTIVE" };
    }

    // Admin can close any active deal
    if (initiator === 'admin') {
      return { allowed: true };
    }

    // Both parties must agree
    return { allowed: false, reason: "NEEDS_MUTUAL_AGREEMENT" };
  },

  /**
   * Auto Complete হবে কিনা Check করে
   */
  shouldAutoComplete: (deal) => {
    if (!deal?.deadline) {
      return { shouldAutoComplete: false, daysOverdue: 0 };
    }

    const deadline = deal.deadline?.toDate?.() || new Date(deal.deadline);
    const now = new Date();
    const autoCompleteAfter = DEAL_CONFIG.AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000;
    const timePassed = now - deadline;

    return {
      shouldAutoComplete: timePassed > autoCompleteAfter,
      daysOverdue: Math.floor(timePassed / (24 * 60 * 60 * 1000))
    };
  }
};

// ============================================================
// 📌 DEADLINE RULES
// ============================================================

export const dealDeadlineRules = {
  /**
   * Deadline Extend করা যাবে কিনা Check করে
   */
  canExtend: ({ deal, requestedDays, initiator }) => {
    const { MAX_EXTENSIONS, MAX_EXTENSION_DAYS } = DEAL_CONFIG;

    if (!deal) {
      return { allowed: false, reason: "DEAL_NOT_FOUND" };
    }

    // Only active deals can be extended
    if (!ACTIVE_DEAL_STATUSES.includes(deal.status)) {
      return { allowed: false, reason: "DEAL_NOT_ACTIVE" };
    }

    // Check extension count
    const currentExtensions = deal.extensionCount || 0;
    if (currentExtensions >= MAX_EXTENSIONS) {
      return { allowed: false, reason: "MAX_EXTENSIONS_REACHED" };
    }

    // Check extension days
    if (requestedDays > MAX_EXTENSION_DAYS) {
      return { allowed: false, reason: "EXTENSION_TOO_LONG" };
    }

    // Only parties or admin can extend
    if (!['buyer', 'seller', 'admin'].includes(initiator)) {
      return { allowed: false, reason: "UNAUTHORIZED" };
    }

    return {
      allowed: true,
      remainingExtensions: MAX_EXTENSIONS - currentExtensions,
      maxDays: MAX_EXTENSION_DAYS,
      fee: DEAL_CONFIG.EXTENSION_BASE_FEE + (requestedDays * DEAL_CONFIG.EXTENSION_PER_DAY_FEE)
    };
  },

  /**
   * Extension Fee কত হবে
   */
  getExtensionFee: (deal, days) => {
    const { EXTENSION_BASE_FEE, EXTENSION_PER_DAY_FEE } = DEAL_CONFIG;
    return EXTENSION_BASE_FEE + (days * EXTENSION_PER_DAY_FEE);
  }
};

// ============================================================
// 📌 DISPUTE RULES
// ============================================================

export const dealDisputeRules = {
  /**
   * Dispute করা যাবে কিনা Check করে
   */
  canDispute: ({ deal, user, reason }) => {
    const { MIN_DISPUTE_REASON_LENGTH } = DEAL_CONFIG;

    if (!deal) {
      return { allowed: false, reason: "DEAL_NOT_FOUND" };
    }

    // Only active deals can be disputed
    if (!ACTIVE_DEAL_STATUSES.includes(deal.status)) {
      return { allowed: false, reason: "DEAL_NOT_ACTIVE" };
    }

    // Only participants or admin can dispute
    const isParticipant = deal.buyerId === user?.uid || deal.sellerId === user?.uid;
    if (!isParticipant && user?.role !== 'admin') {
      return { allowed: false, reason: "NOT_PARTICIPANT" };
    }

    // Valid reason required
    if (!reason || reason.trim().length < MIN_DISPUTE_REASON_LENGTH) {
      return { allowed: false, reason: "INVALID_REASON" };
    }

    return { allowed: true };
  },

  /**
   * Dispute Resolution Timeline
   */
  getResolutionTimeline: () => ({
    reviewTime: '24-48 hours',
    adminResponse: '72 hours',
    maxResolution: '7 days'
  }),

  /**
   * Dispute Resolution Process
   */
  getResolutionProcess: () => ({
    steps: [
      'Review evidence',
      'Contact both parties',
      'Make decision',
      'Notify parties',
      'Execute decision'
    ],
    appealWindow: '48 hours'
  })
};

// ============================================================
// 📌 STATUS HELPERS
// ============================================================

export const dealStatusHelpers = {
  /**
   * Check if a deal is active
   */
  isActive: (deal) => {
    return deal && ACTIVE_DEAL_STATUSES.includes(deal.status);
  },

  /**
   * Check if a deal is terminal
   */
  isTerminal: (deal) => {
    return deal && TERMINAL_STATUSES.includes(deal.status);
  },

  /**
   * Get all active deals from an array
   */
  getActiveDeals: (deals) => {
    return deals?.filter(deal => ACTIVE_DEAL_STATUSES.includes(deal.status)) || [];
  },

  /**
   * Get active deal count
   */
  getActiveDealCount: (deals) => {
    return dealStatusHelpers.getActiveDeals(deals).length;
  }
};

// ============================================================
// 📌 EXPORT ALL
// ============================================================

export default {
  // Constants
  DEAL_STATUS,
  ACTIVE_DEAL_STATUSES,
  TERMINAL_STATUSES,
  DEAL_CONFIG,
  
  // Core Rules
  hasActiveDeal,
  
  // Rule Groups
  dealCancelRules,
  dealCloseRules,
  dealDeadlineRules,
  dealDisputeRules,
  
  // Helpers
  dealStatusHelpers,
};