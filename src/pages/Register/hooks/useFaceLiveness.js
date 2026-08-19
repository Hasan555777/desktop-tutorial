// src/pages/Register/hooks/useFaceLiveness.js
//
// ============================================================
// 🔧 THIS REVISION: fixes the "stuck forever" bug.
//
// Root cause found: `enhancer.enhance(videoEl, brightness)` was called
// OUTSIDE any try/catch, both in calibrateBaseline() and in the main
// per-step detection loop (see useRegisterFlow.js). If that call ever
// throws (canvas filter unsupported on some browsers, a momentary 0×0
// frame during a camera hiccup, etc.), the exception propagates out of
// the whole async function with nothing to catch it. In the main loop
// that meant the recursive `setTimeout(loop, ...)` that schedules the
// NEXT detection tick never ran — the loop silently died mid-flight,
// leaving whatever message was on screen (e.g. "ছবি মাপা হচ্ছে")
// frozen forever, with no visible error (just an unhandled promise
// rejection in the browser console).
//
// Fixes:
// 1. enhancer.enhance() is now wrapped in try/catch everywhere it's
//    called, falling back to the raw video frame on failure.
// 2. detectFrame() now has its own internal timeout race, so a single
//    hung detection call can never block the caller indefinitely.
// 3. calibrateBaseline() accepts an optional `isCancelled` callback so
//    the caller (useRegisterFlow.js) can abort an in-flight calibration
//    the moment the camera is stopped, instead of leaving a zombie
//    calibration running that can still call setState later with
//    stale results.
// ============================================================

import { useState, useCallback, useRef } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';

// ── জ্যামিতিক হিসাব (অপরিবর্তিত) ──
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const computeEAR = (eye) => {
  const A = dist(eye[1], eye[5]);
  const B = dist(eye[2], eye[4]);
  const C = dist(eye[0], eye[3]);
  if (C === 0) return 0;
  return (A + B) / (2 * C);
};

export const computeMAR = (mouth) => {
  const A = dist(mouth[13], mouth[19]);
  const B = dist(mouth[14], mouth[18]);
  const C = dist(mouth[15], mouth[17]);
  const D = dist(mouth[0], mouth[6]);
  if (D === 0) return 0;
  return (A + B + C) / (3 * D);
};

export const computeYawRatio = (jawOutline, nose) => {
  const leftJaw = jawOutline[0];
  const rightJaw = jawOutline[16];
  const noseTip = nose[6] || nose[nose.length - 1];
  const width = rightJaw.x - leftJaw.x;
  if (width === 0) return 0.5;
  return (noseTip.x - leftJaw.x) / width;
};

const readingsFromLandmarks = (landmarks) => {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const mouth = landmarks.getMouth();
  const jaw = landmarks.getJawOutline();
  const nose = landmarks.getNose();
  return {
    ear: (computeEAR(leftEye) + computeEAR(rightEye)) / 2,
    mar: computeMAR(mouth),
    yaw: computeYawRatio(jaw, nose),
  };
};

// ============================================================
// 📷 Low-light frame enhancement
// ============================================================
export const createFrameEnhancer = () => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  return {
    enhance(videoEl, brightness = 140) {
      if (!videoEl || !videoEl.videoWidth) return videoEl;
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;

      const darkness = Math.max(0, Math.min(1, (110 - brightness) / 110));
      const brightBoost = 1 + darkness * 0.9;
      const contrastBoost = 1 + darkness * 0.35;

      try {
        ctx.filter = darkness > 0.02
          ? `brightness(${brightBoost}) contrast(${contrastBoost})`
          : 'none';
      } catch {
        ctx.filter = 'none';
      }
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return canvas;
    },
  };
};

// ✅ NEW: safe wrapper — every call site uses this instead of calling
// enhancer.enhance() directly, so a throw here can never kill a caller
// that forgot to wrap it (belt-and-suspenders on top of the try/catch
// added at each call site).
export const safeEnhance = (enhancer, videoEl, brightness) => {
  try {
    return enhancer.enhance(videoEl, brightness);
  } catch (err) {
    console.warn('Frame enhance skipped, using raw video frame:', err.message);
    return videoEl;
  }
};

export const createBrightnessSampler = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  return (videoEl) => {
    if (!videoEl || !videoEl.videoWidth) return 140;
    try {
      ctx.drawImage(videoEl, 0, 0, 32, 24);
      const { data } = ctx.getImageData(0, 0, 32, 24);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      return sum / (data.length / 4);
    } catch {
      return 140;
    }
  };
};

// ============================================================
// ⚙️ Adaptive detector
// ============================================================
export const createAdaptiveDetector = () => {
  let inputSize = 224;
  const durations = [];

  return {
    getOptions(brightness = 140) {
      const scoreThreshold = brightness < 90 ? 0.32 : 0.5;
      return new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
    },
    recordDuration(ms) {
      durations.push(ms);
      if (durations.length > 8) durations.shift();
      if (durations.length < 5) return;
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      if (avg > 380 && inputSize > 128) {
        inputSize -= 32;
        durations.length = 0;
      } else if (avg < 120 && inputSize < 224) {
        inputSize += 32;
        durations.length = 0;
      }
    },
    get currentInputSize() {
      return inputSize;
    },
  };
};

// ============================================================
// 🎯 ক্যালিব্রেশন — এখন cancel-সাপোর্ট ও নিরাপদ enhance() সহ
// ============================================================
export const calibrateBaseline = async ({
  videoEl,
  enhancer,
  brightnessSampler,
  detector,
  sampleCount = 14,
  intervalMs = 90,
  maxDurationMs = 9000,
  onSample,
  isCancelled, // ✅ NEW: () => boolean — caller can abort early
}) => {
  const ears = [];
  const mars = [];
  const yaws = [];
  const brightnesses = [];
  const startedAt = Date.now();

  for (let i = 0; i < sampleCount; i++) {
    // ✅ NEW: caller asked us to stop (e.g. camera was turned off)
    if (isCancelled?.()) {
      const err = new Error('ক্যালিব্রেশন বাতিল করা হয়েছে');
      err.reason = 'cancelled';
      throw err;
    }

    if (Date.now() - startedAt > maxDurationMs) break;

    const brightness = brightnessSampler(videoEl);
    brightnesses.push(brightness);

    if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth) {
      onSample?.({ progress: Math.round(((i + 1) / sampleCount) * 100), faceFound: false });
      await new Promise(r => setTimeout(r, intervalMs));
      continue;
    }

    // 🔧 FIX: was `enhancer.enhance(...)` called unguarded — now uses
    // the safe wrapper, so a throw here can never abort the whole
    // calibration or (worse) leave it unresolved.
    const input = safeEnhance(enhancer, videoEl, brightness);

    try {
      const started = performance.now();
      const result = await Promise.race([
        faceapi.detectSingleFace(input, detector.getOptions(brightness)).withFaceLandmarks(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('detect-timeout')), 1500)),
      ]);
      detector.recordDuration(performance.now() - started);

      if (result) {
        const { ear, mar, yaw } = readingsFromLandmarks(result.landmarks);
        ears.push(ear);
        mars.push(mar);
        yaws.push(yaw);
      }
      onSample?.({ progress: Math.round(((i + 1) / sampleCount) * 100), faceFound: !!result });
    } catch (err) {
      console.warn('Calibration sample skipped:', err.message);
      onSample?.({ progress: Math.round(((i + 1) / sampleCount) * 100), faceFound: false });
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  const avgBrightness = brightnesses.length
    ? brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length
    : 140;

  if (ears.length < 4) {
    const reason = avgBrightness < 60 ? 'low-light' : 'no-face';
    const err = new Error(
      reason === 'low-light' ? 'পর্যাপ্ত আলো পাওয়া যায়নি' : 'মুখ ঠিকমতো শনাক্ত করা যায়নি'
    );
    err.reason = reason;
    throw err;
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    earBaseline: avg(ears),
    marBaseline: avg(mars),
    yawBaseline: avg(yaws),
    brightness: avgBrightness,
  };
};

// ============================================================
// 👁️ Blink tracker — open → closed → open
// ============================================================
export const createBlinkTracker = (earBaseline) => {
  const closeThreshold = earBaseline * 0.72;
  const openThreshold = earBaseline * 0.85;
  let phase = 'open';

  return {
    update(ear) {
      if (phase === 'open' && ear < closeThreshold) {
        phase = 'closed';
        return { done: false, progress: 50, message: '👀 চোখ বন্ধ হয়েছে — এবার আবার খুলুন' };
      }
      if (phase === 'closed' && ear > openThreshold) {
        phase = 'done';
        return { done: true, progress: 100, message: '✅ পলক শনাক্ত হয়েছে' };
      }
      return { done: false, progress: phase === 'closed' ? 50 : 0, message: null };
    },
    reset() { phase = 'open'; },
  };
};

// ============================================================
// 👄 Mouth tracker — closed → open → closed
// ============================================================
export const createMouthTracker = (marBaseline) => {
  const openThreshold = Math.max(marBaseline * 1.7, marBaseline + 0.12);
  const closeThreshold = marBaseline * 1.25;
  let phase = 'closed';

  return {
    update(mar) {
      if (phase === 'closed' && mar > openThreshold) {
        phase = 'opened';
        return { done: false, progress: 50, message: '👄 মুখ খোলা শনাক্ত হয়েছে — এবার বন্ধ করুন' };
      }
      if (phase === 'opened' && mar < closeThreshold) {
        phase = 'done';
        return { done: true, progress: 100, message: '✅ মুখ খোলা-বন্ধ সম্পন্ন' };
      }
      return { done: false, progress: phase === 'opened' ? 50 : 0, message: null };
    },
    reset() { phase = 'closed'; },
  };
};

// ============================================================
// 🔄 Turn tracker
// ============================================================
export const createTurnTracker = (direction, yawBaseline, holdFrames = 3) => {
  const margin = 0.11;
  let hold = 0;

  return {
    update(yaw) {
      const turned =
        direction === 'right'
          ? yaw < yawBaseline - margin
          : yaw > yawBaseline + margin;

      hold = turned ? hold + 1 : 0;
      const progress = Math.min(100, Math.round((hold / holdFrames) * 100));

      if (hold >= holdFrames) {
        return { done: true, progress: 100, message: '✅ মাথা ঘোরানো শনাক্ত হয়েছে' };
      }
      return {
        done: false,
        progress,
        message: turned
          ? null
          : direction === 'right'
            ? '👉 আস্তে আস্তে ডানে ঘুরান'
            : '👈 আস্তে আস্তে বামে ঘুরান',
      };
    },
    reset() { hold = 0; },
  };
};

export const createStepTracker = (key, baseline) => {
  switch (key) {
    case 'blink': return createBlinkTracker(baseline.earBaseline);
    case 'mouth': return createMouthTracker(baseline.marBaseline);
    case 'turnRight': return createTurnTracker('right', baseline.yawBaseline);
    case 'turnLeft': return createTurnTracker('left', baseline.yawBaseline);
    default: return null;
  }
};

// ============================================================
// 🧩 Model loading
// ============================================================
export const useFaceApiModels = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState(null);
  const loadStartedRef = useRef(false);

  const loadModels = useCallback(async () => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    setModelsLoading(true);
    setModelError(null);
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);
      // tf.ready() may not exist on every face-api.js build — guard it
      // so a missing property doesn't fail model loading entirely.
      if (faceapi.tf?.ready) {
        await faceapi.tf.ready();
      }
      setModelsLoaded(true);
    } catch (err) {
      console.error('❌ Face-api model load error:', err);
      setModelError(err.message || 'ফেস মডেল লোড ব্যর্থ হয়েছে। ইন্টারনেট সংযোগ চেক করুন।');
      loadStartedRef.current = false;
    } finally {
      setModelsLoading(false);
    }
  }, []);

  return { modelsLoaded, modelsLoading, modelError, loadModels };
};

// 🔧 FIX: detectFrame now has its own timeout race (2s), so a single
// hung detection call in the main per-step loop can never block the
// caller forever — previously only calibrateBaseline() had this
// protection, the main loop's detectFrame() call did not.
export const detectFrame = async (input, detector, brightness, timeoutMs = 2000) => {
  const options = detector.getOptions(brightness);
  const started = performance.now();
  const result = await Promise.race([
    faceapi.detectSingleFace(input, options).withFaceLandmarks(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('detect-timeout')), timeoutMs)),
  ]);
  detector.recordDuration(performance.now() - started);
  return result ? { landmarks: result.landmarks, ...readingsFromLandmarks(result.landmarks) } : null;
};

export const detectFaceInImage = async (canvasOrImg) => {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
  const result = await faceapi.detectSingleFace(canvasOrImg, options);
  return result || null;
};