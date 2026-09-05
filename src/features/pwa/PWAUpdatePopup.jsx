// src/components/PWAUpdatePopup.jsx

import React from 'react';
import usePWA from './hooks/usePWA';
import styles from './PWAUpdatePopup.module.css';

const PWAUpdatePopup = () => {
  const { isUpdateAvailable, updateApp, dismissUpdate } = usePWA();

  if (!isUpdateAvailable) return null;

  return (
    <div className={styles.pwaUpdateOverlay}>
      <div className={styles.pwaUpdatePopup}>
        <div className={styles.pwaUpdateIcon}>🔄</div>
        <h3>Update Available</h3>
        <p>A new version of the app is available. Please update to continue.</p>
        <div className={styles.pwaUpdateActions}>
          <button 
            className={styles.pwaUpdateBtn}
            onClick={updateApp}
          >
            <i className="fa-solid fa-rotate"></i>
            Update Now
          </button>
          <button 
            className={styles.pwaUpdateLater}
            onClick={dismissUpdate}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAUpdatePopup;