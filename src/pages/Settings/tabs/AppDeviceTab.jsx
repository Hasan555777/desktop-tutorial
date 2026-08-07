// src/pages/Settings/tabs/AppDeviceTab.jsx - FIXED VERSION

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePWA } from '@/hooks/usePWA';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import './AppDeviceTab.css';

// ✅ Build info from environment
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';
const BUILD_DATE = import.meta.env.VITE_BUILD_DATE || new Date().toISOString().split('T')[0];

const AppDeviceTab = () => {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const sound = useSound();
  
  // ✅ usePWA Hook
  const {
    isInstallable,
    isInstalled,
    isUpdateAvailable,
    isStandalone,
    isIOS,
    platform,
    browser,
    canInstall,
    version,
    installApp,
    updateApp,
    dismissUpdate,
    checkForUpdate,
    isSWRegistered,
    requestNotificationPermission: requestNotificationPermissionFromHook,
    getNotificationPermission,
    isOfflineReady,
    storageUsage,
    storageQuota: storageQuotaFromHook,
    isLoading: pwaLoading,
    refreshPWAStatus,
    deferredPrompt,
  } = usePWA();

  // ── Sound States ──
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(80);
  const [isSoundMuted, setIsSoundMuted] = useState(false);

  // ── UI States ──
  const [cachedSize, setCachedSize] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [isCheckingCache, setIsCheckingCache] = useState(false);
  const [networkLatency, setNetworkLatency] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastChecked, setLastChecked] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionType, setConnectionType] = useState('unknown');
  const [effectiveType, setEffectiveType] = useState('unknown');
  
  // ✅ Track if install is in progress
  const [isInstalling, setIsInstalling] = useState(false);

  // ✅ Notification Permission
  const notificationPermission = useMemo(() => {
    return getNotificationPermission?.() || 'default';
  }, [getNotificationPermission]);

  // ✅ Build Date
  const buildInfo = useMemo(() => ({
    version: APP_VERSION,
    date: BUILD_DATE,
    full: `WorkTrustbd v${APP_VERSION} (Build ${BUILD_DATE})`
  }), []);

  // ── Load sound settings ──
  useEffect(() => {
    const savedMuted = localStorage.getItem('sound_muted');
    const savedVolume = localStorage.getItem('sound_volume');
    
    if (savedMuted !== null) {
      setIsSoundMuted(savedMuted === 'true');
      setSoundEnabled(savedMuted !== 'true');
    }
    if (savedVolume !== null) {
      setSoundVolume(parseInt(savedVolume) || 80);
    }
  }, []);

  // ── Navigate to Sound Settings ──
  const goToSoundSettings = useCallback(() => {
    sound?.playEvent(SOUND_EVENTS.CLICK);
    navigate('/settings', { state: { activeTab: 'sound' } });
  }, [navigate, sound]);

  // ── Test Sound ──
  const handleTestSound = useCallback(() => {
    if (isSoundMuted || !soundEnabled || soundVolume === 0) {
      feedback?.showWarning('🔇 সাউন্ড বন্ধ', 'সাউন্ড টেস্ট করতে দয়া করে সাউন্ড সেটিংস থেকে সাউন্ড চালু করুন।');
      return;
    }
    
    sound?.playEvent(SOUND_EVENTS.NOTIFICATION);
    feedback?.showSuccess('🔊 টেস্ট সাউন্ড', 'নোটিফিকেশন সাউন্ড বাজানো হচ্ছে!');
  }, [isSoundMuted, soundEnabled, soundVolume, sound, feedback]);

  // ── Test Notification ──
  const handleTestNotification = useCallback(() => {
    if (notificationPermission !== 'granted') {
      feedback?.showWarning('⚠️ পারমিশন নেই', 'নোটিফিকেশন টেস্ট করতে পারমিশন দিন।');
      return;
    }

    try {
      new Notification('🔔 টেস্ট নোটিফিকেশন', {
        body: 'আপনার নোটিফিকেশন সঠিকভাবে কাজ করছে!',
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: 'test-notification',
      });
      feedback?.showSuccess('✅ টেস্ট সফল', 'নোটিফিকেশন পাঠানো হয়েছে!');
    } catch (error) {
      feedback?.showError('❌ ব্যর্থ', 'নোটিফিকেশন পাঠাতে সমস্যা হয়েছে।');
    }
  }, [notificationPermission, feedback]);

  // ── Play sound helper ──
  const playSound = useCallback((event, message = '') => {
    if (sound?.playEvent && !isSoundMuted && soundEnabled) {
      sound.playEvent(event);
      if (message) {
        console.log(`🔊 ${message}`);
      }
    }
  }, [sound, isSoundMuted, soundEnabled]);

  // ── Online Status ──
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      playSound(SOUND_EVENTS.SUCCESS, '🟢 Online');
      feedback?.showSuccess('🟢 Online', 'You are back online!');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      playSound(SOUND_EVENTS.WARNING, '🔴 Offline');
      feedback?.showWarning('🔴 Offline', 'You are offline. Some features may not work.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [feedback, playSound]);

  // ── Connection Type ──
  useEffect(() => {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      if (connection) {
        setEffectiveType(connection.effectiveType || 'unknown');
        setConnectionType(connection.type || 'unknown');
        
        const updateConnection = () => {
          setEffectiveType(connection.effectiveType || 'unknown');
          setConnectionType(connection.type || 'unknown');
        };
        
        connection.addEventListener('change', updateConnection);
        return () => connection.removeEventListener('change', updateConnection);
      }
    }
  }, []);

  // ── Get Cache Size ──
  useEffect(() => {
    const getCacheAndStorage = async () => {
      setIsLoading(true);
      try {
        if (storageUsage > 0) {
          setCachedSize(storageUsage);
        }
        if (storageQuotaFromHook > 0) {
          setStorageQuota(storageQuotaFromHook);
        }

        if ('caches' in window && storageUsage === 0) {
          const cacheNames = await caches.keys();
          let total = 0;
          for (const name of cacheNames) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            const chunkSize = 10;
            for (let i = 0; i < keys.length; i += chunkSize) {
              const chunk = keys.slice(i, i + chunkSize);
              await Promise.all(chunk.map(async (request) => {
                try {
                  const response = await cache.match(request);
                  if (response) {
                    const blob = await response.blob();
                    total += blob.size;
                  }
                } catch (e) {
                  // Skip individual errors
                }
              }));
            }
          }
          setCachedSize(total);
        }

        if ('storage' in navigator && 'estimate' in navigator.storage && storageQuotaFromHook === 0) {
          const estimate = await navigator.storage.estimate();
          setStorageQuota(estimate.quota || 0);
        }
      } catch (error) {
        console.error('Error getting storage info:', error);
      } finally {
        setIsLoading(false);
      }
    };

    getCacheAndStorage();
  }, [storageUsage, storageQuotaFromHook]);

  // ── Check Network Latency ──
  const checkLatency = useCallback(async () => {
    playSound(SOUND_EVENTS.CLICK, '🔄 Checking network...');
    try {
      const start = Date.now();
      const response = await fetch('/manifest.webmanifest', { 
        method: 'HEAD', 
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Network error');
      const end = Date.now();
      setNetworkLatency(end - start);
      setLastChecked(new Date());
      playSound(SOUND_EVENTS.SUCCESS, `✅ Connected - ${end - start}ms`);
      feedback?.showSuccess('✅ Connected', `Latency: ${end - start}ms`);
    } catch (error) {
      setNetworkLatency(null);
      playSound(SOUND_EVENTS.ERROR, '❌ Network check failed');
      feedback?.showError('❌ Failed', 'Could not check connection. Please try again.');
    }
  }, [feedback, playSound]);

  // ── Clear Cache ──
  const clearCache = useCallback(async () => {
    playSound(SOUND_EVENTS.CLICK, '🗑️ Clearing cache...');
    
    const confirmed = await feedback?.confirm({
      title: 'Clear Cache?',
      message: 'This will clear all cached files. You will still be able to use the app, but some pages may load slower temporarily.',
      variant: 'confirm',
      confirmText: 'Clear Cache',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      playSound(SOUND_EVENTS.CLICK, '❌ Cache clear cancelled');
      return;
    }

    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
      }
      setCachedSize(0);
      playSound(SOUND_EVENTS.SUCCESS, '✅ Cache cleared successfully');
      feedback?.showSuccess('✅ Cache Cleared', 'All cached files have been cleared successfully.');
      await refreshPWAStatus();
    } catch (error) {
      console.error('Error clearing cache:', error);
      playSound(SOUND_EVENTS.ERROR, '❌ Cache clear failed');
      feedback?.showError('❌ Failed', 'Could not clear cache. Please try again.');
    }
  }, [feedback, playSound, refreshPWAStatus]);

  // ── Check for Update ──
  const handleCheckUpdate = useCallback(async () => {
    playSound(SOUND_EVENTS.CLICK, '🔄 Checking for updates...');
    setIsCheckingCache(true);
    try {
      const result = await checkForUpdate();
      if (result) {
        playSound(SOUND_EVENTS.NOTIFICATION, '🔄 Update check completed');
        feedback?.showInfo('🔄 Checked', 'Update check completed.');
      } else {
        playSound(SOUND_EVENTS.SUCCESS, '✅ Up to date');
        feedback?.showInfo('✅ Up to Date', 'You are running the latest version.');
      }
      await refreshPWAStatus();
    } catch (error) {
      playSound(SOUND_EVENTS.ERROR, '❌ Update check failed');
      feedback?.showError('❌ Failed', 'Could not check for updates.');
    } finally {
      setIsCheckingCache(false);
    }
  }, [checkForUpdate, feedback, playSound, refreshPWAStatus]);

  // ── Reload App ──
  const reloadApp = useCallback(() => {
    playSound(SOUND_EVENTS.CLICK, '🔄 Reloading app...');
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SKIP_WAITING'
      });
    }
    window.location.reload();
  }, [playSound]);

  // ── Handle Notification Permission ──
  const handleRequestPermission = useCallback(async () => {
    playSound(SOUND_EVENTS.CLICK, '🔔 Requesting notification permission...');
    
    if (!('Notification' in window)) {
      playSound(SOUND_EVENTS.ERROR, '❌ Notifications not supported');
      feedback?.showWarning('⚠️ Not Supported', 'Notifications are not supported in this browser.');
      return;
    }

    if (Notification.permission === 'granted') {
      playSound(SOUND_EVENTS.SUCCESS, '✅ Permission already granted');
      feedback?.showInfo('✅ Granted', 'Notification permission is already granted.');
      return;
    }

    if (Notification.permission === 'denied') {
      playSound(SOUND_EVENTS.WARNING, '❌ Permission denied');
      feedback?.showError('❌ Denied', 'Notification permission was denied. Please enable it in browser settings.');
      return;
    }

    try {
      const result = await requestNotificationPermissionFromHook();
      if (result?.success) {
        playSound(SOUND_EVENTS.SUCCESS, '✅ Permission granted');
        feedback?.showSuccess('✅ Permission Granted', 'You will now receive notifications.');
      } else if (result?.permission === 'denied') {
        playSound(SOUND_EVENTS.WARNING, '❌ Permission denied');
        feedback?.showWarning('❌ Permission Denied', 'You can enable notifications later from browser settings.');
      }
      await refreshPWAStatus();
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      playSound(SOUND_EVENTS.ERROR, '❌ Permission request failed');
      feedback?.showError('❌ Failed', 'Could not request notification permission.');
    }
  }, [feedback, requestNotificationPermissionFromHook, playSound, refreshPWAStatus]);

  // ── Copy Version ──
  const copyVersion = useCallback(() => {
    const text = buildInfo.full;
    playSound(SOUND_EVENTS.CLICK, '📋 Copying version...');
    
    navigator.clipboard?.writeText(text).then(() => {
      playSound(SOUND_EVENTS.SUCCESS, '✅ Version copied');
      feedback?.showSuccess('✅ Copied', `Version ${buildInfo.version} copied to clipboard!`);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      playSound(SOUND_EVENTS.SUCCESS, '✅ Version copied (fallback)');
      feedback?.showSuccess('✅ Copied', `Version ${buildInfo.version} copied to clipboard!`);
    });
  }, [buildInfo, feedback, playSound]);

  // ── ✅ INSTALL APP - COMPLETELY FIXED ──
  const handleInstallApp = useCallback(async () => {
    console.log('🔧 Install button clicked - User gesture present!');
    console.log('  - isInstallable:', isInstallable);
    console.log('  - canInstall:', canInstall);
    console.log('  - hasDeferredPrompt:', !!deferredPrompt);
    console.log('  - window.deferredPrompt:', !!window.deferredPrompt);
    console.log('  - isIOS:', isIOS);
    console.log('  - isInstalled:', isInstalled);
    console.log('  - isStandalone:', isStandalone);
    
    // ✅ Check if already installed
    if (isInstalled || isStandalone) {
      feedback?.showInfo('✅ Already Installed', 'WorkTrustbd is already installed on your device.');
      return;
    }

    // ✅ iOS fallback
    if (isIOS) {
      feedback?.showInfo(
        '📱 Install on iOS',
        'Tap the Share button (square with arrow) and select "Add to Home Screen" to install WorkTrustbd.'
      );
      return;
    }

    // ✅ Prevent multiple install clicks
    if (isInstalling) {
      feedback?.showInfo('⏳ Please wait', 'Installation is already in progress.');
      return;
    }

    // ✅ Try to get prompt from multiple sources
    let prompt = deferredPrompt || window.deferredPrompt;
    
    if (!prompt) {
      console.warn('❌ No deferredPrompt found');
      
      // ✅ Check if installable but prompt not ready
      if (isInstallable) {
        feedback?.showInfo(
          '⏳ Loading',
          'Install prompt is loading. Please try again in a moment.'
        );
        // ✅ Refresh status after 2 seconds
        setTimeout(async () => {
          await refreshPWAStatus();
        }, 2000);
        return;
      }
      
      // ✅ Show browser instruction
      feedback?.showInfo(
        '📱 Install via Browser',
        'Open this page in Chrome or Edge browser and select "Install App" from the browser menu.\n\n' +
        '📍 Chrome: Click the download icon (⬇️) in the address bar\n' +
        '📍 Edge: Click the install icon (📱) in the address bar'
      );
      return;
    }

    // ✅ Set installing state
    setIsInstalling(true);
    playSound(SOUND_EVENTS.CLICK, '📥 Installing app...');
    
    try {
      console.log('📱 Showing install prompt...');
      
      // ✅ Show the install prompt (User gesture is present from click!)
      await prompt.prompt();
      
      // ✅ Wait for user choice
      const choiceResult = await prompt.userChoice;
      console.log('📱 User choice:', choiceResult);
      
      // ✅ Clear the prompt
      window.deferredPrompt = null;
      
      if (choiceResult.outcome === 'accepted') {
        console.log('✅ User accepted install');
        feedback?.showSuccess('✅ Installed!', 'WorkTrustbd installed successfully!');
        await refreshPWAStatus();
      } else {
        console.log('❌ User dismissed install');
        feedback?.showInfo('⏭️ Skipped', 'Installation skipped. You can try again later.');
      }
    } catch (error) {
      console.error('❌ Install error:', error);
      feedback?.showError('❌ Failed', 'Could not install. Please try again or use browser menu.');
    } finally {
      setIsInstalling(false);
    }
  }, [
    isInstallable, 
    canInstall, 
    deferredPrompt, 
    isIOS, 
    isInstalled, 
    isStandalone, 
    isInstalling,
    feedback, 
    playSound, 
    refreshPWAStatus
  ]);

  // ── Update App ──
  const handleUpdateApp = useCallback(async () => {
    playSound(SOUND_EVENTS.CLICK, '🔄 Updating app...');
    feedback?.showLoading('Updating...', 'Please wait while the app updates.');
    const result = await updateApp();
    if (result?.success) {
      await refreshPWAStatus();
    }
  }, [updateApp, feedback, playSound, refreshPWAStatus]);

  // ── Refresh Status ──
  const handleRefreshStatus = useCallback(async () => {
    playSound(SOUND_EVENTS.CLICK, '🔄 Refreshing status...');
    await refreshPWAStatus();
    feedback?.showSuccess('✅ Refreshed', 'App status has been refreshed.');
  }, [refreshPWAStatus, feedback, playSound]);

  // ── Format Bytes ──
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ── Get Platform Emoji ──
  const getPlatformEmoji = () => {
    switch (platform) {
      case 'android': return '📱';
      case 'ios': return '🍎';
      case 'windows': return '💻';
      case 'mac': return '🖥️';
      default: return '🌐';
    }
  };

  // ── Get Browser Icon ──
  const getBrowserIcon = () => {
    switch (browser) {
      case 'chrome': return '🌐';
      case 'edge': return '🌊';
      case 'firefox': return '🦊';
      case 'safari': return '🧭';
      case 'samsung': return '📱';
      default: return '🌐';
    }
  };

  // ── Get Browser Name ──
  const getBrowserName = () => {
    switch (browser) {
      case 'chrome': return 'Google Chrome';
      case 'edge': return 'Microsoft Edge';
      case 'firefox': return 'Mozilla Firefox';
      case 'safari': return 'Safari';
      case 'samsung': return 'Samsung Internet';
      default: return browser || 'Unknown';
    }
  };

  // ── Get Connection Label ──
  const getConnectionLabel = () => {
    const typeMap = {
      'wifi': '📶 Wi-Fi',
      'cellular': '📱 Cellular',
      'ethernet': '🔌 Ethernet',
      'bluetooth': '📡 Bluetooth',
      'unknown': '❓ Unknown',
    };
    const typeLabel = typeMap[connectionType] || connectionType;
    const effectiveLabel = effectiveType !== 'unknown' ? ` (${effectiveType.toUpperCase()})` : '';
    return typeLabel + effectiveLabel;
  };

  // ── Get Notification Permission Label ──
  const getNotificationLabel = () => {
    switch (notificationPermission) {
      case 'granted': return '✅ Granted';
      case 'denied': return '❌ Denied';
      default: return '⏳ Not Asked';
    }
  };

  // ── Debug Log ──
  useEffect(() => {
    console.log('📱 AppDeviceTab PWA Status:', {
      isInstallable,
      isInstalled,
      isStandalone,
      canInstall,
      hasDeferredPrompt: !!deferredPrompt,
      hasWindowPrompt: !!window.deferredPrompt,
      platform,
      browser,
      isIOS
    });
  }, [isInstallable, isInstalled, isStandalone, canInstall, deferredPrompt, platform, browser, isIOS]);

  if (isLoading || pwaLoading) {
    return (
      <div className="app-device-tab">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading device info...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-device-tab">
      <div className="app-device-header">
        <h2>
          <i className="fa-solid fa-mobile-screen-button"></i>
          App & Device
        </h2>
        <p className="header-subtitle">
          Manage your app installation, updates, and device settings
        </p>
      </div>

      {/* ── Installation Card - FIXED ✅ ── */}
      <div className="app-device-card">
        <div className="card-header">
          <div className="card-icon">
            <i className="fa-solid fa-download"></i>
          </div>
          <div className="card-title">
            <h3>Installation</h3>
            <span className={`status-badge ${isInstalled || isStandalone ? 'installed' : 'not-installed'}`}>
              {isInstalled || isStandalone ? '✅ Installed' : '📥 Not Installed'}
            </span>
          </div>
        </div>

        <div className="card-body">
          {isInstalled || isStandalone ? (
            <div className="install-success">
              <i className="fa-solid fa-check-circle"></i>
              <p>WorkTrustbd is running as an installed app</p>
              <small>You can access it from your home screen</small>
            </div>
          ) : (
            <div className="install-actions">
              <p className="install-description">
                Install WorkTrustbd on your device for a faster, offline-ready experience.
              </p>
              
              {/* ✅ ALWAYS show install button if not installed */}
              <button 
                className="install-btn" 
                onClick={handleInstallApp}
                disabled={isIOS || isInstalling}
              >
                <i className={`fa-solid ${isInstalling ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
                {isIOS ? 'iOS: Add to Home Screen' : 
                 isInstalling ? 'Installing...' : 
                 'Install WorkTrustbd'}
              </button>
              
              {isIOS && (
                <small className="ios-hint">
                  📱 Tap the Share button and select "Add to Home Screen"
                </small>
              )}
              
              {!isIOS && !deferredPrompt && !window.deferredPrompt && !isInstalling && (
                <small className="browser-hint">
                  💡 Look for the install icon (⬇️) in your browser's address bar
                </small>
              )}
              
              {!isIOS && (deferredPrompt || window.deferredPrompt) && !isInstalling && (
                <small className="browser-hint" style={{ color: '#14b8a6' }}>
                  ✅ Click "Install WorkTrustbd" to install the app
                </small>
              )}
            </div>
          )}
        </div>
      </div>






      {/* ── Update Card ── */}
      <div className="app-device-card">
        <div className="card-header">
          <div className="card-icon">
            <i className="fa-solid fa-rotate"></i>
          </div>
          <div className="card-title">
            <h3>Update</h3>
            {isUpdateAvailable && (
              <span className="status-badge update-available">🔄 Update Available</span>
            )}
          </div>

        </div>

        <div className="card-body">
          {isUpdateAvailable ? (
            <div className="update-available">
              <div className="update-info">
                <i className="fa-solid fa-circle-exclamation"></i>
                <div>
                  <p>A new version of WorkTrustbd is available</p>
                  <small>Version {buildInfo.version}</small>
                </div>
              </div>
              <div className="update-actions">
                <button className="update-btn" onClick={handleUpdateApp}>
                  <i className="fa-solid fa-arrow-up-right-from-square"></i>
                  Update Now
                </button>
                <button className="update-later-btn" onClick={dismissUpdate}>
                  Later
                </button>
              </div>
            </div>
          ) : (
            <div className="update-current">
              <i className="fa-solid fa-check-circle"></i>
              <div>
                <p>You are running the latest version</p>
                <small>Version {buildInfo.version}</small>
              </div>
              <button className="check-update-btn" onClick={handleCheckUpdate} disabled={isCheckingCache}>
                {isCheckingCache ? 'Checking...' : 'Check for Update'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Storage Card ── */}
      <div className="app-device-card">
        <div className="card-header">
          <div className="card-icon">
            <i className="fa-solid fa-hard-drive"></i>
          </div>
          <div className="card-title">
            <h3>Storage</h3>
            <span className="status-badge info">
              {storageQuota > 0 
                ? `${((cachedSize / storageQuota) * 100).toFixed(1)}% used`
                : formatBytes(cachedSize)}
            </span>
          </div>
        </div>

        <div className="card-body">
          <div className="storage-info">
            <div className="storage-detail">
              <span>Cached Files</span>
              <span>{formatBytes(cachedSize)}</span>
            </div>
            <div className="storage-detail">
              <span>Offline Ready</span>
              <span>{isOfflineReady ? '✅ Yes' : '❌ No'}</span>
            </div>
            {storageQuota > 0 && (
              <>
                <div className="storage-detail">
                  <span>Total Storage</span>
                  <span>{formatBytes(storageQuota)}</span>
                </div>
                <div className="storage-bar">
                  <div 
                    className="storage-bar-fill" 
                    style={{ width: `${(cachedSize / storageQuota) * 100}%` }}
                  />
                </div>
                <div className="storage-detail">
                  <span>Available</span>
                  <span>{formatBytes(storageQuota - cachedSize)}</span>
                </div>
              </>
            )}
            <button 
              className="clear-cache-btn" 
              onClick={clearCache}
              disabled={false}  // ✅ Enabled now
            >
              <i className="fa-solid fa-trash"></i>
              Clear Cache
            </button>
          </div>
        </div>
      </div>

      {/* ── Network Card ── */}
      <div className="app-device-card">
        <div className="card-header">
          <div className="card-icon">
            <i className="fa-solid fa-wifi"></i>
          </div>
          <div className="card-title">
            <h3>Network</h3>
            <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? '🟢 Online' : '🔴 Offline'}
            </span>
          </div>
        </div>

        <div className="card-body">
          <div className="network-info">
            <div className="network-detail">
              <span>Status</span>
              <span>{isOnline ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="network-detail">
              <span>Connection</span>
              <span>{getConnectionLabel()}</span>
            </div>
            {networkLatency !== null && (
              <div className="network-detail">
                <span>Latency</span>
                <span>{networkLatency} ms</span>
              </div>
            )}
            {lastChecked && (
              <div className="network-detail">
                <span>Last Check</span>
                <span>{lastChecked.toLocaleTimeString()}</span>
              </div>
            )}
            <button className="check-network-btn" onClick={checkLatency}>
              <i className="fa-solid fa-rotate"></i>
              Check Connection
            </button>
          </div>
        </div>
      </div>



      {/* ── Device Info Card ── */}
      <div className="app-device-card">
        <div className="card-header">
          <div className="card-icon">
            <i className="fa-solid fa-circle-info"></i>
          </div>
          <div className="card-title">
            <h3>Device & App Info</h3>
          </div>
        </div>

        <div className="card-body">
          <div className="device-info-grid">
            <div className="device-info-item">
              <span className="label">Version</span>
              <span className="value" style={{ cursor: 'pointer' }} onClick={copyVersion} title="Click to copy">
                {buildInfo.version} <i className="fa-solid fa-copy" style={{ fontSize: '12px', opacity: 0.5 }}></i>
              </span>
            </div>
            <div className="device-info-item">
              <span className="label">Build Date</span>
              <span className="value">{buildInfo.date}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Platform</span>
              <span className="value">{getPlatformEmoji()} {platform}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Browser</span>
              <span className="value">{getBrowserIcon()} {getBrowserName()}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Mode</span>
              <span className="value">{isStandalone ? '📱 App' : '🌐 Browser'}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Service Worker</span>
              <span className="value">{isSWRegistered ? '✅ Registered' : '❌ Not Registered'}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Installed</span>
              <span className="value">{isInstalled || isStandalone ? '✅ Yes' : '❌ No'}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Offline Ready</span>
              <span className="value">{isOfflineReady ? '✅ Yes' : '❌ No'}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Screen</span>
              <span className="value">{window.screen.width} × {window.screen.height}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Language</span>
              <span className="value">{navigator.language || 'Unknown'}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Timezone</span>
              <span className="value">{Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown'}</span>
            </div>
            <div className="device-info-item">
              <span className="label">Color Scheme</span>
              <span className="value">
                {window.matchMedia('(prefers-color-scheme: dark)').matches ? '🌙 Dark' : '☀️ Light'}
              </span>
            </div>
            <div className="device-info-item">
              <span className="label">Touch Support</span>
              <span className="value">{('ontouchstart' in window) || navigator.maxTouchPoints > 0 ? '✅ Yes' : '❌ No'}</span>
            </div>
            {'hardwareConcurrency' in navigator && (
              <div className="device-info-item">
                <span className="label">CPU Cores</span>
                <span className="value">{navigator.hardwareConcurrency}</span>
              </div>
            )}
            {'deviceMemory' in navigator && (
              <div className="device-info-item">
                <span className="label">Device Memory</span>
                <span className="value">{navigator.deviceMemory ?? 'Unknown'} GB</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Actions Card ── */}
      <div className="app-device-card">
        <div className="card-header">
          <div className="card-icon">
            <i className="fa-solid fa-tools"></i>
          </div>
          <div className="card-title">
            <h3>Actions</h3>
          </div>
        </div>

        <div className="card-body">
          <div className="actions-grid">
            <button className="action-btn" onClick={reloadApp}>
              <i className="fa-solid fa-rotate"></i>
              Reload App
            </button>
            <button className="action-btn" onClick={handleCheckUpdate} disabled={isCheckingCache}>
              <i className="fa-solid fa-arrow-up-right-from-square"></i>
              {isCheckingCache ? 'Checking...' : 'Check for Update'}
            </button>
            <button className="action-btn" onClick={clearCache}>
              <i className="fa-solid fa-trash"></i>
              Clear Cache
            </button>
            <button className="action-btn" onClick={copyVersion}>
              <i className="fa-solid fa-copy"></i>
              Copy Version
            </button>
            <button className="action-btn" onClick={handleRefreshStatus}>
              <i className="fa-solid fa-rotate"></i>
              Refresh Status
            </button>
          </div>
        </div>
      </div>

      {/* ── Build Info ── */}
      <div className="app-device-footer">
        <div className="build-info">
          <span>Build: {buildInfo.date}</span>
          <span>•</span>
          <span>WorkTrustbd v{buildInfo.version}</span>
        </div>
        <div className="app-links">
          <a href="/" className="app-link">Home</a>
          <span>•</span>
          <a href="/settings" className="app-link">Settings</a>
        </div>
      </div>
    </div>
  );
};

export default AppDeviceTab;