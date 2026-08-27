// src\hooks\useChatActions.js
//
// ব্লক/ডিলিট/আনব্লক-এর আসল Firestore লজিক — আগে এটা useInboxChats.js-এর
// ভেতরে লেখা ছিল, আর ChatInterface.jsx-এ শুধু "// TODO: Implement actual
// block logic here" রেখে একটা মিথ্যা সাকসেস মেসেজ দেখানো হতো। এখন দুই
// জায়গা থেকেই এই একটামাত্র হুক ব্যবহার হয়, তাই ভবিষ্যতে ফিক্স/পরিবর্তন
// একজায়গায় করলেই দুই জায়গাতেই প্রযোজ্য হবে।
//
// ব্যবহার:
//   const { handleDeleteChat, handleBlockUser, handleUnblockUser } = useChatActions(currentUser);
//   await handleBlockUser(chatObject); // পুরো chat object পাঠাতে হবে, শুধু id না —
//                                       // এই ফাংশনগুলো chat.otherPartyId/buyerId/sellerId/
//                                       // participants পড়ে অন্য পক্ষ শনাক্ত করে।

import { useCallback } from 'react';
import { doc, runTransaction, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { chatRules } from '@/rules/chatRules';
import { checkActiveDealBetweenUsers } from '@/pages/chatHelpers';
import { logger } from '@/utils/logger';

const getDisplayName = (chat) => {
  if (!chat) return 'Unknown User';
  return chat.otherPartyName ||
    chat.buyerName ||
    chat.sellerName ||
    chat.displayName ||
    chat.email?.split('@')[0] ||
    'Unknown User';
};

const extractOtherUserId = (chat, currentUserId) => {
  if (!chat || !currentUserId) return null;

  let targetId = chat.otherPartyId;

  if (!targetId) {
    if (chat.buyerId && chat.buyerId !== currentUserId) {
      targetId = chat.buyerId;
    } else if (chat.sellerId && chat.sellerId !== currentUserId) {
      targetId = chat.sellerId;
    } else if (Array.isArray(chat.participants) && chat.participants.length > 0) {
      targetId = chat.participants.find(id => id !== currentUserId);
    } else if (chat.userId && chat.userId !== currentUserId) {
      targetId = chat.userId;
    } else if (chat.ownerId && chat.ownerId !== currentUserId) {
      targetId = chat.ownerId;
    }
  }

  if (!targetId) {
    const allIds = [
      chat.otherPartyId, chat.buyerId, chat.sellerId, chat.userId, chat.ownerId,
      ...(chat.participants || [])
    ].filter(id => id && id !== currentUserId);
    if (allIds.length > 0) targetId = allIds[0];
  }

  return targetId || null;
};

export const useChatActions = (currentUser, options = {}) => {
  const feedback = useFeedback();
  const isAdmin = !!options.isAdmin;

  // ============================================================
  // ✅ DELETE CHAT
  // ============================================================
  const handleDeleteChat = useCallback(async (chat) => {
    const targetUserId = extractOtherUserId(chat, currentUser?.uid);

    if (!targetUserId || !currentUser?.uid) {
      feedback.alert.error({ message: 'ইউজার আইডেন্টিফাই করা যায়নি! দয়া করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।' });
      return false;
    }

    const { hasActiveDeal, count, activeDeals } = await checkActiveDealBetweenUsers(currentUser.uid, targetUserId);
    if (hasActiveDeal) {
      const dealTitles = activeDeals.map(d => d.postTitle || 'Untitled Deal').join(', ');
      feedback.alert.warning({
        message: `⛔ Active Deal থাকার কারণে চ্যাট ডিলিট করা যাচ্ছে না!\n\nআপনার ${count} টি Active Deal আছে:\n${dealTitles}\n\nActive Deal শেষ না হওয়া পর্যন্ত চ্যাট ডিলিট করা যাবে না।`
      });
      return false;
    }

    const isChatOwner = Array.isArray(chat.participants) ? chat.participants.includes(currentUser?.uid) : false;
    const rule = chatRules.canDeleteConversation({
      userId: currentUser?.uid,
      chatId: chat.id,
      isAdmin,
      isChatOwner,
      hasActiveDeal: chat.isActiveDeal || false,
      isGroupChat: chat.isGroupChat || false
    });
    if (!rule.allowed) {
      feedback.alert.warning({ message: rule.message });
      return false;
    }

    const confirmed = await feedback.confirm({
      title: 'চ্যাট ডিলিট করুন',
      message: '⚠️ আপনি কি এই কনভার্সেশন স্থায়ীভাবে ডিলিট করতে চান?',
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'না'
    });
    if (!confirmed) return false;

    try {
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, 'chats', chat.id, 'messages');
        const messagesSnapshot = await getDocs(messagesRef);
        messagesSnapshot.docs.forEach(d => transaction.delete(d.ref));
        transaction.delete(doc(db, 'chats', chat.id));
      });

      feedback.alert.success({ message: '✅ কনভার্সেশন সফলভাবে ডিলিট করা হয়েছে!' });
      return true;
    } catch (error) {
      logger.error("Delete chat error:", error);
      feedback.alert.error({ message: 'কনভার্সেশন ডিলিট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
      return false;
    }
  }, [currentUser?.uid, isAdmin, feedback]);

  // ============================================================
  // ✅ BLOCK USER
  // ============================================================
  const handleBlockUser = useCallback(async (chat) => {
    const targetUserId = extractOtherUserId(chat, currentUser?.uid);

    if (!targetUserId || !currentUser?.uid) {
      feedback.alert.error({ message: 'ইউজার আইডেন্টিফাই করা যায়নি! দয়া করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।' });
      return false;
    }

    const userName = getDisplayName(chat);

    const { hasActiveDeal, count, activeDeals } = await checkActiveDealBetweenUsers(currentUser.uid, targetUserId);
    if (hasActiveDeal) {
      const dealTitles = activeDeals.map(d => d.postTitle || 'Untitled Deal').join(', ');
      feedback.alert.warning({
        message: `⛔ Active Deal থাকার কারণে ${userName} কে ব্লক করা যাচ্ছে না!\n\nআপনার ${count} টি Active Deal আছে:\n${dealTitles}\n\nActive Deal শেষ না হওয়া পর্যন্ত ব্লক করা যাবে না।`
      });
      return false;
    }

    const rule = chatRules.canBlockUser({
      blockerId: currentUser?.uid,
      targetId: targetUserId,
      targetRole: chat.otherPartyRole || 'client',
      hasActiveDealWithTarget: chat.isActiveDeal || false,
      isAdmin,
      blockCount: 0
    });
    if (!rule.allowed) {
      feedback.alert.warning({ message: rule.message });
      return false;
    }

    const confirmed = await feedback.confirm({
      title: 'ইউজার ব্লক করুন',
      message: `⚠️ আপনি কি ${userName} কে ব্লক করতে চান?`,
      confirmText: 'হ্যাঁ, ব্লক করুন',
      cancelText: 'না'
    });
    if (!confirmed) return false;

    try {
      const blockDocId = `${currentUser.uid}_${targetUserId}`;
      const blockRef = doc(db, 'userBlocks', blockDocId);

      await runTransaction(db, async (transaction) => {
        transaction.set(blockRef, {
          blockerId: String(currentUser.uid),
          blockedId: String(targetUserId),
          blockedUserName: String(userName),
          blockedUserEmail: String(chat.otherPartyEmail || ''),
          reason: rule.data?.blockReason || 'User requested block',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        const chatRef = doc(db, 'chats', chat.id);
        transaction.update(chatRef, {
          isBlocked: true,
          blockedBy: String(currentUser.uid),
          blockRef: blockRef.path,
          blockedAt: serverTimestamp()
        });
      });

      feedback.alert.success({ message: `✅ ${userName} কে ব্লক করা হয়েছে!` });
      return true;
    } catch (error) {
      logger.error("Block user error:", error);
      feedback.alert.error({ message: 'ইউজার ব্লক করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
      return false;
    }
  }, [currentUser?.uid, isAdmin, feedback]);

  // ============================================================
  // ✅ UNBLOCK USER — চ্যাট ডকুমেন্ট আর userBlocks ডকুমেন্ট একসাথে,
  // একটা transaction-এ ক্লিন হয়। block করার সময় দুইটা জায়গায় লেখা হয়
  // (chats/{id} এবং userBlocks/{blockerId_targetId}), তাই আনব্লক করার
  // সময়ও দুইটাই একসাথে সাফ করতে হবে — নাহলে userBlocks-এ অরফান
  // ডকুমেন্ট থেকে যায় এবং future block-checking-এ ভুল ফলাফল দেয়।
  // ============================================================
  const handleUnblockUser = useCallback(async (chat) => {
    const targetUserId = extractOtherUserId(chat, currentUser?.uid);

    if (!targetUserId || !currentUser?.uid) {
      feedback.alert.error({ message: 'ইউজার আইডেন্টিফাই করা যায়নি! দয়া করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।' });
      return false;
    }

    const userName = getDisplayName(chat);

    const rule = chatRules.canUnblockUser({
      blockerId: currentUser?.uid,
      targetId: targetUserId,
      isAdmin
    });
    if (!rule.allowed) {
      feedback.alert.warning({ message: rule.message });
      return false;
    }

    const confirmed = await feedback.confirm({
      title: 'ইউজার আনব্লক করুন',
      message: `⚠️ আপনি কি ${userName} কে আনব্লক করতে চান?`,
      confirmText: 'হ্যাঁ, আনব্লক করুন',
      cancelText: 'না'
    });
    if (!confirmed) return false;

    try {
      await runTransaction(db, async (transaction) => {
        const blockRef = doc(db, 'userBlocks', `${currentUser?.uid}_${targetUserId}`);
        transaction.delete(blockRef);

        const chatRef = doc(db, 'chats', chat.id);
        transaction.update(chatRef, {
          isBlocked: false,
          blockedBy: null,
          blockRef: null,
          blockedAt: null
        });
      });

      feedback.alert.success({ message: `✅ ${userName} কে আনব্লক করা হয়েছে!` });
      return true;
    } catch (error) {
      logger.error("Unblock user error:", error);
      feedback.alert.error({ message: 'ইউজার আনব্লক করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
      return false;
    }
  }, [currentUser?.uid, isAdmin, feedback]);

  return { handleDeleteChat, handleBlockUser, handleUnblockUser, extractOtherUserId };
};

export default useChatActions;
