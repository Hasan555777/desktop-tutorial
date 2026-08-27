// src/components/ProfileProgress.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import styles from './ProfileProgress.module.css';

const ProfileProgress = () => {
  const navigate = useNavigate();
  const { 
    userData,
    isVerified,
    isComplete,
    isPending,
    isRejected,
    isBlocked,
    accessLevel,
    accessLabel,
    canTransact,
    canSendOffer,
    canCreatePost,
    needsVerification,
    isFullyVerified,
    completionScore = 0
  } = useAuth();

  // ── ১. ব্লকড ──
  if (isBlocked) {
    return (
      <div className={`${styles.statusBanner} ${styles.error}`}>
        <div className={styles.bannerIcon}>🚫</div>
        <div className={styles.bannerContent}>
          <strong>🚫 অ্যাকাউন্ট ব্লক করা হয়েছে</strong>
          <p>আপনার অ্যাকাউন্ট অ্যাডমিন দ্বারা ব্লক করা হয়েছে।</p>
          <p className={styles.subText}>সাপোর্ট টিমের সাথে যোগাযোগ করুন: support@worktrustbd.com</p>
          <button 
            className={styles.btnSupport} 
            onClick={() => window.location.href = 'mailto:support@worktrustbd.com'}
          >
            📧 সাপোর্টে ইমেইল করুন
          </button>
        </div>
      </div>
    );
  }

  // ── ২. রিজেক্টেড ──
  if (isRejected) {
    return (
      <div className={`${styles.statusBanner} ${styles.error}`}>
        <div className={styles.bannerIcon}>❌</div>
        <div className={styles.bannerContent}>
          <strong>❌ যাচাই প্রত্যাখ্যাত</strong>
          <p>আপনার ডকুমেন্ট যাচাই প্রত্যাখ্যাত হয়েছে।</p>
          <p className={styles.subText}>সঠিক ও স্পষ্ট ডকুমেন্ট আপলোড করুন।</p>
          <button 
            className={styles.btnContinue} 
            onClick={() => navigate('/settings')}
          >
            📄 পুনরায় ডকুমেন্ট আপলোড করুন
          </button>
        </div>
      </div>
    );
  }

  // ── ৪. পেন্ডিং ──
  if (isPending) {
    return (
      <div className={`${styles.statusBanner} ${styles.pending}`}>
        <div className={styles.bannerIcon}>⏳</div>
        <div className={styles.bannerContent}>
          <strong>⏳ যাচাই প্রক্রিয়াধীন</strong>
        </div>
      </div>
    );
  }

  if (isVerified && isComplete) {
    return (
      <div className={`${styles.statusBanner} ${styles.success}`}>
        <div className={styles.bannerContent}>
          <strong>✅ প্রোফাইল যাচাই সম্পন্ন</strong>
        </div>
      </div>
    );
  }

  // ── ৫. অসম্পূর্ণ ──
  if (!isComplete) {
    const progress = completionScore || 0;
    
    return (
      <div className={styles.profileProgressWrapper}>
        <div className={styles.progressAction}>
          ডকুমেন্ট আপলোড করে প্রোফাইল সম্পূর্ণ করুন
        </div>
      </div>
    );
  }

  // ── ৬. লোডিং ──
  return (
    <div className={`${styles.statusBanner} ${styles.info}`}>
      <div className={styles.bannerIcon}>ℹ️</div>
      <div className={styles.bannerContent}>
        <strong>📊 প্রোফাইল লোড হচ্ছে...</strong>
        <p>দয়া করে অপেক্ষা করুন...</p>
      </div>
    </div>
  );
};

export default ProfileProgress;