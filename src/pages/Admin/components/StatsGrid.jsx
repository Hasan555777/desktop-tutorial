// src/pages/Admin/components/StatsGrid.jsx

import React from 'react';
import styles from './StatsGrid.module.css';

// ============================================================
// 🎯 STATS GRID COMPONENT
// ============================================================

const StatCard = ({ icon, label, value, color, onClick }) => (
  <div 
    className={`${styles.statCard} ${onClick ? styles.clickable : ''}`} 
    style={{ cursor: onClick ? 'pointer' : 'default' }} 
    onClick={onClick}
  >
    <div className={`${styles.statIcon} ${styles[color]}`}>{icon}</div>
    <div className={styles.statInfo}>
      <h3>{value}</h3>
      <p>{label}</p>
    </div>
  </div>
);

const StatsGrid = ({ 
  stats, 
  onPendingPostsClick,
  onPendingUsersClick,
  onDepositsClick,
  onWithdrawalsClick,
  onReportsClick
}) => {
  const statItems = [
    { 
      icon: '👥', 
      label: 'মোট ইউজার', 
      value: stats.totalUsers || 0, 
      color: 'blue' 
    },
    { 
      icon: '✅', 
      label: 'যাচাইকৃত', 
      value: stats.verifiedUsers || 0, 
      color: 'green' 
    },
    { 
      icon: '⏳', 
      label: 'যাচাই বাকি', 
      value: stats.pendingUsers || 0, 
      color: 'yellow',
      onClick: onPendingUsersClick
    },
    { 
      icon: '🚫', 
      label: 'ব্লককৃত', 
      value: stats.blockedUsers || 0, 
      color: 'red' 
    },
    { 
      icon: '📄', 
      label: 'মোট পোস্ট', 
      value: stats.totalPosts || 0, 
      color: 'purple' 
    },
    { 
      icon: '⏳', 
      label: 'পেন্ডিং পোস্ট', 
      value: stats.pendingPosts || 0, 
      color: 'orange',
      onClick: onPendingPostsClick
    },
    { 
      icon: '🤝', 
      label: 'মোট ডিল', 
      value: stats.totalDeals || 0, 
      color: 'teal' 
    },
    { 
      icon: '💳', 
      label: 'পেন্ডিং ডিপোজিট', 
      value: stats.pendingDeposits || 0, 
      color: 'purple',
      onClick: onDepositsClick
    },
    { 
      icon: '💸', 
      label: 'পেন্ডিং উইথড্র', 
      value: stats.pendingWithdrawals || 0, 
      color: 'pink',
      onClick: onWithdrawalsClick
    },
    { 
      icon: '🚩', 
      label: 'পেন্ডিং রিপোর্ট', 
      value: stats.pendingReports || 0, 
      color: 'red',
      onClick: onReportsClick
    },
  ];

  return (
    <div className={styles.statsGrid}>
      {statItems.map((item, index) => (
        <StatCard
          key={index}
          icon={item.icon}
          label={item.label}
          value={item.value}
          color={item.color}
          onClick={item.onClick}
        />
      ))}
    </div>
  );
};

export default StatsGrid;