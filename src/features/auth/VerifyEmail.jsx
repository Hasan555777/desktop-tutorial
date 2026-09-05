// src/pages/VerifyEmail.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../shared/firebase/index';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../../shared/context/AuthContext';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { logError } from '../../shared/utils/logger';
import { checkEmailVerified } from '../../shared/utils/emailVerification';
import styles from './VerifyEmail.module.css';

const VerifyEmail = () => {
  const navigate = useNavigate();
  const feedback = useFeedback();
  // 🔧 FIX: this page used to read `auth.currentUser` directly and
  // synchronously on mount. Firebase Auth restores a persisted session
  // asynchronously (it reads from IndexedDB), so on a hard refresh
  // `auth.currentUser` can still be `null` for a brief moment even for a
  // genuinely logged-in user — that was kicking legitimately-signed-in
  // people back to /login. `useAuth()` gives us the app's single,
  // already-synchronized `loading`/`currentUser` pair (AuthContext's
  // onAuthStateChanged listener), so this page now waits for the same
  // "Firebase Auth has finished initializing" signal every other guarded
  // page in the app already waits for, instead of keeping its own
  // separate, initialization-unaware copy of that logic.
  const { currentUser, loading: authLoading } = useAuth();

  const [resendLoading, setResendLoading] = useState(false);
  const [timer, setTimer] = useState(60);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null); // { type: 'network' | 'unexpected', message }
  const [email, setEmail] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  // Tracks the very first, mount-time "is this actually verified already"
  // check, kept separate from `checking` (the manual button state) so the
  // UI can show a plain loading spinner instead of any error copy while
  // Firebase Auth is still starting up / the initial reload is in flight.
  const [initializing, setInitializing] = useState(true);

  // ✅ ইউজারের ইমেইল লোড করুন + সত্যিকারের emailVerified স্ট্যাটাস আনুন
  useEffect(() => {
    // Auth is still initializing (page refresh, first load, etc.) — wait,
    // don't guess. Reading state before this resolves is exactly what
    // caused false "not verified" / false "please log in" flashes before.
    if (authLoading) return;

    if (!currentUser) {
      feedback.alert.error({ title: '❌ দয়া করে লগইন করুন!' });
      navigate('/login', { replace: true });
      return;
    }

    setEmail(currentUser.email || '');

    let cancelled = false;

    // 🔧 FIX: don't trust the cached `emailVerified` on mount — e.g. the
    // person may have just clicked the verification link in another tab
    // and immediately switched back here (the "immediate navigation after
    // verification" case). Force one real reload so the very first thing
    // shown is accurate, not stale.
    (async () => {
      try {
        const verified = await checkEmailVerified(currentUser);
        if (cancelled) return;
        if (verified) setIsVerified(true);
      } catch (error) {
        // Non-fatal: fall back to whatever cached value we already have
        // and let the person use the manual check/resend buttons.
        logError('Initial emailVerified reload failed', error);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser, navigate]);

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
    setCheckError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        feedback.alert.error({ title: '❌ ইউজার লগইন নেই!' });
        navigate('/login', { replace: true });
        return;
      }

      await user.reload();

      if (auth.currentUser?.emailVerified) {
        setIsVerified(true);
        feedback.alert.success({ title: '✅ ইমেইল ভেরিফাইড!' });
        setTimeout(() => navigate('/dashboard'), 800);
      } else {
        // 🔧 FIX: this is a genuine, confirmed "not verified yet" result —
        // straight from a fresh reload, not a guess — so it's fine to say
        // so plainly. It is NOT the same thing as a network/unexpected
        // error below, so it never goes through the generic error path.
        setCheckCount(prev => prev + 1);
        feedback.alert.warning({ title: `⏳ ইমেইল এখনও ভেরিফাই হয়নি। (${checkCount + 1} বার চেক করা হয়েছে)` });
      }
    } catch (error) {
      logError('Verification check error', error);

      // 🔧 FIX: separate "we couldn't even ask Firebase" (network) from
      // "something we didn't expect happened" (unexpected) — neither of
      // these means the account is unverified, so neither should show the
      // "please verify your email" copy, and a normal network hiccup
      // shouldn't be dressed up as a scary generic error either.
      if (error.code === 'auth/network-request-failed') {
        setCheckError({
          type: 'network',
          message: '⚠️ নেটওয়ার্ক সমস্যা হয়েছে। ইন্টারনেট চেক করে আবার চেষ্টা করুন।',
        });
      } else {
        setCheckError({
          type: 'unexpected',
          message: '❌ চেক করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
        });
      }
    } finally {
      setChecking(false);
    }
  };

  // ✅ ২. ভেরিফিকেশন ইমেইল পুনরায় পাঠান
  const handleResend = async () => {
    if (timer > 0) {
      feedback.alert.info({ title: `⏳ ${timer} সেকেন্ড অপেক্ষা করুন` });
      return;
    }
    
    setResendLoading(true);
    console.log("📧 Resending verification email...");
    
    try {
      const user = auth.currentUser;
      if (!user) {
        feedback.alert.error({ title: '❌ ইউজার লগইন নেই!' });
        navigate('/login', { replace: true });
        return;
      }
      
      await sendEmailVerification(user);
      console.log("✅ Verification email sent!");
      feedback.alert.success({ title: '📧 নতুন ভেরিফিকেশন ইমেইল পাঠানো হয়েছে!' });
      setTimer(60);
      
    } catch (error) {
      console.error('Resend error:', error);
      let errorMessage = '❌ ইমেইল পাঠাতে ব্যর্থ!';
      if (error.code === 'auth/too-many-requests') {
        errorMessage = '❌ অনেক বেশি রিকোয়েস্ট! ৫ মিনিট পর চেষ্টা করুন।';
      }
      feedback.alert.error({ title: errorMessage });
    } finally {
      setResendLoading(false);
    }
  };

  // ✅ ৩. লগআউট
  const handleLogout = async () => {
    try {
      await auth.signOut();
      feedback.alert.success({ title: '✅ লগআউট করা হয়েছে' });
      navigate('/login', { replace: true });
    } catch (error) {
      feedback.alert.error({ title: '❌ লগআউট করতে ব্যর্থ: ' + error.message });
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

  // ── Firebase Auth এখনও ইনিশিয়ালাইজ হচ্ছে, বা প্রথম reload চলছে ──
  // 🔧 FIX: this is the "loading" case — genuinely unknown yet, not an
  // error and not "unverified". It gets its own quiet spinner instead of
  // falling through to the "not logged in" card or any error copy.
  if (authLoading || initializing) {
    return (
      <div className={styles.verifyEmailContainer}>
        <div className={styles.verifyEmailCard}>
          <div className={styles.verifyIcon}>⏳</div>
          <p>লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  // ── যদি ইউজার না থাকে (Firebase Auth ইনিশিয়ালাইজেশন শেষ হয়েছে, তাও কোনো ইউজার নেই) ──
  if (!currentUser) {
    return (
      <div className={styles.verifyEmailContainer}>
        <div className={styles.verifyEmailCard}>
          <div className={styles.verifyIcon}>⚠️</div>
          <h2>আপনি লগইন নেই!</h2>
          <p>ইমেইল ভেরিফিকেশন করতে দয়া করে লগইন করুন।</p>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => navigate('/login')}>
            🔑 লগইন করুন
          </button>
        </div>
      </div>
    );
  }

  // ── মেইন রেন্ডার ──
  return (
    <div className={styles.verifyEmailContainer}>
      <div className={styles.verifyEmailCard}>
        
        {/* আইকন */}
        <div className={styles.verifyIcon}>
          {isVerified ? '✅' : '📧'}
        </div>

        {/* টাইটেল */}
        <h2>
          {isVerified 
            ? 'ইমেইল ভেরিফাইড! 🎉' 
            : 'ইমেইল ভেরিফিকেশন প্রয়োজন'}
        </h2>

        {/* সাবটাইটেল */}
        <p>
          {isVerified ? (
            'আপনার ইমেইল সফলভাবে ভেরিফাই হয়েছে। এখন আপনার অ্যাকাউন্ট সম্পূর্ণ সক্রিয়!'
          ) : (
            <>
              আপনার ইমেইলে একটি ভেরিফিকেশন লিংক পাঠানো হয়েছে।
              <br />
              <strong className={styles.emailHighlight}>{email || 'আপনার ইমেইল'}</strong>
              <br />
              অ্যাকাউন্ট এক্টিভেট করতে ইমেইল চেক করুন।
            </>
          )}
        </p>

        {/* স্ট্যাটাস */}
        {!isVerified && (
          <div className={styles.verifyStatus}>
            <span className={styles.statusDot}></span>
            <span>
              ভেরিফিকেশন অপেক্ষমাণ... 
              {timer > 0 && ` (${timer}s)`}
              {checkCount > 0 && ` | ${checkCount} বার চেক করা হয়েছে`}
            </span>
          </div>
        )}

        {/* 🔧 FIX: network/unexpected check errors get their own distinct
            banner, separate from the normal "still waiting" status above —
            neither one claims the account is unverified. */}
        {!isVerified && checkError && (
          <div className={styles.verifyStatus} role="alert">
            <span>{checkError.message}</span>
          </div>
        )}

        {/* অ্যাকশন বাটন */}
        <div className={styles.verifyActions}>
          
          {/* ✅ ভেরিফাইড হলে ড্যাশবোর্ড */}
          {(isVerified) && (
            <>
              <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={goDashboard}>
                🚀 ড্যাশবোর্ডে যান
              </button>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={goHome}>
                🏠 হোমে যান
              </button>
            </>
          )}

          {/* ⏳ ভেরিফাইড না হলে */}
          {!isVerified && (
            <>
              {/* চেক বাটন */}
              <button 
                className={`${styles.btn} ${styles.btnPrimary} ${checking ? styles.loading : ''}`}
                onClick={checkVerification}
                disabled={checking}
              >
                {checking ? (
                  <><span className={styles.spinner}></span> চেক করা হচ্ছে...</>
                ) : (
                  <>🔄 ইমেইল ভেরিফাইড হয়েছে?</>
                )}
              </button>

              {/* রিসেন্ড বাটন */}
              <button 
                className={`${styles.btn} ${styles.btnOutline} ${resendLoading ? styles.loading : ''}`}
                onClick={handleResend}
                disabled={timer > 0 || resendLoading}
              >
                {resendLoading ? (
                  <><span className={styles.spinner}></span> পাঠানো হচ্ছে...</>
                ) : (
                  <>📨 পুনরায় পাঠান {timer > 0 ? `(${timer}s)` : ''}</>
                )}
              </button>

              {/* হোম + লগআউট */}
              <div className={styles.verifyFooterActions}>
                <button className={`${styles.btn} ${styles.btnGhost}`} onClick={goHome}>
                  🏠 হোমে যান
                </button>
                <button className={`${styles.btn} ${styles.btnGhost}`} onClick={handleLogout}>
                  🔓 লগআউট
                </button>
              </div>
            </>
          )}

        </div>

        {/* হেল্প টেক্সট */}
        {!isVerified && (
          <div className={styles.verifyHelp}>
            <p>
              💡 ইমেইল না পেলে <strong>স্প্যাম/জাঙ্ক</strong> ফোল্ডার চেক করুন।
              <br />
              <span className={styles.helpNote}>
                ভেরিফিকেশন লিংকে ক্লিক করার পর এখানে ফিরে <strong>"ইমেইল ভেরিফাইড হয়েছে?"</strong> বাটনে ক্লিক করুন।
              </span>
            </p>
          </div>
        )}

        {/* ডিবাগ ইনফো (শুধু ডেভেলপমেন্টের জন্য) */}
        {process.env.NODE_ENV === 'development' && (
          <div className={styles.debugInfo}>
            <strong> ডিবাগ:</strong>
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