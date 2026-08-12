// // src/pages/DealManager/utils/dealAutomation.js

// // Best-effort client-side automation. As the original file's header comment
// // correctly warns: these only run while a user has this page open. For
// // guaranteed enforcement, port these three functions to a server-side cron
// // (Firebase Cloud Functions + Cloud Scheduler) — the Firestore logic here
// // can be reused close to as-is.

// import { doc, updateDoc, collection, runTransaction, serverTimestamp } from 'firebase/firestore';
// import { db } from '../../../firebase';  // ✅ পাথ ঠিক করা হয়েছে
// import { NOTIFICATION_EVENTS } from '../../../UI/Notification/NotificationEvents';  // ✅ পাথ ঠিক করা হয়েছে
// import { sendDealChatMessage } from './dealChat';
// import { notifyBothParties } from './notifyBothParties';

// export const markDealOverdue = async (dealToMark, { notification, setSelectedDeal }) => {
//   if (!dealToMark) return;
//   if (dealToMark.status !== 'active' || dealToMark.overdueMarkedAt) return;

//   try {
//     const dealRef = doc(db, 'deals', dealToMark.id);
//     const now = new Date().toISOString();

//     await updateDoc(dealRef, {
//       status: 'overdue',
//       overdueMarkedAt: now,
//       updatedAt: serverTimestamp(),
//     });

//     setSelectedDeal((prev) =>
//       prev && prev.id === dealToMark.id ? { ...prev, status: 'overdue', overdueMarkedAt: now } : prev
//     );

//     notifyBothParties(
//       notification,
//       NOTIFICATION_EVENTS.DEAL_OVERDUE,
//       { buyerId: dealToMark.buyerId, sellerId: dealToMark.sellerId },
//       { dealId: dealToMark.id, postTitle: dealToMark.postTitle || 'Untitled Deal' }
//     );

//     await sendDealChatMessage(
//       dealToMark.chatId,
//       `🔴 **Deal Overdue**\n\nDeadline + গ্রেস পিরিয়ড (24h) পার হয়ে গেছে।\n\nক্লায়েন্ট এখন Deadline বাড়াতে পারেন, ডিল বাতিল করতে পারেন, অথবা Dispute ওপেন করতে পারেন।`
//     );
//   } catch (error) {
//     console.error('Error marking deal overdue:', error);
//   }
// };

// export const markOfferExpired = async (dealToExpire, { notification, setSelectedDeal, selectedDealId }) => {
//   if (!dealToExpire || dealToExpire.status !== 'pending') return;
//   if (dealToExpire.offerExpired) return; // already handled

//   try {
//     const dealRef = doc(db, 'deals', dealToExpire.id);
//     const now = new Date().toISOString();
//     const reason = 'অফারের মেয়াদ শেষ হয়ে গেছে (৪৮ ঘণ্টার মধ্যে কোনো সাড়া পাওয়া যায়নি)।';

//     await updateDoc(dealRef, {
//       status: 'cancelled',
//       cancelledAt: now,
//       cancelledBy: 'system',
//       cancellationReason: reason,
//       offerExpired: true,
//       updatedAt: serverTimestamp(),
//     });

//     notifyBothParties(
//       notification,
//       NOTIFICATION_EVENTS.OFFER_EXPIRED,
//       { buyerId: dealToExpire.buyerId, sellerId: dealToExpire.sellerId },
//       { dealId: dealToExpire.id, postTitle: dealToExpire.postTitle || 'Untitled Deal' }
//     );

//     await sendDealChatMessage(
//       dealToExpire.chatId,
//       `⌛ **Offer Expired**\n\nএই অফারটি ৪৮ ঘণ্টার মধ্যে গ্রহণ করা হয়নি, তাই এটি স্বয়ংক্রিয়ভাবে বাতিল হয়ে গেছে। প্রয়োজনে নতুন করে অফার পাঠান।`
//     );

//     if (selectedDealId === dealToExpire.id) {
//       setSelectedDeal((prev) =>
//         prev ? { ...prev, status: 'cancelled', cancellationReason: reason, offerExpired: true } : prev
//       );
//     }
//   } catch (error) {
//     console.error('Error marking offer expired:', error);
//   }
// };

// export const autoRefundMilestone = async (
//   dealForMilestone,
//   milestone,
//   { notification, setSelectedDeal, selectedDealId }
// ) => {
//   try {
//     const dealRef = doc(db, 'deals', dealForMilestone.id);
//     const buyerWalletRef = doc(db, 'wallets', dealForMilestone.buyerId);
//     let refundedAmount = 0;
//     let refundedMilestoneTitle = milestone.title;

//     await runTransaction(db, async (transaction) => {
//       const freshDealSnap = await transaction.get(dealRef);
//       if (!freshDealSnap.exists()) return;
//       const freshDeal = freshDealSnap.data();
//       const freshMilestone = (freshDeal.milestones || []).find((m) => String(m.id) === String(milestone.id));
//       // Guard: someone may have submitted/rejected/resubmitted it already
//       // between the scan and now — only refund if it's still 'funded'.
//       if (!freshMilestone || freshMilestone.status !== 'funded') return;

//       const buyerWalletSnap = await transaction.get(buyerWalletRef);
//       if (!buyerWalletSnap.exists()) return;
//       const buyerBalance = buyerWalletSnap.data().balance || 0;
//       refundedAmount = freshMilestone.amount || 0;
//       refundedMilestoneTitle = freshMilestone.title;

//       transaction.update(buyerWalletRef, {
//         balance: buyerBalance + refundedAmount,
//         updatedAt: serverTimestamp(),
//       });

//       const updatedMilestones = freshDeal.milestones.map((m) =>
//         String(m.id) === String(milestone.id)
//           ? { ...m, status: 'refunded', refundedAt: new Date().toISOString(), refundReason: 'seller_no_submission' }
//           : m
//       );

//       transaction.update(dealRef, { milestones: updatedMilestones, updatedAt: serverTimestamp() });

//       const txRef = doc(collection(db, 'transactions'));
//       transaction.set(txRef, {
//         userId: dealForMilestone.buyerId,
//         amount: refundedAmount,
//         type: 'credit',
//         status: 'completed',
//         title: `Auto-Refund: ${freshMilestone.title}`,
//         description: `Seller did not submit work within the deadline — funds automatically refunded.`,
//         dealId: dealForMilestone.id,
//         milestoneId: milestone.id,
//         isEscrow: true,
//         createdAt: serverTimestamp(),
//         completedAt: serverTimestamp(),
//       });
//     });

//     if (refundedAmount <= 0) return; // nothing was actually refunded (already handled)

//     notifyBothParties(
//       notification,
//       NOTIFICATION_EVENTS.MILESTONE_REFUNDED,
//       { buyerId: dealForMilestone.buyerId, sellerId: dealForMilestone.sellerId },
//       {
//         dealId: dealForMilestone.id,
//         postTitle: dealForMilestone.postTitle || 'Untitled Deal',
//         milestoneTitle: refundedMilestoneTitle,
//         amount: refundedAmount,
//       }
//     );

//     await sendDealChatMessage(
//       dealForMilestone.chatId,
//       `⏳➡️💸 **Auto-Refunded**\n\nমাইলস্টোন **"${refundedMilestoneTitle}"**-এর জন্য নির্ধারিত ৭ দিনের মধ্যে কাজ জমা দেওয়া হয়নি, তাই ৳${refundedAmount.toLocaleString()} স্বয়ংক্রিয়ভাবে Buyer-এর ওয়ালেটে ফেরত দেওয়া হয়েছে।`
//     );

//     if (selectedDealId === dealForMilestone.id) {
//       setSelectedDeal((prev) =>
//         prev
//           ? {
//               ...prev,
//               milestones: prev.milestones.map((m) =>
//                 String(m.id) === String(milestone.id)
//                   ? { ...m, status: 'refunded', refundedAt: new Date().toISOString() }
//                   : m
//               ),
//             }
//           : prev
//       );
//     }
//   } catch (error) {
//     console.error('Error auto-refunding milestone:', error);
//   }
// };

// // ✅ ডিফল্ট এক্সপোর্ট যোগ করুন (যদি কেউ ডিফল্ট ইম্পোর্ট করে)
// export default {
//   markDealOverdue,
//   markOfferExpired,
//   autoRefundMilestone,
// };