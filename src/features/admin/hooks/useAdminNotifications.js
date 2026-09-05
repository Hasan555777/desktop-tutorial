// src/pages/Admin/hooks/useAdminNotifications.js

import { useEffect, useRef, useState, useCallback } from 'react';
import { db, auth } from '../../../shared/firebase/index';
import { 
  collection, query, onSnapshot, orderBy, 
  updateDoc, doc, serverTimestamp, writeBatch, getDoc,
  addDoc, deleteDoc  // ✅ addDoc এবং deleteDoc যোগ করা হয়েছে
} from 'firebase/firestore';
import { useNotification } from '../../../shared/ui/Notification/NotificationProvider';
import { useSound } from '../../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../../shared/ui/Sound/SoundEvents';
import { NOTIFICATION_EVENTS } from '../../../shared/ui/Notification/NotificationEvents';
import { isAdminUser } from '../constants/admin';

export const useAdminNotifications = () => {
  const { notify, showNotification, hasPermission } = useNotification();
  const sound = useSound();
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const processedIds = useRef(new Set());
  const isFirstLoad = useRef(true);
  const isMountedRef = useRef(true);

  // ============================================================
  // 🎵 সাউন্ড প্লে করার ফাংশন
  // ============================================================
  const playSoundForNotification = useCallback((data) => {
    const soundMap = {
      'admin_announcement': SOUND_EVENTS.ADMIN_ANNOUNCEMENT,
      'admin_notification': SOUND_EVENTS.ADMIN_NOTIFICATION,
      'deposit_approved': SOUND_EVENTS.SUCCESS,
      'deposit_rejected': SOUND_EVENTS.ERROR,
      'withdraw_approved': SOUND_EVENTS.SUCCESS,
      'withdraw_rejected': SOUND_EVENTS.ERROR,
      'post_approved': SOUND_EVENTS.SUCCESS,
      'post_rejected': SOUND_EVENTS.ERROR,
      'user_verified': SOUND_EVENTS.SUCCESS,
      'user_blocked': SOUND_EVENTS.WARNING,
      'user_unblocked': SOUND_EVENTS.SUCCESS,
      'report_resolved': SOUND_EVENTS.SUCCESS,
      'report_cancelled': SOUND_EVENTS.WARNING,
      'system_error': SOUND_EVENTS.ERROR,
      'system_warning': SOUND_EVENTS.WARNING,
      'deal_confirmed': SOUND_EVENTS.SUCCESS,
      'deal_cancelled': SOUND_EVENTS.WARNING,
      'deal_completed': SOUND_EVENTS.SUCCESS,
    };

    const soundEvent = soundMap[data.type] || soundMap[data.event] || SOUND_EVENTS.NOTIFICATION;
    
    if (import.meta.env.DEV) {
      console.log(`🔊 Playing sound: ${soundEvent} for ${data.type || data.event}`);
    }
    
    sound?.playEvent(soundEvent);
  }, [sound]);

  // ============================================================
  // 🔔 ব্রাউজার নোটিফিকেশন দেখানোর ফাংশন
  // ============================================================
  const showAdminBrowserNotification = useCallback((data) => {
    const title = data.title || '🔔 Admin Notification';
    const body = data.message || data.body || 'You have a new admin notification';
    const icon = data.icon || '/logo192.png';
    
    const iconMap = {
      'admin_announcement': '📢',
      'admin_notification': '🔔',
      'deposit_approved': '✅',
      'deposit_rejected': '❌',
      'withdraw_approved': '✅',
      'withdraw_rejected': '❌',
      'post_approved': '✅',
      'post_rejected': '❌',
      'user_verified': '✅',
      'user_blocked': '🚫',
      'user_unblocked': '✅',
      'report_resolved': '✅',
      'report_cancelled': '❌',
      'system_error': '⚠️',
      'system_warning': '⚠️',
      'deal_confirmed': '🎉',
      'deal_cancelled': '❌',
      'deal_completed': '🏆',
    };

    const emoji = iconMap[data.type] || data.icon || '🔔';

    showNotification({
      title: `${emoji} ${title}`,
      body: body,
      icon: icon,
      badge: '/logo192.png',
      tag: `admin-${data.id || Date.now()}`,
      data: {
        url: '/admin',
        notificationId: data.id,
        type: data.type,
      },
      requireInteraction: true,
    });
  }, [showNotification]);

  // ============================================================
  // ✅ নোটিফিকেশন রিড মার্ক করা
  // ============================================================
  const markNotificationAsRead = useCallback(async (notificationId) => {
    try {
      const notiRef = doc(db, 'admin_notifications', notificationId);
      await updateDoc(notiRef, {
        isRead: true,
        readAt: serverTimestamp(),
      });
      
      // Update local state
      setAdminNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, isUnread: false, isRead: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      if (import.meta.env.DEV) {
        console.log(`✅ Admin notification marked as read: ${notificationId}`);
      }
      
    } catch (error) {
      console.error('Error marking admin notification as read:', error);
    }
  }, []);

  // ============================================================
  // ✅ সব নোটিফিকেশন রিড মার্ক করা
  // ============================================================
  const markAllAsRead = useCallback(async () => {
    try {
      const unreadNotifications = adminNotifications.filter(n => !n.isRead);
      if (unreadNotifications.length === 0) {
        if (import.meta.env.DEV) {
          console.log('ℹ️ No unread admin notifications');
        }
        return;
      }

      const batch = writeBatch(db);
      unreadNotifications.forEach(n => {
        const notiRef = doc(db, 'admin_notifications', n.id);
        batch.update(notiRef, {
          isRead: true,
          readAt: serverTimestamp(),
        });
      });
      
      await batch.commit();
      
      // Update local state
      setAdminNotifications(prev => 
        prev.map(n => ({ ...n, isUnread: false, isRead: true }))
      );
      setUnreadCount(0);
      
      if (import.meta.env.DEV) {
        console.log(`✅ All ${unreadNotifications.length} admin notifications marked as read`);
      }
      
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }, [adminNotifications]);

  // ============================================================
  // 🔥 Main Effect - Listen for Admin Notifications
  // ============================================================
  useEffect(() => {
    let unsubscribe = null;
    let adminCheckUnsubscribe = null;

    const setupListener = async () => {
      const user = auth.currentUser;
      
      if (!user) {
        if (import.meta.env.DEV) {
          console.log('🔔 No user, skipping admin notifications');
        }
        setIsLoading(false);
        return;
      }

      // ✅ Check if user is admin
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();

        // 🔧 FIX (item #8): this used to keep its own hardcoded admin
        // email list instead of the shared isAdminUser() helper (the
        // same drift that broke the emergency-unlock check before —
        // see AUDIT_SUMMARY.md item 1). Two lists of "who is admin"
        // can silently go out of sync; now there's only one.
        const isAdmin = isAdminUser(user, userData?.role);

        if (!isAdmin) {
          if (import.meta.env.DEV) {
            console.log('🔔 User is not admin, skipping admin notifications');
          }
          setIsLoading(false);
          return;
        }

        if (import.meta.env.DEV) {
          console.log(`🔔 Setting up admin notification listener for: ${user.uid}`);
        }

        // ✅ Query admin notifications
        const q = query(
          collection(db, 'admin_notifications'),
          orderBy('createdAt', 'desc')
        );

        unsubscribe = onSnapshot(q, 
          (snapshot) => {
            if (!isMountedRef.current) return;

            if (import.meta.env.DEV) {
              console.log(`📊 Admin notifications snapshot: ${snapshot.docs.length} items`);
            }

            const newNotifications = [];
            let unread = 0;

            snapshot.docs.forEach((doc) => {
              const data = doc.data();
              const isUnread = data.isRead !== true;
              
              newNotifications.push({
                id: doc.id,
                ...data,
                isUnread,
                isRead: data.isRead === true,
                createdAt: data.createdAt?.toDate?.() || new Date(),
              });

              if (isUnread) unread++;
            });

            setAdminNotifications(newNotifications);
            setUnreadCount(unread);
            setIsLoading(false);

            // ✅ Process new notifications (skip initial load)
            if (!isFirstLoad.current) {
              snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                  const docId = change.doc.id;
                  const data = change.doc.data();

                  // ✅ Skip if already processed
                  if (processedIds.current.has(docId)) return;
                  processedIds.current.add(docId);

                  // ✅ Only process unread notifications
                  if (data.isRead === true) return;

                  if (import.meta.env.DEV) {
                    console.log('🔔 New admin notification:', data);
                  }

                  // ✅ Play sound
                  playSoundForNotification(data);

                  // ✅ Show browser notification
                  if (hasPermission && hasPermission()) {
                    showAdminBrowserNotification(data);
                  }

                  // ✅ Mark as read after showing (optional)
                  // markNotificationAsRead(docId);
                }
              });
            }

            isFirstLoad.current = false;

            // ✅ Cleanup processed IDs
            if (processedIds.current.size > 500) {
              const ids = Array.from(processedIds.current);
              const keepIds = ids.slice(-500);
              processedIds.current = new Set(keepIds);
              if (import.meta.env.DEV) {
                console.log('🧹 Cleaned admin processed notification IDs');
              }
            }
          },
          (error) => {
            console.error('❌ Admin notification listener error:', error);
            setIsLoading(false);
          }
        );

      } catch (error) {
        console.error('❌ Error checking admin status:', error);
        setIsLoading(false);
      }
    };

    // 🔧 FIX (item #8 — the main bug behind "works on localhost, not
    // in production"): this used to call requestPermission() itself
    // right here on mount, with no user gesture behind it at all.
    // Modern browsers (Chrome in particular) silently block/auto-deny
    // permission prompts that aren't triggered by a real user
    // gesture — and they apply this far more strictly on real
    // production origins than on localhost, where a previously-
    // granted permission or a more lenient dev session usually
    // masked the problem. The end result in production: this fired
    // on every admin dashboard mount, got silently blocked, and the
    // permission stayed stuck on 'default' forever — so
    // hasPermission() was always false and the admin never saw a
    // browser notification. This exact anti-pattern was already
    // fixed in AuthContext.jsx and App.jsx (see their "item #7"
    // comments) but was missed here. Permission requests now only
    // ever happen through NotificationBanner's own button click,
    // which is the single, user-gesture-triggered place for this in
    // the whole app.
    setupListener();

    // ✅ Cleanup
    return () => {
      isMountedRef.current = false;
      if (unsubscribe) {
        unsubscribe();
      }
      if (adminCheckUnsubscribe) {
        adminCheckUnsubscribe();
      }
    };
  }, [hasPermission, playSoundForNotification, showAdminBrowserNotification]);

  // ============================================================
  // ✅ Send Test Admin Notification
  // ============================================================
  const sendTestNotification = useCallback(async (type = 'admin_notification') => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.error('No user logged in');
        return false;
      }

      const testMessages = {
        admin_notification: {
          title: '🔔 টেস্ট অ্যাডমিন নোটিফিকেশন',
          message: 'এটি একটি টেস্ট নোটিফিকেশন! সাউন্ড এবং ব্রাউজার নোটিফিকেশন চেক করুন।',
          type: 'admin_notification',
        },
        admin_announcement: {
          title: '📢 অ্যাডমিন ঘোষণা',
          message: 'এটি একটি টেস্ট অ্যাডমিন ঘোষণা!',
          type: 'admin_announcement',
        },
        success: {
          title: '✅ সাফল্য',
          message: 'অপারেশন সফলভাবে সম্পন্ন হয়েছে!',
          type: 'success',
        },
        warning: {
          title: '⚠️ সতর্কতা',
          message: 'এটি একটি টেস্ট সতর্কতা!',
          type: 'warning',
        },
        error: {
          title: '❌ ত্রুটি',
          message: 'এটি একটি টেস্ট ত্রুটি!',
          type: 'error',
        },
      };

      const testData = testMessages[type] || testMessages.admin_notification;

      // ✅ addDoc এখন ইম্পোর্ট করা হয়েছে
      await addDoc(collection(db, 'admin_notifications'), {
        ...testData,
        createdAt: serverTimestamp(),
        sentBy: user.uid,
        sentByEmail: user.email,
        isRead: false,
        icon: 'fa-solid fa-bell',
        colorClass: 'noti-system',
      });

      if (import.meta.env.DEV) {
        console.log('✅ Test admin notification sent:', type);
      }
      return true;

    } catch (error) {
      console.error('Error sending test notification:', error);
      return false;
    }
  }, []);

  // ============================================================
  // ✅ Delete Notification
  // ============================================================
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      const notiRef = doc(db, 'admin_notifications', notificationId);
      
      // ✅ deleteDoc এখন ইম্পোর্ট করা হয়েছে
      await deleteDoc(notiRef);
      
      setAdminNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Update unread count
      const wasUnread = adminNotifications.find(n => n.id === notificationId)?.isUnread;
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      if (import.meta.env.DEV) {
        console.log(`🗑️ Admin notification deleted: ${notificationId}`);
      }
      
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }, [adminNotifications]);

  return {
    adminNotifications,
    unreadCount,
    isLoading,
    markAllAsRead,
    markNotificationAsRead,
    deleteNotification,
    sendTestNotification,
  };
};

export default useAdminNotifications;