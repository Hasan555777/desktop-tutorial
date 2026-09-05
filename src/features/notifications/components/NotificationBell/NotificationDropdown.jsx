// src/components/NotificationBell/NotificationDropdown.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../../../shared/firebase/index';

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  doc,
  startAfter,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { useNotification } from '../../../../shared/ui/Notification/NotificationProvider';
import { NOTIFICATION_EVENTS } from '../../../../shared/ui/Notification/NotificationEvents';
import styles from './NotificationDropdown.module.css';


const ITEMS_PER_PAGE = 20;

const NotificationDropdown = ({ onClose, isOpen }) => {
  const navigate = useNavigate();
  const { unreadCount: globalUnreadCount, markAsRead } = useNotification();
  
  // ✅ Local state - শুধু dropdown এর জন্য
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const userId = auth.currentUser?.uid;
  const listRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // ============================================================
  // ✅ ১. Real-time Listener (শুধু ২০টি)
  // ============================================================
  useEffect(() => {
    if (!userId || !isOpen) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    console.log('📥 NotificationDropdown: Setting up listener');

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(ITEMS_PER_PAGE)
    );

    // ✅ Cleanup previous listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    setIsInitialLoad(true);
    setLoading(true);

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        if (snapshot.empty) {
          setNotifications([]);
          setHasMore(false);
          setLoading(false);
          setIsInitialLoad(false);
          return;
        }

        const docs = snapshot.docs;
        const last = docs[docs.length - 1];
        setLastVisible(last);

        // ✅ Check if there are more items
        if (docs.length < ITEMS_PER_PAGE) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }

        const items = docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          _timestamp: doc.data().createdAt?.toDate?.() || new Date()
        }));

        setNotifications(items);
        setLoading(false);
        setIsInitialLoad(false);
      },
      (error) => {
        console.error('❌ Notification listener error:', error);
        setLoading(false);
        setIsInitialLoad(false);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [userId, isOpen]);

  // ============================================================
  // ✅ ২. Load More (Infinite Scroll)
  // ============================================================
  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore || !lastVisible) return;

    setLoadingMore(true);

    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(ITEMS_PER_PAGE)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      const docs = snapshot.docs;
      const last = docs[docs.length - 1];
      setLastVisible(last);

      if (docs.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }

      const newItems = docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        _timestamp: doc.data().createdAt?.toDate?.() || new Date()
      }));

      setNotifications(prev => [...prev, ...newItems]);
      setLoadingMore(false);

    } catch (error) {
      console.error('❌ Error loading more:', error);
      setLoadingMore(false);
    }
  }, [userId, loadingMore, hasMore, lastVisible]);

  // ============================================================
  // ✅ ৩. Mark as Read
  // ============================================================
  const handleMarkAsRead = useCallback(async (notificationId) => {
    try {
      const ref = doc(db, 'notifications', notificationId);
      await updateDoc(ref, {
        isUnread: false,
        isRead: true,
        readAt: serverTimestamp(),
      });
      console.log('✅ Notification marked as read:', notificationId);
    } catch (error) {
      console.error('❌ Error marking as read:', error);
    }
  }, []);

  // ============================================================
  // ✅ ৪. Click Handler - Navigation
  // ============================================================
  const handleNotificationClick = useCallback(async (notification) => {
    // ✅ Mark as read
    if (notification.isUnread !== false) {
      await handleMarkAsRead(notification.id);
    }

    onClose();

    // ✅ Navigate based on event type
    const event = notification.event || notification.type;

    switch (event) {
      case NOTIFICATION_EVENTS.CHAT_MESSAGE:
      case NOTIFICATION_EVENTS.CHAT_IMAGE:
      case NOTIFICATION_EVENTS.CHAT_PROPOSAL:
        navigate('/inbox');
        break;

      case NOTIFICATION_EVENTS.DEAL_CONFIRMED:
      case NOTIFICATION_EVENTS.DEAL_APPROVED:
      case NOTIFICATION_EVENTS.DEAL_REJECTED:
      case NOTIFICATION_EVENTS.DEAL_COMPLETED:
      case NOTIFICATION_EVENTS.DEAL_CANCELLED:
      case NOTIFICATION_EVENTS.CANCELLATION_REQUEST:
      case NOTIFICATION_EVENTS.CANCELLATION_APPROVED:
        navigate(`/deal-manager?dealId=${notification.dealId}`);
        break;

      case NOTIFICATION_EVENTS.PAYMENT_RECEIVED:
      case NOTIFICATION_EVENTS.PAYMENT_RELEASED:
      case NOTIFICATION_EVENTS.WALLET_CREDITED:
      case NOTIFICATION_EVENTS.WALLET_DEBITED:
        navigate('/wallet');
        break;

      case NOTIFICATION_EVENTS.REVIEW_RECEIVED:
        navigate(`/profile/user/${notification.reviewerId}`);
        break;

      case NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT:
      case NOTIFICATION_EVENTS.NOTIFICATION:
      default:
        navigate('/notifications');
        break;
    }
  }, [handleMarkAsRead, navigate, onClose]);

  // ============================================================
  // ✅ ৫. Mark All as Read
  // ============================================================
  const handleMarkAllAsRead = useCallback(async () => {
    const unreadItems = notifications.filter(n => n.isUnread !== false);
    if (unreadItems.length === 0) return;

    try {
      const batch = writeBatch(db);
      unreadItems.forEach(item => {
        const ref = doc(db, 'notifications', item.id);
        batch.update(ref, {
          isUnread: false,
          isRead: true,
          readAt: serverTimestamp(),
        });
      });
      await batch.commit();
      console.log(`✅ Marked ${unreadItems.length} as read`);
    } catch (error) {
      console.error('❌ Error marking all as read:', error);
    }
  }, [notifications]);

  // ============================================================
  // ✅ ৬. Scroll Handler (Infinite Scroll)
  // ============================================================
  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      if (hasMore && !loadingMore) {
        loadMore();
      }
    }
  }, [hasMore, loadingMore, loadMore]);

  // ============================================================
  // ✅ ৭. Format Time
  // ============================================================
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      const now = new Date();
      const diff = now - date;

      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Just now';
    }
  };

  // ============================================================
  // ✅ ৮. Get Icon for Event
  // ============================================================
  const getIcon = (event) => {
    const icons = {
      [NOTIFICATION_EVENTS.CHAT_MESSAGE]: 'fa-solid fa-comment-dots',
      [NOTIFICATION_EVENTS.CHAT_IMAGE]: 'fa-solid fa-image',
      [NOTIFICATION_EVENTS.CHAT_PROPOSAL]: 'fa-solid fa-paper-plane',
      [NOTIFICATION_EVENTS.DEAL_CONFIRMED]: 'fa-solid fa-handshake',
      [NOTIFICATION_EVENTS.DEAL_APPROVED]: 'fa-solid fa-check-circle',
      [NOTIFICATION_EVENTS.DEAL_REJECTED]: 'fa-solid fa-times-circle',
      [NOTIFICATION_EVENTS.DEAL_COMPLETED]: 'fa-solid fa-trophy',
      [NOTIFICATION_EVENTS.DEAL_CANCELLED]: 'fa-solid fa-ban',
      [NOTIFICATION_EVENTS.PAYMENT_RECEIVED]: 'fa-solid fa-money-bill-wave',
      [NOTIFICATION_EVENTS.PAYMENT_RELEASED]: 'fa-solid fa-circle-check',
      [NOTIFICATION_EVENTS.WALLET_CREDITED]: 'fa-solid fa-wallet',
      [NOTIFICATION_EVENTS.WALLET_DEBITED]: 'fa-solid fa-wallet',
      [NOTIFICATION_EVENTS.CANCELLATION_REQUEST]: 'fa-solid fa-clock',
      [NOTIFICATION_EVENTS.CANCELLATION_APPROVED]: 'fa-solid fa-ban',
      [NOTIFICATION_EVENTS.REVIEW_RECEIVED]: 'fa-solid fa-star',
      [NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT]: 'fa-solid fa-bullhorn',
      [NOTIFICATION_EVENTS.NOTIFICATION]: 'fa-solid fa-bell',
    };
    return icons[event] || 'fa-solid fa-bell';
  };

  // ============================================================
  // ✅ ৯. Render
  // ============================================================
 if (loading && isInitialLoad) {
    return (
      <div className={`${styles.notificationDropdown} ${styles.loading}`}>
        <div className={styles.dropdownHeader}>
          <span>Notifications</span>
        </div>
        <div className={styles.dropdownBody}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className={styles.notificationSkeleton}>
              <div className={styles.skeletonIcon}></div>
              <div className={styles.skeletonContent}>
                <div className={styles.skeletonLine}></div>
                <div className={`${styles.skeletonLine} ${styles.short}`}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.notificationDropdown}>
      {/* Header */}
      <div className={styles.dropdownHeader}>
        <span>Notifications</span>
        {notifications.filter(n => n.isUnread !== false).length > 0 && (
          <button className={styles.markAllBtn} onClick={handleMarkAllAsRead}>
            Mark all as read
          </button>
        )}
      </div>

      {/* Body */}
      <div className={styles.dropdownBody} onScroll={handleScroll}>
        {notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fa-solid fa-bell-slash"></i>
            <p>No notifications</p>
          </div>
        ) : (
          <>
            {notifications.map((notification) => {
              const isUnread = notification.isUnread !== false;
              const icon = getIcon(notification.event || notification.type);

              return (
                <div
                  key={notification.id}
                  className={`${styles.notificationItem} ${isUnread ? styles.unread : styles.read}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={styles.notificationIcon}>
                    <i className={icon}></i>
                  </div>
                  <div className={styles.notificationContent}>
                    <div className={styles.notificationTitle}>
                      {notification.title || 'Notification'}
                    </div>
                    <div className={styles.notificationMessage}>
                      {notification.message || notification.body}
                    </div>
                    <div className={styles.notificationTime}>
                      {formatTime(notification._timestamp)}
                    </div>
                  </div>
                  {isUnread && <div className={styles.unreadDot}></div>}
                </div>
              );
            })}

            {loadingMore && (
              <div className={styles.loadingMore}>
                <span className={styles.spinnerSmall}></span> Loading more...
              </div>
            )}

            {!hasMore && notifications.length > 0 && (
              <div className={styles.endOfList}>
                <span>You're all caught up! 🎉</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className={styles.dropdownFooter}>
        <button className={styles.viewAllBtn} onClick={() => {
          onClose();
          navigate('/notifications');
        }}>
          View All Notifications
        </button>
      </div>
    </div>
  );
};

export default NotificationDropdown;