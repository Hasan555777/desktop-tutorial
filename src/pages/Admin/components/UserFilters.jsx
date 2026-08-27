// src/pages/Admin/components/UserFilters.jsx

import React from 'react';
import styles from './UserFilters.module.css';

// ============================================================
// 🎯 USER FILTERS COMPONENT
// ============================================================

const UserFilters = ({ 
  searchTerm, 
  onSearchChange, 
  filterStatus, 
  onFilterChange,
  onNotificationsClick,
  onRefreshClick 
}) => {
  const filterOptions = [
    { value: 'all', label: '📋 সব' },
    { value: 'verified', label: '✅ যাচাইকৃত' },
    { value: 'pending', label: '⏳ যাচাই প্রক্রিয়াধীন' },
    { value: 'pending_verification', label: '🔄 যাচাই বাকি' },
    { value: 'incomplete', label: '📝 অসম্পূর্ণ' },
    { value: 'blocked', label: '🚫 ব্লক' },
  ];

  return (
    <div className={styles.usersHeader}>
      <div className={styles.usersSearch}>
        <input 
          type="text" 
          placeholder="🔍 নাম, ইমেইল, আইডি, ফোন দিয়ে খুঁজুন..." 
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <select 
          value={filterStatus} 
          onChange={(e) => onFilterChange(e.target.value)}
        >
          {filterOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.usersActions}>
        <button 
          className={`${styles.btn} ${styles.btnPrimary}`} 
          onClick={onNotificationsClick}
        >
          📨 নোটিফিকেশন
        </button>
        <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onRefreshClick}>
          🔄 রিফ্রেশ
        </button>
      </div>
    </div>
  );
};

export default UserFilters;