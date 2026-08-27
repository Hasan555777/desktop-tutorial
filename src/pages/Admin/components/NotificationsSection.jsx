// src/pages/Admin/components/NotificationsSection.jsx

import React from 'react';
import { formatDate } from '../utils/adminUtils';
import styles from './NotificationsSection.module.css';

// ============================================================
// 🎯 NOTIFICATIONS SECTION COMPONENT
// ============================================================

const NotificationsSection = ({
  notifications,
  notificationMessage,
  notificationType,
  selectedUsersForNotify,
  filteredUsers,
  sendingNotification,
  onMessageChange,
  onTypeChange,
  onToggleSelectAll,
  onToggleUser,
  onSend,
  formatDateFn = formatDate
}) => {
  return (
    <div className={styles.adminNotifications}>
      <h3>📨 নোটিফিকেশন পাঠান</h3>
      
      <div className={styles.notificationForm}>
        <div className={styles.formGroup}>
          <label>নোটিফিকেশন টাইপ</label>
          <select 
            value={notificationType} 
            onChange={(e) => onTypeChange(e.target.value)}
          >
            <option value="info">ℹ️ তথ্য</option>
            <option value="success">✅ সফল</option>
            <option value="warning">⚠️ সতর্কতা</option>
            <option value="error">❌ ত্রুটি</option>
          </select>
        </div>
        
        <div className={styles.formGroup}>
          <label>মেসেজ</label>
          <textarea 
            value={notificationMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="নোটিফিকেশন মেসেজ লিখুন..."
            rows="4"
          />
        </div>
        
        <div className={styles.formGroup}>
          <label>প্রাপক নির্বাচন করুন</label>
          <div className={styles.recipientSelect}>
            <div className={styles.selectAll}>
              <label>
                <input 
                  type="checkbox" 
                  checked={selectedUsersForNotify.length === filteredUsers.length && filteredUsers.length > 0}
                  onChange={onToggleSelectAll}
                />
                সব নির্বাচন করুন ({filteredUsers.length})
              </label>
            </div>
            <div className={styles.userList}>
              {filteredUsers.map((user) => (
                <label key={user.id} className={styles.userCheck}>
                  <input 
                    type="checkbox" 
                    checked={selectedUsersForNotify.includes(user.id)}
                    onChange={() => onToggleUser(user.id)}
                  />
                  <span>{user.displayName || user.email}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        
        <button 
          className={`${styles.btn} ${styles.btnPrimary}`} 
          onClick={onSend}
          disabled={sendingNotification || !notificationMessage.trim()}
        >
          {sendingNotification ? '⏳ পাঠানো হচ্ছে...' : '📨 নোটিফিকেশন পাঠান'}
        </button>
      </div>
      
      <div className={styles.sentNotifications}>
        <h4>পাঠানো নোটিফিকেশন</h4>
        <div className={styles.notificationList}>
          {notifications.map((notif) => (
            <div key={notif.id} className={`${styles.notificationItem} ${styles[notif.type]}`}>
              <div className={styles.notifMessage}>{notif.message}</div>
              <div className={styles.notifMeta}>
                <span>{notif.recipientCount || 0} জন</span>
                <span>{formatDateFn(notif.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotificationsSection;