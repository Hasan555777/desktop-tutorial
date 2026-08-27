// src/context/LayoutContext.jsx

import React, { createContext, useContext, useState } from 'react';

const LayoutContext = createContext(null);

export const LayoutProvider = ({ children }) => {
  const [hideBottomNav, setHideBottomNav] = useState(false);
  const [hideHeader, setHideHeader] = useState(false);

  return (
    <LayoutContext.Provider value={{ hideBottomNav, setHideBottomNav, hideHeader, setHideHeader }}>
      {children}
    </LayoutContext.Provider>
  );
};

// Matches the guard pattern used by useFeedback()/useNotification() — a
// clear error here beats a confusing "cannot read property of undefined"
// a few lines later if this is ever called outside LayoutProvider.
export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within LayoutProvider');
  }
  return context;
};

export default LayoutContext;