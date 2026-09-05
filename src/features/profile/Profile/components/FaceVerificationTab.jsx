// src/components/profile/FaceVerificationTab.jsx
import React, { useState, useEffect, useRef } from 'react';
import styles from './FaceVerificationTab.module.css';

const FaceVerificationTab = ({
  docStatus = {},
  isFaceRejected = false,
  userData = {},
  livenessState = [],
  currentLivenessStep = 0,
  camStream = null,
  livenessComplete = false,
  capturing = false,
  // 🆕 real detection-failure signals from the hook — these already
  // existed there but were never actually passed down to this
  // component, so the manual-capture fallback below had no way to know
  // whether detection was failing and always fell back to a blind,
  // fixed wall-clock wait no matter what was actually happening.
  lowLightWarning = false,
  noFaceWarning = false,
  calibrationFailed = false,
  videoRef,
  canvasRef,
  startCamera,
  stopCamera,
  capturePhoto,
}) => {
  // 🆕 ম্যানুয়াল ক্যাপচার মোডের জন্য স্টেট
  const [manualMode, setManualMode] = useState(false);
  const [manualCapturing, setManualCapturing] = useState(false);
  const [showManualOption, setShowManualOption] = useState(false);
  // 🔧 FIX (#5): reason shown to the user for why manual capture is
  // being offered — was always the same generic "taking too long"
  // message regardless of what actually happened.
  const [manualOptionReason, setManualOptionReason] = useState('timeout');
  const HARD_TIMEOUT_S = 20; // 🔧 was a blind 30s wait no matter what
  const [timeRemaining, setTimeRemaining] = useState(HARD_TIMEOUT_S);

  // ⏱️ টাইমার ট্র্যাক করার জন্য রেফারেন্স
  const startTimeRef = useRef(Date.now());
  const timerIntervalRef = useRef(null);
  // 🔧 FIX: kept as refs (not effect deps) so the timer doesn't restart
  // — and lose its elapsed time — every time these flicker, while the
  // interval tick can still read their latest value.
  const noFaceWarningRef = useRef(noFaceWarning);
  const calibrationFailedRef = useRef(calibrationFailed);
  const failingSinceRef = useRef(null);
  useEffect(() => { noFaceWarningRef.current = noFaceWarning; }, [noFaceWarning]);
  useEffect(() => { calibrationFailedRef.current = calibrationFailed; }, [calibrationFailed]);

  // মোট স্টেপ এবং সম্পন্ন স্টেপ কাউন্ট
  const totalSteps = livenessState.length || 6;
  const doneCount = livenessState.filter(step => step.done).length;
  const progressPercent = totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0;

  // 🆕 ম্যানুয়াল ক্যাপচার ফাংশন
  const handleManualCapture = async () => {
    if (!camStream || !videoRef.current || !canvasRef.current) {
      alert('Please turn on camera first!');
      return;
    }

    setManualCapturing(true);
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d').drawImage(video, 0, 0);

      // ফটো ক্যাপচার করুন
      // 🔧 FIX: must pass { manual: true } so the hook's capturePhoto()
      // doesn't bail out on its "auto liveness complete" check — without
      // this flag, clicking "Take Photo Now" here always silently did
      // nothing and fell back to the auto-detection view.
      await capturePhoto({ manual: true });
      
      // ম্যানুয়াল মোড রিসেট
      setManualMode(false);
      setManualCapturing(false);
      setShowManualOption(false);
      
    } catch (error) {
      console.error('Manual capture error:', error);
      alert('Failed to capture photo. Please try again.');
      setManualCapturing(false);
    }
  };

  // 🔧 FIX (#5 — core bug): this used to be a blind fixed 30s wall-clock
  // wait before showing "Capture Manually", completely disconnected from
  // whether detection was actually working or clearly, immediately
  // failing (no face at all, calibration exhausted its retries). A user
  // whose face was never detected still had to sit through the full 30s
  // every time. Now:
  //  - if calibration has already given up, the manual option appears
  //    right away instead of waiting further,
  //  - if "no face" has been reported continuously for a few seconds,
  //    the option appears early instead of waiting out the full window,
  //  - otherwise (detection genuinely still working/progressing) we
  //    still wait up to a hard ceiling before offering it, so we don't
  //    nag someone mid-gesture — the ceiling itself was also trimmed
  //    from 30s to 20s.
  // Runs on an interval tied only to camStream/livenessComplete/manualMode
  // so it doesn't reset its own elapsed clock every time a warning flag
  // flickers — those are read live via refs instead.
  const EARLY_TRIGGER_MS = 5000;

  useEffect(() => {
    // ক্যামেরা চালু এবং লাইভনেস কমপ্লিট না হলে টাইমার শুরু
    if (camStream && !livenessComplete && !manualMode) {
      startTimeRef.current = Date.now();
      failingSinceRef.current = null;
      setTimeRemaining(HARD_TIMEOUT_S);
      setShowManualOption(false);
      setManualOptionReason('timeout');

      timerIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTimeRef.current;
        const remaining = Math.max(0, HARD_TIMEOUT_S - Math.floor(elapsed / 1000));
        setTimeRemaining(remaining);

        const isFailing = calibrationFailedRef.current || noFaceWarningRef.current;
        if (isFailing) {
          if (failingSinceRef.current == null) failingSinceRef.current = now;
        } else {
          failingSinceRef.current = null;
        }
        const failingDuration = failingSinceRef.current ? now - failingSinceRef.current : 0;

        if (calibrationFailedRef.current) {
          setManualOptionReason('calibration');
          setShowManualOption(true);
          clearInterval(timerIntervalRef.current);
        } else if (failingDuration >= EARLY_TRIGGER_MS) {
          setManualOptionReason('no-face');
          setShowManualOption(true);
          clearInterval(timerIntervalRef.current);
        } else if (elapsed >= HARD_TIMEOUT_S * 1000) {
          setManualOptionReason('timeout');
          setShowManualOption(true);
          clearInterval(timerIntervalRef.current);
        }
      }, 500);

    } else {
      // ক্যামেরা বন্ধ বা লাইভনেস কমপ্লিট হলে টাইমার ক্লিয়ার
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setShowManualOption(false);
    }
    
    // ক্লিনআপ
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [camStream, livenessComplete, manualMode]);

 return (
    <div className={`${styles.tabPanel} ${styles.facePanel}`}>
      <h3><i className="fa-solid fa-camera"></i> Face Verification</h3>
      <p className={styles.tabSubtitle}>Follow the instructions below</p>

      {/* রিজেক্টেড স্টেট */}
      {isFaceRejected && (
        <div className={styles.verifyError}>
          <strong>❌ Face Verification Rejected</strong>
          <p>{userData?.faceRejectReason || 'No reason provided'}</p>
          <button
            className={styles.uploadAgainBtn}
            onClick={startCamera}
            disabled={!!camStream}
          >
            📸 Capture Again
          </button>
        </div>
      )}

      {/* ইতিমধ্যে ভেরিফাইড */}
      {docStatus.faceVerified && !isFaceRejected ? (
        <div className={`${styles.infoBox} ${styles.success}`}>
          <span className={styles.infoIcon}>✅</span>
          <div>
            <strong>Face verification completed!</strong>
            <p>Your face has been verified successfully.</p>
          </div>
        </div>
      ) : (
        <>
          {/* ⏱️ টাইমার ইন্ডিকেটর */}
          {camStream && !livenessComplete && !manualMode && (
            <div className={styles.timerIndicator}>
              <span className={styles.spinner}></span>
              <span>
                Auto-detection in progress... 
                {!showManualOption && timeRemaining > 0 && (
                  <span className={styles.timerText}>({timeRemaining}s)</span>
                )}
              </span>
            </div>
          )}

          {/* 🆕 ম্যানুয়াল ক্যাপচার অপশন — এখন প্রকৃত কারণ অনুযায়ী দ্রুত বা দেরিতে দেখায় */}
          {showManualOption && camStream && !livenessComplete && !manualMode && (
            <div className={styles.manualOptionBox}>
              <div className={styles.manualOptionContent}>
                <span className={styles.manualOptionIcon}>⚠️</span>
                <div>
                  <strong className={styles.manualOptionTitle}>
                    {manualOptionReason === 'no-face'
                      ? "Can't see your face clearly"
                      : manualOptionReason === 'calibration'
                        ? 'Detection setup failed'
                        : 'Taking too long?'}
                  </strong>
                  <p className={styles.manualOptionDesc}>
                    {manualOptionReason === 'no-face'
                      ? (lowLightWarning
                          ? 'The lighting looks too dim — try moving somewhere brighter, or capture manually.'
                          : 'We keep losing your face in frame — try centering it, or capture manually.')
                      : manualOptionReason === 'calibration'
                        ? "We couldn't get a good read on your face after a few tries."
                        : 'Auto-detection is taking longer than expected.'}
                  </p>
                </div>
              </div>
              <button
                className={styles.manualOptionBtn}
                onClick={() => setManualMode(true)}
              >
                📸 Capture Manually
              </button>
            </div>
          )}

          {/* 🆕 ম্যানুয়াল ক্যাপচার মোড */}
          {manualMode && camStream && !livenessComplete && (
            <div className={styles.manualCaptureMode}>
              <div className={styles.manualCaptureHeader}>
                <span className={styles.manualCaptureIcon}>📸</span>
                <h4 className={styles.manualCaptureTitle}>Manual Capture Mode</h4>
              </div>
              <p className={styles.manualCaptureDesc}>
                Position your face clearly in the camera and click the button below to capture.
              </p>
              <div className={styles.manualCaptureActions}>
                <button
                  className={styles.manualCaptureBtn}
                  onClick={handleManualCapture}
                  disabled={manualCapturing}
                >
                  {manualCapturing ? '⏳ Capturing...' : '📸 Take Photo Now'}
                </button>
                <button
                  className={styles.manualCancelBtn}
                  onClick={() => {
                    setManualMode(false);
                    setShowManualOption(false);
                    setTimeRemaining(0);
                    if (timerIntervalRef.current) {
                      clearInterval(timerIntervalRef.current);
                      timerIntervalRef.current = null;
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ✅ লাইভনেস ইনস্ট্রাকশন - ম্যানুয়াল মোডে লুকানো */}
          {!manualMode && (
            <div className={styles.livenessInstructions}>
              {livenessState.map((step, idx) => (
                <div 
                  key={step.id || idx}
                  className={`${styles.instructionStep} ${step.done ? styles.done : ''} ${camStream && !livenessComplete && idx === currentLivenessStep ? styles.active : ''}`}
                >
                  <div className={styles.instText}>{step.emoji} {step.label}</div>
                  <div className={styles.instStatus}>
                    {step.done ? '✅' : camStream && idx === currentLivenessStep ? '⏳' : '⬜'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ✅ ক্যামেরা বক্স */}
          <div className={`${styles.cameraBox} ${camStream ? styles.cameraActive : ''}`}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ display: camStream ? 'block' : 'none', width: '100%', borderRadius: '8px' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            {!camStream && (
              <div className={styles.cameraPlaceholder}>
                <span>📷</span>
                <div>Turn on Camera</div>
              </div>
            )}

            {/* লাইভনেস চলাকালীন স্ক্যান ইফেক্ট - ম্যানুয়াল মোডে বন্ধ */}
            {camStream && !livenessComplete && !manualMode && (
              <div className={styles.scanOverlay}>
                <div className={styles.scanLine} />
              </div>
            )}
            
            {/* লাইভনেস সম্পন্ন হলে ওভারলে */}
            {livenessComplete && (
              <div className={styles.livenessDoneOverlay}>✅ Ready to Capture!</div>
            )}

            {/* 🆕 ম্যানুয়াল মোডে ক্যামেরা গাইড */}
            {manualMode && (
              <div className={styles.manualGuideOverlay}>
                👤 Position face in center
              </div>
            )}
          </div>

          {/* ✅ প্রগ্রেস বার */}
          <div className={styles.livenessProgress}>
            <div className={styles.progressText} id="livenessProgressText">
              {doneCount}/{totalSteps} Completed
            </div>
            <div className={styles.progressBarSmall}>
              <div 
                className={styles.progressFillSmall} 
                id="livenessProgressFill" 
                style={{ 
                  width: `${progressPercent}%`,
                  transition: 'width 0.4s ease'
                }} 
              />
            </div>
          </div>

          {/* ✅ বাটন */}
          <div className={styles.btnRow}>
            {/* Start Camera */}
            {!camStream && !livenessComplete && (
              <button
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={startCamera}
              >
                📷 Turn on Camera
              </button>
            )}

            {/* Take Photo - লাইভনেস কমপ্লিট হলে */}
            {camStream && livenessComplete && (
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={capturePhoto}
                disabled={capturing}
              >
                {capturing ? '⏳ Uploading...' : '📸 Take Photo'}
              </button>
            )}

            {/* Stop Camera */}
            {camStream && (
              <button
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={stopCamera}
              >
                ⏹ Stop
              </button>
            )}
          </div>

          {/* ✅ হেল্প টেক্সট */}
          <div className={`${styles.infoBox} ${styles.info}`}>
            <span className={styles.infoIcon}>ℹ️</span>
            <div>
              <strong>How it works:</strong><br />
              1. Click "Turn on Camera"<br />
              2. Follow the instructions (blink naturally)<br />
              3. Click "Take Photo" once ready<br />
              <span className={styles.helpHint}>
                ⏱️ If auto-detection takes too long, use the "Capture Manually" option.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FaceVerificationTab;