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
// 🔧 FIX (Inbox/Chat "always shows online" bug): the offline-marking
// handlers below (beforeunload / cleanup) are STILL best-effort only —
// browsers don't guarantee async work in an unload handler completes,
// and a crashed tab/app, dead battery, or dropped connection never
// fires either one. That can no longer strand anyone as permanently
// "online" though: every screen that DISPLAYS online/offline now goes
// through utils/presence.js's getEffectiveOnlineStatus(), which also
// checks that this hook's lastSeen heartbeat (written every
// ONLINE_HEARTBEAT_MS below) is still recent — see that file for the
// full explanation. So even if the offline write is skipped entirely,
// the UI falls back to "Offline" on its own within one stale
// heartbeat window, with no dependency on the unload event firing.
//
// Also added a 'pagehide' listener alongside 'beforeunload' — pagehide
// fires more reliably on mobile Safari/Chrome (including on app-switch
// and tab-close), so this gives the "clean" offline write a better
// chance of landing before the staleness fallback would even be
// needed.
import { useEffect } from 'react';
import { db } from '../firebase/index';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { logger } from '../utils/logger';
import { ONLINE_HEARTBEAT_MS } from '../../features/profile/utils/presence';

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

    const handleGoingOffline = async () => {
      try {
        await updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() });
      } catch (error) {
        logger.error("Error setting offline:", error);
      }
    };

    window.addEventListener('beforeunload', handleGoingOffline);
    window.addEventListener('pagehide', handleGoingOffline);

    const interval = setInterval(async () => {
      try {
        await updateDoc(userRef, { lastSeen: serverTimestamp() });
      } catch (error) {
        logger.error("Error updating lastSeen:", error);
      }
    }, ONLINE_HEARTBEAT_MS);

    return () => {
      window.removeEventListener('beforeunload', handleGoingOffline);
      window.removeEventListener('pagehide', handleGoingOffline);
      clearInterval(interval);
      updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() })
        .catch(error => logger.error("Error setting offline on unmount:", error));
    };
  }, [currentUser?.uid]);
};
