import React, { useState, useEffect, useRef } from 'react';
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
import { auth, db } from '@/firebase';
import toast, { Toaster } from 'react-hot-toast';
import './Login.css';
import './Register.css';

// ============================================================
// 📱 OTP API URL — same Worker used by the registration flow
// ============================================================
const OTP_API_URL = import.meta.env.VITE_OTP_API_URL ||
  'https://worktrust-otp-production.hammanmusa362.workers.dev';

const Login = ({ onSwitchToRegister }) => {
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
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  // ============================================================
  // ✅ NEW: Forgot-password (phone + OTP + reset token) flow state
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

  // ── Check if user is already logged in ──
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        navigate('/');
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
      toast.error('❌ ইমেইল বা ফোন নম্বর দিন');
      return;
    }
    if (!password) {
      toast.error('❌ পাসওয়ার্ড দিন');
      return;
    }

    setLoading(true);

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      );

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        toast.error('⚠️ দয়া করে আপনার ইমেইল ভেরিফাই করুন।');
        setLoading(false);
        return;
      }

      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (!userDoc.exists()) {
        toast.error('❌ এই অ্যাকাউন্ট আর সক্রিয় নেই। অ্যাডমিন দ্বারা ডিলিট করা হয়েছে।');
        await auth.signOut();
        setLoading(false);
        navigate('/login');
        return;
      }

      const userData = userDoc.data();

      if (userData.isBanned || userData.isBlocked) {
        toast.error('🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।');
        await auth.signOut();
        setLoading(false);
        navigate('/blocked');
        return;
      }

      if (userData.verificationStatus === 'rejected') {
        toast.error('❌ আপনার যাচাই প্রত্যাখ্যাত হয়েছে।');
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/verify-rejected');
        return;
      }

      if (userData.verificationStatus === 'pending' && !userData.isVerified) {
        toast.loading('⏳ আপনার অ্যাকাউন্ট যাচাই প্রক্রিয়াধীন।', { duration: 3000 });
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/verify-pending');
        return;
      }

      if (!userData.isComplete && userData.verificationStatus !== 'pending') {
        toast.loading('📝 আপনার প্রোফাইল সম্পূর্ণ করুন।', { duration: 3000 });
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

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      toast.success(`✅ স্বাগতম ${userData.displayName || 'ইউজার'}!`);

      setTimeout(() => {
        if (userData.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/');
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
      toast.error(errorMessages[error.code] || '❌ লগইন ব্যর্থ: ' + error.message);
    } finally {
      setLoading(false);
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
        toast.loading('⏳ নতুন ইউজার, রেজিস্ট্রেশনে নিয়ে যাচ্ছি...', { duration: 2000 });
        setTimeout(() => {
          navigate('/register');
        }, 1000);
        setLoading(false);
        return;
      }

      const userData = userDoc.data();

      if (userData.isBanned || userData.isBlocked) {
        toast.error('🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।');
        await auth.signOut();
        setLoading(false);
        navigate('/blocked');
        return;
      }

      if (userData.verificationStatus === 'rejected') {
        toast.error('❌ আপনার যাচাই প্রত্যাখ্যাত হয়েছে।');
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/verify-rejected');
        return;
      }

      if (userData.verificationStatus === 'pending' && !userData.isVerified) {
        toast.loading('⏳ আপনার অ্যাকাউন্ট যাচাই প্রক্রিয়াধীন।', { duration: 3000 });
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true
        });
        setLoading(false);
        navigate('/verify-pending');
        return;
      }

      if (!userData.isComplete && userData.verificationStatus !== 'pending') {
        toast.loading('📝 আপনার প্রোফাইল সম্পূর্ণ করুন।', { duration: 3000 });
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

      toast.success(`✅ স্বাগতম ${userData.displayName || 'ইউজার'}!`);

      setTimeout(() => {
        if (userData.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/');
        }
      }, 1000);

    } catch (error) {
      console.error('Google login error:', error);

      if (error.code === 'auth/popup-closed-by-user') {
        toast.error('পপআপ বন্ধ করা হয়েছে। আবার চেষ্টা করুন।');
      } else if (error.code === 'auth/popup-blocked') {
        toast.error('⚠️ পপআপ ব্লক করা হয়েছে! ব্রাউজার সেটিংস চেক করুন।');
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        toast.error('❌ এই ইমেইলে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। দয়া করে পাসওয়ার্ড দিয়ে লগইন করুন।');
      } else {
        toast.error('❌ Google লগইন ব্যর্থ: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ NEW: FORGOT PASSWORD — Phone + OTP + reset token flow
  // ════════════════════════════════════════════════════════════════════════════

  const startResetOtpTimer = () => {
    clearInterval(resetOtpTimerRef.current);
    setResetOtpTimer(30);
    resetOtpTimerRef.current = setInterval(() => {
      setResetOtpTimer(prev => {
        if (prev <= 1) { clearInterval(resetOtpTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const clearResetOtpBoxesUI = () => {
    setTimeout(() => {
      const boxes = document.querySelectorAll('#forgotPanel .otp-box');
      boxes.forEach(box => {
        box.value = '';
        box.classList.remove('filled');
      });
      boxes[0]?.focus();
    }, 0);
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
  };

  // Step 1: send OTP to the phone
  const sendResetOtp = async () => {
    if (loading) return;

    const phone = resetPhone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      toast.error('❌ সঠিক বাংলাদেশি মোবাইল নম্বর দিন');
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
      clearResetOtpBoxesUI();
      startResetOtpTimer();
      toast.success('📨 আপনার মোবাইলে OTP পাঠানো হয়েছে');

    } catch (error) {
      console.error('❌ Send Reset OTP Error:', error);
      toast.error('❌ ' + (error.message || 'OTP পাঠানো যায়নি'));
    } finally {
      setLoading(false);
    }
  };

  const resendResetOtp = () => {
    if (resetOtpTimer > 0 || loading) return;
    sendResetOtp();
  };

  // Step 2: verify OTP → receive a short-lived, single-use resetToken
  // from the Worker. The frontend never self-declares "verified" —
  // only a Worker-issued token (valid for this exact phone number,
  // usable once) can move on to actually changing the password.
  const resetOtpInput = async (el, idx) => {
    const val = el.value.replace(/[^0-9]/g, '');
    el.value = val;
    el.classList.toggle('filled', !!val);

    const boxes = document.querySelectorAll('#forgotPanel .otp-box');
    if (val && idx < 5) {
      boxes[idx + 1]?.focus();
    }

    if (idx !== 5 || !val || resetVerifying) return;

    const otp = [...boxes].map(b => b.value).join('');
    if (otp.length !== 6) return;

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
      toast.success('✅ OTP যাচাই সফল হয়েছে!');
      setResetSubStep('password');

    } catch (error) {
      console.error('❌ Reset OTP Verify Error:', error);
      boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); });
      boxes[0]?.focus();
      toast.error('❌ ' + (error.message || 'OTP যাচাই ব্যর্থ হয়েছে'));
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

    if (newPassword.length < 6) {
      toast.error('❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('❌ পাসওয়ার্ড দুটো মিলছে না');
      return;
    }
    if (!resetToken) {
      toast.error('❌ সেশনের মেয়াদ শেষ হয়ে গেছে, আবার শুরু করুন।');
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

      toast.success('✅ পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে! এখন লগইন করুন।');
      resetForgotFlow();
      showLoginPanel('loginMain');

    } catch (error) {
      console.error('❌ Reset Password Error:', error);
      toast.error('❌ ' + (error.message || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে'));
    } finally {
      setLoading(false);
    }
  };

  // ── OTP Login (Simulated — unrelated to password reset, unchanged) ──
  const sendLoginOTP = () => {
    const phone = loginData.phone.trim();
    if (phone.length < 10) {
      toast.error('❌ সঠিক নম্বর দিন');
      return;
    }
    setLoginOtpSent(true);
    setOtpTimer(30);
    toast.success('📨 OTP পাঠানো হয়েছে ✓');

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
        toast.success('✅ সফলভাবে লগইন হয়েছে ✓');
        navigate('/');
      }, 300);
    }
  };

  return (
    <div className="shopnest-login">
      <Toaster position="top-center" />

      <div className="auth-card" id="loginAuthCard">
        <div className="card-body">

          {/* ─── LOGIN MAIN ─── */}
          <div className={`login-panel ${activePanel === 'loginMain' ? 'active' : ''}`} id="loginMain">
            <div className="logo" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <i className="fa-solid fa-cube" style={{ fontSize: '3rem', color: 'var(--primary)' }}></i>
              <h2 style={{ margin: '0.5rem 0 0', fontSize: '1.5rem' }}>WorkTrustbd</h2>
            </div>

            <div className="step-subtitle">আপনার WorkTrustbd অ্যাকাউন্টে লগইন করুন।</div>

            <form onSubmit={doLogin}>
              <div className="field">
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

              <div className="field">
                <label>পাসওয়ার্ড</label>
                <div className="pw-wrap">
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
                    className="pw-toggle"
                    onClick={(e) => togglePw('loginPass', e.currentTarget)}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="options" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <label className="remember-me" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
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
                  className="forgot-link"
                  onClick={() => { resetForgotFlow(); showLoginPanel('forgotPanel'); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  পাসওয়ার্ড ভুলে গেছেন?
                </button>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading} style={{
                background: loading ? 'var(--bg-tertiary, #1a2030)' : 'var(--gradient-primary)',
                cursor: loading ? 'not-allowed' : 'pointer',
                width: '100%'
              }}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--accent-primary, #14b8a6)' }}></i>
                    লগইন হচ্ছে...
                  </span>
                ) : (
                  '🔑 লগইন করুন'
                )}
              </button>
            </form>
          </div>

          {/* ─── LOGIN OTP (unchanged — unrelated feature) ─── */}
          <div className={`login-panel ${activePanel === 'loginOTPPanel' ? 'active' : ''}`} id="loginOTPPanel">
            <div className="step-title">📱 OTP দিয়ে লগইন</div>
            <div className="step-subtitle">মোবাইলে পাঠানো কোড দিয়ে লগইন করুন।</div>

            <div className="field">
              <label>মোবাইল নম্বর</label>
              <div className="phone-row">
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
              <div id="loginOtpSection" style={{ display: 'block' }}>
                <div className="info-box info">
                  <span className="info-icon">📱</span>
                  <span>আপনার ফোনে OTP পাঠানো হয়েছে।</span>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ textAlign: 'center', display: 'block', marginBottom: '.75rem' }}>OTP লিখুন</label>
                  <div className="otp-row">
                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                      <input
                        key={idx}
                        className="otp-box"
                        maxLength="1"
                        type="text"
                        inputMode="numeric"
                        onInput={(e) => loginOtpInput(e.target, idx)}
                        disabled={loading}
                      />
                    ))}
                  </div>
                </div>
                <div className="resend-row" style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  {otpTimer > 0 ? (
                    <span>পুনরায় পাঠান {otpTimer}s</span>
                  ) : (
                    <button className="resend-btn" onClick={sendLoginOTP} disabled={loading}>
                      পুনরায় OTP পাঠান
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => showLoginPanel('loginMain')} disabled={loading}>
                ← পিছনে
              </button>
              <button className="btn btn-primary" onClick={sendLoginOTP} disabled={loading}>
                {loading ? '⏳...' : '📨 OTP পাঠান'}
              </button>
            </div>
          </div>

          {/* ─── FORGOT PASSWORD — phone + OTP + reset token ─── */}
          <div className={`login-panel ${activePanel === 'forgotPanel' ? 'active' : ''}`} id="forgotPanel">

            {resetSubStep === 'phone' && (
              <>
                <div className="step-title">🔑 পাসওয়ার্ড পুনরুদ্ধার</div>
                <div className="step-subtitle">নিবন্ধিত মোবাইল নম্বরে OTP পাঠানো হবে।</div>

                <div className="field">
                  <label>মোবাইল নম্বর</label>
                  <div className="phone-row">
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

                <div className="btn-row">
                  <button className="btn btn-ghost" onClick={() => { resetForgotFlow(); showLoginPanel('loginMain'); }} disabled={loading}>
                    ← পিছনে
                  </button>
                  <button className="btn btn-primary" onClick={sendResetOtp} disabled={loading}>
                    {loading ? '⏳...' : '📨 OTP পাঠান'}
                  </button>
                </div>
              </>
            )}

            {resetSubStep === 'otp' && (
              <>
                <div className="step-title">📱 OTP যাচাই করুন</div>
                <div className="step-subtitle">{resetPhone} নম্বরে পাঠানো ৬-সংখ্যার কোডটি লিখুন।</div>

                <div className="info-box info">
                  <span className="info-icon">📱</span>
                  <span>OTP পাঠানো হয়েছে।</span>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ textAlign: 'center', display: 'block', marginBottom: '.75rem' }}>OTP কোড লিখুন</label>
                  <div className="otp-row">
                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                      <input
                        key={idx}
                        className="otp-box"
                        maxLength="1"
                        type="text"
                        inputMode="numeric"
                        onInput={(e) => resetOtpInput(e.target, idx)}
                        disabled={resetVerifying}
                      />
                    ))}
                  </div>
                </div>
                <div className="resend-row" style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  কোড পাননি?{' '}
                  {resetOtpTimer > 0 ? (
                    <span>({resetOtpTimer}s)</span>
                  ) : (
                    <button className="resend-btn" onClick={resendResetOtp} disabled={loading}>
                      পুনরায় পাঠান
                    </button>
                  )}
                </div>

                <div className="btn-row" style={{ marginTop: '1rem' }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { setResetSubStep('phone'); setResetOtpSent(false); }}
                    disabled={resetVerifying}
                  >
                    ← ফোন নম্বর পরিবর্তন করুন
                  </button>
                </div>
              </>
            )}

            {resetSubStep === 'password' && (
              <>
                <div className="step-title">🔒 নতুন পাসওয়ার্ড দিন</div>
                <div className="step-subtitle">OTP যাচাই সফল হয়েছে — এখন নতুন পাসওয়ার্ড সেট করুন।</div>

                <form onSubmit={submitNewPassword}>
                  <div className="field">
                    <label>নতুন পাসওয়ার্ড</label>
                    <input
                      type="password"
                      placeholder="কমপক্ষে ৬ অক্ষর"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="field">
                    <label>নতুন পাসওয়ার্ড নিশ্চিত করুন</label>
                    <input
                      type="password"
                      placeholder="একই পাসওয়ার্ড পুনরায়"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => { resetForgotFlow(); showLoginPanel('loginMain'); }}
                      disabled={loading}
                    >
                      বাতিল
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? '⏳...' : '✅ পাসওয়ার্ড পরিবর্তন করুন'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

        </div>

        <div className="card-footer">
          অ্যাকাউন্ট নেই?
          <a href="#" className="link" onClick={(e) => {
            e.preventDefault();
            if (onSwitchToRegister) onSwitchToRegister();
            else navigate('/register');
          }}>
            এখনই নিবন্ধন করুন
          </a>
        </div>
      </div>

      <div className="toast" id="loginToast"></div>
    </div>
  );
};

export default Login;