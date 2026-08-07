// ============================================================
// 📁 src/pages/Settings/tabs/NotificationsTab.jsx
// ============================================================
// FIXED: Loading Issue + Enterprise Ready

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { auth, db } from '@/firebase';
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import './NotificationsTab.css';

// ✅ Constants
const NOTIFICATION_SETTINGS_KEY = 'workhub_notification_settings';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// ============================================================
// 🔐 VAPID Key Helpers
// ============================================================

const isValidVapidKey = (key) => {
  return key && key.length > 10 && key.startsWith('B');
};

const urlBase64ToUint8Array = (base64String) => {
  try {
    if (!base64String || base64String.length < 10) {
      throw new Error('VAPID key is missing or invalid');
    }

    const base64 = base64String
      .replace(/\s/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const paddedBase64 = base64 + padding;
    
    const rawData = atob(paddedBase64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
  } catch (error) {
    console.error('❌ VAPID key decoding error:', error);
    throw new Error('Invalid VAPID key format. Please check your public key.');
  }
};

// ============================================================
// 📦 Push Subscription Service (Firestore)
// ============================================================

const savePushSubscription = async (userId, subscription) => {
  try {
    if (!userId) throw new Error('User ID is required');
    if (!subscription) throw new Error('Subscription is required');

    const subRef = doc(db, 'pushSubscriptions', userId);
    
    await setDoc(subRef, {
      userId: userId,
      subscription: subscription.toJSON(),
      endpoint: subscription.endpoint,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
    }, { merge: true });

    console.log('✅ Push subscription saved to Firestore');
    return { success: true };

  } catch (error) {
    console.error('❌ Error saving push subscription:', error);
    throw error;
  }
};

const removePushSubscription = async (userId) => {
  try {
    if (!userId) throw new Error('User ID is required');

    const subRef = doc(db, 'pushSubscriptions', userId);
    await deleteDoc(subRef);

    console.log('✅ Push subscription removed from Firestore');
    return { success: true };

  } catch (error) {
    console.error('❌ Error removing push subscription:', error);
    throw error;
  }
};

// ============================================================
// 🎯 Main Component
// ============================================================

const NotificationsTab = ({ 
  userId,
  onSettingsChange 
}) => {
  const feedback = useFeedback();
  const sound = useSound();
  
  // ── States ──
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  
  // ✅ Push Notification States
  const [pushPermission, setPushPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState(null);
  
  // ── Notification Settings State ──
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    dealUpdates: true,
    messageNotifications: true,
    marketingEmails: false,
    adminNotifications: true,
    walletNotifications: true,
    reviewNotifications: true,
    verificationNotifications: true,
    systemNotifications: true,
  });

  // ── Refs ──
  const isMounted = useRef(true);
  const isLoadingRef = useRef(false);

  // ============================================================
  // ✅ Helper Functions
  // ============================================================

  const isPushSupported = useCallback(() => {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }, []);

  const checkServiceWorker = async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('📱 Service Worker registrations:', registrations.length);
      
      if (registrations.length === 0) {
        console.warn('⚠️ No service worker registered');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Service Worker check error:', error);
      return false;
    }
  };

  const getServiceWorkerRegistration = useCallback(async (timeoutMs = 2000) => {
    if (!isPushSupported()) return null;
    try {
      const readyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Service Worker ready timeout')), timeoutMs)
      );
      return await Promise.race([readyPromise, timeoutPromise]);
    } catch (error) {
      console.warn('⚠️ Service Worker ready timeout or error:', error);
      return null;
    }
  }, [isPushSupported]);

  const getSubscription = useCallback(async () => {
    if (!isPushSupported()) return null;
    
    try {
      const registration = await getServiceWorkerRegistration(2000);
      if (!registration) return null;
      const subscription = await registration.pushManager.getSubscription();
      return subscription;
    } catch (error) {
      console.error('Error getting subscription:', error);
      return null;
    }
  }, [isPushSupported, getServiceWorkerRegistration]);

  // ============================================================
  // ✅ Subscribe to Push Notifications
  // ============================================================

  const subscribeToPush = async () => {
    if (isSubscribing) return;
    
    if (!isPushSupported()) {
      feedback.alert.error({ 
        message: '❌ সাপোর্ট নেই', 
        description: 'আপনার ব্রাউজার Push Notification সাপোর্ট করে না' 
      });
      return;
    }

    if (Notification.permission === 'denied') {
      feedback.alert.error({ 
        message: '❌ ব্লক করা হয়েছে', 
        description: 'ব্রাউজার সেটিংস থেকে Notification Permission চালু করুন' 
      });
      return;
    }

    setIsSubscribing(true);
    
    try {
      // ✅ Check permission
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          feedback.alert.warning({ 
            message: '⚠️ পারমিশন প্রয়োজন', 
            description: 'নোটিফিকেশন পেতে পারমিশন দিন' 
          });
          setIsSubscribing(false);
          return;
        }
      }

      // ✅ Validate VAPID key
      if (!isValidVapidKey(VAPID_PUBLIC_KEY)) {
        feedback.alert.error({ 
          message: '❌ কনফিগারেশন ত্রুটি', 
          description: 'VAPID key সেট করা নেই বা সঠিক নয়। অ্যাডমিনকে জানান।' 
        });
        setIsSubscribing(false);
        return;
      }

      // ✅ Check Service Worker
      const hasSW = await checkServiceWorker();
      if (!hasSW) {
        feedback.alert.error({ 
          message: '❌ Service Worker নেই', 
          description: 'Service Worker রেজিস্টার হয়নি। পেজ রিফ্রেশ করুন।' 
        });
        setIsSubscribing(false);
        return;
      }

      const registration = await getServiceWorkerRegistration(5000);
      if (!registration) {
        feedback.alert.error({ 
          message: '❌ Service Worker রেডি নয়', 
          description: 'Service Worker সচল হতে বেশি সময় নিচ্ছে। পেজ রিফ্রেশ করুন।' 
        });
        setIsSubscribing(false);
        return;
      }
      
      // ✅ Check if already subscribed
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        setSubscription(existingSubscription);
        setIsSubscribed(true);
        setPushPermission('granted');
        
        // ✅ Save to Firestore if not saved
        const currentUser = auth.currentUser;
        const userIdToUse = currentUser?.uid || userId;
        await savePushSubscription(userIdToUse, existingSubscription);
        
        feedback.alert.success({ 
          message: '✅ ইতিমধ্যে Push Notification চালু আছে!' 
        });
        setIsSubscribing(false);
        return;
      }

      // ✅ Subscribe with VAPID key
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      
      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey,
      });

      setSubscription(newSubscription);
      setIsSubscribed(true);
      setPushPermission('granted');
      
      // ✅ Save to Firestore
      const currentUser = auth.currentUser;
      const userIdToUse = currentUser?.uid || userId;
      await savePushSubscription(userIdToUse, newSubscription);
      
      // ✅ Update settings
      const newSettings = {
        ...notificationSettings,
        pushNotifications: true
      };
      setNotificationSettings(newSettings);
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(newSettings));
      
      if (onSettingsChange) {
        onSettingsChange(newSettings);
      }
      
      feedback.alert.success({ 
        message: '✅ Push Notification চালু হয়েছে!' 
      });
      
    } catch (error) {
      console.error('❌ Error subscribing to push:', error);
      
      if (error.message.includes('InvalidCharacterError') || error.message.includes('atob')) {
        feedback.alert.error({ 
          message: '❌ VAPID Key Error', 
          description: 'VAPID key ফরম্যাট সঠিক নয়। অ্যাডমিনকে জানান।' 
        });
      } else if (error.message.includes('permission')) {
        feedback.alert.error({ 
          message: '❌ পারমিশন প্রয়োজন', 
          description: 'ব্রাউজার সেটিংস থেকে অনুমতি দিন' 
        });
      } else {
        feedback.alert.error({ 
          message: '❌ সাবস্ক্রাইব ব্যর্থ', 
          description: error.message || 'Push Notification চালু করতে সমস্যা হয়েছে' 
        });
      }
    } finally {
      setIsSubscribing(false);
    }
  };

  // ============================================================
  // ✅ Unsubscribe from Push Notifications
  // ============================================================

  const unsubscribeFromPush = async () => {
    if (!isPushSupported() || !subscription) {
      feedback.alert.warning({ 
        message: '⚠️ কোন সাবস্ক্রিপশন নেই', 
        description: 'আপনি ইতিমধ্যে Push Notification বন্ধ করেছেন।' 
      });
      return;
    }

    setIsSubscribing(true);
    
    try {
      await subscription.unsubscribe();
      setSubscription(null);
      setIsSubscribed(false);
      
      // ✅ Remove from Firestore
      const currentUser = auth.currentUser;
      const userIdToUse = currentUser?.uid || userId;
      await removePushSubscription(userIdToUse);
      
      // ✅ Update settings
      const newSettings = {
        ...notificationSettings,
        pushNotifications: false
      };
      setNotificationSettings(newSettings);
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(newSettings));
      
      if (onSettingsChange) {
        onSettingsChange(newSettings);
      }
      
      feedback.alert.success({ 
        message: '✅ Push Notification বন্ধ করা হয়েছে!' 
      });
      
    } catch (error) {
      console.error('❌ Error unsubscribing:', error);
      feedback.alert.error({ 
        message: '❌ আনসাবস্ক্রাইব ব্যর্থ', 
        description: error.message 
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  // ============================================================
  // ✅ Load Settings & Check Subscription
  // ============================================================

  useEffect(() => {
    isMounted.current = true;
    
    const loadSettings = async () => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      
      try {
        // ── Load settings from localStorage ──
        const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (isMounted.current) {
              setNotificationSettings(prev => ({ ...prev, ...parsed }));
            }
          } catch (e) {
            console.error('Error loading notification settings:', e);
          }
        }

        // ── Check push subscription ──
        if (isPushSupported()) {
          const permission = Notification.permission;
          if (isMounted.current) {
            setPushPermission(permission);
          }
          
          try {
            const sub = await getSubscription();
            if (isMounted.current) {
              if (sub) {
                setSubscription(sub);
                setIsSubscribed(true);
              } else {
                setIsSubscribed(false);
              }
            }
          } catch (error) {
            console.error('Error getting subscription:', error);
            if (isMounted.current) {
              setIsSubscribed(false);
            }
          }
        }
        
        if (isMounted.current) {
          setIsLoading(false);
        }
        
      } catch (error) {
        console.error('Error loading settings:', error);
        if (isMounted.current) {
          setIsLoading(false);
        }
      } finally {
        isLoadingRef.current = false;
      }
    };

    loadSettings();

    return () => {
      isMounted.current = false;
    };
  }, [isPushSupported]);

  // ============================================================
  // ✅ Listen for Permission Changes
  // ============================================================

  useEffect(() => {
    if (!isPushSupported()) return;

    const handlePermissionChange = () => {
      const permission = Notification.permission;
      setPushPermission(permission);
      
      if (permission === 'denied' && isSubscribed) {
        setIsSubscribed(false);
        setSubscription(null);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handlePermissionChange();
        
        // ✅ Re-check subscription on visibility change
        if (isPushSupported()) {
          getSubscription().then(sub => {
            if (isMounted.current) {
              if (sub) {
                setSubscription(sub);
                setIsSubscribed(true);
              } else {
                setIsSubscribed(false);
              }
            }
          }).catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'notifications' })
        .then((status) => {
          status.onchange = handlePermissionChange;
        })
        .catch(() => {});
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPushSupported, isSubscribed]);

  // ============================================================
  // ✅ Save Settings
  // ============================================================

  const saveSettings = useCallback((newSettings) => {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(newSettings));
    setNotificationSettings(newSettings);
    
    if (onSettingsChange) {
      onSettingsChange(newSettings);
    }
    
    sound?.playEvent(SOUND_EVENTS.SUCCESS);
  }, [onSettingsChange, sound]);

  // ============================================================
  // ✅ Toggle Setting
  // ============================================================

  const toggleSetting = useCallback(async (key) => {
    const newValue = !notificationSettings[key];
    const newSettings = {
      ...notificationSettings,
      [key]: newValue
    };

    // ✅ Push Notification Toggle হলে
    if (key === 'pushNotifications') {
      if (!newValue && isSubscribed) {
        await unsubscribeFromPush();
      } else if (newValue && !isSubscribed) {
        await subscribeToPush();
      }
    }

    saveSettings(newSettings);
    sound?.playEvent(SOUND_EVENTS.CLICK);
  }, [notificationSettings, isSubscribed, saveSettings, sound]);

  // ============================================================
  // ✅ Reset to Default
  // ============================================================

  const handleReset = useCallback(async () => {
    const confirmed = await feedback.confirm({
      title: 'Reset Notification Settings',
      message: 'Are you sure you want to reset all notification settings to default?',
      variant: 'confirm',
      confirmText: 'Yes, Reset',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    const defaultSettings = {
      emailNotifications: true,
      pushNotifications: true,
      dealUpdates: true,
      messageNotifications: true,
      marketingEmails: false,
      adminNotifications: true,
      walletNotifications: true,
      reviewNotifications: true,
      verificationNotifications: true,
      systemNotifications: true,
    };

    saveSettings(defaultSettings);
    feedback.alert.success({ 
      message: '✅ নোটিফিকেশন রিসেট', 
      description: 'সব নোটিফিকেশন সেটিংস ডিফল্টে রিসেট করা হয়েছে!' 
    });
  }, [feedback, saveSettings]);

  // ============================================================
  // ✅ Components
  // ============================================================

  const ToggleSwitch = useCallback(({ checked, onChange, label, description, disabled = false }) => (
    <div className="noti-toggle-item">
      <div className="noti-toggle-info">
        <span className="noti-toggle-label">{label}</span>
        {description && <span className="noti-toggle-description">{description}</span>}
      </div>
      <button
        className={`noti-toggle-switch ${checked ? 'active' : ''}`}
        onClick={onChange}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
      >
        <span className="noti-toggle-slider"></span>
        <span className="noti-toggle-status">{checked ? 'চালু' : 'বন্ধ'}</span>
      </button>
    </div>
  ), []);

  const NotificationCategory = useCallback(({ icon, label, settingKey, description }) => {
    const isChecked = notificationSettings?.[settingKey] !== false;
    
    return (
      <div className="noti-category">
        <div className="noti-category-icon">{icon}</div>
        <div className="noti-category-info">
          <span className="noti-category-name">{label}</span>
          <span className="noti-category-desc">{description}</span>
        </div>
        <ToggleSwitch
          checked={isChecked}
          onChange={() => toggleSetting(settingKey)}
        />
      </div>
    );
  }, [notificationSettings, toggleSetting, ToggleSwitch]);

  // ============================================================
  // ✅ Render
  // ============================================================

  if (isLoading) {
    return (
      <div className="noti-tab-loading">
        <div className="loading-spinner"></div>
        <p>নোটিফিকেশন সেটিংস লোড হচ্ছে...</p>
      </div>
    );
  }

  return (
    <div className="noti-tab">
      {/* ── Header ── */}
      <div className="noti-tab-header">
        <h2>
          <i className="fa-solid fa-bell"></i>
          নোটিফিকেশন
        </h2>
        <p className="header-subtitle">
          আপনার পছন্দ অনুযায়ী নোটিফিকেশন সেটিংস কাস্টমাইজ করুন
        </p>
      </div>

      {/* ✅ PUSH NOTIFICATION SECTION */}
      <div className="noti-push-section">
        <div className="push-card">
          <div className="push-card-header">
            <div className="push-icon">
              <i className={`fa-solid ${pushPermission === 'granted' ? 'fa-check-circle' : 'fa-bell'}`}></i>
            </div>
            <div className="push-info">
              <h4>Push Notification</h4>
              <p>
                {isSubscribing ? (
                  '⏳ প্রক্রিয়াধীন...'
                ) : pushPermission === 'granted' ? (
                  '✅ Notification সক্রিয় আছে'
                ) : pushPermission === 'denied' ? (
                  '❌ Notification ব্লক করা আছে'
                ) : (
                  '🔔 Notification চালু করুন'
                )}
              </p>
            </div>
            <div className="push-actions">
              {pushPermission === 'granted' ? (
                isSubscribed ? (
                  <button 
                    className="push-btn danger" 
                    onClick={unsubscribeFromPush}
                    disabled={isSubscribing}
                  >
                    <i className="fa-solid fa-bell-slash"></i> বন্ধ করুন
                  </button>
                ) : (
                  <button 
                    className="push-btn primary" 
                    onClick={subscribeToPush}
                    disabled={isSubscribing}
                  >
                    <i className="fa-solid fa-bell"></i> চালু করুন
                  </button>
                )
              ) : pushPermission === 'denied' ? (
                <button className="push-btn warning" disabled>
                  <i className="fa-solid fa-exclamation-triangle"></i> ব্রাউজার সেটিংস চেক করুন
                </button>
              ) : (
                <button 
                  className="push-btn primary" 
                  onClick={subscribeToPush}
                  disabled={isSubscribing}
                >
                  <i className="fa-solid fa-bell"></i> চালু করুন
                </button>
              )}
            </div>
          </div>
          <div className="push-status">
            <span className="status-label">স্ট্যাটাস:</span>
            <span className={`status-badge ${pushPermission === 'granted' ? 'success' : 'warning'}`}>
              {pushPermission === 'granted' ? '✅ সক্রিয়' : '⚠️ নিষ্ক্রিয়'}
            </span>
            {subscription && (
              <span className="subscription-detail">
                📱 {subscription.endpoint.substring(0, 30)}...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Master Controls ── */}
      <div className="noti-master-controls">
        <div className="noti-master-toggle">
          <div className="noti-master-info">
            <span className="noti-master-icon">
              <i className={`fa-solid ${notificationSettings.pushNotifications ? 'fa-bell' : 'fa-bell-slash'}`}></i>
            </span>
            <div className="noti-master-text">
              <h4>সব নোটিফিকেশন</h4>
              <p>সব নোটিফিকেশন একসাথে চালু বা বন্ধ করুন</p>
            </div>
          </div>
          <ToggleSwitch
            checked={notificationSettings.pushNotifications !== false}
            onChange={() => toggleSetting('pushNotifications')}
            disabled={isSubscribing}
          />
        </div>
      </div>

      {/* ── Notification Categories ── */}
      <div className="noti-categories">
        <h3 className="categories-title">
          <i className="fa-solid fa-list"></i>
          নোটিফিকেশন ক্যাটাগরি
        </h3>
        <p className="categories-subtitle">প্রতিটি ক্যাটাগরির নোটিফিকেশন আলাদাভাবে চালু/বন্ধ করুন</p>

        <div className="noti-categories-grid">
          <NotificationCategory
            icon="💬"
            label="মেসেজ"
            settingKey="messageNotifications"
            description="নতুন মেসেজ ও চ্যাট আপডেট"
          />
          <NotificationCategory
            icon="🤝"
            label="ডিল"
            settingKey="dealUpdates"
            description="ডিল তৈরি, কনফার্ম, কমপ্লিট"
          />
          <NotificationCategory
            icon="💰"
            label="ওয়ালেট"
            settingKey="walletNotifications"
            description="ডিপোজিট, উইথড্র, পেমেন্ট"
          />
          <NotificationCategory
            icon="🛡️"
            label="ভেরিফিকেশন"
            settingKey="verificationNotifications"
            description="ভেরিফিকেশন স্ট্যাটাস আপডেট"
          />
          <NotificationCategory
            icon="⭐"
            label="রিভিউ"
            settingKey="reviewNotifications"
            description="নতুন রিভিউ ও রেটিং"
          />
          <NotificationCategory
            icon="📢"
            label="অ্যাডমিন"
            settingKey="adminNotifications"
            description="অ্যাডমিন থেকে গুরুত্বপূর্ণ নোটিফিকেশন"
          />
        </div>
      </div>

      {/* ── Email Settings ── */}
      <div className="noti-email-section">
        <h3 className="section-title">
          <i className="fa-solid fa-envelope"></i>
          ইমেইল সেটিংস
        </h3>
        <div className="noti-email-settings">
          <ToggleSwitch
            checked={notificationSettings.emailNotifications}
            onChange={() => toggleSetting('emailNotifications')}
            label="ইমেইল নোটিফিকেশন"
            description="ইমেইলের মাধ্যমে নোটিফিকেশন পান"
          />
          <ToggleSwitch
            checked={notificationSettings.marketingEmails}
            onChange={() => toggleSetting('marketingEmails')}
            label="মার্কেটিং ইমেইল"
            description="প্রোমোশনাল ও মার্কেটিং ইমেইল পান"
          />
        </div>
      </div>

      {/* ── Reset Button ── */}
      <div className="noti-reset">
        <button className="reset-btn" onClick={handleReset}>
          <i className="fa-solid fa-rotate"></i>
          ডিফল্ট সেটিংস রিসেট করুন
        </button>
        <p className="reset-note">সব নোটিফিকেশন সেটিংস ডিফল্টে ফিরিয়ে আনবে</p>
      </div>
    </div>
  );
};

export default NotificationsTab;