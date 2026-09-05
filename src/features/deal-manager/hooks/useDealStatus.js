// src/hooks/useDealStatus.js
import { useState, useEffect } from 'react';
import { db } from '../../../shared/firebase/index';
import {
  doc, getDoc, getDocs, collection, query, where, updateDoc, runTransaction
} from 'firebase/firestore';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import { logger } from '../../../shared/utils/logger';

// otherPartyId প্যারামিটার নেওয়া হচ্ছে যাতে unblockUser userBlocks/{blockerId_targetId}
// ডকুমেন্টও একসাথে ক্লিন করতে পারে — নাহলে ব্লক করার সময় তৈরি হওয়া এই
// ডকুমেন্টটা আনব্লক করার পরও অরফান হয়ে থেকে যায় এবং future block-checking-এ
// ভুল ফলাফল দিতে পারে।
export const useDealStatus = (chatId, currentUser, otherPartyId) => {
  const [existingDeal, setExistingDeal] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedBy, setBlockedBy] = useState(null);
  const [isActiveDeal, setIsActiveDeal] = useState(false);
  const feedback = useFeedback();

  // চ্যাট ডকুমেন্ট থেকে শুধু ব্লক-স্ট্যাটাস পড়া হয়। "active deal" স্ট্যাটাসের
  // সোর্স অফ ট্রুথ হলো `deals` কালেকশন (নিচের effect) — chats/{chatId}.status
  // থেকে আলাদাভাবে isActiveDeal সেট করলে দুইটা async কলের race condition-এ
  // stale/inconsistent ভ্যালু দেখানোর ঝুঁকি থাকে, তাই এখানে সরিয়ে দেওয়া হলো।
  useEffect(() => {
    const checkChatStatus = async () => {
      if (!chatId) return;
      try {
        const chatSnap = await getDoc(doc(db, 'chats', chatId));
        if (chatSnap.exists()) {
          const data = chatSnap.data();
          setIsBlocked(data.isBlocked === true);
          setBlockedBy(data.blockedBy || null);
        }
      } catch (error) {
        logger.error("Error checking chat status:", error);
      }
    };
    checkChatStatus();
  }, [chatId, currentUser]);

  useEffect(() => {
    const checkExistingDeal = async () => {
      if (!chatId) return;
      try {
        const dealsRef = collection(db, 'deals');
        const q = query(dealsRef, where('chatId', '==', chatId));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const dealDoc = querySnapshot.docs[0];
          const dealData = dealDoc.data();
          setExistingDeal({ id: dealDoc.id, ...dealData });
          setIsActiveDeal(dealData.status === 'active');
        } else {
          // NOTE: sendProposal() (chatHelpers.js) সবসময় addDoc() দিয়ে random ID
          // সহ deal তৈরি করে, chatId-কে deal ID হিসেবে ব্যবহার করে না — কিন্তু
          // dealPayload.chatId ফিল্ড ঠিকই সেট করে, তাই ওপরের where('chatId', ...)
          // কোয়েরিই সবসময় সঠিক ডিল খুঁজে পাবে। "deal doc id == chatId" ধরে নিয়ে
          // আলাদা getDoc(doc(db,'deals',chatId)) fallback চেষ্টা করা অর্থহীন ছিল
          // (কখনো ম্যাচ করত না) — বাদ দেওয়া হলো।
          setExistingDeal(null);
          setIsActiveDeal(false);
        }
      } catch (error) {
        logger.error("Error checking deal:", error);
        setExistingDeal(null);
        setIsActiveDeal(false);
      }
    };
    checkExistingDeal();
  }, [chatId]);

  const unblockUser = async (displayName) => {
    if (blockedBy !== currentUser?.uid) {
      feedback.alert.warning({ message: '⚠️ আপনি এই ইউজারকে ব্লক করেননি।' });
      return;
    }

    const confirmed = await feedback.confirm({
      title: 'ইউজার আনব্লক করুন',
      message: `আপনি কি ${displayName || 'এই ইউজার'} কে আনব্লক করতে চান?`,
      confirmText: 'হ্যাঁ, আনব্লক করুন',
      cancelText: 'না'
    });
    if (!confirmed) return;

    try {
      const chatRef = doc(db, 'chats', chatId);
      const chatUpdates = {
        blockedBy: null,
        blockedAt: null,
        isBlocked: false,
        blockedUserName: null,
        blockedUserEmail: null
      };

      if (otherPartyId) {
        await runTransaction(db, async (transaction) => {
          const blockRef = doc(db, 'userBlocks', `${currentUser.uid}_${otherPartyId}`);
          transaction.delete(blockRef);
          transaction.update(chatRef, chatUpdates);
        });
      } else {
        // otherPartyId না থাকলে অন্তত চ্যাট আনব্লক হোক — userBlocks ডকুমেন্ট
        // এই ক্ষেত্রে সাফ হবে না, তাই কলার-সাইডে otherPartyId পাঠানো নিশ্চিত করা ভালো।
        logger.warn('unblockUser called without otherPartyId — userBlocks doc will not be cleaned up');
        await updateDoc(chatRef, chatUpdates);
      }

      setIsBlocked(false);
      setBlockedBy(null);
      feedback.alert.success({ message: '✅ ইউজার সফলভাবে আনব্লক করা হয়েছে!' });
    } catch (error) {
      logger.error("Error unblocking:", error);
      feedback.alert.error({ message: 'ইউজার আনব্লক করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    }
  };

  return {
    existingDeal,
    setExistingDeal,
    isBlocked,
    setIsBlocked,
    blockedBy,
    setBlockedBy,
    isActiveDeal,
    setIsActiveDeal,
    unblockUser
  };
};
