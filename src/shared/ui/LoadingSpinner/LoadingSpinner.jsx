// src/components/LoadingSpinner.jsx

import React from 'react';
import styles from './LoadingSpinner.module.css';

const LoadingSpinner = () => {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingContent}>
        <i className={`fa-solid fa-spinner fa-spin ${styles.loadingIcon}`} />
        <p className={styles.loadingText}>Loading...</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;