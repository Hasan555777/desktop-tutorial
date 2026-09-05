//src\pages\components\VerificationGuard.jsx
//
// FIX (এই পাসে): AuthContext.jsx-এর `value` অবজেক্টে `user` নামে কিছু
// এক্সপোজ করা হয় না — শুধু `currentUser`। আগে এখানে `const { user } =
// useAuth()` করা হতো, যেটা সবসময় `undefined` হতো, ফলে `!user` সবসময়
// true হয়ে **প্রতিটা লগইন-করা ইউজারকেও** /login-এ রিডাইরেক্ট করে দিত —
// verification gate ব্যবহার করা যেকোনো অ্যাকশন (create_post,
// make_transaction, confirm_deal ইত্যাদি) কার্যত কাজ করত না।
//
// FIX (আগের পাসে): navigate() আগে import/define ছাড়াই ব্যবহৃত হচ্ছিল।
import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../shared/context/AuthContext';
import styles from './VerificationGuard.module.css';

const VerificationGuard = ({ children, requiredAction, fallback }) => {
  const { currentUser, verificationStatus } = useAuth(); // ✅ user → currentUser
  const navigate = useNavigate();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  const isVerified = verificationStatus === 'verified';

  // লেনদেন, পোস্ট তৈরি, কাজ গ্রহণ — শুধু ভেরিফাইড ইউজার
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
      <div className={styles.verificationRequired}>
        <h3>⚠️ আপনার অ্যাকাউন্ট যাচাই করা হয়নি</h3>
        <p>এই ফিচার ব্যবহার করতে অ্যাকাউন্ট যাচাই প্রয়োজন।</p>
        <button 
          className={styles.verifyBtn}
          onClick={() => navigate('/profile?tab=documents')}
        >
          📤 যাচাই সম্পন্ন করুন
        </button>
      </div>
    );
  }

  return children;
};

export default VerificationGuard;