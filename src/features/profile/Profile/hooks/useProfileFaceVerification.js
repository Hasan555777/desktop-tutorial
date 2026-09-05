// src/hooks/useProfileFaceVerification.js
//
// 🔧 FIX APPLIED (this revision): this hook's gesture-detection loop
// (runGestureLoop) called detectFrame() directly on the RAW video
// frame, and startCalibration() passed `enhancer: null` (plus a
// `useRawVideo: true` flag that calibrateBaseline() doesn't even
// accept — it was silently ignored). That meant Profile-page face
// verification never got the low-light brightness/contrast boost
// that the Register flow's runLivenessLoop applies via safeEnhance()
// before every detection call — so in dim lighting, Profile's face
// verification would perform noticeably worse than Register's for no
// good reason. Fixed by creating a real frame enhancer here too and
// running every frame (both calibration and the gesture loop) through
// safeEnhance(), exactly like useRegisterFlow.js does.
import { useState, useRef, useCallback, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../shared/firebase/index';
import { useFeedback } from '../../../../shared/ui/Feedback/FeedbackProvider';

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
} from '../../../register/hooks/useFaceLiveness';

import {
  uploadToCloudinary,
  initLiveness,
  LIVENESS_STEPS,
} from '../../../register/hooks/registerHelpers';

const LOOP_TICK_MS = 70;
// 🔧 FIX (#5 — capture option takes too long): calibration used to retry
// 4 times with a 5s per-attempt timeout and a 1.8s gap between attempts,
// so a genuinely failing calibration (bad camera angle, no face at all)
// could silently run for up to ~27s with nothing shown to the user before
// anything happened. Trimmed to 3 attempts / 4s timeout / 1.2s gap
// (~15.6s worst case) — this only affects how long we keep retrying
// baseline calibration, not the actual liveness/security checks below.
const MAX_CALIBRATION_ATTEMPTS = 3;
const CALIBRATION_HARD_TIMEOUT_MS = 4000;
const CALIBRATION_RETRY_GAP_MS = 1200;
// 🔧 FIX: getUserMedia had no timeout at all — a hung permission prompt
// or a flaky mobile camera driver left the user staring at "Turn on
// Camera" forever with zero feedback.
const CAMERA_INIT_TIMEOUT_MS = 12000;

export const useProfileFaceVerification = (currentUser, { onUploaded } = {}) => {
  const feedback = useFeedback();
  // ── State ──
  const [livenessState, setLivenessState] = useState(() => initLiveness());
  const [currentLivenessStep, setCurrentLivenessStep] = useState(0);
  const [camStream, setCamStream] = useState(null);
  const [livenessComplete, setLivenessComplete] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // 🆕 parity with Register's low-light/no-face warnings
  const [lowLightWarning, setLowLightWarning] = useState(false);
  const [noFaceWarning, setNoFaceWarning] = useState(false);
  // 🆕 FIX: surfaced explicitly now instead of calibration retries just
  // silently stopping with no visible state change — lets the UI react
  // immediately instead of relying on an unrelated fixed timer.
  const [calibrationFailed, setCalibrationFailed] = useState(false);

  const { modelsLoaded, loadModels } = useFaceApiModels();

  // ── Refs ──
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const camStreamRef = useRef(null);
  const livenessTimerRef = useRef(null);
  const livenessStartTimeoutRef = useRef(null);
  const isLivenessRunningRef = useRef(false);
  const calibrationAttemptsRef = useRef(0);
  const calibrationGenerationRef = useRef(0);
  const baselineRef = useRef(null);
  const isMountedRef = useRef(true);
  const captureTriggeredRef = useRef(false);

  const brightnessSamplerRef = useRef(createBrightnessSampler());
  const detectorRef = useRef(createAdaptiveDetector());
  // 🆕 real frame enhancer, same as Register — was missing entirely before
  const enhancerRef = useRef(createFrameEnhancer());

  // ── Helpers ──
  const stopMediaStream = useCallback(() => {
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (livenessTimerRef.current) {
      clearTimeout(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }
    if (livenessStartTimeoutRef.current) {
      clearTimeout(livenessStartTimeoutRef.current);
      livenessStartTimeoutRef.current = null;
    }
  }, []);

  const updateProgressUI = useCallback((doneCount, total) => {
    const text = document.getElementById('livenessProgressText');
    if (text) text.textContent = `${doneCount}/${total} Completed`;
    const fill = document.getElementById('livenessProgressFill');
    if (fill) fill.style.width = `${Math.round((doneCount / total) * 100)}%`;
  }, []);

  const resetLivenessUI = useCallback(() => {
    calibrationGenerationRef.current++;
    isLivenessRunningRef.current = false;
    captureTriggeredRef.current = false;
    
    if (isMountedRef.current) {
      setLivenessState(() => initLiveness());
      setCurrentLivenessStep(0);
      setLivenessComplete(false);
      setLowLightWarning(false);
      setNoFaceWarning(false);
      setCalibrationFailed(false);
    }
    
    baselineRef.current = null;
    updateProgressUI(0, LIVENESS_STEPS.length);
    clearTimers();
  }, [clearTimers, updateProgressUI]);

  // ── Effects ──
  useEffect(() => {
    isMountedRef.current = true;
    loadModels();
    
    return () => {
      isMountedRef.current = false;
      stopMediaStream();
      clearTimers();
    };
  }, [loadModels, stopMediaStream, clearTimers]);

  useEffect(() => {
    camStreamRef.current = camStream;
  }, [camStream]);

  // ── Gesture Loop ──
  const runGestureLoop = useCallback((baseline, generation) => {
    const totalSteps = LIVENESS_STEPS.length;
    let stepIdx = 0;
    let tracker = createStepTracker(LIVENESS_STEPS[stepIdx].key, baseline);
    let noFaceCount = 0;
    const MAX_NO_FACE = 20;

    if (isMountedRef.current) {
      setLivenessState(() => initLiveness());
      setCurrentLivenessStep(0);
      setLivenessComplete(false);
    }
    updateProgressUI(0, totalSteps);
    isLivenessRunningRef.current = true;

    const isStale = () => calibrationGenerationRef.current !== generation || !isMountedRef.current;

    const loop = async () => {
      if (!isLivenessRunningRef.current || isStale()) return;

      try {
        const video = videoRef.current;
        
        if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
          if (isLivenessRunningRef.current && !isStale()) {
            livenessTimerRef.current = setTimeout(loop, LOOP_TICK_MS);
          }
          return;
        }

        const brightness = brightnessSamplerRef.current(video);
        if (isMountedRef.current) setLowLightWarning(brightness < 55);

        // 🔧 FIX: was `detectFrame(video, ...)` on the raw frame — now
        // enhanced the same way Register does, so low-light detection
        // performs the same across both flows.
        const input = safeEnhance(enhancerRef.current, video, brightness);

        let detection = null;
        
        try {
          // 🔧 FIX: was a 5000ms per-attempt timeout here (vs. Register's
          // 2000ms default) — a single stalled detection call could eat
          // up to 5s before even being counted as "no face", so it took
          // far longer than Register for noFaceWarning to fire. Matched
          // to Register's timeout so failures surface at the same speed.
          detection = await detectFrame(input, detectorRef.current, brightness, 2000);
        } catch {
          noFaceCount++;
        }

        if (!isLivenessRunningRef.current || isStale()) return;

        if (!detection) {
          noFaceCount++;
          if (isMountedRef.current) setNoFaceWarning(noFaceCount > 6);
          if (isLivenessRunningRef.current && !isStale()) {
            livenessTimerRef.current = setTimeout(loop, LOOP_TICK_MS);
          }
          return;
        }

        noFaceCount = 0;
        if (isMountedRef.current) setNoFaceWarning(false);
        const key = LIVENESS_STEPS[stepIdx].key;
        const value = key === 'blink' ? detection.ear : key === 'mouth' ? detection.mar : detection.yaw;
        const result = tracker.update(value);

        if (result.done) {
          if (isMountedRef.current) {
            setLivenessState(prev => prev.map((s, idx) => idx === stepIdx ? { ...s, done: true } : s));
          }
          stepIdx++;
          updateProgressUI(stepIdx, totalSteps);

          if (stepIdx >= totalSteps) {
            isLivenessRunningRef.current = false;
            if (isMountedRef.current) {
              setLivenessComplete(true);
            }
            return;
          }
          
          tracker = createStepTracker(LIVENESS_STEPS[stepIdx].key, baseline);
          if (isMountedRef.current) {
            setCurrentLivenessStep(stepIdx);
          }
        }
      } catch (error) {
        console.error('Gesture loop error:', error);
      } finally {
        if (isLivenessRunningRef.current && !isStale()) {
          livenessTimerRef.current = setTimeout(loop, LOOP_TICK_MS);
        }
      }
    };

    loop();
  }, [updateProgressUI]);

  // ── Calibration ──
  const startCalibration = useCallback(async () => {
    if (isLivenessRunningRef.current || !isMountedRef.current || !modelsLoaded || !videoRef.current) {
      return;
    }

    const myGeneration = ++calibrationGenerationRef.current;
    const isStale = () => calibrationGenerationRef.current !== myGeneration || !camStreamRef.current || !isMountedRef.current;

    try {
      const baseline = await Promise.race([
        calibrateBaseline({
          videoEl: videoRef.current,
          // 🔧 FIX: was `null` (plus a non-existent `useRawVideo: true`
          // flag) — now uses the same real enhancer as Register.
          enhancer: enhancerRef.current,
          brightnessSampler: brightnessSamplerRef.current,
          detector: detectorRef.current,
          sampleCount: 6,
          intervalMs: 90,
          maxDurationMs: 4000,
          isCancelled: isStale,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('calibration timeout')), CALIBRATION_HARD_TIMEOUT_MS)),
      ]);

      if (isStale() || !isMountedRef.current) return;

      baselineRef.current = baseline;
      if (isMountedRef.current) {
        setLowLightWarning(baseline.brightness < 55);
        setCalibrationFailed(false);
      }
      calibrationAttemptsRef.current = 0;

      if (!isLivenessRunningRef.current) {
        runGestureLoop(baseline, myGeneration);
      }
    } catch (err) {
      if (isStale() || !isMountedRef.current) return;
      
      calibrationAttemptsRef.current += 1;
      if (calibrationAttemptsRef.current < MAX_CALIBRATION_ATTEMPTS) {
        livenessStartTimeoutRef.current = setTimeout(() => {
          if (!isStale() && isMountedRef.current) {
            startCalibration();
          }
        }, CALIBRATION_RETRY_GAP_MS);
      } else {
        // 🔧 FIX: retries used to just stop here with no state change —
        // the camera preview kept running under an infinite "detecting"
        // spinner with nothing telling the UI calibration had actually
        // given up. Now surfaced so the UI can react immediately instead
        // of waiting on an unrelated fixed timer.
        if (isMountedRef.current) setCalibrationFailed(true);
      }
    }
  }, [modelsLoaded, runGestureLoop]);

  // ── startCamera ──
  const startCamera = useCallback(async () => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
    }
    
    if (!modelsLoaded) {
      await loadModels();
    }

    // 🔧 FIX: getUserMedia had no timeout — a hung permission prompt or a
    // flaky camera driver (common on some mobile browsers) left the user
    // on "Turn on Camera" forever with no error and nothing to retry.
    let timedOut = false;
    let timeoutId;
    const streamPromise = navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });

    try {
      const stream = await Promise.race([
        streamPromise,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            timedOut = true;
            reject(Object.assign(new Error('camera-init-timeout'), { reason: 'timeout' }));
          }, CAMERA_INIT_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timeoutId);

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      setCamStream(stream);
      camStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      resetLivenessUI();
      calibrationAttemptsRef.current = 0;

      clearTimers();
      livenessStartTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && camStreamRef.current) {
          startCalibration();
        }
      }, 1500);

    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Camera start error:', error);

      // 🔧 FIX: if getUserMedia eventually resolves *after* we've already
      // given up on the timeout race, the browser has still turned the
      // camera on — Promise.race doesn't cancel the loser, so without
      // this the camera stream would leak (light stays on, track never
      // stopped, never tracked in state/refs).
      if (timedOut) {
        streamPromise.then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
      }

      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        feedback?.alert.error({ title: 'Camera permission denied. Please allow camera access and try again.' });
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        feedback?.alert.error({ title: 'No camera was found on this device.' });
      } else if (error?.message === 'camera-init-timeout') {
        feedback?.alert.error({ title: 'Camera took too long to start. Please try again.' });
      } else {
        feedback?.alert.error({ title: 'Could not access camera. Please check permissions.' });
      }
    }
  }, [modelsLoaded, loadModels, resetLivenessUI, clearTimers, startCalibration]);

  // ── stopCamera ──
  const stopCamera = useCallback(() => {
    calibrationGenerationRef.current++;
    clearTimers();
    stopMediaStream();
    setCamStream(null);
    isLivenessRunningRef.current = false;
    resetLivenessUI();
  }, [clearTimers, stopMediaStream, resetLivenessUI]);

  // ── capturePhoto ──
  // 🔧 FIX: "Take Photo Now" in Manual Capture Mode was calling this
  // same capturePhoto() with no way to bypass the "auto liveness gesture
  // sequence complete" gate below. That gate is exactly what Manual
  // Capture Mode exists to skip (it's the fallback for when the gesture
  // loop is stuck) — so clicking it silently no-op'd here every time,
  // manualMode then closed back to false in the component, and the UI
  // fell right back to the still-running "Auto-detection in progress..."
  // view with no photo ever taken. A `manual` flag now lets a manual
  // capture through; the actual per-photo face-presence check further
  // below (detectFaceInImage) still runs unconditionally either way, so
  // real verification isn't weakened — only the "did you finish blink/
  // mouth/turn" gate is bypassed, which was always manual mode's point.
  const capturePhoto = useCallback(async ({ manual = false } = {}) => {
    if ((!livenessComplete && !manual) || capturing || !isMountedRef.current || captureTriggeredRef.current || !currentUser?.uid) {
      return;
    }

    captureTriggeredRef.current = true;

    // 🔧 FIX: stop the background gesture loop before a manual capture —
    // otherwise it kept running (and rescheduling itself) against a
    // video stream that's about to be stopped below, racing with the
    // capture and potentially flipping state (e.g. livenessComplete)
    // mid-upload.
    if (manual) {
      calibrationGenerationRef.current++;
      isLivenessRunningRef.current = false;
      clearTimers();
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      captureTriggeredRef.current = false;
      return;
    }

    setCapturing(true);

    try {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d').drawImage(video, 0, 0);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Failed to create image');

      stopMediaStream();
      setCamStream(null);

      const faceDetected = await detectFaceInImage(canvas).catch(() => null);
      if (!faceDetected) {
        feedback?.alert.warning({ title: 'No face detected in the image. Please try again.' });
        resetLivenessUI();
        return;
      }

      const file = new File([blob], 'face_photo.jpg', { type: 'image/jpeg' });
      // 🔧 FIX: uploadToCloudinary now consistently returns { url, publicId }
      // for BOTH the Register and Profile flows (see registerHelpers.js) —
      // this call was already written correctly expecting `result.url`,
      // it was profileHelpers.js's version elsewhere in the Profile
      // feature that was out of sync and returning a bare string instead.
      const result = await uploadToCloudinary(file, 'face_photos');

      if (!isMountedRef.current) return;

      // 🔧 FIX (identity DB check): this used to only update
      // faceVerified/faceStatus — it never set needsReview:true, so a
      // user resubmitting ONLY their face photo (not NID/birth cert
      // documents) never surfaced in admin's "needs review" queue at
      // all (that queue filters purely on needsReview===true — see
      // AdminDashboard.jsx). Also resets verificationStatus back to
      // 'pending' if it had already been decided, same as document
      // resubmission already does, so a face-only resubmit after a
      // prior rejection correctly re-opens review instead of leaving
      // the old rejected/verified status in place.
      await updateDoc(doc(db, 'users', currentUser.uid), {
        facePhotoUrl: result.url,
        photoURL: result.url,
        faceVerified: false,
        faceStatus: 'pending',
        faceRejectReason: '',
        faceSubmittedAt: serverTimestamp(),
        needsReview: true,
        verificationStatus: 'pending',
      });

      resetLivenessUI();
      onUploaded?.();

    } catch (error) {
      console.error('Face capture error:', error);
      feedback?.alert.error({ title: 'Failed to upload photo. Please try again.' });
      resetLivenessUI();
    } finally {
      if (isMountedRef.current) {
        setCapturing(false);
      }
      captureTriggeredRef.current = false;
    }
  }, [livenessComplete, capturing, currentUser?.uid, resetLivenessUI, onUploaded, stopMediaStream, clearTimers]);

  // ── Return ──
  return {
    livenessState,
    currentLivenessStep,
    camStream,
    livenessComplete,
    capturing,
    modelsLoaded,
    lowLightWarning,
    noFaceWarning,
    calibrationFailed,
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    capturePhoto,
  };
};