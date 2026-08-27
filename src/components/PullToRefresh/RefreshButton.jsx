// src/components/PullToRefresh/RefreshButton.jsx
//
// ডেস্কটপ/মোবাইল দুই জায়গাতেই কাজ করে এমন একটা explicit refresh
// বাটন। header-এর ডানপাশে বসানোর জন্য বানানো — ছোট আইকন বাটন,
// refresh চলাকালীন spin করবে ও ডিসেবল থাকবে (ডাবল-ক্লিক আটকাতে)।

import React from 'react';

const RefreshButton = ({ onRefresh, isRefreshing, style = {} }) => (
  <button
    type="button"
    onClick={onRefresh}
    disabled={isRefreshing}
    title="Refresh"
    style={{
      background: 'transparent',
      border: 'none',
      cursor: isRefreshing ? 'default' : 'pointer',
      color: 'var(--text-muted, #64748b)',
      fontSize: '16px',
      padding: '8px',
      opacity: isRefreshing ? 0.5 : 1,
      ...style,
    }}
  >
    <i className={`fa-solid fa-rotate ${isRefreshing ? 'fa-spin' : ''}`}></i>
  </button>
);

export default RefreshButton;