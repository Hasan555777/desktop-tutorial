// // src/pages/DealManager/hooks/useDealTimers.js

// import { useState, useEffect } from 'react';
// // ✅ সঠিক পাথ
// import {
//   GRACE_PERIOD_MS,
//   BACKGROUND_SWEEP_INTERVAL_MS,
//   OFFER_EXPIRY_MS,
//   SUBMIT_DEADLINE_AFTER_FUND_MS,
// } from '../../../constants/dealManager.constants';  // ✅ পাথ ঠিক করা হয়েছে
// import { markDealOverdue, markOfferExpired, autoRefundMilestone } from '../utils/dealAutomation';

// // Per-selected-deal countdown display ("2d 4h left", grace period, overdue).
// // Unchanged from the original file.
// export const useDeadlineCountdown = (selectedDeal, setSelectedDeal, notification) => {
//   const [timeRemaining, setTimeRemaining] = useState({});

//   useEffect(() => {
//     if (!selectedDeal || (selectedDeal.status !== 'active' && selectedDeal.status !== 'overdue')) return;

//     const deadlineDays = selectedDeal.deadline || 0;
//     const createdAt = selectedDeal.startedAt || selectedDeal.createdAt;
//     if (!createdAt) return;

//     const startDate = new Date(createdAt);
//     const deadlineDate = new Date(startDate);
//     deadlineDate.setDate(deadlineDate.getDate() + deadlineDays);
//     const graceDeadline = new Date(deadlineDate.getTime() + GRACE_PERIOD_MS);

//     const updateTimer = () => {
//       const now = new Date();
//       const diff = deadlineDate - now;

//       if (diff > 0) {
//         const days = Math.floor(diff / (1000 * 60 * 60 * 24));
//         const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
//         const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
//         setTimeRemaining((prev) => ({ ...prev, [selectedDeal.id]: `${days}d ${hours}h ${minutes}m` }));
//         return;
//       }

//       const graceDiff = graceDeadline - now;
//       if (graceDiff > 0 && selectedDeal.status === 'active') {
//         const hours = Math.floor(graceDiff / (1000 * 60 * 60));
//         const minutes = Math.floor((graceDiff % (1000 * 60 * 60)) / (1000 * 60));
//         setTimeRemaining((prev) => ({ ...prev, [selectedDeal.id]: `⏳ Grace Period: ${hours}h ${minutes}m left` }));
//         return;
//       }

//       setTimeRemaining((prev) => ({ ...prev, [selectedDeal.id]: '🔴 Overdue' }));

//       if (selectedDeal.status === 'active' && !selectedDeal.overdueMarkedAt) {
//         markDealOverdue(selectedDeal, { notification, setSelectedDeal });
//       }
//     };

//     updateTimer();
//     const interval = setInterval(updateTimer, 60000);
//     return () => clearInterval(interval);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [selectedDeal?.id, selectedDeal?.status, selectedDeal?.deadline, selectedDeal?.startedAt]);

//   return timeRemaining;
// };

// // Background sweep across every loaded deal: expires unanswered offers and
// // auto-refunds milestones whose submission deadline passed. Both checks
// // used to be two separate useEffect/setInterval pairs re-scanning `deals`
// // every minute; merged into one pass since they run on the same cadence
// // over the same data.
// export const useDealBackgroundSweep = (deals, notification, setSelectedDeal, selectedDealId) => {
//   useEffect(() => {
//     if (!deals || deals.length === 0) return;

//     const runSweep = () => {
//       const now = Date.now();

//       deals.forEach((deal) => {
//         // --- Offer expiry ---
//         if (deal.status === 'pending' && !deal.offerExpired) {
//           const proposedAtRaw = deal.proposedAt || deal.createdAt;
//           const proposedAtMs = proposedAtRaw?.toDate
//             ? proposedAtRaw.toDate().getTime()
//             : proposedAtRaw
//             ? new Date(proposedAtRaw).getTime()
//             : null;
//           if (proposedAtMs && now - proposedAtMs > OFFER_EXPIRY_MS) {
//             markOfferExpired(deal, { notification, setSelectedDeal, selectedDealId });
//           }
//         }

//         // --- Funded-milestone submission deadline ---
//         if ((deal.status === 'active' || deal.status === 'overdue') && Array.isArray(deal.milestones)) {
//           deal.milestones.forEach((m) => {
//             if (m.status !== 'funded' || !m.fundedAt) return;
//             const fundedAtMs = new Date(m.fundedAt).getTime();
//             if (now - fundedAtMs > SUBMIT_DEADLINE_AFTER_FUND_MS) {
//               autoRefundMilestone(deal, m, { notification, setSelectedDeal, selectedDealId });
//             }
//           });
//         }
//       });
//     };

//     runSweep();
//     const interval = setInterval(runSweep, BACKGROUND_SWEEP_INTERVAL_MS);
//     return () => clearInterval(interval);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [deals]);
// };