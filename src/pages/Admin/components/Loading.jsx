// src/pages/Admin/components/Loading.jsx

import React from 'react';

// ============================================================
// 🎯 LOADING COMPONENT
// ============================================================

const Loading = ({ message = 'Loading Dashboard...', subMessage = 'Preparing your admin panel...' }) => {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh', 
      background: '#090d16', 
      color: '#14b8a6' 
    }}>
      <div style={{ textAlign: 'center' }}>
        <i className="fa-solid fa-cube" style={{ 
          fontSize: '48px', 
          animation: 'spin 2s linear infinite',
          display: 'block',
          marginBottom: '16px'
        }} />
        <h2>{message}</h2>
        <p style={{ color: '#64748b', marginTop: '8px', fontSize: '14px' }}>
          <i className="fa-solid fa-spinner fa-spin"></i> {subMessage}
        </p>
      </div>
    </div>
  );
};

export default Loading;