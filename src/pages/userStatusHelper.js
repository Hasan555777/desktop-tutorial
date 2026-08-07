// src/pages/userStatusHelper.js
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';

// ============================================
// ✅ ইউজার ডকুমেন্ট আছে কিনা চেক করে তৈরি/আপডেট করে
// ============================================
const ensureUserDocument = async (userId) => {
  if (!userId) return false;
  
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      // ✅ ডকুমেন্ট না থাকলে তৈরি করুন
      await setDoc(userRef, {
        uid: userId,
        isOnline: false,
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        displayName: 'User',
        photoURL: null,
        role: 'client',
        savedPosts: [],
        totalReviews: 0,
        totalRating: 0,
        averageRating: 0
      });
      console.log(`✅ User document created for: ${userId}`);
      return true;
    }
    return true;
  } catch (error) {
    console.error("Error ensuring user document:", error);
    return false;
  }
};

// ============================================
// ✅ ইউজারের অনলাইন স্ট্যাটাস আপডেট
// ============================================
export const setUserOnlineStatus = async (userId, isOnline) => {
  if (!userId) {
    console.warn("⚠️ No userId provided");
    return;
  }
  
  try {
    // ✅ প্রথমে ডকুমেন্ট আছে কিনা নিশ্চিত করুন
    await ensureUserDocument(userId);
    
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { 
      isOnline: isOnline, 
      lastSeen: new Date().toISOString() 
    });
    console.log(`✅ User ${userId} is now ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    console.error("Error setting online status:", error);
  }
};

// ============================================
// ✅ অনলাইন স্ট্যাটাস মনিটরিং শুরু করুন
// ============================================
export const initOnlineStatus = (userId) => {
  if (!userId) {
    console.error("❌ No userId provided for initOnlineStatus");
    return () => {};
  }
  
  setUserOnlineStatus(userId, true);
  
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      setUserOnlineStatus(userId, true);
    } else {
      setUserOnlineStatus(userId, false);
    }
  };
  
  const handleBeforeUnload = () => {
    setUserOnlineStatus(userId, false);
  };
  
  const handleOnline = () => {
    setUserOnlineStatus(userId, true);
  };
  
  const handleOffline = () => {
    setUserOnlineStatus(userId, false);
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};

export const setOnline = async (userId) => {
  await setUserOnlineStatus(userId, true);
};

export const setOffline = async (userId) => {
  await setUserOnlineStatus(userId, false);
};

export const updateLastSeen = async (userId) => {
  if (!userId) return;
  
  try {
    await ensureUserDocument(userId);
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { 
      lastSeen: new Date().toISOString() 
    });
    console.log(`✅ Last seen updated for user: ${userId}`);
  } catch (error) {
    console.error("Error updating last seen:", error);
  }
};