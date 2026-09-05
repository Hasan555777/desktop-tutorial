// src/pages/Register/hooks/useRegisterFlow.js
// Every state, ref, and handler the Register page needs, in one custom
// hook. Register.jsx just calls this and renders.
//
// ============================================================
// 🔧 EARLIER REVISIONS (kept for context):
// - Liveness loop try/finally fix, generation-counter cancellation,
//   hard calibration timeout, manual face-capture fallback.
// - Email/phone uniqueness checks moved to Step 1 (goStep1) and
//   Step 2 (sendOTP) respectively, instead of only surfacing at the
//   very end via Firebase Auth's auth/email-already-in-use error.
//   emailTaken/phoneTaken state + a final phone re-check in
//   handleFinalRegistration (race-condition guard) were added.
// - NID / জন্ম নিবন্ধন number collected in Step 4, duplicate-identity
//   check run in handleFinalRegistration after documents upload.
//
// 🆕 THIS REVISION: identity duplicate-check logic moved to a SHARED
// function — runIdentityDuplicateCheck() in utils/identityUtils.js —
// used by both this file AND Profile.jsx's document (re)upload flow.
// Previously the hash/duplicate-check/identityRecords-save/
// admin-notify logic was hand-duplicated here only, so the Profile
// page's document upload never ran any duplicate check at all (a real
// gap, since a user can skip verification during registration and
// upload documents for the first time from their Profile instead).
// This file's runIdentityDuplicateCheck is now a thin wrapper that
// gathers the register-flow-specific pieces (formData.identityNumber,
// selectedVerify, the uploaded doc URLs) and calls the shared
// implementation — so the two entry points can never drift apart again.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc, increment,
  serverTimestamp, collection, query, where, getDocs, addDoc,
} from "firebase/firestore";
import { auth, db } from '../../../shared/firebase/index';
import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';

import { generateUserId, generateWalletId, generateReferralCode } from '../../../shared/utils/idGenerator';
import { uploadToCloudinary, compressImage, initLiveness, LIVENESS_STEPS, PROGRESS_MAP, getDocumentFolder } from './registerHelpers';
import {
  useFaceApiModels,
  detectFaceInImage,
  detectFrame,
  safeEnhance,
  createFrameEnhancer,
  createBrightnessSampler,
  createAdaptiveDetector,
  calibrateBaseline,
  createStepTracker,
} from './useFaceLiveness';
// 🆕 shared identity-duplicate-check implementation (also used by Profile.jsx)
import { runIdentityDuplicateCheck as runIdentityDuplicateCheckShared } from '../../profile/utils/identityUtils';

// ============================================================
// 📱 OTP API URL
// ============================================================
const OTP_API_URL = import.meta.env.VITE_OTP_API_URL ||
  'https://worktrust-otp-production.hammanmusa362.workers.dev';
// 🔧 FIX (#6 — OTP verification gets stuck): neither the send-otp nor
// verify-otp fetch() call had any timeout. If the Cloudflare Worker was
// slow/cold-starting or the network stalled, the awaited fetch() could
// hang indefinitely — and since nothing ever settles that promise,
// `setOtpVerifying(false)` in the `finally` block never runs either, so
// the UI stays on "OTP যাচাই করা হচ্ছে..." forever with no error and no
// way to retry short of reloading the page. This is the most likely
// cause of the reported "stuck after entering OTP" behavior.
const OTP_REQUEST_TIMEOUT_MS = 15000;

const LOOP_TICK_MS = 70;
const MAX_CALIBRATION_ATTEMPTS = 4;
const CALIBRATION_HARD_TIMEOUT_MS = 5000;
const MANUAL_FALLBACK_TIMEOUT_MS = 20000;

export const useRegisterFlow = () => {
  const navigate = useNavigate();
  const feedback = useFeedback();

  // ── স্টেট ──
  const [fileErrors, setFileErrors] = useState({ nidFront: '', nidBack: '', birth: '', identityNumber: '' });
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  // ── ওটিপি ──
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(30);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState(null);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const otpTimerRef = useRef(null);
  // 🔧 FIX: synchronous re-entry guard — `otpVerifying` (React state) can
  // lag a tick behind rapid-fire calls (double Enter-key submits, a fast
  // double-tap on the new manual Verify button, autofill firing while a
  // typed digit is still in flight), which previously could let two
  // verify-otp requests race each other. A ref is checked/set immediately,
  // before any `await`, so a second call in the same tick is rejected.
  const otpVerifyingRef = useRef(false);

  // 🆕 ইমেইল/ফোন আগে থেকেই ব্যবহৃত কিনা — স্টেপ ১ ও স্টেপ ২-এ দেখানোর জন্য
  const [emailTaken, setEmailTaken] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);

  // 🆕 Manual face upload states
  const [manualUploadAvailable, setManualUploadAvailable] = useState(false);
  const [manualUploading, setManualUploading] = useState(false);
  const manualFaceInputRef = useRef(null);
  const livenessTimeoutWatcherRef = useRef(null);

  // ── ভেরিফিকেশন ──
  const [selectedVerify, setSelectedVerify] = useState(null);
  const [verifySkipped, setVerifySkipped] = useState({ doc: false, face: false });

  // ── ক্যামেরা / লাইভনেস ──
  const [camStream, setCamStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [livenessState, setLivenessState] = useState(initLiveness);
  const [currentLivIdx, setCurrentLivIdx] = useState(0);
  const [livenessComplete, setLivenessComplete] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [facePhotoUrl, setFacePhotoUrl] = useState(null);
  const [faceStatusMsg, setFaceStatusMsg] = useState('');
  const [livenessMessage, setLivenessMessage] = useState('📷 ক্যামেরা চালু করুন');
  const [isLivenessRunning, setIsLivenessRunning] = useState(false);
  const [livenessProgress, setLivenessProgress] = useState(0);

  const [calibrating, setCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationFailed, setCalibrationFailed] = useState(false);
  const [currentStepProgress, setCurrentStepProgress] = useState(0);
  const [lowLightWarning, setLowLightWarning] = useState(false);
  const [noFaceWarning, setNoFaceWarning] = useState(false);

  const { modelsLoaded, modelsLoading, modelError, loadModels } = useFaceApiModels();

  const enhancerRef = useRef(null);
  const brightnessSamplerRef = useRef(null);
  const detectorRef = useRef(null);
  if (!enhancerRef.current) enhancerRef.current = createFrameEnhancer();
  if (!brightnessSamplerRef.current) brightnessSamplerRef.current = createBrightnessSampler();
  if (!detectorRef.current) detectorRef.current = createAdaptiveDetector();
  const baselineRef = useRef(null);
  const calibrationAttemptsRef = useRef(0);
  const calibrationGenerationRef = useRef(0);

  const [selectedFiles, setSelectedFiles] = useState({
    nidFront: null,
    nidBack: null,
    birth: null
  });

  // ── রেফারেন্স ──
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const livenessTimerRef = useRef(null);
  const livenessStartTimeoutRef = useRef(null);
  const isLivenessRunningRef = useRef(false);
  const nidFrontRef = useRef(null);
  const nidBackRef = useRef(null);
  const birthRef = useRef(null);
  const camStreamRef = useRef(null);

  // ── ফর্ম ডেটা ──
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '',
    password: '', confirmPassword: '',
    dob: '', phone: '', countryCode: '+880',
    otp: ['', '', '', '', '', ''],
    role: 'client',
    identityNumber: '', // NID / জন্ম নিবন্ধন নম্বর (স্টেপ ৪)
  });

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    setEmailTaken(false);
  }, [formData.email]);

  useEffect(() => {
    setPhoneTaken(false);
  }, [formData.phone]);

  const updatePhone = useCallback((phone) => {
    setFormData(prev => ({ ...prev, phone }));
    setPhoneVerified(false);
    setVerificationToken(null);
    setOtpSent(false);
    setOtpTimer(30);
    clearInterval(otpTimerRef.current);
  }, []);

  // ════════════════════════════════════════════════════════════════════════════
  // ইমেইল/ফোন ইউনিকনেস চেক (Firestore-এর `users` কালেকশনে)
  // ════════════════════════════════════════════════════════════════════════════
  const checkEmailExists = useCallback(async (email) => {
    const trimmed = (email || '').trim();
    if (!trimmed) return false;
    const q = query(collection(db, 'users'), where('email', '==', trimmed));
    const snap = await getDocs(q);
    return !snap.empty;
  }, []);

  const checkPhoneExists = useCallback(async (phone) => {
    const trimmed = (phone || '').trim();
    if (!trimmed) return false;
    const q = query(collection(db, 'users'), where('phone', '==', trimmed));
    const snap = await getDocs(q);
    return !snap.empty;
  }, []);

  const compressAndPreview = async (file, areaId, previewId, removeBtnId, fileType) => {
    try {
      setFileErrors(prev => ({ ...prev, [fileType]: '' }));

      const compressedFile = await compressImage(file, 600, 400, 0.3);

      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.getElementById(previewId);
        if (preview) preview.src = e.target.result;
        const area = document.getElementById(areaId);
        area?.classList.add('has-file');
        const removeBtn = document.getElementById(removeBtnId);
        if (removeBtn) removeBtn.style.display = 'block';
      };
      reader.readAsDataURL(compressedFile);

      setSelectedFiles(prev => ({ ...prev, [fileType]: compressedFile }));
      console.log(`✅ ${fileType} compressed and preview ready`);

    } catch (error) {
      console.error('Compression error:', error);
      previewFile(file, areaId, previewId, removeBtnId, fileType);
    }
  };

  useEffect(() => {
    camStreamRef.current = camStream;
  }, [camStream]);

  useEffect(() => {
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = PROGRESS_MAP[currentStep] + '%';

    for (let i = 1; i <= 6; i++) {
      const dot = document.getElementById('dot' + i);
      const lbl = document.getElementById('lbl' + i);
      if (!dot) continue;

      dot.classList.remove('active', 'done');
      if (lbl) lbl.classList.remove('active');

      if (i < currentStep) {
        dot.classList.add('done');
        dot.textContent = '✓';
      } else if (i === currentStep) {
        dot.classList.add('active');
        dot.textContent = i < 6 ? String(i) : '✓';
        if (lbl) lbl.classList.add('active');
      } else {
        dot.textContent = i < 6 ? String(i) : '✓';
      }

      const line = document.getElementById(`line${i}${i + 1}`);
      if (line) line.classList.toggle('done', i < currentStep);
    }
  }, [currentStep]);

  useEffect(() => {
    return () => {
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(otpTimerRef.current);
      if (livenessTimerRef.current) {
        clearTimeout(livenessTimerRef.current);
        livenessTimerRef.current = null;
      }
      if (livenessStartTimeoutRef.current) {
        clearTimeout(livenessStartTimeoutRef.current);
        livenessStartTimeoutRef.current = null;
      }
      if (livenessTimeoutWatcherRef.current) {
        clearTimeout(livenessTimeoutWatcherRef.current);
        livenessTimeoutWatcherRef.current = null;
      }
    };
  }, []);

  const showToast = useCallback((msg, type = 'info') => {
    if (type === 'error') {
      feedback.alert.error({ title: msg });
    } else if (type === 'success') {
      feedback.alert.success({ title: msg });
    } else {
      toast(msg);
    }
  }, []);

  const goToStep = useCallback((n) => {
    if (n < 1 || n > 6) return;
    setCurrentStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ স্টেপ ১: অ্যাকাউন্ট তৈরি
  // ════════════════════════════════════════════════════════════════════════════
  const goStep1 = async () => {
    const { firstName, email, password, confirmPassword, dob } = formData;
    const name = firstName.trim();

    if (!name) {
      showToast('❌ নাম লিখুন', 'error');
      return;
    }
    if (name.length < 3) {
      showToast('❌ নাম কমপক্ষে ৩ অক্ষর হতে হবে', 'error');
      return;
    }
    if (!dob) {
      showToast('❌ জন্ম তারিখ নির্বাচন করুন', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById('emailErr')?.classList.add('show');
      return;
    }
    document.getElementById('emailErr')?.classList.remove('show');
    setEmailTaken(false);

    if (password.length < 6) {
      showToast('❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষর', 'error');
      return;
    }
    if (password !== confirmPassword) {
      document.getElementById('pass2Err')?.classList.add('show');
      return;
    }
    document.getElementById('pass2Err')?.classList.remove('show');

    setLoading(true);
    try {
      const exists = await checkEmailExists(email);
      if (exists) {
        setEmailTaken(true);
        showToast('❌ এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। লগইন করুন অথবা পাসওয়ার্ড রিসেট করুন।', 'error');
        return;
      }
    } catch (error) {
      console.error('Email check error:', error);
      showToast('⚠️ ইমেইল যাচাই করা যায়নি, ইন্টারনেট চেক করে আবার চেষ্টা করুন', 'error');
      return;
    } finally {
      setLoading(false);
    }

    showToast('✅ ধাপ ১ সম্পন্ন!', 'success');
    goToStep(2);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ ওটিপি
  // ════════════════════════════════════════════════════════════════════════════
  const startOtpTimer = useCallback(() => {
    clearInterval(otpTimerRef.current);
    setOtpTimer(30);
    otpTimerRef.current = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) { clearInterval(otpTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const clearOtpBoxesUI = () => {
    setTimeout(() => {
      const boxes = document.querySelectorAll('#step2 .otp-box');
      boxes.forEach(box => {
        box.value = '';
        box.classList.remove('filled');
      });
      boxes[0]?.focus();
    }, 0);
  };

  const sendOTP = async () => {
    if (loading) return;

    const phone = formData.phone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      document.getElementById('phoneErr')?.classList.add('show');
      showToast('❌ সঠিক বাংলাদেশি মোবাইল নম্বর দিন', 'error');
      return;
    }
    document.getElementById('phoneErr')?.classList.remove('show');
    setPhoneTaken(false);

    setLoading(true);
    try {
      const exists = await checkPhoneExists(phone);
      if (exists) {
        setPhoneTaken(true);
        showToast(
          '❌ এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। দয়া করে নতুন নম্বর দিন, অথবা পাসওয়ার্ড রিসেট করে অ্যাকাউন্ট ফিরিয়ে আনুন।',
          'error'
        );
        return;
      }

      const fullPhone = `${formData.countryCode.replace('+', '')}${phone.substring(1)}`;
      console.log('📱 Sending OTP to:', fullPhone);

      const response = await fetch(`${OTP_API_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
        // 🔧 FIX: was unbounded — see OTP_REQUEST_TIMEOUT_MS note above.
        signal: AbortSignal.timeout(OTP_REQUEST_TIMEOUT_MS),
      });

      const data = await response.json();
      console.log('📨 OTP API response:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'OTP পাঠানো যায়নি।');
      }

      setOtpSent(true);
      setPhoneVerified(false);
      setVerificationToken(null);
      setFormData(prev => ({ ...prev, otp: ['', '', '', '', '', ''] }));
      clearOtpBoxesUI();
      startOtpTimer();
      showToast('📨 আপনার মোবাইলে OTP পাঠানো হয়েছে', 'success');

    } catch (error) {
      console.error('❌ Send OTP Error:', error);
      // 🔧 FIX: surface a clear message for the timeout/offline case
      // specifically, instead of a generic (and possibly blank) error.
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      showToast(
        '❌ ' + (isTimeout ? 'নেটওয়ার্ক ধীর — OTP পাঠাতে ব্যর্থ, আবার চেষ্টা করুন' : (error.message || 'OTP পাঠানো যায়নি')),
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const resendOTP = async () => {
    if (otpTimer > 0 || loading) return;
    await sendOTP();
  };

  // 🔧 FIX (#6): actual verify-otp request logic pulled out into its own
  // function so both the auto-submit-on-last-digit path AND the new
  // manual "Verify OTP" button call the exact same, single, reliable
  // path — no duplicated/diverging logic between the two entry points.
  const verifyOtpCode = useCallback(async (otp, boxes) => {
    if (otpVerifyingRef.current || phoneVerified) return;

    if (otp.length !== 6) {
      showToast('❌ পুরো ৬ ডিজিটের OTP দিন', 'error');
      return;
    }

    const phone = formData.phone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      showToast('❌ মোবাইল নম্বর সঠিক নয়', 'error');
      return;
    }

    otpVerifyingRef.current = true;
    setOtpVerifying(true);
    try {
      const fullPhone = `${formData.countryCode.replace('+', '')}${phone.substring(1)}`;
      console.log('🔐 Verifying OTP:', { phone: fullPhone, otp });

      const response = await fetch(`${OTP_API_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, otp }),
        // 🔧 FIX: was unbounded — a hung request here left `otpVerifying`
        // stuck `true` forever with no error, no retry, and the UI frozen
        // on "OTP যাচাই করা হচ্ছে..." — this is very likely the exact bug
        // reported ("entering OTP sometimes gets stuck").
        signal: AbortSignal.timeout(OTP_REQUEST_TIMEOUT_MS),
      });

      const data = await response.json();
      console.log('🔐 Verify OTP response:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'ভুল OTP অথবা OTP-এর মেয়াদ শেষ।');
      }

      // ✅ UI is only ever marked verified here, after the backend has
      // actually confirmed success above — never optimistically before this.
      setPhoneVerified(true);
      setVerificationToken(data.token || data.resetToken || 'verified');
      clearInterval(otpTimerRef.current);
      setOtpTimer(0);

      showToast('✅ ফোন নম্বর সফলভাবে যাচাই হয়েছে!', 'success');
      setTimeout(() => goToStep(3), 500);

    } catch (error) {
      console.error('❌ OTP Verification Error:', error);
      boxes?.forEach(box => { box.value = ''; box.classList.remove('filled'); });
      boxes?.[0]?.focus();
      // 🔧 FIX: distinguish a genuine timeout/network failure from an
      // invalid/expired code, so retry guidance actually matches what
      // went wrong instead of always showing the same generic message.
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      showToast(
        '❌ ' + (isTimeout ? 'নেটওয়ার্ক ধীর — OTP যাচাই করা যায়নি, আবার চেষ্টা করুন' : (error.message || 'OTP যাচাই ব্যর্থ হয়েছে')),
        'error'
      );
    } finally {
      otpVerifyingRef.current = false;
      setOtpVerifying(false);
    }
  }, [phoneVerified, formData.phone, formData.countryCode, showToast, goToStep]);

  const otpInput = useCallback((el, idx) => {
    const val = el.value.replace(/[^0-9]/g, '');
    el.value = val;
    el.classList.toggle('filled', !!val);

    const boxes = document.querySelectorAll('#step2 .otp-box');
    if (val && idx < 5) {
      boxes[idx + 1]?.focus();
    }

    if (idx !== 5 || !val || otpVerifyingRef.current || phoneVerified) return;

    const otp = [...boxes].map(box => box.value).join('');
    verifyOtpCode(otp, boxes);
  }, [phoneVerified, verifyOtpCode]);

  // 🆕 FIX (#6 — requirement): explicit "Verify OTP" button, since
  // auto-submit-on-last-digit alone isn't reliable for every input path
  // (SMS autofill / paste that fills all six boxes at once can land
  // without ever firing the idx===5 change handler the auto-submit path
  // depends on). Reads the current boxes directly so it works no matter
  // how the digits got into them.
  const verifyOtp = useCallback(() => {
    const boxes = [...document.querySelectorAll('#step2 .otp-box')];
    const otp = boxes.map(box => box.value).join('');
    verifyOtpCode(otp, boxes);
  }, [verifyOtpCode]);


  
  // ════════════════════════════════════════════════════════════════════════════
  // ✅ স্টেপ ৩: যাচাই পদ্ধতি
  // ════════════════════════════════════════════════════════════════════════════
  const selectVerify = (type) => setSelectedVerify(type);

  const goStep3 = () => {
    if (!selectedVerify) {
      showToast('❌ একটি যাচাই পদ্ধতি বেছে নিন', 'error');
      return;
    }
    showToast('✅ যাচাই পদ্ধতি নির্বাচিত', 'success');
    goToStep(4);
  };

  const skipVerification = () => {
    setVerifySkipped({ doc: true, face: true });
    setSelectedVerify(null);
    showToast('⏭ যাচাই এড়িয়ে গেছেন', 'warning');
    goToStep(6);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ স্টেপ ৪: ডকুমেন্ট আপলোড
  // ════════════════════════════════════════════════════════════════════════════
  const previewFile = (file, areaId, previewId, removeBtnId, fileType) => {
    if (!file) return;
    const area = document.getElementById(areaId);
    const preview = document.getElementById(previewId);
    const removeBtn = document.getElementById(removeBtnId);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        if (preview) preview.src = e.target.result;
        area?.classList.add('has-file');
        if (removeBtn) removeBtn.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      area?.classList.add('has-file');
      if (removeBtn) removeBtn.style.display = 'block';
    }

    if (fileType) {
      setSelectedFiles(prev => ({ ...prev, [fileType]: file }));
      setFileErrors(prev => ({ ...prev, [fileType]: '' }));
    }
    console.log(`✅ File selected: ${file.name} (${file.size} bytes)`);
  };

  const removeFile = (inputRef, areaId, previewId, removeBtnId, fileType) => {
    if (inputRef.current) inputRef.current.value = '';
    const preview = document.getElementById(previewId);
    if (preview) preview.src = '';
    document.getElementById(areaId)?.classList.remove('has-file');
    const rb = document.getElementById(removeBtnId);
    if (rb) rb.style.display = 'none';

    if (fileType) {
      setSelectedFiles(prev => ({ ...prev, [fileType]: null }));
      setFileErrors(prev => ({ ...prev, [fileType]: '' }));
    }
    toast('🗑️ ফাইল সরানো হয়েছে');
  };

  const goStep4 = () => {
    if (selectedVerify === 'nid' || selectedVerify === 'birth') {
      const idNum = formData.identityNumber.trim();
      if (!idNum) {
        setFileErrors(prev => ({ ...prev, identityNumber: 'দয়া করে আইডি নম্বর দিন' }));
        showToast(
          selectedVerify === 'birth' ? '❌ জন্ম নিবন্ধন নম্বর দিন' : '❌ NID নম্বর দিন',
          'error'
        );
        return;
      }
      if (idNum.length < 6) {
        setFileErrors(prev => ({ ...prev, identityNumber: 'নম্বরটি সঠিক মনে হচ্ছে না' }));
        showToast('❌ সঠিক আইডি নম্বর দিন', 'error');
        return;
      }
      setFileErrors(prev => ({ ...prev, identityNumber: '' }));
    }

    if (selectedVerify === 'nid') {
      if (!selectedFiles.nidFront || !selectedFiles.nidBack) {
        showToast('❌ উভয় পাশের ছবি আপলোড করুন', 'error');
        return;
      }
    } else if (selectedVerify === 'birth') {
      if (!selectedFiles.birth) {
        showToast('❌ সনদের ছবি আপলোড করুন', 'error');
        return;
      }
    }
    showToast('✅ ডকুমেন্ট প্রস্তুত', 'success');
    goToStep(5);
  };

  const skipToFace = () => {
    setVerifySkipped(prev => ({ ...prev, doc: true }));
    goToStep(5);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ লাইভনেস রিসেট
  // ════════════════════════════════════════════════════════════════════════════
  const resetLiveness = useCallback(() => {
    calibrationGenerationRef.current++;

    if (livenessTimeoutWatcherRef.current) {
      clearTimeout(livenessTimeoutWatcherRef.current);
      livenessTimeoutWatcherRef.current = null;
    }
    setManualUploadAvailable(false);

    isLivenessRunningRef.current = false;
    setIsLivenessRunning(false);
    setLivenessState(initLiveness());
    setCurrentLivIdx(0);
    setLivenessComplete(false);
    setFaceStatusMsg('');
    setLivenessProgress(0);
    setCurrentStepProgress(0);
    setCalibrating(false);
    setCalibrationProgress(0);
    setCalibrationFailed(false);
    setLowLightWarning(false);
    setNoFaceWarning(false);
    baselineRef.current = null;
    if (livenessTimerRef.current) {
      clearTimeout(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }
    if (livenessStartTimeoutRef.current) {
      clearTimeout(livenessStartTimeoutRef.current);
      livenessStartTimeoutRef.current = null;
    }
  }, []);

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ স্টেপ ৫: ফেস ভেরিফিকেশন
  // ════════════════════════════════════════════════════════════════════════════
  const stopCamera = useCallback(() => {
    calibrationGenerationRef.current++;
    
    if (livenessTimeoutWatcherRef.current) {
      clearTimeout(livenessTimeoutWatcherRef.current);
      livenessTimeoutWatcherRef.current = null;
    }
    setManualUploadAvailable(false);
    
    if (livenessTimerRef.current) {
      clearTimeout(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }
    if (livenessStartTimeoutRef.current) {
      clearTimeout(livenessStartTimeoutRef.current);
      livenessStartTimeoutRef.current = null;
    }
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    setCamStream(null);
    setCameraActive(false);
    isLivenessRunningRef.current = false;
    setIsLivenessRunning(false);
    resetLiveness();
    setLivenessMessage('📷 ক্যামেরা বন্ধ');
    showToast('📷 ক্যামেরা বন্ধ', 'info');
  }, [resetLiveness, showToast]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (livenessTimeoutWatcherRef.current) {
      clearTimeout(livenessTimeoutWatcherRef.current);
      livenessTimeoutWatcherRef.current = null;
    }
    setManualUploadAvailable(false);

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      throw new Error('ছবি তৈরি করা যায়নি');
    }

    if (livenessTimerRef.current) {
      clearTimeout(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    setCamStream(null);
    setCameraActive(false);
    isLivenessRunningRef.current = false;
    setIsLivenessRunning(false);

    setLivenessMessage('🔍 ছবি যাচাই করা হচ্ছে...');
    try {
      const finalCheck = await detectFaceInImage(canvas);
      if (!finalCheck) {
        setLivenessMessage('⚠️ ছবিতে মুখ শনাক্ত হয়নি — আবার চেষ্টা করুন');
        showToast('⚠️ ছবিতে মুখ শনাক্ত হয়নি, দয়া করে আবার চেষ্টা করুন', 'warning');
        setFaceVerified(false);
        setFaceStatusMsg('');
        resetLiveness();
        return;
      }
    } catch (err) {
      console.error('Final face-check error:', err);
    }

    setFaceVerified(true);
    setFaceStatusMsg('captured');
    setLivenessMessage('📤 ছবি আপলোড করা হচ্ছে...');

    try {
      const file = new File([blob], 'face_photo.jpg', { type: 'image/jpeg' });
      const result = await uploadToCloudinary(file, 'face_photos');

      setFacePhotoUrl(result.url);
      setLivenessMessage('✅ মুখমণ্ডলের ছবি সফলভাবে আপলোড হয়েছে!');
      showToast('✅ মুখমণ্ডলের ছবি সফলভাবে ক্যাপচার ও আপলোড হয়েছে', 'success');
      console.log("✅ Face photo uploaded:", result.url);

      setTimeout(() => goToStep(6), 800);

    } catch (err) {
      console.error('Face photo upload error:', err);
      setFaceVerified(false);
      setFacePhotoUrl(null);
      setFaceStatusMsg('');
      setLivenessMessage('⚠️ ছবি আপলোড হয়নি, আবার চেষ্টা করুন');
      showToast('⚠️ ছবি আপলোড হয়নি, আবার চেষ্টা করুন', 'warning');
    }
  }, [showToast, goToStep, resetLiveness]);

  const runLivenessLoop = useCallback((baseline, generation) => {
    const totalSteps = LIVENESS_STEPS.length;
    let stepIdx = 0;
    let tracker = createStepTracker(LIVENESS_STEPS[stepIdx].key, baseline);
    let noFaceStreak = 0;
    let stepStartedAt = Date.now();

    setLivenessState(initLiveness());
    setCurrentLivIdx(0);
    setLivenessComplete(false);
    setCurrentStepProgress(0);
    setLivenessProgress(0);
    setNoFaceWarning(false);

    isLivenessRunningRef.current = true;
    setIsLivenessRunning(true);

    const isStale = () => calibrationGenerationRef.current !== generation;

    const loop = async () => {
      if (!isLivenessRunningRef.current || isStale()) return;

      try {
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          return;
        }

        const brightness = brightnessSamplerRef.current(video);
        setLowLightWarning(brightness < 55);

        const input = safeEnhance(enhancerRef.current, video, brightness);

        let detection = null;
        try {
          detection = await detectFrame(input, detectorRef.current, brightness);
        } catch (err) {
          console.error('Liveness detection error:', err);
        }

        if (!isLivenessRunningRef.current || isStale()) return;

        if (!detection) {
          noFaceStreak++;
          setNoFaceWarning(noFaceStreak > 6);
          setLivenessMessage(
            brightness < 55
              ? '💡 আলো একটু বাড়ান, মুখ দেখা যাচ্ছে না'
              : '🙂 ক্যামেরার সামনে সোজা মুখ রাখুন'
          );
        } else {
          noFaceStreak = 0;
          setNoFaceWarning(false);

          const key = LIVENESS_STEPS[stepIdx].key;
          const value =
            key === 'blink' ? detection.ear :
            key === 'mouth' ? detection.mar :
            detection.yaw;

          const result = tracker.update(value);
          setCurrentStepProgress(result.progress);
          setLivenessMessage(result.message || `${LIVENESS_STEPS[stepIdx].emoji} ${LIVENESS_STEPS[stepIdx].label}`);

          const overall = ((stepIdx + result.progress / 100) / totalSteps) * 100;
          setLivenessProgress(overall);

          if (Date.now() - stepStartedAt > 12000 && (key === 'turnRight' || key === 'turnLeft')) {
            setLivenessMessage('↩️ মাথা আরেকটু বেশি ঘোরান, ক্যামেরার কাছে আসুন');
          }

          if (result.done) {
            setLivenessState(prev => prev.map((s, idx) => idx === stepIdx ? { ...s, done: true } : s));
            stepIdx++;
            stepStartedAt = Date.now();

            if (stepIdx >= totalSteps) {
              isLivenessRunningRef.current = false;
              setIsLivenessRunning(false);
              setLivenessComplete(true);
              setFaceStatusMsg('complete');
              setLivenessProgress(100);
              setLivenessMessage('🎉 সব ধাপ সম্পন্ন! ছবি তোলা হচ্ছে...');
              showToast('🎉 লাইভনেস যাচাই সম্পন্ন!', 'success');
              setTimeout(() => capturePhoto(), 600);
              return;
            }
            tracker = createStepTracker(LIVENESS_STEPS[stepIdx].key, baseline);
            setCurrentLivIdx(stepIdx);
            setCurrentStepProgress(0);
          }
        }
      } catch (outerErr) {
        console.error('Liveness loop tick error (recovered):', outerErr);
      } finally {
        if (isLivenessRunningRef.current && !isStale()) {
          livenessTimerRef.current = setTimeout(loop, LOOP_TICK_MS);
        }
      }
    };

    loop();
  }, [showToast, capturePhoto]);

  const startLivenessFlow = useCallback(async () => {
    if (isLivenessRunningRef.current || livenessComplete) return;

    if (!modelsLoaded) {
      showToast('⚠️ ফেস মডেল এখনও লোড হচ্ছে, একটু অপেক্ষা করুন...', 'warning');
      return;
    }
    if (!videoRef.current) return;

    const myGeneration = ++calibrationGenerationRef.current;
    const isStale = () => calibrationGenerationRef.current !== myGeneration || !camStreamRef.current;

    setCalibrating(true);
    setCalibrationFailed(false);
    setCalibrationProgress(0);
    setLivenessMessage('📐 ক্যামেরা মাপা হচ্ছে... সোজা তাকান');

    try {
const baseline = await Promise.race([
  calibrateBaseline({
    videoEl: videoRef.current,
    enhancer: enhancerRef.current,
    brightnessSampler: brightnessSamplerRef.current,
    detector: detectorRef.current,
    sampleCount: 6,
    intervalMs: 90,
    maxDurationMs: 4000,
    onSample: ({ progress }) => {
      if (!isStale()) setCalibrationProgress(progress);
    },
    isCancelled: isStale,
  }),
  new Promise((_, reject) => setTimeout(() => {
    const e = new Error('ক্যালিব্রেশন সময়সীমা শেষ');
    e.reason = 'timeout';
    reject(e);
  }, CALIBRATION_HARD_TIMEOUT_MS)),
]);

      if (isStale()) return;

      baselineRef.current = baseline;
      setLowLightWarning(baseline.brightness < 55);
      setCalibrating(false);
      calibrationAttemptsRef.current = 0;

      if (!isLivenessRunningRef.current) {
        runLivenessLoop(baseline, myGeneration);
      }
    } catch (err) {
      if (isStale()) return;

      console.error('Calibration failed:', err);
      setCalibrating(false);
      calibrationAttemptsRef.current += 1;

      const msg = err.reason === 'low-light'
        ? '💡 আলো কম মনে হচ্ছে, আলোর দিকে মুখ করে আবার চেষ্টা করা হচ্ছে...'
        : err.reason === 'timeout'
          ? '⏱️ একটু সময় বেশি লাগছে, আবার চেষ্টা করা হচ্ছে...'
          : '🙂 মুখ ঠিকমতো শনাক্ত হয়নি, আবার চেষ্টা করা হচ্ছে...';
      setLivenessMessage(msg);

      if (calibrationAttemptsRef.current < MAX_CALIBRATION_ATTEMPTS) {
        livenessStartTimeoutRef.current = setTimeout(() => {
          if (!isStale()) startLivenessFlow();
        }, 1800);
      } else {
        setCalibrationFailed(true);
        setManualUploadAvailable(true);
        showToast(
          err.reason === 'low-light'
            ? '💡 আলো খুব কম — আলোর কাছে গিয়ে আবার চেষ্টা করুন অথবা ছবি আপলোড করুন'
            : '🙂 মুখ শনাক্ত করা যাচ্ছে না — ক্যামেরার সামনে সোজা তাকান অথবা ছবি আপলোড করুন',
          'warning'
        );
      }
    }
  }, [modelsLoaded, livenessComplete, showToast, runLivenessLoop]);

  const retryCalibration = useCallback(() => {
    calibrationAttemptsRef.current = 0;
    setCalibrationFailed(false);
    setManualUploadAvailable(false);
    startLivenessFlow();
  }, [startLivenessFlow]);

  const startCamera = async () => {
    if (!modelsLoaded) {
      if (!modelsLoading) loadModels();
      showToast('⏳ ফেস মডেল লোড হচ্ছে, একটু পরে আবার চেষ্টা করুন...', 'info');
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
      } catch (innerErr) {
        console.warn('facingMode "user" ব্যর্থ, সাধারণ ভিডিও দিয়ে চেষ্টা করা হচ্ছে:', innerErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      setCamStream(stream);
      camStreamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      resetLiveness();
      calibrationAttemptsRef.current = 0;
      setLivenessMessage('👤 ক্যামেরার সামনে সোজা তাকান...');
      showToast('📷 ক্যামেরা চালু হয়েছে', 'success');

      setManualUploadAvailable(false);
      if (livenessTimeoutWatcherRef.current) {
        clearTimeout(livenessTimeoutWatcherRef.current);
      }
      livenessTimeoutWatcherRef.current = setTimeout(() => {
        setManualUploadAvailable(true);
      }, MANUAL_FALLBACK_TIMEOUT_MS);

      if (livenessStartTimeoutRef.current) {
        clearTimeout(livenessStartTimeoutRef.current);
      }
      livenessStartTimeoutRef.current = setTimeout(() => {
        startLivenessFlow();
      }, 900);

    } catch (e) {
      const msg = e.name === 'NotAllowedError' ? '⚠️ ক্যামেরা অনুমতি দিন।' :
                  e.name === 'NotFoundError'   ? '⚠️ ক্যামেরা পাওয়া যায়নি।' :
                  '⚠️ ক্যামেরা চালু হয়নি: ' + e.message;
      showToast(msg, 'error');
      setLivenessMessage('⚠️ ' + msg);
    }
  };

const handleManualCapture = useCallback(async () => {
  const video = videoRef.current;
  const canvas = canvasRef.current;

  if (!video || !canvas || !camStreamRef.current) {
    showToast('⚠️ ক্যামেরা চালু নেই, প্রথমে ক্যামেরা চালু করুন', 'error');
    return;
  }

  setManualUploading(true);
  setLivenessMessage('📸 ছবি তোলা হচ্ছে...');

  calibrationGenerationRef.current++;
  if (livenessTimerRef.current) {
    clearTimeout(livenessTimerRef.current);
    livenessTimerRef.current = null;
  }
  if (livenessStartTimeoutRef.current) {
    clearTimeout(livenessStartTimeoutRef.current);
    livenessStartTimeoutRef.current = null;
  }
  if (livenessTimeoutWatcherRef.current) {
    clearTimeout(livenessTimeoutWatcherRef.current);
    livenessTimeoutWatcherRef.current = null;
  }
  isLivenessRunningRef.current = false;
  setIsLivenessRunning(false);
  setManualUploadAvailable(false);

  try {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('ছবি তৈরি করা যায়নি');

    camStreamRef.current?.getTracks().forEach(t => t.stop());
    setCamStream(null);
    setCameraActive(false);

    setLivenessMessage('🔍 ছবি যাচাই করা হচ্ছে...');
    let hasFace = true;
    try {
      const detection = await detectFaceInImage(canvas);
      hasFace = !!detection;
    } catch (err) {
      console.warn('Manual capture face-check skipped:', err.message);
    }

    if (!hasFace) {
      showToast('⚠️ ছবিতে স্পষ্ট মুখ পাওয়া যায়নি, আলো ঠিক করে আবার ক্যামেরা চালু করুন', 'warning');
      setLivenessMessage('📷 ক্যামেরা চালু করুন');
      setManualUploading(false);
      return;
    }

    setLivenessMessage('📤 ছবি আপলোড করা হচ্ছে...');
    const file = new File([blob], 'face_photo_manual.jpg', { type: 'image/jpeg' });
    const result = await uploadToCloudinary(file, 'face_photos');

    setFacePhotoUrl(result.url);
    setFaceVerified(true);
    setFaceStatusMsg('captured');
    setLivenessMessage('✅ ছবি সফলভাবে আপলোড হয়েছে!');
    showToast('✅ ফেস ছবি আপলোড সম্পন্ন', 'success');
    setTimeout(() => goToStep(6), 600);

  } catch (err) {
    console.error('Manual capture error:', err);
    showToast('⚠️ ছবি আপলোড ব্যর্থ হয়েছে, আবার চেষ্টা করুন', 'error');
    setLivenessMessage('📷 ক্যামেরা চালু করুন');
  } finally {
    setManualUploading(false);
  }
}, [showToast, goToStep]);

  const skipFace = useCallback(() => {
    setVerifySkipped(prev => ({ ...prev, face: true }));
    calibrationGenerationRef.current++;
    
    if (livenessTimeoutWatcherRef.current) {
      clearTimeout(livenessTimeoutWatcherRef.current);
      livenessTimeoutWatcherRef.current = null;
    }
    setManualUploadAvailable(false);
    
    if (livenessTimerRef.current) {
      clearTimeout(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }
    if (livenessStartTimeoutRef.current) {
      clearTimeout(livenessStartTimeoutRef.current);
      livenessStartTimeoutRef.current = null;
    }
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    setCamStream(null);
    setCameraActive(false);
    isLivenessRunningRef.current = false;
    setIsLivenessRunning(false);
    resetLiveness();
    showToast('⏭ ফেস ভেরিফিকেশন এড়িয়ে গেছেন', 'warning');
    goToStep(6);
  }, [resetLiveness, showToast, goToStep]);

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ ইউনিক আইডি ও ওয়ালেট
  // ════════════════════════════════════════════════════════════════════════════
  const createWallet = async (userId, walletId) => {
    await setDoc(doc(db, 'wallets', userId), {
      userId: userId,
      walletId: walletId,
      balance: 0,
      currency: 'BDT',
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    console.log(`✅ Wallet created with ID: ${walletId}`);
    return walletId;
  };

  const processReferral = async (userId, referralCode) => {
    const snap = await getDocs(query(collection(db, 'users'), where('referralCode', '==', referralCode)));
    if (!snap.empty) {
      await updateDoc(doc(db, 'users', snap.docs[0].id), { referralPoints: increment(10) });
    }
  };

  // 🔧 FIX (#7 — document upload sometimes fails / doesn't reach Identity
  // DB): this used to upload files one at a time in a plain for-loop and
  // throw on the FIRST failure — which discarded any file that HAD
  // already uploaded successfully (e.g. NID front succeeds, NID back
  // fails on a network blip) and skipped the Firestore write entirely,
  // so nothing was ever persisted even though Cloudinary already has the
  // successful file sitting orphaned in storage. Now every upload is
  // attempted regardless of the others' outcome, whatever succeeds is
  // still saved to Firestore, and only the files that failed are
  // reported back — so a partial failure is recoverable (retryable from
  // Profile) instead of silently losing everything.
  const uploadDocuments = useCallback(async (userId) => {
    console.log("📤 [START] Uploading documents. State files:", selectedFiles);

    const requiredTypes = [];
    if (selectedVerify === 'nid') {
      requiredTypes.push('nidFront', 'nidBack');
    } else if (selectedVerify === 'birth') {
      requiredTypes.push('birth');
    } else {
      return { uploadResults: [], failedTypes: [] };
    }

    for (const type of requiredTypes) {
      if (!selectedFiles[type]) {
        throw new Error(`${type} ফাইল পাওয়া যায়নি।`);
      }
    }

    const uploadTasks = requiredTypes.map(type => ({
      file: selectedFiles[type],
      type: type,
      folder: getDocumentFolder(type),
    }));

    const settled = await Promise.allSettled(
      uploadTasks.map(task => uploadToCloudinary(task.file, task.folder).then(result => ({ task, result })))
    );

    const uploadResults = [];
    const failedTypes = [];
    settled.forEach((outcome, i) => {
      const task = uploadTasks[i];
      if (outcome.status === 'fulfilled') {
        const { result } = outcome.value;
        uploadResults.push({
          type: task.type,
          url: result.url,
          publicId: result.publicId,
          uploadedAt: new Date().toISOString()
        });
        console.log(`✅ ${task.type} uploaded successfully`);
      } else {
        console.error(`❌ ${task.type} upload failed:`, outcome.reason);
        failedTypes.push(task.type);
      }
    });

    // 🔧 FIX: persist whatever DID succeed, even if it's not everything —
    // this used to be gated behind "every single file succeeded," so a
    // single failed file meant NOTHING reached Firestore/admin/Identity
    // DB even though other files had already uploaded fine.
    if (uploadResults.length > 0) {
      const documents = {};
      for (const result of uploadResults) {
        documents[result.type] = {
          url: result.url,
          publicId: result.publicId,
          uploadedAt: result.uploadedAt,
          status: 'pending',
          rejectReason: ''
        };
      }

      console.log("📄 Documents object to save:", JSON.stringify(documents, null, 2));

      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          throw new Error("User document doesn't exist!");
        }

        await updateDoc(userRef, {
          documents: documents,
          // 🔧 FIX: only claim "fully uploaded" when every required file
          // actually made it — a partial success is still saved, but
          // shouldn't be indistinguishable from a complete submission
          // (completionScore/verificationStatus in handleFinalRegistration
          // and admin's queue both key off this).
          documentsUploaded: failedTypes.length === 0,
          documentVerified: false,
          documentType: selectedVerify || 'nid',
          documentSubmittedAt: new Date().toISOString(),
          verificationStatus: failedTypes.length === 0 ? 'pending' : 'incomplete',
        });

        console.log("✅ Documents saved to Firestore successfully!");
      } catch (error) {
        console.error("❌ Failed to save documents to Firestore:", error);
        throw error;
      }
    }

    if (failedTypes.length > 0) {
      const err = new Error(
        `${failedTypes.join(', ')} আপলোড করতে ব্যর্থ হয়েছে — প্রোফাইল থেকে আবার আপলোড করুন।`
      );
      err.uploadResults = uploadResults;
      err.failedTypes = failedTypes;
      err.partial = uploadResults.length > 0;
      throw err;
    }

    return { uploadResults, failedTypes };
  }, [selectedFiles, selectedVerify]);

  // ════════════════════════════════════════════════════════════════════════════
  // 🆕 আইডি ডুপ্লিকেট-চেক — এখন শুধু একটা পাতলা wrapper, আসল লজিক
  // utils/identityUtils.js-এর runIdentityDuplicateCheck()-এ, যেটা
  // Profile.jsx-ও ব্যবহার করে। uploadDocuments() সফল হওয়ার পর কল হয়।
  // রেজিস্ট্রেশন কখনো এই ধাপের কারণে থামে না বা ব্যর্থ হয় না।
  // ════════════════════════════════════════════════════════════════════════════
  const runIdentityDuplicateCheck = useCallback(async ({ userId, uniqueId, fullName, phone, email, uploadedDocs }) => {
    const idNumber = formData.identityNumber.trim();
    if (!idNumber) return;

    const idType = selectedVerify === 'birth' ? 'birth_certificate' : 'nid';
    const frontDoc = uploadedDocs.find(u => u.type === 'nidFront' || u.type === 'birth');
    const backDoc = uploadedDocs.find(u => u.type === 'nidBack');

    await runIdentityDuplicateCheckShared({
      userId,
      uniqueId,
      fullName,
      phone,
      email,
      identityNumber: idNumber,
      identityType: idType,
      documentFrontUrl: frontDoc?.url || '',
      documentBackUrl: backDoc?.url || '',
    });
  }, [formData.identityNumber, selectedVerify]);

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ ফাইনাল রেজিস্ট্রেশন
  // ════════════════════════════════════════════════════════════════════════════
  const handleFinalRegistration = async () => {
    if (loading) return;

    if (!phoneVerified || !verificationToken) {
      feedback.alert.error({ title: '❌ দয়া করে ফোন নম্বর OTP দিয়ে যাচাই করুন।' });
      goToStep(2);
      return;
    }

    setLoading(true);

    let createdUser = null;

    try {
      const { firstName, lastName, email, password, dob, phone, countryCode, role } = formData;

      try {
        const phoneAlreadyUsed = await checkPhoneExists(phone.trim());
        if (phoneAlreadyUsed) {
          feedback.alert.error({ title: '❌ এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি হয়ে গেছে। দয়া করে নতুন নম্বর দিয়ে আবার চেষ্টা করুন।' });
          setLoading(false);
          setPhoneTaken(true);
          goToStep(2);
          return;
        }
      } catch (recheckErr) {
        console.warn('Final phone re-check skipped:', recheckErr.message);
      }

      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      createdUser = user;
      const fullName = `${firstName} ${lastName}`.trim();

      const hasNidFront = !!selectedFiles.nidFront;
      const hasNidBack = !!selectedFiles.nidBack;
      const hasBirthCert = !!selectedFiles.birth;
      const hasAnyDoc = hasNidFront || hasNidBack || hasBirthCert;

      const wantsToUpload = !verifySkipped.doc && selectedVerify && selectedVerify !== 'google';
      const isDocUploaded = wantsToUpload && hasAnyDoc;
      const isFaceVerified = faceVerified;

      let completionScore = 20;
      if (isDocUploaded) completionScore += 40;
      if (isFaceVerified) completionScore += 40;
      const isComplete = completionScore === 100;
      const verificationStatus = isComplete ? 'pending' : 'incomplete';

      await updateProfile(user, { displayName: fullName });
      await sendEmailVerification(user);

      const userUniqueId = await generateUserId();
      const userWalletId = await generateWalletId();
      const referralCode = generateReferralCode();

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email,
        displayName: fullName,
        firstName,
        lastName,
        uniqueId: userUniqueId,
        walletId: userWalletId,
        referralCode: referralCode,
        role: role || 'client',
        authProvider: 'email',
        createdAt: serverTimestamp(),
        isOnline: true,
        isVerified: false,
        emailVerified: false,
        phone: phone || '',
        countryCode: countryCode || '+880',
        dob: dob || '',
        phoneVerified: true,
        phoneVerifiedToken: verificationToken,

        photoURL: facePhotoUrl || null,
        facePhotoUrl: facePhotoUrl || null,
        faceVerified: faceVerified,
        faceStatus: facePhotoUrl ? 'pending' : 'none',
        faceRejectReason: '',

        isComplete,
        completionScore,
        verificationStatus,
        isBanned: false,
        isBlocked: false,
        documentsUploaded: false,
        documentVerified: false,
        verificationMethod: selectedVerify || 'none',

        savedPosts: [],
        totalReviews: 0,
        totalRating: 0,
        averageRating: 0,
        lastSeen: new Date().toISOString(),
      });

      console.log("✅ User document created with UID:", user.uid);
      await createWallet(user.uid, userWalletId);

      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref) await processReferral(user.uid, ref);

      // 🔧 FIX (#7): document upload/identity-check now runs in its OWN
      // try/catch, separate from the outer one below. Previously a
      // document-upload failure propagated to the outer catch, which
      // deleted the just-created Firebase Auth account
      // (createdUser.delete()) — while the Firestore user doc/wallet
      // created just above were NOT cleaned up, orphaning them. A
      // document-upload hiccup is retryable from Profile afterward (that
      // flow is already correctly wired to Firestore + Identity DB), so
      // it must never cost the user their whole account.
      let actualDocUploaded = false;
      let docUploadWarning = null;

      if (wantsToUpload) {
        console.log("📤 Starting document upload process...");
        setUploadingDocs(true);
        try {
          const { uploadResults } = await uploadDocuments(user.uid);
          console.log("✅ Documents uploaded:", uploadResults);
          actualDocUploaded = true;

          await runIdentityDuplicateCheck({
            userId: user.uid,
            uniqueId: userUniqueId,
            fullName,
            phone,
            email,
            uploadedDocs: uploadResults,
          });
        } catch (docErr) {
          console.error('❌ Document upload failed (non-fatal — account still created):', docErr);
          // uploadDocuments() already persists whatever partially
          // succeeded and marks the real state — this only covers the
          // case where it threw before even reaching that Firestore
          // write (e.g. every file failed), so the doc doesn't keep
          // showing the earlier optimistic guess.
          try {
            await updateDoc(doc(db, 'users', user.uid), {
              documentsUploaded: false,
              verificationStatus: 'incomplete',
            });
          } catch (patchErr) {
            console.warn('Could not patch verificationStatus after failed doc upload:', patchErr.message);
          }
          docUploadWarning = docErr.partial
            ? 'কিছু ডকুমেন্ট আপলোড ব্যর্থ হয়েছে।'
            : 'ডকুমেন্ট আপলোড ব্যর্থ হয়েছে।';
        } finally {
          setUploadingDocs(false);
        }
      }

      feedback.alert.success({ title: `✅ ${fullName}, নিবন্ধন সফল! আইডি: ${userUniqueId}` });

      // 🔧 FIX: this now reflects what ACTUALLY got uploaded
      // (actualDocUploaded) instead of the pre-upload guess (isDocUploaded,
      // based only on which files were *selected*) — so the "% complete"
      // message the user sees matches what's really in Firestore.
      const finalCompletionScore = 20 + (actualDocUploaded ? 40 : 0) + (isFaceVerified ? 40 : 0);
      const finalIsComplete = finalCompletionScore === 100;

      if (docUploadWarning) {
        toast(`⚠️ ${docUploadWarning} লগইন করার পর প্রোফাইল পেজ থেকে আবার আপলোড করুন।`);
      }

      if (!finalIsComplete) {
        toast(`⚠️ আপনার ${finalCompletionScore}% প্রোফাইল সম্পন্ন হয়েছে। সম্পূর্ণ করতে লগইন করুন।`);
      } else {
        feedback.alert.success({ title: '🎉 আপনার প্রোফাইল ১০০% সম্পূর্ণ! অ্যাডমিন যাচাই অপেক্ষমাণ।' });
      }

      toast(`📧 ভেরিফিকেশন ইমেইল পাঠানো হয়েছে: ${email}`);

      setTimeout(() => {
        navigate('/verify-pending', { replace: true });
      }, 2000);

    } catch (err) {
      console.error('Registration error:', err);

      if (createdUser) {
        try {
          await createdUser.delete();
          console.log('↩️ Rolled back partially-created account:', createdUser.uid);
          feedback.alert.error({ title: '❌ রেজিস্ট্রেশন সম্পূর্ণ করা যায়নি। আবার চেষ্টা করুন।' });
        } catch (rollbackErr) {
          console.error('❌ Rollback (account delete) failed:', rollbackErr);
          feedback.alert.error({ title: '❌ রেজিস্ট্রেশন সম্পূর্ণ করা যায়নি। সমস্যা থাকলে সাপোর্টে যোগাযোগ করুন।' });
        }
      } else {
        const msgs = {
          'auth/email-already-in-use': 'এই ইমেইল ইতিমধ্যে রেজিস্টার করা আছে!',
          'auth/weak-password': 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে!',
          'auth/invalid-email': 'সঠিক ইমেইল দিন!',
          'auth/network-request-failed': 'ইন্টারনেট সংযোগ নেই!',
        };
        feedback.alert.error({ title: '❌ ' + (msgs[err.code] || err.message) });
      }
    } finally {
      setLoading(false);
      setUploadingDocs(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ গুগল সাইন-আপ
  // ════════════════════════════════════════════════════════════════════════════
  const handleGoogleSignUp = async () => {
    setLoading(true);

    try {
      if (!navigator.onLine) {
        feedback.alert.error({ title: '📡 ইন্টারনেট সংযোগ নেই! দয়া করে চেক করুন।' });
        setLoading(false);
        return;
      }

      console.log('🔑 Starting Google Sign Up...');

      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log('✅ Google Sign Up Success:', user.email);

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        toast('ℹ️ এই অ্যাকাউন্ট ইতিমধ্যে রেজিস্টার করা আছে!');
        navigate('/', { replace: true });
        setLoading(false);
        return;
      }

      const userUniqueId = await generateUserId();
      const userWalletId = await generateWalletId();
      const referralCode = generateReferralCode();

      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'Google User',
        uniqueId: userUniqueId,
        walletId: userWalletId,
        referralCode: referralCode,
        role: formData.role || 'client',
        authProvider: 'google',
        createdAt: serverTimestamp(),
        isOnline: true,
        photoURL: user.photoURL || null,
        emailVerified: user.emailVerified || false,
        isVerified: false,
        isComplete: false,
        completionScore: 20,
        verificationStatus: 'incomplete',
        isBanned: false,
        isBlocked: false,
        documentsUploaded: false,
        faceVerified: false,
        phone: formData.phone || '',
        countryCode: formData.countryCode || '+880',
        dob: formData.dob || '',
        phoneVerified: false,
        phoneVerifiedToken: null,
        savedPosts: [],
        totalReviews: 0,
        totalRating: 0,
        averageRating: 0,
        lastSeen: new Date().toISOString(),
      });

      console.log('✅ User document created');
      await createWallet(user.uid, userWalletId);

      feedback.alert.success({ title: `🎉 ${userUniqueId} — Google সাইন-আপ সফল!` });
      setTimeout(() => navigate('/', { replace: true }), 1500);

    } catch (err) {
      console.error('❌ Google Sign Up Error:', err);

      if (err.code === 'auth/popup-closed-by-user') {
        toast('ℹ️ সাইন-আপ বাতিল করা হয়েছে। আবার চেষ্টা করুন।');
      } else if (err.code === 'auth/popup-blocked') {
        feedback.alert.error({ title: '❌ পপআপ ব্লক করা হয়েছে! দয়া করে পপআপ অনুমতি দিন।' });
      } else if (err.code === 'auth/network-request-failed') {
        feedback.alert.error({ title: '❌ নেটওয়ার্ক সমস্যা! দয়া করে ইন্টারনেট সংযোগ চেক করুন।' });
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        feedback.alert.error({ title: '❌ এই ইমেইলে ইতিমধ্যে অন্য অ্যাকাউন্ট আছে।' });
      } else if (err.code === 'auth/cancelled-popup-request') {
        toast('ℹ️ সাইন-আপ বাতিল করা হয়েছে।');
      } else {
        feedback.alert.error({ title: '❌ ' + (err.message || 'Google সাইন-আপ ব্যর্থ!') });
      }
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────
  // Password strength
  // ─────────────────────────────────────────
  const checkPwStrength = (v) => {
    const fill = document.getElementById('pwFill');
    const hint = document.getElementById('pwHint');
    if (!v) {
      if (fill) fill.style.width = '0';
      if (hint) hint.textContent = '🔒 পাসওয়ার্ড দিন';
      return;
    }
    let s = 0;
    if (v.length >= 6) s++;
    if (/[A-Z]/.test(v)) s++;
    if (/[0-9]/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    const idx = Math.min(Math.max(s - 1, 0), 3);
    const cols = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981'];
    const lbls = ['দুর্বল', 'মাঝারি', 'ভালো', 'শক্তিশালী'];
    const pcts = ['25%', '50%', '75%', '100%'];
    if (fill) { fill.style.width = pcts[idx]; fill.style.background = cols[idx]; }
    if (hint) hint.textContent = '🔒 ' + lbls[idx];
  };

  const togglePw = (id, btn) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁️' : '🙈';
  };

  // ─────────────────────────────────────────
  // ✅ Derived values
  // ─────────────────────────────────────────
  const doneCount = livenessState.filter(s => s.done).length;
  const docUploaded = !!selectedFiles.nidFront || !!selectedFiles.nidBack || !!selectedFiles.birth;
  const anyVerify = docUploaded || faceVerified;

  return {
    currentStep,
    loading,
    uploadingDocs,
    otpSent,
    otpTimer,
    phoneVerified,
    otpVerifying,
    selectedVerify,
    verifySkipped,
    camStream,
    cameraActive,
    livenessState,
    currentLivIdx,
    livenessComplete,
    faceVerified,
    facePhotoUrl,
    faceStatusMsg,
    livenessMessage,
    isLivenessRunning,
    livenessProgress,
    selectedFiles,
    formData,
    setFormData,
    fileErrors,
    doneCount,
    docUploaded,
    anyVerify,

    emailTaken,
    phoneTaken,

    calibrating,
    calibrationProgress,
    calibrationFailed,
    currentStepProgress,
    lowLightWarning,
    noFaceWarning,
    retryCalibration,

    modelsLoaded,
    modelsLoading,
    modelError,

    videoRef,
    canvasRef,
    nidFrontRef,
    nidBackRef,
    birthRef,

manualUploadAvailable,
manualUploading,
handleManualCapture,

    goToStep,
    handleGoHome: () => navigate('/'),
    handleGoProfile: () => navigate('/profile'),
    updatePhone,

    goStep1,
    sendOTP,
    resendOTP,
    otpInput,
    verifyOtp,

    selectVerify,
    goStep3,
    skipVerification,

    previewFile,
    removeFile,
    compressAndPreview,
    goStep4,
    skipToFace,

    startCamera,
    stopCamera,
    skipFace,

    handleFinalRegistration,
    handleGoogleSignUp,

    checkPwStrength,
    togglePw,
  };
};