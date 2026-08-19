// src/components/LoadingBar/usePageLoadingBar.js
//
// পেজ-লেভেল হুক। প্রতিটা পেজ শুধু নিজের existing `loading` boolean-টা
// এখানে পাস করলেই টপ-বার অটোমেটিক শো/হাইড হবে।
//
// ব্যবহার:
//   const { loading, data } = useSomeDataHook();
//   usePageLoadingBar(loading);
//
// গুরুত্বপূর্ণ: প্রতিটা hook-call এর নিজস্ব ইউনিক key থাকে (useRef দিয়ে
// একবারই তৈরি হয়, mount-এর পুরো লাইফটাইমে স্থির থাকে)। component
// unmount হলে (পেজ বদলে গেলে) cleanup effect নিজের key অবশ্যই সরিয়ে
// দেয় — নাহলে অন্য পেজে গিয়েও বার আটকে থাকবে (stale key bug)।

import { useEffect, useRef } from 'react';
import { useLoadingBarContext } from './LoadingBarContext';

let idCounter = 0;

export const usePageLoadingBar = (isLoading) => {
  const { start, stop } = useLoadingBarContext();
  const keyRef = useRef(null);
  if (keyRef.current === null) {
    idCounter += 1;
    keyRef.current = `page-loading-${idCounter}`;
  }

  useEffect(() => {
    const key = keyRef.current;
    if (isLoading) {
      start(key);
    } else {
      stop(key);
    }
  }, [isLoading, start, stop]);

  // Unmount হলে নিজের key নিশ্চিতভাবে সরিয়ে দেওয়া (safety net)
  useEffect(() => {
    const key = keyRef.current;
    return () => {
      stop(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

export default usePageLoadingBar;