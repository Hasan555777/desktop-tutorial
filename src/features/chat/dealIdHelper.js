// src\pages\dealIdHelper.js
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../shared/firebase/index';
import { logger } from '../../shared/utils/logger';

/**
 * ডিলের জন্য ইউনিক আইডি জেনারেট করার ফাংশন
 * ফরম্যাট: DL-XXXXX (যেমন: DL-00123)
 *
 * FIX: আগের ভার্সন getDoc() দিয়ে কাউন্টার পড়ে, তারপর আলাদাভাবে
 * updateDoc({ count: increment(1) }) করত — read আর write আলাদা হওয়ায়
 * দুইটা concurrent কল একই count পড়ে একই Deal ID রিটার্ন করতে পারত
 * (ডুপ্লিকেট DL-XXXXX)। এখন পুরো read+write একটা runTransaction-এর
 * ভেতরে atomic — কখনো দুইটা কল একই নম্বর পাবে না।
 */
export const generateDealId = async () => {
  const counterRef = doc(db, 'metadata', 'dealCounter');

  try {
    const newCount = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const current = counterSnap.exists() ? counterSnap.data().count : 1000;
      const next = current + 1;
      transaction.set(counterRef, { count: next }, { merge: true });
      return next;
    });

    const paddedCount = String(newCount).padStart(5, '0');
    return `DL-${paddedCount}`;
  } catch (error) {
    logger.error('Error generating deal ID:', error);
    // Firestore আনরিচেবল হলেও ডিল তৈরি যেন আটকে না যায় — টাইমস্ট্যাম্প-বেসড fallback ID।
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





