// src/hooks/useUserProfiles.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../shared/firebase/index';
import { formatLastSeen } from '../../chat/Inbox/inboxHelpers';
import { logger } from '../../../shared/utils/logger';
import { getEffectiveOnlineStatus, ONLINE_HEARTBEAT_MS } from '../utils/presence';

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
        // 🔧 FIX (always-online bug): don't trust the raw isOnline
        // flag by itself — it can be stuck `true` if the tab never
        // got to write `false` on exit. See utils/presence.js.
        const isOnline = getEffectiveOnlineStatus(data.isOnline, data.lastSeen);
        const profileData = {
          displayName: data.displayName || data.name || data.fullName || 'User',
          photoURL: data.photoURL || data.photo || null,
          email: data.email || '',
          isOnline,
          _rawOnline: data.isOnline === true,
          lastSeen: data.lastSeen || null,
          lastSeenFormatted: isOnline ? 'Online' : formatLastSeen(data.lastSeen),
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
        // 🔧 FIX (always-online bug): staleness-aware check instead
        // of trusting the raw isOnline boolean. See utils/presence.js.
        const isOnline = getEffectiveOnlineStatus(data.isOnline, data.lastSeen);
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
              _rawOnline: data.isOnline === true,
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
  // 🔧 FIX (always-online bug): a Firestore onSnapshot listener only
  // fires again when the DOCUMENT changes. If someone's tab dies
  // without ever writing isOnline:false, no new snapshot arrives —
  // so the `isOnline` computed inside subscribeToUserStatus's
  // callback above would stay stuck at whatever it was the last time
  // they were genuinely active, no matter how much real time passes.
  // This sweeps every cached profile every half-heartbeat and
  // re-derives `isOnline` against the CURRENT clock using the raw
  // flag + lastSeen already cached — this is what actually flips a
  // silently-gone user to "Offline" in the Inbox list.
  // ============================================================
  useEffect(() => {
    const interval = setInterval(() => {
      setUserProfiles(prev => {
        let changed = false;
        const next = { ...prev };
        for (const userId of Object.keys(prev)) {
          const profile = prev[userId];
          if (typeof profile._rawOnline === 'undefined') continue;
          const freshIsOnline = getEffectiveOnlineStatus(profile._rawOnline, profile.lastSeen);
          if (freshIsOnline !== profile.isOnline) {
            changed = true;
            next[userId] = {
              ...profile,
              isOnline: freshIsOnline,
              lastSeenFormatted: freshIsOnline ? 'Online' : formatLastSeen(profile.lastSeen),
            };
          }
        }
        return changed ? next : prev;
      });
    }, ONLINE_HEARTBEAT_MS / 2);

    return () => clearInterval(interval);
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
