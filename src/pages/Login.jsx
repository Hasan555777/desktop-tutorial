import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from '@/firebase';
import toast, { Toaster } from 'react-hot-toast';
import './Login.css';
import './Register.css';

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

  // ── Toast System ──
  const showToast = (msg, type = 'info') => {
    const toastEl = document.getElementById('loginToast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + type;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(() => toastEl.classList.remove('show'), 3000);
  };

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
      // ✅ ফিক্স: warning → error
      toast.error('⚠️ দয়া করে আপনার ইমেইল ভেরিফাই করুন।');
      // await auth.signOut();
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
    
    // ── ✅ ১. ব্লকড চেক ──
    if (userData.isBanned || userData.isBlocked) {
      toast.error('🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।');
      await auth.signOut();
      setLoading(false);
      navigate('/blocked');
      return;
    }
    
    // ── ✅ ২. রিজেক্টেড চেক ──
    if (userData.verificationStatus === 'rejected') {
      // ✅ ফিক্স: warning → error
      toast.error('❌ আপনার যাচাই প্রত্যাখ্যাত হয়েছে।');
      await updateDoc(doc(db, 'users', user.uid), {
        lastLogin: serverTimestamp(),
        isOnline: true
      });
      setLoading(false);
      navigate('/verify-rejected');
      return;
    }
    
    // ── ✅ ৩. পেন্ডিং চেক ──
    if (userData.verificationStatus === 'pending' && !userData.isVerified) {
      // ✅ ফিক্স: info → loading
      toast.loading('⏳ আপনার অ্যাকাউন্ট যাচাই প্রক্রিয়াধীন।', { duration: 3000 });
      await updateDoc(doc(db, 'users', user.uid), {
        lastLogin: serverTimestamp(),
        isOnline: true
      });
      setLoading(false);
      navigate('/verify-pending');
      return;
    }
    
    // ── ✅ ৪. অসম্পূর্ণ প্রোফাইল চেক ──
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
    
    // ── ✅ ৫. ভেরিফাইড বা কমপ্লিট ইউজার ──
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
      // ✅ ফিক্স: loading + navigate
      toast.loading('⏳ নতুন ইউজার, রেজিস্ট্রেশনে নিয়ে যাচ্ছি...', { duration: 2000 });
      setTimeout(() => {
        navigate('/register');
      }, 1000);
      setLoading(false);
      return;
    }
    
    const userData = userDoc.data();
    
    // ── ✅ ব্লকড চেক ──
    if (userData.isBanned || userData.isBlocked) {
      toast.error('🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।');
      await auth.signOut();
      setLoading(false);
      navigate('/blocked');
      return;
    }
    
    // ── ✅ রিজেক্টেড চেক ──
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
    
    // ── ✅ পেন্ডিং চেক ──
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
    
    // ── ✅ অসম্পূর্ণ প্রোফাইল চেক ──
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
    
    // ── ✅ ভেরিফাইড বা কমপ্লিট ইউজার ──
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
      // ✅ ফিক্স: error
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

// ── ✅ FORGOT PASSWORD ──
const sendResetLink = async () => {
  const email = document.getElementById('forgotEmail')?.value.trim();
  
  if (!email) { 
    toast.error('❌ ইমেইল লিখুন');
    return; 
  }
  
  setLoading(true);
  
  try {
    await sendPasswordResetEmail(auth, email, {
      url: window.location.origin + '/login',
      handleCodeInApp: false
    });
    
    toast.success('📧 পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে!');
    toast.success('📧 ইমেইল চেক করুন এবং নির্দেশনা অনুসরণ করুন।');
    
    setTimeout(() => showLoginPanel('loginMain'), 2000);
    
  } catch (error) {
    console.error('Reset password error:', error);
    
    if (error.code === 'auth/user-not-found') {
      toast.error('❌ এই ইমেইলে কোনো অ্যাকাউন্ট নেই!');
    } else if (error.code === 'auth/too-many-requests') {
      toast.error('⚠️ অনেক বেশি চেষ্টা করেছেন। পরে আবার চেষ্টা করুন।');
    } else {
      toast.error('❌ লিংক পাঠানো ব্যর্থ: ' + error.message);
    }
  } finally {
    setLoading(false);
  }
};

  // ── ✅ FORGOT PASSWORD ──


  // ── OTP Login (Simulated - Firebase doesn't support OTP without Phone Auth) ──
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

  // ── Social Login (Other providers) ──
  const socialLogin = (provider) => {
    if (provider === 'Google') {
      handleGoogleLogin();
    } else {
      toast.info(`🔐 ${provider} এ সংযুক্ত হচ্ছে...`);
      setTimeout(() => toast.success(`✅ ${provider} সংযুক্ত হয়েছে!`), 1000);
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
            
            {/* <div className="step-title">👋 আবার স্বাগতম!</div> */}
            <div className="step-subtitle">আপনার WorkTrustbd অ্যাকাউন্টে লগইন করুন।</div>

            <form onSubmit={doLogin}>
              <div className="field">
                <label>ইমেইল বা ফোন নম্বর</label>
                <input 
                  type="text" 
                  id="loginId" 
                  placeholder="email@example.com" 
                  value={loginData.email} 
                  onChange={(e) => setLoginData({...loginData, email: e.target.value})} 
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
                    onChange={(e) => setLoginData({...loginData, password: e.target.value})} 
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
                  onClick={() => showLoginPanel('forgotPanel')} 
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
      <i className="fa-solid fa-spinner fa-spin" style={{
        color: 'var(--accent-primary, #14b8a6)'
      }}></i>
      লগইন হচ্ছে...
    </span>
  ) : (
    '🔑 লগইন করুন'
  )}
</button>
            </form>

            {/* <div className="divider"><span>অথবা</span></div> */}



            {/* <div className="btn-row" style={{ marginTop: '.75rem' }}>
              <button className="btn btn-ghost" onClick={() => showLoginPanel('loginOTPPanel')} style={{ width: '100%' }}>
                📱 OTP দিয়ে লগইন
              </button>
            </div> */}


          </div>

          {/* ─── LOGIN OTP ─── */}
          <div className={`login-panel ${activePanel === 'loginOTPPanel' ? 'active' : ''}`} id="loginOTPPanel">
            <div className="step-title">📱 OTP দিয়ে লগইন</div>
            <div className="step-subtitle">মোবাইলে পাঠানো কোড দিয়ে লগইন করুন।</div>

            <div className="field">
              <label>মোবাইল নম্বর</label>
              <div className="phone-row">
                <select 
                  value={loginData.countryCode || '+880'} 
                  onChange={(e) => setLoginData({...loginData, countryCode: e.target.value})}
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
                  onChange={(e) => setLoginData({...loginData, phone: e.target.value})} 
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
                    {[0,1,2,3,4,5].map((idx) => (
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

          {/* ─── FORGOT PASSWORD ─── */}
          <div className={`login-panel ${activePanel === 'forgotPanel' ? 'active' : ''}`} id="forgotPanel">
            <div className="step-title">🔑 পাসওয়ার্ড পুনরুদ্ধার</div>
            <div className="step-subtitle">নিবন্ধিত ইমেইলে রিসেট লিংক পাঠানো হবে।</div>
            
            <div className="field">
              <label>ইমেইল ঠিকানা</label>
              <input type="email" id="forgotEmail" placeholder="example@email.com" disabled={loading} />
            </div>
            
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => showLoginPanel('loginMain')} disabled={loading}>
                ← পিছনে
              </button>
              <button className="btn btn-primary" onClick={sendResetLink} disabled={loading}>
                {loading ? '⏳...' : '📧 লিংক পাঠান'}
              </button>
            </div>
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