// src/hooks/usePWA.js - সম্পূর্ণ ফিক্সড ভার্সন (beforeinstallprompt সহ)

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ============================================================
// 📦 Constants
// ============================================================

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' 
  ? __APP_VERSION__ 
  : '1.0.0';

// ============================================================
// 🎯 usePWA Hook
// ============================================================

export const usePWA = () => {
  // ── States ──
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState('unknown');
  const [browser, setBrowser] = useState('unknown');
  const [canInstall, setCanInstall] = useState(false);
  const [isSWRegistered, setIsSWRegistered] = useState(false);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [storageUsage, setStorageUsage] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  // ── Refs ──
  const deferredPromptRef = useRef(null);

  // ── Memoized Values ──
  const version = useMemo(() => APP_VERSION, []);

  // ============================================================
  // ✅ Platform & Browser Detection
  // ============================================================

  useEffect(() => {
    // ✅ Standalone mode
    const isStandaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    
    setIsStandalone(isStandaloneMode);

    // ✅ iOS detection
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(iOS);

    // ✅ Platform detection
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Android')) {
      setPlatform('android');
    } else if (iOS) {
      setPlatform('ios');
    } else if (userAgent.includes('Windows')) {
      setPlatform('windows');
    } else if (userAgent.includes('Mac')) {
      setPlatform('mac');
    } else if (userAgent.includes('Linux')) {
      setPlatform('linux');
    } else {
      setPlatform('desktop');
    }

    // ✅ Browser detection
    const ua = navigator.userAgent;
    if (ua.includes('Samsung')) {
      setBrowser('samsung');
    } else if (ua.includes('Edg')) {
      setBrowser('edge');
    } else if (ua.includes('Chrome') && !ua.includes('Edg')) {
      setBrowser('chrome');
    } else if (ua.includes('Firefox')) {
      setBrowser('firefox');
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      setBrowser('safari');
    } else {
      setBrowser('other');
    }

    // ✅ Offline ready check
    const checkOfflineReady = async () => {
      if ('caches' in window) {
        try {
          const cache = await caches.open('WorkTrustbd-v1.0.0');
          const keys = await cache.keys();
          setIsOfflineReady(keys.length > 0);
        } catch {
          setIsOfflineReady(false);
        }
      }
    };
    checkOfflineReady();

    // ✅ Storage info
    const getStorageInfo = async () => {
      try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          setStorageUsage(estimate.usage || 0);
          setStorageQuota(estimate.quota || 0);
        }
      } catch (error) {
        console.warn('⚠️ Storage estimate error:', error);
      }
    };
    getStorageInfo();

    setIsLoading(false);
  }, []);

  // ============================================================
  // ✅ Service Worker Registration Status
  // ============================================================

  useEffect(() => {
    const checkSW = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          setIsSWRegistered(true);
          
          // ✅ Check for waiting worker on startup
          if (registration.waiting) {
            setIsUpdateAvailable(true);
          }
        } catch (error) {
          console.warn('⚠️ Service Worker not ready:', error);
          setIsSWRegistered(false);
        }
      } else {
        setIsSWRegistered(false);
      }
    };
    
    checkSW();

    // ✅ Listen for controller changes
    const handleControllerChange = () => {
      setIsSWRegistered(!!navigator.serviceWorker.controller);
    };

    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  // ============================================================
  // ✅ PWA Install Events - COMPLETELY FIXED ✅
  // ============================================================

  useEffect(() => {
    console.log('📱 Setting up PWA install event listeners...');

    // ✅ Main event listener for beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      console.log('📱 beforeinstallprompt event fired!');
      
      // ✅ Prevent default (Chrome requires this)
      e.preventDefault();
      
      // ✅ Store the event for later use
      deferredPromptRef.current = e;
      setDeferredPrompt(e);
      setIsInstallable(true);
      
      console.log('✅ App is installable!');
      console.log('📱 DeferredPrompt saved:', !!e);
    };

    // ✅ App installed event
    const handleAppInstalled = () => {
      console.log('✅ App installed successfully!');
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      deferredPromptRef.current = null;
      setCanInstall(false);
    };

    // ✅ Check for existing deferredPrompt (some browsers)
    if (window.deferredPrompt) {
      console.log('📱 Found existing deferredPrompt on window');
      deferredPromptRef.current = window.deferredPrompt;
      setDeferredPrompt(window.deferredPrompt);
      setIsInstallable(true);
    }

    // ✅ Add event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // ✅ Also listen for custom events (for compatibility)
    const handlePWAInstallAvailable = (e) => {
      console.log('📱 pwa-install-available event fired');
      const prompt = e.detail?.deferredPrompt || window.deferredPrompt;
      if (prompt) {
        deferredPromptRef.current = prompt;
        setDeferredPrompt(prompt);
        setIsInstallable(true);
      }
    };

    const handlePWAInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      deferredPromptRef.current = null;
      setCanInstall(false);
    };

    const handlePWAUpdateAvailable = () => {
      setIsUpdateAvailable(true);
    };

    window.addEventListener('pwa-install-available', handlePWAInstallAvailable);
    window.addEventListener('pwa-installed', handlePWAInstalled);
    window.addEventListener('pwa-update-available', handlePWAUpdateAvailable);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-install-available', handlePWAInstallAvailable);
      window.removeEventListener('pwa-installed', handlePWAInstalled);
      window.removeEventListener('pwa-update-available', handlePWAUpdateAvailable);
    };
  }, []);

  // ============================================================
  // ✅ Can Install Check
  // ============================================================

  useEffect(() => {
    const canInstallNow = 
      !isStandalone && 
      !isInstalled && 
      isInstallable && 
      !isIOS &&
      !!deferredPrompt;
    
    setCanInstall(canInstallNow);
    
    console.log('📱 Can Install Status:', {
      canInstall: canInstallNow,
      isStandalone,
      isInstalled,
      isInstallable,
      isIOS,
      hasDeferredPrompt: !!deferredPrompt
    });
    
  }, [isStandalone, isInstalled, isInstallable, isIOS, deferredPrompt]);

  // ============================================================
  // ✅ Install App - COMPLETELY FIXED ✅
  // ============================================================

  const installApp = useCallback(async (feedback) => {
    console.log('📥 installApp called');
    console.log('  - deferredPrompt:', !!deferredPrompt);
    console.log('  - deferredPromptRef:', !!deferredPromptRef.current);
    console.log('  - isIOS:', isIOS);
    console.log('  - isInstalled:', isInstalled);
    console.log('  - isStandalone:', isStandalone);
    
    // ✅ Check if already installed
    if (isInstalled || isStandalone) {
      console.log('✅ Already installed');
      feedback?.showInfo?.('✅ Already Installed', 'App is already installed on your device');
      return { success: false, reason: 'already_installed' };
    }

    // ✅ iOS fallback
    if (isIOS) {
      console.log('📱 iOS - showing manual instructions');
      feedback?.showInfo?.(
        '📱 Install on iOS',
        'Tap the Share button (square with arrow) and select "Add to Home Screen" to install WorkTrustbd.'
      );
      return { success: false, reason: 'ios_manual' };
    }

    // ✅ Check if we have the prompt (try both state and ref)
    let prompt = deferredPrompt || deferredPromptRef.current;
    
    // ✅ If no prompt, check window object
    if (!prompt && window.deferredPrompt) {
      console.log('📱 Found deferredPrompt on window object');
      prompt = window.deferredPrompt;
      setDeferredPrompt(prompt);
      deferredPromptRef.current = prompt;
      setIsInstallable(true);
    }
    
    if (!prompt) {
      console.warn('❌ No deferredPrompt available');
      
      // ✅ Check if installable but no prompt yet
      if (isInstallable) {
        feedback?.showInfo?.(
          '⏳ Please wait',
          'The install prompt is loading. Please try again in a moment.'
        );
        return { success: false, reason: 'prompt_loading' };
      }
      
      // ✅ Try to trigger install via browser menu
      feedback?.showInfo?.(
        '📱 Install via Browser',
        'To install WorkTrustbd, open this page in Chrome or Edge browser and select "Install App" from the browser menu.\n\n' +
        '📍 Chrome: Click the download icon (⬇️) in the address bar\n' +
        '📍 Edge: Click the install icon (📱) in the address bar'
      );
      return { success: false, reason: 'no_prompt' };
    }

    try {
      console.log('📱 Showing install prompt...');
      
      // ✅ Show the install prompt
      await prompt.prompt();
      
      // ✅ Wait for user choice
      const choiceResult = await prompt.userChoice;
      console.log('📱 User choice:', choiceResult);
      
      // ✅ Clear the prompt
      setDeferredPrompt(null);
      deferredPromptRef.current = null;
      window.deferredPrompt = null;
      setIsInstallable(false);
      
      if (choiceResult.outcome === 'accepted') {
        console.log('✅ User accepted install');
        setIsInstalled(true);
        setCanInstall(false);
        
        feedback?.showSuccess?.('✅ Installed!', 'WorkTrustbd has been installed on your device.');
        return { success: true, outcome: 'accepted' };
      } else {
        console.log('❌ User dismissed install');
        feedback?.showInfo?.('⏭️ Skipped', 'Installation was skipped. You can try again later.');
        return { success: false, reason: 'dismissed', outcome: 'dismissed' };
      }
      
    } catch (error) {
      console.error('❌ Installation error:', error);
      setDeferredPrompt(null);
      deferredPromptRef.current = null;
      window.deferredPrompt = null;
      
      feedback?.showError?.('❌ Failed', 'Could not install the app. Please try again or use browser menu.');
      return { success: false, error: error.message };
    }
  }, [deferredPrompt, isIOS, isInstalled, isStandalone, isInstallable]);

  // ============================================================
  // ✅ Update App
  // ============================================================

  const updateApp = useCallback(async () => {
    console.log('🔄 Updating app...');
    
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        
        // ✅ First check for updates
        await registration.update();
        
        const newWorker = registration.waiting;
        
        if (newWorker) {
          newWorker.postMessage({ type: 'SKIP_WAITING' });
          setIsUpdateAvailable(false);
          
          // ✅ Wait for controller change
          const controllerChangePromise = new Promise((resolve) => {
            const onControllerChange = () => {
              navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
              resolve();
            };
            navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
            
            setTimeout(() => {
              navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
              resolve();
            }, 3000);
          });
          
          await controllerChangePromise;
          
          setTimeout(() => {
            window.location.reload();
          }, 500);
          
          return { success: true };
        }
        
        return { success: false, reason: 'no_worker' };
      } catch (error) {
        console.error('Update error:', error);
        return { success: false, error };
      }
    }
    return { success: false, reason: 'no_service_worker' };
  }, []);

  // ============================================================
  // ✅ Other Functions
  // ============================================================

  const dismissUpdate = useCallback(() => {
    setIsUpdateAvailable(false);
  }, []);

  const checkForUpdate = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
        return true;
      } catch (error) {
        console.error('Update check error:', error);
        return false;
      }
    }
    return false;
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      return { success: false, reason: 'not_supported' };
    }

    if (Notification.permission === 'granted') {
      return { success: true, permission: 'granted' };
    }

    if (Notification.permission === 'denied') {
      return { success: false, reason: 'denied' };
    }

    try {
      const permission = await Notification.requestPermission();
      return { success: permission === 'granted', permission };
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return { success: false, error };
    }
  }, []);

  const getNotificationPermission = useCallback(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }, []);

  // ============================================================
  // ✅ Refresh PWA Status
  // ============================================================

  const refreshPWAStatus = useCallback(async () => {
    console.log('🔄 Refreshing PWA status...');
    
    try {
      // ✅ Check SW registration
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          setIsSWRegistered(true);
          if (registration.waiting) {
            setIsUpdateAvailable(true);
          }
        } catch {
          setIsSWRegistered(false);
        }
      }

      // ✅ Check install status
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
      setIsStandalone(isStandaloneMode);

      // ✅ Check if installed
      if (isStandaloneMode) {
        setIsInstalled(true);
        setIsInstallable(false);
        setCanInstall(false);
      }

      // ✅ Check for deferredPrompt
      if (window.deferredPrompt) {
        setIsInstallable(true);
        setDeferredPrompt(window.deferredPrompt);
        deferredPromptRef.current = window.deferredPrompt;
      }

      // ✅ Check offline ready
      if ('caches' in window) {
        try {
          const cache = await caches.open('WorkTrustbd-v1.0.0');
          const keys = await cache.keys();
          setIsOfflineReady(keys.length > 0);
        } catch {
          setIsOfflineReady(false);
        }
      }

      // ✅ Check storage
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        setStorageUsage(estimate.usage || 0);
        setStorageQuota(estimate.quota || 0);
      }

    } catch (error) {
      console.error('Error refreshing PWA status:', error);
    }
  }, []);

  // ============================================================
  // ✅ Debug Log
  // ============================================================

  useEffect(() => {
    console.log('📱 usePWA Status:', {
      isInstallable,
      isInstalled,
      isStandalone,
      canInstall,
      hasDeferredPrompt: !!deferredPrompt,
      hasDeferredPromptRef: !!deferredPromptRef.current,
      platform,
      browser,
      isIOS
    });
  }, [isInstallable, isInstalled, isStandalone, canInstall, deferredPrompt, platform, browser, isIOS]);

  // ============================================================
  // ✅ Return
  // ============================================================

  return {
    // ── States ──
    isInstallable,
    isInstalled,
    isUpdateAvailable,
    isStandalone,
    isIOS,
    platform,
    browser,
    canInstall,
    version,
    isSWRegistered,
    isOfflineReady,
    storageUsage,
    storageQuota,
    isLoading,
    deferredPrompt,

    // ── Functions ──
    installApp,
    updateApp,
    dismissUpdate,
    checkForUpdate,
    requestNotificationPermission,
    getNotificationPermission,
    refreshPWAStatus,
  };
};

export default usePWA;