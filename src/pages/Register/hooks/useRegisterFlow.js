// src/pages/Register/hooks/useRegisterFlow.js
// Every state, ref, and handler the Register page needs, in one custom
// hook. Register.jsx just calls this and renders.
//
// ============================================================
// 🔧 THIS REVISION: fixes the "stuck at ছবি মাপা হচ্ছে forever" bug.
// See useFaceLiveness.js's header comment for the root-cause
// explanation (an unguarded enhancer.enhance() call could silently
// kill the recursive detection loop with nothing catching it). Beyond
// that fix, this file also adds:
//
// 1. runLivenessLoop's tick function is now wrapped in try/finally, so
//    the next tick is GUARANTEED to be scheduled no matter what throws
//    inside — the loop can no longer die silently from ANY unexpected
//    exception, not just the one root cause we found.
// 2. A generation counter (calibrationGenerationRef) invalidates any
//    in-flight calibration the moment the camera is stopped or
//    restarted, so a slow calibration that's still running in the
//    background can't call setState with stale results afterward.
// 3. startLivenessFlow now wraps calibrateBaseline() in a true outer
//    Promise.race timeout, on top of calibrateBaseline's own internal
//    watchdog — belt and suspenders against any hang.
// 4. Replaced the stale `cameraActive` state-closure check (captured
//    at the moment calibration STARTED, not its current value) with
//    `camStreamRef.current` (a ref, always current) when deciding
//    whether to proceed to the gesture-tracking loop after calibration
//    finishes.
//
// OTP verification, per-folder document upload, rollback-on-failure
// registration — unchanged from the previous revision.
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
  serverTimestamp, collection, query, where, getDocs,
} from "firebase/firestore";
import { auth, db } from '../../../firebase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { generateUserId, generateWalletId, generateReferralCode } from '../../../utils/idGenerator';
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

// ============================================================
// 📱 OTP API URL
// ============================================================
const OTP_API_URL = import.meta.env.VITE_OTP_API_URL ||
  'https://worktrust-otp-production.hammanmusa362.workers.dev';

const LOOP_TICK_MS = 70;
const MAX_CALIBRATION_ATTEMPTS = 4;
// ✅ NEW: hard outer timeout wrapped around calibrateBaseline() — its
// own internal watchdog is 9000ms; this adds a safety margin on top,
// as a second line of defense in case any single internal await
// somehow outlives the inner watchdog.
const CALIBRATION_HARD_TIMEOUT_MS = 11000;

export const useRegisterFlow = () => {
  const navigate = useNavigate();

  // ── স্টেট ──
  const [fileErrors, setFileErrors] = useState({ nidFront: '', nidBack: '', birth: '' });
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
  // ✅ NEW: bumped every time the camera is (re)started or stopped —
  // any in-flight calibration/loop checks this to know it's been
  // superseded and should ignore its own result.
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
  });

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const updatePhone = useCallback((phone) => {
    setFormData(prev => ({ ...prev, phone }));
    setPhoneVerified(false);
    setVerificationToken(null);
    setOtpSent(false);
    setOtpTimer(30);
    clearInterval(otpTimerRef.current);
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
    };
  }, []);

  const showToast = useCallback((msg, type = 'info') => {
    if (type === 'error') {
      toast.error(msg);
    } else if (type === 'success') {
      toast.success(msg);
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
  const goStep1 = () => {
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
    if (password.length < 6) {
      showToast('❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষর', 'error');
      return;
    }
    if (password !== confirmPassword) {
      document.getElementById('pass2Err')?.classList.add('show');
      return;
    }
    document.getElementById('pass2Err')?.classList.remove('show');

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

    setLoading(true);
    try {
      const fullPhone = `${formData.countryCode.replace('+', '')}${phone.substring(1)}`;
      console.log('📱 Sending OTP to:', fullPhone);

      const response = await fetch(`${OTP_API_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
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
      showToast('❌ ' + (error.message || 'OTP পাঠানো যায়নি'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const resendOTP = async () => {
    if (otpTimer > 0 || loading) return;
    await sendOTP();
  };

  const otpInput = useCallback(async (el, idx) => {
    const val = el.value.replace(/[^0-9]/g, '');
    el.value = val;
    el.classList.toggle('filled', !!val);

    const boxes = document.querySelectorAll('#step2 .otp-box');
    if (val && idx < 5) {
      boxes[idx + 1]?.focus();
    }

    if (idx !== 5 || !val || otpVerifying || phoneVerified) return;

    const otp = [...boxes].map(box => box.value).join('');
    if (otp.length !== 6) return;

    const phone = formData.phone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      showToast('❌ মোবাইল নম্বর সঠিক নয়', 'error');
      return;
    }

    setOtpVerifying(true);
    try {
      const fullPhone = `${formData.countryCode.replace('+', '')}${phone.substring(1)}`;
      console.log('🔐 Verifying OTP:', { phone: fullPhone, otp });

      const response = await fetch(`${OTP_API_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, otp }),
      });

      const data = await response.json();
      console.log('🔐 Verify OTP response:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'ভুল OTP অথবা OTP-এর মেয়াদ শেষ।');
      }

      setPhoneVerified(true);
      setVerificationToken(data.token || data.resetToken || 'verified');
      clearInterval(otpTimerRef.current);
      setOtpTimer(0);

      showToast('✅ ফোন নম্বর সফলভাবে যাচাই হয়েছে!', 'success');
      setTimeout(() => goToStep(3), 500);

    } catch (error) {
      console.error('❌ OTP Verification Error:', error);
      boxes.forEach(box => { box.value = ''; box.classList.remove('filled'); });
      boxes[0]?.focus();
      showToast('❌ ' + (error.message || 'OTP যাচাই ব্যর্থ হয়েছে'), 'error');
    } finally {
      setOtpVerifying(false);
    }
  }, [otpVerifying, phoneVerified, formData.phone, formData.countryCode, showToast, goToStep]);

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
    // ✅ NEW: invalidates any in-flight calibration/loop from a
    // previous camera session — see startLivenessFlow/runLivenessLoop.
    calibrationGenerationRef.current++;

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
    calibrationGenerationRef.current++; // ✅ NEW: invalidate anything in-flight
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

  // ✅ FIXED: entire tick body wrapped in try/finally — the next tick is
  // now scheduled NO MATTER WHAT happens inside (unexpected exception,
  // enhance() failure, detection failure, etc). This is what makes the
  // loop unable to silently die anymore.
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
          return; // still schedules next tick via finally below
        }

        const brightness = brightnessSamplerRef.current(video);
        setLowLightWarning(brightness < 55);

        // 🔧 FIX: safeEnhance() instead of a bare enhancer.enhance()
        // call — see useFaceLiveness.js header comment for why this
        // was the root cause of the loop dying silently.
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
        // 🔧 FIX: catches ANYTHING unexpected that slips through the
        // inner try/catches above, so it can never kill the loop.
        console.error('Liveness loop tick error (recovered):', outerErr);
      } finally {
        // 🔧 FIX: this is the actual fix — the next tick is scheduled
        // here, unconditionally (as long as we're still meant to be
        // running), regardless of what happened above.
        if (isLivenessRunningRef.current && !isStale()) {
          livenessTimerRef.current = setTimeout(loop, LOOP_TICK_MS);
        }
      }
    };

    loop();
  }, [showToast, capturePhoto]);

  // ✅ FIXED: outer hard-timeout via Promise.race (on top of
  // calibrateBaseline's own internal watchdog) + generation-based
  // cancellation instead of a stale `cameraActive` closure check.
  const startLivenessFlow = useCallback(async () => {
    if (isLivenessRunningRef.current || livenessComplete) return;

    if (!modelsLoaded) {
      showToast('⚠️ ফেস মডেল এখনও লোড হচ্ছে, একটু অপেক্ষা করুন...', 'warning');
      return;
    }
    if (!videoRef.current) return;

    const myGeneration = ++calibrationGenerationRef.current;
    // ✅ NEW: checked both at the top and inside calibrateBaseline's
    // loop — true whenever the camera has been stopped/restarted since
    // THIS calibration attempt began.
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

      // Camera was stopped/restarted while we were waiting — this
      // result is stale, ignore it entirely (don't touch state, don't
      // start the gesture loop on a dead video stream).
      if (isStale()) return;

      baselineRef.current = baseline;
      setLowLightWarning(baseline.brightness < 55);
      setCalibrating(false);
      calibrationAttemptsRef.current = 0;

      if (!isLivenessRunningRef.current) {
        runLivenessLoop(baseline, myGeneration);
      }
    } catch (err) {
      if (isStale()) return; // stopped in the meantime — don't show a stale retry/error

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
        showToast(
          err.reason === 'low-light'
            ? '💡 আলো খুব কম — আলোর কাছে গিয়ে আবার চেষ্টা করুন'
            : '🙂 মুখ শনাক্ত করা যাচ্ছে না — ক্যামেরার সামনে সোজা তাকান',
          'warning'
        );
      }
    }
  }, [modelsLoaded, livenessComplete, showToast, runLivenessLoop]);

  const retryCalibration = useCallback(() => {
    calibrationAttemptsRef.current = 0;
    setCalibrationFailed(false);
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

  const skipFace = useCallback(() => {
    setVerifySkipped(prev => ({ ...prev, face: true }));
    calibrationGenerationRef.current++;
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

  const uploadDocuments = useCallback(async (userId) => {
    console.log("📤 [START] Uploading documents. State files:", selectedFiles);

    const requiredTypes = [];
    if (selectedVerify === 'nid') {
      requiredTypes.push('nidFront', 'nidBack');
    } else if (selectedVerify === 'birth') {
      requiredTypes.push('birth');
    } else {
      return [];
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

    const uploadResults = [];
    for (const task of uploadTasks) {
      try {
        console.log(`📤 Uploading ${task.type} to folder "${task.folder}": ${task.file.name}`);
        const result = await uploadToCloudinary(task.file, task.folder);
        uploadResults.push({
          type: task.type,
          url: result.url,
          publicId: result.publicId,
          uploadedAt: new Date().toISOString()
        });
        console.log(`✅ ${task.type} uploaded successfully`);
      } catch (error) {
        throw new Error(`${task.type} আপলোড করতে ব্যর্থ হয়েছে: ${error.message}`);
      }
    }

    if (uploadResults.length !== requiredTypes.length) {
      throw new Error('সব ডকুমেন্ট আপলোড হয়নি।');
    }

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
        documentsUploaded: true,
        documentVerified: false,
        documentType: selectedVerify || 'nid',
        documentSubmittedAt: new Date().toISOString(),
        verificationStatus: 'pending'
      });

      console.log("✅ Documents saved to Firestore successfully!");
      return uploadResults;

    } catch (error) {
      console.error("❌ Failed to save documents to Firestore:", error);
      throw error;
    }
  }, [selectedFiles, selectedVerify]);

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ ফাইনাল রেজিস্ট্রেশন
  // ════════════════════════════════════════════════════════════════════════════
  const handleFinalRegistration = async () => {
    if (loading) return;

    if (!phoneVerified || !verificationToken) {
      toast.error('❌ দয়া করে ফোন নম্বর OTP দিয়ে যাচাই করুন।');
      goToStep(2);
      return;
    }

    setLoading(true);

    let createdUser = null;

    try {
      const { firstName, lastName, email, password, dob, phone, countryCode, role } = formData;
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

      if (wantsToUpload) {
        console.log("📤 Starting document upload process...");
        setUploadingDocs(true);
        const uploadedUrls = await uploadDocuments(user.uid);
        console.log("✅ Documents uploaded:", uploadedUrls);
        setUploadingDocs(false);
      }

      toast.success(`✅ ${fullName}, নিবন্ধন সফল! আইডি: ${userUniqueId}`);

      if (!isComplete) {
        toast(`⚠️ আপনার ${completionScore}% প্রোফাইল সম্পন্ন হয়েছে। সম্পূর্ণ করতে লগইন করুন।`);
      } else {
        toast.success('🎉 আপনার প্রোফাইল ১০০% সম্পূর্ণ! অ্যাডমিন যাচাই অপেক্ষমাণ।');
      }

      toast(`📧 ভেরিফিকেশন ইমেইল পাঠানো হয়েছে: ${email}`);

      setTimeout(() => {
        navigate('/verify-pending');
      }, 2000);

    } catch (err) {
      console.error('Registration error:', err);

      if (createdUser) {
        try {
          await createdUser.delete();
          console.log('↩️ Rolled back partially-created account:', createdUser.uid);
          toast.error('❌ রেজিস্ট্রেশন সম্পূর্ণ করা যায়নি। আবার চেষ্টা করুন।');
        } catch (rollbackErr) {
          console.error('❌ Rollback (account delete) failed:', rollbackErr);
          toast.error('❌ রেজিস্ট্রেশন সম্পূর্ণ করা যায়নি। সমস্যা থাকলে সাপোর্টে যোগাযোগ করুন।');
        }
      } else {
        const msgs = {
          'auth/email-already-in-use': 'এই ইমেইল ইতিমধ্যে রেজিস্টার করা আছে!',
          'auth/weak-password': 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে!',
          'auth/invalid-email': 'সঠিক ইমেইল দিন!',
          'auth/network-request-failed': 'ইন্টারনেট সংযোগ নেই!',
        };
        toast.error('❌ ' + (msgs[err.code] || err.message));
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
        toast.error('📡 ইন্টারনেট সংযোগ নেই! দয়া করে চেক করুন।');
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
        navigate('/');
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

      toast.success(`🎉 ${userUniqueId} — Google সাইন-আপ সফল!`);
      setTimeout(() => navigate('/'), 1500);

    } catch (err) {
      console.error('❌ Google Sign Up Error:', err);

      if (err.code === 'auth/popup-closed-by-user') {
        toast('ℹ️ সাইন-আপ বাতিল করা হয়েছে। আবার চেষ্টা করুন।');
      } else if (err.code === 'auth/popup-blocked') {
        toast.error('❌ পপআপ ব্লক করা হয়েছে! দয়া করে পপআপ অনুমতি দিন।');
      } else if (err.code === 'auth/network-request-failed') {
        toast.error('❌ নেটওয়ার্ক সমস্যা! দয়া করে ইন্টারনেট সংযোগ চেক করুন।');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        toast.error('❌ এই ইমেইলে ইতিমধ্যে অন্য অ্যাকাউন্ট আছে।');
      } else if (err.code === 'auth/cancelled-popup-request') {
        toast('ℹ️ সাইন-আপ বাতিল করা হয়েছে।');
      } else {
        toast.error('❌ ' + (err.message || 'Google সাইন-আপ ব্যর্থ!'));
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

    goToStep,
    handleGoHome: () => navigate('/'),
    handleGoProfile: () => navigate('/profile'),
    updatePhone,

    goStep1,
    sendOTP,
    resendOTP,
    otpInput,

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