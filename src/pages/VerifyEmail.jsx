// src/pages/VerifyEmail.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/firebase';
import { sendEmailVerification } from 'firebase/auth';
import toast from 'react-hot-toast';
import './VerifyEmail.css';

const VerifyEmail = () => {
  const navigate = useNavigate();
  const [resendLoading, setResendLoading] = useState(false);
  const [timer, setTimer] = useState(60);
  const [checking, setChecking] = useState(false);
  const [email, setEmail] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [checkCount, setCheckCount] = useState(0);

  // ✅ ইউজারের ইমেইল লোড করুন
  useEffect(() => {
    console.log("🔍 VerifyEmail mounted, checking auth state...");
    
    // চেক করুন ইউজার লগইন আছে কিনা
    const user = auth.currentUser;
    if (!user) {
      console.log("❌ No user logged in, redirecting to login...");
      toast.error('❌ দয়া করে লগইন করুন!');
      navigate('/login');
      return;
    }
    
    console.log("✅ User found:", user.email);
    setEmail(user.email || '');
    
    // ইমেইল ভেরিফাইড কিনা চেক
    if (user.emailVerified) {
      console.log("✅ Email already verified!");
      setIsVerified(true);
    }
  }, [navigate]);

  // ✅ টাইমার
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ✅ ১. ভেরিফিকেশন চেক (হাতের বাটন)
  const checkVerification = async () => {
    setChecking(true);
    console.log("🔍 Checking verification status...");
    
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('❌ ইউজার লগইন নেই!');
        navigate('/login');
        return;
      }
      
      // ইউজার রিলোড করুন (সর্বশেষ স্ট্যাটাস পেতে)
      await user.reload();
      console.log("📧 Email verified status:", user.emailVerified);
      
      if (user.emailVerified) {
        setIsVerified(true);
        toast.success('✅ ইমেইল ভেরিফাইড!');
        
        // Firestore-এ আপডেট করুন (ঐচ্ছিক)
        // await updateDoc(doc(db, 'users', user.uid), {
        //   emailVerified: true,
        //   isVerified: true
        // });
        
        setTimeout(() => navigate('/dashboard'), 800);
      } else {
        setCheckCount(prev => prev + 1);
        toast.warning(`⏳ ইমেইল এখনও ভেরিফাই হয়নি। (${checkCount + 1} বার চেক করা হয়েছে)`);
      }
      
    } catch (error) {
      console.error('Verification check error:', error);
      toast.error('❌ ভেরিফিকেশন চেক করতে ব্যর্থ: ' + error.message);
    } finally {
      setChecking(false);
    }
  };

  // ✅ ২. ভেরিফিকেশন ইমেইল পুনরায় পাঠান
  const handleResend = async () => {
    if (timer > 0) {
      toast.info(`⏳ ${timer} সেকেন্ড অপেক্ষা করুন`);
      return;
    }
    
    setResendLoading(true);
    console.log("📧 Resending verification email...");
    
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('❌ ইউজার লগইন নেই!');
        navigate('/login');
        return;
      }
      
      await sendEmailVerification(user);
      console.log("✅ Verification email sent!");
      toast.success('📧 নতুন ভেরিফিকেশন ইমেইল পাঠানো হয়েছে!');
      setTimer(60);
      
    } catch (error) {
      console.error('Resend error:', error);
      let errorMessage = '❌ ইমেইল পাঠাতে ব্যর্থ!';
      if (error.code === 'auth/too-many-requests') {
        errorMessage = '❌ অনেক বেশি রিকোয়েস্ট! ৫ মিনিট পর চেষ্টা করুন।';
      }
      toast.error(errorMessage);
    } finally {
      setResendLoading(false);
    }
  };

  // ✅ ৩. লগআউট
  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success('✅ লগআউট করা হয়েছে');
      navigate('/login');
    } catch (error) {
      toast.error('❌ লগআউট করতে ব্যর্থ: ' + error.message);
    }
  };

  // ✅ ৪. হোমে যান
  const goHome = () => {
    navigate('/');
  };

  // ✅ ৫. ড্যাশবোর্ডে যান (ভেরিফাইড হলে)
  const goDashboard = () => {
    navigate('/dashboard');
  };

  // ── যদি ইউজার না থাকে ──
  if (!auth.currentUser) {
    return (
      <div className="verify-email-container">
        <div className="verify-email-card">
          <div className="verify-icon">⚠️</div>
          <h2>আপনি লগইন নেই!</h2>
          <p>ইমেইল ভেরিফিকেশন করতে দয়া করে লগইন করুন।</p>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            🔑 লগইন করুন
          </button>
        </div>
      </div>
    );
  }

  // ── মেইন রেন্ডার ──
  return (
    <div className="verify-email-container">
      <div className="verify-email-card">
        
        {/* আইকন */}
        <div className="verify-icon">
          {isVerified ? '✅' : '📧'}
        </div>

        {/* টাইটেল */}
        <h2>
          {isVerified 
            ? 'ইমেইল ভেরিফাইড! 🎉' 
            : auth.currentUser?.emailVerified 
              ? 'ইমেইল ভেরিফাইড! 🎉' 
              : 'ইমেইল ভেরিফিকেশন প্রয়োজন'}
        </h2>

        {/* সাবটাইটেল */}
        <p>
          {isVerified || auth.currentUser?.emailVerified ? (
            'আপনার ইমেইল সফলভাবে ভেরিফাই হয়েছে। এখন আপনার অ্যাকাউন্ট সম্পূর্ণ সক্রিয়!'
          ) : (
            <>
              আপনার ইমেইলে একটি ভেরিফিকেশন লিংক পাঠানো হয়েছে।
              <br />
              <strong style={{ color: '#2563eb' }}>{email || 'আপনার ইমেইল'}</strong>
              <br />
              অ্যাকাউন্ট এক্টিভেট করতে ইমেইল চেক করুন।
            </>
          )}
        </p>

        {/* স্ট্যাটাস */}
        {!isVerified && !auth.currentUser?.emailVerified && (
          <div className="verify-status">
            <span className="status-dot"></span>
            <span>
              ভেরিফিকেশন অপেক্ষমাণ... 
              {timer > 0 && ` (${timer}s)`}
              {checkCount > 0 && ` | ${checkCount} বার চেক করা হয়েছে`}
            </span>
          </div>
        )}

        {/* অ্যাকশন বাটন */}
        <div className="verify-actions">
          
          {/* ✅ ভেরিফাইড হলে ড্যাশবোর্ড */}
          {(isVerified || auth.currentUser?.emailVerified) && (
            <>
              <button className="btn btn-success" onClick={goDashboard}>
                🚀 ড্যাশবোর্ডে যান
              </button>
              <button className="btn btn-ghost" onClick={goHome}>
                🏠 হোমে যান
              </button>
            </>
          )}

          {/* ⏳ ভেরিফাইড না হলে */}
          {!isVerified && !auth.currentUser?.emailVerified && (
            <>
              {/* চেক বাটন */}
              <button 
                className={`btn btn-primary ${checking ? 'loading' : ''}`}
                onClick={checkVerification}
                disabled={checking}
              >
                {checking ? (
                  <><span className="spinner"></span> চেক করা হচ্ছে...</>
                ) : (
                  <>🔄 ইমেইল ভেরিফাইড হয়েছে?</>
                )}
              </button>

              {/* রিসেন্ড বাটন */}
              <button 
                className={`btn btn-outline ${resendLoading ? 'loading' : ''}`}
                onClick={handleResend}
                disabled={timer > 0 || resendLoading}
              >
                {resendLoading ? (
                  <><span className="spinner"></span> পাঠানো হচ্ছে...</>
                ) : (
                  <>📨 পুনরায় পাঠান {timer > 0 ? `(${timer}s)` : ''}</>
                )}
              </button>

              {/* হোম + লগআউট */}
              <div className="verify-footer-actions">
                <button className="btn btn-ghost" onClick={goHome}>
                  🏠 হোমে যান
                </button>
                <button className="btn btn-ghost" onClick={handleLogout}>
                  🔓 লগআউট
                </button>
              </div>
            </>
          )}

        </div>

        {/* হেল্প টেক্সট */}
        {!isVerified && !auth.currentUser?.emailVerified && (
          <div className="verify-help">
            <p>
              💡 ইমেইল না পেলে <strong>স্প্যাম/জাঙ্ক</strong> ফোল্ডার চেক করুন।
              <br />
              <span className="help-note">
                ভেরিফিকেশন লিংকে ক্লিক করার পর এখানে ফিরে <strong>"ইমেইল ভেরিফাইড হয়েছে?"</strong> বাটনে ক্লিক করুন।
              </span>
            </p>
          </div>
        )}

        {/* ডিবাগ ইনফো (শুধু ডেভেলপমেন্টের জন্য) */}
        {process.env.NODE_ENV === 'development' && (
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            background: '#f1f5f9', 
            borderRadius: '8px',
            fontSize: '12px',
            color: '#475569',
            textAlign: 'left'
          }}>
            <strong>🔧 ডিবাগ:</strong>
            <br />
            User: {auth.currentUser?.email || 'None'}
            <br />
            Email Verified: {String(auth.currentUser?.emailVerified)}
            <br />
            isVerified State: {String(isVerified)}
            <br />
            Timer: {timer}s
            <br />
            Check Count: {checkCount}
          </div>
        )}

      </div>
    </div>
  );
};

export default VerifyEmail;