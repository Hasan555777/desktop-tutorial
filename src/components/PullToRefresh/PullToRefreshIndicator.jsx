// src/components/PullToRefresh/PullToRefreshIndicator.jsx
// টান দেওয়ার সময় উপরে দেখানোর ছোট্ট স্পিনার ইন্ডিকেটর।

import React from 'react';
import styles from './PullToRefreshIndicator.module.css';

const PullToRefreshIndicator = ({ pullDistance, isRefreshing }) => {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      className={styles.pullToRefreshContainer}
      style={{
        height: `${pullDistance}px`,
        transition: isRefreshing ? 'none' : 'height 0.2s ease',
      }}
    >
      <i
        className={`fa-solid fa-arrows-rotate ${styles.pullToRefreshIcon}`}
        style={{
          animation: isRefreshing ? 'ptrSpin 0.7s linear infinite' : 'none',
          transform: isRefreshing ? 'none' : `rotate(${pullDistance * 3}deg)`,
        }}
      />
    </div>
  );
};

export default PullToRefreshIndicator;