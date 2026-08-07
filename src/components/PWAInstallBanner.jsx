// src/components/PWAInstallBanner.jsx

import React, { useState } from 'react';
import usePWA from '@/hooks/usePWA';
import './PWAInstallBanner.css';

const PWAInstallBanner = () => {
  const { isInstallable, isInstalled, isStandalone, isIOS, installApp } = usePWA();
  const [isDismissed, setIsDismissed] = useState(false);

  // ✅ Don't show if already installed, dismissed, or not installable
  if (isInstalled || isStandalone || isDismissed || !isInstallable) {
    return null;
  }

  return (
    <div className="pwa-install-banner">
      <div className="pwa-install-content">
        <div className="pwa-install-icon">
          <span>📱</span>
        </div>
        <div className="pwa-install-text">
          <h4>Install <WorkTrustbd>WorkTrustbd</WorkTrustbd> App</h4>
          <p>Get a faster, offline-ready experience</p>
        </div>
        <div className="pwa-install-actions">
          <button 
            className="pwa-install-btn"
            onClick={installApp}
          >
            <i className="fa-solid fa-download"></i>
            Install
          </button>
          <button 
            className="pwa-install-dismiss"
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