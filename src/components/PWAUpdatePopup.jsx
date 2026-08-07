// src/components/PWAUpdatePopup.jsx

import React from 'react';
import usePWA from '@/hooks/usePWA';
import './PWAUpdatePopup.css';

const PWAUpdatePopup = () => {
  const { isUpdateAvailable, updateApp, dismissUpdate } = usePWA();

  if (!isUpdateAvailable) return null;

  return (
    <div className="pwa-update-overlay">
      <div className="pwa-update-popup">
        <div className="pwa-update-icon">🔄</div>
        <h3>Update Available</h3>
        <p>A new version of the app is available. Please update to continue.</p>
        <div className="pwa-update-actions">
          <button 
            className="pwa-update-btn"
            onClick={updateApp}
          >
            <i className="fa-solid fa-rotate"></i>
            Update Now
          </button>
          <button 
            className="pwa-update-later"
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