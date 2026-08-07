// DealManager.jsx - NotificationProvider Fully Integrated
// 2-Person Confirmation + Overdue/Grace Period + Dispute + Extension Limit
// + Escrow-based Money Flow (balance lock/unlock at deal activation)
//
// ⚠️ IMPORTANT (read before deploying):
// - Auto-Complete after buyer inactivity (72h/5days) and scheduled reminders
//   (48h/24h/6h/1h before deadline) CANNOT be reliably done from this client
//   component — they need a server-side cron (Firebase Cloud Functions +
//   Cloud Scheduler). This file only handles what's possible/safe from the
//   client: real-time overdue detection while a user has the page open, and
//   a manual "Open Dispute" flow.
// - Trust Score / Late-Delivery % must be computed server-side (Cloud
//   Function) — never trust the client to write its own trust score.
// - Add these keys to NOTIFICATION_EVENTS (NotificationEvents.js) if not
//   already present: DEAL_OVERDUE, DISPUTE_OPENED
//
// 💰 MONEY FLOW (read this before touching wallet-related code):
// 1. Deal becomes ACTIVE (offer accepted) → buyer's available balance
//    (balance - lockedBalance) is checked against the full deal budget.
//    If enough, the ENTIRE budget is locked: wallets/{buyerId}.lockedBalance
//    += budget. This blocks the buyer from withdrawing money that's
//    committed to this deal. If not enough, the deal CANNOT be activated.
// 2. Buyer funds a milestone ("Pay & Fund", in PaymentGateway.jsx):
//    buyer.balance -= amount AND buyer.lockedBalance -= amount (the money
//    leaves the buyer's wallet entirely and sits in escrow — it is NOT
//    credited to the seller yet). Milestone status: pending -> funded.
// 3. Seller submits work ("Submit Work"): milestone status: funded -> review.
//    Sellers can only submit work AFTER a milestone is funded — this is
//    enforced by the button only appearing for status === 'funded'.
// 4. Buyer reviews and releases ("Release Payment", in DealManager.jsx):
//    THIS is the only place seller.balance actually increases. Milestone
//    status: review -> released.
// 5. Deal is marked 'completed' only when ALL milestones are 'released' —
//    never when they are merely 'funded'.
// 6. Deal cancellation (2-person approval) is only allowed while NO
//    milestone has been funded/released yet (hasPayment guard). On
//    approval, the full locked budget is released back to the buyer
//    (wallets/{buyerId}.lockedBalance -= budget) since none of it has
//    actually left the buyer's wallet.
// 7. Your Withdraw.jsx / send-money flow (not included here) MUST check
//    `balance - lockedBalance` as the withdrawable amount, not raw
//    `balance` — otherwise a buyer could still withdraw money that's
//    committed to an active deal.

import React, { useState, useEffect } from 'react';
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

// ============================================================
// ✅ Constants
// ============================================================
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_EXTENSIONS = 3;
const EXTENSION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

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
 * FULL budget locked and NO milestone funded/released — that invariant is
 * enforced by handleCancelDeal's hasPayment guard before a cancellation
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
  const [markingOverdue, setMarkingOverdue] = useState(false);

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
  // ✅ ✅ ✅ Submit Work for Review (Seller)
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

      // ✅ Send notification to BUYER
      notification.notify({
        event: NOTIFICATION_EVENTS.MILESTONE_REVIEW,
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

      // ✅ Send chat message
      await sendDealChatMessage(
        selectedDeal.chatId,
        `📤 **Work Submitted for Review**\n\n${currentUser?.displayName || 'Someone'} has submitted work for milestone **"${milestone.title}"**.\n\n💰 Amount: ${milestone.amount} BDT\n\n⏳ Waiting for Buyer's review...`
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
  // ✅ ✅ ✅ Release Payment (Buyer) - real wallet transaction
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
      title: '💰 Release Payment',
      message: `Are you sure you want to release ${milestone.amount} BDT for "${milestone.title}"?\n\nThis will transfer the payment to the seller.`,
      confirmText: 'Yes, Release',
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
          `✅ **Payment Released!**\n\n${currentUser?.displayName || 'Someone'} has released payment for milestone **"${milestone.title}"**.\n\n💰 Amount: ${milestone.amount} BDT\n\n📊 ${updatedMilestones.filter(m => m.status === 'released').length}/${updatedMilestones.length} milestones completed.`
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
  // ✅ Confirm Deal
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

      notification.notify({
        event: NOTIFICATION_EVENTS.DEAL_CONFIRMED,
        data: {
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

    const hasPayment = selectedDeal.milestones?.some(m => m.status === 'funded' || m.status === 'released');
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
          await deleteDoc(dealRef);
          setDeals(prev => prev.filter(d => d.id !== selectedDeal.id));
          setSelectedDeal(null);
          navigate('/deal-manager');
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
                <button className="btn-confirm-deal" onClick={handleConfirmDeal}>
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
                <button className="btn-confirm-deal" onClick={handleConfirmDeal}>
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
        </div>
      )}

      {selectedDeal.milestones.map((milestone, index) => {
        const statusBadge = getMilestoneStatusBadge(milestone.status);

        return (
          <div key={milestone.id} className={`milestone-row ${milestone.status}`}>
            <div className="m-info-block">
              <div className="m-number">{String(index + 1).padStart(2, '0')}</div>
              <div className="m-details">
                <h4>{milestone.title}</h4>
                <p className="m-amount">💰 Amount: {milestone.amount?.toLocaleString()} BDT</p>
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
                <button
                  className="btn-review-release"
                  onClick={() => handleReleasePayment(milestone.id)}
                  disabled={releasingPayment === milestone.id}
                >
                  {releasingPayment === milestone.id ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> Releasing...</>
                  ) : (
                    <><i className="fa-solid fa-money-bill-wave"></i> Review & Release</>
                  )}
                </button>
              )}

              {/* ── Seller Actions ── */}
              {isActive && isSeller && milestone.status === 'funded' && (
                <button
                  className="btn-submit-work"
                  onClick={() => handleSubmitWork(milestone.id)}
                  disabled={submittingMilestone === milestone.id}
                >
                  {submittingMilestone === milestone.id ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> Submitting...</>
                  ) : (
                    <><i className="fa-solid fa-upload"></i> Submit Work</>
                  )}
                </button>
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