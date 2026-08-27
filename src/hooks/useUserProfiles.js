// src/hooks/useUserProfiles.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { formatLastSeen } from '../pages/Inbox/inboxHelpers';
import { logger } from '@/utils/logger';

export const useUserProfiles = () => {
  const [userProfiles, setUserProfiles] = useState({});
  const [loadingProfiles, setLoadingProfiles] = useState({});

  // FIX: fetchUserProfile আগে userProfiles/loadingProfiles state-এর ওপর
  // useCallback dependency রাখত — প্রতিবার profile fetch হলেই ফাংশনটার
  // identity বদলে যেত। এটা যেসব জায়গায় dependency হিসেবে ব্যবহৃত হয়
  // (যেমন useInboxChats.js-এর মূল Firestore listener effect), সেখানে
  // effect বারবার unsubscribe→resubscribe করত — চ্যাট লিস্ট flicker করত
  // এবং অপ্রয়োজনীয় Firestore read বাড়ত। এখন state-এর একটা live ref
  // রাখা হচ্ছে, fetchUserProfile-এর dependency array খালি — identity
  // চিরস্থায়ীভাবে স্থিতিশীল।
  const profilesRef = useRef(userProfiles);
  const loadingRef = useRef(loadingProfiles);
  useEffect(() => { profilesRef.current = userProfiles; }, [userProfiles]);
  useEffect(() => { loadingRef.current = loadingProfiles; }, [loadingProfiles]);

  const fetchUserProfile = useCallback(async (userId) => {
    if (!userId) return null;

    if (loadingRef.current[userId]) {
      return profilesRef.current[userId] || null;
    }
    if (profilesRef.current[userId]) {
      return profilesRef.current[userId];
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
      }

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
    } catch (error) {
      logger.error("Error fetching user profile:", error);
      setLoadingProfiles(prev => ({ ...prev, [userId]: false }));
      return null;
    }
  }, []); // ✅ স্থায়ী identity

  // ============================================================
  // ✅ রিয়েল-টাইম অনলাইন স্ট্যাটাস লিসেনার
  // ============================================================
  const subscribeToUserStatus = useCallback((userId) => {
    if (!userId) return null;

    const userRef = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
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
              isOnline,
              lastSeen,
              lastSeenFormatted: isOnline ? 'Online' : formatLastSeen(lastSeen),
              uid: userId
            }
          };
        });
      }
    }, (error) => {
      logger.error("Error listening to user status:", error);
    });

    return unsubscribe;
  }, []);

  // ============================================================
  // ✅ একাধিক ইউজারের জন্য সাবস্ক্রাইব
  // ============================================================
  const subscribeToMultipleUsers = useCallback((userIds) => {
    const unsubscribes = [];
    const uniqueIds = [...new Set((userIds || []).filter(Boolean))];

    uniqueIds.forEach(userId => {
      const unsubscribe = subscribeToUserStatus(userId);
      if (unsubscribe) unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
    };
  }, [subscribeToUserStatus]);

  const getOnlineStatusText = useCallback((userId) => {
    if (!userId) return 'Offline';
    const profile = userProfiles[userId];
    if (!profile) return 'Offline';
    return profile.isOnline ? 'Online' : (profile.lastSeenFormatted || 'Offline');
  }, [userProfiles]);

  const getIsOnline = useCallback((userId) => {
    if (!userId) return false;
    return userProfiles[userId]?.isOnline === true;
  }, [userProfiles]);

  const getDisplayName = useCallback((chat) => {
    if (!chat) return 'User';

    let otherId = null;
    if (chat.participants && Array.isArray(chat.participants)) {
      otherId = chat.participants[0];
    }
    if (chat.otherPartyId) {
      otherId = chat.otherPartyId;
    }

    if (otherId && userProfiles[otherId]?.displayName) {
      return userProfiles[otherId].displayName;
    }

    return chat.otherPartyName || chat.sellerName || chat.buyerName || 'User';
  }, [userProfiles]);

  const getPhotoURL = useCallback((chat) => {
    if (!chat) return null;

    let otherId = null;
    if (chat.participants && Array.isArray(chat.participants)) {
      otherId = chat.participants[0];
    }
    if (chat.otherPartyId) {
      otherId = chat.otherPartyId;
    }

    if (otherId && userProfiles[otherId]?.photoURL) {
      return userProfiles[otherId].photoURL;
    }

    return chat.otherPartyPhoto || chat.sellerPhoto || chat.buyerPhoto || null;
  }, [userProfiles]);

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
