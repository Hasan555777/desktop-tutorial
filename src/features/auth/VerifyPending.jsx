// src/pages/VerifyPending.jsx

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import { useAccessControl } from './hooks/useAccessControl';
import styles from './VerifyPending.module.css';

const VerifyPending = () => {
  const navigate = useNavigate();
  const { logout, currentUser, loading } = useAuth();
  const { 
    statusMessage, 
    isRejected, 
    isBlocked,
    isFullyVerified,
    isPending,
    isComplete,
    accessLevel,
    accessLabel,
    needsVerification
  } = useAccessControl();

  // ── সব রিডাইরেক্ট useEffect-এর ভিতরে ──
  useEffect(() => {
    if (!loading) {
      if (!currentUser) {
        navigate('/login', { replace: true });
        return;
      }

      if (isFullyVerified) {
        navigate('/', { replace: true });
        return;
      }

      if (isBlocked) {
        navigate('/blocked', { replace: true });
        return;
      }

      if (isRejected) {
        navigate('/verify-rejected', { replace: true });
        return;
      }
    }
  }, [currentUser, loading, isFullyVerified, isBlocked, isRejected, navigate]);

  // ── রিডাইরেক্ট হবে এমন অবস্থায় null return ──
  if (!currentUser || isFullyVerified || isBlocked || isRejected) {
    return null;
  }

  // ── যদি statusMessage না থাকে ──
  if (!statusMessage) {
    return (
      <div className={styles.verifyPendingContainer}>
        <div className={styles.verifyCard}>
          <div className={`${styles.verifyIcon} ${styles.info}`}>ℹ️</div>
          <h2>লোড হচ্ছে...</h2>
          <p>দয়া করে অপেক্ষা করুন...</p>
        </div>
      </div>
    );
  }

  // ── আইকন নির্ধারণ ──
  const getIcon = () => {
    if (isBlocked) return '🚫';
    if (isRejected) return '❌';
    if (isPending) return '⏳';
    if (!isComplete) return '📝';
    if (isFullyVerified) return '✅';
    return 'ℹ️';
  };

  // ── টাইপ নির্ধারণ ──
  const getType = () => {
    if (isBlocked || isRejected) return 'error';
    if (isPending) return 'pending';
    if (!isComplete) return 'incomplete';
    if (isFullyVerified) return 'success';
    return 'info';
  };

  // ── টাইটেল নির্ধারণ ──
  const getTitle = () => {
    if (isBlocked) return '🚫 অ্যাকাউন্ট ব্লক করা হয়েছে';
    if (isRejected) return '❌ যাচাই প্রত্যাখ্যাত';
    if (isPending) return '⏳ যাচাই প্রক্রিয়াধীন';
    if (!isComplete) return '📝 প্রোফাইল সম্পূর্ণ করুন';
    if (isFullyVerified) return '✅ যাচাই সম্পন্ন!';
    return 'ℹ️ তথ্য';
  };

  // ── মেসেজ নির্ধারণ ──
  const getMessage = () => {
    if (isBlocked) {
      return 'আপনার অ্যাকাউন্ট অ্যাডমিন দ্বারা ব্লক করা হয়েছে। অনুগ্রহ করে সাপোর্ট টিমের সাথে যোগাযোগ করুন।';
    }
    if (isRejected) {
      return 'আপনার জমা দেওয়া ডকুমেন্ট যাচাই প্রত্যাখ্যাত হয়েছে। সঠিক ও স্পষ্ট ডকুমেন্ট পুনরায় আপলোড করুন।';
    }
    if (isPending) {
      return 'আপনার ডকুমেন্ট ১-২ ঘণ্টার মধ্যে পর্যালোচনা করা হবে। আপনি নোটিফিকেশন পাবেন।';
    }
    if (!isComplete) {
      return 'লেনদেন করার জন্য ';
    }
    if (isFullyVerified) {
      return 'আপনার অ্যাকাউন্ট সম্পূর্ণ যাচাই করা হয়েছে। এখন সব সুবিধা পাবেন।';
    }
    return 'দয়া করে অপেক্ষা করুন...';
  };

  // ── সাব-টেক্সট নির্ধারণ ──
  const getSubText = () => {
    if (isBlocked) {
      return 'আপনি কোনো লেনদেন করতে পারবেন না।';
    }
    if (isRejected) {
      return 'পুনরায় আপলোড করার আগে ডকুমেন্ট সঠিক কিনা যাচাই করে নিন।';
    }
    if (isPending) {
      return 'এ সময় আপনি শুধু ব্রাউজ করতে পারবেন।';
    }
    if (!isComplete) {
      return `বর্তমান প্রগ্রেস: ${statusMessage.progress || 0}% সম্পন্ন।`;
    }
    return '';
  };

  const type = getType();
  const icon = getIcon();
  const title = getTitle();
  const message = getMessage();
  const subText = getSubText();

  return (
    <div className={styles.verifyPendingContainer}>
      <div className={styles.verifyCard}>
        <div className={`${styles.verifyIcon} ${styles[type]}`}>
          {icon}
        </div>
        
        <h2>{title}</h2>
        <p className={styles.verifyMessage}>{message}</p>
        
        {subText && (
          <p className={styles.verifySubText}>{subText}</p>
        )}

        {/* ── অ্যাকশন বাটন ── */}
        <div className={styles.verifyActions}>
          {isBlocked && (
            <button 
              className={styles.btnSupport} 
              onClick={() => window.location.href = 'mailto:support@worktrustbd.com'}
            >
              📧 সাপোর্টে ইমেইল করুন
            </button>
          )}
          
          {isRejected && (
            <button 
              className={styles.btnRetry} 
              onClick={() => navigate('/settings')}
            >
              📄 পুনরায় ডকুমেন্ট আপলোড করুন
            </button>
          )}
          
          {!isComplete && !isBlocked && !isRejected && (
            <button 
              className={styles.btnContinue} 
              onClick={() => navigate('/settings')}
            >
              ⚙️ প্রোফাইল সম্পূর্ণ করুন
            </button>
          )}
          
          {isFullyVerified && (
            <button 
              className={styles.btnDashboard} 
              onClick={() => navigate('/')}
            >
              🏠 ড্যাশবোর্ডে যান
            </button>
          )}
        </div>

        {/* ── লগআউট বাটন ── */}
        <div className={styles.verifyFooter}>
          <button className={styles.btnLogout} onClick={logout}>
            🔓 লগ আউট করুন
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyPending;