// src/pages/Settings/tabs/SecurityTab.jsx
// ============================================================
// 🔧 FIX APPLIED — Recovery Codes double-regenerate bug:
// Both "Generate New Codes" AND "Download Codes" (and the modal's
// "Download All Codes") independently called
// recovery.regenerateRecoveryCodes(10). Regenerating creates a BRAND
// NEW set and invalidates the previous one. So the old flow was:
//   1. User clicks "Generate" → sees codes A on screen.
//   2. User clicks "Download" → regenerates AGAIN → downloads codes B.
//   3. Codes A (still shown on screen, and the modal's own "Download
//      All Codes" button) are now dead — the user has no way to know
//      the codes in front of them no longer work.
// Fixed so downloading uses the codes ALREADY in memory
// (recoveryCodesList) whenever they exist — regeneration only happens
// when there is genuinely nothing generated yet, and even then only
// after an explicit confirmation (since it invalidates any codes
// issued earlier, e.g. from a previous session).
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import ToggleSwitch from '../components/ToggleSwitch';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../../shared/ui/Sound/SoundEvents';
import { auth, db } from '../../../shared/firebase/index';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot
} from 'firebase/firestore';
import styles from './SecurityTab.module.css';

import { device } from '../../../shared/security/device';
import { recovery } from '../../../shared/security/recovery';

import { useAppLock } from '../../app-lock/hooks/useAppLock';
import { useBiometric } from '../../app-lock/hooks/useBiometric';

// ============================================================
// 🔧 NEW: shared file-download helper so both download entry points
// use the exact same codes, instead of each fetching its own fresh set.
// ============================================================
const downloadCodesAsFile = (codes) => {
  const timestamp = new Date().toLocaleString('bn-BD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const header = `WorkTrustbd Recovery Codes\nGenerated: ${timestamp}\n${'='.repeat(50)}\n\n`;
  const codesText = codes.join('\n');
  const fullText = header + codesText + '\n\n' + '='.repeat(50) + '\n⚠️ Keep these codes safe. Each code can be used only once.';

  const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recovery_codes_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const SecurityTab = ({ 
  securityData, 
  setSecurityData, 
  onChangePassword, 
  onTwoFactorToggle,
  saving,
  biometricStatus = false,
  biometricType = '',
  isBiometricSupported = false,
  isBiometricAvailable = false,
  appLockStatus = false,
  onBiometricToggle = null,
  onAppLockToggle = null,
  onChangePin = null,
  onSecurityCheckup = null,
  mustChangePassword = false,
}) => {
  const feedback = useFeedback();
  const sound = useSound();
  const user = auth.currentUser;

  // ── App Lock States ──
  const [isAppLockEnabled, setIsAppLockEnabled] = useState(appLockStatus);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(biometricStatus);
  const [deviceInfo, setDeviceInfo] = useState(null);

  // ── PIN Modal States ──
  const [showPinInput, setShowPinInput] = useState(false);
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [appLockPin, setAppLockPin] = useState('');
  const [appLockConfirmPin, setAppLockConfirmPin] = useState('');
  const [oldPin, setOldPin] = useState('');
  
  // ── Recovery States ──
  const [recoveryStats, setRecoveryStats] = useState(null);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryCodesList, setRecoveryCodesList] = useState([]);

  // ── PIN Attempts States ──
  const [pinAttempts, setPinAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [remainingAttempts, setRemainingAttempts] = useState(5);

  // ── Security History ──
  const [loginHistory, setLoginHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [lastLogin, setLastLogin] = useState(null);

  // ── Security Tips ──
  const [showTips, setShowTips] = useState(false);

  // ============================================================
  // ✅ Sync with Props
  // ============================================================

  useEffect(() => {
    setIsBiometricEnabled(biometricStatus);
  }, [biometricStatus]);

  useEffect(() => {
    setIsAppLockEnabled(appLockStatus);
  }, [appLockStatus]);

  useEffect(() => {
    const loadDeviceInfo = async () => {
      const info = await device.getCurrentDevice();
      setDeviceInfo(info);
    };
    loadDeviceInfo();
  }, []);

  useEffect(() => {
    const loadRecoveryStats = () => {
      const stats = recovery.getRecoveryCodeStats();
      setRecoveryStats(stats);
    };
    loadRecoveryStats();
  }, []);

  // ============================================================
  // ✅ Biometric Handlers
  // ============================================================

  const handleBiometricToggle = async () => {
    if (!isBiometricAvailable) {
      feedback?.showWarning('⚠️ সমর্থন নেই', 'আপনার ডিভাইসে বায়োমেট্রিক সেন্সর পাওয়া যায়নি।');
      return;
    }

    if (onBiometricToggle) {
      const result = await onBiometricToggle();
      if (result?.success) {
        setIsBiometricEnabled(result.enabled);
        if (result.enabled) {
          feedback?.showSuccess('✅ বায়োমেট্রিক চালু হয়েছে', 'আপনার ফিঙ্গারপ্রিন্ট/ফেস ব্যবহার করে লগইন করতে পারবেন।');
          sound?.playEvent(SOUND_EVENTS.SUCCESS);
        } else {
          feedback?.showInfo('ℹ️ বন্ধ', 'বায়োমেট্রিক লক বন্ধ করা হয়েছে।');
          sound?.playEvent(SOUND_EVENTS.CLICK);
        }
      }
    }
  };

  // ============================================================
  // ✅ App Lock Handlers
  // ============================================================

  const handleAppLockToggle = async () => {
    const newState = !isAppLockEnabled;
    
    if (newState) {
      setShowPinInput(true);
      setIsSettingPin(true);
      setIsChangingPin(false);
      setOldPin('');
      setAppLockPin('');
      setAppLockConfirmPin('');
    } else {
      if (onAppLockToggle) {
        const result = await onAppLockToggle(null);
        if (result?.success) {
          setIsAppLockEnabled(false);
          setIsLockedOut(false);
          setLockedUntil(null);
          setPinAttempts(0);
          setRemainingAttempts(5);
          feedback?.showInfo('ℹ️ বন্ধ', 'অ্যাপ লক বন্ধ করা হয়েছে।');
          sound?.playEvent(SOUND_EVENTS.CLICK);
        }
      }
    }
  };

  const handleChangePin = () => {
    setIsChangingPin(true);
    setIsSettingPin(true);
    setShowPinInput(true);
    setOldPin('');
    setAppLockPin('');
    setAppLockConfirmPin('');
  };

  const handleSetPin = async () => {
    if (appLockPin.length < 4) {
      feedback?.showWarning('⚠️ পিন দিন', 'কমপক্ষে ৪ ডিজিটের পিন দিন।');
      return;
    }

    if (appLockPin.length > 6) {
      feedback?.showWarning('⚠️ পিন সীমা', 'সর্বোচ্চ ৬ ডিজিটের পিন দিন।');
      return;
    }

    if (appLockPin !== appLockConfirmPin) {
      feedback?.showWarning('⚠️ মিলছে না', 'পিন মিলছে না। আবার চেষ্টা করুন।');
      return;
    }

    let result;

    if (isChangingPin) {
      if (!oldPin || oldPin.length < 4) {
        feedback?.showWarning('⚠️ পুরনো পিন দিন', 'বর্তমান পিন দিন।');
        return;
      }

      if (!onChangePin) {
        feedback?.showError('❌ ত্রুটি', 'পিন পরিবর্তন ফিচার সক্রিয় নেই।');
        return;
      }

      result = await onChangePin(oldPin, appLockPin);
    } else {
      if (!onAppLockToggle) {
        feedback?.showError('❌ ত্রুটি', 'অ্যাপ লক ফিচার সক্রিয় নেই।');
        return;
      }

      result = await onAppLockToggle(appLockPin);
    }

    if (result?.success) {
      setIsAppLockEnabled(true);
      setIsLockedOut(false);
      setLockedUntil(null);
      setPinAttempts(0);
      setRemainingAttempts(5);
      setShowPinInput(false);
      setIsSettingPin(false);
      setIsChangingPin(false);
      setAppLockPin('');
      setAppLockConfirmPin('');
      setOldPin('');
      
      const message = isChangingPin ? 'পিন পরিবর্তন করা হয়েছে!' : 'অ্যাপ লক চালু হয়েছে!';
      feedback?.showSuccess('✅ সফল', `${message} এখন থেকে অ্যাপ খুলতে নতুন পিন দিতে হবে।`);
      sound?.playEvent(SOUND_EVENTS.SUCCESS);
    } else {
      const errorMsg = result?.error || (isChangingPin ? 'পিন পরিবর্তন করতে সমস্যা হয়েছে' : 'পিন সেট করতে সমস্যা হয়েছে');
      feedback?.showError('❌ ব্যর্থ', errorMsg);
      
      if (isChangingPin && result?.error?.toLowerCase().includes('current')) {
        const oldPinInput = document.querySelector('input[placeholder="বর্তমান PIN দিন"]');
        if (oldPinInput) {
          oldPinInput.classList.add('shake');
          setTimeout(() => oldPinInput.classList.remove('shake'), 500);
        }
      }
    }
  };

  const handleCancelPin = () => {
    setShowPinInput(false);
    setIsSettingPin(false);
    setIsChangingPin(false);
    setAppLockPin('');
    setAppLockConfirmPin('');
    setOldPin('');
  };

  // ============================================================
  // ✅ Recovery Code Handlers
  // ============================================================

  const handleGenerateRecoveryCodes = useCallback(async () => {
    try {
      const result = await recovery.regenerateRecoveryCodes(10);
      
      if (result.success) {
        setRecoveryCodesList(result.codes);
        setShowRecoveryCodes(true);
        
        const stats = recovery.getRecoveryCodeStats();
        setRecoveryStats(stats);
        
        feedback?.showSuccess('✅ Recovery Codes Generated', 'New recovery codes have been generated successfully.');
        sound?.playEvent(SOUND_EVENTS.SUCCESS);
      } else {
        feedback?.showError('❌ Failed', result.message);
      }
    } catch (error) {
      console.error('❌ Generate recovery codes error:', error);
      feedback?.showError('❌ Failed', 'Could not generate recovery codes.');
    }
  }, [feedback, sound]);

  // 🔧 FIX: downloads the codes ALREADY on screen (recoveryCodesList)
  // instead of blindly calling regenerateRecoveryCodes() again.
  const handleDownloadRecoveryCodes = useCallback(async () => {
    if (recoveryCodesList.length > 0) {
      downloadCodesAsFile(recoveryCodesList);
      feedback?.showSuccess('✅ Downloaded', 'Recovery codes downloaded successfully.');
      sound?.playEvent(SOUND_EVENTS.SUCCESS);
      return;
    }

    const confirmed = await feedback.confirm({
      title: 'নতুন Recovery Codes তৈরি করবেন?',
      message: 'এখনো কোনো codes জেনারেট করা হয়নি। ডাউনলোড করতে নতুন codes তৈরি করতে হবে — এতে আগের যেকোনো codes অকার্যকর হয়ে যাবে।',
      variant: 'confirm',
      confirmText: 'নতুন Codes তৈরি করে ডাউনলোড করুন',
      cancelText: 'বাতিল',
    });
    if (!confirmed) return;

    try {
      const result = await recovery.regenerateRecoveryCodes(10);

      if (result.success) {
        setRecoveryCodesList(result.codes);
        downloadCodesAsFile(result.codes);

        const stats = recovery.getRecoveryCodeStats();
        setRecoveryStats(stats);

        feedback?.showSuccess('✅ Downloaded', 'Recovery codes downloaded successfully.');
        sound?.playEvent(SOUND_EVENTS.SUCCESS);
      } else {
        feedback?.showError('❌ Failed', result.message);
      }
    } catch (error) {
      console.error('❌ Download error:', error);
      feedback?.showError('❌ Failed', 'Could not download recovery codes.');
    }
  }, [feedback, sound, recoveryCodesList]);

  const handleCloseRecoveryCodes = useCallback(() => {
    setShowRecoveryCodes(false);
    setRecoveryCodesList([]);
  }, []);

  // ============================================================
  // ✅ Security Checkup
  // ============================================================

  const handleSecurityCheckup = useCallback(() => {
    if (onSecurityCheckup) {
      onSecurityCheckup();
      return;
    }

    const checks = [];

    if (securityData?.newPassword?.length >= 8) {
      checks.push({ name: 'পাসওয়ার্ড', status: '✅ শক্তিশালী' });
    } else {
      checks.push({ name: 'পাসওয়ার্ড', status: '⚠️ দুর্বল' });
    }

    if (securityData?.twoFactorEnabled) {
      checks.push({ name: '2FA', status: '✅ সক্রিয়' });
    } else {
      checks.push({ name: '2FA', status: '⚠️ নিষ্ক্রিয়' });
    }

    if (isBiometricEnabled) {
      checks.push({ name: 'বায়োমেট্রিক', status: '✅ সক্রিয়' });
    } else {
      checks.push({ name: 'বায়োমেট্রিক', status: '⚠️ নিষ্ক্রিয়' });
    }

    if (isAppLockEnabled) {
      checks.push({ name: 'অ্যাপ লক', status: '✅ সক্রিয়' });
    } else {
      checks.push({ name: 'অ্যাপ লক', status: '⚠️ নিষ্ক্রিয়' });
    }

    const allSecure = checks.every(c => c.status.includes('✅'));
    
    if (allSecure) {
      feedback?.showSuccess('🛡️ নিরাপদ', 'আপনার অ্যাকাউন্ট সম্পূর্ণ নিরাপদ!');
    } else {
      const insecure = checks.filter(c => c.status.includes('⚠️'));
      feedback?.showWarning('⚠️ সতর্কতা', `${insecure.length} টি নিরাপত্তা ব্যবস্থা নিষ্ক্রিয় আছে।`);
    }
    
    sound?.playEvent(SOUND_EVENTS.CLICK);
  }, [securityData, isBiometricEnabled, isAppLockEnabled, feedback, sound, onSecurityCheckup]);

  // ============================================================
  // ✅ Fetch Login History - Real-time
  // ============================================================

  useEffect(() => {
    if (!user?.uid) {
      setLoginHistory([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);

    const q = query(
      collection(db, 'login_history'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const history = [];
        snapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          const item = {
            id: doc.id,
            device: data.device || 'Unknown Device',
            ip: data.ip || 'Unknown IP',
            time: data.timestamp?.toDate?.() || new Date(),
            status: data.status || 'success',
            location: data.location || 'Unknown',
            browser: data.browser || 'Unknown',
            os: data.os || 'Unknown',
          };
          history.push(item);
          
          if (index === 0 && item.status === 'success') {
            setLastLogin(item.time);
          }
        });
        setLoginHistory(history);
        setHistoryLoading(false);
      },
      (error) => {
        console.error('Error fetching login history:', error);
        setHistoryLoading(false);
        setLoginHistory([
          { device: 'Chrome - Windows', ip: '192.168.1.1', time: new Date(), status: 'success' },
          { device: 'Safari - iPhone', ip: '192.168.1.2', time: new Date(Date.now() - 86400000), status: 'success' },
        ]);
        if (lastLogin === null) {
          setLastLogin(new Date());
        }
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // ============================================================
  // ✅ Formatting Functions
  // ============================================================

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString('bn-BD', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return String(timestamp);
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    if (!(timestamp instanceof Date)) return String(timestamp);
    
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'এখনই';
    if (minutes < 60) return `${minutes} মিনিট আগে`;
    if (hours < 24) return `${hours} ঘন্টা আগে`;
    if (days < 7) return `${days} দিন আগে`;
    return formatTime(timestamp);
  };

  const getDeviceIcon = (device) => {
    const deviceLower = device?.toLowerCase() || '';
    if (deviceLower.includes('windows')) return 'fa-solid fa-windows';
    if (deviceLower.includes('mac')) return 'fa-solid fa-apple';
    if (deviceLower.includes('iphone') || deviceLower.includes('ipad')) return 'fa-solid fa-mobile-screen';
    if (deviceLower.includes('android')) return 'fa-solid fa-robot';
    if (deviceLower.includes('chrome')) return 'fa-brands fa-chrome';
    if (deviceLower.includes('firefox')) return 'fa-brands fa-firefox';
    if (deviceLower.includes('safari')) return 'fa-brands fa-safari';
    if (deviceLower.includes('edge')) return 'fa-brands fa-edge';
    return 'fa-solid fa-laptop';
  };

  const getStatusColor = (status) => {
    return status === 'success' ? 'var(--status-success)' : 'var(--status-danger)';
  };

  // ============================================================
  // ✅ Biometric Helpers
  // ============================================================

  const getBiometricLabel = useCallback(() => {
    switch (biometricType) {
      case 'fingerprint': return '🔐 ফিঙ্গারপ্রিন্ট লক';
      case 'face': return '😊 ফেস লক';
      case 'iris': return '👁️ আইরিস লক';
      default: return '🔐 বায়োমেট্রিক লক';
    }
  }, [biometricType]);

  const getBiometricIcon = useCallback(() => {
    switch (biometricType) {
      case 'fingerprint': return 'fa-solid fa-fingerprint';
      case 'face': return 'fa-solid fa-face-smile';
      case 'iris': return 'fa-regular fa-eye';
      default: return 'fa-solid fa-lock';
    }
  }, [biometricType]);

  const getBiometricDescription = useCallback(() => {
    const type = biometricType === 'fingerprint' ? 'ফিঙ্গারপ্রিন্ট' : 
                  biometricType === 'face' ? 'ফেস' : 
                  biometricType === 'iris' ? 'আইরিস' : 'বায়োমেট্রিক';
    return `আপনার ${type} ব্যবহার করে অ্যাপ লক করুন।`;
  }, [biometricType]);

  // ============================================================
  // ✅ Render
  // ============================================================
return (
    <div className={styles.securityTab}>
      <div className={styles.securityHeader}>
        <h2><i className="fa-solid fa-shield"></i> নিরাপত্তা</h2>
        <p className={styles.headerSubtitle}>আপনার অ্যাকাউন্ট নিরাপদ রাখতে নিচের সেটিংস কাস্টমাইজ করুন</p>
      </div>

      {/* ── Security Score ── */}
      <div className={styles.securityScore}>
        <div className={styles.scoreCircle}>
          <svg viewBox="0 0 36 36">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--bg-tertiary)" strokeWidth="3" />
            <path 
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
              fill="none" 
              stroke="var(--accent-primary)" 
              strokeWidth="3" 
              strokeDasharray={`${(securityData?.twoFactorEnabled ? 25 : 10)}, 100`} 
            />
          </svg>
          <span className={styles.scoreText}>{securityData?.twoFactorEnabled ? '🔒' : '⚠️'}</span>
        </div>
        <div className={styles.scoreInfo}>
          <h4>নিরাপত্তা স্কোর</h4>
          <p>{securityData?.twoFactorEnabled ? 'উচ্চ' : 'মাঝারি'}</p>
          <small>{securityData?.twoFactorEnabled ? 'আপনার অ্যাকাউন্ট নিরাপদ' : '2FA চালু করুন'}</small>
        </div>
      </div>

      {/* ── Password Section ── */}
      <div className={styles.securitySection}>
        <div className={styles.sectionHeader}>
          <i className="fa-solid fa-key"></i>
          <h3>পাসওয়ার্ড</h3>
        </div>

        {mustChangePassword && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid #f59e0b',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              color: '#f59e0b',
              fontSize: '14px',
            }}
          >
            <i className="fa-solid fa-triangle-exclamation" style={{ marginTop: '2px' }}></i>
            <div>
              <strong>অ্যাডমিন আপনার জন্য একটি সাময়িক পাসওয়ার্ড সেট করেছেন।</strong>
              <p style={{ margin: '4px 0 0' }}>
                নিচে "বর্তমান পাসওয়ার্ড" ঘরে সেই সাময়িক পাসওয়ার্ডটি দিন, তারপর একটি নতুন পাসওয়ার্ড সেট করুন। যতক্ষণ না
                পরিবর্তন করছেন, ততক্ষণ আপনার অ্যাকাউন্ট সাময়িক পাসওয়ার্ড দিয়েই সুরক্ষিত থাকবে।
              </p>
            </div>
          </div>
        )}

        <div className={styles.formGroup}>
          <label>বর্তমান পাসওয়ার্ড {mustChangePassword && <span style={{ color: '#f59e0b' }}>(সাময়িক পাসওয়ার্ড দিন)</span>}</label>
          <input 
            type="password" 
            value={securityData.currentPassword} 
            onChange={(e) => setSecurityData({...securityData, currentPassword: e.target.value})} 
            placeholder="বর্তমান পাসওয়ার্ড দিন" 
            className={styles.input}
          />
        </div>
        
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>নতুন পাসওয়ার্ড</label>
            <input 
              type="password" 
              value={securityData.newPassword} 
              onChange={(e) => setSecurityData({...securityData, newPassword: e.target.value})} 
              placeholder="নতুন পাসওয়ার্ড দিন" 
              className={styles.input}
            />
          </div>
          <div className={styles.formGroup}>
            <label>পাসওয়ার্ড নিশ্চিত করুন</label>
            <input 
              type="password" 
              value={securityData.confirmPassword} 
              onChange={(e) => setSecurityData({...securityData, confirmPassword: e.target.value})} 
              placeholder="নতুন পাসওয়ার্ড পুনরায় দিন" 
              className={styles.input}
            />
          </div>
        </div>
        
        <button 
          className={styles.btnPrimary} 
          onClick={onChangePassword} 
          disabled={saving || !securityData.currentPassword || !securityData.newPassword}
        >
          {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> পরিবর্তন হচ্ছে...</> : '🔑 পাসওয়ার্ড পরিবর্তন করুন'}
        </button>
      </div>

      {/* ── Two-Factor Authentication ── */}
      <div className={styles.securitySection}>
        <div className={styles.sectionHeader}>
          <i className="fa-solid fa-shield-halved"></i>
          <h3>দুই-স্তরের যাচাইকরণ (2FA)</h3>
        </div>

        <ToggleSwitch 
          checked={securityData.twoFactorEnabled}
          onChange={onTwoFactorToggle}
          label="2FA সক্রিয় করুন"
          description="অতিরিক্ত নিরাপত্তার জন্য 2FA সক্রিয় করুন। লগইন করার সময় আপনাকে পরিচয় যাচাই করতে হবে।"
          disabled={saving}
        />

        {securityData.twoFactorEnabled && (
          <div className={`${styles.securityNote} ${styles.success}`}>
            <i className="fa-solid fa-check-circle"></i>
            <span>2FA সক্রিয় আছে। আপনার অ্যাকাউন্ট অতিরিক্ত সুরক্ষিত।</span>
          </div>
        )}
      </div>

      {/* ── Biometric Lock ── */}
      {isBiometricSupported && (
        <div className={styles.securitySection}>
          <div className={styles.sectionHeader}>
            <i className={getBiometricIcon()}></i>
            <h3>{getBiometricLabel()}</h3>
          </div>

          <ToggleSwitch 
            checked={isBiometricEnabled}
            onChange={handleBiometricToggle}
            label={biometricType === 'fingerprint' ? '🔐 ফিঙ্গারপ্রিন্ট দিয়ে লক করুন' : '😊 ফেস দিয়ে লক করুন'}
            description={getBiometricDescription()}
            disabled={!isBiometricAvailable}
          />

          {!isBiometricAvailable && (
            <div className={`${styles.securityNote} ${styles.warning}`}>
              <i className="fa-solid fa-exclamation-triangle"></i>
              <span>আপনার ডিভাইসে বায়োমেট্রিক সেন্সর পাওয়া যায়নি।</span>
            </div>
          )}

          {isBiometricEnabled && (
            <div className={`${styles.securityNote} ${styles.success}`}>
              <i className="fa-solid fa-check-circle"></i>
              <span>বায়োমেট্রিক লক সক্রিয় আছে।</span>
            </div>
          )}
        </div>
      )}

      {/* ── App Lock (PIN) ── */}
      <div className={styles.securitySection}>
        <div className={styles.sectionHeader}>
          <i className="fa-solid fa-lock"></i>
          <h3>📱 অ্যাপ লক (PIN)</h3>
        </div>

        <ToggleSwitch 
          checked={isAppLockEnabled}
          onChange={handleAppLockToggle}
          label="অ্যাপ লক সক্রিয় করুন"
          description="অ্যাপ খুলতে ৪-৬ ডিজিটের PIN দিতে হবে।"
          disabled={saving}
        />

        {isAppLockEnabled && (
          <div className={`${styles.securityNote} ${styles.success}`}>
            <i className="fa-solid fa-check-circle"></i>
            <span>অ্যাপ লক সক্রিয় আছে। অ্যাপ খুলতে PIN দিতে হবে।</span>
          </div>
        )}

        {isAppLockEnabled && !showPinInput && (
          <button className={styles.changePinBtn} onClick={handleChangePin}>
            <i className="fa-solid fa-pen-to-square"></i>
            PIN পরিবর্তন করুন
          </button>
        )}

        {showPinInput && (
          <div className={styles.pinModal}>
            <div className={styles.pinModalContent}>
              <h4>
                <i className="fa-solid fa-lock"></i> 
                {isChangingPin ? 'PIN পরিবর্তন করুন' : 'PIN সেট করুন'}
              </h4>
              <p>{isChangingPin ? 'পুরনো PIN দিয়ে নতুন PIN সেট করুন' : 'অ্যাপ লক করার জন্য ৪-৬ ডিজিটের PIN দিন'}</p>
              
              {isChangingPin && (
                <div className={styles.formGroup}>
                  <label>বর্তমান PIN</label>
                  <input 
                    type="password" 
                    maxLength="6"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={oldPin} 
                    onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))} 
                    placeholder="বর্তমান PIN দিন" 
                    className={styles.input}
                    id="old-pin-input"
                  />
                </div>
              )}
              
              <div className={styles.formGroup}>
                <label>{isChangingPin ? 'নতুন PIN' : 'PIN'}</label>
                <input 
                  type="password" 
                  maxLength="6"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={appLockPin} 
                  onChange={(e) => setAppLockPin(e.target.value.replace(/\D/g, ''))} 
                  placeholder="৪-৬ ডিজিটের PIN" 
                  className={styles.input}
                />
              </div>
              
              <div className={styles.formGroup}>
                <label>PIN নিশ্চিত করুন</label>
                <input 
                  type="password" 
                  maxLength="6"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={appLockConfirmPin} 
                  onChange={(e) => setAppLockConfirmPin(e.target.value.replace(/\D/g, ''))} 
                  placeholder="PIN আবার দিন" 
                  className={styles.input}
                />
              </div>

              <div className={styles.pinActions}>
                <button className={styles.btnPrimary} onClick={handleSetPin}>
                  <i className="fa-solid fa-check"></i> 
                  {isChangingPin ? 'পিন পরিবর্তন করুন' : 'সেভ করুন'}
                </button>
                <button className={styles.btnSecondary} onClick={handleCancelPin}>
                  <i className="fa-solid fa-xmark"></i> বাতিল
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Login History ── */}
      <div className={styles.securitySection}>
        <div className={styles.sectionHeader}>
          <i className="fa-solid fa-clock-rotate-left"></i>
          <h3>লগইন ইতিহাস</h3>
        </div>

        {lastLogin && (
          <div className={styles.lastLogin}>
            <i className="fa-solid fa-clock"></i>
            <span>সর্বশেষ লগইন: <strong>{formatRelativeTime(lastLogin)}</strong></span>
          </div>
        )}

        {historyLoading ? (
          <div className={styles.historyLoading}>
            <i className="fa-solid fa-spinner fa-spin"></i>
            <span>লোড হচ্ছে...</span>
          </div>
        ) : loginHistory.length === 0 ? (
          <div className={styles.historyEmpty}>
            <i className="fa-solid fa-inbox"></i>
            <span>কোন লগইন ইতিহাস নেই</span>
          </div>
        ) : (
          <div className={styles.loginHistory}>
            {loginHistory.map((item, index) => (
              <div key={index} className={`${styles.historyItem} ${item.status === 'failed' ? styles.failed : ''}`}>
                <div className={styles.historyDevice}>
                  <i className={getDeviceIcon(item.device)} style={{ color: getStatusColor(item.status) }} />
                  <span>{item.device}</span>
                </div>
                <div className={styles.historyDetails}>
                  <span className={styles.historyIp}>{item.ip}</span>
                  <span className={styles.historyTime}>{formatTime(item.time)}</span>
                  <span 
                    className={`${styles.historyStatus} ${styles[item.status]}`}
                    style={{ color: getStatusColor(item.status) }}
                  >
                    {item.status === 'success' ? '✅ সফল' : '❌ ব্যর্থ'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recovery Codes Section ── */}
      <div className={styles.securitySection}>
        <div className={styles.sectionHeader}>
          <i className="fa-solid fa-key"></i>
          <h3>🔑 Recovery Codes</h3>
        </div>
        
        <div className={styles.recoveryInfo}>
          <p>Keep these recovery codes safe. Each code can be used only once.</p>
          
          <div className={styles.recoveryStats}>
            <span>Total: {recoveryStats?.total || 0}</span>
            <span>Used: {recoveryStats?.used || 0}</span>
            <span>Remaining: {recoveryStats?.remaining || 0}</span>
          </div>
          
          <div className={styles.recoveryActions}>
            <button className={styles.btnPrimary} onClick={handleGenerateRecoveryCodes}>
              <i className="fa-solid fa-rotate"></i> Generate New Codes
            </button>
            <button className={styles.btnSecondary} onClick={handleDownloadRecoveryCodes}>
              <i className="fa-solid fa-download"></i> Download Codes
            </button>
          </div>
        </div>
      </div>

      {/* ── Security Tips ── */}
      <div className={styles.securityTips}>
        <button className={styles.tipsToggle} onClick={() => setShowTips(!showTips)}>
          <i className="fa-solid fa-lightbulb"></i>
          নিরাপত্তা টিপস {showTips ? '▲' : '▼'}
        </button>
        
        {showTips && (
          <div className={styles.tipsContent}>
            <ul>
              <li><i className="fa-solid fa-check"></i> শক্তিশালী পাসওয়ার্ড ব্যবহার করুন (৮+ অক্ষর, সংখ্যা, চিহ্ন)</li>
              <li><i className="fa-solid fa-check"></i> 2FA সক্রিয় রাখুন</li>
              <li><i className="fa-solid fa-check"></i> অ্যাপ লক ব্যবহার করুন</li>
              <li><i className="fa-solid fa-check"></i> অজানা ডিভাইস থেকে লগইন করবেন না</li>
              <li><i className="fa-solid fa-check"></i> নিয়মিত পাসওয়ার্ড পরিবর্তন করুন</li>
            </ul>
          </div>
        )}
      </div>

      {/* ── Recovery Codes Modal ── */}
      {showRecoveryCodes && recoveryCodesList.length > 0 && (
        <div className={styles.modalOverlay} onClick={handleCloseRecoveryCodes}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>
                <i className="fa-solid fa-key" style={{ color: 'var(--accent-primary)' }}></i>
                Your Recovery Codes
              </h3>
              <button className={styles.modalCloseBtn} onClick={handleCloseRecoveryCodes}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.warningText}>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--status-warning)' }}></i>
                Keep these codes safe. Each code can be used only once.
              </p>
              <div className={styles.codesContainer}>
                {recoveryCodesList.map((code, index) => (
                  <div key={index} className={styles.codeItem}>
                    <span className={styles.codeNumber}>{index + 1}.</span>
                    <span className={styles.codeValue}>{code}</span>
                    <button 
                      className={styles.copyBtn}
                      onClick={() => {
                        navigator.clipboard?.writeText(code);
                        feedback?.showSuccess('✅ Copied', `Code ${index + 1} copied to clipboard`);
                      }}
                    >
                      <i className="fa-regular fa-copy"></i>
                    </button>
                  </div>
                ))}
              </div>
              <button 
                className={`${styles.btnPrimary} ${styles.downloadAllBtn}`}
                onClick={() => {
                  downloadCodesAsFile(recoveryCodesList);
                  feedback?.showSuccess('✅ Downloaded', 'Recovery codes downloaded successfully.');
                  sound?.playEvent(SOUND_EVENTS.SUCCESS);
                }}
              >
                <i className="fa-solid fa-download"></i> Download All Codes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityTab;