// src/utils/dealIdHelper.js
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/firebase';

/**
 * ডিলের জন্য ইউনিক আইডি জেনারেট করার ফাংশন
 * ফরম্যাট: DL-XXXXX (যেমন: DL-00123)
 */
export const generateDealId = async () => {
  try {
    // কাউন্টার ডকুমেন্ট রেফারেন্স
    const counterRef = doc(db, 'metadata', 'dealCounter');
    const counterSnap = await getDoc(counterRef);

    let newCount = 1001;
    
    if (counterSnap.exists()) {
      // কাউন্টার আপডেট
      newCount = counterSnap.data().count + 1;
      await updateDoc(counterRef, { count: increment(1) });
    } else {
      // কাউন্টার তৈরি
      await setDoc(counterRef, { count: 1001 });
    }

    // ফরম্যাট: DL-XXXXX (5 ডিজিট)
    const paddedCount = String(newCount).padStart(5, '0');
    return `DL-${paddedCount}`;
    
  } catch (error) {
    console.error("Error generating deal ID:", error);
    // Error হলে টাইমস্টাম্প বেসড আইডি
    return `DL-${Date.now().toString().slice(-6)}`;
  }
};

/**
 * ডিল আইডি ভ্যালিডেট করার ফাংশন
 */
export const validateDealId = (dealId) => {
  const pattern = /^DL-\d{5}$/;
  return pattern.test(dealId);
};