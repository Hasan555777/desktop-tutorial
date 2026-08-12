// // src/pages/DealManager/utils/dealStatus.js

// // Pure display helpers — no side effects, easy to unit test on their own.

// import { SUBMIT_DEADLINE_AFTER_FUND_MS, MILESTONE_STATUS, DEAL_STATUS } from '../constants/dealManager.constants';  // ✅ পাথ ঠিক করা হয়েছে

// export const getMilestoneStatusBadge = (status) => {
//   switch (status) {
//     case MILESTONE_STATUS.PENDING: return { text: '⏳ Pending', class: 'status-pending' };
//     case MILESTONE_STATUS.FUNDED: return { text: '💰 Funded', class: 'status-funded' };
//     case MILESTONE_STATUS.REVIEW: return { text: '📝 Under Review', class: 'status-review' };
//     case MILESTONE_STATUS.RELEASED: return { text: '✅ Released', class: 'status-released' };
//     case MILESTONE_STATUS.REFUNDED: return { text: '↩️ Refunded', class: 'status-refunded' };
//     default: return { text: '📌 New', class: 'status-pending' };
//   }
// };

// export const getDealStatusBadge = (status) => {
//   switch (status) {
//     case DEAL_STATUS.PENDING: return { text: '⏳ Pending Confirmation', class: 'status-pending-deal' };
//     case DEAL_STATUS.ACTIVE: return { text: '⚡ Active Deal', class: 'status-active' };
//     case DEAL_STATUS.OVERDUE: return { text: '🔴 Overdue', class: 'status-overdue' };
//     case DEAL_STATUS.COMPLETED: return { text: '✅ Completed', class: 'status-completed' };
//     case DEAL_STATUS.CANCELLED: return { text: '❌ Cancelled', class: 'status-cancelled' };
//     default: return { text: '📌 New', class: 'status-pending' };
//   }
// };

// // How much time is left before a 'funded' milestone gets auto-refunded.
// // Not a live per-second countdown (recomputed on each render), which is
// // good enough given it's shown next to a simple day/hour readout.
// export const getSubmitDeadlineText = (milestone) => {
//   if (!milestone?.fundedAt) return null;
//   const deadlineMs = new Date(milestone.fundedAt).getTime() + SUBMIT_DEADLINE_AFTER_FUND_MS;
//   const remain = deadlineMs - Date.now();
//   if (remain <= 0) return { text: '⏳ সময় শেষ — শীঘ্রই অটো-রিফান্ড হবে', urgent: true };
//   const days = Math.floor(remain / 86400000);
//   const hours = Math.floor((remain % 86400000) / 3600000);
//   return { text: `⏳ কাজ জমা দিন: বাকি ${days}দ ${hours}ঘ (নাহলে অটো-রিফান্ড)`, urgent: days < 1 };
// };

// // ✅ ডিফল্ট এক্সপোর্ট যোগ করুন (যদি কেউ ডিফল্ট ইম্পোর্ট করে)
// export default {
//   getMilestoneStatusBadge,
//   getDealStatusBadge,
//   getSubmitDeadlineText,
// };