// dealManager.utils.js
// Every piece of non-React logic the Deal Manager needs: escrow
// transactions, chat/notification side-effects, the three background
// automations (overdue / offer-expiry / auto-refund), and small pure
// display helpers (status badges, deadline text). All logic is unchanged
// from the original DealManager.jsx — only reorganized out of the
// component, and merged into one file per your request.

import {
  doc,
  getDocs,
  collection,
  addDoc,
  query,
  where,
  writeBatch,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';
import {
  OFFER_EXPIRY_MS,
  SUBMIT_DEADLINE_AFTER_FUND_MS,
  MILESTONE_STATUS,
  DEAL_STATUS,
} from '@/constants/dealManager.constants';

// ============================================================
// ✅ Escrow Helpers — balance lock / unlock (Firestore transactions)
// ============================================================

/**
 * Checks the buyer's AVAILABLE balance (balance - lockedBalance) against the
 * deal budget. If sufficient, locks the full budget on the buyer's wallet
 * AND activates the deal, all inside a single atomic transaction so the
 * check-then-lock can never race with a second deal being activated at the
 * same instant.
 *
 * Throws an Error with message 'INSUFFICIENT_BALANCE' if the buyer doesn't
 * have enough available balance — callers should catch this and show a
 * friendly message instead of a generic failure.
 */
export const activateDealWithEscrowLock = async ({ dealId, buyerId, budget, extraDealFields = {} }) => {
  const dealRef = doc(db, 'deals', dealId);
  const walletRef = doc(db, 'wallets', buyerId);

  await runTransaction(db, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    if (!walletSnap.exists()) {
      throw new Error('WALLET_NOT_FOUND');
    }
    const walletData = walletSnap.data();
    const currentBalance = walletData.balance || 0;
    const currentLocked = walletData.lockedBalance || 0;
    const available = currentBalance - currentLocked;

    if (available < (budget || 0)) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    transaction.update(walletRef, {
      lockedBalance: currentLocked + (budget || 0),
      updatedAt: serverTimestamp(),
    });

    transaction.update(dealRef, {
      status: 'active',
      startedAt: new Date().toISOString(),
      escrowLockedAmount: budget || 0,
      ...extraDealFields,
      updatedAt: serverTimestamp(),
    });
  });
};

/**
 * Releases the buyer's locked budget back to available balance. Only call
 * this for deals that reach 'cancelled' status while still having their
 * FULL budget locked and NO milestone funded/released yet — that invariant
 * is enforced by handleCancelDeal's hasPayment guard before a cancellation
 * request can even be created.
 */
export const releaseEscrowLock = async ({ buyerId, amount }) => {
  if (!amount) return;
  const walletRef = doc(db, 'wallets', buyerId);

  await runTransaction(db, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    if (!walletSnap.exists()) return;
    const currentLocked = walletSnap.data().lockedBalance || 0;

    transaction.update(walletRef, {
      lockedBalance: Math.max(0, currentLocked - amount),
      updatedAt: serverTimestamp(),
    });
  });
};

// ============================================================
// ✅ Chat + Notification-cleanup Helpers
// ============================================================

export const sendDealChatMessage = async (chatId, message, type = 'system') => {
  if (!chatId) {
    console.warn('⚠️ No chatId provided for deal chat message');
    return;
  }

  try {
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      text: message,
      sender: 'system',
      senderId: 'system',
      createdAt: serverTimestamp(),
      type: type,
    });
    console.log('✅ Deal chat message sent:', message);
  } catch (error) {
    console.error('❌ Error sending deal chat message:', error);
  }
};

export const deleteCancelNotifications = async (dealId) => {
  try {
    const notifRef = collection(db, 'notifications');
    const q = query(
      notifRef,
      where('dealId', '==', dealId),
      where('type', 'in', ['cancellation_request', 'cancellation_approved', 'cancellation_rejected'])
    );
    const snapshot = await getDocs(q);

    if (snapshot.size > 0) {
      const batch = writeBatch(db);
      snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
      console.log('✅ Notifications cleaned up');
    }
  } catch (error) {
    console.error('Error cleaning notifications:', error);
  }
};

// IMPROVEMENT: the original file called `notification.notify(...)` twice,
// back to back, for almost every event — once with `userId: buyerId` and
// once with `userId: sellerId`. That hand-copied pattern is exactly what
// caused two bugs the original file's own comments call out (DEAL_CONFIRMED
// missing `userId`; the approve-offer path missing a notification
// entirely). One helper call now replaces both.
export const notifyBothParties = (notification, event, { buyerId, sellerId }, sharedData) => {
  notification.notify({ event, data: { userId: buyerId, buyerId, sellerId, ...sharedData } });
  notification.notify({ event, data: { userId: sellerId, buyerId, sellerId, ...sharedData } });
};

// ============================================================
// ✅ Background Automation — best-effort, client-side only
// (needs a server-side Cloud Function/cron for guaranteed enforcement,
// per the original file's own warning)
// ============================================================

export const markDealOverdue = async (dealToMark, { notification, setSelectedDeal }) => {
  if (!dealToMark) return;
  if (dealToMark.status !== DEAL_STATUS.ACTIVE || dealToMark.overdueMarkedAt) return;

  try {
    const dealRef = doc(db, 'deals', dealToMark.id);
    const now = new Date().toISOString();

    await updateDoc(dealRef, {
      status: DEAL_STATUS.OVERDUE,
      overdueMarkedAt: now,
      updatedAt: serverTimestamp(),
    });

    setSelectedDeal((prev) =>
      prev && prev.id === dealToMark.id ? { ...prev, status: DEAL_STATUS.OVERDUE, overdueMarkedAt: now } : prev
    );

    notifyBothParties(
      notification,
      NOTIFICATION_EVENTS.DEAL_OVERDUE,
      { buyerId: dealToMark.buyerId, sellerId: dealToMark.sellerId },
      { dealId: dealToMark.id, postTitle: dealToMark.postTitle || 'Untitled Deal' }
    );

    await sendDealChatMessage(
      dealToMark.chatId,
      `🔴 **Deal Overdue**\n\nDeadline + গ্রেস পিরিয়ড (24h) পার হয়ে গেছে।\n\nক্লায়েন্ট এখন Deadline বাড়াতে পারেন, ডিল বাতিল করতে পারেন, অথবা Dispute ওপেন করতে পারেন।`
    );
  } catch (error) {
    console.error('Error marking deal overdue:', error);
  }
};

export const markOfferExpired = async (dealToExpire, { notification, setSelectedDeal, selectedDealId }) => {
  if (!dealToExpire || dealToExpire.status !== DEAL_STATUS.PENDING) return;
  if (dealToExpire.offerExpired) return; // already handled

  try {
    const dealRef = doc(db, 'deals', dealToExpire.id);
    const now = new Date().toISOString();
    const reason = 'অফারের মেয়াদ শেষ হয়ে গেছে (৪৮ ঘণ্টার মধ্যে কোনো সাড়া পাওয়া যায়নি)।';

    await updateDoc(dealRef, {
      status: DEAL_STATUS.CANCELLED,
      cancelledAt: now,
      cancelledBy: 'system',
      cancellationReason: reason,
      offerExpired: true,
      updatedAt: serverTimestamp(),
    });

    notifyBothParties(
      notification,
      NOTIFICATION_EVENTS.OFFER_EXPIRED,
      { buyerId: dealToExpire.buyerId, sellerId: dealToExpire.sellerId },
      { dealId: dealToExpire.id, postTitle: dealToExpire.postTitle || 'Untitled Deal' }
    );

    await sendDealChatMessage(
      dealToExpire.chatId,
      `⌛ **Offer Expired**\n\nএই অফারটি ৪৮ ঘণ্টার মধ্যে গ্রহণ করা হয়নি, তাই এটি স্বয়ংক্রিয়ভাবে বাতিল হয়ে গেছে। প্রয়োজনে নতুন করে অফার পাঠান।`
    );

    if (selectedDealId === dealToExpire.id) {
      setSelectedDeal((prev) =>
        prev ? { ...prev, status: DEAL_STATUS.CANCELLED, cancellationReason: reason, offerExpired: true } : prev
      );
    }
  } catch (error) {
    console.error('Error marking offer expired:', error);
  }
};

export const autoRefundMilestone = async (
  dealForMilestone,
  milestone,
  { notification, setSelectedDeal, selectedDealId }
) => {
  try {
    const dealRef = doc(db, 'deals', dealForMilestone.id);
    const buyerWalletRef = doc(db, 'wallets', dealForMilestone.buyerId);
    let refundedAmount = 0;
    let refundedMilestoneTitle = milestone.title;

    await runTransaction(db, async (transaction) => {
      const freshDealSnap = await transaction.get(dealRef);
      if (!freshDealSnap.exists()) return;
      const freshDeal = freshDealSnap.data();
      const freshMilestone = (freshDeal.milestones || []).find((m) => String(m.id) === String(milestone.id));
      // Guard: someone may have submitted/rejected/resubmitted it already
      // between the scan and now — only refund if it's still 'funded'.
      if (!freshMilestone || freshMilestone.status !== MILESTONE_STATUS.FUNDED) return;

      const buyerWalletSnap = await transaction.get(buyerWalletRef);
      if (!buyerWalletSnap.exists()) return;
      const buyerBalance = buyerWalletSnap.data().balance || 0;
      refundedAmount = freshMilestone.amount || 0;
      refundedMilestoneTitle = freshMilestone.title;

      transaction.update(buyerWalletRef, {
        balance: buyerBalance + refundedAmount,
        updatedAt: serverTimestamp(),
      });

      const updatedMilestones = freshDeal.milestones.map((m) =>
        String(m.id) === String(milestone.id)
          ? { ...m, status: MILESTONE_STATUS.REFUNDED, refundedAt: new Date().toISOString(), refundReason: 'seller_no_submission' }
          : m
      );

      transaction.update(dealRef, { milestones: updatedMilestones, updatedAt: serverTimestamp() });

      const txRef = doc(collection(db, 'transactions'));
      transaction.set(txRef, {
        userId: dealForMilestone.buyerId,
        amount: refundedAmount,
        type: 'credit',
        status: 'completed',
        title: `Auto-Refund: ${freshMilestone.title}`,
        description: `Seller did not submit work within the deadline — funds automatically refunded.`,
        dealId: dealForMilestone.id,
        milestoneId: milestone.id,
        isEscrow: true,
        createdAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      });
    });

    if (refundedAmount <= 0) return; // nothing was actually refunded (already handled)

    notifyBothParties(
      notification,
      NOTIFICATION_EVENTS.MILESTONE_REFUNDED,
      { buyerId: dealForMilestone.buyerId, sellerId: dealForMilestone.sellerId },
      {
        dealId: dealForMilestone.id,
        postTitle: dealForMilestone.postTitle || 'Untitled Deal',
        milestoneTitle: refundedMilestoneTitle,
        amount: refundedAmount,
      }
    );

    await sendDealChatMessage(
      dealForMilestone.chatId,
      `⏳➡️💸 **Auto-Refunded**\n\nমাইলস্টোন **"${refundedMilestoneTitle}"**-এর জন্য নির্ধারিত ৭ দিনের মধ্যে কাজ জমা দেওয়া হয়নি, তাই ৳${refundedAmount.toLocaleString()} স্বয়ংক্রিয়ভাবে Buyer-এর ওয়ালেটে ফেরত দেওয়া হয়েছে।`
    );

    if (selectedDealId === dealForMilestone.id) {
      setSelectedDeal((prev) =>
        prev
          ? {
              ...prev,
              milestones: prev.milestones.map((m) =>
                String(m.id) === String(milestone.id)
                  ? { ...m, status: MILESTONE_STATUS.REFUNDED, refundedAt: new Date().toISOString() }
                  : m
              ),
            }
          : prev
      );
    }
  } catch (error) {
    console.error('Error auto-refunding milestone:', error);
  }
};

// ============================================================
// ✅ Pure display helpers — status badges + deadline text
// ============================================================

export const getMilestoneStatusBadge = (status) => {
  switch (status) {
    case MILESTONE_STATUS.PENDING: return { text: '⏳ Pending', class: 'status-pending' };
    case MILESTONE_STATUS.FUNDED: return { text: '💰 Funded', class: 'status-funded' };
    case MILESTONE_STATUS.REVIEW: return { text: '📝 Under Review', class: 'status-review' };
    case MILESTONE_STATUS.RELEASED: return { text: '✅ Released', class: 'status-released' };
    case MILESTONE_STATUS.REFUNDED: return { text: '↩️ Refunded', class: 'status-refunded' };
    default: return { text: '📌 New', class: 'status-pending' };
  }
};

export const getDealStatusBadge = (status) => {
  switch (status) {
    case DEAL_STATUS.PENDING: return { text: '⏳ Pending Confirmation', class: 'status-pending-deal' };
    case DEAL_STATUS.ACTIVE: return { text: '⚡ Active Deal', class: 'status-active' };
    case DEAL_STATUS.OVERDUE: return { text: '🔴 Overdue', class: 'status-overdue' };
    case DEAL_STATUS.COMPLETED: return { text: '✅ Completed', class: 'status-completed' };
    case DEAL_STATUS.CANCELLED: return { text: '❌ Cancelled', class: 'status-cancelled' };
    default: return { text: '📌 New', class: 'status-pending' };
  }
};

// How much time is left before a 'funded' milestone gets auto-refunded.
// Not a live per-second countdown (recomputed on each render), which is
// good enough given it's shown next to a simple day/hour readout.
export const getSubmitDeadlineText = (milestone) => {
  if (!milestone?.fundedAt) return null;
  const deadlineMs = new Date(milestone.fundedAt).getTime() + SUBMIT_DEADLINE_AFTER_FUND_MS;
  const remain = deadlineMs - Date.now();
  if (remain <= 0) return { text: '⏳ সময় শেষ — শীঘ্রই অটো-রিফান্ড হবে', urgent: true };
  const days = Math.floor(remain / 86400000);
  const hours = Math.floor((remain % 86400000) / 3600000);
  return { text: `⏳ কাজ জমা দিন: বাকি ${days}দ ${hours}ঘ (নাহলে অটো-রিফান্ড)`, urgent: days < 1 };
};

// Re-export so callers that only need timing constants don't have to
// import from two files.
export { OFFER_EXPIRY_MS, SUBMIT_DEADLINE_AFTER_FUND_MS };
