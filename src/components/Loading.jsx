// src/components/Loading.jsx

import React from 'react';
import './Loading.css';

const Loading = ({ 
  message = 'Loading...',
  subMessage = 'Please wait...',
  icon = 'fa-solid fa-cube',
  fullScreen = true,
  minHeight = '100vh',
  size = 'default' // 'small', 'default', 'large'
}) => {
  const getIconSize = () => {
    switch (size) {
      case 'small': return '32px';
      case 'large': return '56px';
      default: return '48px';
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small': return '16px';
      case 'large': return '24px';
      default: return '20px';
    }
  };

  return (
    <div 
      className="loading-container"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: fullScreen ? '100vh' : minHeight,
        background: 'var(--bg-primary, #090d16)',
        color: 'var(--accent-primary, #14b8a6)',
        padding: '40px 20px',
        width: '100%'
      }}
    >
      <div className="loading-content" style={{ textAlign: 'center' }}>
        <i 
          className={`${icon} fa-spin`}
          style={{
            fontSize: getIconSize(),
            display: 'block',
            marginBottom: '16px',
            color: 'var(--accent-primary, #14b8a6)'
          }}
        />
        <h2 style={{
          color: 'var(--text-primary, #f1f5f9)',
          fontSize: getFontSize(),
          fontWeight: '600',
          margin: '0 0 8px 0'
        }}>
          {message}
        </h2>
        <p style={{
          color: 'var(--text-muted, #64748b)',
          marginTop: '8px',
          fontSize: '14px'
        }}>
          <i className="fa-solid fa-spinner fa-spin"></i> {subMessage}
        </p>
      </div>
    </div>
  );
};

export default Loading;