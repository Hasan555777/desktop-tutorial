// src/UI/Notification/NotificationProvider.jsx
// ============================================================
// 🔧 FIXES APPLIED (search "FIX" to jump to each spot):
// 1. Now listens for a `workhub:notification-settings` CustomEvent (in
//    addition to the native `storage` event) so toggling a setting in
//    the SAME tab takes effect immediately. The native `storage` event
//    never fires in the tab that made the change — only in OTHER tabs —
//    so before this fix, muting a category here required a full page
//    refresh to take effect. NotificationsTab.jsx now dispatches this
//    event whenever it saves settings (see that file).
// 2. Loads `workhub_sound_settings` too, and notify() now checks the
//    per-category SOUND toggle before playing a sound. Before this fix,
//    the sound category toggles (চ্যাট/ওয়ালেট/অ্যাডমিন সাউন্ড ইত্যাদি)
//    only affected the Settings page's "টেস্ট" button — they were never
//    consulted when a REAL notification came in.
// 3. Uses the shared `notificationCategory.js` util instead of a
//    locally-duplicated category map, so this file, App.js, and
//    Notifications.jsx can never drift out of sync again.
// 4. createFirestoreNotification() is now idempotent when a stable id
//    (dealId/relatedId/transactionId/milestoneId) is available, using
//    the same setDoc-with-existence-check pattern as notificationHelper.js.
//    Before this fix it always used addDoc with no de-dup at all, so
//    calling notify() twice for the same event created two documents.
// ============================================================

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
import {
  getCategoryForEvent,
  isCategoryEnabled,
  isSoundCategoryEnabled,
} from '@/utils/notificationCategory';

// ============================================================
// 🔔 NOTIFICATION / SOUND SETTINGS HELPERS
// ============================================================

const NOTIFICATION_SETTINGS_KEY = 'workhub_notification_settings';
const SOUND_SETTINGS_KEY = 'workhub_sound_settings';

const getNotificationSettings = () => {
  try {
    const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading notification settings:', e);
  }
  return null;
};

const getSoundSettings = () => {
  try {
    const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading sound settings:', e);
  }
  return null;
};

// ============================================================
// 🔔 Notification Context
// ============================================================
const NotificationContext = createContext(null);

// ============================================================
// 🔔 Notification Provider
// ============================================================
export const NotificationProvider = ({ children }) => {
  const sound = useSound();
  const feedback = useFeedback();
  const { currentUser } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState('default');
  const [isSupported, setIsSupported] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);

  const [settings, setSettings] = useState(null);
  const [soundSettings, setSoundSettings] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const processedIds = useRef(new Set());
  const adminProcessedIds = useRef(new Set());
  const isInitialSnapshot = useRef(true);
  const isAdminInitialSnapshot = useRef(true);
  const soundDebounceRef = useRef(0);
  const unsubscribeRef = useRef(null);
  const adminUnsubscribeRef = useRef(null);
  const isMountedRef = useRef(true);
  const notifyRef = useRef(null);

  // ============================================================
  // ✅ Load Settings (notification + sound) from localStorage,
  // and stay in sync via BOTH the native `storage` event (cross-tab)
  // AND a custom event (same-tab — see FIX #1 above).
  // ============================================================
  useEffect(() => {
    const loadSettings = () => {
      setSettings(getNotificationSettings());
      setSoundSettings(getSoundSettings());
      setSettingsLoaded(true);
    };

    loadSettings();

    const handleStorageChange = (e) => {
      if (e.key === NOTIFICATION_SETTINGS_KEY) {
        setSettings(getNotificationSettings());
      }
      if (e.key === SOUND_SETTINGS_KEY) {
        setSoundSettings(getSoundSettings());
      }
    };

    // 🔧 FIX #1: same-tab settings changes.
    const handleNotificationSettingsEvent = (e) => {
      setSettings(e.detail || getNotificationSettings());
      if (import.meta.env.DEV) {
        console.log('🔔 Notification settings updated (same-tab event):', e.detail);
      }
    };
    const handleSoundSettingsEvent = (e) => {
      setSoundSettings(e.detail || getSoundSettings());
      if (import.meta.env.DEV) {
        console.log('🔊 Sound settings updated (same-tab event):', e.detail);
      }
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
  // ✅ Check initial permission status
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
  // ✅ Request Notification Permission
  // ============================================================


const requestPermission = async () => {
  if (!('Notification' in window)) return false;

  if (Notification.permission === 'granted') {
    setPermissionStatus('granted');
    return true;  // ✅ granted হলে true
  }

  if (Notification.permission === 'denied') {
    setPermissionStatus('denied');
    return false;  // ❌ denied হলে false
  }

  try {
    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);

    // ✅ নিশ্চিত করুন
    const isGranted = permission === 'granted';
    console.log('🔍 Permission result:', permission, 'isGranted:', isGranted);
    
    if (isGranted) {
      sound?.playEvent(SOUND_EVENTS.SUCCESS);
      return true;
    } else {
      sound?.playEvent(SOUND_EVENTS.WARNING);
      return false;
    }
  } catch (error) {
    console.error('🔔 Error requesting notification permission:', error);
    return false;
  }
};

  const hasPermission = useCallback(() => {
    if (!('Notification' in window)) return false;
    return Notification.permission === 'granted';
  }, []);

  const getPermissionStatus = useCallback(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }, []);

  // ============================================================
  // ✅ Show Browser Notification
  // ============================================================
  const showNotification = useCallback(({
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
      const options = {
        body: body || '',
        icon: icon,
        badge: badge,
        silent: silent,
        requireInteraction: requireInteraction,
      };

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
        console.error('🔔 Notification error:', error);
      };

      return notification;
    } catch (error) {
      console.error('🔔 Error showing notification:', error);
      return null;
    }
  }, []);

  // ============================================================
  // ✅ Build a stable persistent id, mirroring notificationHelper.js's
  // approach, so Firestore writes here are idempotent too.
  // 🔧 FIX #4
  // ============================================================
  const buildPersistentId = (userId, event, metadata = {}) => {
    const entityId =
      metadata.idempotencyKey ||
      metadata.transactionId ||
      metadata.transferId ||
      metadata.dealId ||
      metadata.relatedId ||
      metadata.milestoneId;
    if (!entityId) return null;
    return `${userId}_${event || 'system'}_${entityId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
  };

  // ============================================================
  // ✅ Create Firestore Notification (now idempotent when possible)
  // ============================================================
  const createFirestoreNotification = useCallback(async ({
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
    if (!userId) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ No userId provided for Firestore notification');
      }
      return null;
    }

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

      // 🔧 FIX #4: idempotent write when we have a stable id (dealId/
      // relatedId/transactionId/transferId/milestoneId). Falls back to
      // addDoc only when truly no stable id is available.
      const persistentId = buildPersistentId(userId, event, { dealId, milestoneId, ...metadata });

      if (persistentId) {
        const docRef = doc(db, collectionName, persistentId);
        const existing = await getDoc(docRef);
        if (existing.exists()) {
          if (import.meta.env.DEV) {
            console.log('⏭️ Persistent duplicate notification skipped:', persistentId);
          }
          return docRef.id;
        }
        await setDoc(docRef, { ...notificationData, idempotencyKey: persistentId });
        return docRef.id;
      }

      const docRef = await addDoc(collection(db, collectionName), notificationData);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error creating Firestore notification:', error);
      return null;
    }
  }, []);

  // ============================================================
  // ✅ Send to Multiple Users
  // ============================================================
  const sendToMultipleUsers = useCallback(async ({
    userIds,
    event,
    data = {},
    overrides = {},
    isAdmin = false,
  }) => {
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
  }, [createFirestoreNotification]);

  // ============================================================
  // ✅ Unified Notify Function
  // ============================================================
  const notify = useCallback(({
    event,
    data = {},
    overrides = {},
    skipFirestore = false,
    isAdmin = false,
  }) => {
    // STEP 1: category + master toggle check (shared util — FIX #3)
    if (!isCategoryEnabled(event, settings)) {
      if (import.meta.env.DEV) {
        console.log(`🔔 Event "${event}" skipped — category/master disabled by settings.`);
      }
      return;
    }

    const template = NotificationTemplates[event];
    if (!template) {
      if (import.meta.env.DEV) {
        console.warn(`🔔 Unknown notification event: ${event}`);
      }
      return;
    }

    const config = { ...template(data), ...overrides };

    if (import.meta.env.DEV) {
      console.log(`🔔 [${event}] Category: ${getCategoryForEvent(event)}`, config);
    }

    // ============================================================
    // 🔧 FIX #2: STEP — Play Sound, now ALSO gated by the per-category
    // sound toggle (workhub_sound_settings), not just config.soundEnabled.
    // ============================================================
    const now = Date.now();
    const soundAllowed = config.soundEnabled !== false && isSoundCategoryEnabled(event, soundSettings);

    if (soundAllowed && config.soundEvent) {
      if (now - soundDebounceRef.current > 500) {
        sound?.playEvent(config.soundEvent);
        soundDebounceRef.current = now;
      } else if (import.meta.env.DEV) {
        console.log(`🔊 Sound debounced: ${config.soundEvent}`);
      }
    } else if (import.meta.env.DEV && config.soundEvent) {
      console.log(`🔊 Sound skipped (category muted): ${config.soundEvent}`);
    }

    // STEP: Show Browser Notification
    if (config.browser !== false && hasPermission()) {
      showNotification({
        title: config.title,
        body: config.body,
        icon: config.icon || '/logo192.png',
        badge: config.badge || '/logo192.png',
        image: config.image || null,
        tag: config.tag || `notification-${event}-${Date.now()}`,
        data: {
          ...config.data,
          event,
          timestamp: Date.now(),
          dealId: data.dealId,
          postTitle: data.postTitle,
        },
        silent: true,
        requireInteraction: config.requireInteraction || false,
      });
    }

    // STEP: Show In-App Alert
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

    // STEP: Save to Firestore (if not skipped)
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
  }, [sound, feedback, settings, soundSettings, hasPermission, showNotification, createFirestoreNotification, sendToMultipleUsers]);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  // ============================================================
  // ✅ USER NOTIFICATION LISTENER
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

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        if (!isMountedRef.current) return;

        if (settings?.pushNotifications === false) {
          setUnreadCount(0);
          return;
        }

        // 🔧 Standardized "unread" definition: isUnread !== false
        // (treats a missing field as unread, matches document creation
        // above which always sets isUnread:true explicitly).
        const unread = snapshot.docs.filter(doc => {
          const data = doc.data();
          return data.isUnread !== false && isCategoryEnabled(data.event, settings);
        }).length;

        setUnreadCount(unread);

        if (isInitialSnapshot.current) {
          snapshot.docs.forEach(doc => processedIds.current.add(doc.id));
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

          if (!isCategoryEnabled(data.event, settings)) {
            if (import.meta.env.DEV) {
              console.log(`🔔 Notification skipped (category disabled): ${data.event}`);
            }
            return;
          }

          if (data.event && NotificationTemplates[data.event]) {
            notifyRef.current({
              event: data.event,
              data: { ...data, userId: data.userId, userIds: data.userIds },
              skipFirestore: true,
            });
          } else {
            notifyRef.current({
              event: NOTIFICATION_EVENTS.NOTIFICATION,
              data: {
                title: data.title || 'Notification',
                body: data.message || data.body || 'You have a new notification',
                userId: data.userId,
                ...data,
              },
              skipFirestore: true,
            });
          }
        });

        if (processedIds.current.size > 500) {
          const ids = Array.from(processedIds.current);
          processedIds.current = new Set(ids.slice(-500));
        }
      },
      (error) => {
        console.error('❌ User notification listener error:', error);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [currentUser, settings]);

  // ============================================================
  // ✅ ADMIN NOTIFICATION LISTENER
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

    const checkAdminAndListen = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();

        const isAdmin = userData?.role === 'admin' ||
                        userData?.isAdmin === true ||
                        ['hammanmusa362@gmail.com', 'hasanmahmudmd362@gmail.com'].includes(user.email);

        if (!isAdmin) {
          setAdminUnreadCount(0);
          return;
        }

        const q = query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q,
          (snapshot) => {
            if (!isMountedRef.current) return;

            if (settings?.pushNotifications === false || settings?.adminNotifications === false) {
              setAdminUnreadCount(0);
              return;
            }

            const unread = snapshot.docs.filter(doc => {
              const data = doc.data();
              return data.isRead !== true;
            }).length;

            setAdminUnreadCount(unread);

            if (isAdminInitialSnapshot.current) {
              snapshot.docs.forEach(doc => adminProcessedIds.current.add(doc.id));
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
              if (settings?.adminNotifications === false) return;

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
                try {
                  updateDoc(doc(db, 'admin_notifications', docId), {
                    isRead: true,
                    readAt: serverTimestamp(),
                  });
                } catch (error) {
                  console.error('Error marking admin notification as read:', error);
                }
              }
            });

            if (adminProcessedIds.current.size > 500) {
              const ids = Array.from(adminProcessedIds.current);
              adminProcessedIds.current = new Set(ids.slice(-500));
            }
          },
          (error) => {
            console.error('❌ Admin notification listener error:', error);
          }
        );

        adminUnsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error('❌ Error checking admin status:', error);
      }
    };

    checkAdminAndListen();

    return () => {
      if (adminUnsubscribeRef.current) {
        adminUnsubscribeRef.current();
        adminUnsubscribeRef.current = null;
      }
    };
  }, [currentUser, settings]);

  const isNotificationEnabled = useCallback((event) => {
    return isCategoryEnabled(event, settings);
  }, [settings]);

  const getSettings = useCallback(() => settings, [settings]);

  const value = useMemo(() => ({
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
  }), [
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
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used inside NotificationProvider');
  }
  return context;
};

export default NotificationProvider;