// src/UI/Notification/NotificationProvider.jsx

import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useAuth } from '@/context/AuthContext';
import { NOTIFICATION_EVENTS } from './NotificationEvents';
import { NotificationTemplates } from './NotificationTemplates';
import { db } from '@/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { getCategoryForEvent, isCategoryEnabled, isSoundCategoryEnabled } from '@/utils/notificationCategory';
import { isAdminUser } from '@/constants/admin';
import { logError, logInfo } from '@/utils/logger';

// ============================================================
// Notification / Sound Settings Helpers
// ============================================================

const NOTIFICATION_SETTINGS_KEY = 'workhub_notification_settings';
const SOUND_SETTINGS_KEY = 'workhub_sound_settings';

const getNotificationSettings = () => {
  try {
    const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    logError('Error loading notification settings', e);
  }
  return null;
};

const getSoundSettings = () => {
  try {
    const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    logError('Error loading sound settings', e);
  }
  return null;
};

// ============================================================
// Notification Context
// ============================================================
const NotificationContext = createContext(null);

// ============================================================
// Notification Provider
// ============================================================
export const NotificationProvider = ({ children }) => {
  const sound = useSound();
  const feedback = useFeedback();
  const { currentUser, userRole } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState('default');
  const [isSupported, setIsSupported] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);

  const [settings, setSettings] = useState(null);
  const [soundSettings, setSoundSettings] = useState(null);

  const processedIds = useRef(new Set());
  const adminProcessedIds = useRef(new Set());
  const isInitialSnapshot = useRef(true);
  const isAdminInitialSnapshot = useRef(true);
  const soundDebounceRef = useRef(0);
  const unsubscribeRef = useRef(null);
  const adminUnsubscribeRef = useRef(null);
  const isMountedRef = useRef(true);
  const notifyRef = useRef(null);

  // Live snapshot of settings, read inside the Firestore listener callbacks
  // below so those effects only need to depend on `currentUser` — settings
  // changing shouldn't tear down and re-subscribe the whole listener (which
  // used to also wipe the dedup tracking and re-fetch admin status).
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // ============================================================
  // Load Settings (notification + sound) from localStorage, and stay in
  // sync via both the native `storage` event (cross-tab) and a custom
  // event (same-tab — the native storage event never fires in the tab
  // that made the change).
  // ============================================================
  useEffect(() => {
    const loadSettings = () => {
      setSettings(getNotificationSettings());
      setSoundSettings(getSoundSettings());
    };

    loadSettings();

    const handleStorageChange = (e) => {
      if (e.key === NOTIFICATION_SETTINGS_KEY) setSettings(getNotificationSettings());
      if (e.key === SOUND_SETTINGS_KEY) setSoundSettings(getSoundSettings());
    };

    const handleNotificationSettingsEvent = (e) => {
      setSettings(e.detail || getNotificationSettings());
    };
    const handleSoundSettingsEvent = (e) => {
      setSoundSettings(e.detail || getSoundSettings());
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('workhub:notification-settings', handleNotificationSettingsEvent);
    window.addEventListener('workhub:sound-settings', handleSoundSettingsEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('workhub:notification-settings', handleNotificationSettingsEvent);
      window.removeEventListener('workhub:sound-settings', handleSoundSettingsEvent);
    };
  }, []);

  // ============================================================
  // Check initial permission status
  // ============================================================
  useEffect(() => {
    if (!('Notification' in window)) {
      setIsSupported(false);
      setPermissionStatus('unsupported');
      return;
    }
    setPermissionStatus(Notification.permission);
  }, []);

  // ============================================================
  // Request Notification Permission
  //
  // Wrapped in useCallback: this is included in the memoized `value` below,
  // so leaving it as a plain function meant a new reference every render —
  // which defeated the useMemo entirely and re-rendered every consumer of
  // useNotification() on every provider render.
  // ============================================================
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;

    if (Notification.permission === 'granted') {
      setPermissionStatus('granted');
      return true;
    }

    if (Notification.permission === 'denied') {
      setPermissionStatus('denied');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);

      const isGranted = permission === 'granted';
      if (isGranted) {
        sound?.playEvent(SOUND_EVENTS.SUCCESS);
        return true;
      }
      sound?.playEvent(SOUND_EVENTS.WARNING);
      return false;
    } catch (error) {
      logError('Error requesting notification permission', error);
      return false;
    }
  }, [sound]);

  const hasPermission = useCallback(() => {
    if (!('Notification' in window)) return false;
    return Notification.permission === 'granted';
  }, []);

  const getPermissionStatus = useCallback(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }, []);

  // ============================================================
  // Show Browser Notification
  // ============================================================
  const showNotification = useCallback(
    ({
      title,
      body,
      icon = '/logo192.png',
      badge = '/logo192.png',
      image = null,
      tag = null,
      data = null,
      silent = false,
      requireInteraction = false,
      vibrate = null,
      actions = [],
    }) => {
      if (!('Notification' in window)) return null;
      if (Notification.permission !== 'granted') return null;

      try {
        const options = { body: body || '', icon, badge, silent, requireInteraction };

        if (image) options.image = image;
        if (tag) options.tag = tag;
        if (vibrate) options.vibrate = vibrate;
        if (actions && actions.length > 0) options.actions = actions;

        const notification = new Notification(title || 'WorkTrustbd', options);
        const clickUrl = data?.url || data?.path || null;

        notification.onclick = () => {
          window.focus();
          if (clickUrl) {
            if (clickUrl.startsWith('http://') || clickUrl.startsWith('https://')) {
              window.location.href = clickUrl;
            } else {
              window.location.pathname = clickUrl;
            }
          }
          notification.close();
        };

        notification.onerror = (error) => {
          logError('Notification error', error);
        };

        return notification;
      } catch (error) {
        logError('Error showing notification', error);
        return null;
      }
    },
    []
  );

  // ============================================================
  // Build a stable persistent id so Firestore writes here are idempotent.
  // ============================================================
  const buildPersistentId = (userId, event, metadata = {}) => {
    const entityId =
      metadata.idempotencyKey || metadata.transactionId || metadata.transferId || metadata.dealId || metadata.relatedId || metadata.milestoneId;
    if (!entityId) return null;
    return `${userId}_${event || 'system'}_${entityId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
  };

  // ============================================================
  // Create Firestore Notification (idempotent when a stable id is available)
  // ============================================================
  const createFirestoreNotification = useCallback(
    async ({
      userId,
      event,
      title,
      message,
      dealId = null,
      postTitle = null,
      milestoneId = null,
      soundEvent = null,
      metadata = {},
      actionRequired = false,
      actionType = null,
      isAdmin = false,
    }) => {
      if (!userId) return null;

      try {
        const collectionName = isAdmin ? 'admin_notifications' : 'notifications';

        const notificationData = {
          userId,
          event,
          title: title || 'Notification',
          message: message || '',
          dealId,
          postTitle,
          milestoneId,
          soundEvent: soundEvent || SOUND_EVENTS.NOTIFICATION,
          metadata,
          actionRequired,
          actionType,
          isUnread: true,
          isRead: false,
          createdAt: serverTimestamp(),
        };

        const persistentId = buildPersistentId(userId, event, { dealId, milestoneId, ...metadata });

        if (persistentId) {
          const docRef = doc(db, collectionName, persistentId);
          const existing = await getDoc(docRef);
          if (existing.exists()) {
            return docRef.id;
          }
          await setDoc(docRef, { ...notificationData, idempotencyKey: persistentId });
          return docRef.id;
        }

        const docRef = await addDoc(collection(db, collectionName), notificationData);
        return docRef.id;
      } catch (error) {
        logError('Error creating Firestore notification', error);
        return null;
      }
    },
    []
  );

  // ============================================================
  // Send to Multiple Users
  // ============================================================
  const sendToMultipleUsers = useCallback(
    async ({ userIds, event, data = {}, overrides = {}, isAdmin = false }) => {
      if (!userIds || userIds.length === 0) return [];

      const template = NotificationTemplates[event];
      if (!template) return [];

      const config = { ...template(data), ...overrides };

      const results = [];
      for (const userId of userIds) {
        const result = await createFirestoreNotification({
          userId,
          event,
          title: config.title,
          message: config.body,
          dealId: data.dealId,
          postTitle: data.postTitle,
          soundEvent: config.soundEvent,
          metadata: data,
          actionRequired: config.actionRequired || false,
          actionType: config.actionType || null,
          isAdmin,
        });
        if (result) results.push(result);
      }
      return results;
    },
    [createFirestoreNotification]
  );

  // ============================================================
  // Unified Notify Function
  // ============================================================
  const notify = useCallback(
    ({ event, data = {}, overrides = {}, skipFirestore = false, isAdmin = false }) => {
      if (!isCategoryEnabled(event, settings)) return;

      const template = NotificationTemplates[event];
      if (!template) return;

      const config = { ...template(data), ...overrides };

      const now = Date.now();
      const soundAllowed = config.soundEnabled !== false && isSoundCategoryEnabled(event, soundSettings);

      if (soundAllowed && config.soundEvent) {
        if (now - soundDebounceRef.current > 500) {
          sound?.playEvent(config.soundEvent);
          soundDebounceRef.current = now;
        }
      }

      if (config.browser !== false && hasPermission()) {
        showNotification({
          title: config.title,
          body: config.body,
          icon: config.icon || '/logo192.png',
          badge: config.badge || '/logo192.png',
          image: config.image || null,
          tag: config.tag || `notification-${event}-${Date.now()}`,
          data: { ...config.data, event, timestamp: Date.now(), dealId: data.dealId, postTitle: data.postTitle },
          silent: true,
          requireInteraction: config.requireInteraction || false,
        });
      }

      if (config.inApp && config.alertType) {
        const alertMessages = {
          success: () => feedback.showSuccess(config.title || '✅ সফল', config.body),
          error: () => feedback.showError(config.title || '❌ ত্রুটি', config.body),
          warning: () => feedback.showWarning(config.title || '⚠️ সতর্কতা', config.body),
          info: () => feedback.showInfo(config.title || 'ℹ️ তথ্য', config.body),
        };
        const alertMethod = alertMessages[config.alertType];
        if (alertMethod) alertMethod();
      }

      if (!skipFirestore) {
        if (data.userId) {
          createFirestoreNotification({
            userId: data.userId,
            event,
            title: config.title,
            message: config.body,
            dealId: data.dealId,
            postTitle: data.postTitle,
            soundEvent: config.soundEvent,
            metadata: data,
            actionRequired: config.actionRequired || false,
            actionType: config.actionType || null,
            isAdmin,
          });
        }

        if (data.userIds && data.userIds.length > 0) {
          sendToMultipleUsers({ userIds: data.userIds, event, data, overrides, isAdmin });
        }
      }
    },
    [sound, feedback, settings, soundSettings, hasPermission, showNotification, createFirestoreNotification, sendToMultipleUsers]
  );

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  // ============================================================
  // USER NOTIFICATION LISTENER
  //
  // Depends only on `currentUser` now — settings are read live via
  // settingsRef inside the callback so a settings change no longer tears
  // down and rebuilds this Firestore subscription.
  // ============================================================
  useEffect(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    processedIds.current = new Set();
    isInitialSnapshot.current = true;

    const user = currentUser;
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isMountedRef.current) return;

        const currentSettings = settingsRef.current;

        if (currentSettings?.pushNotifications === false) {
          setUnreadCount(0);
          return;
        }

        const unread = snapshot.docs.filter((d) => {
          const data = d.data();
          return data.isUnread !== false && isCategoryEnabled(data.event, currentSettings);
        }).length;

        setUnreadCount(unread);

        if (isInitialSnapshot.current) {
          snapshot.docs.forEach((d) => processedIds.current.add(d.id));
          isInitialSnapshot.current = false;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;

          const docId = change.doc.id;
          if (processedIds.current.has(docId)) return;
          processedIds.current.add(docId);

          const data = change.doc.data();
          if (data.isUnread === false) return;
          if (!isCategoryEnabled(data.event, currentSettings)) return;

          if (data.event && NotificationTemplates[data.event]) {
            notifyRef.current({ event: data.event, data: { ...data, userId: data.userId, userIds: data.userIds }, skipFirestore: true });
          } else {
            notifyRef.current({
              event: NOTIFICATION_EVENTS.NOTIFICATION,
              data: { title: data.title || 'Notification', body: data.message || data.body || 'You have a new notification', userId: data.userId, ...data },
              skipFirestore: true,
            });
          }
        });

        if (processedIds.current.size > 500) {
          const ids = Array.from(processedIds.current);
          processedIds.current = new Set(ids.slice(-500));
        }
      },
      (error) => logError('User notification listener error', error)
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [currentUser]);

  // ============================================================
  // ADMIN NOTIFICATION LISTENER
  //
  // Uses `userRole` from useAuth() (already loaded/kept in sync by
  // AuthContext) instead of an extra getDoc() round trip on every mount of
  // this effect. Also depends only on `currentUser`/`userRole` — not
  // `settings` — for the same re-subscription reason as the user listener.
  // ============================================================
  useEffect(() => {
    if (adminUnsubscribeRef.current) {
      adminUnsubscribeRef.current();
      adminUnsubscribeRef.current = null;
    }

    adminProcessedIds.current = new Set();
    isAdminInitialSnapshot.current = true;

    const user = currentUser;
    if (!user) {
      setAdminUnreadCount(0);
      return;
    }

    if (!isAdminUser(user, userRole)) {
      setAdminUnreadCount(0);
      return;
    }

    const q = query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isMountedRef.current) return;

        const currentSettings = settingsRef.current;

        if (currentSettings?.pushNotifications === false || currentSettings?.adminNotifications === false) {
          setAdminUnreadCount(0);
          return;
        }

        const unread = snapshot.docs.filter((d) => d.data().isRead !== true).length;
        setAdminUnreadCount(unread);

        if (isAdminInitialSnapshot.current) {
          snapshot.docs.forEach((d) => adminProcessedIds.current.add(d.id));
          isAdminInitialSnapshot.current = false;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;

          const docId = change.doc.id;
          if (adminProcessedIds.current.has(docId)) return;
          adminProcessedIds.current.add(docId);

          const data = change.doc.data();
          if (data.isRead === true) return;
          if (currentSettings?.adminNotifications === false) return;

          if (data.event && NotificationTemplates[data.event]) {
            notifyRef.current({
              event: data.event,
              data: { ...data, userId: data.userId || user.uid, userIds: data.userIds },
              skipFirestore: true,
              isAdmin: true,
            });
          } else {
            notifyRef.current({
              event: NOTIFICATION_EVENTS.ADMIN_NOTIFICATION,
              data: {
                title: data.title || '🔔 অ্যাডমিন নোটিফিকেশন',
                body: data.message || data.body || 'আপনার একটি নতুন অ্যাডমিন নোটিফিকেশন আছে',
                userId: data.userId || user.uid,
                ...data,
              },
              skipFirestore: true,
              isAdmin: true,
            });
          }

          if (data.id) {
            updateDoc(doc(db, 'admin_notifications', docId), { isRead: true, readAt: serverTimestamp() }).catch((error) => {
              logError('Error marking admin notification as read', error);
            });
          }
        });

        if (adminProcessedIds.current.size > 500) {
          const ids = Array.from(adminProcessedIds.current);
          adminProcessedIds.current = new Set(ids.slice(-500));
        }
      },
      (error) => logError('Admin notification listener error', error)
    );

    adminUnsubscribeRef.current = unsubscribe;

    return () => {
      if (adminUnsubscribeRef.current) {
        adminUnsubscribeRef.current();
        adminUnsubscribeRef.current = null;
      }
    };
  }, [currentUser, userRole]);

  const isNotificationEnabled = useCallback((event) => isCategoryEnabled(event, settings), [settings]);
  const getSettings = useCallback(() => settings, [settings]);

  const value = useMemo(
    () => ({
      requestPermission,
      hasPermission,
      getPermissionStatus,
      permissionStatus,
      isSupported,
      showNotification,
      notify,
      unreadCount,
      adminUnreadCount,
      createFirestoreNotification,
      sendToMultipleUsers,
      settings,
      soundSettings,
      isNotificationEnabled,
      getSettings,
      isCategoryEnabled: (event) => isCategoryEnabled(event, settings),
    }),
    [
      permissionStatus,
      isSupported,
      unreadCount,
      adminUnreadCount,
      settings,
      soundSettings,
      requestPermission,
      hasPermission,
      getPermissionStatus,
      showNotification,
      notify,
      createFirestoreNotification,
      sendToMultipleUsers,
      isNotificationEnabled,
      getSettings,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used inside NotificationProvider');
  }
  return context;
};

export default NotificationProvider;