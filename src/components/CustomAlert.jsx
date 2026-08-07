// components/CustomAlert.jsx
import React, { useState, useEffect } from 'react';
import './CustomAlert.css';

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
    'top-left': 'alert-top-left',
    'top-center': 'alert-top-center',
    'top-right': 'alert-top-right',
    'bottom-left': 'alert-bottom-left',
    'bottom-center': 'alert-bottom-center',
    'bottom-right': 'alert-bottom-right',
  };

  return (
    <div className={`custom-alert ${positionClasses[position]} alert-${type}`}>
      <div className="alert-content">
        <span className="alert-icon">{icons[type]}</span>
        <span className="alert-message">{message}</span>
        <button className="alert-close" onClick={() => { setVisible(false); if (onClose) onClose(); }}>
          ✕
        </button>
      </div>
      <div className="alert-progress" style={{ 
        width: '100%', 
        height: '3px', 
        background: colors[type].border,
        animation: `progress ${duration}ms linear forwards`
      }} />
    </div>
  );
};

export default CustomAlert;