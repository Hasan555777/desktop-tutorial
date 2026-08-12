// ============================================================
// 📁 src/pages/Notifications.jsx
// ============================================================
// 🔧 FIXES APPLIED:
// 1. Removed onUnreadCountChange entirely. App.js already has its own
//    live onSnapshot listener on the `notifications` collection, so
//    it updates the badge automatically whenever this page writes to
//    Firestore (mark read / delete / clear all). Having THIS page
//    also compute and push its own count up caused two competing
//    numbers -> flicker / wrong badge count, especially with settings
//    toggled off (this page's count ignored settings entirely before).
// 2. Now imports the same category/settings map App.js uses, so a
//    muted category behaves identically in both places for the
//    unread COUNT shown in the header. (History list itself still
//    shows all non-chat notifications — muting a category stops new
//    alerts/badge counting, it doesn't erase your notification log.
//    Say the word if you'd rather muted categories be hidden from the
//    list too.)

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '@/firebase';
import { 
  collection, query, where, onSnapshot, orderBy, 
  updateDoc, doc, writeBatch, serverTimestamp, deleteDoc
} from 'firebase/firestore';
import NotificationModal from '../components/NotificationModal';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';
import { isCategoryEnabled } from '@/utils/notificationCategory';
import './Notifications.css';

const NOTIFICATION_SETTINGS_KEY = 'workhub_notification_settings';

const getNotificationSettings = () => {
  try {
    const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading notification settings:', e);
  }
  return null;
};

// 🔧 FIX: no longer takes/uses onUnreadCountChange
const Notifications = ({ currentUser }) => {
  const navigate = useNavigate();
  const feedback = useFeedback();

  const [selectedNoti, setSelectedNoti] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState(() => getNotificationSettings());

  // Keep settings in sync if changed from the Settings page while this page is open
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === NOTIFICATION_SETTINGS_KEY) {
        setNotificationSettings(getNotificationSettings());
      }
    };
    const handleSettingsChange = (e) => setNotificationSettings(e.detail || getNotificationSettings());
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('workhub:notification-settings', handleSettingsChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('workhub:notification-settings', handleSettingsChange);
    };
  }, []);

  const formatNotificationTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      let date;
      if (timestamp.toDate) {
        date = timestamp.toDate();
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        return 'Just now';
      }
      
      const now = new Date();
      const diff = now - date;
      
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
      
      return date.toLocaleDateString();
    } catch (error) {
      console.error("Time format error:", error);
    }
    return 'Just now';
  };

  const getNotificationStyle = (event) => {
    const styles = {
      [NOTIFICATION_EVENTS.DEAL_CREATED]: { icon: 'fa-solid fa-file-invoice', colorClass: 'noti-project' },
      [NOTIFICATION_EVENTS.DEAL_CONFIRMED]: { icon: 'fa-solid fa-handshake', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.DEAL_APPROVED]: { icon: 'fa-solid fa-check-circle', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.DEAL_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },
      [NOTIFICATION_EVENTS.DEAL_REOPENED]: { icon: 'fa-solid fa-rotate', colorClass: 'noti-info' },
      [NOTIFICATION_EVENTS.DEAL_COMPLETED]: { icon: 'fa-solid fa-trophy', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.DEAL_CANCELLED]: { icon: 'fa-solid fa-ban', colorClass: 'noti-danger' },
      [NOTIFICATION_EVENTS.DEAL_EXTENDED]: { icon: 'fa-solid fa-clock', colorClass: 'noti-info' },
      [NOTIFICATION_EVENTS.DEAL_DEADLINE_PASSED]: { icon: 'fa-solid fa-hourglass-end', colorClass: 'noti-warning' },
      [NOTIFICATION_EVENTS.DEADLINE_PASSED]: { icon: 'fa-solid fa-hourglass-end', colorClass: 'noti-warning' },

      [NOTIFICATION_EVENTS.MILESTONE_FUNDED]: { icon: 'fa-solid fa-circle-dollar', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.MILESTONE_REVIEW]: { icon: 'fa-solid fa-star', colorClass: 'noti-message' },
      [NOTIFICATION_EVENTS.MILESTONE_RELEASED]: { icon: 'fa-solid fa-circle-check', colorClass: 'noti-success' },

      [NOTIFICATION_EVENTS.CANCELLATION_REQUEST]: { icon: 'fa-solid fa-clock', colorClass: 'noti-warning' },
      [NOTIFICATION_EVENTS.CANCELLATION_APPROVED]: { icon: 'fa-solid fa-ban', colorClass: 'noti-danger' },
      [NOTIFICATION_EVENTS.CANCELLATION_REJECTED]: { icon: 'fa-solid fa-times', colorClass: 'noti-system' },

      [NOTIFICATION_EVENTS.PAYMENT_RECEIVED]: { icon: 'fa-solid fa-money-bill-wave', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.PAYMENT_RELEASED]: { icon: 'fa-solid fa-circle-check', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.WALLET_CREDITED]: { icon: 'fa-solid fa-wallet', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.WALLET_DEBITED]: { icon: 'fa-solid fa-wallet', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.DEPOSIT_APPROVED]: { icon: 'fa-solid fa-arrow-up-right-from-square', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.DEPOSIT_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },
      [NOTIFICATION_EVENTS.WITHDRAW_APPROVED]: { icon: 'fa-solid fa-arrow-up-right-from-square', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.WITHDRAW_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },

      [NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT]: { icon: 'fa-solid fa-bullhorn', colorClass: 'noti-system' },
      [NOTIFICATION_EVENTS.ADMIN_NOTIFICATION]: { icon: 'fa-solid fa-bell', colorClass: 'noti-system' },

      [NOTIFICATION_EVENTS.REVIEW_RECEIVED]: { icon: 'fa-solid fa-star', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.REVIEW_REQUESTED]: { icon: 'fa-solid fa-pen', colorClass: 'noti-message' },

      [NOTIFICATION_EVENTS.VERIFY_APPROVED]: { icon: 'fa-solid fa-check-circle', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.VERIFY_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },

      [NOTIFICATION_EVENTS.POST_APPROVED]: { icon: 'fa-solid fa-check-circle', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.POST_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },

      [NOTIFICATION_EVENTS.REPORT_RESOLVED]: { icon: 'fa-solid fa-circle-check', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.REPORT_CANCELLED]: { icon: 'fa-solid fa-ban', colorClass: 'noti-danger' },

      [NOTIFICATION_EVENTS.SYSTEM]: { icon: 'fa-solid fa-bell', colorClass: 'noti-system' },
      [NOTIFICATION_EVENTS.SYSTEM_UPDATE]: { icon: 'fa-solid fa-rotate', colorClass: 'noti-info' },
      [NOTIFICATION_EVENTS.SYSTEM_ERROR]: { icon: 'fa-solid fa-triangle-exclamation', colorClass: 'noti-danger' },
      [NOTIFICATION_EVENTS.NOTIFICATION]: { icon: 'fa-solid fa-bell', colorClass: 'noti-system' },
    };
    
    return styles[event] || { icon: 'fa-solid fa-bell', colorClass: 'noti-system' };
  };

  const getNotificationTitle = (event, data) => {
    const titles = {
      [NOTIFICATION_EVENTS.DEAL_CREATED]: '📄 New Deal Created',
      [NOTIFICATION_EVENTS.DEAL_CONFIRMED]: '🎉 ডিল কনফার্ম হয়েছে!',
      [NOTIFICATION_EVENTS.DEAL_APPROVED]: '✅ Deal Approved',
      [NOTIFICATION_EVENTS.DEAL_REJECTED]: '❌ Deal Rejected',
      [NOTIFICATION_EVENTS.DEAL_REOPENED]: '🔄 Deal Reopened',
      [NOTIFICATION_EVENTS.DEAL_COMPLETED]: '🏆 ডিল সম্পূর্ণ হয়েছে!',
      [NOTIFICATION_EVENTS.DEAL_CANCELLED]: '❌ ডিল ক্যানসেল হয়েছে',
      [NOTIFICATION_EVENTS.DEAL_EXTENDED]: '⏰ ডেডলাইন বাড়ানো হয়েছে',
      [NOTIFICATION_EVENTS.DEAL_DEADLINE_PASSED]: '⏰ ডেডলাইন শেষ হয়েছে',
      [NOTIFICATION_EVENTS.DEADLINE_PASSED]: '⏰ ডেডলাইন শেষ হয়েছে',

      [NOTIFICATION_EVENTS.MILESTONE_FUNDED]: '💰 মাইলস্টোন ফান্ড হয়েছে',
      [NOTIFICATION_EVENTS.MILESTONE_REVIEW]: '📝 রিভিউ রিকোয়েস্ট',
      [NOTIFICATION_EVENTS.MILESTONE_RELEASED]: '✅ পেমেন্ট রিলিজ হয়েছে',

      [NOTIFICATION_EVENTS.CANCELLATION_REQUEST]: '⚠️ ক্যানসেল রিকোয়েস্ট',
      [NOTIFICATION_EVENTS.CANCELLATION_APPROVED]: '✅ ডিল ক্যানসেল হয়েছে',
      [NOTIFICATION_EVENTS.CANCELLATION_REJECTED]: '❌ ক্যানসেল রিজেক্ট',

      [NOTIFICATION_EVENTS.PAYMENT_RECEIVED]: '💰 পেমেন্ট পেয়েছেন',
      [NOTIFICATION_EVENTS.PAYMENT_RELEASED]: '✅ পেমেন্ট রিলিজ হয়েছে',
      [NOTIFICATION_EVENTS.WALLET_CREDITED]: '💰 টাকা যোগ হয়েছে',
      [NOTIFICATION_EVENTS.WALLET_DEBITED]: '💸 টাকা কাটা হয়েছে',
      [NOTIFICATION_EVENTS.DEPOSIT_APPROVED]: '💰 ডিপোজিট অ্যাপ্রুভ হয়েছে',
      [NOTIFICATION_EVENTS.DEPOSIT_REJECTED]: '❌ ডিপোজিট রিজেক্ট',
      [NOTIFICATION_EVENTS.WITHDRAW_APPROVED]: '💳 উইথড্র অ্যাপ্রুভ হয়েছে',
      [NOTIFICATION_EVENTS.WITHDRAW_REJECTED]: '❌ উইথড্র রিজেক্ট',

      [NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT]: '📢 অ্যাডমিন ঘোষণা',
      [NOTIFICATION_EVENTS.ADMIN_NOTIFICATION]: '📢 অ্যাডমিন নোটিফিকেশন',

      [NOTIFICATION_EVENTS.REVIEW_RECEIVED]: '⭐ নতুন রিভিউ',
      [NOTIFICATION_EVENTS.REVIEW_REQUESTED]: '📝 রিভিউ রিকোয়েস্ট',

      [NOTIFICATION_EVENTS.VERIFY_APPROVED]: '✅ ভেরিফিকেশন অ্যাপ্রুভ হয়েছে',
      [NOTIFICATION_EVENTS.VERIFY_REJECTED]: '❌ ভেরিফিকেশন রিজেক্ট',

      [NOTIFICATION_EVENTS.POST_APPROVED]: '✅ পোস্ট অ্যাপ্রুভ হয়েছে',
      [NOTIFICATION_EVENTS.POST_REJECTED]: '❌ পোস্ট রিজেক্ট',

      [NOTIFICATION_EVENTS.REPORT_RESOLVED]: '✅ রিপোর্ট রিজল্ভ হয়েছে',
      [NOTIFICATION_EVENTS.REPORT_CANCELLED]: '❌ রিপোর্ট ক্যানসেল',

      [NOTIFICATION_EVENTS.SYSTEM]: '📢 সিস্টেম',
      [NOTIFICATION_EVENTS.SYSTEM_UPDATE]: '🔄 সিস্টেম আপডেট',
      [NOTIFICATION_EVENTS.SYSTEM_ERROR]: '⚠️ সিস্টেম এরর',
      [NOTIFICATION_EVENTS.NOTIFICATION]: '🔔 নতুন নোটিফিকেশন',
    };
    
    return titles[event] || data?.title || '🔔 নোটিফিকেশন';
  };

  const isChatEvent = (event) => {
    const chatEvents = [
      NOTIFICATION_EVENTS.CHAT_MESSAGE,
      NOTIFICATION_EVENTS.CHAT_IMAGE,
      NOTIFICATION_EVENTS.CHAT_PROPOSAL,
      NOTIFICATION_EVENTS.CHAT_PROPOSAL_ACCEPTED,
      NOTIFICATION_EVENTS.CHAT_PROPOSAL_REJECTED,
      NOTIFICATION_EVENTS.CHAT_DEAL_STARTED,
    ];
    return chatEvents.includes(event);
  };

  // ============================================================
  // 🔥 Firebase থেকে নোটিফিকেশন লোড করা
  // ============================================================
  useEffect(() => {
    const userId = currentUser?.uid;
    
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const notiRef = collection(db, 'notifications');
    
    const q = query(
      notiRef, 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    let isMounted = true;

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        if (!isMounted) return;
        
        const notificationsData = snapshot.docs
          .map(doc => {
            const data = doc.data();
            const event = data.event || data.type || 'system';
            
            if (isChatEvent(event)) {
              return null;
            }
            
            const style = getNotificationStyle(event);
            const title = data.title || getNotificationTitle(event, data);
            
            return {
              id: doc.id,
              ...data, 
              event: event,
              title: title,
              time: formatNotificationTime(data.createdAt),
              icon: data.icon || style.icon || 'fa-solid fa-bell',
              colorClass: data.colorClass || style.colorClass || 'noti-system',
              isUnread: data.isUnread === true && data.isRead !== true,
              // 🔧 used only for the header's unread count below, so a
              // muted category doesn't inflate/duplicate the count —
              // the item itself still shows in the history list.
              countsTowardBadge: isCategoryEnabled(event, notificationSettings),
            };
          })
          .filter(Boolean);
        
        setNotifications(notificationsData);
        // 🔧 FIX: no more onUnreadCountChange(...) call here — App.js's
        // own listener is now the single source of truth for the badge.
        
        setLoading(false);
      },
      (error) => {
        console.error("❌ Firebase Error:", error);
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [currentUser?.uid, notificationSettings]);

  const handleDeleteNotification = async (id, event) => {
    event.stopPropagation();
    
    const confirmed = await feedback.confirm({
      title: 'Delete Notification?',
      message: 'Are you sure you want to delete this notification?',
      variant: 'delete',
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) return;
    
    try {
      const notiRef = doc(db, 'notifications', id);
      await deleteDoc(notiRef);
      
      // Local state update only — the onSnapshot listener above will
      // also reconcile automatically, this just avoids a visual flash.
      setNotifications(prev => prev.filter(n => n.id !== id));
      
      await feedback.showSuccess('✅ ডিলিট', 'নোটিফিকেশন ডিলিট করা হয়েছে!');
      
    } catch (error) {
      console.error("Error deleting notification:", error);
      await feedback.showError('❌ ডিলিট ব্যর্থ', 'নোটিফিকেশন ডিলিট করতে সমস্যা হয়েছে');
    }
  };

  const handleClearAllNotifications = async () => {
    if (notifications.length === 0) return;
    
    const confirmed = await feedback.confirm({
      title: 'Clear All Notifications?',
      message: 'Are you sure you want to delete ALL notifications? This cannot be undone!',
      variant: 'delete',
      confirmText: 'Yes, Clear All',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) return;
    
    try {
      const batch = writeBatch(db);
      notifications.forEach(noti => {
        const notiRef = doc(db, 'notifications', noti.id);
        batch.delete(notiRef);
      });
      
      await batch.commit();
      setNotifications([]);
      
      await feedback.showSuccess('✅ ক্লিয়ার', 'সব নোটিফিকেশন ক্লিয়ার করা হয়েছে!');
      
    } catch (error) {
      console.error("Error clearing notifications:", error);
      await feedback.showError('❌ ক্লিয়ার ব্যর্থ', 'নোটিফিকেশন ক্লিয়ার করতে সমস্যা হয়েছে');
    }
  };

  const markAllAsRead = async () => {
    if (notifications.length === 0) return;
    
    const unreadNotifications = notifications.filter(n => n.isUnread === true);
    if (unreadNotifications.length === 0) {
      await feedback.showInfo('ℹ️ তথ্য', 'কোন আনরিড নোটিফিকেশন নেই!');
      return;
    }
    
    try {
      const batch = writeBatch(db);
      
      unreadNotifications.forEach(noti => {
        const notiRef = doc(db, 'notifications', noti.id);
        batch.update(notiRef, { 
          isUnread: false,
          isRead: true,
          readAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      
      setNotifications(prev => 
        prev.map(n => ({ ...n, isUnread: false }))
      );
      
      await feedback.showSuccess('✅ রিড', `${unreadNotifications.length} টি নোটিফিকেশন রিড করা হয়েছে!`);
      
    } catch (error) {
      console.error("Error marking all as read:", error);
      await feedback.showError('❌ রিড ব্যর্থ', 'নোটিফিকেশন রিড করতে সমস্যা হয়েছে');
    }
  };

  const toggleReadStatus = async (id) => {
    try {
      const notiRef = doc(db, 'notifications', id);
      await updateDoc(notiRef, { 
        isUnread: false,
        isRead: true,
        readAt: serverTimestamp()
      });
      
      setNotifications(prev => 
        prev.map(n => 
          n.id === id ? { ...n, isUnread: false } : n
        )
      );
      // 🔧 FIX: no manual count push — App.js's listener will pick up
      // this Firestore write on its own.
      
    } catch (error) {
      console.error("Error toggling read status:", error);
    }
  };

  const handleNotificationClick = async (noti) => {
    setSelectedNoti(noti);
    
    if (noti.isUnread) {
      await toggleReadStatus(noti.id);
    }
  };

  // Header count now respects settings, matching the Navbar badge
  const unreadCount = notifications.filter(n => n.isUnread === true && n.countsTowardBadge !== false).length;

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: 'var(--bg-primary, #090d16)', 
        color: 'var(--accent-primary, #14b8a6)' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{ 
            fontSize: '48px', 
            animation: 'spin 2s linear infinite',
            display: 'block',
            marginBottom: '16px'
          }} />
          <h2>Loading Notifications...</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your notifications...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="notifications-container-wrapper">
      <div className="notifications-panel">
        
        <div className="noti-header">
          <div className="noti-header-left">
            <div className="noti-header-icon">
              <i className="fa-solid fa-bell"></i>
              {unreadCount > 0 && <span className="noti-header-pulse"></span>}
            </div>
            <div className="noti-header-info">
              <h2>Notifications</h2>
            </div>
          </div>
          
          <div className="noti-header-right">
            {unreadCount > 0 && (
              <button className="mark-all-btn" onClick={markAllAsRead}>
                <i className="fa-solid fa-check-double"></i>
                <span>Mark all read</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button className="clear-all-btn" onClick={handleClearAllNotifications}>
                <i className="fa-solid fa-trash"></i>
                <span>Clear all</span>
              </button>
            )}
          </div>
        </div>

        <div className="noti-list-body">
          {notifications.length > 0 ? (
            notifications.map((noti) => (
              <div 
                key={noti.id} 
                className={`noti-item-card ${noti.isUnread ? 'unread-noti' : 'read-noti'}`}
                onClick={() => handleNotificationClick(noti)}
              >
                <div className={`noti-icon-box ${noti.colorClass || 'noti-system'}`}>
                  <i className={noti.icon || 'fa-solid fa-bell'}></i>
                </div>

                <div className="noti-content-block">
                  <div className="noti-top-line">
                    <h4>{noti.title || 'Notification'}</h4>
                    <span className="noti-time">{noti.time}</span>
                  </div>
                  <p className="noti-message">{noti.message}</p>
                  {noti.actionRequired && (
                    <div className="noti-action-badge">
                      <i className="fa-solid fa-exclamation-circle"></i> Action Required
                    </div>
                  )}
                </div>

                <button 
                  className="noti-delete-btn"
                  onClick={(e) => handleDeleteNotification(noti.id, e)}
                  title="Delete notification"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>

                {noti.isUnread && <div className="noti-unread-dot"></div>}
              </div>
            ))
          ) : (
            <div className="no-noti-notice">
              <i className="fa-solid fa-bell-slash"></i>
              <p>No notifications yet</p>
              <span>All your notifications will appear here</span>
            </div>
          )}
        </div>
      </div>

      {selectedNoti && (
        <NotificationModal 
          notification={selectedNoti} 
          onClose={() => {
            setSelectedNoti(null);
          }} 
        />
      )}
    </div>
  );
};

export default Notifications;