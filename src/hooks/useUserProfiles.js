import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { formatLastSeen } from '../pages/inboxHelpers'; 

export const useUserProfiles = () => {
  const [userProfiles, setUserProfiles] = useState({});
  const [loadingProfiles, setLoadingProfiles] = useState({});

  // ============================================================
  // ✅ ইউজার প্রোফাইল ফেচ - রিয়েল-টাইম লিসেনার সহ
  // ============================================================
  const fetchUserProfile = useCallback(async (userId) => {
    if (!userId) return null;
    
    // ✅ ইতিমধ্যে লোড হচ্ছে কিনা চেক
    if (loadingProfiles[userId]) {
      return userProfiles[userId] || null;
    }
    
    // ✅ ইতিমধ্যে প্রোফাইল আছে কিনা চেক
    if (userProfiles[userId]) {
      return userProfiles[userId];
    }
    
    setLoadingProfiles(prev => ({ ...prev, [userId]: true }));
    
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const profileData = {
          displayName: data.displayName || data.name || data.fullName || 'User',
          photoURL: data.photoURL || data.photo || null,
          email: data.email || '',
          isOnline: data.isOnline || false,
          lastSeen: data.lastSeen || null,
          lastSeenFormatted: data.isOnline ? 'Online' : formatLastSeen(data.lastSeen),
          uid: userId
        };
        
        setUserProfiles(prev => ({ ...prev, [userId]: profileData }));
        setLoadingProfiles(prev => ({ ...prev, [userId]: false }));
        return profileData;
      } else {
        // ✅ ইউজার না পাওয়া গেলে ডিফল্ট প্রোফাইল
        const defaultProfile = {
          displayName: 'User',
          photoURL: null,
          email: '',
          isOnline: false,
          lastSeen: null,
          lastSeenFormatted: 'Offline',
          uid: userId
        };
        setUserProfiles(prev => ({ ...prev, [userId]: defaultProfile }));
        setLoadingProfiles(prev => ({ ...prev, [userId]: false }));
        return defaultProfile;
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      setLoadingProfiles(prev => ({ ...prev, [userId]: false }));
      return null;
    }
  }, [userProfiles, loadingProfiles]);

  // ============================================================
  // ✅ রিয়েল-টাইম অনলাইন স্ট্যাটাস লিসেনার
  // ============================================================
  const subscribeToUserStatus = useCallback((userId) => {
    if (!userId) return null;
    
    const userRef = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const isOnline = data.isOnline === true;
        const lastSeen = data.lastSeen || null;
        
        setUserProfiles(prev => {
          const existing = prev[userId] || {};
          return {
            ...prev,
            [userId]: {
              ...existing,
              displayName: data.displayName || data.name || existing.displayName || 'User',
              photoURL: data.photoURL || data.photo || existing.photoURL || null,
              email: data.email || existing.email || '',
              isOnline: isOnline,
              lastSeen: lastSeen,
              lastSeenFormatted: isOnline ? 'Online' : formatLastSeen(lastSeen),
              uid: userId
            }
          };
        });
      }
    }, (error) => {
      console.error("Error listening to user status:", error);
    });
    
    return unsubscribe;
  }, []);

  // ============================================================
  // ✅ একাধিক ইউজারের জন্য সাবস্ক্রাইব
  // ============================================================
  const subscribeToMultipleUsers = useCallback((userIds) => {
    const unsubscribes = [];
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    
    uniqueIds.forEach(userId => {
      const unsubscribe = subscribeToUserStatus(userId);
      if (unsubscribe) {
        unsubscribes.push(unsubscribe);
      }
    });
    
    return () => {
      unsubscribes.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
    };
  }, [subscribeToUserStatus]);

  // ============================================================
  // ✅ অনলাইন স্ট্যাটাস টেক্সট
  // ============================================================
  const getOnlineStatusText = useCallback((userId) => {
    if (!userId) return 'Offline';
    const profile = userProfiles[userId];
    if (!profile) return 'Offline';
    return profile.isOnline ? 'Online' : (profile.lastSeenFormatted || 'Offline');
  }, [userProfiles]);

  // ============================================================
  // ✅ অনলাইন স্ট্যাটাস বুলিয়ান
  // ============================================================
  const getIsOnline = useCallback((userId) => {
    if (!userId) return false;
    return userProfiles[userId]?.isOnline === true;
  }, [userProfiles]);

  // ============================================================
  // ✅ ডিসপ্লে নাম পাওয়া
  // ============================================================
  const getDisplayName = useCallback((chat) => {
    if (!chat) return 'User';
    
    // ✅ চ্যাট থেকে অন্য পক্ষের আইডি বের করুন
    let otherId = null;
    if (chat.participants && Array.isArray(chat.participants)) {
      // currentUser না থাকলে participants থেকে প্রথমটি নিন
      otherId = chat.participants[0];
    }
    if (chat.otherPartyId) {
      otherId = chat.otherPartyId;
    }
    
    // ✅ প্রোফাইল থেকে নাম নিন
    if (otherId && userProfiles[otherId]?.displayName) {
      return userProfiles[otherId].displayName;
    }
    
    // ✅ ফলেরব্যাক: চ্যাট থেকে নাম
    return chat.otherPartyName || chat.sellerName || chat.buyerName || 'User';
  }, [userProfiles]);

  // ============================================================
  // ✅ ফটো ইউআরএল পাওয়া
  // ============================================================
  const getPhotoURL = useCallback((chat) => {
    if (!chat) return null;
    
    // ✅ চ্যাট থেকে অন্য পক্ষের আইডি বের করুন
    let otherId = null;
    if (chat.participants && Array.isArray(chat.participants)) {
      otherId = chat.participants[0];
    }
    if (chat.otherPartyId) {
      otherId = chat.otherPartyId;
    }
    
    // ✅ প্রোফাইল থেকে ফটো নিন
    if (otherId && userProfiles[otherId]?.photoURL) {
      return userProfiles[otherId].photoURL;
    }
    
    // ✅ ফলেরব্যাক: চ্যাট থেকে ফটো
    return chat.otherPartyPhoto || chat.sellerPhoto || chat.buyerPhoto || null;
  }, [userProfiles]);

  // ============================================================
  // ✅ প্রোফাইল রিসেট
  // ============================================================
  const resetProfiles = useCallback(() => {
    setUserProfiles({});
    setLoadingProfiles({});
  }, []);

  return {
    userProfiles,
    loadingProfiles,
    fetchUserProfile,
    subscribeToUserStatus,
    subscribeToMultipleUsers,
    getOnlineStatusText,
    getIsOnline,
    getDisplayName,
    getPhotoURL,
    resetProfiles,
    setUserProfiles
  };
};