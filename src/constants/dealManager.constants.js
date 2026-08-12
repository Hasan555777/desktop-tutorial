// dealManager.constants.js
// All timing constants + status enums used across the Deal Manager feature.

export const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_EXTENSIONS = 3;
export const EXTENSION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// How long a 'pending' offer waits before it's auto-cancelled if nobody
// responds.
export const OFFER_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

// How long a seller has, after a milestone is funded, to submit work
// before the buyer is automatically refunded.
export const SUBMIT_DEADLINE_AFTER_FUND_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// How often the background sweep (offer-expiry + auto-refund checks) runs.
export const BACKGROUND_SWEEP_INTERVAL_MS = 60 * 1000; // 1 minute

export const LOCAL_STORAGE_MODE_KEY = 'dealMode';

// ============================================================
// ✅ Deal status vocabulary — single source of truth, shared with
// rules/dealRules.js (which imports these instead of defining its own
// copy). Merged from both files on request.
//
// LIVE = actually assigned by dealManager.hooks.js today.
// RESERVED = defined for dealRules.js's richer policy functions, but
// nothing in the current flow ever sets a deal to these — they exist so
// dealCancelRules/dealCloseRules/etc. have a vocabulary to check against
// if you wire them into the live flow later. Until then they're inert.
// ============================================================
export const DEAL_STATUS = Object.freeze({
  // LIVE
  PENDING: 'pending',
  ACTIVE: 'active',
  OVERDUE: 'overdue',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',

  // RESERVED (from dealRules.js — not currently set anywhere)
  DRAFT: 'draft',
  WAITING_PAYMENT: 'waiting_payment',
  WAITING_ACCEPT: 'waiting_accept',
  STARTED: 'started',
  FUNDED: 'funded',
  PROCESSING: 'processing',
  REVIEW: 'review',
  REVIEWING: 'reviewing',
  EXTENDED: 'extended',
  DISPUTED: 'disputed',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
});

// Statuses dealRules.js treats as "active" for its policy checks. Includes
// OVERDUE (not in the original dealRules.js list) since the live flow
// clearly treats overdue deals as active/actionable, not terminal.
export const ACTIVE_DEAL_STATUSES = Object.freeze([
  DEAL_STATUS.PENDING,
  DEAL_STATUS.ACTIVE,
  DEAL_STATUS.OVERDUE,
  DEAL_STATUS.STARTED,
  DEAL_STATUS.FUNDED,
  DEAL_STATUS.PROCESSING,
  DEAL_STATUS.REVIEW,
  DEAL_STATUS.REVIEWING,
  DEAL_STATUS.EXTENDED,
  DEAL_STATUS.DISPUTED,
]);

export const TERMINAL_DEAL_STATUSES = Object.freeze([
  DEAL_STATUS.COMPLETED,
  DEAL_STATUS.CANCELLED,
  DEAL_STATUS.REJECTED,
  DEAL_STATUS.EXPIRED,
]);

export const MILESTONE_STATUS = Object.freeze({
  PENDING: 'pending',
  FUNDED: 'funded',
  REVIEW: 'review',
  RELEASED: 'released',
  REFUNDED: 'refunded',
});

export const USER_MODE = Object.freeze({
  BUYER: 'buyer',
  SELLER: 'seller',
});

export const POST_TYPE = Object.freeze({
  HIRE: 'hire',
  SERVICE: 'service',
});
