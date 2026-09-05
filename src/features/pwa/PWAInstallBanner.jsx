// src/components/PWAInstallBanner.jsx

import React, { useState } from 'react';
import usePWA from './hooks/usePWA';
import styles from './PWAInstallBanner.module.css';

const PWAInstallBanner = () => {
  const { isInstallable, isInstalled, isStandalone, isIOS, installApp } = usePWA();
  const [isDismissed, setIsDismissed] = useState(false);

  // ✅ Don't show if already installed, dismissed, or not installable
  if (isInstalled || isStandalone || isDismissed || !isInstallable) {
    return null;
  }

  return (
    <div className={styles.pwaInstallBanner}>
      <div className={styles.pwaInstallContent}>
        <div className={styles.pwaInstallIcon}>
          <span>📱</span>
        </div>
        <div className={styles.pwaInstallText}>
          <h4>
            Install <span className={styles.workTrustbd}>WorkTrustbd</span> App
          </h4>
          <p>Get a faster, offline-ready experience</p>
        </div>
        <div className={styles.pwaInstallActions}>
          <button 
            className={styles.pwaInstallBtn}
            onClick={installApp}
          >
            <i className="fa-solid fa-download"></i>
            Install
          </button>
          <button 
            className={styles.pwaInstallDismiss}
            onClick={() => setIsDismissed(true)}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallBanner;