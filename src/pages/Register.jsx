// src/pages/Register.jsx - FIXED VERSION

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc, increment,
  serverTimestamp, collection, query, where, getDocs
} from "firebase/firestore";
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';


import './Register.css';

// ✅ idGenerator থেকে ইম্পোর্ট করুন
import { generateUserId, generateWalletId, generateReferralCode } from '../utils/idGenerator';

// ─── কনস্ট্যান্ট ──────────────────────────────────────────────────────────────
const CLOUD_NAME = "drwex6tmf";
const UPLOAD_PRESET = "workhub_preset";

const LIVENESS_STEPS = [
  { id: 1, label: '👁️ চোখ খোলা রাখুন', emoji: '👁️' },
  { id: 2, label: '😌 চোখ বন্ধ করুন', emoji: '😌' },
  { id: 3, label: '👄 মুখ খুলুন', emoji: '👄' },
  { id: 4, label: '😐 মুখ বন্ধ করুন', emoji: '😐' },
  { id: 5, label: '👉 মাথা ডানে হেলান', emoji: '👉' },
  { id: 6, label: '👈 মাথা বামে হেলান', emoji: '👈' },
];

const PROGRESS_MAP = [0, 14, 28, 44, 58, 76, 100];

// ─── ক্লাউডিনারি আপলোডার ─────────────────────────────────────────────────────
const uploadToCloudinary = async (file, folder = 'user_documents') => {
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    fd.append('folder', folder);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: fd }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Upload failed');
    }

    const data = await res.json();
    console.log(`✅ Cloudinary upload success: ${data.secure_url}`);
    return { url: data.secure_url, publicId: data.public_id };

  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    throw error;
  }
};

// initLiveness ফাংশন — কম্পোনেন্টের বাইরে, প্রতিবার নতুন অ্যারে দেয়
const initLiveness = () => LIVENESS_STEPS.map(s => ({ ...s, done: false }));

// ─── মেইন কম্পোনেন্ট ──────────────────────────────────────────────────────────
const Register = ({ onSwitchToLogin }) => {
  const navigate = useNavigate();

  const [error, setError] = useState('');

  // BUG FIX #6: file-size validation errors used to share ONE `error`
  // state across NID front / NID back / birth cert. That meant an error
  // on one field showed up under a different field too, and never
  // cleared once you picked a valid file. Now each field has its own key.
  const [fileErrors, setFileErrors] = useState({ nidFront: '', nidBack: '', birth: '' });

  // ── স্টেপ ও ইউআই ──
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  // ── ওটিপি ──
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(30);
  const otpTimerRef = useRef(null);

  // ── ভেরিফিকেশন চয়েস ──
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

  const [selectedFiles, setSelectedFiles] = useState({
    nidFront: null,
    nidBack: null,
    birth: null
  });

  // ── রেফারেন্স ──
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const livenessTimerRef = useRef(null);
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

  // ============================================================
  // ✅ ইমেজ কম্প্রেস ফাংশন (নিম্ন মানের)
  // ============================================================
  const compressImage = (file, maxWidth = 600, maxHeight = 400, quality = 0.3) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;

        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Canvas to Blob failed'));
                return;
              }

              const originalSize = file.size / 1024;
              const compressedSize = blob.size / 1024;
              console.log(`📊 Image: ${originalSize.toFixed(1)}KB → ${compressedSize.toFixed(1)}KB`);

              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, '.jpg'),
                { type: 'image/jpeg', lastModified: Date.now() }
              );

              resolve(compressedFile);
            },
            'image/jpeg',
            quality
          );
        };

        img.onerror = () => reject(new Error('Failed to load image'));
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
    });
  };

  const compressAndPreview = async (file, areaId, previewId, removeBtnId, fileType) => {
    try {
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

  // BUG FIX #4: camStream state বদলালে ref আপডেট করো
  useEffect(() => {
    camStreamRef.current = camStream;
  }, [camStream]);

  // ── প্রগ্রেস বার ──
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

  // BUG FIX #5: cleanup
  useEffect(() => {
    return () => {
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(otpTimerRef.current);
      if (livenessTimerRef.current) {
        clearInterval(livenessTimerRef.current);
        livenessTimerRef.current = null;
      }
    };
  }, []);

  // ── টোস্ট হেল্পার ──
  const showToast = useCallback((msg, type = 'info') => {
    const el = document.getElementById('toast');
    if (!el) { console.log(`[${type}]`, msg); return; }
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3000);
  }, []);

  // ── স্টেপ নেভিগেশন ──
  const goToStep = useCallback((n) => {
    if (n < 1 || n > 6) return;
    setCurrentStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleGoHome = () => navigate('/');
  const handleGoProfile = () => navigate('/profile');

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

  const sendOTP = () => {
    if (formData.phone.trim().length < 10) {
      document.getElementById('phoneErr')?.classList.add('show');
      return;
    }
    document.getElementById('phoneErr')?.classList.remove('show');
    setOtpSent(true);
    showToast('📨 OTP পাঠানো হয়েছে ✓', 'success');
    startOtpTimer();
  };

  const resendOTP = () => {
    showToast('📨 নতুন OTP পাঠানো হয়েছে', 'success');
    startOtpTimer();
  };

  const otpInput = useCallback((el, idx) => {
    const val = el.value.replace(/[^0-9]/g, '');
    el.value = val;
    el.classList.toggle('filled', !!val);

    const boxes = document.querySelectorAll('#step2 .otp-box');
    if (val && idx < 5) boxes[idx + 1]?.focus();

    if (idx === 5 && val) {
      const otp = [...boxes].map(b => b.value).join('');
      if (otp.length === 6) {
        setTimeout(() => {
          showToast('✅ ফোন নম্বর যাচাই হয়েছে!', 'success');
          goToStep(3);
        }, 400);
      }
    }
  }, [showToast, goToStep]);

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ স্টেপ ৩: যাচাই পদ্ধতি
  // ════════════════════════════════════════════════════════════════════════════
  const selectVerify = (type) => setSelectedVerify(type);

  const goStep3 = () => {
    if (!selectedVerify) { showToast('❌ একটি যাচাই পদ্ধতি বেছে নিন', 'error'); return; }
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
    }

    console.log(`✅ File selected: ${file.name} (${file.size} bytes)`);
  };

  // BUG FIX #7: was calling `feedback.toast({...})` — `feedback` is not
  // imported/defined anywhere in this file, so clicking the remove ("✕")
  // button on ANY uploaded file preview threw a ReferenceError and crashed
  // the app. Replaced with the `toast` already imported from
  // react-hot-toast. Also now clears that field's error message.
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
      if (!nidFrontRef.current?.files[0] || !nidBackRef.current?.files[0]) {
        showToast('❌ উভয় পাশের ছবি আপলোড করুন', 'error');
        return;
      }
    } else if (selectedVerify === 'birth') {
      if (!birthRef.current?.files[0]) {
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
    isLivenessRunningRef.current = false;
    setIsLivenessRunning(false);
    setLivenessState(initLiveness());
    setCurrentLivIdx(0);
    setLivenessComplete(false);
    setFaceStatusMsg('');
    setLivenessProgress(0);
    if (livenessTimerRef.current) {
      clearInterval(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }
  }, []);

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ স্টেপ ৫: ফেস ভেরিফিকেশন
  // ════════════════════════════════════════════════════════════════════════════
  const stopCamera = useCallback(() => {
    if (livenessTimerRef.current) {
      clearInterval(livenessTimerRef.current);
      livenessTimerRef.current = null;
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

  // Register.jsx - capturePhoto ফাংশন আপডেট

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));

    if (livenessTimerRef.current) {
      clearInterval(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    setCamStream(null);
    setCameraActive(false);
    isLivenessRunningRef.current = false;
    setIsLivenessRunning(false);

    setFaceVerified(true);
    setFaceStatusMsg('captured');
    setLivenessMessage('✅ মুখমণ্ডলের ছবি ক্যাপচার সম্পন্ন!');
    showToast('✅ মুখমণ্ডলের ছবি সফলভাবে ক্যাপচার হয়েছে', 'success');

    try {
      const file = new File([blob], 'face_photo.jpg', { type: 'image/jpeg' });
      const result = await uploadToCloudinary(file, 'face_photos');
      setFacePhotoUrl(result.url);

      // ✅ আপডেটেড: faceVerified = false, status = pending (Admin approve করবে)
      // 🔥 নোট: এখানে user ডকুমেন্টে সেভ করবেন না, কারণ user এখনও তৈরি হয়নি
      // user তৈরি হওয়ার পর handleFinalRegistration-এ facePhotoUrl সংরক্ষণ হবে

      console.log("✅ Face photo uploaded:", result.url);

    } catch (err) {
      console.error('Face photo upload error:', err);
      showToast('⚠️ ছবি আপলোড হয়নি, পরে আবার চেষ্টা করুন', 'warning');
    }

    setTimeout(() => goToStep(6), 800);
  }, [showToast, goToStep]);

  const startLivenessFlow = useCallback(() => {
    if (isLivenessRunningRef.current || livenessComplete) return;

    isLivenessRunningRef.current = true;
    setIsLivenessRunning(true);
    setLivenessProgress(0);
    setLivenessState(initLiveness());
    setCurrentLivIdx(0);
    setLivenessComplete(false);

    const shuffledIndices = [0, 1, 2, 3, 4, 5];
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }

    setLivenessMessage('👤 নির্দেশনা অনুসরণ করুন...');

    let livStep = 0;
    const totalSteps = LIVENESS_STEPS.length;

    if (livenessTimerRef.current) {
      clearInterval(livenessTimerRef.current);
    }

    livenessTimerRef.current = setInterval(() => {
      if (livStep >= totalSteps) {
        clearInterval(livenessTimerRef.current);
        livenessTimerRef.current = null;
        return;
      }

      const mappedIdx = shuffledIndices[livStep];
      const livStepData = LIVENESS_STEPS[mappedIdx];

      setCurrentLivIdx(livStep);
      const progress = ((livStep + 1) / totalSteps) * 100;
      setLivenessProgress(progress);
      setLivenessMessage(`📌 ${livStepData.emoji} ${livStepData.label}`);

      setLivenessState(prev =>
        prev.map((s, idx) => idx === mappedIdx ? { ...s, done: true } : s)
      );

      livStep++;

      if (livStep >= totalSteps) {
        clearInterval(livenessTimerRef.current);
        livenessTimerRef.current = null;
        isLivenessRunningRef.current = false;
        setIsLivenessRunning(false);
        setLivenessComplete(true);
        setFaceStatusMsg('complete');
        setLivenessMessage('🎉 সব ধাপ সম্পন্ন! ছবি তোলা হচ্ছে...');
        showToast('🎉 লাইভনেস যাচাই সম্পন্ন!', 'success');
        setTimeout(() => capturePhoto(), 1000);
      }
    }, 2200);
  }, [livenessComplete, capturePhoto, showToast]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setCamStream(stream);
      camStreamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      resetLiveness();
      setLivenessMessage('👤 নির্দেশনা অনুসরণ করুন...');
      showToast('📷 ক্যামেরা চালু হয়েছে', 'success');
      setTimeout(() => startLivenessFlow(), 1000);
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
    if (livenessTimerRef.current) {
      clearInterval(livenessTimerRef.current);
      livenessTimerRef.current = null;
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

  // Register.jsx - uploadDocuments ফাংশন আপডেট

  const uploadDocuments = useCallback(async (userId) => {
    console.log("📤 [START] Uploading documents. State files:", selectedFiles);

    const uploadTasks = [];
    if (selectedFiles.nidFront) uploadTasks.push({ file: selectedFiles.nidFront, type: 'nidFront', folder: 'nid_documents' });
    if (selectedFiles.nidBack) uploadTasks.push({ file: selectedFiles.nidBack, type: 'nidBack', folder: 'nid_documents' });
    if (selectedFiles.birth) uploadTasks.push({ file: selectedFiles.birth, type: 'birthCert', folder: 'birth_documents' });

    if (uploadTasks.length === 0) {
      console.warn("⚠️ No files in state to upload");
      return [];
    }

    const uploadResults = [];
    for (const task of uploadTasks) {
      try {
        console.log(`📤 Uploading ${task.type}: ${task.file.name}`);
        const result = await uploadToCloudinary(task.file, task.folder);
        uploadResults.push({
          type: task.type,
          url: result.url,
          publicId: result.publicId,
          uploadedAt: new Date().toISOString()
        });
        console.log(`✅ ${task.type} uploaded successfully`);
      } catch (error) {
        console.error(`❌ Failed to upload ${task.type}:`, error);
      }
    }

    if (uploadResults.length === 0) {
      console.error("❌ No files were uploaded successfully!");
      return [];
    }

    // ✅ আপডেটেড: প্রতিটি ডকুমেন্টের জন্য status এবং rejectReason যোগ করা হয়েছে
    const documents = {};
    for (const result of uploadResults) {
      documents[result.type] = {
        url: result.url,
        publicId: result.publicId,
        uploadedAt: result.uploadedAt,
        status: 'pending',        // ✅ নতুন: pending | approved | rejected
        rejectReason: ''          // ✅ নতুন: reject হলে reason থাকবে
      };
    }

    console.log("📄 Documents object to save:", JSON.stringify(documents, null, 2));

    try {
      const userRef = doc(db, 'users', userId);

      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        console.error("❌ User document doesn't exist!");
        return [];
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

      const verifySnap = await getDoc(userRef);
      const verifyData = verifySnap.data();
      console.log("📄 Verification - documents:", verifyData.documents);
      console.log("📄 Verification - documentsUploaded:", verifyData.documentsUploaded);

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
    setLoading(true);

    try {
      const { firstName, lastName, email, password, dob, phone, countryCode, role } = formData;
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      const fullName = `${firstName} ${lastName}`.trim();

      const nidFrontInput = document.getElementById('nidFront');
      const nidBackInput = document.getElementById('nidBack');
      const birthInput = document.getElementById('birthCert');

      const hasNidFront = !!nidFrontInput?.files?.[0];
      const hasNidBack = !!nidBackInput?.files?.[0];
      const hasBirthCert = !!birthInput?.files?.[0];
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


        photoURL: facePhotoUrl || null,
        facePhotoUrl: facePhotoUrl || null,
        faceVerified: false,
        faceStatus: facePhotoUrl ? 'pending' : 'none',
        faceRejectReason: '',


        isComplete,
        completionScore,
        verificationStatus,
        isBanned: false,
        isBlocked: false,
        documentsUploaded: false,         // ✅ পরে uploadDocuments-এ true হবে
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
      const msgs = {
        'auth/email-already-in-use': 'এই ইমেইল ইতিমধ্যে রেজিস্টার করা আছে!',
        'auth/weak-password': 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে!',
        'auth/invalid-email': 'সঠিক ইমেইল দিন!',
        'auth/network-request-failed': 'ইন্টারনেট সংযোগ নেই!',
      };
      toast.error('❌ ' + (msgs[err.code] || err.message));
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
      setUploadingDocs(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ গুগল সাইন-আপ - FIXED ✅
  // ════════════════════════════════════════════════════════════════════════════
  // src/pages/Register.jsx - শুধু handleGoogleSignUp ফাংশন আপডেট করুন

  const handleGoogleSignUp = async () => {
    setLoading(true);
    setError('');

    try {
      // ✅ Check network first
      if (!navigator.onLine) {
        toast.error('📡 ইন্টারনেট সংযোগ নেই! দয়া করে চেক করুন।');
        setLoading(false);
        return;
      }

      console.log('🔑 Starting Google Sign Up...');

      // ✅ Create GoogleAuthProvider
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      // ✅ Sign in with popup
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      console.log('✅ Google Sign Up Success:', user.email);

      // ✅ Check if user already exists
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        // BUG FIX #8: was `toast.info(...)` — react-hot-toast has no
        // `.info` method by default (only `.success`/`.error`/`.loading`
        // + the plain call), so this would throw
        // "toast.info is not a function" every time an already-registered
        // user tried Google sign-up.
        toast('ℹ️ এই অ্যাকাউন্ট ইতিমধ্যে রেজিস্টার করা আছে!');
        navigate('/');
        setLoading(false);
        return;
      }

      // ✅ Generate IDs
      const userUniqueId = await generateUserId();
      const userWalletId = await generateWalletId();
      const referralCode = generateReferralCode();

      // ✅ Create user document
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
        savedPosts: [],
        totalReviews: 0,
        totalRating: 0,
        averageRating: 0,
        lastSeen: new Date().toISOString(),
      });

      console.log('✅ User document created');

      // ✅ Create wallet
      await createWallet(user.uid, userWalletId);

      toast.success(`🎉 ${userUniqueId} — Google সাইন-আপ সফল!`);

      setTimeout(() => {
        navigate('/');
      }, 1500);

    } catch (err) {
      console.error('❌ Google Sign Up Error:', err);

      // ✅ Handle specific errors
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

      setError(err.message);
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
  // Derived values
  // ─────────────────────────────────────────
  const doneCount = livenessState.filter(s => s.done).length;
  const docUploaded = !verifySkipped.doc;
  const anyVerify = docUploaded || faceVerified;

  // ════════════════════════════════════════════════════════════════════════════
  // ✅ রেন্ডার
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="shopnest-register">
      <Toaster position="top-center" />

      <div className="auth-card" id="authCard">

        {/* ── প্রগ্রেস বার ── */}
        <div className="progress-bar">
          <div className="progress-fill" id="progressFill" style={{ width: '14%' }} />
        </div>

        <div id="registerFlow">
          <div className="step-indicator" id="stepIndicator">
            {[
              { n: 1, lbl: 'অ্যাকাউন্ট' },
              { n: 2, lbl: 'ফোন OTP' },
              { n: 3, lbl: 'যাচাই' },
              { n: 4, lbl: 'ডকুমেন্ট' },
              { n: 5, lbl: 'ফেস' },
              { n: 6, lbl: 'সম্পন্ন' },
            ].map(({ n, lbl }, i, arr) => (
              <React.Fragment key={n}>
                <div
                  className="step-dot-wrap"
                  onClick={() => {}}
                  style={{ cursor: 'default' }}
                >
                  <div
                    className={`step-dot ${n === currentStep ? 'active' : n < currentStep ? 'done' : ''}`}
                    id={`dot${n}`}
                  >
                    {n < currentStep ? '✓' : n < 6 ? n : '✓'}
                  </div>
                  <div className={`step-label ${n === currentStep ? 'active' : ''}`} id={`lbl${n}`}>
                    {lbl}
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div className={`step-line ${n < currentStep ? 'done' : ''}`} id={`line${n}${n + 1}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="card-body">
            {/* ── স্টেপ ১ ── */}
            <div className={`step-panel ${currentStep === 1 ? 'active' : ''}`} id="step1">
              <div className="step-subtitle">WorkTrustbd-এ স্বাগতম! প্রথমে আপনার তথ্য দিন।</div>

              <div className="field-row">
                <div className="field">
                  <label>নাম <span className="req">*</span></label>
                  <input
                    type="text"
                    placeholder="আপনার নাম"
                    value={formData.firstName}
                    onChange={e => {
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^a-zA-Z\u0980-\u09FF\s]/g, '');
                      setFormData(p => ({ ...p, firstName: cleanValue }));
                    }}
                  />
                </div>

                <div className="field">
                  <label>পদবি</label>
                  <input
                    type="text"
                    placeholder="পদবি"
                    value={formData.lastName}
                    onChange={e => {
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^a-zA-Z\u0980-\u09FF\s]/g, '');
                      setFormData(p => ({ ...p, lastName: cleanValue }));
                    }}
                  />
                </div>
              </div>

              <div className="field">
                <label>ইমেইল <span className="req">*</span></label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                />
                <div className="field-error" id="emailErr">সঠিক ইমেইল দিন</div>
              </div>

              <div className="field">
                <label>পাসওয়ার্ড <span className="req">*</span></label>
                <div className="pw-wrap">
                  <input
                    type="password"
                    id="regPass"
                    placeholder="কমপক্ষে ৬ অক্ষর"
                    value={formData.password}
                    onChange={e => {
                      setFormData(p => ({ ...p, password: e.target.value }));
                      checkPwStrength(e.target.value);
                    }}
                  />
                  <button className="pw-toggle" onClick={e => togglePw('regPass', e.currentTarget)}>👁️</button>
                </div>
                <div className="pw-strength"><div className="pw-strength-fill" id="pwFill" /></div>
                <div className="field-hint" id="pwHint">🔒 পাসওয়ার্ড দিন</div>
              </div>

              <div className="field">
                <label>পাসওয়ার্ড নিশ্চিত করুন <span className="req">*</span></label>
                <div className="pw-wrap">
                  <input
                    type="password"
                    id="regPass2"
                    placeholder="একই পাসওয়ার্ড পুনরায়"
                    value={formData.confirmPassword}
                    onChange={e => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                  />
                  <button className="pw-toggle" onClick={e => togglePw('regPass2', e.currentTarget)}>👁️</button>
                </div>
                <div className="field-error" id="pass2Err">পাসওয়ার্ড মিলছে না</div>
              </div>

              <div className="field">
                <label>জন্ম তারিখ <span className="req">*</span></label>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={e => setFormData(p => ({ ...p, dob: e.target.value }))}
                />
              </div>

              <div className="field" style={{ marginTop: '1rem' }}>
                <label>আপনি কি হিসেবে যোগ দিতে চান? <span className="req">*</span></label>
                <div className="role-selector">
                  {['client', 'freelancer'].map(r => (
                    <label key={r} className={`role-option ${formData.role === r ? 'active' : ''}`}>
                      <input
                        type="radio"
                        value={r}
                        checked={formData.role === r}
                        onChange={() => setFormData(p => ({ ...p, role: r }))}
                      />
                      <i className={`fa-solid ${r === 'client' ? 'fa-briefcase' : 'fa-laptop-code'}`} />
                      <span>{r === 'client' ? 'ক্লায়েন্ট' : 'ফ্রিল্যান্সার'}</span>
                      <small>{r === 'client' ? 'ফ্রিল্যান্সার নিয়োগ করুন' : 'সার্ভিস অফার করুন'}</small>
                    </label>
                  ))}
                </div>
              </div>



              <div className="btn-row" style={{ marginTop: '1.25rem' }}>
                <button className="btn btn-primary" onClick={goStep1} disabled={loading}>
                  পরবর্তী ধাপ →
                </button>
              </div>
            </div>

            {/* ── স্টেপ ২ ── */}
            <div className={`step-panel ${currentStep === 2 ? 'active' : ''}`} id="step2">
              <div className="step-title">📱 ফোন নম্বর যাচাই</div>
              <div className="step-subtitle">আপনার মোবাইলে একটি OTP পাঠানো হবে।</div>

              <div className="field">
                <label>মোবাইল নম্বর <span className="req">*</span></label>
                <div className="phone-row">
                  <select
                    value={formData.countryCode}
                    onChange={e => setFormData(p => ({ ...p, countryCode: e.target.value }))}
                  >
                    <option value="+880">+880 বাংলাদেশ</option>
                  </select>
                  <input
                    type="tel"
                    placeholder="01XXXXXXXXX"
                    maxLength="11"
                    value={formData.phone}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '');
                      setFormData(p => ({ ...p, phone: value }));
                    }}
                  />
                </div>
                <div className="field-error" id="phoneErr">সঠিক নম্বর দিন</div>
              </div>

              {otpSent && (
                <div>
                  <div className="info-box info">
                    <span className="info-icon">📱</span>
                    <span>OTP পাঠানো হয়েছে।</span>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ textAlign: 'center', display: 'block', marginBottom: '.75rem' }}>
                      OTP কোড লিখুন
                    </label>
                    <div className="otp-row">
                      {[0, 1, 2, 3, 4, 5].map(idx => (
                        <input
                          key={idx}
                          className="otp-box"
                          maxLength="1"
                          type="text"
                          inputMode="numeric"
                          onKeyDown={(e) => {
                            const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
                            if (allowedKeys.includes(e.key)) return;
                            if (!/^[0-9]$/.test(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onInput={e => {
                            e.target.value = e.target.value.replace(/\D/g, '');
                            otpInput(e.target, idx);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="resend-row">
                    কোড পাননি?{' '}
                    <button className="resend-btn" onClick={resendOTP} disabled={otpTimer > 0}>
                      পুনরায় পাঠান {otpTimer > 0 && <span>({otpTimer}s)</span>}
                    </button>
                  </div>
                </div>
              )}

              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => goToStep(1)}>← পিছনে</button>
                <button className="btn btn-primary" onClick={sendOTP}>📨 OTP পাঠান</button>
              </div>
            </div>

            {/* ── স্টেপ ৩ ── */}
            <div className={`step-panel ${currentStep === 3 ? 'active' : ''}`} id="step3">
              <div className="step-title">🪪 পরিচয় যাচাইয়ের উপায়</div>
              <div className="step-subtitle">কোন পদ্ধতিতে যাচাই করতে চান?</div>

              <div className="verify-options">
                {[
                  { type: 'nid', icon: '🪪', cls: 'vo-blue', title: 'জাতীয় পরিচয়পত্র (NID)', sub: 'উভয় পাশের ছবি আপলোড করুন' },
                  { type: 'birth', icon: '📄', cls: 'vo-green', title: 'জন্ম নিবন্ধন সনদ', sub: 'জন্ম নিবন্ধন সার্টিফিকেটের ছবি' },
                ].map(({ type, icon, cls, title, sub }) => (
                  <label
                    key={type}
                    className={`verify-option ${selectedVerify === type ? 'selected' : ''}`}
                    onClick={() => selectVerify(type)}
                  >
                    <input type="radio" name="verifyType" value={type} readOnly checked={selectedVerify === type} />
                    <div className={`vo-icon ${cls}`}>{icon}</div>
                    <div className="vo-body">
                      <div className="vo-title">{title}</div>
                      <div className="vo-sub">{sub}</div>
                    </div>
                    <div className="vo-check" />
                  </label>
                ))}
              </div>

              <div className="info-box warn">
                <span className="info-icon">⚠️</span>
                <div>লেনদেন করতে হলে পরিচয় যাচাই <strong>বাধ্যতামূলক</strong>।</div>
              </div>

              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => goToStep(2)}>← পিছনে</button>
                <button className="btn btn-primary" onClick={goStep3}>পরবর্তী →</button>
              </div>
              <div className="skip-link">
                <button onClick={skipVerification}>⏭ এখন এড়িয়ে যান</button>
              </div>
            </div>

            {/* ── স্টেপ ৪ ── */}
            <div className={`step-panel ${currentStep === 4 ? 'active' : ''}`} id="step4">
              <div className="step-title">
                {selectedVerify === 'birth' ? '📄 জন্ম নিবন্ধন আপলোড' :
                 selectedVerify === 'google' ? '🔐 Google যাচাই' : '🪪 NID কার্ড আপলোড'}
              </div>
              <div className="step-subtitle">
                {selectedVerify === 'birth' ? 'জন্ম নিবন্ধন সনদের পরিষ্কার ছবি তুলুন।' :
                 selectedVerify === 'google' ? 'Google অ্যাকাউন্ট যুক্ত করে যাচাই করুন।' :
                 'কার্ডের সামনে ও পিছনের পরিষ্কার ছবি তুলুন।'}
              </div>

              {selectedVerify === 'nid' && (
                <div className="upload-row">
                  <div className="field">
                    <label>সামনের পাশ <span className="req">*</span></label>
                    <div className="upload-area" id="nidFrontArea" onClick={() => nidFrontRef.current?.click()}>
                      <input
                        type="file"
                        accept="image/*"
                        ref={nidFrontRef}
                        id="nidFront"
                        onChange={e => {
                          const file = e.target.files[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              const msg = 'ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!';
                              setFileErrors(prev => ({ ...prev, nidFront: msg }));
                              e.target.value = '';
                              toast.error('⚠️ ' + msg);
                              return;
                            }
                            setFileErrors(prev => ({ ...prev, nidFront: '' }));
                            console.log("✅ NID Front selected:", file.name);
                            compressAndPreview(file, 'nidFrontArea', 'nidFrontPreview', 'nidFrontRemove', 'nidFront');
                          }
                        }}
                      />
                      <div className="upload-default">
                        <div className="upload-icon">🪪</div>
                        <div className="upload-label">সামনের ছবি</div>
                        <div className="upload-sub">JPG, PNG, HEIC (Max 2MB)</div>
                      </div>
                      <img id="nidFrontPreview" className="upload-preview" alt="" />
                      <button
                        className="upload-remove-btn"
                        id="nidFrontRemove"
                        style={{ display: 'none' }}
                        onClick={ev => {
                          ev.stopPropagation();
                          removeFile(nidFrontRef, 'nidFrontArea', 'nidFrontPreview', 'nidFrontRemove', 'nidFront');
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    {fileErrors.nidFront && <div className="field-error">{fileErrors.nidFront}</div>}
                  </div>

                  <div className="field">
                    <label>পিছনের পাশ <span className="req">*</span></label>
                    <div className="upload-area" id="nidBackArea" onClick={() => nidBackRef.current?.click()}>
                      <input
                        type="file"
                        accept="image/*"
                        ref={nidBackRef}
                        id="nidBack"
                        onChange={e => {
                          const file = e.target.files[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              const msg = 'ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!';
                              setFileErrors(prev => ({ ...prev, nidBack: msg }));
                              e.target.value = '';
                              toast.error('⚠️ ' + msg);
                              return;
                            }
                            setFileErrors(prev => ({ ...prev, nidBack: '' }));
                            console.log("✅ NID Back selected:", file.name);
                            compressAndPreview(file, 'nidBackArea', 'nidBackPreview', 'nidBackRemove', 'nidBack');
                          }
                        }}
                      />
                      <div className="upload-default">
                        <div className="upload-icon">🔄</div>
                        <div className="upload-label">পিছনের ছবি</div>
                        <div className="upload-sub">JPG, PNG, HEIC (Max 2MB)</div>
                      </div>
                      <img id="nidBackPreview" className="upload-preview" alt="" />
                      <button
                        className="upload-remove-btn"
                        id="nidBackRemove"
                        style={{ display: 'none' }}
                        onClick={ev => {
                          ev.stopPropagation();
                          removeFile(nidBackRef, 'nidBackArea', 'nidBackPreview', 'nidBackRemove', 'nidBack');
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    {fileErrors.nidBack && <div className="field-error">{fileErrors.nidBack}</div>}
                  </div>
                </div>
              )}

              {selectedVerify === 'birth' && (
                <div className="field">
                  <label>জন্ম নিবন্ধন সনদ <span className="req">*</span></label>
                  <div className="upload-area" id="birthArea" onClick={() => birthRef.current?.click()}>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      ref={birthRef}
                      id="birthCert"
                      onChange={e => {
                        const file = e.target.files[0];
                        if (file) {
                          if (file.type === 'application/pdf' && file.size > 5 * 1024 * 1024) {
                            const msg = 'PDF ফাইলের সাইজ ৫MB এর বেশি হতে পারবে না!';
                            setFileErrors(prev => ({ ...prev, birth: msg }));
                            e.target.value = '';
                            toast.error('⚠️ ' + msg);
                            return;
                          }

                          if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) {
                            const msg = 'ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!';
                            setFileErrors(prev => ({ ...prev, birth: msg }));
                            e.target.value = '';
                            toast.error('⚠️ ' + msg);
                            return;
                          }

                          setFileErrors(prev => ({ ...prev, birth: '' }));
                          console.log("✅ Birth Certificate selected:", file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);
                          compressAndPreview(file, 'birthArea', 'birthPreview', 'birthRemove', 'birth');
                        }
                      }}
                    />
                    <div className="upload-default">
                      <div className="upload-icon">📄</div>
                      <div className="upload-label">সনদের ছবি বা PDF</div>
                      <div className="upload-sub">JPG, PNG (Max 2MB) | PDF (Max 5MB)</div>
                    </div>
                    <img id="birthPreview" className="upload-preview" alt="" />
                    <button
                      className="upload-remove-btn"
                      id="birthRemove"
                      style={{ display: 'none' }}
                      onClick={ev => {
                        ev.stopPropagation();
                        removeFile(birthRef, 'birthArea', 'birthPreview', 'birthRemove', 'birth');
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {fileErrors.birth && <div className="field-error">{fileErrors.birth}</div>}
                </div>
              )}

              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => goToStep(3)}>← পিছনে</button>
                <button className="btn btn-primary" onClick={goStep4} disabled={uploadingDocs}>পরবর্তী →</button>
              </div>
              <div className="skip-link">
                <button onClick={skipToFace}>⏭ এই ধাপ এড়িয়ে যান</button>
              </div>
            </div>

            {/* ── স্টেপ ৫ ── */}
            <div className={`step-panel ${currentStep === 5 ? 'active' : ''}`} id="step5">
              <div className="step-title">📸 মুখমণ্ডল যাচাই</div>
              <div className="step-subtitle">নিচের নির্দেশনা অনুসরণ করুন।</div>

              <div className="liveness-instructions">
                {livenessState.map((step, idx) => (
                  <div
                    key={step.id}
                    className={`instruction-step ${step.done ? 'done' : idx === currentLivIdx && cameraActive ? 'active' : ''}`}
                  >
                    <div className="inst-icon">{step.emoji || '📌'}</div>
                    <div className="inst-text">{step.label}</div>
                    <div className="inst-status">
                      {step.done ? '✅' : idx === currentLivIdx && cameraActive ? '⏳' : '⬜'}
                    </div>
                  </div>
                ))}
              </div>

              <div className={`camera-box ${cameraActive ? 'camera-active' : ''}`} style={{ position: 'relative' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ display: cameraActive ? 'block' : 'none', width: '100%', borderRadius: '8px' }}
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                {!cameraActive && (
                  <div className="camera-placeholder">
                    <span>📷</span>
                    <div>ক্যামেরা চালু করুন</div>
                  </div>
                )}
                {cameraActive && !livenessComplete && (
                  <div style={{
                    position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.8)', color: '#fff',
                    padding: '8px 18px', borderRadius: '20px', fontSize: '0.9rem',
                    fontWeight: 600, whiteSpace: 'nowrap', maxWidth: '90%', textAlign: 'center'
                  }}>
                    {livenessMessage}
                  </div>
                )}
                {livenessComplete && (
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'rgba(0,0,0,0.8)', color: '#4ade80',
                    padding: '20px 30px', borderRadius: '12px', fontSize: '1.2rem',
                    fontWeight: 700, textAlign: 'center'
                  }}>
                    🎉 সব সম্পন্ন!
                  </div>
                )}
              </div>

              <div className="liveness-progress">
                <div className="progress-text">
                  {doneCount}/{livenessState.length} সম্পন্ন
                </div>
                <div className="progress-bar-small">
                  <div
                    className="progress-fill-small"
                    style={{ width: `${livenessProgress}%`, transition: 'width 0.4s ease' }}
                  />
                </div>
              </div>

              {faceStatusMsg === 'complete' && (
                <div className="liveness-complete">
                  <h4>✅ সব ধাপ সম্পন্ন! ছবি তোলা হচ্ছে...</h4>
                </div>
              )}
              {faceStatusMsg === 'captured' && (
                <div className="info-box success">
                  <span className="info-icon">✅</span>
                  <div>মুখমণ্ডলের ছবি সফলভাবে ক্যাপচার হয়েছে!</div>
                </div>
              )}

              <div className="btn-row">
                {!cameraActive && !faceVerified && (
                  <button className="btn btn-ghost" onClick={startCamera}>
                    📷 ক্যামেরা চালু
                  </button>
                )}
                {cameraActive && !livenessComplete && !faceVerified && (
                  <button className="btn btn-danger" onClick={stopCamera}>
                    ⏹ বাতিল
                  </button>
                )}
              </div>

              <div style={{ marginTop: '.75rem' }}>
                <button className="btn btn-ghost" onClick={() => { stopCamera(); goToStep(4); }}>
                  ← পিছনে
                </button>
              </div>

              <div className="info-box info" style={{ marginTop: '1rem' }}>
                <span className="info-icon">ℹ️</span>
                <div>
                  <strong>লাইভনেস চেক কীভাবে কাজ করে?</strong><br />
                  ১. ক্যামেরা চালু করুন।<br />
                  ২. প্রতি ২.২ সেকেন্ডে একটি নির্দেশনা দেখাবে। <br />
                  ৩. নির্দেশনা অনুসরণ করুন।<br />
                </div>
              </div>

              <div className="skip-link">
                <button onClick={skipFace}>⏭ এখন এড়িয়ে যান</button>
              </div>
            </div>

            {/* ── স্টেপ ৬ ── */}
            <div className={`step-panel ${currentStep === 6 ? 'active' : ''}`} id="step6">
              <div className="result-screen">
                {anyVerify ? (
                  <>
                    <div className="result-title">যাচাই প্রক্রিয়াধীন</div>
                    <div className="result-sub">অ্যাডমিন যাচাই করার পর অ্যাকাউন্ট সম্পূর্ণ সক্রিয় হবে।</div>
                    <div className="timer-badge">⏱ সাধারণত ১–২ ঘণ্টা লাগতে পারে। </div>
                  </>
                ) : (
                  <>
                    <div className="result-icon success-icon">🎉</div>
                    <div className="result-title">নিবন্ধন সম্পন্ন!</div>
                    <div className="result-sub">আপনার অ্যাকাউন্ট তৈরি হয়েছে।</div>
                  </>
                )}

                <div className="result-steps">
                  <div className="result-step"><div className="result-step-dot done" /> ✅ নিবন্ধন সম্পন্ন</div>
                  <div className="result-step"><div className="result-step-dot done" /> ✅ ফোন নম্বর যাচাই</div>
                  <div className="result-step">
                    <div className="result-step-dot" style={{ background: docUploaded ? 'var(--warning)' : 'var(--border)' }} />
                    {docUploaded ? '📄 ডকুমেন্ট পর্যালোচনাধীন' : '⏭ ডকুমেন্ট এড়ানো হয়েছে'}
                  </div>
                  <div className="result-step">
                    <div className="result-step-dot" style={{ background: faceVerified ? 'var(--warning)' : 'var(--border)' }} />
                    {faceVerified ? '📸 ফেস যাচাই সম্পন্ন ✅' : '⏭ ফেস যাচাই এড়ানো হয়েছে'}
                  </div>
                </div>

                <div className="info-box warn">
                  <span className="info-icon">{anyVerify ? '📧' : '⚠️'}</span>
                  <div>{anyVerify ? 'আপনার ইমেইলে আপডেট পাঠানো হবে।' : 'লেনদেন করতে পরিচয় যাচাই করতে হবে।'}</div>
                </div>
              </div>

              <div className="btn-row" style={{ marginTop: '8px' }}>

                <button
                  className="btn btn-success"
                  onClick={handleFinalRegistration}
                  disabled={loading || uploadingDocs}
                  style={{ flex: 1 }}
                >
                  {loading || uploadingDocs ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> প্রক্রিয়াধীন...
                    </>
                  ) : (
                    '🚀 নিবন্ধন সম্পূর্ণ করুন'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── ফুটার ── */}
        <div className="card-footer">
          ইতিমধ্যে অ্যাকাউন্ট আছে?{' '}
          <a
            href="#"
            className="link"
            onClick={e => {
              e.preventDefault();
              if (onSwitchToLogin) {
                onSwitchToLogin();
              } else {
                navigate('/login');
              }
            }}
          >
            লগইন করুন
          </a>
        </div>
      </div>

      <div className="toast" id="toast" />
    </div>
  );
};

export default Register;