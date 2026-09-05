// src/pages/Admin/components/EmptyState.jsx

import React from 'react';

// ============================================================
// 🎯 EMPTY STATE COMPONENT
// ============================================================

const EmptyState = ({ 
  icon = 'fa-solid fa-check-circle', 
  iconColor = '#10b981', 
  iconSize = '48px',
  title = 'কোন ডেটা নেই',
  subtitle = 'সব ডেটা আপডেট করা হয়েছে! 🎉',
  action = null
}) => {
  return (
    <div className="no-data">
      <i className={icon} style={{ color: iconColor, fontSize: iconSize }}></i>
      <p>{title}</p>
      <small>{subtitle}</small>
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  );
};

export default EmptyState;