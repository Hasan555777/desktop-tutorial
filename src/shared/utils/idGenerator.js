// src/utils/idGenerator.js
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/index";

/**
 * ইউনিক আইডি জেনারেট করুন
 * @param {string} prefix - আইডির প্রিফিক্স (WH, WL, DL, TX)
 * @param {string} collectionName - চেক করার কালেকশন
 * @param {string} fieldName - চেক করার ফিল্ড নাম
 * @returns {Promise<string>} - ইউনিক আইডি
 */
export const generateUniqueId = async (prefix = 'WH', collectionName = 'users', fieldName = 'uniqueId') => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const firstPart = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const secondPart = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const id = `${prefix}-${firstPart}-${secondPart}`;
  
  // ডুপ্লিকেট চেক
  const q = query(collection(db, collectionName), where(fieldName, '==', id));
  const snap = await getDocs(q);
  
  if (snap.empty) {
    return id;
  } else {
    // রিকার্সিভ কল
    return generateUniqueId(prefix, collectionName, fieldName);
  }
};

/**
 * ইউজার আইডি জেনারেট করুন
 */
export const generateUserId = () => generateUniqueId('WH', 'users', 'uniqueId');

/**
 * ওয়ালেট আইডি জেনারেট করুন
 */
export const generateWalletId = () => generateUniqueId('WL', 'wallets', 'walletId');

/**
 * ডিল আইডি জেনারেট করুন
 */
export const generateDealId = () => generateUniqueId('DL', 'deals', 'dealId');

/**
 * ট্রানজাকশন আইডি জেনারেট করুন
 */
export const generateTransactionId = () => generateUniqueId('TX', 'transactions', 'transactionId');

/**
 * রেফারেল কোড জেনারেট করুন
 */
export const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};