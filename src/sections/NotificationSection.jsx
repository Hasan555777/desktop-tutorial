import React, { useState } from 'react';
import toast from 'react-hot-toast';

function NotificationSection({ onBack }) {
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);

  const togglePush = () => {
    setPush(!push);
    toast.success(`Push ${push ? 'Disabled' : 'Enabled'}`);
  };

  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-bell" style={{ marginRight: '10px', color: '#7c3aed' }}></i>
          Notifications
        </div>
      </div>

      <div className="section-content">
        <div className="detail-item" onClick={togglePush} style={{ cursor: 'pointer' }}>
          <i className="fas fa-bell"></i>
          <span className="detail-label">Push Notification</span>
          <span className="detail-value" style={{ color: push ? '#16a34a' : '#dc2626' }}>
            {push ? '✅ On' : '❌ Off'}
          </span>
        </div>

        <div className="detail-item" onClick={() => { setEmail(!email); toast.success(`Email ${email ? 'Disabled' : 'Enabled'}`); }} style={{ cursor: 'pointer' }}>
          <i className="fas fa-envelope"></i>
          <span className="detail-label">Email Notification</span>
          <span className="detail-value" style={{ color: email ? '#16a34a' : '#dc2626' }}>
            {email ? '✅ On' : '❌ Off'}
          </span>
        </div>

        <div className="detail-item" onClick={() => { setSms(!sms); toast.success(`SMS ${sms ? 'Disabled' : 'Enabled'}`); }} style={{ cursor: 'pointer' }}>
          <i className="fas fa-sms"></i>
          <span className="detail-label">SMS Notification</span>
          <span className="detail-value" style={{ color: sms ? '#16a34a' : '#dc2626' }}>
            {sms ? '✅ On' : '❌ Off'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default NotificationSection;