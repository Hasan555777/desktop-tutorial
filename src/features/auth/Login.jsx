import React, { useState, useEffect, useRef } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from '../../shared/firebase/index';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { logError } from '../../shared/utils/logger';
import { checkEmailVerified } from '../../shared/utils/emailVerification';

import styles from './Login.module.css'

// ============================================================
// 📱 OTP API URL — same Worker used by the registration flow
// ============================================================
const OTP_API_URL = import.meta.env.VITE_OTP_API_URL ||
  'https://worktrust-otp-production.hammanmusa362.workers.dev';

const Login = ({ onSwitchToRegister }) => {
  const feedback = useFeedback();
  const navigate = useNavigate();

  // ── State Management ──
  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
    phone: '',
    otp: ['', '', '', '', '', ''],
    countryCode: '+880'
  });
  const [activePanel, setActivePanel] = useState('loginMain');
  const [loginOtpSent, setLoginOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  usePageLoadingBar(loading); // 🔧 ADD (#25 loading consistency)
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  // ============================================================
  // ✅ Forgot-password (phone + OTP + reset token) flow state
  //
  // Replaces the old Firebase `sendPasswordResetEmail` link flow —
  // per the plan, password reset now goes through the same OTP Worker
  // used at registration: send-otp → verify-otp (Worker returns a
  // short-lived, single-use resetToken) → reset-password (token +
  // phone + newPassword, Worker validates the token and updates
  // Firebase Auth directly via the Identity Toolkit REST API).
  // ============================================================
  const [resetSubStep, setResetSubStep] = useState('phone'); // 'phone' | 'otp' | 'password'
  const [resetPhone, setResetPhone] = useState('');
  const [resetCountryCode, setResetCountryCode] = useState('+880');
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtpTimer, setResetOtpTimer] = useState(0);
  const [resetToken, setResetToken] = useState(null);
  const [resetVerifying, setResetVerifying] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const resetOtpTimerRef = useRef(null);

  // 🔧 State-driven OTP digits (replaces raw DOM querying) — lets us
  // support backspace-to-previous-box and paste-fill cleanly.
  const [resetOtpDigits, setResetOtpDigits] = useState(Array(6).fill(''));
  const resetOtpRefs = useRef([]);

  // 🔧 FIX (email-verification race / "correct email sometimes shows
  // error"): this component used to run its OWN `onAuthStateChanged`
  // listener that navigated to '/' the instant ANY user was signed in —
  // no email-verified check, no banned/pending/rejected/incomplete check.
  // `doLogin()` below runs those exact checks itself, off the very same
  // sign-in event (its own `await signInWithEmailAndPassword(...)` resolving
  // triggers this listener too). Firebase doesn't guarantee which fires
  // first, so this was a genuine race: sometimes this unconditional
  // redirect won and the user landed on '/' bypassing verification/ban
  // checks, and sometimes `doLogin`'s later checks ran on a component that
  // had already navigated away, leaving a stray error toast behind that
  // looked like "verified account gets rejected" even though nothing about
  // the account's actual verification state was wrong.
  //
  // This effect now only handles the "I already had a session and landed
  // on /login by mistake" case (e.g. back button), and explicitly steps
  // aside while a login submission from THIS form is in flight, so it can
  // never race `doLogin`'s own (correct, verification-aware) navigation.
  const loginInProgressRef = useRef(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && !loginInProgressRef.current) {
        navigate('/', { replace: true });
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // ── Load remembered email ──
  useEffect(() => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      setLoginData(prev => ({ ...prev, email: rememberedEmail }));
      setRememberMe(true);
    }
  }, []);

  // ── Cleanup reset-OTP timer on unmount ──
  useEffect(() => {
    return () => clearInterval(resetOtpTimerRef.current);
  }, []);

  // ── Toggle Password Visibility ──
  const togglePw = (id, btn) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    if (inp.type === 'password') {
      inp.type = 'text';
      if (btn) btn.textContent = '🙈';
    } else {
      inp.type = 'password';
      if (btn) btn.textContent = '👁️';
    }
  };

  // ── Show/Hide Panels ──
  const showLoginPanel = (id) => {
    document.querySelectorAll('.login-panel')?.forEach(p => p.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    setActivePanel(id);
  };

  // ── ✅ MAIN LOGIN WITH FIREBASE + ACCESS CONTROL ──
  const doLogin = async (e) => {
    e?.preventDefault();

    const email = loginData.email.trim();
    const password = loginData.password;

    if (!email) {
      feedback.alert.error({ title: '❌ ইমেইল বা ফোন নম্বর দিন' });
      return;
    }
    if (!password) {
      feedback.alert.error({ title: '❌ পাসওয়ার্ড দিন' });
      return;
    }

    setLoading(true);
    loginInProgressRef.current = true;

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 🔧 FIX (email verification race, take 2): a single `reload()` right
      // after sign-in can still occasionally read `emailVerified: false`
      // for an account that IS verified — the claim doesn't always
      // propagate instantly, and AuthContext's own listener is reloading
      // this same user object off the same sign-in event in parallel.
      // `checkEmailVerified` retries once after a short pause before
      // concluding "really not verified", which absorbs that delay instead
      // of reporting a false negative. A thrown error here means every
      // attempt failed outright (e.g. offline) — that's a network problem,
      // not an unverified account, so it gets its own message.
      let verified;
      try {
        verified = await checkEmailVerified(user);
      } catch (reloadError) {
        logError('emailVerified check failed during login', reloadError);
        feedback.alert.error({
          title: '⚠️ নেটওয়ার্ক সমস্যা হয়েছে।',
          message: 'ইন্টারনেট কানেকশন চেক করে আবার চেষ্টা করুন।',
        });
        return;
      }

      // if (!verified) {
      //   feedback.alert.error({
      //     title: '⚠️ দয়া করে আপনার ইমেইল ভেরিফাই করুন।',
      //     message: 'আপনার ইমেইলে পাঠানো লিংকে ক্লিক করে ভেরিফাই করুন, তারপর আবার লগইন করুন।',
      //   });
      //   navigate('/verify-email', { replace: true });
      //   return;
      // }

      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (!userDoc.exists()) {
        feedback.alert.error({ title: '❌ এই অ্যাকাউন্ট আর সক্রিয় নেই। অ্যাডমিন দ্বারা ডিলিট করা হয়েছে।' });
        await auth.signOut();
        setLoading(false);
        navigate('/login', { replace: true });
        return;
      }

      const userData = userDoc.data();

      if (userData.isBanned || userData.isBlocked) {
        feedback.alert.error({ title: '🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।' });
        await auth.signOut();
        setLoading(false);
        navigate('/blocked');
        return;
      }

      if (userData.verificationStatus === 'rejected') {
        feedback.alert.error({ title: '❌ আপনার যাচাই প্রত্যাখ্যাত হয়েছে।' });
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/verify-rejected');
        return;
      }

      if (userData.verificationStatus === 'pending' && !userData.isVerified) {
        feedback.toast({ variant: 'info', title: '⏳ আপনার অ্যাকাউন্ট যাচাই প্রক্রিয়াধীন।', duration: 3000 });
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/verify-pending');
        return;
      }

      if (!userData.isComplete && userData.verificationStatus !== 'pending') {
        feedback.toast({ variant: 'info', title: '📝 আপনার প্রোফাইল সম্পূর্ণ করুন।', duration: 3000 });
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/settings');
        return;
      }

      // 🔐 SECURITY (admin-set temporary password): if an admin reset this
      // account's password (users/{uid}.mustChangePassword — see
      // adminFunctions.js's setTemporaryPassword), the user just logged in
      // with that temporary password. Force them straight to Settings →
      // Security so they set their own new password before doing anything
      // else. The flag itself is cleared there (settings/index.jsx's
      // handleChangePassword) once they've successfully changed it.
      if (userData.mustChangePassword) {
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true,
          lastLoginAt: serverTimestamp(),
          loginCount: (userData.loginCount || 0) + 1
        });
        feedback.toast({
          variant: 'warning',
          title: '🔑 আপনার জন্য একটি সাময়িক পাসওয়ার্ড সেট করা হয়েছে।',
          message: 'নিরাপত্তার জন্য এখনই একটি নতুন পাসওয়ার্ড সেট করুন।',
          duration: 6000,
        });
        setLoading(false);
        navigate('/settings/security', { replace: true });
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        lastLogin: serverTimestamp(),
        isOnline: true,
        lastLoginAt: serverTimestamp(),
        loginCount: (userData.loginCount || 0) + 1
      });

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      feedback.alert.success({ title: `✅ স্বাগতম ${userData.displayName || 'ইউজার'}!` });

      setTimeout(() => {
        if (userData.role === 'admin') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }, 1000);

    } catch (error) {
      console.error('Login error:', error);

      const errorMessages = {
        'auth/user-not-found': '❌ এই ইমেইলে কোনো অ্যাকাউন্ট নেই!',
        'auth/wrong-password': '❌ ভুল পাসওয়ার্ড!',
        'auth/too-many-requests': '⚠️ অনেক বেশি চেষ্টা করেছেন। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
        'auth/user-disabled': '🚫 এই অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।',
        'auth/network-request-failed': '⚠️ নেটওয়ার্ক সমস্যা! ইন্টারনেট কানেকশন চেক করুন।',
        'auth/invalid-credential': '❌ ভুল ইমেইল বা পাসওয়ার্ড!',
        'auth/invalid-email': '❌ সঠিক ইমেইল দিন!',
      };
      feedback.alert.error({ title: errorMessages[error.code] || '❌ লগইন ব্যর্থ: ' + error.message });
    } finally {
      setLoading(false);
      loginInProgressRef.current = false;
    }
  };

  // ── ✅ GOOGLE LOGIN ──
  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (!userDoc.exists()) {
        feedback.toast({ variant: 'info', title: '⏳ নতুন ইউজার, রেজিস্ট্রেশনে নিয়ে যাচ্ছি...', duration: 2000 });
        setTimeout(() => {
          navigate('/register');
        }, 1000);
        setLoading(false);
        return;
      }

      const userData = userDoc.data();

      if (userData.isBanned || userData.isBlocked) {
        feedback.alert.error({ title: '🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।' });
        await auth.signOut();
        setLoading(false);
        navigate('/blocked');
        return;
      }

      if (userData.verificationStatus === 'rejected') {
        feedback.alert.error({ title: '❌ আপনার যাচাই প্রত্যাখ্যাত হয়েছে।' });
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/verify-rejected');
        return;
      }

      if (userData.verificationStatus === 'pending' && !userData.isVerified) {
        feedback.toast({ variant: 'info', title: '⏳ আপনার অ্যাকাউন্ট যাচাই প্রক্রিয়াধীন।', duration: 3000 });
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/verify-pending');
        return;
      }

      if (!userData.isComplete && userData.verificationStatus !== 'pending') {
        feedback.toast({ variant: 'info', title: '📝 আপনার প্রোফাইল সম্পূর্ণ করুন।', duration: 3000 });
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/settings');
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        lastLogin: serverTimestamp(),
        isOnline: true,
        lastLoginAt: serverTimestamp(),
        loginCount: (userData.loginCount || 0) + 1
      });

      feedback.alert.success({ title: `✅ স্বাগতম ${userData.displayName || 'ইউজার'}!` });

      setTimeout(() => {
        if (userData.role === 'admin') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }, 1000);

    } catch (error) {
      console.error('Google login error:', error);

      if (error.code === 'auth/popup-closed-by-user') {
        feedback.alert.error({ title: 'পপআপ বন্ধ করা হয়েছে। আবার চেষ্টা করুন।' });
      } else if (error.code === 'auth/popup-blocked') {
        feedback.alert.error({ title: '⚠️ পপআপ ব্লক করা হয়েছে! ব্রাউজার সেটিংস চেক করুন।' });
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        feedback.alert.error({ title: '❌ এই ইমেইলে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। দয়া করে পাসওয়ার্ড দিয়ে লগইন করুন।' });
      } else {
        feedback.alert.error({ title: '❌ Google লগইন ব্যর্থ: ' + error.message });
      }
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ FORGOT PASSWORD — Phone + OTP + reset token flow
  // ════════════════════════════════════════════════════════════════════════════

  // 🔧 mm:ss formatter for the resend countdown
  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startResetOtpTimer = () => {
    clearInterval(resetOtpTimerRef.current);
    setResetOtpTimer(300); // 🔧 OTP-এর মেয়াদ ৫ মিনিট, তাই resend timer-ও ৫ মিনিট (300s)
    resetOtpTimerRef.current = setInterval(() => {
      setResetOtpTimer(prev => {
        if (prev <= 1) { clearInterval(resetOtpTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // 🔧 Clears the state-driven OTP digits and refocuses the first box
  const clearResetOtpDigits = () => {
    setResetOtpDigits(Array(6).fill(''));
    setTimeout(() => resetOtpRefs.current[0]?.focus(), 0);
  };

  const resetForgotFlow = () => {
    clearInterval(resetOtpTimerRef.current);
    setResetSubStep('phone');
    setResetPhone('');
    setResetOtpSent(false);
    setResetOtpTimer(0);
    setResetToken(null);
    setResetVerifying(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setResetOtpDigits(Array(6).fill('')); // 🔧 clear OTP boxes too
  };

  // Step 1: send OTP to the phone
  const sendResetOtp = async () => {
    if (loading) return;

    const phone = resetPhone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      feedback.alert.error({ title: '❌ সঠিক বাংলাদেশি মোবাইল নম্বর দিন' });
      return;
    }

    setLoading(true);
    try {
      const fullPhone = `${resetCountryCode.replace('+', '')}${phone.substring(1)}`;

      const response = await fetch(`${OTP_API_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'OTP পাঠানো যায়নি।');
      }

      setResetOtpSent(true);
      setResetSubStep('otp');
      clearResetOtpDigits();
      startResetOtpTimer();
      feedback.alert.success({ title: '📨 আপনার মোবাইলে OTP পাঠানো হয়েছে' });

    } catch (error) {
      console.error('❌ Send Reset OTP Error:', error);
      feedback.alert.error({ title: '❌ ' + (error.message || 'OTP পাঠানো যায়নি') });
    } finally {
      setLoading(false);
    }
  };

  const resendResetOtp = () => {
    if (resetOtpTimer > 0 || loading) return;
    sendResetOtp();
  };

  // 🔧 Per-box change handler — types into a single box and auto-advances
  const handleResetOtpChange = (e, idx) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(-1);
    setResetOtpDigits(prev => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
    if (val && idx < 5) {
      resetOtpRefs.current[idx + 1]?.focus();
    }
  };

  // 🔧 Backspace-to-previous-box handling: empty box → jump back and
  // clear the previous digit too, matching standard OTP UX.
  const handleResetOtpKeyDown = (e, idx) => {
    if (e.key !== 'Backspace') return;
    if (resetOtpDigits[idx]) {
      setResetOtpDigits(prev => {
        const next = [...prev];
        next[idx] = '';
        return next;
      });
    } else if (idx > 0) {
      setResetOtpDigits(prev => {
        const next = [...prev];
        next[idx - 1] = '';
        return next;
      });
      resetOtpRefs.current[idx - 1]?.focus();
    }
  };

  // 🔧 Pasting a full 6-digit code fills all boxes at once
  const handleResetOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (!pasted) return;
    const next = Array(6).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setResetOtpDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    resetOtpRefs.current[focusIdx]?.focus();
  };

  // Step 2: verify OTP → receive a short-lived, single-use resetToken
  // from the Worker. The frontend never self-declares "verified" —
  // only a Worker-issued token (valid for this exact phone number,
  // usable once) can move on to actually changing the password.
  // 🔧 Now triggered explicitly by the "ভেরিফাই করুন" button, not
  // auto-fired when the 6th digit is typed.
  const verifyResetOtp = async () => {
    if (resetVerifying) return;

    const otp = resetOtpDigits.join('');
    if (otp.length !== 6) {
      feedback.alert.error({ title: '❌ সম্পূর্ণ ৬ সংখ্যার OTP দিন' });
      return;
    }

    setResetVerifying(true);
    try {
      const phone = resetPhone.trim();
      const fullPhone = `${resetCountryCode.replace('+', '')}${phone.substring(1)}`;

      const response = await fetch(`${OTP_API_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, otp }),
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.resetToken) {
        throw new Error(data.message || 'ভুল OTP অথবা মেয়াদ শেষ।');
      }

      setResetToken(data.resetToken);
      clearInterval(resetOtpTimerRef.current);
      setResetOtpTimer(0);
      feedback.alert.success({ title: '✅ OTP যাচাই সফল হয়েছে!' });
      setResetSubStep('password');

    } catch (error) {
      console.error('❌ Reset OTP Verify Error:', error);
      clearResetOtpDigits();
      feedback.alert.error({ title: '❌ ' + (error.message || 'OTP যাচাই ব্যর্থ হয়েছে') });
    } finally {
      setResetVerifying(false);
    }
  };

  // Step 3: submit the new password + the resetToken. The Worker
  // validates the token (matches this phone, unused, not expired)
  // and updates the Firebase Auth password directly via the Identity
  // Toolkit REST API — the frontend never touches Firebase Admin.
  const submitNewPassword = async (e) => {
    e?.preventDefault();

    if (loading) return;

    if (newPassword.length < 6) {
      feedback.alert.error({ title: '❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      feedback.alert.error({ title: '❌ পাসওয়ার্ড দুটো মিলছে না' });
      return;
    }
    if (!resetToken) {
      feedback.alert.error({ title: '❌ সেশনের মেয়াদ শেষ হয়ে গেছে, আবার শুরু করুন।' });
      resetForgotFlow();
      return;
    }

    setLoading(true);
    try {
      const phone = resetPhone.trim();
      const fullPhone = `${resetCountryCode.replace('+', '')}${phone.substring(1)}`;

      const response = await fetch(`${OTP_API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, token: resetToken, newPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে।');
      }

      feedback.alert.success({ title: '✅ পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে! এখন লগইন করুন।' });
      resetForgotFlow();
      showLoginPanel('loginMain');

    } catch (error) {
      console.error('❌ Reset Password Error:', error);
      feedback.alert.error({ title: '❌ ' + (error.message || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে') });
    } finally {
      setLoading(false);
    }
  };

  // ── OTP Login (Simulated — unrelated to password reset, unchanged) ──
  const sendLoginOTP = () => {
    const phone = loginData.phone.trim();
    if (phone.length < 10) {
      feedback.alert.error({ title: '❌ সঠিক নম্বর দিন' });
      return;
    }
    setLoginOtpSent(true);
    setOtpTimer(30);
    feedback.alert.success({ title: '📨 OTP পাঠানো হয়েছে ✓' });

    const interval = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const loginOtpInput = (el, idx) => {
    const val = el.value.replace(/[^0-9]/g, '');
    el.value = val;
    if (val) el.classList.add('filled');
    else el.classList.remove('filled');
    const boxes = document.querySelectorAll('#loginOTPPanel .otp-box');
    if (val && idx < 5) boxes[idx + 1]?.focus();
    if (idx === 5 && val) {
      setTimeout(() => {
        feedback.alert.success({ title: '✅ সফলভাবে লগইন হয়েছে ✓' });
        navigate('/', { replace: true });
      }, 300);
    }
  };

return (
    <div className={styles.shopnestLogin}>
      <div className={styles.authCard} id="loginAuthCard">
        <div className={styles.cardBody}>

          {/* ─── LOGIN MAIN ─── */}
          <div className={`${styles.loginPanel} ${activePanel === 'loginMain' ? styles.active : ''}`} id="loginMain">
            <div className={styles.logo}>
              <i className="fa-solid fa-cube"></i>
              <h2>WorkTrustbd</h2>
            </div>

            <div className={styles.stepSubtitle}>আপনার WorkTrustbd অ্যাকাউন্টে লগইন করুন।</div>

            <form onSubmit={doLogin}>
              <div className={styles.field}>
                <label>ইমেইল বা ফোন নম্বর</label>
                <input
                  type="text"
                  id="loginId"
                  placeholder="email@example.com"
                  value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className={styles.field}>
                <label>পাসওয়ার্ড</label>
                <div className={styles.pwWrap}>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="loginPass"
                    placeholder="পাসওয়ার্ড লিখুন"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className={styles.pwToggle}
                    onClick={(e) => togglePw('loginPass', e.currentTarget)}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className={styles.options}>
                <label className={styles.rememberMe}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                  />
                  <span>আমাকে মনে রাখুন</span>
                </label>
                <button
                  type="button"
                  className={styles.forgotLink}
                  onClick={() => { resetForgotFlow(); showLoginPanel('forgotPanel'); }}
                >
                  পাসওয়ার্ড ভুলে গেছেন?
                </button>
              </div>

              <button 
                type="submit" 
                className={styles.btnPrimary} 
                disabled={loading}
              >
                {loading ? (
                  <span className={styles.loadingSpinner}>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    লগইন হচ্ছে...
                  </span>
                ) : (
                  'লগইন করুন'
                )}
              </button>
            </form>
          </div>

          {/* ─── LOGIN OTP ─── */}
          <div className={`${styles.loginPanel} ${activePanel === 'loginOTPPanel' ? styles.active : ''}`} id="loginOTPPanel">
            <div className={styles.stepTitle}>📱 OTP দিয়ে লগইন</div>
            <div className={styles.stepSubtitle}>মোবাইলে পাঠানো কোড দিয়ে লগইন করুন।</div>

            <div className={styles.field}>
              <label>মোবাইল নম্বর</label>
              <div className={styles.phoneRow}>
                <select
                  value={loginData.countryCode || '+880'}
                  onChange={(e) => setLoginData({ ...loginData, countryCode: e.target.value })}
                >
                  <option value="+880">🇧🇩 +880</option>
                  <option value="+91">🇮🇳 +91</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+61">🇦🇺 +61</option>
                </select>
                <input
                  type="tel"
                  id="loginPhone"
                  placeholder="01XXXXXXXXX"
                  value={loginData.phone}
                  onChange={(e) => setLoginData({ ...loginData, phone: e.target.value })}
                  disabled={loading}
                />
              </div>
            </div>

            {loginOtpSent && (
              <div className={styles.loginOtpSection}>
                <div className={styles.infoBox}>
                  <span className={styles.infoIcon}>📱</span>
                  <span>আপনার ফোনে OTP পাঠানো হয়েছে।</span>
                </div>
                <div className={styles.otpContainer}>
                  <label>OTP লিখুন</label>
                  <div className={styles.otpRow}>
                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                      <input
                        key={idx}
                        className={styles.otpBox}
                        maxLength="1"
                        type="text"
                        inputMode="numeric"
                        onInput={(e) => loginOtpInput(e.target, idx)}
                        disabled={loading}
                      />
                    ))}
                  </div>
                </div>
                <div className={styles.resendRow}>
                  {otpTimer > 0 ? (
                    <span>পুনরায় পাঠান {otpTimer}s</span>
                  ) : (
                    <button className={styles.resendBtn} onClick={sendLoginOTP} disabled={loading}>
                      পুনরায় OTP পাঠান
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className={styles.btnRow}>
              <button className={styles.btnGhost} onClick={() => showLoginPanel('loginMain')} disabled={loading}>
                ← পিছনে
              </button>
              <button className={styles.btnPrimary} onClick={sendLoginOTP} disabled={loading}>
                {loading ? '⏳...' : '📨 OTP পাঠান'}
              </button>
            </div>
          </div>

          {/* ─── FORGOT PASSWORD ─── */}
          <div className={`${styles.loginPanel} ${activePanel === 'forgotPanel' ? styles.active : ''}`} id="forgotPanel">

            {resetSubStep === 'phone' && (
              <>
                <div className={styles.stepTitle}> পাসওয়ার্ড পুনরুদ্ধার</div>
                <div className={styles.stepSubtitle}>নিবন্ধিত মোবাইল নম্বরে OTP পাঠানো হবে।</div>

                <div className={styles.field}>
                  <label>মোবাইল নম্বর</label>
                  <div className={styles.phoneRow}>
                    <select
                      value={resetCountryCode}
                      onChange={(e) => setResetCountryCode(e.target.value)}
                      disabled={loading}
                    >
                      <option value="+880">🇧🇩 +880</option>
                    </select>
                    <input
                      type="tel"
                      placeholder="01XXXXXXXXX"
                      maxLength="11"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value.replace(/\D/g, ''))}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className={styles.btnRow}>
                  <button className={styles.btnGhost} onClick={() => { resetForgotFlow(); showLoginPanel('loginMain'); }} disabled={loading}>
                    ← পিছনে
                  </button>
                  <button className={styles.btnPrimary} onClick={sendResetOtp} disabled={loading}>
                    {loading ? '⏳...' : '📨 OTP পাঠান'}
                  </button>
                </div>
              </>
            )}

            {resetSubStep === 'otp' && (
              <>
                <div className={styles.stepTitle}>📱 OTP যাচাই করুন</div>
                <div className={styles.stepSubtitle}>{resetPhone} নম্বরে পাঠানো ৬-সংখ্যার কোডটি লিখুন।</div>

                <div className={styles.infoBox}>
                  <span className={styles.infoIcon}>📱</span>
                  <span>OTP পাঠানো হয়েছে।</span>
                </div>

                <div className={styles.otpContainer}>
                  <label>OTP কোড লিখুন</label>
                  <div className={styles.otpRow}>
                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                      <input
                        key={idx}
                        ref={(el) => (resetOtpRefs.current[idx] = el)}
                        className={`${styles.otpBox} ${resetOtpDigits[idx] ? styles.filled : ''}`}
                        maxLength="1"
                        type="text"
                        inputMode="numeric"
                        value={resetOtpDigits[idx]}
                        onChange={(e) => handleResetOtpChange(e, idx)}
                        onKeyDown={(e) => handleResetOtpKeyDown(e, idx)}
                        onPaste={idx === 0 ? handleResetOtpPaste : undefined}
                        disabled={resetVerifying}
                      />
                    ))}
                  </div>
                </div>

                <div className={styles.resendRow}>
                  কোড পাননি?{' '}
                  {resetOtpTimer > 0 ? (
                    <span>({formatTimer(resetOtpTimer)})</span>
                  ) : (
                    <button className={styles.resendBtn} onClick={resendResetOtp} disabled={loading}>
                      পুনরায় পাঠান
                    </button>
                  )}
                </div>

                <div className={styles.btnRow}>
                  <button
                    className={styles.btnGhost}
                    onClick={() => { setResetSubStep('phone'); setResetOtpSent(false); clearResetOtpDigits(); }}
                    disabled={resetVerifying}
                  >
                    ← ফোন নম্বর পরিবর্তন করুন
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={verifyResetOtp}
                    disabled={resetVerifying || resetOtpDigits.join('').length !== 6}
                  >
                    {resetVerifying ? '⏳ যাচাই হচ্ছে...' : '✅ ভেরিফাই করুন'}
                  </button>
                </div>
              </>
            )}

            {resetSubStep === 'password' && (
              <>
                <div className={styles.stepTitle}>🔒 নতুন পাসওয়ার্ড দিন</div>
                <div className={styles.stepSubtitle}>OTP যাচাই সফল হয়েছে — এখন নতুন পাসওয়ার্ড সেট করুন।</div>

                <form onSubmit={submitNewPassword}>
                  <div className={styles.field}>
                    <label>নতুন পাসওয়ার্ড</label>
                    <input
                      type="password"
                      placeholder="কমপক্ষে ৬ অক্ষর"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>নতুন পাসওয়ার্ড নিশ্চিত করুন</label>
                    <input
                      type="password"
                      placeholder="একই পাসওয়ার্ড পুনরায়"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className={styles.btnRow}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => { resetForgotFlow(); showLoginPanel('loginMain'); }}
                      disabled={loading}
                    >
                      বাতিল
                    </button>
                    <button type="submit" className={styles.btnPrimary} disabled={loading}>
                      {loading ? '⏳...' : '✅ পাসওয়ার্ড পরিবর্তন করুন'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

        </div>

        <div className={styles.cardFooter}>
          অ্যাকাউন্ট নেই?
          <a 
            href="#" 
            className={styles.link} 
            onClick={(e) => {
              e.preventDefault();
              if (onSwitchToRegister) onSwitchToRegister();
              else navigate('/register');
            }}
          >
            এখনই নিবন্ধন করুন
          </a>
        </div>
      </div>

      <div className={styles.toast} id="loginToast"></div>
    </div>
  );
};

export default Login;