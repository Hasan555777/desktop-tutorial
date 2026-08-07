// src/pages/Admin/components/AdminNotifications.jsx

import React from 'react';
import { formatDate } from '../utils/adminUtils';
import EmptyState from './EmptyState';
import './AdminNotifications.css';

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
    const styles = {
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
    
    return styles[type] || styles.admin_notification;
  };

  // ✅ লোডিং স্টেট
  if (isLoading) {
    return (
      <div className="admin-notifications-tab">
        <div className="tab-header">
          <h2>
            <i className="fa-solid fa-bell"></i> 
            অ্যাডমিন নোটিফিকেশন
          </h2>
        </div>
        <div className="notifications-list loading">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="notification-skeleton">
              <div className="skeleton-icon"></div>
              <div className="skeleton-content">
                <div className="skeleton-title"></div>
                <div className="skeleton-message"></div>
                <div className="skeleton-meta"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-notifications-tab">
      {/* ── Header ── */}
      <div className="tab-header">
        <h2>
          <i className="fa-solid fa-bell"></i> 
          অ্যাডমিন নোটিফিকেশন
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount} টি আনরিড</span>
          )}
        </h2>
        <div className="tab-actions">
          {unreadCount > 0 && (
            <button 
              className="btn btn-primary" 
              onClick={onMarkAllAsRead}
              title="সব নোটিফিকেশন রিড করুন"
            >
              <i className="fa-solid fa-check-double"></i> সব রিড করুন
            </button>
          )}
          <button 
            className="btn btn-secondary" 
            onClick={onSendTest}
            title="টেস্ট নোটিফিকেশন পাঠান"
          >
            <i className="fa-solid fa-paper-plane"></i> টেস্ট পাঠান
          </button>
        </div>
      </div>

      {/* ── Notifications List ── */}
      <div className="notifications-list">
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
                className={`admin-notification-card ${notif.isUnread ? 'unread' : 'read'}`}
                onClick={() => {
                  if (notif.isUnread) {
                    onMarkAsRead(notif.id);
                  }
                }}
              >
                {/* ── Icon ── */}
                <div 
                  className="notif-icon" 
                  style={{ 
                    background: style.bg, 
                    color: style.color 
                  }}
                >
                  <i className={notif.icon || style.icon}></i>
                </div>

                {/* ── Content ── */}
                <div className="notif-content">
                  <div className="notif-header">
                    <h4>{notif.title || 'Notification'}</h4>
                    {notif.isUnread && (
                      <span className="unread-dot"></span>
                    )}
                  </div>
                  <p className="notif-message">{notif.message}</p>
                  <div className="notif-meta">
                    <span className="notif-type">
                      {notif.type || notif.event || 'System'}
                    </span>
                    <span className="notif-time">
                      <i className="fa-regular fa-clock"></i>
                      {formatDateFn(notif.createdAt)}
                    </span>
                    {notif.sentByEmail && (
                      <span className="notif-sender">
                        <i className="fa-regular fa-user"></i>
                        {notif.sentByEmail}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Actions ── */}
                <div className="notif-actions">
                  {notif.isUnread && (
                    <button 
                      className="mark-read-btn"
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
                    className="delete-btn"
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
        <div className="notifications-footer">
          <span className="total-count">
            মোট {notifications.length} টি নোটিফিকেশন
          </span>
          {unreadCount > 0 && (
            <span className="unread-count">
              {unreadCount} টি আনরিড
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;