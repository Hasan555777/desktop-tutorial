// src/components/AppLock/AppLockScreen.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppLock } from '../hooks/useAppLock';
import { useBiometric } from '../hooks/useBiometric';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../../shared/ui/Sound/SoundEvents';
import { recovery } from '../../../shared/security/recovery';
// import './AppLockScreen.css';
import styles from './AppLockScreen.module.css';

const AppLockScreen = ({ onUnlock }) => {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const sound = useSound();
  
  // ✅ Hooks - setPin renamed to setAppLockPin to avoid conflict with local state
  const { 
    isEnabled, 
    verifyPin, 
    setPin: setAppLockPin,
    isLockedOut, 
    remainingAttempts,
    lockedUntil,
    pinLength,
    getLockTimeRemaining,
    checkLockoutStatus,
    resetLockout,
    isLoading: appLockLoading,
    // ✅ Emergency Unlock Functions
    checkEmergencyUnlock,
    useEmergencyUnlock,
  } = useAppLock();
  
  const { 
    isAvailable: isBiometricAvailable,
    authenticate: authenticateBiometric,
    biometricType,
    isEnabled: isBiometricEnabled,
    isLoading: biometricLoading
  } = useBiometric();

  // ── States ──
  const [pin, setPin] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [error, setError] = useState('');
  const [lockTimeRemaining, setLockTimeRemaining] = useState(0);
  
  // ── Recovery States ──
  // 🔧 FIX (#23 App Lock reset PIN broken, #24 remove demo email
  // send): this used to first ask for an email and show "OTP sent to
  // your email" — but handleSendRecoveryOTP had a literal
  // `// TODO: Implement actual OTP send logic` and just faked a
  // delay. No email was EVER sent. The actual verification
  // (verifyRecoveryCode) checks against backup recovery codes
  // generated via Settings → Security tab, a completely different,
  // already-real mechanism the email step never connected to. Removed
  // the fake email/OTP step entirely — now goes straight to entering
  // a saved recovery code, which is the thing that actually works.
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [showPinReset, setShowPinReset] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');

  // ── Emergency Unlock States ──
  const [emergencyUnlock, setEmergencyUnlock] = useState(null);
  const [showEmergencyUnlock, setShowEmergencyUnlock] = useState(false);
  const [emergencyLoading, setEmergencyLoading] = useState(false);

  const pinRefs = useRef([]);

  // ── Constants ──
  const requiredPinLength = pinLength || 4;
  const MAX_PIN_LENGTH = 6;

  // ============================================================
  // ✅ Check Lockout Status
  // ============================================================

  useEffect(() => {
    if (isLockedOut) {
      const checkLock = () => {
        const status = checkLockoutStatus();
        if (!status.lockedOut) {
          setLockTimeRemaining(0);
          resetLockout();
        } else {
          setLockTimeRemaining(status.remaining || 0);
        }
      };

      checkLock();
      const interval = setInterval(checkLock, 1000);
      return () => clearInterval(interval);
    }
  }, [isLockedOut, checkLockoutStatus, resetLockout]);

  // ============================================================
  // ✅ Check Emergency Unlock
  // ============================================================

  useEffect(() => {
    const checkEmergency = async () => {
      const result = await checkEmergencyUnlock();
      if (result.available) {
        setEmergencyUnlock(result);
        setShowEmergencyUnlock(true);
      } else {
        setEmergencyUnlock(null);
        setShowEmergencyUnlock(false);
      }
    };
    
    if (!isLockedOut && !isSuccess) {
      checkEmergency();
    }
  }, [checkEmergencyUnlock, isLockedOut, isSuccess]);

  // ============================================================
  // ✅ Handle Emergency Unlock
  // ============================================================

  const handleEmergencyUnlock = useCallback(async () => {
    setEmergencyLoading(true);
    try {
      const result = await useEmergencyUnlock();
      if (result.success) {
        feedback?.showSuccess('🔓 Emergency Unlock', result.message);
        setIsSuccess(true);
        sound?.playEvent(SOUND_EVENTS.SUCCESS);
        
        setTimeout(() => {
          onUnlock?.();
          navigate('/settings/security');
        }, 1000);
      } else {
        feedback?.showError('❌ Failed', result.error);
        sound?.playEvent(SOUND_EVENTS.ERROR);
      }
    } catch (error) {
      console.error('❌ Emergency unlock error:', error);
      feedback?.showError('❌ Failed', 'Could not perform emergency unlock.');
    } finally {
      setEmergencyLoading(false);
      setShowEmergencyUnlock(false);
    }
  }, [useEmergencyUnlock, feedback, sound, onUnlock, navigate]);

  // ============================================================
  // ✅ PIN Input Handlers
  // ============================================================

  const handlePinInput = useCallback((value) => {
    if (isLockedOut || isLoading || isSuccess || appLockLoading) return;
    setPin(prev => (prev.length >= MAX_PIN_LENGTH ? prev : [...prev, value]));

    setError('');
    sound?.playEvent(SOUND_EVENTS.CLICK);
  }, [isLockedOut, isLoading, isSuccess, appLockLoading, sound]);

  const handleDelete = useCallback(() => {
    if (isLockedOut || isLoading || isSuccess || appLockLoading) return;
    setPin(prev => prev.slice(0, -1));
    sound?.playEvent(SOUND_EVENTS.CLICK);
  }, [isLockedOut, isLoading, isSuccess, appLockLoading, sound]);

  const handleClear = useCallback(() => {
    if (isLockedOut || isLoading || isSuccess || appLockLoading) return;
    setPin([]);
    setError('');
    sound?.playEvent(SOUND_EVENTS.CLICK);
  }, [isLockedOut, isLoading, isSuccess, appLockLoading, sound]);

  // ============================================================
  // ✅ PIN Verification
  // ============================================================

  const verifyPinHandler = useCallback(async () => {
    if (pin.length < requiredPinLength || isLoading || isSuccess || appLockLoading) return;

    setIsLoading(true);
    setError('');

    try {
      const pinString = pin.join('');
      const result = await verifyPin(pinString);

      if (result.success) {
        setIsSuccess(true);
        sound?.playEvent(SOUND_EVENTS.SUCCESS);
        feedback?.showSuccess('✅ Unlocked', 'Welcome back!');

        setTimeout(() => {
          onUnlock?.();
          navigate('/', { replace: true });
        }, 500);
      } else if (result.lockedOut) {
        setError(`🔒 ${result.error}`);
        sound?.playEvent(SOUND_EVENTS.ERROR);
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
        setPin([]);
      } else {
        setError(`❌ ${result.error}`);
        sound?.playEvent(SOUND_EVENTS.ERROR);
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
        setPin([]);
      }
    } catch (error) {
      console.error('❌ PIN verification error:', error);
      setError('❌ Something went wrong. Try again.');
      if (error.message?.includes('network')) {
        feedback?.showError('Network Error', 'Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [pin, verifyPin, requiredPinLength, isLoading, isSuccess, appLockLoading, sound, feedback, onUnlock, navigate]);

  // ============================================================
  // ✅ Auto-verify when PIN reaches required length
  // ============================================================

  useEffect(() => {
    if (pin.length >= requiredPinLength && !isLoading && !isSuccess && !appLockLoading) {
      verifyPinHandler();
    }
  }, [pin, verifyPinHandler, requiredPinLength, isLoading, isSuccess, appLockLoading]);

  // ============================================================
  // ✅ Biometric Handler
  // ============================================================

  const handleBiometric = useCallback(async () => {
    if (!isBiometricAvailable || isLockedOut || isLoading || appLockLoading) {
      feedback?.showWarning('⚠️ Not available', 'Biometric is not available right now.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await authenticateBiometric();
      if (success) {
        setIsSuccess(true);
        sound?.playEvent(SOUND_EVENTS.SUCCESS);
        feedback?.showSuccess('✅ Unlocked', 'Welcome back!');

        setTimeout(() => {
          onUnlock?.();
          navigate('/', { replace: true });
        }, 500);
      } else {
        setError('❌ Biometric verification failed. Try PIN.');
        sound?.playEvent(SOUND_EVENTS.ERROR);
      }
    } catch (error) {
      console.error('❌ Biometric error:', error);
      
      if (error.name === 'NotAllowedError') {
        setError('❌ Biometric cancelled. Use PIN.');
      } else if (error.name === 'TimeoutError') {
        setError('⏳ Biometric timeout. Try again.');
      } else {
        setError('❌ Biometric failed. Use PIN.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isBiometricAvailable, isLockedOut, isLoading, appLockLoading, authenticateBiometric, sound, feedback, onUnlock, navigate]);

  // ============================================================
  // ✅ Forgot PIN Handler (Recovery)
  // ============================================================

  const handleForgotPin = useCallback(() => {
    setShowForgotPin(true);
    setShowPinReset(false);
    setRecoveryCode('');
    setNewPin('');
    setNewPinConfirm('');
  }, []);

  const handleVerifyRecovery = useCallback(async () => {
    // ✅ Code থেকে dash সরান এবং length চেক করুন
    const cleanCode = recoveryCode.replace(/-/g, '').toUpperCase();
    
    if (cleanCode.length !== 8) {
      feedback?.showWarning('⚠️ Invalid Code', 'Please enter a valid 8-character recovery code.');
      return;
    }

    setIsRecoveryLoading(true);
    try {
      const result = await recovery.verifyRecoveryCode(cleanCode);
      
      if (result.success) {
        feedback?.showSuccess('✅ Verified', 'Recovery code verified. You can now reset your PIN.');
        setShowPinReset(true);
        setRecoveryCode('');
      } else {
        feedback?.showError('❌ Invalid Code', result.message);
        if (result.lockedOut) {
          setTimeout(() => {
            setShowForgotPin(false);
            setRecoveryCode('');
          }, 3000);
        }
      }
    } catch (error) {
      console.error('❌ Recovery error:', error);
      feedback?.showError('❌ Failed', 'Recovery verification failed.');
    } finally {
      setIsRecoveryLoading(false);
    }
  }, [recoveryCode, feedback]);

  const handlePinReset = useCallback(async () => {
    // Validation
    if (!newPin || newPin.length < 4) {
      feedback?.showWarning('⚠️ Invalid PIN', 'PIN must be at least 4 digits.');
      return;
    }

    if (newPin.length > MAX_PIN_LENGTH) {
      feedback?.showWarning('⚠️ Invalid PIN', `PIN must be at most ${MAX_PIN_LENGTH} digits.`);
      return;
    }

    if (newPin !== newPinConfirm) {
      feedback?.showWarning('⚠️ PIN Mismatch', 'PINs do not match. Please try again.');
      return;
    }

    setIsRecoveryLoading(true);
    try {
      // ✅ Actually set the new PIN using setAppLockPin
      const result = await setAppLockPin(newPin);

      if (!result.success) {
        feedback?.showError('❌ Failed', result.error || 'Could not reset PIN.');
        return;
      }

      // ✅ Reset lockout state
      await resetLockout();

      // Close recovery modal
      setShowForgotPin(false);
      setShowPinReset(false);
      setNewPin('');
      setNewPinConfirm('');
      
      // Clear local pin input
      setPin([]);
      
      feedback?.showSuccess('✅ PIN Reset', 'Your PIN has been reset successfully!');
      
      // Unlock the app after PIN reset
      setTimeout(() => {
        onUnlock?.();
        navigate('/', { replace: true });
      }, 1000);
      
    } catch (error) {
      console.error('❌ PIN reset error:', error);
      feedback?.showError('❌ Failed', 'Could not reset PIN. Please try again.');
    } finally {
      setIsRecoveryLoading(false);
    }
  }, [newPin, newPinConfirm, setAppLockPin, resetLockout, feedback, onUnlock, navigate, MAX_PIN_LENGTH]);

  // ============================================================
  // ✅ Keyboard Support
  // ============================================================

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showForgotPin) {
        if (e.key === 'Escape') {
          setShowForgotPin(false);
          setShowRecoveryInput(false);
          setShowPinReset(false);
          setRecoveryCode('');
          setRecoveryEmail('');
          setNewPin('');
          setNewPinConfirm('');
        }
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        handlePinInput(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        handleClear();
      } else if (e.key === 'Enter' && pin.length >= requiredPinLength) {
        verifyPinHandler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePinInput, handleDelete, handleClear, verifyPinHandler, pin, requiredPinLength, showForgotPin]);

  // ============================================================
  // ✅ Render PIN Dots
  // ============================================================

  const renderPinDots = () => {
    const dots = [];
    const totalDots = requiredPinLength;
    
    for (let i = 0; i < totalDots; i++) {
      dots.push(
        <div
          key={i}
          className={`pin-dot ${i < pin.length ? 'filled' : ''} ${
            i === pin.length && !isLoading ? 'active' : ''
          }`}
        >
          {i < pin.length && (
            <span className="pin-dot-fill" />
          )}
        </div>
      );
    }
    return dots;
  };

  // ============================================================
  // ✅ Render Numeric Keypad
  // ============================================================

  const renderKeypad = () => {
    const keys = [
      '1', '2', '3',
      '4', '5', '6',
      '7', '8', '9',
      '', '0', '⌫'
    ];

    return (
      <div className="keypad">
        {keys.map((key, index) => {
          if (key === '') {
            return (
              <button
                key={index}
                className="keypad-empty"
                disabled={isLockedOut || isLoading || isSuccess || appLockLoading}
              />
            );
          }
          
          if (key === '⌫') {
            return (
              <button
                key={index}
                className="keypad-key keypad-delete"
                onClick={handleDelete}
                disabled={isLockedOut || isLoading || isSuccess || appLockLoading}
              >
                <i className="fa-solid fa-delete-left"></i>
              </button>
            );
          }
          
          return (
            <button
              key={index}
              className="keypad-key"
              onClick={() => handlePinInput(key)}
              disabled={isLockedOut || isLoading || isSuccess || appLockLoading}
            >
              {key}
            </button>
          );
        })}
      </div>
    );
  };

  // ============================================================
  // ✅ Render Forgot PIN Modal
  // ============================================================

 // ── Forgot PIN Modal Render ──
const renderForgotPinModal = () => {
  if (!showForgotPin) return null;

  return (
    <div className={styles.forgotPinOverlay} onClick={() => setShowForgotPin(false)}>
      <div className={styles.forgotPinModal} onClick={(e) => e.stopPropagation()}>
        <h3>
          <i className="fa-solid fa-key"></i> 
          {showPinReset ? 'Reset PIN' : 'Forgot PIN?'}
        </h3>
        <p>
          {showPinReset 
            ? 'Enter your new PIN to reset.' 
            : 'Enter one of your saved recovery codes.'}
        </p>

        {showPinReset ? (
          // ── PIN Reset UI ──
          <>
            <div className={styles.formGroup}>
              <label>New PIN</label>
              <input
                type="password"
                className={styles.input}
                maxLength="6"
                inputMode="numeric"
                pattern="[0-9]*"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter new PIN (4-6 digits)"
                disabled={isRecoveryLoading}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Confirm PIN</label>
              <input
                type="password"
                className={styles.input}
                maxLength="6"
                inputMode="numeric"
                pattern="[0-9]*"
                value={newPinConfirm}
                onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="Confirm new PIN"
                disabled={isRecoveryLoading}
              />
            </div>
            <button
              className={styles.btnPrimary}
              onClick={handlePinReset}
              disabled={isRecoveryLoading || !newPin || newPin.length < 4 || newPin !== newPinConfirm}
              style={{ width: '100%' }}
            >
              {isRecoveryLoading ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> Resetting...</>
              ) : (
                'Reset PIN'
              )}
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => {
                setShowForgotPin(false);
                setShowPinReset(false);
                setNewPin('');
                setNewPinConfirm('');
              }}
              style={{ marginTop: '12px', width: '100%' }}
            >
              Cancel
            </button>
          </>
        ) : (
          // ── Recovery Code Input ──
          // 🔧 FIX (#23/#24): this used to be preceded by a fake
          // "enter your email, we'll send a code" step that never
          // actually sent anything. Recovery codes are generated in
          // Settings → Security ("Generate New Codes") — going
          // straight here is the honest, working flow.
          <>
            <div className={styles.formGroup}>
              <label>Recovery Code</label>
              <input
                type="text"
                className={styles.input}
                value={recoveryCode}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  const cleaned = value.replace(/[^A-Z0-9-]/g, '');
                  setRecoveryCode(cleaned);
                }}
                placeholder="Enter recovery code (e.g., A8KF-92LM)"
                maxLength="9"
                disabled={isRecoveryLoading}
              />
              <small className={styles.recoveryHint}>
                Settings → Security থেকে জেনারেট করা কোড দিন। কোড না থাকলে, Settings → Security → "Generate New Codes" থেকে নতুন কোড বানান (App Lock unlock অবস্থায়)।
              </small>
            </div>

            <button
              className={styles.btnPrimary}
              onClick={handleVerifyRecovery}
              disabled={isRecoveryLoading || recoveryCode.replace(/-/g, '').length < 8}
              style={{ width: '100%' }}
            >
              {isRecoveryLoading ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> Verifying...</>
              ) : (
                'Verify & Reset PIN'
              )}
            </button>

            <button
              className={styles.btnSecondary}
              onClick={() => {
                setShowForgotPin(false);
                setRecoveryCode('');
              }}
              style={{ marginTop: '12px', width: '100%' }}
            >
              Cancel
            </button>
          </>
        )}

        {/* ── Emergency Unlock Section ── */}
        {!showPinReset && emergencyUnlock && (
          <div className={styles.emergencyUnlockSection}>
            <div className={styles.emergencyDivider}>
              <span>অথবা</span>
            </div>
            <div className={styles.emergencyInfo}>
              <i className="fa-solid fa-shield-halved"></i>
              <div>
                <p className={styles.emergencyTitle}>অ্যাডমিন ইমার্জেন্সি আনলক উপলব্ধ</p>
                <p className={styles.emergencyDesc}>
                  {emergencyUnlock.requestedBy} দ্বারা অনুরোধ করা হয়েছে
                  {emergencyUnlock.remainingMinutes > 0 && (
                    <span> ({emergencyUnlock.remainingMinutes} মিনিট বাকি)</span>
                  )}
                </p>
              </div>
            </div>
            <button
              className={styles.btnEmergency}
              onClick={handleEmergencyUnlock}
              disabled={emergencyLoading}
            >
              {emergencyLoading ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> প্রক্রিয়াকরণ...</>
              ) : (
                <><i className="fa-solid fa-unlock"></i> ইমার্জেন্সি আনলক করুন</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// ✅ Main Render
// ============================================================

return (
  <div className={styles.appLockScreen}>
    {/* ── Background ── */}
    <div className={styles.lockBackground}>
      <div className={styles.lockGradient}></div>
      <div className={styles.lockPattern}></div>
    </div>

    {/* ── Content ── */}
    <div className={styles.lockContent}>
      {/* ── App Icon ── */}
      <div className={styles.lockAppIcon}>
        <i className="fa-solid fa-cube"></i>
      </div>

      {/* ── Title ── */}
      <h2 className={styles.lockTitle}>🔐 App Lock</h2>
      <p className={styles.lockSubtitle}>
        {isLockedOut
          ? `⏳ Locked for ${Math.ceil(lockTimeRemaining / 60000)} minutes`
          : appLockLoading || biometricLoading
          ? '⏳ Loading...'
          : 'Enter your PIN to unlock'}
      </p>

      {/* ── PIN Dots ── */}
      <div className={`${styles.pinDots} ${isShaking ? styles.shake : ''}`}>
        {renderPinDots()}
      </div>

      {/* ── Error Message ── */}
      {error && (
        <div className={styles.lockError}>
          <i className="fa-solid fa-circle-exclamation"></i>
          <span>{error}</span>
        </div>
      )}

      {/* ── Remaining Attempts ── */}
      {!isLockedOut && remainingAttempts < 5 && remainingAttempts > 0 && (
        <div className={styles.lockAttempts}>
          <i className="fa-solid fa-triangle-exclamation"></i>
          <span>{remainingAttempts} attempts remaining</span>
        </div>
      )}

      {/* ── Keypad ── */}
      {!isLockedOut && !isSuccess && renderKeypad()}

      {/* ── Biometric ── */}
      {isBiometricAvailable && !isLockedOut && !isSuccess && (
        <button
          className={styles.lockBiometric}
          onClick={handleBiometric}
          disabled={isLoading || appLockLoading || biometricLoading}
        >
          {(isLoading || biometricLoading) ? (
            <i className="fa-solid fa-spinner fa-spin"></i>
          ) : (
            <i className={`fa-solid ${biometricType === 'fingerprint' ? 'fa-fingerprint' : 'fa-face-smile'}`}></i>
          )}
          <span>
            {biometricType === 'fingerprint' 
              ? '🔐 Use Fingerprint' 
              : biometricType === 'face'
              ? '😊 Use Face ID'
              : '🔐 Use Biometric'}
          </span>
        </button>
      )}

      {/* ── Forgot PIN ── */}
      {!isLockedOut && !isSuccess && (
        <button
          className={styles.lockForgot}
          onClick={handleForgotPin}
        >
          Forgot PIN?
        </button>
      )}

      {/* ── Success ── */}
      {isSuccess && (
        <div className={styles.lockSuccess}>
          <i className="fa-solid fa-check-circle"></i>
          <span>Unlocked! Welcome back.</span>
        </div>
      )}
    </div>

    {/* ── Forgot PIN Modal ── */}
    {renderForgotPinModal()}
  </div>
);
};

export default AppLockScreen; 