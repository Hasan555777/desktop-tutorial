// ============================================================
// 📁 src/pages/Notifications.jsx
// ============================================================
// CHAT NOTIFICATIONS REMOVED — Only Deal, Wallet, Admin, System

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
import './Notifications.css';

const Notifications = ({ currentUser, onUnreadCountChange }) => {
  console.log("📌 Notifications component mounted");

  const navigate = useNavigate();
  const feedback = useFeedback();

  // ============================================================
  // ✅ State
  // ============================================================
  const [selectedNoti, setSelectedNoti] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // ============================================================
  // ✅ Time Format
  // ============================================================
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

  // ============================================================
  // ✅ Notification Style — CHAT EVENTS REMOVED
  // ============================================================
  const getNotificationStyle = (event) => {
    const styles = {
      // ── Deal Events ──
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

      // ── Milestone Events ──
      [NOTIFICATION_EVENTS.MILESTONE_FUNDED]: { icon: 'fa-solid fa-circle-dollar', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.MILESTONE_REVIEW]: { icon: 'fa-solid fa-star', colorClass: 'noti-message' },
      [NOTIFICATION_EVENTS.MILESTONE_RELEASED]: { icon: 'fa-solid fa-circle-check', colorClass: 'noti-success' },

      // ── Cancellation Events ──
      [NOTIFICATION_EVENTS.CANCELLATION_REQUEST]: { icon: 'fa-solid fa-clock', colorClass: 'noti-warning' },
      [NOTIFICATION_EVENTS.CANCELLATION_APPROVED]: { icon: 'fa-solid fa-ban', colorClass: 'noti-danger' },
      [NOTIFICATION_EVENTS.CANCELLATION_REJECTED]: { icon: 'fa-solid fa-times', colorClass: 'noti-system' },

      // ── Wallet Events ──
      [NOTIFICATION_EVENTS.PAYMENT_RECEIVED]: { icon: 'fa-solid fa-money-bill-wave', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.PAYMENT_RELEASED]: { icon: 'fa-solid fa-circle-check', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.WALLET_CREDITED]: { icon: 'fa-solid fa-wallet', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.WALLET_DEBITED]: { icon: 'fa-solid fa-wallet', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.DEPOSIT_APPROVED]: { icon: 'fa-solid fa-arrow-up-right-from-square', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.DEPOSIT_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },
      [NOTIFICATION_EVENTS.WITHDRAW_APPROVED]: { icon: 'fa-solid fa-arrow-up-right-from-square', colorClass: 'noti-payment' },
      [NOTIFICATION_EVENTS.WITHDRAW_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },

      // ── Admin Events ──
      [NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT]: { icon: 'fa-solid fa-bullhorn', colorClass: 'noti-system' },
      [NOTIFICATION_EVENTS.ADMIN_NOTIFICATION]: { icon: 'fa-solid fa-bell', colorClass: 'noti-system' },

      // ── Review Events ──
      [NOTIFICATION_EVENTS.REVIEW_RECEIVED]: { icon: 'fa-solid fa-star', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.REVIEW_REQUESTED]: { icon: 'fa-solid fa-pen', colorClass: 'noti-message' },

      // ── Verification Events ──
      [NOTIFICATION_EVENTS.VERIFY_APPROVED]: { icon: 'fa-solid fa-check-circle', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.VERIFY_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },

      // ── Post Events ──
      [NOTIFICATION_EVENTS.POST_APPROVED]: { icon: 'fa-solid fa-check-circle', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.POST_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },

      // ── Report Events ──
      [NOTIFICATION_EVENTS.REPORT_RESOLVED]: { icon: 'fa-solid fa-circle-check', colorClass: 'noti-success' },
      [NOTIFICATION_EVENTS.REPORT_CANCELLED]: { icon: 'fa-solid fa-ban', colorClass: 'noti-danger' },

      // ── System Events ──
      [NOTIFICATION_EVENTS.SYSTEM]: { icon: 'fa-solid fa-bell', colorClass: 'noti-system' },
      [NOTIFICATION_EVENTS.SYSTEM_UPDATE]: { icon: 'fa-solid fa-rotate', colorClass: 'noti-info' },
      [NOTIFICATION_EVENTS.SYSTEM_ERROR]: { icon: 'fa-solid fa-triangle-exclamation', colorClass: 'noti-danger' },
      [NOTIFICATION_EVENTS.NOTIFICATION]: { icon: 'fa-solid fa-bell', colorClass: 'noti-system' },
    };
    
    return styles[event] || { icon: 'fa-solid fa-bell', colorClass: 'noti-system' };
  };

  // ============================================================
  // ✅ Notification Title — CHAT EVENTS REMOVED
  // ============================================================
  const getNotificationTitle = (event, data) => {
    const titles = {
      // ── Deal Events ──
      [NOTIFICATION_EVENTS.DEAL_CREATED]: '📄 New Deal Created',
      [NOTIFICATION_EVENTS.DEAL_CONFIRMED]: '🎉 ডিল কনফার্ম হয়েছে!',
      [NOTIFICATION_EVENTS.DEAL_APPROVED]: '✅ Deal Approved',
      [NOTIFICATION_EVENTS.DEAL_REJECTED]: '❌ Deal Rejected',
      [NOTIFICATION_EVENTS.DEAL_REOPENED]: '🔄 Deal Reopened',
      [NOTIFICATION_EVENTS.DEAL_COMPLETED]: '🏆 ডিল সম্পূর্ণ হয়েছে!',
      [NOTIFICATION_EVENTS.DEAL_CANCELLED]: '❌ ডিল ক্যানসেল হয়েছে',
      [NOTIFICATION_EVENTS.DEAL_EXTENDED]: '⏰ ডেডলাইন বাড়ানো হয়েছে',
      [NOTIFICATION_EVENTS.DEAL_DEADLINE_PASSED]: '⏰ ডেডলাইন শেষ হয়েছে',
      [NOTIFICATION_EVENTS.DEADLINE_PASSED]: '⏰ ডেডলাইন শেষ হয়েছে',

      // ── Milestone Events ──
      [NOTIFICATION_EVENTS.MILESTONE_FUNDED]: '💰 মাইলস্টোন ফান্ড হয়েছে',
      [NOTIFICATION_EVENTS.MILESTONE_REVIEW]: '📝 রিভিউ রিকোয়েস্ট',
      [NOTIFICATION_EVENTS.MILESTONE_RELEASED]: '✅ পেমেন্ট রিলিজ হয়েছে',

      // ── Cancellation Events ──
      [NOTIFICATION_EVENTS.CANCELLATION_REQUEST]: '⚠️ ক্যানসেল রিকোয়েস্ট',
      [NOTIFICATION_EVENTS.CANCELLATION_APPROVED]: '✅ ডিল ক্যানসেল হয়েছে',
      [NOTIFICATION_EVENTS.CANCELLATION_REJECTED]: '❌ ক্যানসেল রিজেক্ট',

      // ── Wallet Events ──
      [NOTIFICATION_EVENTS.PAYMENT_RECEIVED]: '💰 পেমেন্ট পেয়েছেন',
      [NOTIFICATION_EVENTS.PAYMENT_RELEASED]: '✅ পেমেন্ট রিলিজ হয়েছে',
      [NOTIFICATION_EVENTS.WALLET_CREDITED]: '💰 টাকা যোগ হয়েছে',
      [NOTIFICATION_EVENTS.WALLET_DEBITED]: '💸 টাকা কাটা হয়েছে',
      [NOTIFICATION_EVENTS.DEPOSIT_APPROVED]: '💰 ডিপোজিট অ্যাপ্রুভ হয়েছে',
      [NOTIFICATION_EVENTS.DEPOSIT_REJECTED]: '❌ ডিপোজিট রিজেক্ট',
      [NOTIFICATION_EVENTS.WITHDRAW_APPROVED]: '💳 উইথড্র অ্যাপ্রুভ হয়েছে',
      [NOTIFICATION_EVENTS.WITHDRAW_REJECTED]: '❌ উইথড্র রিজেক্ট',

      // ── Admin Events ──
      [NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT]: '📢 অ্যাডমিন ঘোষণা',
      [NOTIFICATION_EVENTS.ADMIN_NOTIFICATION]: '📢 অ্যাডমিন নোটিফিকেশন',

      // ── Review Events ──
      [NOTIFICATION_EVENTS.REVIEW_RECEIVED]: '⭐ নতুন রিভিউ',
      [NOTIFICATION_EVENTS.REVIEW_REQUESTED]: '📝 রিভিউ রিকোয়েস্ট',

      // ── Verification Events ──
      [NOTIFICATION_EVENTS.VERIFY_APPROVED]: '✅ ভেরিফিকেশন অ্যাপ্রুভ হয়েছে',
      [NOTIFICATION_EVENTS.VERIFY_REJECTED]: '❌ ভেরিফিকেশন রিজেক্ট',

      // ── Post Events ──
      [NOTIFICATION_EVENTS.POST_APPROVED]: '✅ পোস্ট অ্যাপ্রুভ হয়েছে',
      [NOTIFICATION_EVENTS.POST_REJECTED]: '❌ পোস্ট রিজেক্ট',

      // ── Report Events ──
      [NOTIFICATION_EVENTS.REPORT_RESOLVED]: '✅ রিপোর্ট রিজল্ভ হয়েছে',
      [NOTIFICATION_EVENTS.REPORT_CANCELLED]: '❌ রিপোর্ট ক্যানসেল',

      // ── System Events ──
      [NOTIFICATION_EVENTS.SYSTEM]: '📢 সিস্টেম',
      [NOTIFICATION_EVENTS.SYSTEM_UPDATE]: '🔄 সিস্টেম আপডেট',
      [NOTIFICATION_EVENTS.SYSTEM_ERROR]: '⚠️ সিস্টেম এরর',
      [NOTIFICATION_EVENTS.NOTIFICATION]: '🔔 নতুন নোটিফিকেশন',
    };
    
    return titles[event] || data?.title || '🔔 নোটিফিকেশন';
  };

  // ============================================================
  // ✅ Filter — Skip Chat Notifications
  // ============================================================
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
        
        if (import.meta.env.DEV) {
          console.log("📊 Total docs found:", snapshot.docs.length);
        }
        
        // ✅ Filter out chat notifications
        const notificationsData = snapshot.docs
          .map(doc => {
            const data = doc.data();
            const event = data.event || data.type || 'system';
            
            // ✅ Skip chat events
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
            };
          })
          .filter(Boolean); // Remove null entries
        
        setNotifications(notificationsData);
        
        const unreadCount = notificationsData.filter(n => n.isUnread).length;
        if (typeof onUnreadCountChange === 'function') {
          onUnreadCountChange(unreadCount);
        }
        
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
  }, [currentUser?.uid]);

  // ============================================================
  // ✅ Delete Single Notification
  // ============================================================
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
      
      if (import.meta.env.DEV) {
        console.log("🗑️ Deleted notification:", id);
      }
      
      setNotifications(prev => {
        const updated = prev.filter(n => n.id !== id);
        const newUnreadCount = updated.filter(n => n.isUnread === true).length;
        if (typeof onUnreadCountChange === 'function') {
          onUnreadCountChange(newUnreadCount);
        }
        return updated;
      });
      
      await feedback.showSuccess('✅ ডিলিট', 'নোটিফিকেশন ডিলিট করা হয়েছে!');
      
    } catch (error) {
      console.error("Error deleting notification:", error);
      await feedback.showError('❌ ডিলিট ব্যর্থ', 'নোটিফিকেশন ডিলিট করতে সমস্যা হয়েছে');
    }
  };

  // ============================================================
  // ✅ Clear All Notifications
  // ============================================================
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
      if (typeof onUnreadCountChange === 'function') {
        onUnreadCountChange(0);
      }
      
      await feedback.showSuccess('✅ ক্লিয়ার', 'সব নোটিফিকেশন ক্লিয়ার করা হয়েছে!');
      
    } catch (error) {
      console.error("Error clearing notifications:", error);
      await feedback.showError('❌ ক্লিয়ার ব্যর্থ', 'নোটিফিকেশন ক্লিয়ার করতে সমস্যা হয়েছে');
    }
  };

  // ============================================================
  // ✅ Mark All as Read
  // ============================================================
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
      
      if (import.meta.env.DEV) {
        console.log(`✅ Marked ${unreadNotifications.length} as read`);
      }
      
      setNotifications(prev => 
        prev.map(n => ({
          ...n,
          isUnread: false
        }))
      );
      
      if (typeof onUnreadCountChange === 'function') {
        onUnreadCountChange(0);
      }
      
      await feedback.showSuccess('✅ রিড', `${unreadNotifications.length} টি নোটিফিকেশন রিড করা হয়েছে!`);
      
    } catch (error) {
      console.error("Error marking all as read:", error);
      await feedback.showError('❌ রিড ব্যর্থ', 'নোটিফিকেশন রিড করতে সমস্যা হয়েছে');
    }
  };

  // ============================================================
  // ✅ Toggle Read Status
  // ============================================================
  const toggleReadStatus = async (id) => {
    try {
      const notiRef = doc(db, 'notifications', id);
      await updateDoc(notiRef, { 
        isUnread: false,
        isRead: true,
        readAt: serverTimestamp()
      });
      
      if (import.meta.env.DEV) {
        console.log("✅ Marked as read:", id);
      }
      
      setNotifications(prev => 
        prev.map(n => 
          n.id === id ? { ...n, isUnread: false } : n
        )
      );
      
      const newUnreadCount = notifications.filter(n => n.isUnread === true && n.id !== id).length;
      if (typeof onUnreadCountChange === 'function') {
        onUnreadCountChange(newUnreadCount);
      }
      
    } catch (error) {
      console.error("Error toggling read status:", error);
    }
  };

  // ============================================================
  // ✅ নোটিফিকেশন ক্লিক হ্যান্ডলার
  // ============================================================
  const handleNotificationClick = async (noti) => {
    if (import.meta.env.DEV) {
      console.log("🖱️ Notification clicked:", noti);
    }
    
    setSelectedNoti(noti);
    
    if (noti.isUnread) {
      await toggleReadStatus(noti.id);
    }
    
    if (import.meta.env.DEV) {
      console.log("📌 Modal opened for notification ID:", noti.id);
    }
  };

  const unreadCount = notifications.filter(n => n.isUnread === true).length;

  // ============================================================
  // ✅ Loading State
  // ============================================================
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

  // ============================================================
  // ✅ Render
  // ============================================================
  return (
    <div className="notifications-container-wrapper">
      <div className="notifications-panel">
        
        {/* ✅ হেডার */}
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

        {/* ✅ নোটিফিকেশন লিস্ট */}
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

                {/* Delete Button */}
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

      {/* ✅ মোডাল */}
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