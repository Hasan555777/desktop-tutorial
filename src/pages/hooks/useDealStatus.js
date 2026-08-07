import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { 
  doc, getDoc, getDocs, collection, query, where, updateDoc 
} from 'firebase/firestore';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';

export const useDealStatus = (chatId, currentUser) => {
  const [existingDeal, setExistingDeal] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedBy, setBlockedBy] = useState(null);
  const [isActiveDeal, setIsActiveDeal] = useState(false);
  const feedback = useFeedback();

  useEffect(() => {
    const checkChatStatus = async () => {
      if (!chatId) return;
      try {
        const chatRef = doc(db, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
          const data = chatSnap.data();
          setIsBlocked(data.isBlocked === true);
          setBlockedBy(data.blockedBy || null);
          setIsActiveDeal(data.status === 'active' || false);
        }
      } catch (error) {
        console.error("Error checking chat status:", error);
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
          const dealRef = doc(db, 'deals', chatId);
          const dealSnap = await getDoc(dealRef);
          if (dealSnap.exists()) {
            const dealData = dealSnap.data();
            setExistingDeal({ id: chatId, ...dealData });
            setIsActiveDeal(dealData.status === 'active');
          } else {
            setExistingDeal(null);
            setIsActiveDeal(false);
          }
        }
      } catch (error) {
        console.error("Error checking deal:", error);
        setExistingDeal(null);
        setIsActiveDeal(false);
      }
    };
    checkExistingDeal();
  }, [chatId]);

  const unblockUser = async (displayName) => {
    if (blockedBy !== currentUser?.uid) {
      feedback.alert.warning({ message: '⚠️ You are not the one who blocked this user.' });
      return;
    }

    const confirmed = await feedback.confirm({
      title: 'Unblock User',
      message: `Are you sure you want to unblock ${displayName || 'this user'}?`,
      okText: 'Yes, Unblock',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        blockedBy: null,
        blockedAt: null,
        isBlocked: false,
        blockedUserName: null,
        blockedUserEmail: null
      });
      setIsBlocked(false);
      setBlockedBy(null);
      feedback.alert.success({ message: '✅ User unblocked successfully!' });
    } catch (error) {
      console.error("❌ Error unblocking:", error);
      feedback.alert.error({ message: 'Failed to unblock user.' });
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