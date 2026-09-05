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
// মিনিট কনভার্ট কনস্ট্যান্ট
//
// Only relevant to the RAW proposal-composition input (see
// chatHelpers.js's sendProposal, where the offer form's deadline field is
// collected in minutes) — NOT to `deal.deadline` once a deal exists.
// sendProposal converts the raw minutes to whole days
// (`Math.ceil(minutes / MINUTES_IN_DAY)`) exactly once, at deal-creation
// time, and stores that day count as `deal.deadline`. Every DealManager
// file downstream of that (this one included) works with `deadline` as a
// plain whole-days number — that's what formatDeadlineDisplay below
// formats, and what useDeadlineCountdown's `setDate(getDate() +
// deadlineDays)` in dealManager.hooks.js already correctly assumes.
// ============================================================
export const MINUTES_IN_DAY = 24 * 60; // 1440 মিনিট
export const MINUTES_IN_HOUR = 60;

export const minutesToDays = (minutes) => {
  return Math.ceil(minutes / MINUTES_IN_DAY);
};

export const daysToMinutes = (days) => {
  return days * MINUTES_IN_DAY;
};

// ============================================================
// formatDeadlineDisplay
//
// CRITICAL FIX: this used to branch on `deadline < MINUTES_IN_DAY` and
// format small numbers as minutes/hours — but every caller in the
// DealManager feature passes it `deal.deadline` (or a number of extension
// days), which sendProposal always stores as a whole number of DAYS, never
// minutes. A 7-day deadline was being displayed as "7 মিনিট" (7 minutes)
// instead of "৭ দিন" everywhere: DealInfoCard, the overdue/extension
// banners, and every confirm/chat message that calls this function. It now
// simply formats a day count. (The separate, correctly minutes-based
// formatDeadlineDisplay in chatHelpers.js is for previewing the raw
// proposal-form input before it's converted — that one is unrelated and
// untouched.)
// ============================================================
export const formatDeadlineDisplay = (deadline) => {
  if (deadline === null || deadline === undefined) return '0 দিন';

  if (typeof deadline === 'number') {
    return `${deadline} দিন`;
  }

  if (typeof deadline === 'string') return deadline;

  if (typeof deadline === 'object') {
    if (deadline.type === 'range') {
      const min = deadline.min || 0;
      const max = deadline.max || 0;
      return `${min}-${max} দিন`;
    }
    const days = deadline.days || 0;
    return `${days} দিন`;
  }

  return String(deadline);
};

// ============================================================
// Deal status vocabulary — single source of truth, shared with
// rules/dealRules.js (which imports these instead of defining its own
// copy).
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