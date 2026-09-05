// src/pages/Admin/components/Loading.jsx

import React from 'react';
import styles from './Loading.module.css';

// ============================================================
// 🎯 LOADING COMPONENT
// ============================================================

const Loading = ({ message = 'Loading Dashboard...', subMessage = 'Preparing your admin panel...' }) => {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingContent}>
        <i className={`fa-solid fa-cube ${styles.loadingIcon}`} />
        <h2>{message}</h2>
        <p>
          <i className="fa-solid fa-spinner fa-spin"></i> {subMessage}
        </p>
      </div>
    </div>
  );
};

export default Loading;