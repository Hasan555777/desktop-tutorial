// dealManager.hooks.js
// Every React hook the Deal Manager needs, merged into one file:
//   - useDealsList / useSelectedDeal    (data loading)
//   - useDeadlineCountdown              (per-deal countdown display)
//   - useDealBackgroundSweep            (offer-expiry + auto-refund sweep)
//   - useDealGuide                      (the "read the rules" popup wrapper)
//   - useDealActions                    (every handleX mutation)

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, addDoc, deleteDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/firebase';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';
import { MAX_EXTENSIONS, EXTENSION_COOLDOWN_MS, GRACE_PERIOD_MS, BACKGROUND_SWEEP_INTERVAL_MS, OFFER_EXPIRY_MS, SUBMIT_DEADLINE_AFTER_FUND_MS, formatDeadlineDisplay } from '@/constants/dealManager.constants';
import { activateDealWithEscrowLock, cancelDealWithEscrowRelease, sendDealChatMessage, deleteCancelNotifications, notifyBothParties, markDealOverdue, markOfferExpired, autoRefundMilestone } from '@/utils/dealManager.utils';
import { logError } from '@/utils/logger';

// ============================================================
// ✅ RESOLVED — deadline unit mismatch (was flagged, now confirmed + fixed)
//
// chatHelpers.js's sendProposal converts the offer form's raw minutes
// input to whole days exactly once, at deal-creation time
// (`Math.ceil(minutesInput / 1440)`), and that day count is what's stored
// as `deal.deadline`. So `deadline` is consistently DAYS everywhere in
// this file:
//   - useDeadlineCountdown's `setDate(getDate() + deadlineDays)` below was
//     already correct.
//   - handleExtensionResponse's `selectedDeal.deadline + extraDays` below
//     is also correct (both operands are days) — no conversion needed.
//   - The bug was in formatDeadlineDisplay (constants.js), which used to
//     mis-interpret a days value as minutes for any deadline under 1440 —
//     i.e. almost every real deadline. That's fixed directly in
//     dealManager.constants.js now; nothing in this file needed to change
//     for the underlying math, only the confusing "মিনিট/দিন" wording in
//     the extension prompts below, cleaned up to just say "দিন".
// ============================================================

// ============================================================
// Data loading: deals list + single selected deal
// ============================================================

export const useDealsList = (currentUser, currentMode) => {
  const [deals, setDeals] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) return;

    setLoadingList(true);
    const userField = currentMode === 'buyer' ? 'buyerId' : 'sellerId';
    const dealsRef = collection(db, 'deals');
    const q = query(dealsRef, where(userField, '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedDeals = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setDeals(fetchedDeals);
        setLoadingList(false);
      },
      (error) => {
        logError('Error loading deals', error);
        setLoadingList(false);
      }
    );

    return () => unsubscribe();
  }, [currentMode, currentUser?.uid]);

  return { deals, setDeals, loadingList };
};

export const useSelectedDeal = (dealId) => {
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [loadingDeal, setLoadingDeal] = useState(true);

  useEffect(() => {
    const fetchDeal = async () => {
      if (!dealId) {
        setSelectedDeal(null);
        setLoadingDeal(false);
        return;
      }

      setLoadingDeal(true);
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
        logError('Error fetching deal', error);
        setSelectedDeal(null);
      }
      setLoadingDeal(false);
    };
    fetchDeal();
  }, [dealId]);

  return { selectedDeal, setSelectedDeal, loadingDeal };
};

// ============================================================
// Timers: countdown display + background sweep
// ============================================================

export const useDeadlineCountdown = (selectedDeal, setSelectedDeal, notification) => {
  const [timeRemaining, setTimeRemaining] = useState({});

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

      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeRemaining((prev) => ({ ...prev, [selectedDeal.id]: `${days}d ${hours}h ${minutes}m` }));
        return;
      }

      const graceDiff = graceDeadline - now;
      if (graceDiff > 0 && selectedDeal.status === 'active') {
        const hours = Math.floor(graceDiff / (1000 * 60 * 60));
        const minutes = Math.floor((graceDiff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeRemaining((prev) => ({ ...prev, [selectedDeal.id]: `⏳ Grace Period: ${hours}h ${minutes}m left` }));
        return;
      }

      setTimeRemaining((prev) => ({ ...prev, [selectedDeal.id]: '🔴 Overdue' }));

      if (selectedDeal.status === 'active' && !selectedDeal.overdueMarkedAt) {
        markDealOverdue(selectedDeal, { notification, setSelectedDeal });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
    // `overdueMarkedAt` is intentionally included: without it, once a deal
    // goes overdue this effect's setInterval closure keeps its original
    // (pre-mark) snapshot of `selectedDeal` forever, so the
    // `!selectedDeal.overdueMarkedAt` check above never sees the update and
    // markDealOverdue() could get invoked every 60s indefinitely instead of
    // exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeal?.id, selectedDeal?.status, selectedDeal?.deadline, selectedDeal?.startedAt, selectedDeal?.overdueMarkedAt]);

  return timeRemaining;
};

// Background sweep across every loaded deal: expires unanswered offers and
// auto-refunds milestones whose submission deadline passed.
export const useDealBackgroundSweep = (deals, notification, setSelectedDeal, selectedDealId) => {
  useEffect(() => {
    if (!deals || deals.length === 0) return;

    const runSweep = () => {
      const now = Date.now();

      deals.forEach((deal) => {
        // --- Offer expiry ---
        if (deal.status === 'pending' && !deal.offerExpired) {
          const proposedAtRaw = deal.proposedAt || deal.createdAt;
          const proposedAtMs = proposedAtRaw?.toDate ? proposedAtRaw.toDate().getTime() : proposedAtRaw ? new Date(proposedAtRaw).getTime() : null;
          if (proposedAtMs && now - proposedAtMs > OFFER_EXPIRY_MS) {
            markOfferExpired(deal, { notification, setSelectedDeal, selectedDealId });
          }
        }

        // --- Funded-milestone submission deadline ---
        if ((deal.status === 'active' || deal.status === 'overdue') && Array.isArray(deal.milestones)) {
          deal.milestones.forEach((m) => {
            if (m.status !== 'funded' || !m.fundedAt) return;
            const fundedAtMs = new Date(m.fundedAt).getTime();
            if (now - fundedAtMs > SUBMIT_DEADLINE_AFTER_FUND_MS) {
              autoRefundMilestone(deal, m, { notification, setSelectedDeal, selectedDealId });
            }
          });
        }
      });
    };

    runSweep();
    const interval = setInterval(runSweep, BACKGROUND_SWEEP_INTERVAL_MS);
    return () => clearInterval(interval);
    // `selectedDealId` is intentionally included: markOfferExpired/
    // autoRefundMilestone use it to decide whether to also patch the
    // currently-viewed deal's local state. Without it in the deps, viewing
    // a different deal wouldn't update this effect's closure, and the
    // sweep would keep applying that logic against whichever deal was
    // selected when the effect first ran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, selectedDealId]);
};

// ============================================================
// Guide-popup wrapper
// ============================================================

export const useDealGuide = () => {
  const [showGuideModal, setShowGuideModal] = useState(false);
  const guideActionRef = useRef(null);

  const runWithGuide = useCallback((actionFn) => {
    guideActionRef.current = actionFn;
    setShowGuideModal(true);
  }, []);

  const handleGuideConfirm = useCallback(() => {
    setShowGuideModal(false);
    const action = guideActionRef.current;
    guideActionRef.current = null;
    if (action) action();
  }, []);

  const handleGuideCancel = useCallback(() => {
    setShowGuideModal(false);
    guideActionRef.current = null;
  }, []);

  return { showGuideModal, runWithGuide, handleGuideConfirm, handleGuideCancel };
};

// ============================================================
// Every deal mutation handler
// ============================================================

export const useDealActions = ({ selectedDeal, setSelectedDeal, setDeals, currentUser, currentMode, feedback, notification, navigate }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [submittingMilestone, setSubmittingMilestone] = useState(null);
  const [releasingPayment, setReleasingPayment] = useState(null);
  const [rejectingWork, setRejectingWork] = useState(null);
  const [openSubmitForm, setOpenSubmitForm] = useState(null);
  const [workDraft, setWorkDraft] = useState({});

  const parties = () => ({ buyerId: selectedDeal.buyerId, sellerId: selectedDeal.sellerId });

  // ── Extend Deadline (request) ──────────────────────────────────────
  const handleExtendDeadline = async () => {
    if (!selectedDeal || (selectedDeal.status !== 'active' && selectedDeal.status !== 'overdue')) {
      feedback.alert.warning({ message: 'শুধুমাত্র অ্যাক্টিভ বা ওভারডিউ ডিলের ডেডলাইন বাড়ানো যায়!' });
      return;
    }
    if (selectedDeal.disputeStatus === 'open') {
      feedback.alert.warning({ message: 'এই ডিলে একটি Dispute চলমান আছে। Admin সিদ্ধান্তের অপেক্ষা করুন।' });
      return;
    }
    if (selectedDeal.extensionRequestStatus === 'pending') {
      feedback.alert.warning({ message: 'একটি এক্সটেনশন রিকোয়েস্ট ইতিমধ্যে পেন্ডিং আছে!' });
      return;
    }
    if ((selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS) {
      feedback.alert.error({ message: `⚠️ সর্বোচ্চ ${MAX_EXTENSIONS} বার ডেডলাইন বাড়ানো হয়ে গেছে। এখন আর Extend করা যাবে না — Dispute ওপেন করুন বা ডিল ক্যানসেল করুন।` });
      return;
    }
    if (selectedDeal.extensionRequestedBy === currentUser?.uid) {
      feedback.alert.warning({ message: 'আপনি ইতিমধ্যে একটি রিকোয়েস্ট পাঠিয়েছেন!' });
      return;
    }
    const lastExtended = selectedDeal.extendedAt ? new Date(selectedDeal.extendedAt) : null;
    if (lastExtended && Date.now() - lastExtended.getTime() < EXTENSION_COOLDOWN_MS) {
      feedback.alert.warning({ message: 'গত ২৪ ঘন্টার মধ্যে ডেডলাইন বাড়ানো হয়েছে! একটু পরে আবার চেষ্টা করুন।' });
      return;
    }

    const isBuyer = currentMode === 'buyer';
    const otherParty = isBuyer ? 'Seller' : 'Buyer';
    const remaining = MAX_EXTENSIONS - (selectedDeal.extensionCount || 0);

    const confirmed = await feedback.confirm({
      title: '📅 ডেডলাইন বাড়ানোর অনুরোধ',
      message: `আপনি কি ডেডলাইন বাড়ানোর জন্য ${otherParty}-এর কাছে অনুরোধ করতে চান?\n\nবর্তমান ডেডলাইন: ${formatDeadlineDisplay(selectedDeal.deadline)}বাকি Extension সুযোগ: ${remaining}/${MAX_EXTENSIONS}`,
      confirmText: 'হ্যাঁ, অনুরোধ করুন',
      cancelText: 'না',
      variant: 'info',
    });
    if (!confirmed) return;

    const extraDays = await feedback.prompt({
      title: '📅 কত দিন বাড়াতে চান?',
      message: `বর্তমান ডেডলাইন: ${formatDeadlineDisplay(selectedDeal.deadline)} \n\nকত দিন বাড়াতে চান? (১-৩০ দিন)`,
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
        updatedAt: serverTimestamp(),
      });

      setSelectedDeal((prev) => ({
        ...prev,
        extensionRequestedBy: currentUser?.uid,
        extensionRequestedByName: currentUser?.displayName || 'Someone',
        extensionRequestedAt: new Date().toISOString(),
        extensionRequestDays: days,
        extensionRequestStatus: 'pending',
      }));

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
        },
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `📅 **Deadline Extension Requested**\n\n${currentUser?.displayName || 'Someone'} has requested to extend the deadline by **${days} days**.\n\n📌 Current Deadline: ${selectedDeal.deadline} days\n⏳ New Deadline would be: ${selectedDeal.deadline + days} days\n\nPlease respond to this request.`
      );

      feedback.alert.success({ message: `✅ ডেডলাইন বাড়ানোর অনুরোধ ${otherParty}-এর কাছে পাঠানো হয়েছে!` });
    } catch (error) {
      logError('Error requesting extension', error);
      feedback.alert.error({ message: 'ডেডলাইন বাড়ানোর অনুরোধ পাঠাতে ব্যর্থ হয়েছে।' });
    }
  };

  // ── Submit Work (Seller) ───────────────────────────────────────────
  const handleSubmitWork = async (milestoneId) => {
    if (!selectedDeal) return;
    const milestone = selectedDeal.milestones.find((m) => m.id === milestoneId);
    if (!milestone || milestone.status !== 'funded') {
      feedback.alert.warning({ message: 'This milestone is not funded yet!' });
      return;
    }
    if (currentUser?.uid !== selectedDeal.sellerId) {
      feedback.alert.warning({ message: 'Only the seller can submit work!' });
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
      variant: 'success',
    });
    if (!confirmed) return;

    setSubmittingMilestone(milestoneId);
    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      const updatedMilestones = selectedDeal.milestones.map((m) =>
        m.id === milestoneId
          ? { ...m, status: 'review', workSubmittedAt: new Date().toISOString(), submittedBy: currentUser?.uid, workProofLink: proofLink || null, workProofNote: proofNote || null }
          : m
      );

      await updateDoc(dealRef, { milestones: updatedMilestones, updatedAt: serverTimestamp() });
      setSelectedDeal((prev) => ({ ...prev, milestones: updatedMilestones }));

      setWorkDraft((prev) => {
        const next = { ...prev };
        delete next[milestoneId];
        return next;
      });
      setOpenSubmitForm(null);

      notifyBothParties(notification, NOTIFICATION_EVENTS.MILESTONE_SUBMITTED, parties(), {
        dealId: selectedDeal.id,
        postTitle: selectedDeal.postTitle || 'Untitled Deal',
        milestoneTitle: milestone.title,
        amount: milestone.amount,
        requesterName: currentUser?.displayName || 'Someone',
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `📤 **Work Submitted for Review**\n\n${currentUser?.displayName || 'Someone'} has submitted work for milestone **"${milestone.title}"**.\n\n💰 Amount: ${milestone.amount} BDT` +
          (proofLink ? `\n🔗 Proof: ${proofLink}` : '') +
          (proofNote ? `\n📝 Note: ${proofNote}` : '') +
          `\n\n⏳ Waiting for Buyer's review...`
      );

      feedback.alert.success({ message: `✅ Work submitted for "${milestone.title}"! Waiting for buyer review.` });
    } catch (error) {
      logError('Error submitting work', error);
      feedback.alert.error({ message: 'Failed to submit work. Please try again.' });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  // ── Reject Work (Buyer) ────────────────────────────────────────────
  const handleRejectWork = async (milestoneId) => {
    if (!selectedDeal) return;
    const milestone = selectedDeal.milestones.find((m) => m.id === milestoneId);
    if (!milestone || milestone.status !== 'review') {
      feedback.alert.warning({ message: 'This milestone is not under review!' });
      return;
    }
    if (currentUser?.uid !== selectedDeal.buyerId) {
      feedback.alert.warning({ message: 'Only the buyer can reject submitted work!' });
      return;
    }

    const reason = await feedback.prompt({
      title: '❌ কাজ প্রত্যাখ্যান করুন',
      message: 'কেন কাজটি প্রত্যাখ্যান করছেন তা লিখুন — সেলার এটা দেখে সংশোধন করে আবার জমা দিতে পারবে।',
      placeholder: 'কারণ লিখুন...',
      confirmText: 'জমা দিন',
      cancelText: 'বাতিল',
      inputType: 'text',
    });
    if (!reason || reason.trim() === '') {
      feedback.alert.warning({ message: 'প্রত্যাখ্যানের কারণ আবশ্যক!' });
      return;
    }

    setRejectingWork(milestoneId);
    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      // Reset fundedAt to now so the seller gets a FULL fresh submission
      // window — without this, a rejection close to the original 7-day
      // mark could get the milestone auto-refunded before the seller has
      // a fair chance to fix and resubmit.
      const updatedMilestones = selectedDeal.milestones.map((m) =>
        m.id === milestoneId
          ? {
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
            }
          : m
      );

      await updateDoc(dealRef, { milestones: updatedMilestones, updatedAt: serverTimestamp() });
      setSelectedDeal((prev) => ({ ...prev, milestones: updatedMilestones }));

      notifyBothParties(notification, NOTIFICATION_EVENTS.MILESTONE_REJECTED, parties(), {
        dealId: selectedDeal.id,
        postTitle: selectedDeal.postTitle || 'Untitled Deal',
        milestoneTitle: milestone.title,
        reason: reason.trim(),
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `❌ **Work Rejected**\n\n${currentUser?.displayName || 'Someone'} rejected the submitted work for **"${milestone.title}"**.\n\n📝 Reason: ${reason.trim()}\n\n🔁 Seller has a fresh 7-day window to fix and resubmit.`
      );

      feedback.alert.warning({ message: 'কাজ প্রত্যাখ্যান করা হয়েছে। সেলারকে জানানো হয়েছে।' });
    } catch (error) {
      logError('Error rejecting work', error);
      feedback.alert.error({ message: 'Failed to reject work. Please try again.' });
    } finally {
      setRejectingWork(null);
    }
  };

  // ── Release Payment / Accept Work (Buyer) ──────────────────────────
  //
  // CRITICAL FIX: this used to compute `updatedMilestones` from the
  // component's `selectedDeal.milestones` state (a snapshot from whenever
  // the deal was last loaded/updated locally) and write it straight into
  // `transaction.update(dealRef, ...)` WITHOUT first calling
  // `transaction.get(dealRef)`. Firestore transactions only protect you
  // against concurrent writes to documents you've actually read inside the
  // transaction — skipping the read meant that if the seller submitted a
  // *different* milestone (or any other deal field changed) in the moment
  // between this page loading and the buyer clicking Release, that other
  // change would be silently clobbered by this write. The deal is now
  // re-read via `transaction.get()` and `updatedMilestones` is derived from
  // that fresh copy, matching the pattern PaymentGateway.jsx already uses.
  const handleReleasePayment = async (milestoneId) => {
    if (!selectedDeal) return;
    const milestone = selectedDeal.milestones.find((m) => m.id === milestoneId);
    if (!milestone || milestone.status !== 'review') {
      feedback.alert.warning({ message: 'This milestone is not ready for review!' });
      return;
    }
    if (currentUser?.uid !== selectedDeal.buyerId) {
      feedback.alert.warning({ message: 'Only the buyer can release payment!' });
      return;
    }

    const confirmed = await feedback.confirm({
      title: '💰 Accept & Release Payment',
      message: `Are you sure you want to accept this work and release ${milestone.amount} BDT for "${milestone.title}"?\n\nThis will transfer the payment to the seller.`,
      confirmText: 'Yes, Accept & Release',
      cancelText: 'Cancel',
      variant: 'success',
    });
    if (!confirmed) return;

    setReleasingPayment(milestoneId);
    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      const buyerWalletRef = doc(db, 'wallets', selectedDeal.buyerId);
      const sellerWalletRef = doc(db, 'wallets', selectedDeal.sellerId);

      let updatedMilestones = null;
      let allReleased = false;

      await runTransaction(db, async (transaction) => {
        const freshDealSnap = await transaction.get(dealRef);
        if (!freshDealSnap.exists()) throw new Error('Deal not found!');
        const freshDeal = freshDealSnap.data();

        const freshMilestone = (freshDeal.milestones || []).find((m) => m.id === milestoneId);
        if (!freshMilestone || freshMilestone.status !== 'review') {
          throw new Error('This milestone is no longer ready for release.');
        }

        const buyerDoc = await transaction.get(buyerWalletRef);
        if (!buyerDoc.exists()) throw new Error('Buyer wallet not found!');

        const sellerDoc = await transaction.get(sellerWalletRef);
        let sellerBalance = 0;
        if (sellerDoc.exists()) sellerBalance = sellerDoc.data().balance || 0;

        updatedMilestones = freshDeal.milestones.map((m) =>
          m.id === milestoneId ? { ...m, status: 'released', releasedAt: new Date().toISOString(), releasedBy: currentUser?.uid } : m
        );
        allReleased = updatedMilestones.every((m) => m.status === 'released');

        const updateData = { milestones: updatedMilestones, updatedAt: serverTimestamp() };
        if (allReleased) {
          updateData.status = 'completed';
          updateData.completedAt = new Date().toISOString();
        }

        // Buyer wallet: already deducted at funding time, no re-deduction here.

        if (sellerDoc.exists()) {
          transaction.update(sellerWalletRef, {
            balance: sellerBalance + milestone.amount,
            totalEarned: (sellerDoc.data().totalEarned || 0) + milestone.amount,
            updatedAt: serverTimestamp(),
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
            updatedAt: serverTimestamp(),
          });
        }

        transaction.update(dealRef, updateData);

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
          milestoneId,
          senderId: selectedDeal.buyerId,
          senderName: selectedDeal.buyerName || 'Buyer',
          transferId: `REL-${Date.now()}`,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        });
      });

      setSelectedDeal((prev) => ({ ...prev, milestones: updatedMilestones, ...(allReleased && { status: 'completed' }) }));

      notifyBothParties(notification, NOTIFICATION_EVENTS.MILESTONE_RELEASED, parties(), {
        dealId: selectedDeal.id,
        postTitle: selectedDeal.postTitle || 'Untitled Deal',
        milestoneTitle: milestone.title,
        amount: milestone.amount,
      });

      if (allReleased) {
        notifyBothParties(notification, NOTIFICATION_EVENTS.DEAL_COMPLETED, parties(), { dealId: selectedDeal.id, postTitle: selectedDeal.postTitle || 'Untitled Deal' });

        await sendDealChatMessage(
          selectedDeal.chatId,
          `🎉 **Deal Completed!**\n\nAll milestones have been completed and payments released.\n\n✅ Deal: ${selectedDeal.postTitle}\n💰 Total Amount: ${selectedDeal.budget} BDT\n\nThank you for working together!`
        );
        feedback.alert.success({ message: '🎉 All milestones completed! Deal is now finished.' });
      } else {
        await sendDealChatMessage(
          selectedDeal.chatId,
          `✅ **Work Accepted — Payment Released!**\n\n${currentUser?.displayName || 'Someone'} has accepted the work and released payment for milestone **"${milestone.title}"**.\n\n💰 Amount: ${milestone.amount} BDT\n\n📊 ${updatedMilestones.filter((m) => m.status === 'released').length}/${updatedMilestones.length} milestones completed.`
        );
        feedback.alert.success({ message: `✅ Payment released for "${milestone.title}"!` });
      }
    } catch (error) {
      logError('Error releasing payment', error);
      feedback.alert.error({ message: error.message || 'Failed to release payment.' });
    } finally {
      setReleasingPayment(null);
    }
  };

  // ── Extension Response (Approve / Reject) ──────────────────────────
  const handleExtensionResponse = async (response) => {
    if (!selectedDeal || selectedDeal.extensionRequestStatus !== 'pending') {
      feedback.alert.warning({ message: 'কোন পেন্ডিং এক্সটেনশন রিকোয়েস্ট নেই!' });
      return;
    }
    if (selectedDeal.extensionRequestedBy === currentUser?.uid) {
      feedback.alert.warning({ message: 'আপনি নিজের রিকোয়েস্ট নিজে রিস্পন্ড করতে পারবেন না!' });
      return;
    }

    const extraDays = selectedDeal.extensionRequestDays || 0;
    // NOTE: see the "KNOWN OPEN ISSUE" comment at the top of this file —
    // this raw addition assumes `extraDays` and `selectedDeal.deadline`
    // are in the same unit, which may not match how deals are created.
    const newDeadline = (selectedDeal.deadline || 0) + extraDays;

    if (response === 'approve') {
      const confirmed = await feedback.confirm({
        title: '✅ ডেডলাইন বাড়ানোর অনুমোদন',
        message: `আপনি কি ডেডলাইন ${extraDays} দিন বাড়ানোর অনুমোদন দিতে চান?\n\n📌 নতুন ডেডলাইন: ${formatDeadlineDisplay(newDeadline)}`,
        confirmText: 'হ্যাঁ, অনুমোদন করুন',
        cancelText: 'না',
        variant: 'success',
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
          updatedAt: serverTimestamp(),
        };
        if (wasOverdue) {
          updatePayload.status = 'active';
          updatePayload.overdueMarkedAt = null;
        }

        await updateDoc(dealRef, updatePayload);

        setSelectedDeal((prev) => ({
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

        const requesterId = selectedDeal.extensionRequestedBy;
        if (requesterId) {
          notification.notify({
            event: NOTIFICATION_EVENTS.DEAL_EXTENDED,
            data: {
              userId: requesterId,
              dealId: selectedDeal.id,
              postTitle: selectedDeal.postTitle || 'Untitled Deal',
              approvedBy: currentUser?.displayName || 'Someone',
              extraDays,
              newDeadline,
              isApproved: true,
            },
          });
        }

        await sendDealChatMessage(
          selectedDeal.chatId,
          `✅ **Deadline Extended!**\n\n${currentUser?.displayName || 'Someone'} has approved the extension request.\n\n📅 New Deadline: **${formatDeadlineDisplay(newDeadline)}**\n📈 Extended by: ${formatDeadlineDisplay(extraDays)}\n🔢 Extensions used: ${newExtensionCount}/${MAX_EXTENSIONS}`
        );

        feedback.alert.success({ message: `✅ ডেডলাইন ${extraDays} দিন বাড়ানো হয়েছে! নতুন ডেডলাইন: ${formatDeadlineDisplay(newDeadline)}` });
      } catch (error) {
        logError('Error approving extension', error);
        feedback.alert.error({ message: 'অনুমোদন দিতে ব্যর্থ হয়েছে।' });
      }
    }

    if (response === 'reject') {
      const confirmed = await feedback.confirm({
        title: '❌ ডেডলাইন বাড়ানোর প্রত্যাখ্যান',
        message: `আপনি কি ডেডলাইন ${extraDays} দিন বাড়ানোর অনুরোধটি প্রত্যাখ্যান করতে চান?`,
        confirmText: 'হ্যাঁ, প্রত্যাখ্যান করুন',
        cancelText: 'না',
        variant: 'warning',
      });
      if (!confirmed) return;

      try {
        const dealRef = doc(db, 'deals', selectedDeal.id);
        await updateDoc(dealRef, {
          extensionRequestStatus: 'rejected',
          extensionRejectedAt: new Date().toISOString(),
          extensionRejectedBy: currentUser?.uid,
          extensionRejectReason: 'Rejected by other party',
          updatedAt: serverTimestamp(),
        });

        setSelectedDeal((prev) => ({ ...prev, extensionRequestStatus: 'rejected', extensionRejectedAt: new Date().toISOString(), extensionRejectedBy: currentUser?.uid }));

        const requesterId = selectedDeal.extensionRequestedBy;
        if (requesterId) {
          notification.notify({
            event: NOTIFICATION_EVENTS.DEAL_EXTENDED,
            data: { userId: requesterId, dealId: selectedDeal.id, postTitle: selectedDeal.postTitle || 'Untitled Deal', rejectedBy: currentUser?.displayName || 'Someone', isRejected: true },
          });
        }

        await sendDealChatMessage(
          selectedDeal.chatId,
          `❌ **Deadline Extension Rejected**\n\n${currentUser?.displayName || 'Someone'} has rejected the extension request.\n\n📌 Current Deadline remains: ${formatDeadlineDisplay(selectedDeal.deadline)}`
        );

        feedback.alert.success({ message: '❌ ডেডলাইন বাড়ানোর অনুরোধটি প্রত্যাখ্যান করা হয়েছে।' });
      } catch (error) {
        logError('Error rejecting extension', error);
        feedback.alert.error({ message: 'প্রত্যাখ্যান করতে ব্যর্থ হয়েছে।' });
      }
    }
  };

  // ── Confirm Deal (accept a pending offer) ──────────────────────────
  const handleConfirmDeal = async () => {
    if (!selectedDeal || selectedDeal.status !== 'pending') {
      feedback.alert.warning({ message: 'No pending deal to confirm!' });
      return;
    }

    const postType = selectedDeal.postType || 'hire';
    if (postType === 'service') {
      if (selectedDeal.sellerId !== currentUser?.uid) {
        feedback.alert.warning({ message: '⚠️ শুধুমাত্র সার্ভিস প্রদানকারী (Seller) ডিল কনফার্ম করতে পারে!' });
        return;
      }
    } else if (selectedDeal.buyerId !== currentUser?.uid) {
      feedback.alert.warning({ message: '⚠️ শুধুমাত্র জব প্রদানকারী (Buyer) ডিল কনফার্ম করতে পারে!' });
      return;
    }

    try {
      await activateDealWithEscrowLock({
        dealId: selectedDeal.id,
        buyerId: selectedDeal.buyerId,
        budget: selectedDeal.budget || 0,
        extraDealFields: { confirmedAt: new Date().toISOString() },
      });

      setSelectedDeal((prev) => ({ ...prev, status: 'active', startedAt: new Date().toISOString() }));

      notifyBothParties(notification, NOTIFICATION_EVENTS.DEAL_CONFIRMED, parties(), { dealId: selectedDeal.id, postTitle: selectedDeal.postTitle || 'Untitled Deal', budget: selectedDeal.budget });

      await sendDealChatMessage(selectedDeal.chatId, `🎉 **Deal Confirmed!**\n\nবাজেটের পুরো ${selectedDeal.budget?.toLocaleString() || 0} BDT Buyer-এর ওয়ালেটে লক করা হয়েছে। ডিল এখন Active।`);

      feedback.alert.success({ message: '🎉 ডিল কনফার্ম করা হয়েছে! বাজেট লক করা হয়েছে।' });
    } catch (error) {
      logError('Error confirming deal', error);
      if (error.message === 'INSUFFICIENT_BALANCE') {
        feedback.alert.error({ message: `⚠️ Buyer-এর ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই! এই ডিল কনফার্ম করতে ${selectedDeal.budget?.toLocaleString() || 0} BDT দরকার। দয়া করে আগে Deposit করুন।` });
      } else if (error.message === 'WALLET_NOT_FOUND') {
        feedback.alert.error({ message: '⚠️ Buyer-এর ওয়ালেট খুঁজে পাওয়া যায়নি।' });
      } else {
        feedback.alert.error({ message: 'Failed to confirm deal.' });
      }
    }
  };

  // ── Cancel Deal (request) ──────────────────────────────────────────
  const handleCancelDeal = async () => {
    if (!selectedDeal || isProcessing) return;
    if (selectedDeal.status === 'completed') {
      feedback.alert.warning({ message: 'Cannot cancel a completed deal!' });
      return;
    }
    if (selectedDeal.status === 'cancelled') {
      feedback.alert.warning({ message: 'This deal is already cancelled!' });
      return;
    }
    if (selectedDeal.disputeStatus === 'open') {
      feedback.alert.warning({ message: 'এই ডিলে Dispute চলমান। Admin সিদ্ধান্তের অপেক্ষা করুন।' });
      return;
    }
    if (selectedDeal.cancelRequestedBy) {
      feedback.alert.warning({ message: 'A cancellation request is already pending.' });
      return;
    }

    const hasPayment = selectedDeal.milestones?.some((m) => m.status === 'funded' || m.status === 'released' || m.status === 'review');
    if (hasPayment) {
      feedback.alert.warning({ message: '⚠️ This deal has payments made. Cannot cancel. Please contact support or open a dispute.' });
      return;
    }

    const isBuyer = currentMode === 'buyer';
    const otherPartyName = isBuyer ? 'Seller' : 'Buyer';

    const confirmed = await feedback.confirm({
      title: '⚠️ ক্যানসেল রিকোয়েস্ট',
      message: `আপনি কি সত্যিই এই ডিলটি ক্যানসেল করতে চান?\n\nআপনি ${isBuyer ? 'বায়ার' : 'সেলার'} হিসেবে রিকোয়েস্ট করছেন।`,
      confirmText: 'হ্যাঁ, ক্যানসেল করুন',
      cancelText: 'না',
      variant: 'warning',
    });
    if (!confirmed) return;

    const reason = await feedback.prompt({
      title: 'ক্যানসেল করার কারণ',
      message: 'দয়া করে ক্যানসেল করার কারণ লিখুন:',
      placeholder: 'কারণ লিখুন...',
      confirmText: 'জমা দিন',
      cancelText: 'বাতিল করুন',
      inputType: 'text',
    });
    if (reason === null || reason === undefined) {
      feedback.alert.info({ message: 'ক্যানসেল রিকোয়েস্ট বাতিল করা হয়েছে।' });
      return;
    }
    if (!reason || reason.trim() === '') {
      feedback.alert.warning({ message: 'Cancellation reason is required!' });
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
        cancelExpiryAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const otherPartyId = isBuyer ? selectedDeal.sellerId : selectedDeal.buyerId;

      notification.notify({
        event: NOTIFICATION_EVENTS.CANCELLATION_REQUEST,
        data: { userId: otherPartyId, requesterName: currentUser?.displayName || currentUser?.email || 'Someone', dealId: selectedDeal.id, postTitle: selectedDeal.postTitle || 'Untitled Deal', reason: reason.trim(), budget: selectedDeal.budget },
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `⚠️ **Cancellation Requested**\n\n${currentUser?.displayName || 'Someone'} has requested to cancel this deal.\n\n📝 Reason: ${reason.trim()}\n\n⏳ Waiting for ${otherPartyName} response...`
      );

      setSelectedDeal((prev) => ({ ...prev, cancelRequestedBy: currentUser?.uid, cancelRequestedAt: now, cancelReason: reason.trim(), cancelRequestStatus: 'pending' }));

      feedback.alert.success({ message: `✅ Cancellation request sent to ${otherPartyName}.` });
    } catch (error) {
      logError('Error requesting cancellation', error);
      feedback.alert.error({ message: 'Failed to request cancellation.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Cancel Response (approve / reject; also handles pending-offer accept/reject) ──
  const handleCancelResponse = async (response) => {
    if (!selectedDeal || !selectedDeal.id) return;

    const dealRef = doc(db, 'deals', selectedDeal.id);
    const isBuyer = currentMode === 'buyer';
    const postType = selectedDeal.postType || 'hire';

    if (response === 'reject') {
      const isCancelRequest = selectedDeal.cancelRequestStatus === 'pending';
      const confirmed = await feedback.confirm({
        title: 'আপনি কি নিশ্চিত?',
        message: isCancelRequest ? 'ক্যানসেল রিকোয়েস্ট রিজেক্ট করলে ডিলটি অ্যাক্টিভ থাকবে।' : 'অফারটি রিজেক্ট এবং ডিলিট করতে চান?',
        confirmText: 'হ্যাঁ, রিজেক্ট করুন',
        cancelText: 'না',
        variant: 'warning',
      });
      if (!confirmed) return;

      try {
        if (isCancelRequest) {
          const requesterId = selectedDeal.cancelRequestedBy;
          const dealTitle = selectedDeal.postTitle || 'Untitled Deal';

          await updateDoc(dealRef, { cancelRequestedBy: null, cancelRequestedAt: null, cancelReason: null, cancelRequestStatus: null, cancelExpiryAt: null });

          await deleteCancelNotifications(selectedDeal.id);

          setSelectedDeal((prev) => ({ ...prev, cancelRequestedBy: null, cancelRequestStatus: null }));

          await sendDealChatMessage(selectedDeal.chatId, `❌ **Cancellation Rejected**\n\n${currentUser?.displayName || 'Someone'} has rejected the cancellation request.\n\n✅ Deal remains active.`);

          if (requesterId) {
            notification.notify({
              event: NOTIFICATION_EVENTS.CANCELLATION_REJECTED,
              data: { userId: requesterId, dealId: selectedDeal.id, postTitle: dealTitle, rejectedBy: currentUser?.displayName || 'Someone' },
            });
          }

          feedback.alert.success({ message: 'ক্যানসেল রিকোয়েস্ট রিজেক্ট করা হয়েছে।' });
        } else {
          const dealTitle = selectedDeal.postTitle || 'Untitled Deal';

          await deleteDoc(dealRef);
          setDeals((prev) => prev.filter((d) => d.id !== selectedDeal.id));
          setSelectedDeal(null);
          navigate('/deal-manager');

          const otherPartyId = currentUser?.uid === selectedDeal.buyerId ? selectedDeal.sellerId : selectedDeal.buyerId;
          notification.notify({
            event: NOTIFICATION_EVENTS.CANCELLATION_REJECTED,
            data: { userId: otherPartyId, dealId: selectedDeal.id, postTitle: dealTitle, rejectedBy: currentUser?.displayName || 'Someone', isOfferRejection: true },
          });

          feedback.alert.error({ message: 'অফারটি ডিলিট করা হয়েছে।' });
        }
      } catch (error) {
        logError('Error in reject', error);
        feedback.alert.error({ message: 'অপারেশনটি ব্যর্থ হয়েছে।' });
      }
    }

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

          try {
            await activateDealWithEscrowLock({ dealId: selectedDeal.id, buyerId: selectedDeal.buyerId, budget: selectedDeal.budget || 0 });
          } catch (lockError) {
            if (lockError.message === 'INSUFFICIENT_BALANCE') {
              feedback.alert.error({ message: `⚠️ Buyer-এর ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই! এই ডিল একটিভ করতে ${selectedDeal.budget?.toLocaleString() || 0} BDT দরকার।` });
            } else {
              feedback.alert.error({ message: 'ডিল একটিভ করতে ব্যর্থ হয়েছে।' });
            }
            return;
          }

          setSelectedDeal((prev) => ({ ...prev, status: 'active' }));

          notifyBothParties(notification, NOTIFICATION_EVENTS.DEAL_CONFIRMED, parties(), { dealId: selectedDeal.id, postTitle: selectedDeal.postTitle || 'Untitled Deal', budget: selectedDeal.budget });

          await sendDealChatMessage(
            selectedDeal.chatId,
            `✅ **Deal Accepted!**\n\n${currentUser?.displayName || 'Someone'} has accepted the offer.\n\n💰 বাজেটের পুরো ${selectedDeal.budget?.toLocaleString() || 0} BDT Buyer-এর ওয়ালেটে লক করা হয়েছে।\n🚀 Deal is now active!`
          );

          feedback.alert.success({ message: 'ডিলটি এখন অ্যাক্টিভ! বাজেট লক করা হয়েছে।' });
          return;
        }

        if (selectedDeal.cancelRequestStatus === 'pending') {
          if (selectedDeal.cancelRequestedBy === currentUser?.uid) {
            feedback.alert.warning({ message: 'আপনি নিজের রিকোয়েস্ট নিজে এপ্রুভ করতে পারবেন না।' });
            return;
          }

          const isOtherParty = (isBuyer && selectedDeal.buyerId === currentUser?.uid) || (!isBuyer && selectedDeal.sellerId === currentUser?.uid);
          if (!isOtherParty) {
            feedback.alert.warning({ message: 'আপনি এই ডিলের সাথে সম্পর্কিত নন!' });
            return;
          }

          const dealTitle = selectedDeal.postTitle || 'Untitled Deal';

          // Safe to release the FULL budget here because handleCancelDeal's
          // hasPayment guard already prevents a cancellation request from
          // ever being created while any milestone is funded/released.
          //
          // CRITICAL FIX: the deal-status update and the escrow-release used
          // to be two separate, non-atomic calls, with the release wrapped
          // in a try/catch that only logged failures and let the deal stay
          // 'cancelled' regardless — meaning a failed release could leave
          // the buyer's money locked forever with no error surfaced. Both
          // writes now happen in one transaction via
          // cancelDealWithEscrowRelease: either both succeed, or neither
          // does, and any failure now propagates to the outer catch below
          // instead of being silently swallowed.
          const shouldReleaseEscrow = selectedDeal.status === 'active' || selectedDeal.status === 'overdue';
          await cancelDealWithEscrowRelease({
            dealId: selectedDeal.id,
            buyerId: selectedDeal.buyerId,
            amount: shouldReleaseEscrow ? selectedDeal.escrowLockedAmount || selectedDeal.budget || 0 : 0,
            cancelFields: {
              status: 'cancelled',
              cancelRequestStatus: 'approved',
              cancelledAt: new Date().toISOString(),
              cancelledBy: currentUser?.uid,
              cancellationReason: selectedDeal.cancelReason || 'No reason provided',
            },
          });

          await deleteCancelNotifications(selectedDeal.id);

          notifyBothParties(notification, NOTIFICATION_EVENTS.CANCELLATION_APPROVED, parties(), { dealId: selectedDeal.id, postTitle: dealTitle });

          await sendDealChatMessage(
            selectedDeal.chatId,
            `❌ **Deal Cancelled**\n\n${currentUser?.displayName || 'Someone'} has approved the cancellation request.\n\n📝 Reason: ${selectedDeal.cancelReason || 'No reason provided'}\n\n🔄 Deal has been cancelled.`
          );

          setSelectedDeal((prev) => ({ ...prev, status: 'cancelled' }));
          feedback.alert.success({ message: 'ডিলটি ক্যানসেল করা হয়েছে।' });

          setTimeout(() => navigate('/deal-manager'), 1500);
        }
      } catch (error) {
        logError('Error in approve', error);
        feedback.alert.error({ message: 'সিস্টেম এরর ঘটেছে।' });
      }
    }
  };

  // ── Open Dispute ────────────────────────────────────────────────────
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
      variant: 'warning',
    });
    if (!confirmed) return;

    const reason = await feedback.prompt({
      title: '📝 Dispute-এর কারণ',
      message: 'বিস্তারিত লিখুন — কী সমস্যা হয়েছে, কাজ কতটুকু হয়েছে বলে আপনার দাবি:',
      placeholder: 'যেমন: Freelancer দাবি করছে ৯০% কাজ শেষ, কিন্তু...',
      confirmText: 'জমা দিন',
      cancelText: 'বাতিল',
      inputType: 'text',
    });
    if (!reason || reason.trim() === '') {
      feedback.alert.warning({ message: 'Dispute-এর কারণ লেখা আবশ্যক।' });
      return;
    }

    try {
      const dealRef = doc(db, 'deals', selectedDeal.id);
      const now = new Date().toISOString();
      const otherPartyId = currentUser?.uid === selectedDeal.buyerId ? selectedDeal.sellerId : selectedDeal.buyerId;

      await updateDoc(dealRef, {
        disputeStatus: 'open',
        disputeRaisedBy: currentUser?.uid,
        disputeReason: reason.trim(),
        disputeRaisedAt: now,
        extensionRequestStatus: null,
        updatedAt: serverTimestamp(),
      });

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

      setSelectedDeal((prev) => ({ ...prev, disputeStatus: 'open', disputeRaisedBy: currentUser?.uid, disputeReason: reason.trim(), disputeRaisedAt: now, extensionRequestStatus: null }));

      notification.notify({
        event: NOTIFICATION_EVENTS.DISPUTE_OPENED,
        data: { userId: otherPartyId, dealId: selectedDeal.id, postTitle: selectedDeal.postTitle || 'Untitled Deal', raisedBy: currentUser?.displayName || 'Someone', reason: reason.trim() },
      });

      await sendDealChatMessage(
        selectedDeal.chatId,
        `⚖️ **Dispute Opened**\n\n${currentUser?.displayName || 'Someone'} has opened a dispute for admin review.\n\n📝 Reason: ${reason.trim()}\n\n⏳ Admin সিদ্ধান্ত না দেওয়া পর্যন্ত এই ডিলে কোনো Extend/Cancel অ্যাকশন নেওয়া যাবে না।`
      );

      feedback.alert.success({ message: '✅ Dispute ওপেন করা হয়েছে। Admin শীঘ্রই রিভিউ করবে।' });
    } catch (error) {
      logError('Error opening dispute', error);
      feedback.alert.error({ message: 'Dispute ওপেন করতে ব্যর্থ হয়েছে।' });
    }
  };

  return {
    handleExtendDeadline,
    handleSubmitWork,
    handleRejectWork,
    handleReleasePayment,
    handleExtensionResponse,
    handleConfirmDeal,
    handleCancelDeal,
    handleCancelResponse,
    handleOpenDispute,
    isProcessing,
    submittingMilestone,
    releasingPayment,
    rejectingWork,
    openSubmitForm,
    setOpenSubmitForm,
    workDraft,
    setWorkDraft,
  };
};