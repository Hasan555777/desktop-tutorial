// components/CustomAlert.jsx

import React, { useState, useEffect } from 'react';
import styles from './CustomAlert.module.css';

const CustomAlert = ({ 
  type = 'info', // 'success', 'error', 'warning', 'info'
  message,
  duration = 3000,
  onClose,
  position = 'top-center', // 'top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  const colors = {
    success: { bg: '#10b981', border: '#059669' },
    error: { bg: '#ef4444', border: '#dc2626' },
    warning: { bg: '#f59e0b', border: '#d97706' },
    info: { bg: '#3b82f6', border: '#2563eb' },
  };

  const positionClasses = {
    'top-left': styles.alertTopLeft,
    'top-center': styles.alertTopCenter,
    'top-right': styles.alertTopRight,
    'bottom-left': styles.alertBottomLeft,
    'bottom-center': styles.alertBottomCenter,
    'bottom-right': styles.alertBottomRight,
  };

  return (
    <div className={`${styles.customAlert} ${positionClasses[position]} ${styles[`alert${type.charAt(0).toUpperCase() + type.slice(1)}`]}`}>
      <div className={styles.alertContent}>
        <span className={styles.alertIcon}>{icons[type]}</span>
        <span className={styles.alertMessage}>{message}</span>
        <button className={styles.alertClose} onClick={() => { setVisible(false); if (onClose) onClose(); }}>
          ✕
        </button>
      </div>
      <div 
        className={styles.alertProgress} 
        style={{ 
          background: colors[type].border,
          animationDuration: `${duration}ms`
        }} 
      />
    </div>
  );
};

export default CustomAlert;