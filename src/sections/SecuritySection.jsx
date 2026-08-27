import React, { useState } from 'react';
import toast from 'react-hot-toast';
import '../styles/profile.css';

function SecuritySection({ onBack }) {
  const [twoFA, setTwoFA] = useState(true);

  const toggle2FA = () => {
    setTwoFA(!twoFA);
    toast.success(`2FA ${twoFA ? 'Disabled' : 'Enabled'}`);
  };

  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-lock" style={{ marginRight: '10px', color: '#b91c1c' }}></i>
          Security
        </div>
      </div>

      <div className="section-content">
        <div className="detail-item" onClick={toggle2FA} style={{ cursor: 'pointer' }}>
          <i className="fas fa-mobile-alt"></i>
          <span className="detail-label">Two Factor Authentication</span>
          <span className="detail-value" style={{ color: twoFA ? '#16a34a' : '#dc2626' }}>
            {twoFA ? '✅ Enabled' : '❌ Disabled'}
          </span>
        </div>

        <div className="detail-item">
          <i className="fas fa-laptop"></i>
          <span className="detail-label">Login Devices</span>
          <span className="detail-value">3 active</span>
        </div>

        <div className="detail-item">
          <i className="fas fa-user-secret"></i>
          <span className="detail-label">Privacy</span>
          <span className="detail-value">Public</span>
        </div>

        <div className="detail-item">
          <i className="fas fa-ban"></i>
          <span className="detail-label">Blocked Users</span>
          <span className="detail-value">3</span>
        </div>
      </div>
    </div>
  );
}

export default SecuritySection;