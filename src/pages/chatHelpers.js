// src/pages/chatHelpers.js

import { db } from '@/firebase';
import { 
  collection, addDoc, serverTimestamp, updateDoc, doc, 
  getDocs, query, where, increment, getDoc 
} from 'firebase/firestore';
import { generateDealId } from './dealIdHelper';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';

// Cloudinary কনফিগারেশন
const CLOUD_NAME = "drwex6tmf";
const UPLOAD_PRESET = "workhub_preset";

// ✅ Deduplication Map for Deal Actions
const _dealActionMap = new Map();

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
    console.error("Upload Error:", error);
    return null;
  }
};

// ============================================================
// ✅ generateMilestones - FIXED (Rounding Error)
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
  let date = timestamp.toDate ? timestamp.toDate() : 
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
  } catch (error) {
    return 'Just now';
  }
};

// ============================================================
// ✅ BUDGET & DEADLINE HELPERS (NEW)
// ============================================================

/**
 * Extract budget value from object or number
 * Supports: number, string, {amount, isNegotiable}, {type:'range', min, max, isNegotiable}
 * 
 * @param {any} budget - The budget value (number, string, or object)
 * @returns {number} - Extracted number value
 * 
 * @example
 * extractBudgetValue(1000) // 1000
 * extractBudgetValue({ amount: 1000 }) // 1000
 * extractBudgetValue({ type: 'range', min: 500, max: 1000 }) // 1000
 */
export const extractBudgetValue = (budget) => {
  if (budget === null || budget === undefined) return 0;
  if (typeof budget === 'number') return budget;
  if (typeof budget === 'string') {
    const parsed = parseFloat(budget);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof budget === 'object') {
    // Handle {amount, isNegotiable} format
    if (budget.amount !== undefined) {
      return typeof budget.amount === 'number' ? budget.amount : parseFloat(budget.amount) || 0;
    }
    // Handle {type:'range', min, max} format
    if (budget.type === 'range') {
      const min = budget.min || 0;
      const max = budget.max || 0;
      return Math.max(min, max); // Return max for display
    }
    // Handle {type:'range', min, max, isNegotiable} format
    if (budget.min !== undefined || budget.max !== undefined) {
      const min = budget.min || 0;
      const max = budget.max || 0;
      return Math.max(min, max);
    }
  }
  return 0;
};

/**
 * Extract deadline value from object or number
 * 
 * @param {any} deadline - The deadline value (number, string, or object)
 * @returns {number} - Extracted number value
 * 
 * @example
 * extractDeadlineValue(7) // 7
 * extractDeadlineValue({ days: 7 }) // 7
 * extractDeadlineValue({ type: 'range', min: 3, max: 7 }) // 7
 */
export const extractDeadlineValue = (deadline) => {
  if (deadline === null || deadline === undefined) return 0;
  if (typeof deadline === 'number') return deadline;
  if (typeof deadline === 'string') {
    const parsed = parseFloat(deadline);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof deadline === 'object') {
    // Handle {days, type} format
    if (deadline.days !== undefined) {
      return typeof deadline.days === 'number' ? deadline.days : parseFloat(deadline.days) || 0;
    }
    // Handle {type:'range', min, max} format
    if (deadline.type === 'range') {
      const min = deadline.min || 0;
      const max = deadline.max || 0;
      return Math.max(min, max);
    }
    if (deadline.min !== undefined || deadline.max !== undefined) {
      const min = deadline.min || 0;
      const max = deadline.max || 0;
      return Math.max(min, max);
    }
  }
  return 0;
};

/**
 * Format budget for display (returns string with Bangla negotiable text)
 * 
 * @param {any} budget - The budget value (number, string, or object)
 * @returns {string} - Formatted display string
 * 
 * @example
 * formatBudgetDisplay(1000) // "1000"
 * formatBudgetDisplay({ amount: 1000, isNegotiable: true }) // "1000 (আলোচনাসাপেক্ষ)"
 * formatBudgetDisplay({ type: 'range', min: 500, max: 1000 }) // "500-1000"
 */
export const formatBudgetDisplay = (budget) => {
  if (budget === null || budget === undefined) return '0';
  if (typeof budget === 'number') return String(budget);
  if (typeof budget === 'string') return budget;
  if (typeof budget === 'object') {
    if (budget.type === 'range') {
      const min = budget.min || 0;
      const max = budget.max || 0;
      const negotiable = budget.isNegotiable ? ' (আলোচনাসাপেক্ষ)' : '';
      return `${min}-${max}${negotiable}`;
    }
    const amount = budget.amount || 0;
    const negotiable = budget.isNegotiable ? ' (আলোচনাসাপেক্ষ)' : '';
    return `${amount}${negotiable}`;
  }
  return String(budget);
};

/**
 * Format deadline for display (returns string)
 * 
 * @param {any} deadline - The deadline value (number, string, or object)
 * @returns {string} - Formatted display string
 * 
 * @example
 * formatDeadlineDisplay(7) // "7"
 * formatDeadlineDisplay({ days: 7 }) // "7"
 * formatDeadlineDisplay({ type: 'range', min: 3, max: 7 }) // "3-7"
 */
export const formatDeadlineDisplay = (deadline) => {
  if (deadline === null || deadline === undefined) return '0';
  if (typeof deadline === 'number') return String(deadline);
  if (typeof deadline === 'string') return deadline;
  if (typeof deadline === 'object') {
    if (deadline.type === 'range') {
      const min = deadline.min || 0;
      const max = deadline.max || 0;
      return `${min}-${max}`;
    }
    const days = deadline.days || 0;
    return String(days);
  }
  return String(deadline);
};

// ============================================================
// ✅ sendProposal - FIXED (returns dealId)
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
    if (feedback) {
      feedback.alert.warning({ message: 'দয়া করে সব ফিল্ড পূরণ করুন!' });
    } else {
      alert('Please fill all fields!');
    }
    return { success: false, error: 'Missing fields' };
  }

  let buyerId, sellerId, buyerName, sellerName, buyerEmail, sellerEmail;
  
  console.log("🔍 sendProposal - ChatContext:", chatContext);
  console.log("🔍 sendProposal - CurrentUser:", currentUser);
  console.log("🔍 sendProposal - postType:", postType);
  console.log("🔍 sendProposal - userRole:", userRole);
  
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

  console.log("========== SEND PROPOSAL ==========");
  console.log("proposalData:", proposalData);
  console.log("chatContext:", chatContext);
  console.log("currentUser:", currentUser);
  console.log("buyerId:", buyerId);
  console.log("sellerId:", sellerId);
  console.log("postType:", postType);
  console.log("userRole:", userRole);
  console.trace("Called From");
  console.log("===================================");

  if (!buyerId || !sellerId) {
    if (feedback) {
      feedback.alert.error({ message: 'সিস্টেম ত্রুটি: ব্যবহারকারী শনাক্ত করা যায়নি।' });
    } else {
      alert("System Error: Could not identify users.");
    }
    return { success: false, error: 'User identification failed' };
  }

  if (buyerId === sellerId) {
    if (feedback) {
      feedback.alert.warning({ message: '❌ আপনি নিজেকে প্রপোজাল পাঠাতে পারবেন না!' });
    } else {
      alert("❌ You cannot send a proposal to yourself!");
    }
    return { success: false, error: 'Self proposal' };
  }

  const dealIdNumber = await generateDealId();
  const chatId = chatContext?.id || chatContext?.postId || `deal_${Date.now()}`;
  const milestones = generateMilestones(proposalData.budget);

  try {
    const dealPayload = {
      postId: chatContext?.id || chatContext?.postId || 'unknown_post',
      postTitle: chatContext?.title || 'Untitled Project',
      postType: postType,
      buyerId, buyerName, buyerEmail,
      sellerId, sellerName, sellerEmail,
      dealIdNumber,
      budget: Number(proposalData.budget),
      deadline: Number(proposalData.deadline),
      details: proposalData.details,
      milestones,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      proposedBy: sellerId,
      proposedAt: serverTimestamp(),
      chatId: chatId
    };

    const dealRef = await addDoc(collection(db, 'deals'), dealPayload);
    const dealId = dealRef.id;

    await addDoc(collection(db, 'notifications'), {
      userId: buyerId,
      event: NOTIFICATION_EVENTS.DEAL_CREATED,
      senderId: sellerId,
      senderName: sellerName || currentUser?.displayName || 'Someone',
      projectTitle: chatContext?.title || 'a project',
      dealId: dealId,
      dealIdNumber: dealIdNumber,
      budget: proposalData.budget,
      deadline: proposalData.deadline,
      message: `${sellerName || 'Someone'} sent you a new proposal for "${chatContext?.title || 'a project'}"`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    if (chatId) {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: `📄 **New Offer Sent!**\n\n💰 Budget: ${proposalData.budget} BDT\n⏱️ Deadline: ${proposalData.deadline} Days\n\n👤 From: ${sellerName}\n\n📋 Details: ${proposalData.details}`,
        sender: 'system',
        senderId: 'system',
        createdAt: serverTimestamp(),
        type: 'system',
        dealId: dealId
      });

      await updateDoc(doc(db, 'chats', chatId), {
        dealId: dealId,
        dealIdNumber: dealIdNumber,
        dealStatus: 'pending',
        updatedAt: serverTimestamp()
      });
    }

    if (feedback) {
      feedback.alert.success({ message: '✅ প্রপোজাল সফলভাবে পাঠানো হয়েছে!' });
    } else {
      alert('✅ Proposal sent successfully!');
    }

    sound?.playEventOnce?.(SOUND_EVENTS.DEAL_CREATED, { dedupeTime: 3000 }) || sound?.playEvent(SOUND_EVENTS.DEAL_CREATED);
    
    return { success: true, dealId: dealId };

  } catch (error) {
    console.error("❌ Error sending proposal:", error);
    if (feedback) {
      feedback.alert.error({ message: 'প্রপোজাল পাঠাতে ব্যর্থ হয়েছে: ' + error.message });
    } else {
      alert('Failed to send proposal: ' + error.message);
    }
    return { success: false, error: error.message };
  }
};

// ============================================================
// ✅ approveDeal - FIXED (dealId validation)
// ============================================================
export const approveDeal = async (existingDeal, currentUser, safeChatId, feedback, sound) => {
  if (!existingDeal || existingDeal.status !== 'pending') {
    if (feedback) {
      feedback.alert.warning({ message: 'কোনো পেন্ডিং অফার নেই!' });
    } else {
      alert('No pending offer!');
    }
    return;
  }

  const dealId = existingDeal.id || existingDeal.dealId;
  
  if (!dealId) {
    console.error('❌ No dealId found! existingDeal:', existingDeal);
    if (feedback) {
      feedback.alert.error({ message: 'সিস্টেম ত্রুটি: ডিল আইডি পাওয়া যায়নি।' });
    }
    return;
  }

  const key = `approve_${dealId}`;
  
  if (_dealActionMap.has(key)) {
    const lastTime = _dealActionMap.get(key);
    if (Date.now() - lastTime < 5000) {
      console.warn('⏳ Deal already approved recently');
      if (feedback) {
        feedback.alert.info({ message: 'ডিল ইতিমধ্যে অ্যাপ্রুভ করা হয়েছে!' });
      }
      return;
    }
  }

  try {
    const dealRef = doc(db, 'deals', dealId);
    const dealSnap = await getDoc(dealRef);
    if (!dealSnap.exists()) {
      console.error('❌ Deal not found in Firestore:', dealId);
      if (feedback) {
        feedback.alert.error({ message: 'ডিল খুঁজে পাওয়া যায়নি!' });
      }
      return;
    }
  } catch (error) {
    console.error('❌ Error verifying deal:', error);
    if (feedback) {
      feedback.alert.error({ message: 'ডিল ভেরিফাই করতে সমস্যা হয়েছে' });
    }
    return;
  }

  let confirmed = true;
  if (feedback) {
    confirmed = await feedback.confirm({
      title: 'ডিল কনফর্ম করুন',
      message: '✅ আপনি কি এই ডিলটি কনফর্ম করতে চান?',
      confirmText: 'হ্যাঁ, কনফর্ম করুন',
      cancelText: 'না',
      variant: 'success'
    });
  } else {
    confirmed = window.confirm('✅ Are you sure you want to confirm this deal?');
  }
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
      dealId: dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      budget: existingDeal.budget,
      message: `✅ Your proposal for "${existingDeal.postTitle || 'a project'}" has been approved! 🎉`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.buyerId,
      event: NOTIFICATION_EVENTS.DEAL_APPROVED,
      dealId: dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      budget: existingDeal.budget,
      message: `✅ You have approved the deal "${existingDeal.postTitle || 'a project'}"! 🎉`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    if (feedback) {
      feedback.alert.success({ message: '🎉 ডিল কনফর্ম করা হয়েছে!' });
    } else {
      alert('🎉 Deal confirmed!');
    }

    sound?.playEventOnce?.(SOUND_EVENTS.DEAL_APPROVED, { dedupeTime: 3000 }) || sound?.playEvent(SOUND_EVENTS.DEAL_APPROVED);

    _dealActionMap.set(key, Date.now());
    setTimeout(() => {
      _dealActionMap.delete(key);
    }, 5000);

  } catch (error) {
    console.error("Error:", error);
    if (feedback) {
      feedback.alert.error({ message: 'ডিল কনফর্ম করতে ব্যর্থ হয়েছে: ' + error.message });
    } else {
      alert('Failed to confirm deal: ' + error.message);
    }
  }
};

// ============================================================
// ✅ rejectDeal - FIXED (dealId validation)
// ============================================================
export const rejectDeal = async (existingDeal, currentUser, safeChatId, feedback, sound) => {
  if (!existingDeal || existingDeal.status !== 'pending') {
    if (feedback) {
      feedback.alert.warning({ message: 'প্রত্যাখ্যান করার মতো কোনো পেন্ডিং অফার নেই!' });
    } else {
      alert('No pending offer to reject!');
    }
    return;
  }

  const dealId = existingDeal.id || existingDeal.dealId;
  
  if (!dealId) {
    console.error('❌ No dealId found! existingDeal:', existingDeal);
    if (feedback) {
      feedback.alert.error({ message: 'সিস্টেম ত্রুটি: ডিল আইডি পাওয়া যায়নি।' });
    }
    return;
  }

  try {
    const dealRef = doc(db, 'deals', dealId);
    const dealSnap = await getDoc(dealRef);
    if (!dealSnap.exists()) {
      console.error('❌ Deal not found in Firestore:', dealId);
      if (feedback) {
        feedback.alert.error({ message: 'ডিল খুঁজে পাওয়া যায়নি!' });
      }
      return;
    }
  } catch (error) {
    console.error('❌ Error verifying deal:', error);
    if (feedback) {
      feedback.alert.error({ message: 'ডিল ভেরিফাই করতে সমস্যা হয়েছে' });
    }
    return;
  }

  const key = `reject_${dealId}`;
  
  if (_dealActionMap.has(key)) {
    const lastTime = _dealActionMap.get(key);
    if (Date.now() - lastTime < 5000) {
      console.warn('⏳ Deal already rejected recently');
      if (feedback) {
        feedback.alert.info({ message: 'ডিল ইতিমধ্যে রিজেক্ট করা হয়েছে!' });
      }
      return;
    }
  }

  let confirmed = true;
  if (feedback) {
    confirmed = await feedback.confirm({
      title: 'অফার প্রত্যাখ্যান করুন',
      message: '⚠️ আপনি কি এই অফারটি প্রত্যাখ্যান করতে চান?',
      confirmText: 'হ্যাঁ, প্রত্যাখ্যান করুন',
      cancelText: 'না',
      variant: 'warning'
    });
  } else {
    confirmed = window.confirm('⚠️ Are you sure you want to reject this offer?');
  }
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
      dealId: dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      message: `❌ Your proposal for "${existingDeal.postTitle || 'a project'}" was rejected.`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.buyerId,
      event: NOTIFICATION_EVENTS.DEAL_REJECTED,
      dealId: dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      message: `❌ You have rejected the deal "${existingDeal.postTitle || 'a project'}".`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    if (feedback) {
      feedback.alert.success({ message: '❌ অফার সফলভাবে প্রত্যাখ্যান করা হয়েছে!' });
    } else {
      alert('❌ Offer rejected successfully!');
    }

    sound?.playEventOnce?.(SOUND_EVENTS.DEAL_REJECTED, { dedupeTime: 3000 }) || sound?.playEvent(SOUND_EVENTS.DEAL_REJECTED);

    _dealActionMap.set(key, Date.now());
    setTimeout(() => {
      _dealActionMap.delete(key);
    }, 5000);

  } catch (error) {
    console.error("❌ Error rejecting deal:", error);
    if (feedback) {
      feedback.alert.error({ message: 'অফার প্রত্যাখ্যান করতে ব্যর্থ হয়েছে: ' + error.message });
    } else {
      alert('Failed to reject offer: ' + error.message);
    }
  }
};

// ============================================================
// ✅ reopenDeal - FIXED (dealId validation)
// ============================================================
export const reopenDeal = async (existingDeal, currentUser, safeChatId, feedback, sound) => {
  const dealId = existingDeal?.id || existingDeal?.dealId || safeChatId;
  
  if (!dealId) {
    console.error('❌ No dealId found! existingDeal:', existingDeal);
    if (feedback) {
      feedback.alert.error({ message: 'সিস্টেম ত্রুটি: ডিল আইডি পাওয়া যায়নি।' });
    }
    return;
  }

  const key = `reopen_${dealId}`;
  
  if (_dealActionMap.has(key)) {
    const lastTime = _dealActionMap.get(key);
    if (Date.now() - lastTime < 5000) {
      console.warn('⏳ Deal already reopened recently');
      if (feedback) {
        feedback.alert.info({ message: 'ডিল ইতিমধ্যে পুনরায় খোলা হয়েছে!' });
      }
      return;
    }
  }

  try {
    const dealRef = doc(db, 'deals', dealId);
    const dealSnap = await getDoc(dealRef);
    if (!dealSnap.exists()) {
      console.error('❌ Deal not found in Firestore:', dealId);
      if (feedback) {
        feedback.alert.error({ message: 'ডিল খুঁজে পাওয়া যায়নি!' });
      }
      return;
    }
  } catch (error) {
    console.error('❌ Error verifying deal:', error);
    if (feedback) {
      feedback.alert.error({ message: 'ডিল ভেরিফাই করতে সমস্যা হয়েছে' });
    }
    return;
  }

  let confirmed = true;
  if (feedback) {
    confirmed = await feedback.confirm({
      title: 'ডিল পুনরায় খুলুন',
      message: '⚠️ আপনি কি এই বাতিল করা ডিলটি পুনরায় খুলতে চান?',
      confirmText: 'হ্যাঁ, পুনরায় খুলুন',
      cancelText: 'না',
      variant: 'info'
    });
  } else {
    confirmed = window.confirm("⚠️ Are you sure you want to re-open this cancelled deal?");
  }
  if (!confirmed) return;

  try {
    const dealRef = doc(db, 'deals', dealId);
    const dealSnap = await getDoc(dealRef);
    
    if (!dealSnap.exists()) {
      if (feedback) {
        feedback.alert.error({ message: 'ডিল খুঁজে পাওয়া যায়নি!' });
      }
      return;
    }

    const currentStatus = dealSnap.data()?.status;
    
    if (currentStatus === 'pending') {
      if (feedback) {
        feedback.alert.info({ message: 'এই ডিল ইতিমধ্যে খোলা আছে!' });
      }
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
      dealId: dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      message: `🔄 Deal "${existingDeal.postTitle || 'a project'}" has been re-opened by ${currentUser?.displayName || 'Someone'}.`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, 'notifications'), {
      userId: existingDeal.sellerId,
      event: NOTIFICATION_EVENTS.DEAL_REOPENED,
      dealId: dealId,
      projectTitle: existingDeal.postTitle || 'a project',
      message: `🔄 You have re-opened the deal "${existingDeal.postTitle || 'a project'}".`,
      isUnread: true,
      createdAt: serverTimestamp(),
    });

    if (feedback) {
      feedback.alert.success({ message: '✅ ডিল সফলভাবে পুনরায় খোলা হয়েছে!' });
    } else {
      alert("✅ Deal re-opened successfully!");
    }

    sound?.playEventOnce?.(SOUND_EVENTS.DEAL_REOPENED, { dedupeTime: 3000 }) || sound?.playEvent(SOUND_EVENTS.DEAL_REOPENED);

    _dealActionMap.set(key, Date.now());
    setTimeout(() => {
      _dealActionMap.delete(key);
    }, 5000);

  } catch (error) {
    console.error("Error re-opening deal:", error);
    if (feedback) {
      feedback.alert.error({ message: 'ডিল পুনরায় খুলতে ব্যর্থ হয়েছে: ' + error.message });
    } else {
      alert("Failed to re-open deal: " + error.message);
    }
  }
};

// ============================================================
// ✅ checkActiveDealBetweenUsers - Check if two users have active deals
// ============================================================
export const checkActiveDealBetweenUsers = async (userId1, userId2) => {
  if (!userId1 || !userId2) {
    return { hasActiveDeal: false, error: 'User IDs required', count: 0, activeDeals: [] };
  }

  try {
    const dealsRef = collection(db, 'deals');
    
    const q1 = query(
      dealsRef,
      where('participants', 'array-contains', userId1),
      where('status', 'in', ['active', 'overdue'])
    );
    
    const snapshot1 = await getDocs(q1);
    
    const activeDeals = snapshot1.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(deal => {
        const participants = deal.participants || [];
        const isParticipant = participants.includes(userId2) || 
                             deal.buyerId === userId2 || 
                             deal.sellerId === userId2;
        return isParticipant;
      });
    
    return {
      hasActiveDeal: activeDeals.length > 0,
      activeDeals: activeDeals,
      count: activeDeals.length
    };
    
  } catch (error) {
    console.error('❌ Error checking active deals:', error);
    return { hasActiveDeal: false, error: error.message, count: 0, activeDeals: [] };
  }
};

// ============================================================
// ✅ checkActiveDealForUser - Check if a user has any active deals
// ============================================================
export const checkActiveDealForUser = async (userId) => {
  if (!userId) {
    return { hasActiveDeal: false, error: 'User ID required', count: 0, activeDeals: [] };
  }

  try {
    const dealsRef = collection(db, 'deals');
    const q = query(
      dealsRef,
      where('participants', 'array-contains', userId),
      where('status', 'in', ['active', 'overdue'])
    );
    
    const snapshot = await getDocs(q);
    const activeDeals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return {
      hasActiveDeal: activeDeals.length > 0,
      activeDeals: activeDeals,
      count: activeDeals.length
    };
    
  } catch (error) {
    console.error('❌ Error checking active deals:', error);
    return { hasActiveDeal: false, error: error.message, count: 0, activeDeals: [] };
  }
};