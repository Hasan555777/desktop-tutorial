// src/hooks/useAnnouncement.js

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getLatestActiveAnnouncement,
  listenForAnnouncements
} from '@/firebase/announcementRepository';
import { announcementStorage } from '@/services/announcementStorage';

// ============================================================
// 🎯 CUSTOM HOOK - useAnnouncement
// ============================================================
export const useAnnouncement = () => {
  const [announcement, setAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);
  const unsubscribeRef = useRef(null);
  const lastProcessedKey = useRef(null);

  // ✅ Single source of truth - apply announcement
  const applyAnnouncement = useCallback((latestAnnouncement) => {
    if (!latestAnnouncement) {
      setAnnouncement(null);
      return;
    }

    // Track by category_version
    const key = `${latestAnnouncement.category || 'default'}_${latestAnnouncement.version}`;
    
    if (lastProcessedKey.current === key) {
      return;
    }

    // ✅ Unified storage check - শুধু permanent dismiss চেক করে
    if (!announcementStorage.shouldShowAnnouncement(latestAnnouncement)) {
      setAnnouncement(null);
      return;
    }

    lastProcessedKey.current = key;
    setAnnouncement(latestAnnouncement);
  }, []);

  // ✅ Manual check
  const checkAnnouncement = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getLatestActiveAnnouncement();
      applyAnnouncement(result);
    } catch (error) {
      console.error('Error checking announcement:', error);
      setAnnouncement(null);
    } finally {
      setLoading(false);
    }
  }, [applyAnnouncement]);

  // ✅ OK চাপলে - popup বন্ধ করি, কিন্তু permanent dismiss করি না
  const dismiss = useCallback(() => {
    setAnnouncement(null);
    // ✅ কোনো localStorage update করি না
    // এতে Refresh দিলে আবার দেখাবে
  }, []);

  // ✅ "Don't Show Again" চাপলে - permanent dismiss
  const dismissForever = useCallback(() => {
    if (!announcement) return;

    // ✅ শুধু dismiss করি, lastSeenVersion update করি না
    announcementStorage.dismissAndSeen(announcement);

    setAnnouncement(null);
  }, [announcement]);

  // ✅ Refresh announcement
  const refresh = useCallback(() => {
    setLoading(true);
    checkAnnouncement();
  }, [checkAnnouncement]);

  // ✅ Setup realtime listener
  useEffect(() => {
    checkAnnouncement();
    
    unsubscribeRef.current = listenForAnnouncements((latest) => {
      applyAnnouncement(latest);
    });
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [checkAnnouncement, applyAnnouncement]);

  // ✅ Derived state
  const showPopup = !!announcement;

  return {
    announcement,
    showPopup,
    loading,
    dismiss,
    dismissForever,
    refresh
  };
};

export default useAnnouncement;