// src/components/ProfileProgress.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import './ProfileProgress.css';

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
      <div className="status-banner error">
        <div className="banner-icon">🚫</div>
        <div className="banner-content">
          <strong>🚫 অ্যাকাউন্ট ব্লক করা হয়েছে</strong>
          <p>আপনার অ্যাকাউন্ট অ্যাডমিন দ্বারা ব্লক করা হয়েছে।</p>
          <p className="sub-text">সাপোর্ট টিমের সাথে যোগাযোগ করুন: support@worktrustbd.com</p>
          <button 
            className="btn-support" 
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
      <div className="status-banner error">
        <div className="banner-icon">❌</div>
        <div className="banner-content">
          <strong>❌ যাচাই প্রত্যাখ্যাত</strong>
          <p>আপনার ডকুমেন্ট যাচাই প্রত্যাখ্যাত হয়েছে।</p>
          <p className="sub-text">সঠিক ও স্পষ্ট ডকুমেন্ট আপলোড করুন।</p>
          <button 
            className="btn-continue" 
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
    <div className="status-banner pending">
      <div className="banner-icon">⏳</div>
      <div className="banner-content">
        <strong>⏳ যাচাই প্রক্রিয়াধীন</strong>
      </div>
    </div>
  );
}

if (isVerified && isComplete) {
    return (
      <div className="status-banner success">
       
        <div className="banner-content">
          <strong>✅ প্রোফাইল যাচাই সম্পন্ন</strong>
        </div>
      </div>
    );
  }

  // ── ৫. অসম্পূর্ণ ──
  if (!isComplete) {
    const progress = completionScore || 0;
    
    // প্রগ্রেস স্টেপ নির্ধারণ
    const getStepStatus = (stepProgress) => {
      if (progress >= stepProgress) return 'done';
      if (progress >= stepProgress - 10) return 'active';
      return '';
    };
    
    return (
      <div className="profile-progress-wrapper">
        <div className="progress-header">
          <span className="progress-title">📊 প্রোফাইল সম্পন্ন</span>
          <span className="progress-percent">{progress}%</span>
        </div>
        
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
        
       
        
        <div className="progress-actions">
          <button 
            className="btn-continue" 
            onClick={() => navigate('/settings')}
          >
            ⚙️ সেটিংসে যান ও প্রোফাইল সম্পূর্ণ করুন →
          </button>
        </div>
      </div>
    );
  }

  // ── ৬. লোডিং ──
  return (
    <div className="status-banner info">
      <div className="banner-icon">ℹ️</div>
      <div className="banner-content">
        <strong>📊 প্রোফাইল লোড হচ্ছে...</strong>
        <p>দয়া করে অপেক্ষা করুন...</p>
      </div>
    </div>
  );
};

export default ProfileProgress;