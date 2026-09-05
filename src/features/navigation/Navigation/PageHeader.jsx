// src/components/Navigation/PageHeader.jsx

import React from 'react';
import BackButton from './BackButton';
import styles from './Header.module.css';

const PageHeader = ({
  title,
  subtitle = '',
  icon = null,
  left = null,
  center = null,
  right = null,
  backButton = false,
  backFallback = '/',
  onBack = null,
  className = '',
  size = 'md',
  sticky = false,
  border = true,
  transparent = false,
  height = 'auto'
}) => {
  // Default left: BackButton if backButton true
  const leftContent = left || (backButton && (
    <BackButton
      fallback={backFallback}
      onClick={onBack}
      size={size}
    />
  ));

  return (
    <div
      className={`${styles.pageHeader} ${sticky ? styles.sticky : ''} ${border ? styles.border : ''} ${transparent ? styles.transparent : ''} ${className}`}
      style={{
        position: sticky ? 'sticky' : 'relative',
        top: sticky ? 0 : 'auto',
        zIndex: sticky ? 100 : 'auto',
        height: height !== 'auto' ? height : 'auto',
      }}
    >
      <div className={styles.pageHeaderLeft}>
        {leftContent}
        <div className={styles.pageHeaderInfo}>
          {icon && <i className={`${styles.pageHeaderIcon} ${icon}`}></i>}
          <h1 className={styles.pageHeaderTitle}>{title}</h1>
          {subtitle && <p className={styles.pageHeaderSubtitle}>{subtitle}</p>}
        </div>
      </div>
      
      {center && (
        <div className={styles.pageHeaderCenter}>
          {center}
        </div>
      )}
      
      {right && (
        <div className={styles.pageHeaderRight}>
          {right}
        </div>
      )}
    </div>
  );
};

export default PageHeader;