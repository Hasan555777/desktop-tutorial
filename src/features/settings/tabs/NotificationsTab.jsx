// ============================================================
// 📁 src/pages/Settings/tabs/NotificationsTab.jsx
// ============================================================
// 🔧 FIX: every place that writes workhub_notification_settings or
// workhub_sound_settings to localStorage now ALSO dispatches a
// matching CustomEvent (`workhub:notification-settings` /
// `workhub:sound-settings`). This is the missing piece:
// `window.addEventListener('storage', ...)` NEVER fires in the same
// tab that made the change — only in other tabs — so without this,
// NotificationProvider (and App.js / Notifications.jsx) had no way to
// find out a setting changed until the page was refreshed. Toggling a
// category "off" would look successful in the UI but the sound/badge
// logic elsewhere kept using the stale settings until reload.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../../shared/ui/Sound/SoundEvents';
import { auth, db } from '../../../shared/firebase/index';
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import styles from './NotificationsTab.module.css';


// ✅ Constants
const NOTIFICATION_SETTINGS_KEY = 'workhub_notification_settings';
const SOUND_SETTINGS_KEY = 'workhub_sound_settings';
// 🔧 FIX (item #8): this was reading VITE_VAPID_PUBLIC_KEY — a name
// that doesn't exist anywhere in .env.example and that nothing else
// in the app writes to. Every other FCM/push code path (App.jsx,
// AuthContext.jsx, notificationHelper.js) reads
// VITE_FIREBASE_VAPID_KEY. With the wrong name, isValidVapidKey()
// below was always false, so this raw-PushManager subscribe flow
// silently could never work, in dev or in production — it just
// happened to go unnoticed because the FCM+NotificationBanner path
// (which uses the correct key) covers the same "let me get browser
// notifications" need for users.
//
// Worth knowing separately: even with the key fixed, this specific
// flow subscribes via the raw Web Push API and saves the
// subscription to a `pushSubscriptions/{userId}` Firestore document
// — nothing in this project currently reads that collection to
// actually deliver a push (that needs a server using the `web-push`
// library with matching VAPID keys, which doesn't exist here yet).
// So this toggle can now correctly detect support and permission,
// but "subscribed" here still won't result in a real push arriving
// until that backend piece is built.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

// ============================================================
// 🔧 NEW: small helpers so every write site dispatches consistently
// ============================================================
const persistNotificationSettings = (settings) => {
  localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('workhub:notification-settings', { detail: settings }));
};

const persistSoundSettings = (settings) => {
  localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('workhub:sound-settings', { detail: settings }));
};

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

  // ── Sound States ──
  const [isTesting, setIsTesting] = useState(false);
  const [testSoundType, setTestSoundType] = useState('notification');
  const volumeRef = useRef(null);
  const [soundSettings, setSoundSettings] = useState({
    enabled: true,
    volume: 0.8,
    muted: false,
    chat: true,
    wallet: true,
    notification: true,
    admin: true,
    offer: true,
    deal: true,
    verification: true,
    review: true,
    system: true,
    click: true,
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
          message: '❌ Service Worker রেডি নয়', 
          description: 'Service Worker সচল হতে বেশি সময় নিচ্ছে। পেজ রিফ্রেশ করুন।' 
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
      
      const currentUser = auth.currentUser;
      const userIdToUse = currentUser?.uid || userId;
      await savePushSubscription(userIdToUse, newSubscription);
      
      // ✅ Update settings — 🔧 FIX: use the helper so the same-tab
      // event fires (was a raw localStorage.setItem before).
      const newSettings = {
        ...notificationSettings,
        pushNotifications: true
      };
      setNotificationSettings(newSettings);
      persistNotificationSettings(newSettings);
      
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
      
      const currentUser = auth.currentUser;
      const userIdToUse = currentUser?.uid || userId;
      await removePushSubscription(userIdToUse);
      
      // 🔧 FIX: use helper so the same-tab event fires
      const newSettings = {
        ...notificationSettings,
        pushNotifications: false
      };
      setNotificationSettings(newSettings);
      persistNotificationSettings(newSettings);
      
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
  // ✅ Save Settings — 🔧 FIX: uses persistNotificationSettings() so
  // the same-tab CustomEvent always fires alongside localStorage.
  // ============================================================

  const saveSettings = useCallback((newSettings) => {
    persistNotificationSettings(newSettings);
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
  // ✅ Sound Helper Functions — 🔧 FIX: uses persistSoundSettings()
  // ============================================================

  const saveSoundSettings = useCallback((newSettings) => {
    persistSoundSettings(newSettings);
    setSoundSettings(newSettings);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSoundSettings(prev => ({ ...prev, ...parsed }));
        if (sound?.setMuted) sound.setMuted(parsed.muted || false);
        if (sound?.setVolume) sound.setVolume(parsed.volume || 0.8);
      } catch (e) {
        console.error('Error loading sound settings from localStorage:', e);
      }
    }
  }, [sound]);

  const handleSoundUpdate = useCallback((key, value) => {
    setSoundSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      saveSoundSettings(newSettings);
      
      if (key === 'enabled') {
        if (sound?.setMuted) sound.setMuted(!value);
      }
      if (key === 'muted') {
        if (sound?.setMuted) sound.setMuted(value);
      }
      if (key === 'volume') {
        if (sound?.setVolume) sound.setVolume(value);
      }

      if (key === 'enabled' && value === true) {
        setTimeout(() => {
          sound?.playEvent(SOUND_EVENTS.SUCCESS);
        }, 300);
      }
      return newSettings;
    });
  }, [sound, saveSoundSettings]);

  const handleVolumeUpdate = useCallback((value) => {
    setSoundSettings(prev => {
      const newSettings = { ...prev, volume: value };
      saveSoundSettings(newSettings);
      if (sound?.setVolume) sound.setVolume(value);
      return newSettings;
    });
  }, [sound, saveSoundSettings]);

  const handleResetSound = useCallback(async () => {
    const confirmed = await feedback.confirm({
      title: 'Reset Sound Settings',
      message: 'Are you sure you want to reset all sound settings to default?',
      variant: 'confirm',
      confirmText: 'Yes, Reset',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    const defaultSettings = {
      enabled: true,
      volume: 0.8,
      muted: false,
      chat: true,
      wallet: true,
      notification: true,
      admin: true,
      offer: true,
      deal: true,
      verification: true,
      review: true,
      system: true,
      click: true,
    };

    saveSoundSettings(defaultSettings);

    if (sound?.setMuted) sound.setMuted(false);
    if (sound?.setVolume) sound.setVolume(0.8);
    
    setTimeout(() => {
      sound?.playEvent(SOUND_EVENTS.SUCCESS);
    }, 300);

    feedback.showSuccess('✅ সাউন্ড রিসেট', 'সব সাউন্ড সেটিংস ডিফল্টে রিসেট করা হয়েছে!');
  }, [feedback, sound, saveSoundSettings]);

  const handleTestSound = useCallback((type = 'notification') => {
    if (isTesting) return;
    
    if (soundSettings.muted || !soundSettings.enabled) {
      feedback.showWarning('⚠️ সাউন্ড বন্ধ', 'সাউন্ড টেস্ট করতে প্রথমে সাউন্ড চালু করুন।');
      return;
    }

    setIsTesting(true);
    setTestSoundType(type);
    
    try {
      const soundMap = {
        notification: SOUND_EVENTS.NOTIFICATION,
        success: SOUND_EVENTS.SUCCESS,
        warning: SOUND_EVENTS.WARNING,
        error: SOUND_EVENTS.ERROR,
        chat: SOUND_EVENTS.CHAT_MESSAGE,
        wallet: SOUND_EVENTS.WALLET,
        admin: SOUND_EVENTS.ADMIN_NOTIFICATION,
        offer: SOUND_EVENTS.OFFER,
        deal: SOUND_EVENTS.DEAL,
        click: SOUND_EVENTS.CLICK,
      };

      const event = soundMap[type] || SOUND_EVENTS.NOTIFICATION;
      
      const categoryMap = {
        notification: 'notification',
        success: 'notification',
        warning: 'notification',
        error: 'notification',
        chat: 'chat',
        wallet: 'wallet',
        admin: 'admin',
        offer: 'offer',
        deal: 'deal',
        click: 'click',
      };
      
      const category = categoryMap[type] || 'notification';
      
      if (!soundSettings[category]) {
        feedback.showWarning('⚠️ সাউন্ড বন্ধ', `"${category}" ক্যাটাগরির সাউন্ড বন্ধ আছে।`);
        setIsTesting(false);
        return;
      }

      if (soundSettings.volume === 0) {
        feedback.showWarning('⚠️ ভলিউম শূন্য', 'ভলিউম বাড়িয়ে আবার চেষ্টা করুন।');
        setIsTesting(false);
        return;
      }

      if (sound?.playEvent) {
        sound.setVolume(soundSettings.volume);
        sound.playEvent(event);
        feedback.showSuccess('🔊 টেস্ট সাউন্ড', `${type} সাউন্ড বাজানো হচ্ছে...`);
      } else {
        feedback.showError('❌ সাউন্ড এরর', 'সাউন্ড সিস্টেম কাজ করছে না।');
      }
      
    } catch (error) {
      console.error('Test sound error:', error);
      feedback.showError('❌ টেস্ট ব্যর্থ', 'সাউন্ড টেস্ট করতে সমস্যা হয়েছে।');
    } finally {
      setTimeout(() => {
        setIsTesting(false);
      }, 1000);
    }
  }, [isTesting, soundSettings, sound, feedback]);

  // ============================================================
  // ✅ Components
  // ============================================================

 const ToggleSwitch = useCallback(({ checked, onChange, label, description, disabled = false }) => (
    <div className={styles.notiToggleItem}>
      <div className={styles.notiToggleInfo}>
        <span className={styles.notiToggleLabel}>{label}</span>
        {description && <span className={styles.notiToggleDescription}>{description}</span>}
      </div>
      <button
        className={`${styles.notiToggleSwitch} ${checked ? styles.active : ''}`}
        onClick={onChange}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
      >
        <span className={styles.notiToggleSlider}></span>
        <span className={styles.notiToggleStatus}>{checked ? 'চালু' : 'বন্ধ'}</span>
      </button>
    </div>
  ), []);

  const NotificationCategory = useCallback(({ icon, label, settingKey, description }) => {
    const isChecked = notificationSettings?.[settingKey] !== false;
    
    return (
      <div className={styles.notiCategory}>
        <div className={styles.notiCategoryIcon}>{icon}</div>
        <div className={styles.notiCategoryInfo}>
          <span className={styles.notiCategoryName}>{label}</span>
          <span className={styles.notiCategoryDesc}>{description}</span>
        </div>
        <ToggleSwitch
          checked={isChecked}
          onChange={() => toggleSetting(settingKey)}
        />
      </div>
    );
  }, [notificationSettings, toggleSetting, ToggleSwitch]);

  const SoundCategory = useCallback(({ icon, label, categoryKey, description }) => {
    const isChecked = soundSettings?.[categoryKey] !== false;
    
    return (
      <div className={styles.notiCategory}>
        <div className={styles.notiCategoryIcon}>{icon}</div>
        <div className={styles.notiCategoryInfo}>
          <span className={styles.notiCategoryName}>{label}</span>
          <span className={styles.notiCategoryDesc}>{description}</span>
        </div>
        <ToggleSwitch
          checked={isChecked}
          onChange={() => handleSoundUpdate(categoryKey, !isChecked)}
        />
      </div>
    );
  }, [soundSettings, handleSoundUpdate, ToggleSwitch]);

  // ============================================================
  // ✅ Render
  // ============================================================

  if (isLoading) {
    return (
      <div className={styles.notiTabLoading}>
        <div className={styles.loadingSpinner}></div>
        <p>নোটিফিকেশন সেটিংস লোড হচ্ছে...</p>
      </div>
    );
  }

  return (
    <div className={styles.notiTab}>
      <div className={styles.notiTabHeader}>
        <h2>
          <i className="fa-solid fa-bell"></i>
          নোটিফিকেশন
        </h2>
        <p className={styles.headerSubtitle}>
          আপনার পছন্দ অনুযায়ী নোটিফিকেশন সেটিংস কাস্টমাইজ করুন
        </p>
      </div>

      <div className={styles.notiPushSection}>
        <div className={styles.pushCard}>
          <div className={styles.pushCardHeader}>
            <div className={styles.pushIcon}>
              <i className={`fa-solid ${pushPermission === 'granted' ? 'fa-check-circle' : 'fa-bell'}`}></i>
            </div>
            <div className={styles.pushInfo}>
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
            <div className={styles.pushActions}>
              {pushPermission === 'granted' ? (
                isSubscribed ? (
                  <button 
                    className={`${styles.pushBtn} ${styles.danger}`} 
                    onClick={unsubscribeFromPush}
                    disabled={isSubscribing}
                  >
                    <i className="fa-solid fa-bell-slash"></i> বন্ধ করুন
                  </button>
                ) : (
                  <button 
                    className={`${styles.pushBtn} ${styles.primary}`} 
                    onClick={subscribeToPush}
                    disabled={isSubscribing}
                  >
                    <i className="fa-solid fa-bell"></i> চালু করুন
                  </button>
                )
              ) : pushPermission === 'denied' ? (
                <button className={`${styles.pushBtn} ${styles.warning}`} disabled>
                  <i className="fa-solid fa-exclamation-triangle"></i> ব্রাউজার সেটিংস চেক করুন
                </button>
              ) : (
                <button 
                  className={`${styles.pushBtn} ${styles.primary}`} 
                  onClick={subscribeToPush}
                  disabled={isSubscribing}
                >
                  <i className="fa-solid fa-bell"></i> চালু করুন
                </button>
              )}
            </div>
          </div>
          <div className={styles.pushStatus}>
            <span className={styles.statusLabel}>স্ট্যাটাস:</span>
            <span className={`${styles.statusBadge} ${pushPermission === 'granted' ? styles.success : styles.warning}`}>
              {pushPermission === 'granted' ? '✅ সক্রিয়' : '⚠️ নিষ্ক্রিয়'}
            </span>
            {subscription && (
              <span className={styles.subscriptionDetail}>
                📱 {subscription.endpoint.substring(0, 30)}...
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.notiMasterControls}>
        <div className={styles.notiMasterToggle}>
          <div className={styles.notiMasterInfo}>
            <span className={styles.notiMasterIcon}>
              <i className={`fa-solid ${notificationSettings.pushNotifications ? 'fa-bell' : 'fa-bell-slash'}`}></i>
            </span>
            <div className={styles.notiMasterText}>
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

      <div className={styles.notiCategories}>
        <h3 className={styles.categoriesTitle}>
          <i className="fa-solid fa-list"></i>
          নোটিফিকেশন ক্যাটাগরি
        </h3>
        <p className={styles.categoriesSubtitle}>প্রতিটি ক্যাটাগরির নোটিফিকেশন আলাদাভাবে চালু/বন্ধ করুন</p>

        <div className={styles.notiCategoriesGrid}>
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

      <div className={styles.notiEmailSection}>
        <h3 className={styles.sectionTitle}>
          <i className="fa-solid fa-envelope"></i>
          ইমেইল সেটিংস
        </h3>
        <div className={styles.notiEmailSettings}>
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

      <div className={`${styles.notiEmailSection} ${styles.soundSection}`}>
        <h3 className={styles.sectionTitle}>
          <i className="fa-solid fa-volume-high"></i>
          নোটিফিকেশন সাউন্ড (Sound Settings)
        </h3>

        <div className={styles.soundMasterControls}>
          <div className={styles.masterToggle}>
            <div className={styles.masterInfo}>
              <span className={styles.masterIcon}>
                <i className={`fa-solid ${soundSettings.enabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
              </span>
              <div className={styles.masterText}>
                <h4>সাউন্ড চালু/বন্ধ</h4>
                <p>সব সাউন্ড একসাথে চালু বা বন্ধ করুন</p>
              </div>
            </div>
            <ToggleSwitch
              checked={soundSettings.enabled !== false}
              onChange={() => handleSoundUpdate('enabled', !soundSettings.enabled)}
            />
          </div>

          <div className={styles.masterMute}>
            <div className={styles.masterInfo}>
              <span className={styles.masterIcon}>
                <i className={`fa-solid ${soundSettings.muted ? 'fa-volume-xmark' : 'fa-volume-low'}`}></i>
              </span>
              <div className={styles.masterText}>
                <h4>মিউট</h4>
                <p>সব সাউন্ড মিউট করুন</p>
              </div>
            </div>
            <ToggleSwitch
              checked={soundSettings.muted === true}
              onChange={() => handleSoundUpdate('muted', !soundSettings.muted)}
            />
          </div>
        </div>

        <div className={styles.volumeControl}>
          <div className={styles.volumeHeader}>
            <span className={styles.volumeLabel}>
              <i className="fa-solid fa-sliders"></i>
              ভলিউম
            </span>
            <span className={styles.volumeValue}>{Math.round(soundSettings.volume * 100)}%</span>
          </div>
          <input
            ref={volumeRef}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={soundSettings.volume}
            onChange={(e) => handleVolumeUpdate(parseFloat(e.target.value))}
            className={styles.volumeSliderMain}
            disabled={soundSettings.muted || !soundSettings.enabled}
            style={{
              background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${soundSettings.volume * 100}%, var(--bg-tertiary) ${soundSettings.volume * 100}%, var(--bg-tertiary) 100%)`
            }}
          />
          <div className={styles.volumeMarks}>
            <span>০%</span>
            <span>৫০%</span>
            <span>১০০%</span>
          </div>
        </div>

        <div className={`${styles.notiCategories} ${styles.soundCategories}`}>
          <h4 className={styles.categoriesTitle}>
            <i className="fa-solid fa-list"></i>
            সাউন্ড ক্যাটাগরি
          </h4>
          <div className={styles.notiCategoriesGrid}>
            <SoundCategory
              icon="💬"
              label="চ্যাট সাউন্ড"
              categoryKey="chat"
              description="নতুন চ্যাট মেসেজ এবং ইমেজ আপলোড"
            />
            <SoundCategory
              icon="🤝"
              label="ডিল সাউন্ড"
              categoryKey="deal"
              description="ডিল একসেপ্ট ও স্টেট পরিবর্তন"
            />
            <SoundCategory
              icon="💰"
              label="ওয়ালেট সাউন্ড"
              categoryKey="wallet"
              description="ডিপোজিট ও উইথড্র ট্রানজেকশন"
            />
            <SoundCategory
              icon="🔔"
              label="নোটিফিকেশন সাউন্ড"
              categoryKey="notification"
              description="সাধারণ অ্যাপ নোটিফিকেশন"
            />
            <SoundCategory
              icon="📢"
              label="অ্যাডমিন সাউন্ড"
              categoryKey="admin"
              description="অ্যাডমিন ঘোষণা ও বিশেষ সিগন্যাল"
            />
            <SoundCategory
              icon="📄"
              label="অফার সাউন্ড"
              categoryKey="offer"
              description="নতুন অফার ও প্রপোজাল"
            />
            <SoundCategory
              icon="✅"
              label="ভেরিফিকেশন সাউন্ড"
              categoryKey="verification"
              description="ডকুমেন্ট ও ফেস ভেরিফিকেশন আপডেট"
            />
            <SoundCategory
              icon="⭐"
              label="রিভিউ সাউন্ড"
              categoryKey="review"
              description="নতুন রেটিং ও ফিডব্যাক রিভিউ"
            />
            <SoundCategory
              icon="⚙️"
              label="সিস্টেম সাউন্ড"
              categoryKey="system"
              description="সিস্টেম অ্যালার্ট ও টেকনিক্যাল এরর"
            />
            <SoundCategory
              icon="🖱️"
              label="ক্লিক সাউন্ড"
              categoryKey="click"
              description="ইন্টারেক্টিভ বাটন ও মেনু ক্লিক"
            />
          </div>
        </div>

        <div className={styles.soundTestButtons}>
          <button className={`${styles.pushBtn} ${styles.primary}`} onClick={() => handleTestSound('chat')} disabled={isTesting}>
            💬 চ্যাট টেস্ট
          </button>
          <button className={`${styles.pushBtn} ${styles.primary}`} onClick={() => handleTestSound('wallet')} disabled={isTesting}>
            💰 ওয়ালেট টেস্ট
          </button>
          <button className={`${styles.pushBtn} ${styles.primary}`} onClick={() => handleTestSound('notification')} disabled={isTesting}>
            🔔 নোটি টেস্ট
          </button>
          <button className={`${styles.pushBtn} ${styles.danger}`} onClick={handleResetSound}>
            🔄 রিসেট
          </button>
        </div>
      </div>

      <div className={styles.notiReset}>
        <button className={styles.resetBtn} onClick={handleReset}>
          <i className="fa-solid fa-rotate"></i>
          ডিফল্ট নোটিফিকেশন রিসেট করুন
        </button>
        <p className={styles.resetNote}>সব নোটিফিকেশন সেটিংস ডিফল্টে ফিরিয়ে আনবে</p>
      </div>
    </div>
  );
};

export default NotificationsTab;