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
  getDocs,
} from 'firebase/firestore';

// ============================================================
// 🔔 NOTIFICATION SETTINGS HELPERS
// ============================================================

const NOTIFICATION_SETTINGS_KEY = 'workhub_notification_settings';

/**
 * Get notification settings from localStorage
 */
const getNotificationSettings = () => {
  try {
    const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading notification settings:', e);
  }
  return null;
};

/**
 * Check if a specific category is enabled
 */
const isCategoryEnabled = (category, settings) => {
  if (!settings) return true; // Default: enabled
  
  // Category to settings key mapping
  const categoryMap = {
    'message': 'messageNotifications',
    'deal': 'dealUpdates',
    'wallet': 'walletNotifications',
    'admin': 'adminNotifications',
    'review': 'reviewNotifications',
    'verification': 'verificationNotifications',
    'system': 'systemNotifications',
  };
  
  const key = categoryMap[category] || 'systemNotifications';
  
  // Check if push notifications are globally disabled
  if (settings.pushNotifications === false) return false;
  
  // Check category-specific setting (default: true)
  return settings[key] !== false;
};

/**
 * Get category from notification event
 */
const getEventCategory = (event) => {
  const template = NotificationTemplates[event];
  if (!template) return 'system';
  
  // Call template with empty data to get category
  const result = template({});
  return result.category || 'system';
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
  
  // ✅ NEW: Settings state
  const [settings, setSettings] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ✅ Refs
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
  // ✅ NEW: Load Settings from localStorage
  // ============================================================
  useEffect(() => {
    const loadSettings = () => {
      const savedSettings = getNotificationSettings();
      setSettings(savedSettings);
      setSettingsLoaded(true);
      
      if (import.meta.env.DEV) {
        console.log('🔔 Notification settings loaded:', savedSettings);
      }
    };
    
    loadSettings();
    
    // ✅ Listen for settings changes from other tabs
    const handleStorageChange = (e) => {
      if (e.key === NOTIFICATION_SETTINGS_KEY) {
        const newSettings = getNotificationSettings();
        setSettings(newSettings);
        
        if (import.meta.env.DEV) {
          console.log('🔔 Notification settings updated from another tab:', newSettings);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // ============================================================
  // ✅ ১. Check initial permission status
  // ============================================================
  useEffect(() => {
    if (!('Notification' in window)) {
      setIsSupported(false);
      setPermissionStatus('unsupported');
      if (import.meta.env.DEV) {
        console.warn('🔔 Browser does not support notifications.');
      }
      return;
    }
    setPermissionStatus(Notification.permission);
  }, []);

  // ============================================================
  // ✅ ২. Request Notification Permission
  // ============================================================
  const requestPermission = async () => {
    if (!('Notification' in window)) {
      if (import.meta.env.DEV) {
        console.warn('🔔 Browser does not support notifications.');
      }
      return false;
    }

    if (Notification.permission === 'granted') {
      setPermissionStatus('granted');
      return true;
    }

    if (Notification.permission === 'denied') {
      setPermissionStatus('denied');
      if (import.meta.env.DEV) {
        console.warn('🔔 Notification permission already denied.');
      }
      return false;
    }

    try {
      if (import.meta.env.DEV) {
        console.log('🔔 Requesting notification permission...');
      }
      const permission = await Notification.requestPermission();
      
      setPermissionStatus(permission);
      
      if (permission === 'granted') {
        if (import.meta.env.DEV) {
          console.log('🔔 Notification permission granted! ✅');
        }
        sound?.playEvent(SOUND_EVENTS.SUCCESS);
        return true;
      } else {
        if (import.meta.env.DEV) {
          console.warn('🔔 Notification permission denied. ❌');
        }
        sound?.playEvent(SOUND_EVENTS.WARNING);
        return false;
      }
    } catch (error) {
      console.error('🔔 Error requesting notification permission:', error);
      return false;
    }
  };

  // ============================================================
  // ✅ ৩. Check if permission is granted
  // ============================================================
  const hasPermission = useCallback(() => {
    if (!('Notification' in window)) return false;
    return Notification.permission === 'granted';
  }, []);

  // ============================================================
  // ✅ ৪. Get current permission status
  // ============================================================
  const getPermissionStatus = useCallback(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }, []);

  // ============================================================
  // ✅ ৫. Show Browser Notification
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
    if (!('Notification' in window)) {
      if (import.meta.env.DEV) {
        console.warn('🔔 Browser does not support notifications.');
      }
      return null;
    }

    if (Notification.permission !== 'granted') {
      if (import.meta.env.DEV) {
        console.warn('🔔 Notification permission not granted.');
      }
      return null;
    }

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

      notification.onclose = () => {
        if (import.meta.env.DEV) {
          console.log('🔔 Notification closed');
        }
      };

      notification.onerror = (error) => {
        console.error('🔔 Notification error:', error);
      };

      if (import.meta.env.DEV) {
        console.log('🔔 Notification shown:', title);
      }
      return notification;

    } catch (error) {
      console.error('🔔 Error showing notification:', error);
      return null;
    }
  }, []);

  // ============================================================
  // ✅ ৬. 🔥 Create Firestore Notification
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

      const docRef = await addDoc(collection(db, collectionName), notificationData);
      
      if (import.meta.env.DEV) {
        console.log(`✅ Firestore notification created: ${event} for user ${userId}`, docRef.id);
      }
      return docRef.id;
    } catch (error) {
      console.error('❌ Error creating Firestore notification:', error);
      return null;
    }
  }, []);

  // ============================================================
  // ✅ ৭. 🔥 Send to Multiple Users
  // ============================================================
  const sendToMultipleUsers = useCallback(async ({
    userIds,
    event,
    data = {},
    overrides = {},
    isAdmin = false,
  }) => {
    if (!userIds || userIds.length === 0) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ No userIds provided for notification');
      }
      return [];
    }

    const template = NotificationTemplates[event];
    if (!template) {
      if (import.meta.env.DEV) {
        console.warn(`🔔 Unknown notification event: ${event}`);
      }
      return [];
    }

    const config = {
      ...template(data),
      ...overrides
    };

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
      if (result) {
        results.push(result);
      }
    }
    return results;
  }, [createFirestoreNotification]);

  // ============================================================
  // ✅ ৮. 🔥 Unified Notify Function - SETTINGS CHECK যোগ করুন
  // ============================================================
  const notify = useCallback(({
    event,
    data = {},
    overrides = {},
    skipFirestore = false,
    isAdmin = false,
  }) => {
    // ============================================================
    // 🔥 STEP 1: Check if push notifications are globally enabled
    // ============================================================
    if (settings?.pushNotifications === false) {
      if (import.meta.env.DEV) {
        console.log(`🔔 Push notifications disabled by settings. Event: ${event}`);
      }
      return;
    }

    // ============================================================
    // 🔥 STEP 2: Get template and check category
    // ============================================================
    const template = NotificationTemplates[event];

    if (!template) {
      if (import.meta.env.DEV) {
        console.warn(`🔔 Unknown notification event: ${event}`);
      }
      return;
    }

    const config = {
      ...template(data),
      ...overrides
    };

    // ============================================================
    // 🔥 STEP 3: Check category-specific settings
    // ============================================================
    const category = config.category || 'system';
    
    if (!isCategoryEnabled(category, settings)) {
      if (import.meta.env.DEV) {
        console.log(`🔔 Category "${category}" is disabled by settings. Event: ${event}`);
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.log(`🔔 [${event}] Category: ${category}`, config);
    }

    // ============================================================
    // 🔥 STEP 4: Play Sound (if enabled)
    // ============================================================
    const now = Date.now();
    if (config.soundEnabled !== false && config.soundEvent) {
      if (now - soundDebounceRef.current > 500) {
        if (import.meta.env.DEV) {
          console.log(`🔊 Playing sound: ${config.soundEvent}`);
        }
        sound?.playEvent(config.soundEvent);
        soundDebounceRef.current = now;
      } else {
        if (import.meta.env.DEV) {
          console.log(`🔊 Sound debounced: ${config.soundEvent}`);
        }
      }
    }

    if (import.meta.env.DEV) {
      console.log("📢 Browser permission:", Notification.permission);
    }

    // ============================================================
    // 🔥 STEP 5: Show Browser Notification (if enabled)
    // ============================================================
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

    // ============================================================
    // 🔥 STEP 6: Show In-App Alert (if enabled)
    // ============================================================
    if (config.inApp && config.alertType) {
      const alertMessages = {
        success: () => feedback.showSuccess(config.title || '✅ সফল', config.body),
        error: () => feedback.showError(config.title || '❌ ত্রুটি', config.body),
        warning: () => feedback.showWarning(config.title || '⚠️ সতর্কতা', config.body),
        info: () => feedback.showInfo(config.title || 'ℹ️ তথ্য', config.body),
      };
      
      const alertMethod = alertMessages[config.alertType];
      if (alertMethod) {
        alertMethod();
      }
    }

    // ============================================================
    // 🔥 STEP 7: Save to Firestore (if not skipped)
    // ============================================================
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
        sendToMultipleUsers({
          userIds: data.userIds,
          event,
          data,
          overrides,
          isAdmin,
        });
      }
    }
  }, [sound, feedback, settings, hasPermission, showNotification, createFirestoreNotification, sendToMultipleUsers]);

  // ✅ Store notify in ref
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  // ============================================================
  // ✅ ৯. 🔥 USER NOTIFICATION LISTENER (Settings Check যোগ করুন)
  // ============================================================
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("🔔 [DEBUG] User Notification Effect Started");
      console.log("🔔 [DEBUG] Current User from AuthContext:", currentUser?.uid || 'No user');
    }

    if (unsubscribeRef.current) {
      if (import.meta.env.DEV) {
        console.log("🔔 [DEBUG] Cleaning up previous user listener...");
      }
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    processedIds.current = new Set();
    isInitialSnapshot.current = true;

    const user = currentUser;

    if (!user) {
      if (import.meta.env.DEV) {
        console.log("🔔 [DEBUG] No user, clearing unread count");
      }
      setUnreadCount(0);
      return;
    }

    if (import.meta.env.DEV) {
      console.log(`🔔 [DEBUG] Setting up user notification listener for: ${user.uid}`);
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        if (import.meta.env.DEV) {
          console.log("🔥 User onSnapshot callback fired");
        }
        
        if (!isMountedRef.current) return;

        // ✅ Check if notifications are globally disabled
        if (settings?.pushNotifications === false) {
          setUnreadCount(0);
          return;
        }

        const unread = snapshot.docs.filter(doc => {
          const data = doc.data();
          // ✅ Check category-specific settings
          const category = getEventCategory(data.event);
          return data.isUnread !== false && isCategoryEnabled(category, settings);
        }).length;
        
        setUnreadCount(unread);

        if (isInitialSnapshot.current) {
          if (import.meta.env.DEV) {
            console.log(`📥 Initial user notifications snapshot: ${snapshot.docs.length} items`);
          }
          snapshot.docs.forEach(doc => {
            processedIds.current.add(doc.id);
          });
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

          // ✅ Check category before notifying
          const category = getEventCategory(data.event);
          if (!isCategoryEnabled(category, settings)) {
            if (import.meta.env.DEV) {
              console.log(`🔔 Notification skipped (category disabled): ${data.event}`);
            }
            return;
          }

          if (import.meta.env.DEV) {
            console.log("🔔 [DEBUG] User Notification Received:", data.event || 'unknown');
          }

          if (data.event && NotificationTemplates[data.event]) {
            notifyRef.current({
              event: data.event,
              data: {
                ...data,
                userId: data.userId,
                userIds: data.userIds,
              },
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
          const keepIds = ids.slice(-500);
          processedIds.current = new Set(keepIds);
          if (import.meta.env.DEV) {
            console.log('🧹 Cleaned user processed notification IDs');
          }
        }
      },
      (error) => {
        console.error('❌ User notification listener error:', error);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        if (import.meta.env.DEV) {
          console.log("🔔 [DEBUG] Unsubscribing user notification listener...");
        }
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [currentUser, settings]); // ✅ settings dependency added

  // ============================================================
  // ✅ ১০. 🔥 ADMIN NOTIFICATION LISTENER
  // ============================================================
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("🔔 [DEBUG] Admin Notification Effect Started");
    }

    if (adminUnsubscribeRef.current) {
      if (import.meta.env.DEV) {
        console.log("🔔 [DEBUG] Cleaning up previous admin listener...");
      }
      adminUnsubscribeRef.current();
      adminUnsubscribeRef.current = null;
    }

    adminProcessedIds.current = new Set();
    isAdminInitialSnapshot.current = true;

    const user = currentUser;

    if (!user) {
      if (import.meta.env.DEV) {
        console.log("🔔 [DEBUG] No admin user, clearing admin unread count");
      }
      setAdminUnreadCount(0);
      return;
    }

    // ✅ Check if user is admin
    const checkAdminAndListen = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        
        const isAdmin = userData?.role === 'admin' || 
                        userData?.isAdmin === true ||
                        ['hammanmusa362@gmail.com', 'hasanmahmudmd362@gmail.com'].includes(user.email);

        if (!isAdmin) {
          if (import.meta.env.DEV) {
            console.log("🔔 [DEBUG] User is not admin, skipping admin notifications");
          }
          setAdminUnreadCount(0);
          return;
        }

        if (import.meta.env.DEV) {
          console.log(`🔔 [DEBUG] Setting up admin notification listener for: ${user.uid}`);
        }

        const q = query(
          collection(db, 'admin_notifications'),
          orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, 
          (snapshot) => {
            if (import.meta.env.DEV) {
              console.log("🔥 Admin onSnapshot callback fired");
            }
            
            if (!isMountedRef.current) return;

            // ✅ Check if admin notifications are globally disabled
            if (settings?.pushNotifications === false || settings?.adminNotifications === false) {
              setAdminUnreadCount(0);
              return;
            }

            const unread = snapshot.docs.filter(doc => {
              const data = doc.data();
              return data.isRead !== true && settings?.adminNotifications !== false;
            }).length;
            
            setAdminUnreadCount(unread);

            if (isAdminInitialSnapshot.current) {
              if (import.meta.env.DEV) {
                console.log(`📥 Initial admin notifications snapshot: ${snapshot.docs.length} items`);
              }
              snapshot.docs.forEach(doc => {
                adminProcessedIds.current.add(doc.id);
              });
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

              // ✅ Check admin notification settings
              if (settings?.adminNotifications === false) {
                if (import.meta.env.DEV) {
                  console.log('🔔 Admin notification skipped (disabled)');
                }
                return;
              }

              if (import.meta.env.DEV) {
                console.log("🔔 [DEBUG] Admin Notification Received:", data.event || 'unknown');
              }

              // ✅ Play sound for admin notifications
              if (data.event && NotificationTemplates[data.event]) {
                notifyRef.current({
                  event: data.event,
                  data: {
                    ...data,
                    userId: data.userId || user.uid,
                    userIds: data.userIds,
                  },
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

              // ✅ Mark as read automatically
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
              const keepIds = ids.slice(-500);
              adminProcessedIds.current = new Set(keepIds);
              if (import.meta.env.DEV) {
                console.log('🧹 Cleaned admin processed notification IDs');
              }
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
        if (import.meta.env.DEV) {
          console.log("🔔 [DEBUG] Unsubscribing admin notification listener...");
        }
        adminUnsubscribeRef.current();
        adminUnsubscribeRef.current = null;
      }
    };
  }, [currentUser, settings]); // ✅ settings dependency added

  // ============================================================
  // ✅ Helper: Check if a specific notification is enabled
  // ============================================================
  const isNotificationEnabled = useCallback((event) => {
    if (!settings) return true;
    
    if (settings.pushNotifications === false) return false;
    
    const category = getEventCategory(event);
    return isCategoryEnabled(category, settings);
  }, [settings]);

  // ============================================================
  // ✅ Helper: Get settings
  // ============================================================
  const getSettings = useCallback(() => {
    return settings;
  }, [settings]);

  // ============================================================
  // ✅ Context Value
  // ============================================================
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
    // ✅ NEW: Settings-related exports
    settings,
    isNotificationEnabled,
    getSettings,
    isCategoryEnabled: (category) => isCategoryEnabled(category, settings),
  }), [
    permissionStatus, 
    isSupported, 
    unreadCount, 
    adminUnreadCount, 
    settings,
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

// ============================================================
// 🔔 Hook
// ============================================================
export const useNotification = () => {
  const context = useContext(NotificationContext);
  
  if (!context) {
    throw new Error(
      'useNotification must be used inside NotificationProvider'
    );
  }
  
  return context;
};

export default NotificationProvider;