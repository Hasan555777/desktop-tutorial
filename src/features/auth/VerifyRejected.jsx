// src/pages/VerifyRejected.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import styles from './VerifyRejected.module.css';

const VerifyRejected = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className={styles.verifyPendingContainer}>
      <div className={styles.verifyCard}>
        <div className={`${styles.verifyIcon} ${styles.error}`}>❌</div>
        <h2>যাচাই প্রত্যাখ্যাত</h2>
        <p>আপনার ডকুমেন্ট যাচাই প্রত্যাখ্যাত হয়েছে।</p>
        <p className={styles.verifySubText}>সঠিক ও স্পষ্ট ডকুমেন্ট পুনরায় আপলোড করুন।</p>
        
        <div className={styles.verifyActions}>
          <button className={styles.btnRetry} onClick={() => navigate('/settings')}>
            📄 পুনরায় ডকুমেন্ট আপলোড করুন
          </button>
        </div>
        
        <div className={styles.verifyFooter}>
          <button className={styles.btnLogout} onClick={logout}>🔓 লগ আউট করুন</button>
        </div>
      </div>
    </div>
  );
};

export default VerifyRejected;