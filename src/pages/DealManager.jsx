// DealManager.jsx - NotificationProvider Fully Integrated
// 2-Person Confirmation + Overdue/Grace Period + Dispute + Extension Limit
// + Escrow-based Money Flow (balance lock/unlock at deal activation)
// + Offer Expiry (auto-cancel unanswered offers) + Submission Deadline
//   (auto-refund a funded milestone if the seller doesn't submit work in
//   time) + Explicit Accept/Reject review step + "read the rules" guide
//   popup before accepting an offer.
//
// ⚠️ IMPORTANT (read before deploying):
// - Offer-expiry auto-cancel, Auto-Refund-on-no-submission, Auto-Complete
//   after buyer inactivity, and scheduled reminders CANNOT be reliably done
//   from this client component alone — they only run while a user actually
//   has this page open (best-effort). For guaranteed enforcement you need a
//   server-side cron (Firebase Cloud Functions + Cloud Scheduler) that runs
//   the same checks. This file implements the client-side best-effort
//   version plus a manual "Open Dispute" flow.
// - Trust Score / Late-Delivery % must be computed server-side (Cloud
//   Function) — never trust the client to write its own trust score.
// - Add these keys to NOTIFICATION_EVENTS (NotificationEvents.js) if not
//   already present: DEAL_OVERDUE, DISPUTE_OPENED, OFFER_EXPIRED,
//   MILESTONE_SUBMITTED, MILESTONE_REJECTED, MILESTONE_REFUNDED.
//
// 💰 MONEY FLOW (read this before touching wallet-related code):
// 1. Deal becomes ACTIVE (offer accepted, after the guide popup is
//    acknowledged) → buyer's available balance (balance - lockedBalance)
//    is checked against the full deal budget. If enough, the ENTIRE budget
//    is locked: wallets/{buyerId}.lockedBalance += budget. If not enough,
//    the deal CANNOT be activated.
// 2. Buyer funds a milestone ("Pay & Fund", in PaymentGateway.jsx):
//    buyer.balance -= amount AND buyer.lockedBalance -= amount (the money
//    leaves the buyer's wallet entirely and sits in escrow). Milestone
//    status: pending -> funded, and `fundedAt` is stamped — the seller now
//    has a limited window (SUBMIT_DEADLINE_AFTER_FUND_MS) to submit work.
// 3. Seller submits work ("Submit Work", with a proof link/note): milestone
//    status: funded -> review. If the seller does NOT submit within the
//    window, this file auto-refunds the buyer and sets status -> refunded.
// 4. Buyer reviews the submitted proof and either:
//      a) Accepts ("Accept & Release") — THIS is the only place seller's
//         balance actually increases. Milestone status: review -> released.
//      b) Rejects (reason required) — milestone status: review -> funded
//         again (with a fresh submission deadline), so the seller can fix
//         and resubmit. No money moves on a rejection.
// 5. Deal is marked 'completed' only when ALL milestones are 'released' —
//    never when they are merely 'funded'.
// 6. Deal cancellation (2-person approval) is only allowed while NO
//    milestone has been funded/released yet (hasPayment guard). On
//    approval, the full locked budget is released back to the buyer.
// 7. Your Withdraw.jsx / send-money flow (not included here) MUST check
//    `balance - lockedBalance` as the withdrawable amount, not raw
//    `balance`.

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db, auth } from '@/firebase';
import {
  doc, getDoc, updateDoc, collection, query,
  where, onSnapshot, deleteDoc, getDocs, writeBatch, addDoc,
  serverTimestamp, runTransaction
} from 'firebase/firestore';
import './DealManager.css';
import Swal from 'sweetalert2';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useNotification } from '@/UI/Notification/NotificationProvider';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';
import DealGuideModal from '@/components/DealGuideModal';

// ============================================================
// ✅ Constants
// ============================================================
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_EXTENSIONS = 3;
const EXTENSION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ✅ NEW: how long a 'pending' offer waits before it's auto-cancelled if
// nobody responds.
const OFFER_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

// ✅ NEW: how long a seller has, after a milestone is funded, to submit
// work before the buyer is automatically refunded.
const SUBMIT_DEADLINE_AFTER_FUND_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================================
// ✅ Escrow Helpers — balance lock / unlock (run as Firestore transactions)
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
const activateDealWithEscrowLock = async ({ dealId, buyerId, budget, extraDealFields = {} }) => {
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
const releaseEscrowLock = async ({ buyerId, amount }) => {
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

const deleteCancelNotifications = async (dealId) => {
  try {
    const notifRef = collection(db, 'notifications');
    const q = query(
      notifRef,
      where("dealId", "==", dealId),
      where("type", "in", ['cancellation_request', 'cancellation_approved', 'cancellation_rejected'])
    );
    const snapshot = await getDocs(q);

    if (snapshot.size > 0) {
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log("✅ Notifications cleaned up");
    }
  } catch (error) {
    console.error("Error cleaning notifications:", error);
  }
};

const sendDealChatMessage = async (chatId, message, type = 'system') => {
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

// ============================================================
// ✅ DealManager Component
// ============================================================
const DealManager = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dealId = searchParams.get('dealId') || searchParams.get('postId');
  const feedback = useFeedback();
  const notification = useNotification();

  const [currentMode, setCurrentMode] = useState(() => {
    return localStorage.getItem('dealMode') || 'buyer';
  });
  const [deals, setDeals] = useState([]);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCancelledDeals, setShowCancelledDeals] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState({});

  const [submittingMilestone, setSubmittingMilestone] = useState(null);
  const [releasingPayment, setReleasingPayment] = useState(null);
  const [rejectingWork, setRejectingWork] = useState(null);
  const [markingOverdue, setMarkingOverdue] = useState(false);

  // ✅ NEW: inline "submit work" form state (per milestone)
  const [openSubmitForm, setOpenSubmitForm] = useState(null);
  const [workDraft, setWorkDraft] = useState({});

  // ✅ NEW: guide popup shown before an offer is accepted
  const [showGuideModal, setShowGuideModal] = useState(false);
  const guideActionRef = useRef(null);

  // ============================================================
  // ✅ Auth Check
  // ============================================================
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // ============================================================
  // ✅ Mode Change Handler
  // ============================================================
  const handleModeChange = (mode) => {
    setCurrentMode(mode);
    localStorage.setItem('dealMode', mode);
    setSelectedDeal(null);
  };

  // ============================================================
  // ✅ NEW: Guide-popup wrapper — runs an action only after the user has
  // read and acknowledged the Deal Manager guide.
  // ============================================================
  const runWithGuide = (actionFn) => {
    guideActionRef.current = actionFn;
    setShowGuideModal(true);
  };

  const handleGuideConfirm = () => {
    setShowGuideModal(false);
    const action = guideActionRef.current;
    guideActionRef.current = null;
    if (action) action();
  };

  const handleGuideCancel = () => {
    setShowGuideModal(false);
    guideActionRef.current = null;
  };

  // ============================================================
  // ✅ Load User Deals
  // ============================================================
  useEffect(() => {
    if (!currentUser?.uid) return;

    setLoading(true);
    const userField = currentMode === 'buyer' ? 'buyerId' : 'sellerId';
    const dealsRef = collection(db, 'deals');
    const q = query(dealsRef, where(userField, '==', currentUser.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedDeals = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

      setDeals(fetchedDeals);

      console.log("📊 Deals loaded:", {
        total: fetchedDeals.length,
        active: fetchedDeals.filter(d => d.status === 'active').length,
        pending: fetchedDeals.filter(d => d.status === 'pending').length,
        overdue: fetchedDeals.filter(d => d.status === 'overdue').length,
        completed: fetchedDeals.filter(d => d.status === 'completed').length,
        cancelled: fetchedDeals.filter(d => d.status === 'cancelled').length
      });

      setLoading(false);
    }, (error) => {
      console.error("Error loading deals:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentMode, currentUser?.uid]);

  // ============================================================
  // ✅ Mark Deal Overdue (called from timer effect)
  // ============================================================
  const markDealOverdue = async (dealToMark) => {
    if (!dealToMark || markingOverdue) return;
    // Guard: only proceed once per deal
    if (dealToMark.status !== 'active' || dealToMark.overdueMarkedAt) return;

    setMarkingOverdue(true);
    try {
      const dealRef = doc(db, 'deals', dealToMark.id);
      const now = new Date().toISOString();

      await updateDoc(dealRef, {
        status: 'overdue',
        overdueMarkedAt: now,
        updatedAt: serverTimestamp()
      });

      setSelectedDeal(prev => (prev && prev.id === dealToMark.id)
        ? { ...prev, status: 'overdue', overdueMarkedAt: now }
        : prev);

      notification.notify({
        event: NOTIFICATION_EVENTS.DEAL_OVERDUE,
        data: {
          userId: dealToMark.buyerId,
          buyerId: dealToMark.buyerId,
          sellerId: dealToMark.sellerId,
          dealId: dealToMark.id,
          postTitle: dealToMark.postTitle || 'Untitled Deal',
        }
      });
      notification.notify({
        event: NOTIFICATION_EVENTS.DEAL_OVERDUE,
        data: {
          userId: dealToMark.sellerId,
          buyerId: dealToMark.buyerId,
          sellerId: dealToMark.sellerId,
          dealId: dealToMark.id,
          postTitle: dealToMark.postTitle || 'Untitled Deal',
        }
      });

      await sendDealChatMessage(
        dealToMark.chatId,
        `🔴 **Deal Overdue**\n\nDeadline + গ্রেস পিরিয়ড (24h) পার হয়ে গেছে।\n\nক্লায়েন্ট এখন Deadline বাড়াতে পারেন, ডিল বাতিল করতে পারেন, অথবা Dispute ওপেন করতে পারেন।`
      );
    } catch (error) {
      console.error("Error marking deal overdue:", error);
    } finally {
      setMarkingOverdue(false);
    }
  };

  // ============================================================
  // ✅ NEW: Mark an unanswered offer as expired (auto-cancel)
  // ============================================================
  const markOfferExpired = async (dealToExpire) => {
    if (!dealToExpire || dealToExpire.status !== 'pending') return;
    if (dealToExpire.offerExpired) return; // already handled

    try {
      const dealRef = doc(db, 'deals', dealToExpire.id);
      const now = new Date().toISOString();
      const reason = 'অফারের মেয়াদ শেষ হয়ে গেছে (৪৮ ঘণ্টার মধ্যে কোনো সাড়া পাওয়া যায়নি)।';

      await updateDoc(dealRef, {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: 'system',
        cancellationReason: reason,
        offerExpired: true,
        updatedAt: serverTimestamp()
      });

      notification.notify({
        event: NOTIFICATION_EVENTS.OFFER_EXPIRED,
        data: {
          userId: dealToExpire.buyerId,
          buyerId: dealToExpire.buyerId,
          sellerId: dealToExpire.sellerId,
          dealId: dealToExpire.id,
          postTitle: dealToExpire.postTitle || 'Untitled Deal',
        }
      });
      notification.notify({
        event: NOTIFICATION_EVENTS.OFFER_EXPIRED,
        data: {
          userId: dealToExpire.sellerId,
          buyerId: dealToExpire.buyerId,
          sellerId: dealToExpire.sellerId,
          dealId: dealToExpire.id,
          postTitle: dealToExpire.postTitle || 'Untitled Deal',
        }
      });

      await sendDealChatMessage(
        dealToExpire.chatId,
        `⌛ **Offer Expired**\n\nএই অফারটি ৪৮ ঘণ্টার মধ্যে গ্রহণ করা হয়নি, তাই এটি স্বয়ংক্রিয়ভাবে বাতিল হয়ে গেছে। প্রয়োজনে নতুন করে অফার পাঠান।`
      );

      if (selectedDeal?.id === dealToExpire.id) {
        setSelectedDeal(prev => prev ? { ...prev, status: 'cancelled', cancellationReason: reason, offerExpired: true } : prev);
      }
    } catch (error) {
      console.error("Error marking offer expired:", error);
    }
  };

  // ============================================================
  // ✅ NEW: Auto-refund a funded milestone whose submission deadline passed
  // ============================================================
  const autoRefundMilestone = async (dealForMilestone, milestone) => {
    try {
      const dealRef = doc(db, 'deals', dealForMilestone.id);
      const buyerWalletRef = doc(db, 'wallets', dealForMilestone.buyerId);
      let refundedAmount = 0;

      await runTransaction(db, async (transaction) => {
        const freshDealSnap = await transaction.get(dealRef);
        if (!freshDealSnap.exists()) return;
        const freshDeal = freshDealSnap.data();
        const freshMilestone = (freshDeal.milestones || []).find(m => String(m.id) === String(milestone.id));
        // Guard: someone may have submitted/rejected/resubmitted it already
        // between the scan and now — only refund if it's still 'funded'.
        if (!freshMilestone || freshMilestone.status !== 'funded') return;

        const buyerWalletSnap = await transaction.get(buyerWalletRef);
        if (!buyerWalletSnap.exists()) return;
        const buyerBalance = buyerWalletSnap.data().balance || 0;
        refundedAmount = freshMilestone.amount || 0;

        transaction.update(buyerWalletRef, {
          balance: buyerBalance + refundedAmount,
          updatedAt: serverTimestamp()
        });

        const updatedMilestones = freshDeal.milestones.map(m =>
          String(m.id) === String(milestone.id)
            ? { ...m, status: 'refunded', refundedAt: new Date().toISOString(), refundReason: 'seller_no_submission' }
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
          completedAt: serverTimestamp()
        });
      });

      if (refundedAmount <= 0) return; // nothing was actually refunded (already handled)

      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_REFUNDED,
        data: {
          userId: dealForMilestone.buyerId,
          buyerId: dealForMilestone.buyerId,
          sellerId: dealForMilestone.sellerId,
          dealId: dealForMilestone.id,
          postTitle: dealForMilestone.postTitle || 'Untitled Deal',
          milestoneTitle: milestone.title,
          amount: refundedAmount,
        }
      });
      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_REFUNDED,
        data: {
          userId: dealForMilestone.sellerId,
          buyerId: dealForMilestone.buyerId,
          sellerId: dealForMilestone.sellerId,
          dealId: dealForMilestone.id,
          postTitle: dealForMilestone.postTitle || 'Untitled Deal',
          milestoneTitle: milestone.title,
          amount: refundedAmount,
        }
      });

      await sendDealChatMessage(
        dealForMilestone.chatId,
        `⏳➡️💸 **Auto-Refunded**\n\nমাইলস্টোন **"${milestone.title}"**-এর জন্য নির্ধারিত ৭ দিনের মধ্যে কাজ জমা দেওয়া হয়নি, তাই ৳${refundedAmount.toLocaleString()} স্বয়ংক্রিয়ভাবে Buyer-এর ওয়ালেটে ফেরত দেওয়া হয়েছে।`
      );

      if (selectedDeal?.id === dealForMilestone.id) {
        setSelectedDeal(prev => prev ? {
          ...prev,
          milestones: prev.milestones.map(m => String(m.id) === String(milestone.id)
            ? { ...m, status: 'refunded', refundedAt: new Date().toISOString() }
            : m)
        } : prev);
      }
    } catch (error) {
      console.error('Error auto-refunding milestone:', error);
    }
  };

  // ============================================================
  // ✅ Timer Effect (with Grace Period + Overdue detection)
  // ============================================================
  useEffect(() => {
    if (!selectedDeal || (selectedDeal.status !== 'active' && selectedDeal.status !== 'overdue')) return;

    const deadlineDays = selectedDeal.deadline || 0;
    const createdAt = selectedDeal.startedAt || selectedDeal.createdAt;

    if (!createdAt) return;

    const startDate = new Date(createdAt);
    const deadlineDate = new Date(startDate);
    deadlineDate.setDate(deadlineDate.getDate() + deadlineDays);
    const graceDeadline = new Date(deadlineDate.getTime() + GRACE_PERIOD_MS);

    const updateTimer = () => {
      const now = new Date();
      const diff = deadlineDate - now;

      // --- Still within deadline ---
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        setTimeRemaining(prev => ({
          ...prev,
          [selectedDeal.id]: `${days}d ${hours}h ${minutes}m`
        }));
        return;
      }

      // --- Deadline passed, still in Grace Period ---
      const graceDiff = graceDeadline - now;
      if (graceDiff > 0 && selectedDeal.status === 'active') {
        const hours = Math.floor(graceDiff / (1000 * 60 * 60));
        const minutes = Math.floor((graceDiff % (1000 * 60 * 60)) / (1000 * 60));

        setTimeRemaining(prev => ({
          ...prev,
          [selectedDeal.id]: `⏳ Grace Period: ${hours}h ${minutes}m left`
        }));
        return;
      }

      // --- Grace Period over -> Overdue ---
      setTimeRemaining(prev => ({
        ...prev,
        [selectedDeal.id]: '🔴 Overdue'
      }));

      if (selectedDeal.status === 'active' && !selectedDeal.overdueMarkedAt) {
        markDealOverdue(selectedDeal);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeal?.id, selectedDeal?.status, selectedDeal?.deadline, selectedDeal?.startedAt]);

  // ============================================================
  // ✅ NEW: Timer Effect — auto-cancel unanswered offers (best-effort,
  // scans all currently-loaded deals, not just the selected one, since a
  // pending offer might sit unopened in the list).
  // ============================================================
  useEffect(() => {
    if (!deals || deals.length === 0) return;

    const checkExpiredOffers = () => {
      const now = Date.now();
      deals.forEach((deal) => {
        if (deal.status !== 'pending' || deal.offerExpired) return;
        const proposedAtRaw = deal.proposedAt || deal.createdAt;
        const proposedAtMs = proposedAtRaw?.toDate
          ? proposedAtRaw.toDate().getTime()
          : (proposedAtRaw ? new Date(proposedAtRaw).getTime() : null);
        if (!proposedAtMs) return;
        if (now - proposedAtMs > OFFER_EXPIRY_MS) {
          markOfferExpired(deal);
        }
      });
    };

    checkExpiredOffers();
    const interval = setInterval(checkExpiredOffers, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

  // ============================================================
  // ✅ NEW: Timer Effect — auto-refund funded milestones whose submission
  // deadline has passed (best-effort, scans all currently-loaded deals).
  // ============================================================
  useEffect(() => {
    if (!deals || deals.length === 0) return;

    const checkFundedDeadlines = () => {
      const now = Date.now();
      deals.forEach((deal) => {
        if (deal.status !== 'active' && deal.status !== 'overdue') return;
        if (!Array.isArray(deal.milestones)) return;
        deal.milestones.forEach((m) => {
          if (m.status !== 'funded' || !m.fundedAt) return;
          const fundedAtMs = new Date(m.fundedAt).getTime();
          if (now - fundedAtMs > SUBMIT_DEADLINE_AFTER_FUND_MS) {
            autoRefundMilestone(deal, m);
          }
        });
      });
    };

    checkFundedDeadlines();
    const interval = setInterval(checkFundedDeadlines, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

  // ============================================================
  // ⚠️ REMOVED: the old "Locked Amount Update" effect used to recompute
  // wallets/{uid}.lockedBalance by naively summing ALL active deals'
  // budgets every time `deals` changed. That overwrote the precise,
  // transactional lock/unlock done in activateDealWithEscrowLock /
  // releaseEscrowLock (e.g. it didn't know how much of a deal's budget
  // had already been funded and moved out of "locked" into escrow), so
  // it could silently reset lockedBalance to a wrong number. Locking is
  // now handled exclusively by the escrow helpers above, at the exact
  // moments money actually needs to be locked or released.
  // ============================================================
  // ✅ Fetch Specific Deal (with Extension + Dispute fields)
  // ============================================================
  useEffect(() => {
    const fetchDeal = async () => {
      if (!dealId) {
        setSelectedDeal(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const dealRef = doc(db, 'deals', dealId);
        const dealSnap = await getDoc(dealRef);
        if (dealSnap.exists()) {
          const data = dealSnap.data();
          setSelectedDeal({
            id: dealSnap.id,
            ...data,
            extensionRequestedBy: data.extensionRequestedBy || null,
            extensionRequestedAt: data.extensionRequestedAt || null,
            extensionRequestDays: data.extensionRequestDays || null,
            extensionRequestStatus: data.extensionRequestStatus || null,
            extensionRequestedByName: data.extensionRequestedByName || null,
            extensionCount: data.extensionCount || 0,
            overdueMarkedAt: data.overdueMarkedAt || null,
            disputeStatus: data.disputeStatus || null,
            disputeReason: data.disputeReason || null,
            disputeRaisedBy: data.disputeRaisedBy || null,
          });
        } else {
          setSelectedDeal(null);
        }
      } catch (error) {
        console.error("Error fetching deal:", error);
        setSelectedDeal(null);
      }
      setLoading(false);
    };
    fetchDeal();
  }, [dealId]);

  // ============================================================
  // ✅ ✅ ✅ Extend Deadline - TWO-PERSON CONFIRMATION + MAX 3 LIMIT
  // ============================================================
  const handleExtendDeadline = async () => {
    if (!selectedDeal || (selectedDeal.status !== 'active' && selectedDeal.status !== 'overdue')) {
      feedback.alert.warning({ message: 'শুধুমাত্র অ্যাক্টিভ বা ওভারডিউ ডিলের ডেডলাইন বাড়ানো যায়!' });
      return;
    }

    if (selectedDeal.disputeStatus === 'open') {
      feedback.alert.warning({ message: 'এই ডিলে একটি Dispute চলমান আছে। Admin সিদ্ধান্তের অপেক্ষা করুন।' });
      return;
    }

    // ✅ Check if already pending
    if (selectedDeal.extensionRequestStatus === 'pending') {
      feedback.alert.warning({ message: 'একটি এক্সটেনশন রিকোয়েস্ট ইতিমধ্যে পেন্ডিং আছে!' });
      return;
    }

    // ✅ Check max extension limit
    if ((selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS) {
      feedback.alert.error({
        message: `⚠️ সর্বোচ্চ ${MAX_EXTENSIONS} বার ডেডলাইন বাড়ানো হয়ে গেছে। এখন আর Extend করা যাবে না — Dispute ওপেন করুন বা ডিল ক্যানসেল করুন।`
      });
      return;
    }

    // ✅ Check if user is the one who requested
    if (selectedDeal.extensionRequestedBy === currentUser?.uid) {
      feedback.alert.warning({ message: 'আপনি ইতিমধ্যে একটি রিকোয়েস্ট পাঠিয়েছেন!' });
      return;
    }

    // ✅ Check if deal is already extended recently
    const lastExtended = selectedDeal.extendedAt ? new Date(selectedDeal.extendedAt) : null;
    if (lastExtended && (Date.now() - lastExtended.getTime()) < EXTENSION_COOLDOWN_MS) {
      feedback.alert.warning({ message: 'গত ২৪ ঘন্টার মধ্যে ডেডলাইন বাড়ানো হয়েছে! একটু পরে আবার চেষ্টা করুন।' });
      return;
    }

    // ✅ Get current user's role
    const isBuyer = currentMode === 'buyer';
    const otherParty = isBuyer ? 'Seller' : 'Buyer';
    const remaining = MAX_EXTENSIONS - (selectedDeal.extensionCount || 0);

    // ✅ Feedback System - Confirm
    const confirmed = await feedback.confirm({
      title: '📅 ডেডলাইন বাড়ানোর অনুরোধ',
      message: `আপনি কি ডেডলাইন বাড়ানোর জন্য ${otherParty}-এর কাছে অনুরোধ করতে চান?\n\nবর্তমান ডেডলাইন: ${selectedDeal.deadline} দিন\nবাকি Extension সুযোগ: ${remaining}/${MAX_EXTENSIONS}`,
      confirmText: 'হ্যাঁ, অনুরোধ করুন',
      cancelText: 'না',
      variant: 'info'
    });

    if (!confirmed) return;

    // ✅ Feedback System - Prompt for days
    const extraDays = await feedback.prompt({
      title: '📅 কত দিন বাড়াতে চান?',
      message: `বর্তমান ডেডলাইন: ${selectedDeal.deadline} দিন\n\nকত দিন বাড়াতে চান? (১-৩০ দিন)`,
      placeholder: 'দিনের সংখ্যা লিখুন...',
      confirmText: 'অনুরোধ পাঠান',
      cancelText: 'বাতিল',
      inputType: 'number',
      defaultValue: '1',
    });

    if (extraDays === null || extraDays === undefined) {
      feedback.alert.info({ message: 'ডেডলাইন বাড়ানোর অনুরোধ বাতিল করা হয়েছে।' });
      return;
    }

    const days = Number(extraDays);
    if (!extraDays || isNaN(days) || days <= 0 || days > 30) {
      feedback.alert.warning({ message: 'দয়া করে ১-৩০ দিনের মধ্যে একটি সংখ্যা দিন!' });
      return;
    }

    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      const otherPartyId = isBuyer ? selectedDeal.sellerId : selectedDeal.buyerId;

      await updateDoc(dealRef, {
        extensionRequestedBy: currentUser?.uid,
        extensionRequestedByName: currentUser?.displayName || 'Someone',
        extensionRequestedAt: new Date().toISOString(),
        extensionRequestDays: days,
        extensionRequestStatus: 'pending',
        updatedAt: serverTimestamp()
      });

      setSelectedDeal(prev => ({
        ...prev,
        extensionRequestedBy: currentUser?.uid,
        extensionRequestedByName: currentUser?.displayName || 'Someone',
        extensionRequestedAt: new Date().toISOString(),
        extensionRequestDays: days,
        extensionRequestStatus: 'pending'
      }));

      // ✅ Send notification to other party
      notification.notify({
        event: NOTIFICATION_EVENTS.DEAL_EXTENDED,
        data: {
          userId: otherPartyId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          requestedBy: currentUser?.displayName || 'Someone',
          extraDays: days,
          currentDeadline: selectedDeal.deadline,
          requesterId: currentUser?.uid,
          isRequest: true,
        }
      });

      // ✅ Send chat message
      await sendDealChatMessage(
        selectedDeal.chatId,
        `📅 **Deadline Extension Requested**\n\n${currentUser?.displayName || 'Someone'} has requested to extend the deadline by **${days} days**.\n\n📌 Current Deadline: ${selectedDeal.deadline} days\n⏳ New Deadline would be: ${selectedDeal.deadline + days} days\n\nPlease respond to this request.`
      );

      feedback.alert.success({
        message: `✅ ডেডলাইন বাড়ানোর অনুরোধ ${otherParty}-এর কাছে পাঠানো হয়েছে!`
      });

    } catch (error) {
      console.error("Error requesting extension:", error);
      feedback.alert.error({ message: 'ডেডলাইন বাড়ানোর অনুরোধ পাঠাতে ব্যর্থ হয়েছে।' });
    }
  };

  // ============================================================
  // ✅ ✅ ✅ Submit Work for Review (Seller) — now carries a proof
  // link/note taken from the inline "Submit Work" form (workDraft state).
  // ============================================================
  const handleSubmitWork = async (milestoneId) => {
    if (!selectedDeal) return;

    const milestone = selectedDeal.milestones.find(m => m.id === milestoneId);
    if (!milestone || milestone.status !== 'funded') {
      feedback.alert.warning({ message: "This milestone is not funded yet!" });
      return;
    }

    // ✅ Check if user is Seller
    if (currentUser?.uid !== selectedDeal.sellerId) {
      feedback.alert.warning({ message: "Only the seller can submit work!" });
      return;
    }

    const draft = workDraft[milestoneId] || {};
    const proofLink = (draft.link || '').trim();
    const proofNote = (draft.note || '').trim();

    if (!proofLink && !proofNote) {
      feedback.alert.warning({ message: 'দয়া করে একটা প্রুফ লিংক অথবা নোট দিন — খালি অবস্থায় জমা দেওয়া যাবে না।' });
      return;
    }

    const confirmed = await feedback.confirm({
      title: '📤 Submit Work',
      message: `Are you sure you want to submit work for "${milestone.title}"?\n\nAmount: ${milestone.amount} BDT`,
      confirmText: 'Yes, Submit',
      cancelText: 'Cancel',
      variant: 'success'
    });

    if (!confirmed) return;

    setSubmittingMilestone(milestoneId);

    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      const updatedMilestones = selectedDeal.milestones.map((m) => {
        if (m.id === milestoneId) {
          return {
            ...m,
            status: 'review',
            workSubmittedAt: new Date().toISOString(),
            submittedBy: currentUser?.uid,
            workProofLink: proofLink || null,
            workProofNote: proofNote || null,
          };
        }
        return m;
      });

      await updateDoc(dealRef, {
        milestones: updatedMilestones,
        updatedAt: serverTimestamp()
      });

      setSelectedDeal(prev => ({
        ...prev,
        milestones: updatedMilestones
      }));

      // ✅ Clear the draft form for this milestone
      setWorkDraft(prev => {
        const next = { ...prev };
        delete next[milestoneId];
        return next;
      });
      setOpenSubmitForm(null);

      // ✅ Send notification to BUYER (and confirmation to the seller)
      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_SUBMITTED,
        data: {
          userId: selectedDeal.buyerId,
          buyerId: selectedDeal.buyerId,
          sellerId: selectedDeal.sellerId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          milestoneTitle: milestone.title,
          amount: milestone.amount,
          requesterName: currentUser?.displayName || 'Someone',
        }
      });
      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_SUBMITTED,
        data: {
          userId: selectedDeal.sellerId,
          buyerId: selectedDeal.buyerId,
          sellerId: selectedDeal.sellerId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          milestoneTitle: milestone.title,
          amount: milestone.amount,
        }
      });

      // ✅ Send chat message (include proof link if given)
      await sendDealChatMessage(
        selectedDeal.chatId,
        `📤 **Work Submitted for Review**\n\n${currentUser?.displayName || 'Someone'} has submitted work for milestone **"${milestone.title}"**.\n\n💰 Amount: ${milestone.amount} BDT` +
        (proofLink ? `\n🔗 Proof: ${proofLink}` : '') +
        (proofNote ? `\n📝 Note: ${proofNote}` : '') +
        `\n\n⏳ Waiting for Buyer's review...`
      );

      feedback.alert.success({
        message: `✅ Work submitted for "${milestone.title}"! Waiting for buyer review.`
      });

    } catch (error) {
      console.error("Error submitting work:", error);
      feedback.alert.error({ message: "Failed to submit work. Please try again." });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  // ============================================================
  // ✅ NEW: Reject submitted work (Buyer) — reason required. Milestone
  // goes back to 'funded' with a fresh deadline so the seller can fix and
  // resubmit; no money moves.
  // ============================================================
  const handleRejectWork = async (milestoneId) => {
    if (!selectedDeal) return;

    const milestone = selectedDeal.milestones.find(m => m.id === milestoneId);
    if (!milestone || milestone.status !== 'review') {
      feedback.alert.warning({ message: "This milestone is not under review!" });
      return;
    }

    if (currentUser?.uid !== selectedDeal.buyerId) {
      feedback.alert.warning({ message: "Only the buyer can reject submitted work!" });
      return;
    }

    const reason = await feedback.prompt({
      title: '❌ কাজ প্রত্যাখ্যান করুন',
      message: 'কেন কাজটি প্রত্যাখ্যান করছেন তা লিখুন — সেলার এটা দেখে সংশোধন করে আবার জমা দিতে পারবে।',
      placeholder: 'কারণ লিখুন...',
      confirmText: 'জমা দিন',
      cancelText: 'বাতিল',
      inputType: 'text'
    });

    if (!reason || reason.trim() === '') {
      feedback.alert.warning({ message: 'প্রত্যাখ্যানের কারণ আবশ্যক!' });
      return;
    }

    setRejectingWork(milestoneId);

    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      // ✅ Reset fundedAt to now so the seller gets a FULL fresh
      // SUBMIT_DEADLINE_AFTER_FUND_MS window to fix and resubmit — without
      // this, a rejection close to the original 7-day mark could get the
      // milestone auto-refunded before the seller has a fair chance.
      const updatedMilestones = selectedDeal.milestones.map((m) => {
        if (m.id === milestoneId) {
          return {
            ...m,
            status: 'funded',
            fundedAt: new Date().toISOString(),
            workRejectedAt: new Date().toISOString(),
            workRejectReason: reason.trim(),
            workRejectedBy: currentUser?.uid,
            previousWorkProofLink: m.workProofLink || null,
            previousWorkProofNote: m.workProofNote || null,
            workProofLink: null,
            workProofNote: null,
          };
        }
        return m;
      });

      await updateDoc(dealRef, {
        milestones: updatedMilestones,
        updatedAt: serverTimestamp()
      });

      setSelectedDeal(prev => ({
        ...prev,
        milestones: updatedMilestones
      }));

      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_REJECTED,
        data: {
          userId: selectedDeal.sellerId,
          buyerId: selectedDeal.buyerId,
          sellerId: selectedDeal.sellerId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          milestoneTitle: milestone.title,
          reason: reason.trim(),
        }
      });
      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_REJECTED,
        data: {
          userId: selectedDeal.buyerId,
          buyerId: selectedDeal.buyerId,
          sellerId: selectedDeal.sellerId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          milestoneTitle: milestone.title,
          reason: reason.trim(),
        }
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `❌ **Work Rejected**\n\n${currentUser?.displayName || 'Someone'} rejected the submitted work for **"${milestone.title}"**.\n\n📝 Reason: ${reason.trim()}\n\n🔁 Seller has a fresh 7-day window to fix and resubmit.`
      );

      feedback.alert.warning({ message: 'কাজ প্রত্যাখ্যান করা হয়েছে। সেলারকে জানানো হয়েছে।' });

    } catch (error) {
      console.error("Error rejecting work:", error);
      feedback.alert.error({ message: "Failed to reject work. Please try again." });
    } finally {
      setRejectingWork(null);
    }
  };

  // ============================================================
  // ✅ ✅ ✅ Release Payment (Buyer, i.e. "Accept" the submitted work) -
  // real wallet transaction
  // ============================================================
  const handleReleasePayment = async (milestoneId) => {
    if (!selectedDeal) return;

    const milestone = selectedDeal.milestones.find(m => m.id === milestoneId);
    if (!milestone || milestone.status !== 'review') {
      feedback.alert.warning({ message: "This milestone is not ready for review!" });
      return;
    }

    // ✅ Check if user is Buyer
    if (currentUser?.uid !== selectedDeal.buyerId) {
      feedback.alert.warning({ message: "Only the buyer can release payment!" });
      return;
    }

    const confirmed = await feedback.confirm({
      title: '💰 Accept & Release Payment',
      message: `Are you sure you want to accept this work and release ${milestone.amount} BDT for "${milestone.title}"?\n\nThis will transfer the payment to the seller.`,
      confirmText: 'Yes, Accept & Release',
      cancelText: 'Cancel',
      variant: 'success'
    });

    if (!confirmed) return;

    setReleasingPayment(milestoneId);

    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      const buyerWalletRef = doc(db, 'wallets', selectedDeal.buyerId);
      const sellerWalletRef = doc(db, 'wallets', selectedDeal.sellerId);

      const updatedMilestones = selectedDeal.milestones.map((m) => {
        if (m.id === milestoneId) {
          return {
            ...m,
            status: 'released',
            releasedAt: new Date().toISOString(),
            releasedBy: currentUser?.uid,
          };
        }
        return m;
      });

      // ✅ Check if all milestones are released
      const allReleased = updatedMilestones.every(m => m.status === 'released');
      const updateData = {
        milestones: updatedMilestones,
        updatedAt: serverTimestamp()
      };

      if (allReleased) {
        updateData.status = 'completed';
        updateData.completedAt = new Date().toISOString();
      }

      // ✅ Run transaction for payment release
      await runTransaction(db, async (transaction) => {
        // 1. Get buyer wallet
        const buyerDoc = await transaction.get(buyerWalletRef);
        if (!buyerDoc.exists()) {
          throw new Error('Buyer wallet not found!');
        }

        // 2. Get seller wallet
        const sellerDoc = await transaction.get(sellerWalletRef);
        let sellerBalance = 0;
        if (sellerDoc.exists()) {
          sellerBalance = sellerDoc.data().balance || 0;
        }

        // 3. Buyer wallet: already deducted at funding time, no re-deduction here.

        // 4. Update seller wallet (CREDIT)
        if (sellerDoc.exists()) {
          transaction.update(sellerWalletRef, {
            balance: sellerBalance + milestone.amount,
            totalEarned: (sellerDoc.data().totalEarned || 0) + milestone.amount,
            updatedAt: serverTimestamp()
          });
        } else {
          transaction.set(sellerWalletRef, {
            balance: milestone.amount,
            totalEarned: milestone.amount,
            totalWithdrawn: 0,
            pendingWithdraw: 0,
            userId: selectedDeal.sellerId,
            walletId: `WL-${Date.now().toString(36).toUpperCase()}`,
            currency: 'BDT',
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }

        // 5. Update deal
        transaction.update(dealRef, updateData);

        // 6. Create transaction record
        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          userId: selectedDeal.sellerId,
          userName: selectedDeal.sellerName || 'Seller',
          amount: milestone.amount,
          type: 'credit',
          status: 'completed',
          title: `Payment Released: ${milestone.title}`,
          description: `Payment released for deal: ${selectedDeal.postTitle}`,
          dealId: selectedDeal.id,
          milestoneId: milestoneId,
          senderId: selectedDeal.buyerId,
          senderName: selectedDeal.buyerName || 'Buyer',
          transferId: `REL-${Date.now()}`,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
      });

      setSelectedDeal(prev => ({
        ...prev,
        milestones: updatedMilestones,
        ...(allReleased && { status: 'completed' })
      }));

      // ✅ Notify seller + buyer
      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_RELEASED,
        data: {
          userId: selectedDeal.sellerId,
          buyerId: selectedDeal.buyerId,
          sellerId: selectedDeal.sellerId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          milestoneTitle: milestone.title,
          amount: milestone.amount,
        }
      });

      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_RELEASED,
        data: {
          userId: selectedDeal.buyerId,
          buyerId: selectedDeal.buyerId,
          sellerId: selectedDeal.sellerId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          milestoneTitle: milestone.title,
          amount: milestone.amount,
        }
      });

      if (allReleased) {
        notification.notify({
          event: NOTIFICATION_EVENTS.DEAL_COMPLETED,
          data: {
            userId: selectedDeal.buyerId,
            buyerId: selectedDeal.buyerId,
            sellerId: selectedDeal.sellerId,
            dealId: selectedDeal.id,
            postTitle: selectedDeal.postTitle || 'Untitled Deal',
          }
        });

        notification.notify({
          event: NOTIFICATION_EVENTS.DEAL_COMPLETED,
          data: {
            userId: selectedDeal.sellerId,
            buyerId: selectedDeal.buyerId,
            sellerId: selectedDeal.sellerId,
            dealId: selectedDeal.id,
            postTitle: selectedDeal.postTitle || 'Untitled Deal',
          }
        });

        await sendDealChatMessage(
          selectedDeal.chatId,
          `🎉 **Deal Completed!**\n\nAll milestones have been completed and payments released.\n\n✅ Deal: ${selectedDeal.postTitle}\n💰 Total Amount: ${selectedDeal.budget} BDT\n\nThank you for working together!`
        );

        feedback.alert.success({
          message: "🎉 All milestones completed! Deal is now finished."
        });
      } else {
        await sendDealChatMessage(
          selectedDeal.chatId,
          `✅ **Work Accepted — Payment Released!**\n\n${currentUser?.displayName || 'Someone'} has accepted the work and released payment for milestone **"${milestone.title}"**.\n\n💰 Amount: ${milestone.amount} BDT\n\n📊 ${updatedMilestones.filter(m => m.status === 'released').length}/${updatedMilestones.length} milestones completed.`
        );

        feedback.alert.success({
          message: `✅ Payment released for "${milestone.title}"!`
        });
      }

    } catch (error) {
      console.error("Error releasing payment:", error);
      feedback.alert.error({ message: error.message || "Failed to release payment." });
    } finally {
      setReleasingPayment(null);
    }
  };

  // ============================================================
  // ✅ ✅ ✅ Extension Response - Approve or Reject
  // ============================================================
  const handleExtensionResponse = async (response) => {
    if (!selectedDeal || selectedDeal.extensionRequestStatus !== 'pending') {
      feedback.alert.warning({ message: 'কোন পেন্ডিং এক্সটেনশন রিকোয়েস্ট নেই!' });
      return;
    }

    // ✅ Check if current user is the one who requested
    if (selectedDeal.extensionRequestedBy === currentUser?.uid) {
      feedback.alert.warning({ message: 'আপনি নিজের রিকোয়েস্ট নিজে রিস্পন্ড করতে পারবেন না!' });
      return;
    }

    const extraDays = selectedDeal.extensionRequestDays || 0;
    const newDeadline = (selectedDeal.deadline || 0) + extraDays;

    // --- APPROVE ---
    if (response === 'approve') {
      const confirmed = await feedback.confirm({
        title: '✅ ডেডলাইন বাড়ানোর অনুমোদন',
        message: `আপনি কি ডেডলাইন ${extraDays} দিন বাড়ানোর অনুমোদন দিতে চান?\n\n📌 নতুন ডেডলাইন: ${newDeadline} দিন`,
        confirmText: 'হ্যাঁ, অনুমোদন করুন',
        cancelText: 'না',
        variant: 'success'
      });

      if (!confirmed) return;

      try {
        const dealRef = doc(db, 'deals', selectedDeal.id);
        const newExtensionCount = (selectedDeal.extensionCount || 0) + 1;
        const wasOverdue = selectedDeal.status === 'overdue';

        const updatePayload = {
          deadline: newDeadline,
          extensionRequestStatus: 'approved',
          extensionApprovedAt: new Date().toISOString(),
          extensionApprovedBy: currentUser?.uid,
          extendedAt: new Date().toISOString(),
          extendedBy: currentUser?.uid,
          extensionCount: newExtensionCount,
          deadlineNotified: false,
          updatedAt: serverTimestamp()
        };

        // If the deal was overdue, extending it brings it back to active
        if (wasOverdue) {
          updatePayload.status = 'active';
          updatePayload.overdueMarkedAt = null;
        }

        await updateDoc(dealRef, updatePayload);

        setSelectedDeal(prev => ({
          ...prev,
          deadline: newDeadline,
          extensionRequestStatus: 'approved',
          extensionApprovedAt: new Date().toISOString(),
          extensionApprovedBy: currentUser?.uid,
          extendedAt: new Date().toISOString(),
          extendedBy: currentUser?.uid,
          extensionCount: newExtensionCount,
          ...(wasOverdue && { status: 'active', overdueMarkedAt: null }),
        }));

        // ✅ Send notification to requester
        const requesterId = selectedDeal.extensionRequestedBy;
        if (requesterId) {
          notification.notify({
            event: NOTIFICATION_EVENTS.DEAL_EXTENDED,
            data: {
              userId: requesterId,
              dealId: selectedDeal.id,
              postTitle: selectedDeal.postTitle || 'Untitled Deal',
              approvedBy: currentUser?.displayName || 'Someone',
              extraDays: extraDays,
              newDeadline: newDeadline,
              isApproved: true,
            }
          });
        }

        // ✅ Send chat message
        await sendDealChatMessage(
          selectedDeal.chatId,
          `✅ **Deadline Extended!**\n\n${currentUser?.displayName || 'Someone'} has approved the extension request.\n\n📅 New Deadline: **${newDeadline} days**\n📈 Extended by: ${extraDays} days\n🔢 Extensions used: ${newExtensionCount}/${MAX_EXTENSIONS}`
        );

        feedback.alert.success({
          message: `✅ ডেডলাইন ${extraDays} দিন বাড়ানো হয়েছে! নতুন ডেডলাইন: ${newDeadline} দিন`
        });

      } catch (error) {
        console.error("Error approving extension:", error);
        feedback.alert.error({ message: 'অনুমোদন দিতে ব্যর্থ হয়েছে।' });
      }
    }

    // --- REJECT ---
    if (response === 'reject') {
      const confirmed = await feedback.confirm({
        title: '❌ ডেডলাইন বাড়ানোর প্রত্যাখ্যান',
        message: `আপনি কি ডেডলাইন ${extraDays} দিন বাড়ানোর অনুরোধটি প্রত্যাখ্যান করতে চান?`,
        confirmText: 'হ্যাঁ, প্রত্যাখ্যান করুন',
        cancelText: 'না',
        variant: 'warning'
      });

      if (!confirmed) return;

      try {
        const dealRef = doc(db, 'deals', selectedDeal.id);

        await updateDoc(dealRef, {
          extensionRequestStatus: 'rejected',
          extensionRejectedAt: new Date().toISOString(),
          extensionRejectedBy: currentUser?.uid,
          extensionRejectReason: 'Rejected by other party',
          updatedAt: serverTimestamp()
        });

        setSelectedDeal(prev => ({
          ...prev,
          extensionRequestStatus: 'rejected',
          extensionRejectedAt: new Date().toISOString(),
          extensionRejectedBy: currentUser?.uid,
        }));

        // ✅ Send notification to requester
        const requesterId = selectedDeal.extensionRequestedBy;
        if (requesterId) {
          notification.notify({
            event: NOTIFICATION_EVENTS.DEAL_EXTENDED,
            data: {
              userId: requesterId,
              dealId: selectedDeal.id,
              postTitle: selectedDeal.postTitle || 'Untitled Deal',
              rejectedBy: currentUser?.displayName || 'Someone',
              isRejected: true,
            }
          });
        }

        // ✅ Send chat message
        await sendDealChatMessage(
          selectedDeal.chatId,
          `❌ **Deadline Extension Rejected**\n\n${currentUser?.displayName || 'Someone'} has rejected the extension request.\n\n📌 Current Deadline remains: ${selectedDeal.deadline} days`
        );

        feedback.alert.success({
          message: '❌ ডেডলাইন বাড়ানোর অনুরোধটি প্রত্যাখ্যান করা হয়েছে।'
        });

      } catch (error) {
        console.error("Error rejecting extension:", error);
        feedback.alert.error({ message: 'প্রত্যাখ্যান করতে ব্যর্থ হয়েছে।' });
      }
    }
  };

  // ============================================================
  // ✅ Confirm Deal (accept a pending offer)
  // ============================================================
  const handleConfirmDeal = async () => {
    if (!selectedDeal || selectedDeal.status !== 'pending') {
      feedback.alert.warning({ message: "No pending deal to confirm!" });
      return;
    }

    const postType = selectedDeal.postType || 'hire';

    if (postType === 'service') {
      if (selectedDeal.sellerId !== currentUser?.uid) {
        feedback.alert.warning({
          message: "⚠️ শুধুমাত্র সার্ভিস প্রদানকারী (Seller) ডিল কনফার্ম করতে পারে!"
        });
        return;
      }
    } else {
      if (selectedDeal.buyerId !== currentUser?.uid) {
        feedback.alert.warning({
          message: "⚠️ শুধুমাত্র জব প্রদানকারী (Buyer) ডিল কনফার্ম করতে পারে!"
        });
        return;
      }
    }

    try {
      // ✅ Check buyer's available balance and lock the full budget
      // atomically together with activating the deal.
      await activateDealWithEscrowLock({
        dealId: selectedDeal.id,
        buyerId: selectedDeal.buyerId,
        budget: selectedDeal.budget || 0,
        extraDealFields: { confirmedAt: new Date().toISOString() },
      });

      setSelectedDeal(prev => ({ ...prev, status: 'active', startedAt: new Date().toISOString() }));

      // ✅ FIXED BUG: this used to be ONE notify() call with buyerId/sellerId
      // stuffed into `data` but no `userId` — meaning the notification
      // never reliably reached either party. Now it's sent explicitly to
      // both, matching the pattern used everywhere else in this file.
      notification.notify({
        event: NOTIFICATION_EVENTS.DEAL_CONFIRMED,
        data: {
          userId: selectedDeal.buyerId,
          buyerId: selectedDeal.buyerId,
          sellerId: selectedDeal.sellerId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          budget: selectedDeal.budget,
        }
      });
      notification.notify({
        event: NOTIFICATION_EVENTS.DEAL_CONFIRMED,
        data: {
          userId: selectedDeal.sellerId,
          buyerId: selectedDeal.buyerId,
          sellerId: selectedDeal.sellerId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          budget: selectedDeal.budget,
        }
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `🎉 **Deal Confirmed!**\n\nবাজেটের পুরো ${selectedDeal.budget?.toLocaleString() || 0} BDT Buyer-এর ওয়ালেটে লক করা হয়েছে। ডিল এখন Active।`
      );

      feedback.alert.success({ message: "🎉 ডিল কনফার্ম করা হয়েছে! বাজেট লক করা হয়েছে।" });

    } catch (error) {
      console.error("Error:", error);
      if (error.message === 'INSUFFICIENT_BALANCE') {
        feedback.alert.error({
          message: `⚠️ Buyer-এর ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই! এই ডিল কনফার্ম করতে ${selectedDeal.budget?.toLocaleString() || 0} BDT দরকার। দয়া করে আগে Deposit করুন।`
        });
      } else if (error.message === 'WALLET_NOT_FOUND') {
        feedback.alert.error({ message: "⚠️ Buyer-এর ওয়ালেট খুঁজে পাওয়া যায়নি।" });
      } else {
        feedback.alert.error({ message: "Failed to confirm deal." });
      }
    }
  };

  // ============================================================
  // ✅ Cancel Deal Request
  // ============================================================
  const handleCancelDeal = async () => {
    if (!selectedDeal || isProcessing) return;

    if (selectedDeal.status === 'completed') {
      feedback.alert.warning({ message: "Cannot cancel a completed deal!" });
      return;
    }

    if (selectedDeal.status === 'cancelled') {
      feedback.alert.warning({ message: "This deal is already cancelled!" });
      return;
    }

    if (selectedDeal.disputeStatus === 'open') {
      feedback.alert.warning({ message: "এই ডিলে Dispute চলমান। Admin সিদ্ধান্তের অপেক্ষা করুন।" });
      return;
    }

    if (selectedDeal.cancelRequestedBy) {
      feedback.alert.warning({ message: "A cancellation request is already pending." });
      return;
    }

    const hasPayment = selectedDeal.milestones?.some(m => m.status === 'funded' || m.status === 'released' || m.status === 'review');
    if (hasPayment) {
      feedback.alert.warning({ message: "⚠️ This deal has payments made. Cannot cancel. Please contact support or open a dispute." });
      return;
    }

    const isBuyer = currentMode === 'buyer';
    const otherPartyName = isBuyer ? 'Seller' : 'Buyer';

    const confirmed = await feedback.confirm({
      title: '⚠️ ক্যানসেল রিকোয়েস্ট',
      message: `আপনি কি সত্যিই এই ডিলটি ক্যানসেল করতে চান?\n\nআপনি ${isBuyer ? 'বায়ার' : 'সেলার'} হিসেবে রিকোয়েস্ট করছেন।`,
      confirmText: 'হ্যাঁ, ক্যানসেল করুন',
      cancelText: 'না',
      variant: 'warning'
    });

    if (!confirmed) return;

    const reason = await feedback.prompt({
      title: 'ক্যানসেল করার কারণ',
      message: 'দয়া করে ক্যানসেল করার কারণ লিখুন:',
      placeholder: 'কারণ লিখুন...',
      confirmText: 'জমা দিন',
      cancelText: 'বাতিল করুন',
      inputType: 'text'
    });

    if (reason === null || reason === undefined) {
      feedback.alert.info({ message: 'ক্যানসেল রিকোয়েস্ট বাতিল করা হয়েছে।' });
      return;
    }

    if (!reason || reason.trim() === '') {
      feedback.alert.warning({ message: "Cancellation reason is required!" });
      return;
    }

    setIsProcessing(true);

    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      const now = new Date().toISOString();

      await updateDoc(dealRef, {
        cancelRequestedBy: currentUser?.uid,
        cancelRequestedAt: now,
        cancelReason: reason.trim(),
        cancelRequestStatus: 'pending',
        cancelExpiryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      const otherPartyId = isBuyer ? selectedDeal.sellerId : selectedDeal.buyerId;

      notification.notify({
        event: NOTIFICATION_EVENTS.CANCELLATION_REQUEST,
        data: {
          userId: otherPartyId,
          requesterName: currentUser?.displayName || currentUser?.email || 'Someone',
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          reason: reason.trim(),
          budget: selectedDeal.budget,
        }
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `⚠️ **Cancellation Requested**\n\n${currentUser?.displayName || 'Someone'} has requested to cancel this deal.\n\n📝 Reason: ${reason.trim()}\n\n⏳ Waiting for ${otherPartyName} response...`
      );

      setSelectedDeal(prev => ({
        ...prev,
        cancelRequestedBy: currentUser?.uid,
        cancelRequestedAt: now,
        cancelReason: reason.trim(),
        cancelRequestStatus: 'pending'
      }));

      feedback.alert.success({ message: `✅ Cancellation request sent to ${otherPartyName}.` });

    } catch (error) {
      console.error("Error requesting cancellation:", error);
      feedback.alert.error({ message: "Failed to request cancellation." });
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================
  // ✅ Cancel Response
  // ============================================================
  const handleCancelResponse = async (response) => {
    if (!selectedDeal || !selectedDeal.id) return;

    const dealRef = doc(db, 'deals', selectedDeal.id);
    const isBuyer = currentMode === 'buyer';
    const postType = selectedDeal.postType || 'hire';

    // --- REJECT ---
    if (response === 'reject') {
      const isCancelRequest = selectedDeal.cancelRequestStatus === 'pending';

      const confirmed = await feedback.confirm({
        title: 'আপনি কি নিশ্চিত?',
        message: isCancelRequest
          ? "ক্যানসেল রিকোয়েস্ট রিজেক্ট করলে ডিলটি অ্যাক্টিভ থাকবে।"
          : "অফারটি রিজেক্ট এবং ডিলিট করতে চান?",
        confirmText: 'হ্যাঁ, রিজেক্ট করুন',
        cancelText: 'না',
        variant: 'warning'
      });

      if (!confirmed) return;

      try {
        if (isCancelRequest) {
          const requesterId = selectedDeal.cancelRequestedBy;
          const dealTitle = selectedDeal.postTitle || 'Untitled Deal';

          await updateDoc(dealRef, {
            cancelRequestedBy: null,
            cancelRequestedAt: null,
            cancelReason: null,
            cancelRequestStatus: null,
            cancelExpiryAt: null
          });

          await deleteCancelNotifications(selectedDeal.id);

          setSelectedDeal(prev => ({
            ...prev,
            cancelRequestedBy: null,
            cancelRequestStatus: null
          }));

          await sendDealChatMessage(
            selectedDeal.chatId,
            `❌ **Cancellation Rejected**\n\n${currentUser?.displayName || 'Someone'} has rejected the cancellation request.\n\n✅ Deal remains active.`
          );

          if (requesterId) {
            notification.notify({
              event: NOTIFICATION_EVENTS.CANCELLATION_REJECTED,
              data: {
                userId: requesterId,
                dealId: selectedDeal.id,
                postTitle: dealTitle,
                rejectedBy: currentUser?.displayName || 'Someone',
              }
            });
          }

          feedback.alert.success({ message: 'ক্যানসেল রিকোয়েস্ট রিজেক্ট করা হয়েছে।' });

        } else {
          const dealTitle = selectedDeal.postTitle || 'Untitled Deal';
          const senderId = selectedDeal.proposedBy;

          await deleteDoc(dealRef);
          setDeals(prev => prev.filter(d => d.id !== selectedDeal.id));
          setSelectedDeal(null);
          navigate('/deal-manager');

          // ✅ Both parties get told the offer was rejected — this branch
          // previously only showed a local alert to the person clicking
          // reject; the other party never found out.
          const otherPartyId = currentUser?.uid === selectedDeal.buyerId ? selectedDeal.sellerId : selectedDeal.buyerId;
          notification.notify({
            event: NOTIFICATION_EVENTS.CANCELLATION_REJECTED,
            data: {
              userId: otherPartyId,
              dealId: selectedDeal.id,
              postTitle: dealTitle,
              rejectedBy: currentUser?.displayName || 'Someone',
              isOfferRejection: true,
            }
          });

          feedback.alert.error({ message: 'অফারটি ডিলিট করা হয়েছে।' });
        }
      } catch (error) {
        console.error("Error in reject:", error);
        feedback.alert.error({ message: 'অপারেশনটি ব্যর্থ হয়েছে।' });
      }
    }

    // --- APPROVE ---
    if (response === 'approve') {
      try {
        if (selectedDeal.status === 'pending' && !selectedDeal.cancelRequestStatus) {
          let canConfirm = false;

          if (postType === 'service') {
            canConfirm = selectedDeal.sellerId === currentUser?.uid;
          } else {
            canConfirm = selectedDeal.buyerId === currentUser?.uid;
          }

          if (!canConfirm) {
            feedback.alert.warning({ message: 'শুধুমাত্র ডিলের সংশ্লিষ্ট পক্ষ কনফার্ম করতে পারে!' });
            return;
          }

          // ✅ Same escrow check+lock as handleConfirmDeal — this is the
          // OTHER path by which a 'pending' offer becomes 'active'.
          try {
            await activateDealWithEscrowLock({
              dealId: selectedDeal.id,
              buyerId: selectedDeal.buyerId,
              budget: selectedDeal.budget || 0,
            });
          } catch (lockError) {
            if (lockError.message === 'INSUFFICIENT_BALANCE') {
              feedback.alert.error({
                message: `⚠️ Buyer-এর ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই! এই ডিল একটিভ করতে ${selectedDeal.budget?.toLocaleString() || 0} BDT দরকার।`
              });
            } else {
              feedback.alert.error({ message: 'ডিল একটিভ করতে ব্যর্থ হয়েছে।' });
            }
            return;
          }

          setSelectedDeal(prev => ({ ...prev, status: 'active' }));

          // ✅ FIXED: this path was missing any notification at all —
          // added the same both-party notify pattern as handleConfirmDeal.
          notification.notify({
            event: NOTIFICATION_EVENTS.DEAL_CONFIRMED,
            data: {
              userId: selectedDeal.buyerId,
              buyerId: selectedDeal.buyerId,
              sellerId: selectedDeal.sellerId,
              dealId: selectedDeal.id,
              postTitle: selectedDeal.postTitle || 'Untitled Deal',
              budget: selectedDeal.budget,
            }
          });
          notification.notify({
            event: NOTIFICATION_EVENTS.DEAL_CONFIRMED,
            data: {
              userId: selectedDeal.sellerId,
              buyerId: selectedDeal.buyerId,
              sellerId: selectedDeal.sellerId,
              dealId: selectedDeal.id,
              postTitle: selectedDeal.postTitle || 'Untitled Deal',
              budget: selectedDeal.budget,
            }
          });

          await sendDealChatMessage(
            selectedDeal.chatId,
            `✅ **Deal Accepted!**\n\n${currentUser?.displayName || 'Someone'} has accepted the offer.\n\n💰 বাজেটের পুরো ${selectedDeal.budget?.toLocaleString() || 0} BDT Buyer-এর ওয়ালেটে লক করা হয়েছে।\n🚀 Deal is now active!`
          );

          feedback.alert.success({ message: 'ডিলটি এখন অ্যাক্টিভ! বাজেট লক করা হয়েছে।' });
          return;
        }

        if (selectedDeal.cancelRequestStatus === 'pending') {
          if (selectedDeal.cancelRequestedBy === currentUser?.uid) {
            feedback.alert.warning({ message: "আপনি নিজের রিকোয়েস্ট নিজে এপ্রুভ করতে পারবেন না।" });
            return;
          }

          const isOtherParty = (isBuyer && selectedDeal.buyerId === currentUser?.uid) ||
                              (!isBuyer && selectedDeal.sellerId === currentUser?.uid);

          if (!isOtherParty) {
            feedback.alert.warning({ message: "আপনি এই ডিলের সাথে সম্পর্কিত নন!" });
            return;
          }

          const dealTitle = selectedDeal.postTitle || 'Untitled Deal';

          await updateDoc(dealRef, {
            status: 'cancelled',
            cancelRequestStatus: 'approved',
            cancelledAt: new Date().toISOString(),
            cancelledBy: currentUser?.uid,
            cancellationReason: selectedDeal.cancelReason || 'No reason provided'
          });

          // ✅ Release the buyer's locked escrow budget back to available
          // balance. Safe to release the FULL budget here because
          // handleCancelDeal's hasPayment guard already prevents a
          // cancellation request from ever being created while any
          // milestone is funded/released — so none of the locked amount
          // has actually left the buyer's wallet yet.
          if (selectedDeal.status === 'active' || selectedDeal.status === 'overdue') {
            try {
              await releaseEscrowLock({
                buyerId: selectedDeal.buyerId,
                amount: selectedDeal.escrowLockedAmount || selectedDeal.budget || 0,
              });
            } catch (unlockError) {
              console.error('Error releasing escrow lock:', unlockError);
            }
          }

          await deleteCancelNotifications(selectedDeal.id);

          notification.notify({
            event: NOTIFICATION_EVENTS.CANCELLATION_APPROVED,
            data: {
              userId: selectedDeal.buyerId,
              buyerId: selectedDeal.buyerId,
              sellerId: selectedDeal.sellerId,
              dealId: selectedDeal.id,
              postTitle: dealTitle,
            }
          });

          notification.notify({
            event: NOTIFICATION_EVENTS.CANCELLATION_APPROVED,
            data: {
              userId: selectedDeal.sellerId,
              buyerId: selectedDeal.buyerId,
              sellerId: selectedDeal.sellerId,
              dealId: selectedDeal.id,
              postTitle: dealTitle,
            }
          });

          await sendDealChatMessage(
            selectedDeal.chatId,
            `❌ **Deal Cancelled**\n\n${currentUser?.displayName || 'Someone'} has approved the cancellation request.\n\n📝 Reason: ${selectedDeal.cancelReason || 'No reason provided'}\n\n🔄 Deal has been cancelled.`
          );

          setSelectedDeal(prev => ({ ...prev, status: 'cancelled' }));
          feedback.alert.success({ message: 'ডিলটি ক্যানসেল করা হয়েছে।' });

          setTimeout(() => navigate('/deal-manager'), 1500);
        }
      } catch (error) {
        console.error("Error in approve:", error);
        feedback.alert.error({ message: 'সিস্টেম এরর ঘটেছে।' });
      }
    }
  };

  // ============================================================
  // ✅ ✅ ✅ Open Dispute (Case: 90% done vs "nothing done" conflicts,
  //           repeated bad-faith cancellations/extensions, etc.)
  // ============================================================
  const handleOpenDispute = async () => {
    if (!selectedDeal) return;

    if (selectedDeal.status === 'completed' || selectedDeal.status === 'cancelled') {
      feedback.alert.warning({ message: 'সম্পন্ন বা বাতিল হওয়া ডিলে Dispute ওপেন করা যায় না।' });
      return;
    }

    if (selectedDeal.disputeStatus === 'open') {
      feedback.alert.warning({ message: 'এই ডিলে ইতিমধ্যে একটি Dispute চলমান আছে।' });
      return;
    }

    const confirmed = await feedback.confirm({
      title: '⚖️ Dispute ওপেন করুন',
      message: 'Dispute ওপেন করলে Admin এই ডিলটি রিভিউ করবে এবং সিদ্ধান্ত না হওয়া পর্যন্ত Extend/Cancel বন্ধ থাকবে।\n\nআপনি কি নিশ্চিত?',
      confirmText: 'হ্যাঁ, Dispute ওপেন করুন',
      cancelText: 'না',
      variant: 'warning'
    });

    if (!confirmed) return;

    const reason = await feedback.prompt({
      title: '📝 Dispute-এর কারণ',
      message: 'বিস্তারিত লিখুন — কী সমস্যা হয়েছে, কাজ কতটুকু হয়েছে বলে আপনার দাবি:',
      placeholder: 'যেমন: Freelancer দাবি করছে ৯০% কাজ শেষ, কিন্তু...',
      confirmText: 'জমা দিন',
      cancelText: 'বাতিল',
      inputType: 'text'
    });

    if (!reason || reason.trim() === '') {
      feedback.alert.warning({ message: 'Dispute-এর কারণ লেখা আবশ্যক।' });
      return;
    }

    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      const now = new Date().toISOString();
      const otherPartyId = currentUser?.uid === selectedDeal.buyerId
        ? selectedDeal.sellerId
        : selectedDeal.buyerId;

      await updateDoc(dealRef, {
        disputeStatus: 'open',
        disputeRaisedBy: currentUser?.uid,
        disputeReason: reason.trim(),
        disputeRaisedAt: now,
        // Clear any pending extension request since dispute takes over
        extensionRequestStatus: null,
        updatedAt: serverTimestamp()
      });

      // ✅ Create a dispute record for Admin review
      await addDoc(collection(db, 'disputes'), {
        dealId: selectedDeal.id,
        postTitle: selectedDeal.postTitle || 'Untitled Deal',
        buyerId: selectedDeal.buyerId,
        sellerId: selectedDeal.sellerId,
        raisedBy: currentUser?.uid,
        raisedByName: currentUser?.displayName || 'Someone',
        reason: reason.trim(),
        status: 'open',
        createdAt: serverTimestamp(),
      });

      setSelectedDeal(prev => ({
        ...prev,
        disputeStatus: 'open',
        disputeRaisedBy: currentUser?.uid,
        disputeReason: reason.trim(),
        disputeRaisedAt: now,
        extensionRequestStatus: null,
      }));

      notification.notify({
        event: NOTIFICATION_EVENTS.DISPUTE_OPENED,
        data: {
          userId: otherPartyId,
          dealId: selectedDeal.id,
          postTitle: selectedDeal.postTitle || 'Untitled Deal',
          raisedBy: currentUser?.displayName || 'Someone',
          reason: reason.trim(),
        }
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `⚖️ **Dispute Opened**\n\n${currentUser?.displayName || 'Someone'} has opened a dispute for admin review.\n\n📝 Reason: ${reason.trim()}\n\n⏳ Admin সিদ্ধান্ত না দেওয়া পর্যন্ত এই ডিলে কোনো Extend/Cancel অ্যাকশন নেওয়া যাবে না।`
      );

      feedback.alert.success({ message: '✅ Dispute ওপেন করা হয়েছে। Admin শীঘ্রই রিভিউ করবে।' });

    } catch (error) {
      console.error("Error opening dispute:", error);
      feedback.alert.error({ message: 'Dispute ওপেন করতে ব্যর্থ হয়েছে।' });
    }
  };

  // ============================================================
  // ✅ Helper Functions
  // ============================================================
  const getMilestoneStatusBadge = (status) => {
    switch(status) {
      case 'pending': return { text: '⏳ Pending', class: 'status-pending' };
      case 'funded': return { text: '💰 Funded', class: 'status-funded' };
      case 'review': return { text: '📝 Under Review', class: 'status-review' };
      case 'released': return { text: '✅ Released', class: 'status-released' };
      case 'refunded': return { text: '↩️ Refunded', class: 'status-refunded' };
      default: return { text: '📌 New', class: 'status-pending' };
    }
  };

  const getDealStatusBadge = (status) => {
    switch(status) {
      case 'pending': return { text: '⏳ Pending Confirmation', class: 'status-pending-deal' };
      case 'active': return { text: '⚡ Active Deal', class: 'status-active' };
      case 'overdue': return { text: '🔴 Overdue', class: 'status-overdue' };
      case 'completed': return { text: '✅ Completed', class: 'status-completed' };
      case 'cancelled': return { text: '❌ Cancelled', class: 'status-cancelled' };
      default: return { text: '📌 New', class: 'status-pending' };
    }
  };

  // ✅ NEW: how much time is left before a 'funded' milestone gets
  // auto-refunded. Not a live per-second countdown (recomputed on each
  // render/re-render), which is good enough given it's shown next to a
  // simple day/hour readout.
  const getSubmitDeadlineText = (milestone) => {
    if (!milestone?.fundedAt) return null;
    const deadlineMs = new Date(milestone.fundedAt).getTime() + SUBMIT_DEADLINE_AFTER_FUND_MS;
    const remain = deadlineMs - Date.now();
    if (remain <= 0) return { text: '⏳ সময় শেষ — শীঘ্রই অটো-রিফান্ড হবে', urgent: true };
    const days = Math.floor(remain / 86400000);
    const hours = Math.floor((remain % 86400000) / 3600000);
    return { text: `⏳ কাজ জমা দিন: বাকি ${days}দ ${hours}ঘ (নাহলে অটো-রিফান্ড)`, urgent: days < 1 };
  };

  // ============================================================
  // ✅ Render Functions
  // ============================================================
 const renderMilestones = () => {
  if (!selectedDeal?.milestones) return null;

  const isBuyer = currentMode === 'buyer';
  const isSeller = currentMode === 'seller';
  const isActive = selectedDeal.status === 'active' || selectedDeal.status === 'overdue';
  const isPending = selectedDeal.status === 'pending';
  const isCancelled = selectedDeal.status === 'cancelled';
  const postType = selectedDeal.postType || 'hire';

  if (isCancelled) {
    return (
      <div className="deal-cancelled-banner">
        <i className="fa-solid fa-ban"></i>
        <h4>Deal Cancelled</h4>
        <p>Cancelled on: {selectedDeal.cancelledAt ? new Date(selectedDeal.cancelledAt).toLocaleDateString() : 'N/A'}</p>
        <p>Reason: {selectedDeal.cancellationReason || 'No reason provided'}</p>
      </div>
    );
  }

  return (
    <div className="milestone-container">
      {isPending && (
        <div className="confirm-deal-banner">
          <p><i className="fa-solid fa-gavel"></i> একটি অফার পাঠানো হয়েছে!</p>

          <div style={{ display: 'flex', gap: '10px' }}>
            {postType === 'service' && selectedDeal.sellerId === currentUser?.uid && (
              <>
                <button className="btn-confirm-deal" onClick={() => runWithGuide(handleConfirmDeal)}>
                  <i className="fa-solid fa-check-circle"></i> অফার গ্রহণ করুন
                </button>
                <button
                  className="btn-cancel-deal"
                  style={{ backgroundColor: '#ef4444', color: 'white' }}
                  onClick={() => handleCancelResponse('reject')}
                >
                  <i className="fa-solid fa-times-circle"></i> অফার প্রত্যাখ্যান করুন
                </button>
              </>
            )}

            {postType === 'hire' && selectedDeal.buyerId === currentUser?.uid && (
              <>
                <button className="btn-confirm-deal" onClick={() => runWithGuide(handleConfirmDeal)}>
                  <i className="fa-solid fa-check-circle"></i> অফার গ্রহণ করুন
                </button>
                <button
                  className="btn-cancel-deal"
                  style={{ backgroundColor: '#ef4444', color: 'white' }}
                  onClick={() => handleCancelResponse('reject')}
                >
                  <i className="fa-solid fa-times-circle"></i> অফার প্রত্যাখ্যান করুন
                </button>
              </>
            )}

            {!(
              (postType === 'service' && selectedDeal.sellerId === currentUser?.uid) ||
              (postType === 'hire' && selectedDeal.buyerId === currentUser?.uid)
            ) && (
              <span className="pending-message">
                ⏳ {postType === 'service' ? 'সেলার' : 'বায়ার'} এর সিদ্ধান্তের জন্য অপেক্ষা করছেন...
              </span>
            )}
          </div>

          {selectedDeal.proposedAt && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '8px' }}>
              <i className="fa-solid fa-hourglass-half"></i> এই অফারটি ৪৮ ঘণ্টার মধ্যে গ্রহণ না করা হলে স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।
            </p>
          )}
        </div>
      )}

      {selectedDeal.milestones.map((milestone, index) => {
        const statusBadge = getMilestoneStatusBadge(milestone.status);
        const deadlineInfo = milestone.status === 'funded' ? getSubmitDeadlineText(milestone) : null;

        return (
          <div key={milestone.id} className={`milestone-row ${milestone.status}`}>
            <div className="m-info-block">
              <div className="m-number">{String(index + 1).padStart(2, '0')}</div>
              <div className="m-details">
                <h4>{milestone.title}</h4>
                <p className="m-amount">💰 Amount: {milestone.amount?.toLocaleString()} BDT</p>
                {milestone.status === 'funded' && milestone.workRejectReason && (
                  <p style={{ fontSize: '12px', color: '#ef4444', margin: '4px 0 0' }}>
                    <i className="fa-solid fa-triangle-exclamation"></i> পূর্বের সাবমিশন প্রত্যাখ্যাত হয়েছে: {milestone.workRejectReason}
                  </p>
                )}
                {deadlineInfo && (
                  <p style={{ fontSize: '12px', color: deadlineInfo.urgent ? '#ef4444' : '#f59e0b', margin: '4px 0 0' }}>
                    {deadlineInfo.text}
                  </p>
                )}
                {milestone.status === 'refunded' && (
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
                    <i className="fa-solid fa-rotate-left"></i> {milestone.refundReason === 'seller_no_submission'
                      ? 'সময়মতো কাজ জমা না দেওয়ায় অটো-রিফান্ড হয়েছে।'
                      : 'Buyer-কে টাকা ফেরত দেওয়া হয়েছে।'}
                  </p>
                )}
              </div>
            </div>

            <div className="m-status-side">
              <span className={`status-badge ${statusBadge.class}`}>
                {statusBadge.text}
              </span>

              {/* ── Buyer Actions ── */}
              {isActive && isBuyer && milestone.status === 'pending' && (
                <button
                  className="btn-fund"
                  onClick={() => navigate(`/payment/${selectedDeal.id}/${milestone.id}`)}
                >
                  <i className="fa-solid fa-credit-card"></i> Pay & Fund
                </button>
              )}

              {isActive && isBuyer && milestone.status === 'review' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                  {(milestone.workProofLink || milestone.workProofNote) && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', textAlign: 'right', maxWidth: '260px' }}>
                      {milestone.workProofLink && (
                        <div>
                          <a href={milestone.workProofLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary, #14b8a6)' }}>
                            <i className="fa-solid fa-link"></i> Proof Link দেখুন
                          </a>
                        </div>
                      )}
                      {milestone.workProofNote && <div style={{ marginTop: '2px' }}>📝 {milestone.workProofNote}</div>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-review-release"
                      onClick={() => handleReleasePayment(milestone.id)}
                      disabled={releasingPayment === milestone.id}
                    >
                      {releasingPayment === milestone.id ? (
                        <><i className="fa-solid fa-spinner fa-spin"></i> ...</>
                      ) : (
                        <><i className="fa-solid fa-check"></i> Accept & Release</>
                      )}
                    </button>
                    <button
                      className="btn-reject-work"
                      onClick={() => handleRejectWork(milestone.id)}
                      disabled={rejectingWork === milestone.id}
                      style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer' }}
                    >
                      {rejectingWork === milestone.id ? (
                        <><i className="fa-solid fa-spinner fa-spin"></i> ...</>
                      ) : (
                        <><i className="fa-solid fa-times"></i> Reject</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Seller Actions ── */}
              {isActive && isSeller && milestone.status === 'funded' && (
                openSubmitForm === milestone.id ? (
                  <div className="work-submit-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '240px' }}>
                    <input
                      type="text"
                      placeholder="🔗 Proof link (স্ক্রিনশট/ফাইল/ড্রাইভ লিংক)"
                      value={workDraft[milestone.id]?.link || ''}
                      onChange={(e) => setWorkDraft(prev => ({ ...prev, [milestone.id]: { ...prev[milestone.id], link: e.target.value } }))}
                      style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
                    />
                    <textarea
                      placeholder="নোট (যেমন: বাকি ফাইল WhatsApp/Messenger-এ পাঠানো হয়েছে)"
                      value={workDraft[milestone.id]?.note || ''}
                      onChange={(e) => setWorkDraft(prev => ({ ...prev, [milestone.id]: { ...prev[milestone.id], note: e.target.value } }))}
                      rows={2}
                      style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'inherit', resize: 'vertical', fontSize: '13px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-submit-work"
                        onClick={() => handleSubmitWork(milestone.id)}
                        disabled={submittingMilestone === milestone.id}
                      >
                        {submittingMilestone === milestone.id ? (
                          <><i className="fa-solid fa-spinner fa-spin"></i> Submitting...</>
                        ) : (
                          <><i className="fa-solid fa-paper-plane"></i> Submit</>
                        )}
                      </button>
                      <button
                        onClick={() => setOpenSubmitForm(null)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--text-muted, #94a3b8)', cursor: 'pointer', fontSize: '13px' }}
                      >
                        বাতিল
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-submit-work"
                    onClick={() => setOpenSubmitForm(milestone.id)}
                  >
                    <i className="fa-solid fa-upload"></i> Submit Work
                  </button>
                )
              )}

              {/* ── Status Badges ── */}
              {milestone.status === 'released' && (
                <span className="badge-completed">
                  <i className="fa-solid fa-check-circle"></i> Payment Released
                </span>
              )}
            </div>
          </div>
        );
      })}

      {selectedDeal.status === 'completed' && (
        <div className="deal-completed-banner">
          <i className="fa-solid fa-trophy"></i>
          <h4>Deal Completed!</h4>
          <p>All milestones have been completed and payments released.</p>
        </div>
      )}
    </div>
  );
};
  // ============================================================
  // ✅ Main Render
  // ============================================================
if (loading) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: 'var(--bg-primary, #090d16)',
      color: 'var(--accent-primary, #14b8a6)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <i className="fa-solid fa-cube" style={{
          fontSize: '48px',
          animation: 'spin 2s linear infinite',
          display: 'block',
          marginBottom: '16px'
        }} />
        <h2>Loading Deals...</h2>
        <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
          <i className="fa-solid fa-spinner fa-spin"></i> Preparing your deals...
        </p>
      </div>
    </div>
  );
}
  const cancelledDeals = deals.filter(deal => deal.status === 'cancelled');
  const activeDeals = deals.filter(deal => deal.status !== 'cancelled');
  const pendingCount = deals.filter(d => d.status === 'pending').length;
  const activeCount = deals.filter(d => d.status === 'active').length;
  const overdueCount = deals.filter(d => d.status === 'overdue').length;
  const completedCount = deals.filter(d => d.status === 'completed').length;
  const totalDeals = deals.length;

  const canCancelOrExtend = selectedDeal && selectedDeal.disputeStatus !== 'open';

  return (
    <div className="dashboard-container-wrapper">
      <div className="dashboard-wrapper">

        {/* ✅ NEW: Guide popup — shown before an offer is accepted */}
        <DealGuideModal
          show={showGuideModal}
          role="accepter"
          onConfirm={handleGuideConfirm}
          onCancel={handleGuideCancel}
        />

        {/* Mode Switcher */}
        <div className="deal-mode-switcher">
          <button
            className={`mode-switch-button ${currentMode === 'buyer' ? 'active' : ''}`}
            onClick={() => handleModeChange('buyer')}
          >
            <i className="fa-solid fa-briefcase"></i> Buyer Mode
            {pendingCount > 0 && currentMode === 'buyer' && (
              <span className="mode-badge-count">{pendingCount}</span>
            )}
          </button>
          <button
            className={`mode-switch-button ${currentMode === 'seller' ? 'active' : ''}`}
            onClick={() => handleModeChange('seller')}
          >
            <i className="fa-solid fa-laptop-code"></i> Seller Mode
            {pendingCount > 0 && currentMode === 'seller' && (
              <span className="mode-badge-count">{pendingCount}</span>
            )}
          </button>

          <button
            className={`mode-switch-button ${showCancelledDeals ? 'active cancelled-active' : 'cancelled-btn'}`}
            onClick={() => setShowCancelledDeals(!showCancelledDeals)}
          >
            <i className="fa-solid fa-ban"></i> Cancelled ({cancelledDeals.length})
          </button>
        </div>

        {/* Deals Stats */}
        <div className="deals-stats">
          <span className="stat-items total">📊 Total: {totalDeals}</span>
          <span className="stat-items pending">⏳ Pending: {pendingCount}</span>
          <span className="stat-items active">⚡ Active: {activeCount}</span>
          <span className="stat-items overdue">🔴 Overdue: {overdueCount}</span>
          <span className="stat-items completed">✅ Completed: {completedCount}</span>
          <span className="stat-items cancelled">❌ Cancelled: {cancelledDeals.length}</span>
        </div>

        {/* Specific Deal Selected */}
        {dealId && selectedDeal ? (
          <>
            <div className="dash-header">
              <div className="project-meta">
                <button className="back-to-list" onClick={() => navigate('/deal-manager')}>
                  <i className="fa-solid fa-arrow-left"></i> Back
                </button>

                <div className="deal-title-section">
                  <h2>{selectedDeal.postTitle || 'Deal Dashboard'}</h2>

                  <div className="deal-partner-info">
                    <span className="partner-label">
                      {currentMode === 'buyer' ? '🤝 Seller' : '🤝 Buyer'}:
                    </span>
                    <span className="partner-name">
                      {currentMode === 'buyer'
                        ? (selectedDeal.sellerName || selectedDeal.sellerDisplayName || 'Unknown Seller')
                        : (selectedDeal.buyerName || selectedDeal.buyerDisplayName || 'Unknown Buyer')}
                    </span>
                  </div>

                  <div className="deal-id-display">
                    <span className="deal-id-label">Deal ID:</span>
                    <span className="deal-id-number">
                      #{selectedDeal.dealIdNumber || selectedDeal.id?.slice(-8)}
                    </span>
                    <button className="copy-id-btn" onClick={() => {
                      navigator.clipboard.writeText(selectedDeal.dealIdNumber || selectedDeal.id);
                      feedback.alert.success({ message: '✅ Deal ID copied!' });
                    }}>
                      <i className="fa-regular fa-copy"></i>
                    </button>
                  </div>
                </div>

                <span className={`mode-badge ${selectedDeal.status}`}>
                  {getDealStatusBadge(selectedDeal.status).text}
                </span>
                {(selectedDeal.status === 'active' || selectedDeal.status === 'overdue') && timeRemaining[selectedDeal.id] && (
                  <span className="timer-badge">
                    <i className="fa-solid fa-clock"></i> {timeRemaining[selectedDeal.id]}
                  </span>
                )}
              </div>
            </div>

            {/* ✅ Dispute Banner (blocks other actions while open) */}
            {selectedDeal.disputeStatus === 'open' && (
              <div className="dispute-banner open">
                <i className="fa-solid fa-scale-balanced"></i>
                <div>
                  <h4>⚖️ Dispute Under Admin Review</h4>
                  <p>
                    {selectedDeal.disputeRaisedBy === currentUser?.uid
                      ? 'আপনি এই ডিলে Dispute ওপেন করেছেন।'
                      : `${currentMode === 'buyer' ? 'Seller' : 'Buyer'} এই ডিলে Dispute ওপেন করেছেন।`}
                  </p>
                  <p className="extension-details"><strong>কারণ:</strong> {selectedDeal.disputeReason}</p>
                  <p className="extension-hint">
                    <i className="fa-solid fa-info-circle"></i> Admin সিদ্ধান্ত না দেওয়া পর্যন্ত Extend/Cancel বন্ধ থাকবে।
                  </p>
                </div>
              </div>
            )}

            {/* ✅ Overdue Banner — Extend / Cancel / Dispute */}
            {selectedDeal.status === 'overdue' && selectedDeal.disputeStatus !== 'open' && (
              <div className="overdue-banner">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <div>
                  <h4>🔴 এই ডিলটি Overdue!</h4>
                  <p>ডেডলাইন এবং ২৪ ঘণ্টার Grace Period দুটোই পার হয়ে গেছে। এখন কী করতে চান?</p>
                </div>
                <div className="overdue-action-btns" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {selectedDeal.extensionRequestStatus !== 'pending' && (
                    <button className="btn-agree" onClick={handleExtendDeadline}>
                      <i className="fa-solid fa-clock"></i> Extend Deadline
                    </button>
                  )}
                  {!selectedDeal.cancelRequestedBy && (
                    <button className="btn-reject" onClick={handleCancelDeal}>
                      <i className="fa-solid fa-ban"></i> Cancel Deal
                    </button>
                  )}
                  <button className="btn-dispute" onClick={handleOpenDispute} style={{ backgroundColor: '#f59e0b', color: '#111' }}>
                    <i className="fa-solid fa-scale-balanced"></i> Open Dispute
                  </button>
                </div>
              </div>
            )}

            {/* ✅ Extension Request Banner */}
            {selectedDeal.extensionRequestStatus === 'pending' && (
              <div className="extension-request-banner pending">
                <i className="fa-solid fa-clock"></i>
                <div>
                  <h4>📅 Deadline Extension Request Pending</h4>
                  <p>
                    {selectedDeal.extensionRequestedBy === currentUser?.uid
                      ? `⏳ Waiting for ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} to respond...`
                      : `${selectedDeal.extensionRequestedByName || 'Someone'} has requested to extend the deadline by ${selectedDeal.extensionRequestDays || 0} days.`}
                  </p>
                  <p className="extension-details">
                    <strong>Current Deadline:</strong> {selectedDeal.deadline} days &nbsp;|&nbsp;
                    <strong>New Deadline:</strong> {(selectedDeal.deadline || 0) + (selectedDeal.extensionRequestDays || 0)} days
                  </p>
                </div>
                {selectedDeal.extensionRequestedBy !== currentUser?.uid && (
                  <div className="extension-response-btns">
                    <button className="btn-agree" onClick={() => handleExtensionResponse('approve')}>
                      <i className="fa-solid fa-check"></i> Approve
                    </button>
                    <button className="btn-reject" onClick={() => handleExtensionResponse('reject')}>
                      <i className="fa-solid fa-times"></i> Reject
                    </button>
                  </div>
                )}
                {selectedDeal.extensionRequestedBy === currentUser?.uid && (
                  <span className="pending-waiting">
                    <i className="fa-solid fa-hourglass-half"></i> Waiting for response...
                  </span>
                )}
              </div>
            )}

            {/* ✅ Extension Approved Banner */}
            {selectedDeal.extensionRequestStatus === 'approved' && (
              <div className="extension-request-banner approved">
                <i className="fa-solid fa-check-circle"></i>
                <div>
                  <h4>✅ Deadline Extended!</h4>
                  <p>
                    Deadline has been extended by {selectedDeal.extensionRequestDays || 0} days.
                    <br />
                    <strong>New Deadline:</strong> {selectedDeal.deadline} days
                    <br />
                    <strong>Extensions used:</strong> {selectedDeal.extensionCount || 0}/{MAX_EXTENSIONS}
                  </p>
                </div>
              </div>
            )}

            {/* ✅ Extension Rejected Banner */}
            {selectedDeal.extensionRequestStatus === 'rejected' && (
              <div className="extension-request-banner rejected">
                <i className="fa-solid fa-times-circle"></i>
                <div>
                  <h4>❌ Extension Request Rejected</h4>
                  <p>
                    The extension request was rejected by the other party.
                    <br />
                    <strong>Current Deadline:</strong> {selectedDeal.deadline} days
                  </p>
                  <button className="btn-dismiss" onClick={() => {
                    setSelectedDeal(prev => ({
                      ...prev,
                      extensionRequestStatus: null
                    }));
                  }}>
                    <i className="fa-solid fa-times"></i> Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Cancellation Request Banner */}
            {selectedDeal.cancelRequestStatus === 'pending' && (
              <div className="cancel-request-banner pending">
                <i className="fa-solid fa-clock"></i>
                <div>
                  <h4>Cancellation Request Pending</h4>
                  <p>
                    {selectedDeal.cancelRequestedBy === currentUser?.uid
                      ? `Waiting for ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} to respond...`
                      : `The ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} has requested to cancel this deal.`}
                  </p>
                  <p className="cancel-reason"><strong>Reason:</strong> {selectedDeal.cancelReason || 'No reason provided'}</p>
                </div>
                {selectedDeal.cancelRequestedBy !== currentUser?.uid && (
                  <div className="cancel-response-btns">
                    <button className="btn-agree" onClick={() => handleCancelResponse('approve')}>
                      <i className="fa-solid fa-check"></i> Agree to Cancel
                    </button>
                    <button className="btn-reject" onClick={() => handleCancelResponse('reject')}>
                      <i className="fa-solid fa-times"></i> Reject
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Extend Deadline - Request Button (normal active state, not overdue) */}
            {selectedDeal.status === 'active' &&
             selectedDeal.disputeStatus !== 'open' &&
             selectedDeal.extensionRequestStatus !== 'pending' && (
              <div className="extend-deadline-section">
                <button
                  className="btn-extend-deadline"
                  onClick={handleExtendDeadline}
                  disabled={(selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS}
                >
                  <i className="fa-solid fa-clock"></i>
                  {(selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS
                    ? '🚫 Extension Limit Reached'
                    : 'Request Deadline Extension'}
                </button>
                <p className="extension-hint">
                  <i className="fa-solid fa-info-circle"></i>
                  Your request must be approved by the other party.
                  &nbsp;({selectedDeal.extensionCount || 0}/{MAX_EXTENSIONS} used)
                </p>
              </div>
            )}

            {/* Deal Info */}
            <div className="deal-info-card">
              <div className="deal-info-row">
                <span><i className="fa-solid fa-hashtag"></i> Deal ID:</span>
                <strong className="deal-id-highlight">
                  #{selectedDeal.dealIdNumber || selectedDeal.id?.slice(-8)}
                </strong>
              </div>

              <div className="deal-info-row partner-row">
                <span><i className="fa-solid fa-user"></i> {currentMode === 'buyer' ? 'Seller' : 'Buyer'}:</span>
                <strong>
                  {currentMode === 'buyer'
                    ? (selectedDeal.sellerName || selectedDeal.sellerDisplayName || 'Unknown Seller')
                    : (selectedDeal.buyerName || selectedDeal.buyerDisplayName || 'Unknown Buyer')}
                </strong>
              </div>

              <div className="deal-info-row">
                <span><i className="fa-solid fa-wallet"></i> Total Budget:</span>
                <strong>{selectedDeal.budget?.toLocaleString()} BDT</strong>
              </div>
              <div className="deal-info-row">
                <span><i className="fa-regular fa-calendar"></i> Deadline:</span>
                <strong>{selectedDeal.deadline} Days</strong>
              </div>
              {(selectedDeal.status === 'active' || selectedDeal.status === 'overdue') && (
                <div className="deal-info-row">
                  <span><i className="fa-solid fa-clock"></i> Time Remaining:</span>
                  <strong className="timer-display">
                    {timeRemaining[selectedDeal.id] || 'Calculating...'}
                  </strong>
                </div>
              )}
              <div className="deal-info-row">
                <span><i className="fa-solid fa-file-lines"></i> Details:</span>
                <p>{selectedDeal.details || 'No details provided'}</p>
              </div>
            </div>

            {/* Milestones */}
            {renderMilestones()}

            {/* Cancel Button (normal states) */}
            {(selectedDeal.status === 'pending' || selectedDeal.status === 'active') &&
             selectedDeal.disputeStatus !== 'open' &&
             !selectedDeal.cancelRequestedBy && (
              <div className="cancel-deal-section">
                <button className="btn-cancel-deal" onClick={handleCancelDeal}>
                  <i className="fa-solid fa-ban"></i> Request Cancellation
                </button>
                <p className="cancel-warning">
                  <i className="fa-solid fa-info-circle"></i>
                  Your request must be approved by the other party.
                </p>
              </div>
            )}

          </>
        ) : (
          // Deal List
          <div className="deals-list">
            {showCancelledDeals ? (
              cancelledDeals.length === 0 ? (
                <div className="no-deal-selected">
                  <i className="fa-solid fa-check-circle"></i>
                  <p>No cancelled deals</p>
                </div>
              ) : (
                cancelledDeals.map(deal => (
                  <div key={deal.id} className="deal-list-item cancelled" onClick={() => navigate(`/deal-manager?dealId=${deal.id}`)}>
                    <div className="deal-list-info">
                      <h4>
                        {deal.postTitle || 'Untitled Deal'}
                        <span className="deal-id-badge">#{deal.dealIdNumber || deal.id?.slice(-8)}</span>
                      </h4>
                      <p className="deal-partner cancelled">
                        <i className="fa-solid fa-user"></i>
                        {currentMode === 'buyer' ? 'Seller' : 'Buyer'}: <strong>
                          {currentMode === 'buyer'
                            ? (deal.sellerName || deal.sellerDisplayName || 'Unknown Seller')
                            : (deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer')}
                        </strong>
                      </p>
                      <p>
                        <i className="fa-solid fa-ban" style={{color: '#ef4444'}}></i>
                        {deal.cancellationReason || 'No reason provided'}
                      </p>
                      <p className="deal-cancelled-date">
                        <i className="fa-regular fa-calendar"></i>
                        {deal.cancelledAt ? new Date(deal.cancelledAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                    <div className="deal-list-status">
                      <span className="status-badge cancelled">❌ Cancelled</span>
                    </div>
                  </div>
                ))
              )
            ) : (
              activeDeals.length === 0 ? (
                <div className="no-deal-selected">
                  <i className="fa-solid fa-folder-open"></i>
                  <p>You don't have any {currentMode === 'buyer' ? 'buyer' : 'seller'} deals yet.</p>
                </div>
              ) : (
                activeDeals.map(deal => (
                  <div key={deal.id} className="deal-list-item" onClick={() => navigate(`/deal-manager?dealId=${deal.id}`)}>
                    <div className="deal-list-info">
                      <h4>
                        {deal.postTitle || 'Untitled Deal'}
                        <span className="deal-id-badge">#{deal.dealIdNumber || deal.id?.slice(-8)}</span>
                      </h4>
                      <p className="deal-partner">
                        <i className="fa-solid fa-user"></i>
                        {currentMode === 'buyer' ? 'Seller' : 'Buyer'}: <strong>
                          {currentMode === 'buyer'
                            ? (deal.sellerName || deal.sellerDisplayName || 'Unknown Seller')
                            : (deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer')}
                        </strong>
                      </p>
                      <p>Budget: {deal.budget?.toLocaleString()} BDT</p>
                      {(deal.status === 'active' || deal.status === 'overdue') && timeRemaining[deal.id] && (
                        <p className="deal-timer">
                          <i className="fa-solid fa-clock"></i> {timeRemaining[deal.id]}
                        </p>
                      )}
                    </div>
                    <div className="deal-list-status">
                      <span className={`status-badge ${deal.status}`}>
                        {deal.status === 'pending' && '⏳ Pending'}
                        {deal.status === 'active' && '⚡ Active'}
                        {deal.status === 'overdue' && '🔴 Overdue'}
                        {deal.status === 'completed' && '✅ Completed'}
                      </span>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DealManager;