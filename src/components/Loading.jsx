// src/components/Loading.jsx

import React from 'react';
import styles from './Loading.module.css';

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

  const getIconSizeClass = () => {
    switch (size) {
      case 'small': return styles.iconSmall;
      case 'large': return styles.iconLarge;
      default: return styles.iconDefault;
    }
  };

  const getFontSizeClass = () => {
    switch (size) {
      case 'small': return styles.textSmall;
      case 'large': return styles.textLarge;
      default: return styles.textDefault;
    }
  };

  return (
    <div 
      className={`${styles.loadingContainer} ${fullScreen ? styles.fullScreen : ''}`}
      style={{
        minHeight: fullScreen ? '100vh' : minHeight,
      }}
    >
      <div className={styles.loadingContent}>
        <i 
          className={`${icon} fa-spin ${styles.loadingIcon} ${getIconSizeClass()}`}
        />
        <h2 className={`${styles.loadingMessage} ${getFontSizeClass()}`}>
          {message}
        </h2>
        <p className={styles.loadingSubMessage}>
          <i className="fa-solid fa-spinner fa-spin"></i> {subMessage}
        </p>
      </div>
    </div>
  );
};

export default Loading;