// src/pages/VerifyRejected.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import './VerifyPending.css';

const VerifyRejected = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="verify-pending-container">
      <div className="verify-card">
        <div className="verify-icon error">❌</div>
        <h2>যাচাই প্রত্যাখ্যাত</h2>
        <p>আপনার ডকুমেন্ট যাচাই প্রত্যাখ্যাত হয়েছে।</p>
        <p className="verify-sub-text">সঠিক ও স্পষ্ট ডকুমেন্ট পুনরায় আপলোড করুন।</p>
        
        <div className="verify-actions">
          <button className="btn-retry" onClick={() => navigate('/settings')}>
            📄 পুনরায় ডকুমেন্ট আপলোড করুন
          </button>
        </div>
        
        <div className="verify-footer">
          <button className="btn-logout" onClick={logout}>🔓 লগ আউট করুন</button>
        </div>
      </div>
    </div>
  );
};

export default VerifyRejected;