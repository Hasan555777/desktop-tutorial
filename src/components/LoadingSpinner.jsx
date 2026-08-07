// src/components/LoadingSpinner.jsx

import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = () => {
  return (
    <div className="loading-container" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg-primary, #090d16)',
      color: 'var(--text-secondary, #94a3b8)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{
          fontSize: '48px',
          color: 'var(--accent-primary, #14b8a6)',
          marginBottom: '16px',
          display: 'block'
        }} />
        <p>Loading...</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;