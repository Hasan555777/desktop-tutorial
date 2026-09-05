// src/components/PullToRefresh/usePullToRefresh.js
//
// 🔧 FIX #3: html/body-তে স্ট্যাটিক overscroll-behavior-y: contain
// কিছু মোবাইল ব্রাউজারে (Android WebView/পুরনো Chrome) পুরো পেজের
// scroll-ই ভেঙে দিচ্ছিল — একটা পরিচিত ব্রাউজার bug। এখন সেই CSS
// রুল সরিয়ে ফেলা হয়েছে (App.css থেকেও), আর এর বদলে এই হুক শুধু
// একটা নিশ্চিত 'pull' gesture চলাকালীনই সাময়িকভাবে
// document.documentElement-এ inline style বসিয়ে containment চালু
// করে, এবং touch শেষ হলেই সরিয়ে ফেলে। ফলে normal scroll ৯৯% সময়
// একদম অক্ষত থাকে, containment শুধু কয়েক মিলিসেকেন্ডের জন্য সক্রিয়
// থাকে — শুধু তখনই যখন সত্যিই দরকার।

import { useRef, useState, useCallback, useEffect } from 'react';

const PULL_THRESHOLD = 70;
const MAX_PULL = 110;
const DIRECTION_LOCK_THRESHOLD = 8;

export const usePullToRefresh = (onRefresh) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const directionLockedRef = useRef(null); // null | 'pull' | 'scroll'
  const containerRef = useRef(null);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  // ✅ NEW: সাময়িক containment চালু/বন্ধ করার হেল্পার
  const enableContainment = useCallback(() => {
    document.documentElement.style.overscrollBehaviorY = 'contain';
  }, []);
  const disableContainment = useCallback(() => {
    document.documentElement.style.overscrollBehaviorY = '';
  }, []);

  const resetPullState = useCallback(() => {
    pullingRef.current = false;
    directionLockedRef.current = null;
    disableContainment(); // ✅ যেকোনো reset-এই containment বন্ধ করে দিন
  }, [disableContainment]);

  const handleTouchStart = useCallback((e) => {
    if (isRefreshing) return;
    if (window.scrollY <= 0) {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
      directionLockedRef.current = null;
    } else {
      pullingRef.current = false;
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!pullingRef.current || isRefreshing) return;

    if (window.scrollY > 0) {
      resetPullState();
      setPullDistance(0);
      return;
    }

    const diff = e.touches[0].clientY - startYRef.current;

    if (directionLockedRef.current === null) {
      if (Math.abs(diff) < DIRECTION_LOCK_THRESHOLD) {
        return; // এখনো কিছু করছি না — normal browser scroll স্বাভাবিক
      }
      directionLockedRef.current = diff > 0 ? 'pull' : 'scroll';

      if (directionLockedRef.current === 'scroll') {
        // ওপরের দিকে = normal scroll — pull tracking বাতিল, containment ছোঁয়া হয়নি
        pullingRef.current = false;
        return;
      }

      // ✅ ঠিক এই মুহূর্তে, নিশ্চিত pull-gesture confirm হওয়ার পরই
      // containment চালু করা হচ্ছে — এর আগে না।
      enableContainment();
    }

    if (directionLockedRef.current === 'pull' && diff > 0) {
      if (e.cancelable) e.preventDefault();
      setPullDistance(Math.min(diff * 0.5, MAX_PULL));
    }
  }, [isRefreshing, resetPullState, enableContainment]);

  const handleTouchEnd = useCallback(async () => {
    const wasPulling = pullingRef.current && directionLockedRef.current === 'pull';
    resetPullState(); // ✅ এখানেই containment বন্ধ হয়ে যায়

    if (!wasPulling) {
      setPullDistance(0);
      return;
    }

    if (pullDistanceRef.current >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      try {
        await onRefresh?.();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [onRefresh, resetPullState]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      disableContainment(); // unmount হলেও নিশ্চিতভাবে পরিষ্কার
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disableContainment]);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    handlers: {},
  };
};

export default usePullToRefresh;