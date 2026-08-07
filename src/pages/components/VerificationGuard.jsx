// components/VerificationGuard.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const VerificationGuard = ({ children, requiredAction, fallback }) => {
  const { user, verificationStatus } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  const isVerified = verificationStatus === 'verified';
  const isPending = verificationStatus === 'pending';
  
  // লেনদেন, পোস্ট তৈরি, কাজ গ্রহণ - শুধু ভেরিফাইড
  const requiresVerification = [
    'create_post',
    'make_transaction',
    'accept_job',
    'post_job',
    'sell_service',
    'buy_service',
    'full_chat',
    'rate_user',
    'confirm_deal'
  ];
  
  if (requiresVerification.includes(requiredAction) && !isVerified) {
    return fallback || (
      <div className="verification-required">
        <h3>⚠️ আপনার অ্যাকাউন্ট যাচাই করা হয়নি</h3>
        <p>এই ফিচার ব্যবহার করতে অ্যাকাউন্ট যাচাই প্রয়োজন।</p>
        <button onClick={() => navigate('/profile?tab=documents')}>
          📤 যাচাই সম্পন্ন করুন
        </button>
      </div>
    );
  }
  
  return children;
};

export default VerificationGuard;