import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { 
  doc, getDoc, getDocs, collection, query, where, updateDoc 
} from 'firebase/firestore';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider'; // ✅ যোগ করুন

export const useDealStatus = (chatId, currentUser) => {
  const [existingDeal, setExistingDeal] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedBy, setBlockedBy] = useState(null);
  const [isActiveDeal, setIsActiveDeal] = useState(false);
  const feedback = useFeedback(); // ✅ যোগ করুন

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
    // ✅ alert কে feedback দিয়ে রিপ্লেস
    if (blockedBy !== currentUser?.uid) {
      feedback.alert.warning({ 
        message: '⚠️ আপনি এই ইউজারকে ব্লক করেননি।' 
      });
      return;
    }

    // ✅ confirm কে feedback.confirm দিয়ে রিপ্লেস
    const confirmed = await feedback.confirm({
      title: 'ইউজার আনব্লক করুন',
      message: `আপনি কি ${displayName || 'এই ইউজার'} কে আনব্লক করতে চান?`,
      okText: 'হ্যাঁ, আনব্লক করুন',
      cancelText: 'না'
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
      
      // ✅ alert কে feedback দিয়ে রিপ্লেস
      feedback.alert.success({ 
        message: '✅ ইউজার সফলভাবে আনব্লক করা হয়েছে!' 
      });
    } catch (error) {
      console.error("❌ Error unblocking:", error);
      // ✅ alert কে feedback দিয়ে রিপ্লেস
      feedback.alert.error({ 
        message: 'ইউজার আনব্লক করতে ব্যর্থ হয়েছে।' 
      });
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