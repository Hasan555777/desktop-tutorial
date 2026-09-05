// ============================================================
// 📁 src/UI/Sound/SoundEvents.js
// ============================================================

export const SOUND_EVENTS = {
  // ── Chat Events ──
  CHAT_MESSAGE: 'chat-message',
  CHAT_IMAGE: 'chat-image',
  CHAT_PROPOSAL: 'chat-proposal',

  // ── Deal Events ──
  DEAL_CREATED: 'deal-created',
  DEAL_APPROVED: 'deal-approved',
  DEAL_REJECTED: 'deal-rejected',
  DEAL_REOPENED: 'deal-reopened',
  DEAL_COMPLETED: 'deal-completed',
  DEAL_CONFIRMED: 'deal-confirmed',      // ✅ যোগ করা হয়েছে
  DEAL_CANCELLED: 'deal-cancelled',      // ✅ যোগ করা হয়েছে
  DEAL_EXTENDED: 'deal-extended',        // ✅ যোগ করা হয়েছে
  DEAL_DEADLINE_PASSED: 'deal-deadline-passed', // ✅ যোগ করা হয়েছে

  // ── Notification Events ──
  NOTIFICATION: 'notification',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',

  // ── Wallet Events ──
  WALLET: 'wallet',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  DEPOSIT_APPROVED: 'deposit-approved',   // ✅ যোগ করা হয়েছে
  DEPOSIT_REJECTED: 'deposit-rejected',   // ✅ যোগ করা হয়েছে
  WITHDRAW_APPROVED: 'withdraw-approved', // ✅ যোগ করা হয়েছে
  WITHDRAW_REJECTED: 'withdraw-rejected', // ✅ যোগ করা হয়েছে

  // ── Admin Events ──
  ADMIN_ANNOUNCEMENT: 'admin-announcement', // ✅ নতুন
  ADMIN_NOTIFICATION: 'admin-notification', // ✅ নতুন
  USER_VERIFIED: 'user-verified',           // ✅ নতুন
  USER_BLOCKED: 'user-blocked',             // ✅ নতুন
  POST_APPROVED: 'post-approved',           // ✅ নতুন
  POST_REJECTED: 'post-rejected',           // ✅ নতুন
  REPORT_RESOLVED: 'report-resolved',       // ✅ নতুন
  REPORT_CANCELLED: 'report-cancelled',     // ✅ নতুন
  SYSTEM_ERROR: 'system-error',             // ✅ নতুন
  SYSTEM_WARNING: 'system-warning',         // ✅ নতুন

  // ── UI Events ──
  CLICK: 'click',
  OFFER: 'offer',
  DEAL: 'deal',
  
  // ── Page Events ──
  PAGE_LOAD: 'page-load',                   // ✅ নতুন
  PAGE_LEAVE: 'page-leave',                 // ✅ নতুন
};