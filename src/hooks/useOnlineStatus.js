// src/hooks/useOnlineStatus.js
//
// ⚠️ CALL-SITE ওয়ার্নিং (README দেখো): এই হুক অ্যাপের ROOT-এ একবার
// মাউন্ট হওয়া উচিত — কোনো per-screen কম্পোনেন্টে (যেমন ChatInterface.jsx)
// না। কারণ cleanup ফাংশন isOnline:false সেট করে, আর যদি এটা এমন কোনো
// কম্পোনেন্টে বসানো থাকে যেটা ঘন ঘন mount/unmount হয় (একটা চ্যাট খোলা/
// বন্ধ করা), তাহলে ইউজার প্রতিবার চ্যাট বন্ধ করলেই ভুলভাবে "Offline"
// দেখাবে, যদিও সে তখনো অ্যাপে সক্রিয়। এই ফাইলের লজিক নিজে থেকে ঠিক আছে,
// শুধু কোথায় কল হচ্ছে সেটাই সমস্যা — সেটা App.jsx/root layout ফাইল
// দেখার পর ঠিক করা হবে।
//
// এছাড়া, beforeunload হ্যান্ডলারের ভেতরের `await updateDoc(...)` ব্রাউজার
// গ্যারান্টি দেয় না সম্পূর্ণ হবে (ট্যাব বন্ধ/ক্র্যাশে মাঝপথে বাতিল হতে
// পারে) — এটা Firestore SDK দিয়ে সম্পূর্ণ নির্ভরযোগ্যভাবে ফিক্স করা যায়
// না ছোট প্যাচে; UI-তে "online" নির্ধারণ করার সময় শুধু isOnline বুলিয়ানের
// বদলে lastSeen-এর recency-ও বিবেচনা করা ভালো (আলাদা প্রোডাক্ট সিদ্ধান্ত)।
import { useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { logger } from '@/utils/logger';

export const useOnlineStatus = (currentUser) => {
  useEffect(() => {
    if (!currentUser?.uid) return;

    const userRef = doc(db, 'users', currentUser.uid);

    const updateOnlineStatus = async () => {
      try {
        await updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() });
      } catch (error) {
        logger.error("Error updating online status:", error);
      }
    };

    updateOnlineStatus();

    const handleBeforeUnload = async () => {
      try {
        await updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() });
      } catch (error) {
        logger.error("Error setting offline:", error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const interval = setInterval(async () => {
      try {
        await updateDoc(userRef, { lastSeen: serverTimestamp() });
      } catch (error) {
        logger.error("Error updating lastSeen:", error);
      }
    }, 30000);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(interval);
      updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() })
        .catch(error => logger.error("Error setting offline on unmount:", error));
    };
  }, [currentUser?.uid]);
};
