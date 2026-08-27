// src/pages/Admin/components/AdminNotifications.jsx

import React from 'react';
import { formatDate } from '../utils/adminUtils';
import EmptyState from './EmptyState';
import styles from './AdminNotifications.module.css';

// ============================================================
// 🎯 ADMIN NOTIFICATIONS COMPONENT
// ============================================================

const AdminNotifications = ({
  notifications,
  unreadCount,
  onMarkAllAsRead,
  onMarkAsRead,
  onDelete,
  onSendTest,
  formatDateFn = formatDate,
  isLoading = false
}) => {
  // ✅ নোটিফিকেশন টাইপ অনুযায়ী আইকন ও রঙ
  const getNotificationStyle = (type) => {
    const styleMap = {
      admin_announcement: { icon: 'fa-solid fa-bullhorn', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
      admin_notification: { icon: 'fa-solid fa-bell', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
      deposit_approved: { icon: 'fa-solid fa-check-circle', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
      deposit_rejected: { icon: 'fa-solid fa-times-circle', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
      withdraw_approved: { icon: 'fa-solid fa-check-circle', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
      withdraw_rejected: { icon: 'fa-solid fa-times-circle', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
      post_approved: { icon: 'fa-solid fa-check-circle', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
      post_rejected: { icon: 'fa-solid fa-times-circle', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
      user_verified: { icon: 'fa-solid fa-user-check', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
      user_blocked: { icon: 'fa-solid fa-user-slash', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
      user_unblocked: { icon: 'fa-solid fa-user-check', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
      report_resolved: { icon: 'fa-solid fa-check-circle', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
      report_cancelled: { icon: 'fa-solid fa-times-circle', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
      system_error: { icon: 'fa-solid fa-circle-exclamation', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
      system_warning: { icon: 'fa-solid fa-triangle-exclamation', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
      deal_confirmed: { icon: 'fa-solid fa-handshake', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
      deal_cancelled: { icon: 'fa-solid fa-handshake-slash', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
      deal_completed: { icon: 'fa-solid fa-trophy', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
      bank_transfer_approved: { icon: 'fa-solid fa-building-columns', color: '#438e82', bg: 'rgba(67, 142, 130, 0.1)' },
      bank_transfer_rejected: { icon: 'fa-solid fa-building-columns', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
    };
    
    return styleMap[type] || styleMap.admin_notification;
  };

  // ✅ লোডিং স্টেট
  if (isLoading) {
    return (
      <div className={styles.adminNotificationsTab}>
        <div className={styles.tabHeader}>
          <h2>
            <i className="fa-solid fa-bell"></i> 
            অ্যাডমিন নোটিফিকেশন
          </h2>
        </div>
        <div className={`${styles.notificationsList} ${styles.loading}`}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.notificationSkeleton}>
              <div className={styles.skeletonIcon}></div>
              <div className={styles.skeletonContent}>
                <div className={styles.skeletonTitle}></div>
                <div className={styles.skeletonMessage}></div>
                <div className={styles.skeletonMeta}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminNotificationsTab}>
      {/* ── Header ── */}
      <div className={styles.tabHeader}>
        <h2>
          <i className="fa-solid fa-bell"></i> 
          অ্যাডমিন নোটিফিকেশন
          {unreadCount > 0 && (
            <span className={styles.unreadBadge}>{unreadCount} টি আনরিড</span>
          )}
        </h2>
        <div className={styles.tabActions}>
          {unreadCount > 0 && (
            <button 
              className={`${styles.btn} ${styles.btnPrimary}`} 
              onClick={onMarkAllAsRead}
              title="সব নোটিফিকেশন রিড করুন"
            >
              <i className="fa-solid fa-check-double"></i> সব রিড করুন
            </button>
          )}
          <button 
            className={`${styles.btn} ${styles.btnSecondary}`} 
            onClick={onSendTest}
            title="টেস্ট নোটিফিকেশন পাঠান"
          >
            <i className="fa-solid fa-paper-plane"></i> টেস্ট পাঠান
          </button>
        </div>
      </div>

      {/* ── Notifications List ── */}
      <div className={styles.notificationsList}>
        {notifications.length === 0 ? (
          <EmptyState 
            icon="fa-solid fa-bell-slash"
            iconColor="#64748b"
            iconSize="48px"
            title="কোন অ্যাডমিন নোটিফিকেশন নেই"
            subtitle="সব নোটিফিকেশন দেখা হয়েছে! 🎉"
          />
        ) : (
          notifications.map((notif) => {
            const style = getNotificationStyle(notif.type || notif.event);
            
            return (
              <div 
                key={notif.id} 
                className={`${styles.adminNotificationCard} ${notif.isUnread ? styles.unread : styles.read}`}
                onClick={() => {
                  if (notif.isUnread) {
                    onMarkAsRead(notif.id);
                  }
                }}
              >
                {/* ── Icon ── */}
                <div 
                  className={styles.notifIcon} 
                  style={{ 
                    background: style.bg, 
                    color: style.color 
                  }}
                >
                  <i className={notif.icon || style.icon}></i>
                </div>

                {/* ── Content ── */}
                <div className={styles.notifContent}>
                  <div className={styles.notifHeader}>
                    <h4>{notif.title || 'Notification'}</h4>
                    {notif.isUnread && (
                      <span className={styles.unreadDot}></span>
                    )}
                  </div>
                  <p className={styles.notifMessage}>{notif.message}</p>
                  <div className={styles.notifMeta}>
                    <span className={styles.notifType}>
                      {notif.type || notif.event || 'System'}
                    </span>
                    <span className={styles.notifTime}>
                      <i className="fa-regular fa-clock"></i>
                      {formatDateFn(notif.createdAt)}
                    </span>
                    {notif.sentByEmail && (
                      <span className={styles.notifSender}>
                        <i className="fa-regular fa-user"></i>
                        {notif.sentByEmail}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Actions ── */}
                <div className={styles.notifActions}>
                  {notif.isUnread && (
                    <button 
                      className={styles.markReadBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAsRead(notif.id);
                      }}
                      title="রিড করুন"
                    >
                      <i className="fa-solid fa-check"></i>
                    </button>
                  )}
                  <button 
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(notif.id);
                    }}
                    title="ডিলিট করুন"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      {notifications.length > 0 && (
        <div className={styles.notificationsFooter}>
          <span className={styles.totalCount}>
            মোট {notifications.length} টি নোটিফিকেশন
          </span>
          {unreadCount > 0 && (
            <span className={styles.unreadCount}>
              {unreadCount} টি আনরিড
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;