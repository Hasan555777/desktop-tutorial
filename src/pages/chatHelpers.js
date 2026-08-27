// src/pages/chatHelpers.js

import { db } from '@/firebase';
import {
  collection, addDoc, serverTimestamp, updateDoc, doc,
  getDocs, query, where, getDoc
} from 'firebase/firestore';
import { generateDealId } from '@/pages/dealIdHelper';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';
import { ACTIVE_DEAL_STATUSES } from '@/rules/dealRules';
import { logger } from '@/utils/logger';

// Cloudinary কনফিগারেশন
const CLOUD_NAME = "drwex6tmf";
const UPLOAD_PRESET = "workhub_preset";

// Deal action-গুলোর জন্য deduplication map (একই ডিল ৫ সেকেন্ডের মধ্যে দুইবার approve/reject/reopen ঠেকাতে)
const _dealActionMap = new Map();
const DEDUPE_WINDOW_MS = 5000;

const isRecentlyActioned = (key) => {
  const lastTime = _dealActionMap.get(key);
  return lastTime && Date.now() - lastTime < DEDUPE_WINDOW_MS;
};

const markActioned = (key) => {
  _dealActionMap.set(key, Date.now());
  setTimeout(() => _dealActionMap.delete(key), DEDUPE_WINDOW_MS);
};

// ============================================================
// ✅ Cloudinary আপলোড
// ============================================================
export const uploadToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json();
    return data.secure_url;
  } catch (error) {
    logger.error("Upload Error:", error);
    return null;
  }
};

// ============================================================
// ✅ Milestone জেনারেট (30% / 40% / বাকিটা, rounding error ছাড়া)
// ============================================================
export const generateMilestones = (totalBudget) => {
  const budget = Number(totalBudget);
  const first = Math.round(budget * 0.3);
  const second = Math.round(budget * 0.4);
  const third = budget - first - second;

  return [
    { id: 1, title: 'Initial Project Setup & Planning', amount: first, status: 'pending' },
    { id: 2, title: 'Core Development & Implementation', amount: second, status: 'pending' },
    { id: 3, title: 'Final Testing & Handover', amount: third, status: 'pending' }
  ];
};

export const formatLastSeen = (timestamp) => {
  if (!timestamp) return 'Offline';
  const date = timestamp.toDate ? timestamp.toDate() :
    timestamp.seconds ? new Date(timestamp.seconds * 1000) :
      new Date(timestamp);
  const now = new Date();
  const diffMin = Math.floor((now - date) / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

export const getInitialsAvatar = (name) => {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=random&size=150&bold=true`;
};

export const formatTime = (ts) => {
  if (!ts?.seconds) return 'Just now';
  try {
    return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Just now';
  }
};

// ============================================================
// ✅ BUDGET & DEADLINE HELPERS
// ============================================================

export const extractBudgetValue = (budget) => {
  if (budget === null || budget === undefined) return 0;
  if (typeof budget === 'number') return budget;
  if (typeof budget === 'string') {
    const parsed = parseFloat(budget);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof budget === 'object') {
    if (budget.amount !== undefined) {
      return typeof budget.amount === 'number' ? budget.amount : parseFloat(budget.amount) || 0;
    }
    if (budget.type === 'range' || budget.min !== undefined || budget.max !== undefined) {
      return Math.max(budget.min || 0, budget.max || 0);
    }
  }
  return 0;
};

export const extractDeadlineValue = (deadline) => {
  if (deadline === null || deadline === undefined) return 0;
  if (typeof deadline === 'number') return deadline;
  if (typeof deadline === 'string') {
    const parsed = parseFloat(deadline);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof deadline === 'object') {
    if (deadline.days !== undefined) {
      return typeof deadline.days === 'number' ? deadline.days : parseFloat(deadline.days) || 0;
    }
    if (deadline.type === 'range' || deadline.min !== undefined || deadline.max !== undefined) {
      return Math.max(deadline.min || 0, deadline.max || 0);
    }
  }
  return 0;
};

export const formatBudgetDisplay = (budget) => {
  if (budget === null || budget === undefined) return '0';
  if (typeof budget === 'number') return String(budget);
  if (typeof budget === 'string') return budget;
  if (typeof budget === 'object') {
    if (budget.type === 'range') {
      const negotiable = budget.isNegotiable ? ' (আলোচনাসাপেক্ষ)' : '';
      return `${budget.min || 0}-${budget.max || 0}${negotiable}`;
    }
    const negotiable = budget.isNegotiable ? ' (আলোচনাসাপেক্ষ)' : '';
    return `${budget.amount || 0}${negotiable}`;
  }
  return String(budget);
};

export const formatDeadlineDisplay = (deadline) => {
  if (deadline === null || deadline === undefined) return '0';

  if (typeof deadline === 'number') {
    if (deadline < 1440) { // 1440 = 24 * 60 মিনিট
      if (deadline < 60) return `${deadline} মিনিট`;
      const hours = Math.floor(deadline / 60);
      const minutes = deadline % 60;
      return minutes === 0 ? `${hours} ঘন্টা` : `${hours} ঘন্টা ${minutes} মিনিট`;
    }
    const days = Math.ceil(deadline / 1440);
    const remainingMinutes = deadline % 1440;
    if (remainingMinutes === 0) return `${days} দিন`;
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return hours === 0 ? `${days} দিন ${minutes} মিনিট` : `${days} দিন ${hours} ঘন্টা`;
  }

  if (typeof deadline === 'string') return deadline;

  if (typeof deadline === 'object') {
    if (deadline.type === 'range') return `${deadline.min || 0}-${deadline.max || 0}`;
    return String(deadline.days || 0);
  }

  return String(deadline);
};

// ============================================================
// ✅ sendProposal
// ============================================================
export const sendProposal = async (
  proposalData,
  chatContext,
  currentUser,
  postType,
  userRole,
  safeChatId,
  feedback,
  sound
) => {
  if (!proposalData.budget || !proposalData.deadline || !proposalData.details) {
    feedback?.alert.warning({ message: 'দয়া করে সব ফিল্ড পূরণ করুন!' });
    return { success: false, error: 'Missing fields' };
  }

  let buyerId, sellerId, buyerName, sellerName, buyerEmail, sellerEmail;

  if (postType === 'service') {
    buyerId = currentUser?.uid;
    sellerId = chatContext?.userId || chatContext?.ownerId || chatContext?.uid || chatContext?.sellerId;
    buyerName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Buyer';
    buyerEmail = currentUser?.email || 'No email';
    sellerName = chatContext?.userName || chatContext?.displayName || chatContext?.name || 'Seller';
    sellerEmail = chatContext?.userEmail || chatContext?.email || 'No email';
  } else {
    buyerId = chatContext?.userId || chatContext?.buyerId || chatContext?.uid || chatContext?.ownerId;
    sellerId = currentUser?.uid;
    buyerName = chatContext?.userName || chatContext?.displayName || chatContext?.name || 'Buyer';
    buyerEmail = chatContext?.userEmail || chatContext?.email || 'No email';
    sellerName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Seller';
    sellerEmail = currentUser?.email || 'No email';
  }

  if (!buyerId || !sellerId) {
    feedback?.alert.error({ message: 'সিস্টেম ত্রুটি: ব্যবহারকারী শনাক্ত করা যায়নি।' });
    return { success: false, error: 'User identification failed' };
  }

  if (buyerId === sellerId) {
    feedback?.alert.warning({ message: '❌ আপনি নিজেকে প্রপোজাল পাঠাতে পারবেন না!' });
    return { success: false, error: 'Self proposal' };
  }

  // ডেডলাইন কনভার্ট (মিনিট → দিন) — শুধু একবার
  const deadlineInMinutes = Number(proposalData.deadline);
  const deadlineInDays = Math.ceil(deadlineInMinutes / (24 * 60));

  const dealIdNumber = await generateDealId();
  const chatId = chatContext?.id || chatContext?.postId || `deal_${Date.now()}`;
  const milestones = generateMilestones(proposalData.budget);

  const senderId = currentUser?.uid;
  const senderDisplayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Someone';
  const recipientId = senderId === buyerId ? sellerId : buyerId;

  try {
    const dealPayload = {
      postId: chatContext?.id || chatContext?.postId || 'unknown_post',
      postTitle: chatContext?.title || 'Untitled Project',
      postType,
      buyerId, buyerName, buyerEmail,
      sellerId, sellerName, sellerEmail,
      dealIdNumber,
      budget: Number(proposalData.budget),
      deadline: deadlineInDays,
      details: proposalData.details,
      milestones,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      proposedBy: senderId,
      proposedAt: serverTimestamp(),
      chatId
    };

    const dealRef = await addDoc(collection(db, 'deals'), dealPayload);
    const dealId = dealRef.id;

    await addDoc(collection(db, 'notifications'), {
      userId: recipientId,
      event: NOTIFICATION_EVENTS.DEAL_CREATED,
      senderId,
      senderName: senderDisplayName,
      projectTitle: chatContext?.title || 'a project',
      dealId,
      dealIdNumber,
      budget: proposalData.budget,
      deadline: proposalData.deadline,
      message: `${senderDisplayName} sent you a new proposal for "${chatContext?.title || 'a project'}"`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: senderId,
      event: NOTIFICATION_EVENTS.DEAL_CREATED,
      senderId,
      senderName: senderDisplayName,
      projectTitle: chatContext?.title || 'a project',
      dealId,
      dealIdNumber,
      budget: proposalData.budget,
      deadline: proposalData.deadline,
      message: `✅ আপনার প্রপোজাল "${chatContext?.title || 'a project'}"-এর জন্য সফলভাবে পাঠানো হয়েছে। ৪৮ ঘণ্টার মধ্যে সাড়া না পেলে অফারটি স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    if (chatId) {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: `📄 **New Offer Sent!**\n\n💰 Budget: ${proposalData.budget} BDT\n⏱️ Deadline: ${proposalData.deadline} Minutes (${deadlineInDays} Days)\n\n👤 From: ${senderDisplayName}\n\n📋 Details: ${proposalData.details}\n\n⌛ এই অফারটি ৪৮ ঘণ্টার মধ্যে গ্রহণ না করা হলে স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।`,
        sender: 'system',
        senderId: 'system',
        createdAt: serverTimestamp(),
        type: 'system',
        dealId
      });

      await updateDoc(doc(db, 'chats', chatId), {
        dealId,
        dealIdNumber,
        dealStatus: 'pending',
        updatedAt: serverTimestamp()
      });
    }

    feedback?.alert.success({ message: '✅ প্রপোজাল সফলভাবে পাঠানো হয়েছে!' });
    sound?.playEventOnce?.(SOUND_EVENTS.DEAL_CREATED, { dedupeTime: 3000 }) || sound?.playEvent?.(SOUND_EVENTS.DEAL_CREATED);

    return { success: true, dealId };

  } catch (error) {
    logger.error("Error sending proposal:", error);
    feedback?.alert.error({ message: 'প্রপোজাল পাঠাতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    return { success: false, error: error.message };
  }
};

// ============================================================
// ✅ approveDeal
// ============================================================
export const approveDeal = async (existingDeal, currentUser, safeChatId, feedback, sound) => {
  if (!existingDeal || existingDeal.status !== 'pending') {
    feedback?.alert.warning({ message: 'কোনো পেন্ডিং অফার নেই!' });
    return;
  }

  const dealId = existingDeal.id || existingDeal.dealId;
  if (!dealId) {
    logger.error('No dealId found on existingDeal:', existingDeal);
    feedback?.alert.error({ message: 'সিস্টেম ত্রুটি: ডিল আইডি পাওয়া যায়নি।' });
    return;
  }

  const key = `approve_${dealId}`;
  if (isRecentlyActioned(key)) {
    feedback?.alert.info({ message: 'ডিল ইতিমধ্যে অ্যাপ্রুভ করা হয়েছে!' });
    return;
  }

  try {
    const dealSnap = await getDoc(doc(db, 'deals', dealId));
    if (!dealSnap.exists()) {
      feedback?.alert.error({ message: 'ডিল খুঁজে পাওয়া যায়নি!' });
      return;
    }
  } catch (error) {
    logger.error('Error verifying deal:', error);
    feedback?.alert.error({ message: 'ডিল ভেরিফাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' });
    return;
  }

  const confirmed = feedback
    ? await feedback.confirm({
        title: 'ডিল কনফর্ম করুন',
        message: '✅ আপনি কি এই ডিলটি কনফর্ম করতে চান?',
        confirmText: 'হ্যাঁ, কনফর্ম করুন',
        cancelText: 'না',
        variant: 'success'
      })
    : window.confirm('Are you sure you want to confirm this deal?');
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, 'deals', dealId), {
      status: 'active',
      acceptedAt: serverTimestamp(),
      acceptedBy: currentUser?.uid,
      updatedAt: serverTimestamp()
    });

    await addDoc(collection(db, 'chats', safeChatId, 'messages'), {
      text: `✅ **Deal Confirmed!**\n\n💰 Budget: ${existingDeal.budget} BDT\n⏱️ Deadline: ${existingDeal.deadline} Days`,
      sender: 'system',
      senderId: 'system',
      createdAt: serverTimestamp(),
      type: 'system'
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.sellerId,
      event: NOTIFICATION_EVENTS.DEAL_APPROVED,
      dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      budget: existingDeal.budget,
      message: `✅ Your proposal for "${existingDeal.postTitle || 'a project'}" has been approved! 🎉`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.buyerId,
      event: NOTIFICATION_EVENTS.DEAL_APPROVED,
      dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      budget: existingDeal.budget,
      message: `✅ You have approved the deal "${existingDeal.postTitle || 'a project'}"! 🎉`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    feedback?.alert.success({ message: '🎉 ডিল কনফর্ম করা হয়েছে!' });
    sound?.playEventOnce?.(SOUND_EVENTS.DEAL_APPROVED, { dedupeTime: 3000 }) || sound?.playEvent?.(SOUND_EVENTS.DEAL_APPROVED);

    markActioned(key);
  } catch (error) {
    logger.error("Error approving deal:", error);
    feedback?.alert.error({ message: 'ডিল কনফর্ম করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
  }
};

// ============================================================
// ✅ rejectDeal
// ============================================================
export const rejectDeal = async (existingDeal, currentUser, safeChatId, feedback, sound) => {
  if (!existingDeal || existingDeal.status !== 'pending') {
    feedback?.alert.warning({ message: 'প্রত্যাখ্যান করার মতো কোনো পেন্ডিং অফার নেই!' });
    return;
  }

  const dealId = existingDeal.id || existingDeal.dealId;
  if (!dealId) {
    logger.error('No dealId found on existingDeal:', existingDeal);
    feedback?.alert.error({ message: 'সিস্টেম ত্রুটি: ডিল আইডি পাওয়া যায়নি।' });
    return;
  }

  try {
    const dealSnap = await getDoc(doc(db, 'deals', dealId));
    if (!dealSnap.exists()) {
      feedback?.alert.error({ message: 'ডিল খুঁজে পাওয়া যায়নি!' });
      return;
    }
  } catch (error) {
    logger.error('Error verifying deal:', error);
    feedback?.alert.error({ message: 'ডিল ভেরিফাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' });
    return;
  }

  const key = `reject_${dealId}`;
  if (isRecentlyActioned(key)) {
    feedback?.alert.info({ message: 'ডিল ইতিমধ্যে রিজেক্ট করা হয়েছে!' });
    return;
  }

  const confirmed = feedback
    ? await feedback.confirm({
        title: 'অফার প্রত্যাখ্যান করুন',
        message: '⚠️ আপনি কি এই অফারটি প্রত্যাখ্যান করতে চান?',
        confirmText: 'হ্যাঁ, প্রত্যাখ্যান করুন',
        cancelText: 'না',
        variant: 'warning'
      })
    : window.confirm('Are you sure you want to reject this offer?');
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, 'deals', dealId), {
      status: 'rejected',
      rejectedAt: serverTimestamp(),
      rejectedBy: currentUser?.uid,
      updatedAt: serverTimestamp()
    });

    await addDoc(collection(db, 'chats', safeChatId, 'messages'), {
      text: `❌ **Offer Rejected**\n\n${currentUser?.displayName || 'Someone'} has rejected the offer.`,
      sender: 'system',
      senderId: 'system',
      createdAt: serverTimestamp(),
      type: 'system'
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.sellerId,
      event: NOTIFICATION_EVENTS.DEAL_REJECTED,
      dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      message: `❌ Your proposal for "${existingDeal.postTitle || 'a project'}" was rejected.`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.buyerId,
      event: NOTIFICATION_EVENTS.DEAL_REJECTED,
      dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      message: `❌ You have rejected the deal "${existingDeal.postTitle || 'a project'}".`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    feedback?.alert.success({ message: '❌ অফার সফলভাবে প্রত্যাখ্যান করা হয়েছে!' });
    sound?.playEventOnce?.(SOUND_EVENTS.DEAL_REJECTED, { dedupeTime: 3000 }) || sound?.playEvent?.(SOUND_EVENTS.DEAL_REJECTED);

    markActioned(key);
  } catch (error) {
    logger.error("Error rejecting deal:", error);
    feedback?.alert.error({ message: 'অফার প্রত্যাখ্যান করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
  }
};

// ============================================================
// ✅ reopenDeal
// ============================================================
export const reopenDeal = async (existingDeal, currentUser, safeChatId, feedback, sound) => {
  const dealId = existingDeal?.id || existingDeal?.dealId || safeChatId;
  if (!dealId) {
    logger.error('No dealId found on existingDeal:', existingDeal);
    feedback?.alert.error({ message: 'সিস্টেম ত্রুটি: ডিল আইডি পাওয়া যায়নি।' });
    return;
  }

  const key = `reopen_${dealId}`;
  if (isRecentlyActioned(key)) {
    feedback?.alert.info({ message: 'ডিল ইতিমধ্যে পুনরায় খোলা হয়েছে!' });
    return;
  }

  const dealRef = doc(db, 'deals', dealId);
  let dealSnap;
  try {
    dealSnap = await getDoc(dealRef);
    if (!dealSnap.exists()) {
      feedback?.alert.error({ message: 'ডিল খুঁজে পাওয়া যায়নি!' });
      return;
    }
  } catch (error) {
    logger.error('Error verifying deal:', error);
    feedback?.alert.error({ message: 'ডিল ভেরিফাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' });
    return;
  }

  const confirmed = feedback
    ? await feedback.confirm({
        title: 'ডিল পুনরায় খুলুন',
        message: '⚠️ আপনি কি এই বাতিল করা ডিলটি পুনরায় খুলতে চান?',
        confirmText: 'হ্যাঁ, পুনরায় খুলুন',
        cancelText: 'না',
        variant: 'info'
      })
    : window.confirm('Are you sure you want to re-open this cancelled deal?');
  if (!confirmed) return;

  try {
    const currentStatus = dealSnap.data()?.status;
    if (currentStatus === 'pending') {
      feedback?.alert.info({ message: 'এই ডিল ইতিমধ্যে খোলা আছে!' });
      return;
    }

    await updateDoc(dealRef, {
      status: 'pending',
      cancelledAt: null,
      cancellationReason: null,
      reopenedAt: serverTimestamp(),
      reopenedBy: currentUser?.uid,
      updatedAt: serverTimestamp()
    });

    await addDoc(collection(db, 'chats', safeChatId, 'messages'), {
      text: `🔄 **Deal Re-opened**\n\n${currentUser?.displayName || 'Someone'} has re-opened this deal.`,
      sender: 'system',
      senderId: 'system',
      createdAt: serverTimestamp(),
      type: 'system'
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.buyerId,
      event: NOTIFICATION_EVENTS.DEAL_REOPENED,
      dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      message: `🔄 Deal "${existingDeal.postTitle || 'a project'}" has been re-opened by ${currentUser?.displayName || 'Someone'}.`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.sellerId,
      event: NOTIFICATION_EVENTS.DEAL_REOPENED,
      dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      message: `🔄 You have re-opened the deal "${existingDeal.postTitle || 'a project'}".`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    feedback?.alert.success({ message: '✅ ডিল সফলভাবে পুনরায় খোলা হয়েছে!' });
    sound?.playEventOnce?.(SOUND_EVENTS.DEAL_REOPENED, { dedupeTime: 3000 }) || sound?.playEvent?.(SOUND_EVENTS.DEAL_REOPENED);

    markActioned(key);
  } catch (error) {
    logger.error("Error re-opening deal:", error);
    feedback?.alert.error({ message: 'ডিল পুনরায় খুলতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
  }
};

// ============================================================
// ✅ checkActiveDealBetweenUsers
//
// FIX ১ (আগের): 'participants' array-এর বদলে buyerId/sellerId দিয়ে কোয়েরি।
// FIX ২ (এই পাসে): হার্ডকোড করা status ['active', 'overdue'] বাদ দিয়ে
// dealRules.js-এর ACTIVE_DEAL_STATUSES ব্যবহার — নাহলে 'pending' (অফার
// পাঠানো হয়েছে কিন্তু এখনো accept হয়নি) অবস্থায় থাকা ডিলও block/delete
// protection থেকে বাদ পড়ে যাচ্ছিল।
// ============================================================
export const checkActiveDealBetweenUsers = async (userId1, userId2) => {
  if (!userId1 || !userId2) {
    return { hasActiveDeal: false, error: 'User IDs required', count: 0, activeDeals: [] };
  }

  try {
    const dealsRef = collection(db, 'deals');

    const qAsBuyer = query(
      dealsRef,
      where('buyerId', '==', userId1),
      where('status', 'in', ACTIVE_DEAL_STATUSES)
    );
    const qAsSeller = query(
      dealsRef,
      where('sellerId', '==', userId1),
      where('status', 'in', ACTIVE_DEAL_STATUSES)
    );

    const [buyerSnap, sellerSnap] = await Promise.all([getDocs(qAsBuyer), getDocs(qAsSeller)]);

    const seen = new Set();
    const merged = [];
    [...buyerSnap.docs, ...sellerSnap.docs].forEach((docSnap) => {
      if (seen.has(docSnap.id)) return;
      seen.add(docSnap.id);
      merged.push({ id: docSnap.id, ...docSnap.data() });
    });

    const activeDeals = merged.filter(
      (deal) => deal.buyerId === userId2 || deal.sellerId === userId2
    );

    return {
      hasActiveDeal: activeDeals.length > 0,
      activeDeals,
      count: activeDeals.length
    };
  } catch (error) {
    logger.error('Error checking active deals:', error);
    return { hasActiveDeal: false, error: error.message, count: 0, activeDeals: [] };
  }
};

// ============================================================
// ✅ checkActiveDealForUser
// ============================================================
export const checkActiveDealForUser = async (userId) => {
  if (!userId) {
    return { hasActiveDeal: false, error: 'User ID required', count: 0, activeDeals: [] };
  }

  try {
    const dealsRef = collection(db, 'deals');

    const qAsBuyer = query(
      dealsRef,
      where('buyerId', '==', userId),
      where('status', 'in', ACTIVE_DEAL_STATUSES)
    );
    const qAsSeller = query(
      dealsRef,
      where('sellerId', '==', userId),
      where('status', 'in', ACTIVE_DEAL_STATUSES)
    );

    const [buyerSnap, sellerSnap] = await Promise.all([getDocs(qAsBuyer), getDocs(qAsSeller)]);

    const seen = new Set();
    const activeDeals = [];
    [...buyerSnap.docs, ...sellerSnap.docs].forEach((docSnap) => {
      if (seen.has(docSnap.id)) return;
      seen.add(docSnap.id);
      activeDeals.push({ id: docSnap.id, ...docSnap.data() });
    });

    return {
      hasActiveDeal: activeDeals.length > 0,
      activeDeals,
      count: activeDeals.length
    };
  } catch (error) {
    logger.error('Error checking active deals:', error);
    return { hasActiveDeal: false, error: error.message, count: 0, activeDeals: [] };
  }
};













// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {

//     // ============================================================
//     // Helpers
//     // ============================================================
//     function isSignedIn() {
//       return request.auth != null;
//     }
//     function isOwner(userId) {
//       return isSignedIn() && request.auth.uid == userId;
//     }
//     function isAdmin() {
//       return isSignedIn() &&
//         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
//         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
//     }
//     function isParticipant(chatData) {
//       return isSignedIn() && request.auth.uid in chatData.participants;
//     }
//     // deals ডকুমেন্টে 'participants' নামে কোনো ফিল্ড নেই (sendProposal()
//     // দেখুন, chatHelpers.js) — শুধু buyerId/sellerId থাকে। তাই deal-এর
//     // "আমি এই ডিলের পক্ষ কিনা" চেক এই দুটো ফিল্ড দিয়েই করতে হবে।
//     function isDealParty(dealData) {
//       return isSignedIn() &&
//         (dealData.buyerId == request.auth.uid || dealData.sellerId == request.auth.uid);
//     }

//     // ============================================================
//     // users/{userId}
//     //
//     // ⚠️ সিকিউরিটি-ক্রিটিক্যাল: role/isVerified/verificationStatus/
//     // isBanned/isBlocked/documentVerified/faceVerified/documentsUploaded/
//     // verificationMethod/completionScore/totalReviews/totalRating/
//     // averageRating — এই ফিল্ডগুলো ক্লায়েন্ট থেকে সরাসরি বদলানো যাবে না।
//     // এই গার্ড ছাড়া যেকোনো সাইন-ইন করা ইউজার নিজের ডকুমেন্টে সরাসরি
//     // updateDoc কল করে নিজেকে verified/admin বানিয়ে ফেলতে পারত।
//     // ============================================================
//     function userTrustFieldsUnchanged() {
//       let before = resource.data;
//       let after = request.resource.data;
//       return
//         after.get('role', null) == before.get('role', null) &&
//         after.get('isVerified', null) == before.get('isVerified', null) &&
//         after.get('verificationStatus', null) == before.get('verificationStatus', null) &&
//         after.get('isBanned', null) == before.get('isBanned', null) &&
//         after.get('isBlocked', null) == before.get('isBlocked', null) &&
//         after.get('documentVerified', null) == before.get('documentVerified', null) &&
//         after.get('faceVerified', null) == before.get('faceVerified', null) &&
//         after.get('documentsUploaded', null) == before.get('documentsUploaded', null) &&
//         after.get('verificationMethod', null) == before.get('verificationMethod', null) &&
//         after.get('completionScore', null) == before.get('completionScore', null) &&
//         after.get('totalReviews', null) == before.get('totalReviews', null) &&
//         after.get('totalRating', null) == before.get('totalRating', null) &&
//         after.get('averageRating', null) == before.get('averageRating', null);
//     }

//     match /users/{userId} {
//       allow read: if isSignedIn();

//       // ensureUserDocument() (AuthContext.jsx) এর সাথে মিলিয়ে — নতুন
//       // অ্যাকাউন্ট সবসময় unverified/unbanned/role:'client' দিয়ে শুরু হয়।
//       allow create: if isOwner(userId) &&
//         request.resource.data.role == 'client' &&
//         request.resource.data.isVerified == false &&
//         request.resource.data.isBanned == false &&
//         request.resource.data.isBlocked == false;

//       allow update: if (isOwner(userId) && userTrustFieldsUnchanged()) || isAdmin();

//       allow delete: if isAdmin();
//     }

//     // ============================================================
//     // chats/{chatId}
//     // ============================================================
//     match /chats/{chatId} {
//       allow read: if isParticipant(resource.data);

//       allow create: if isSignedIn()
//         && request.auth.uid in request.resource.data.participants
//         && (request.auth.uid == request.resource.data.buyerId
//             || request.auth.uid == request.resource.data.sellerId);

//       allow update: if isParticipant(resource.data);
//       allow delete: if isParticipant(resource.data);

//       match /messages/{messageId} {
//         allow read: if isParticipant(get(/databases/$(database)/documents/chats/$(chatId)).data);

//         allow create: if isParticipant(get(/databases/$(database)/documents/chats/$(chatId)).data)
//           && (request.resource.data.senderId == request.auth.uid
//               || request.resource.data.senderId == 'system');

//         // নিজের মেসেজ এডিট করা যাবে; পুরো চ্যাট bulk-delete করার সময়
//         // (useChatActions.js) participant যেকোনো মেসেজ delete করতে
//         // পারবে — bulk delete-এর জন্য ইচ্ছাকৃতভাবে loose।
//         allow update: if isParticipant(get(/databases/$(database)/documents/chats/$(chatId)).data)
//           && resource.data.senderId == request.auth.uid;
//         allow delete: if isParticipant(get(/databases/$(database)/documents/chats/$(chatId)).data);
//       }
//     }

//     // ============================================================
//     // userBlocks — doc id প্যাটার্ন: {blockerId}_{blockedId}
//     // ============================================================
//     match /userBlocks/{blockDocId} {
//       allow create: if isSignedIn()
//         && request.resource.data.blockerId == request.auth.uid
//         && blockDocId == request.auth.uid + '_' + request.resource.data.blockedId;

//       allow read: if isSignedIn()
//         && (resource.data.blockerId == request.auth.uid || resource.data.blockedId == request.auth.uid);

//       allow delete: if isSignedIn() && resource.data.blockerId == request.auth.uid;
//       allow update: if false;
//     }

//     // ============================================================
//     // deals/{dealId} — buyerId/sellerId ভিত্তিক (participants ফিল্ড নেই)
//     // ============================================================
//     match /deals/{dealId} {
//       allow read: if isDealParty(resource.data);

//       allow create: if isSignedIn()
//         && request.resource.data.proposedBy == request.auth.uid
//         && request.auth.uid in [request.resource.data.buyerId, request.resource.data.sellerId]
//         && request.resource.data.status == 'pending';

//       allow update: if isDealParty(resource.data);

//       allow delete: if false; // hard-delete না করে শুধু status বদলানো উচিত
//     }

//     // ============================================================
//     // wallets/{userId} — ProposalModal.jsx ব্যালেন্স-চেকের জন্য পড়ে।
//     // ব্যালেন্স মিউটেশন সবসময় trusted backend/Cloud Function-এ হওয়া
//     // উচিত, ক্লায়েন্ট থেকে সরাসরি write করা যাবে না।
//     // ============================================================
//     match /wallets/{userId} {
//       allow read: if isOwner(userId) || isAdmin();
//       allow write: if isAdmin(); // client write নেই; ব্যালেন্স আপডেট Cloud Function দিয়ে হওয়া উচিত
//     }

//     // ============================================================
//     // posts/{postId}
//     // ⚠️ NOTE: এই rule ব্লক তোমার পাঠানো ড্রাফট থেকে নেওয়া, posts
//     // creation/edit-এর আসল কোড (App.js) আমি দেখিনি — status/isPublished
//     // ফিল্ড নাম মিলছে কিনা নিজে যাচাই করে নিও।
//     // ============================================================
//     match /posts/{postId} {
//       allow read: if resource.data.status == 'approved'
//         || (isSignedIn() && resource.data.userId == request.auth.uid)
//         || isAdmin();

//       allow create: if isSignedIn() &&
//         request.resource.data.userId == request.auth.uid &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.isPublished == false;

//       allow update: if (
//         isSignedIn() &&
//         resource.data.userId == request.auth.uid &&
//         resource.data.status == 'pending' &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.userId == resource.data.userId
//       ) || isAdmin();

//       allow delete: if (isSignedIn() && resource.data.userId == request.auth.uid) || isAdmin();
//     }

//     // ============================================================
//     // notifications
//     // ============================================================
//     match /notifications/{notifId} {
//       allow read, update: if isSignedIn() && resource.data.userId == request.auth.uid;

//       allow create: if isSignedIn()
//         && (request.resource.data.senderId == request.auth.uid
//             || request.resource.data.senderId == null
//             || request.resource.data.senderId == 'system');

//       allow delete: if isSignedIn() && resource.data.userId == request.auth.uid;
//     }

//     // ============================================================
//     // metadata/dealCounter — generateDealId() transaction এখান থেকে পড়ে/লেখে
//     // ============================================================
//     match /metadata/dealCounter {
//       allow read: if isSignedIn();
//       allow update: if isSignedIn()
//         && request.resource.data.count == resource.data.count + 1
//         && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['count']);
//       allow create: if isSignedIn();
//       allow delete: if false;
//     }

//     // ============================================================
//     // guides — DealGuideModal.jsx লাইভ-লোড করে, শুধু admin এডিট করতে পারবে
//     // ============================================================
//     match /guides/{guideId} {
//       allow read: if isSignedIn();
//       allow write: if isAdmin();
//     }

//     // ============================================================
//     // Default deny — এখানে explicitly ম্যাচ না হওয়া কোনো path-এ কিছু
//     // পড়া/লেখা যাবে না (Firestore-এর ডিফল্ট বিহেভিয়ারও এটাই, কিন্তু
//     // স্পষ্টভাবে লেখা থাকা ভালো)।
//     // ============================================================
//     match /{document=**} {
//       allow read, write: if false;
//     }
//   }
// }

