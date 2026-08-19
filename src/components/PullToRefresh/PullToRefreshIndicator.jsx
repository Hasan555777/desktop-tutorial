// src/components/PullToRefresh/PullToRefreshIndicator.jsx
// টান দেওয়ার সময় উপরে দেখানোর ছোট্ট স্পিনার ইন্ডিকেটর।

import React from 'react';

const PullToRefreshIndicator = ({ pullDistance, isRefreshing }) => {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: `${pullDistance}px`,
        overflow: 'hidden',
        transition: isRefreshing ? 'none' : 'height 0.2s ease',
      }}
    >
      <i
        className="fa-solid fa-arrows-rotate"
        style={{
          fontSize: '18px',
          color: 'var(--accent-primary, #14b8a6)',
          animation: isRefreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
          transform: isRefreshing ? 'none' : `rotate(${pullDistance * 3}deg)`,
        }}
      />
      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default PullToRefreshIndicator;