// src/components/Navigation/NavigationProvider.jsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

// Context
const NavigationContext = createContext(null);

// Provider
export const NavigationProvider = ({ children }) => {
  const location = useLocation();
  
  // ✅ Global UI State (History না)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerTitle, setHeaderTitle] = useState('');
  const [headerSubtitle, setHeaderSubtitle] = useState('');
  const [headerRight, setHeaderRight] = useState(null);
  const [headerLeft, setHeaderLeft] = useState(null);
  const [pageTitle, setPageTitle] = useState('');

  // ✅ Drawer Functions
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen(prev => !prev), []);

  // ✅ Header Functions
  const setHeader = useCallback(({ title, subtitle, left, right }) => {
    if (title !== undefined) setHeaderTitle(title);
    if (subtitle !== undefined) setHeaderSubtitle(subtitle);
    if (left !== undefined) setHeaderLeft(left);
    if (right !== undefined) setHeaderRight(right);
  }, []);

  const resetHeader = useCallback(() => {
    setHeaderTitle('');
    setHeaderSubtitle('');
    setHeaderLeft(null);
    setHeaderRight(null);
  }, []);

  const value = {
    // Drawer
    drawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    
    // Header
    headerTitle,
    headerSubtitle,
    headerLeft,
    headerRight,
    setHeader,
    resetHeader,
    
    // Page Title
    pageTitle,
    setPageTitle,
    
    // Location
    currentPath: location.pathname,
    location,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

// Hook
export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
};

export default NavigationProvider;