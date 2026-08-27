// src/components/LoadingBar/LoadingBarContext.jsx
//
// গ্লোবাল লোডিং-বার স্টেট।
// একাধিক পেজ/কম্পোনেন্ট একই সময়ে লোড করতে পারে (যেমন: পেজ বদলাতে
// বদলাতে আগের listener এখনো cleanup হচ্ছে, নতুনটা শুরু হচ্ছে) —
// তাই boolean না রেখে Set রাখা হয়েছে। যতক্ষণ Set-এ অন্তত একটা key
// থাকবে, ততক্ষণ বার "active" দেখাবে। সব key ক্লিয়ার হলেই বার বন্ধ হবে।

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const LoadingBarContext = createContext(null);

export const LoadingBarProvider = ({ children }) => {
  const [activeKeys, setActiveKeys] = useState(() => new Set());

  const start = useCallback((key) => {
    setActiveKeys(prev => {
      if (prev.has(key)) return prev; // কোনো পরিবর্তন নেই, re-render বাঁচবে
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const stop = useCallback((key) => {
    setActiveKeys(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const isLoading = activeKeys.size > 0;

  const value = useMemo(() => ({ start, stop, isLoading }), [start, stop, isLoading]);

  return (
    <LoadingBarContext.Provider value={value}>
      {children}
    </LoadingBarContext.Provider>
  );
};

export const useLoadingBarContext = () => {
  const ctx = useContext(LoadingBarContext);
  if (!ctx) {
    throw new Error('useLoadingBarContext must be used inside <LoadingBarProvider>');
  }
  return ctx;
};

export default LoadingBarContext;