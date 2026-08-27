// src/components/profile/FaceVerificationTab.jsx
import React, { useState, useEffect, useRef } from 'react';

const FaceVerificationTab = ({
  docStatus = {},
  isFaceRejected = false,
  userData = {},
  livenessState = [],
  currentLivenessStep = 0,
  camStream = null,
  livenessComplete = false,
  capturing = false,
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
  const [timeRemaining, setTimeRemaining] = useState(30);
  
  // ⏱️ টাইমার ট্র্যাক করার জন্য রেফারেন্স
  const startTimeRef = useRef(Date.now());
  const timerIntervalRef = useRef(null);

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
      await capturePhoto();
      
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

  // 🆕 টাইমার - 30 সেকেন্ড পর ম্যানুয়াল অপশন দেখাবে
  useEffect(() => {
    // ক্যামেরা চালু এবং লাইভনেস কমপ্লিট না হলে টাইমার শুরু
    if (camStream && !livenessComplete && !manualMode) {
      startTimeRef.current = Date.now();
      setTimeRemaining(30);
      setShowManualOption(false);
      
      // প্রতি সেকেন্ডে আপডেট
      timerIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const remaining = Math.max(0, 30 - Math.floor(elapsed));
        setTimeRemaining(remaining);
        
        // 30 সেকেন্ড হলে ম্যানুয়াল অপশন দেখান
        if (remaining <= 0) {
          setShowManualOption(true);
          clearInterval(timerIntervalRef.current);
        }
      }, 1000);
      
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
    <div className="tab-panel face-panel">
      <h3><i className="fa-solid fa-camera"></i> Face Verification</h3>
      <p className="tab-subtitle">Follow the instructions below</p>

      {/* রিজেক্টেড স্টেট */}
      {isFaceRejected && (
        <div className="verify-error">
          <strong>❌ Face Verification Rejected</strong>
          <p>{userData?.faceRejectReason || 'No reason provided'}</p>
          <button
            className="upload-again-btn"
            onClick={startCamera}
            disabled={!!camStream}
          >
            📸 Capture Again
          </button>
        </div>
      )}

      {/* ইতিমধ্যে ভেরিফাইড */}
      {docStatus.faceVerified && !isFaceRejected ? (
        <div className="info-box success">
          <span className="info-icon">✅</span>
          <div>
            <strong>Face verification completed!</strong>
            <p>Your face has been verified successfully.</p>
          </div>
        </div>
      ) : (
        <>
          {/* ⏱️ টাইমার ইন্ডিকেটর */}
          {camStream && !livenessComplete && !manualMode && (
            <div className="timer-indicator" style={{
              background: '#1a1a2e',
              padding: '8px 16px',
              borderRadius: '8px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              color: '#e2e8f0'
            }}>
              <span className="spinner" style={{
                display: 'inline-block',
                animation: 'spin 1s linear infinite'
              }}></span>
              <span>Auto-detection in progress... 
                {!showManualOption && timeRemaining > 0 && (
                  <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>
                    ({timeRemaining}s)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* 🆕 ম্যানুয়াল ক্যাপচার অপশন - 30 সেকেন্ড পর দেখাবে */}
          {showManualOption && camStream && !livenessComplete && !manualMode && (
            <div className="manual-option-box" style={{
              background: '#fef3c7',
              border: '2px solid #f59e0b',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>⚠️</span>
                <div>
                  <strong style={{ color: '#92400e' }}>Taking too long?</strong>
                  <p style={{ margin: 0, fontSize: '13px', color: '#78350f' }}>
                    Auto-detection is taking longer than expected.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setManualMode(true)}
                style={{
                  background: '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                📸 Capture Manually
              </button>
            </div>
          )}

          {/* 🆕 ম্যানুয়াল ক্যাপচার মোড */}
          {manualMode && camStream && !livenessComplete && (
            <div className="manual-capture-mode" style={{
              background: '#1a1a2e',
              border: '2px solid #14b8a6',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '20px' }}>📸</span>
                <h4 style={{ margin: 0, color: '#e2e8f0' }}>Manual Capture Mode</h4>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '12px' }}>
                Position your face clearly in the camera and click the button below to capture.
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleManualCapture}
                  disabled={manualCapturing}
                  style={{
                    background: '#14b8a6',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: manualCapturing ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    opacity: manualCapturing ? 0.6 : 1
                  }}
                >
                  {manualCapturing ? '⏳ Capturing...' : '📸 Take Photo Now'}
                </button>
                <button
                  onClick={() => {
                    setManualMode(false);
                    setShowManualOption(false);
                    setTimeRemaining(0);
                    if (timerIntervalRef.current) {
                      clearInterval(timerIntervalRef.current);
                      timerIntervalRef.current = null;
                    }
                  }}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ✅ লাইভনেস ইনস্ট্রাকশন - ম্যানুয়াল মোডে লুকানো */}
          {!manualMode && (
            <div className="liveness-instructions">
              {livenessState.map((step, idx) => (
                <div 
                  key={step.id || idx}
                  className={`instruction-step ${step.done ? 'done' : ''} ${camStream && !livenessComplete && idx === currentLivenessStep ? 'active' : ''}`}
                >
                  <div className="inst-text">{step.emoji} {step.label}</div>
                  <div className="inst-status">
                    {step.done ? '✅' : camStream && idx === currentLivenessStep ? '⏳' : '⬜'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ✅ ক্যামেরা বক্স */}
          <div className={`camera-box ${camStream ? 'camera-active' : ''}`}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ display: camStream ? 'block' : 'none', width: '100%', borderRadius: '8px' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            {!camStream && (
              <div className="camera-placeholder">
                <span>📷</span>
                <div>Turn on Camera</div>
              </div>
            )}

            {/* লাইভনেস চলাকালীন স্ক্যান ইফেক্ট - ম্যানুয়াল মোডে বন্ধ */}
            {camStream && !livenessComplete && !manualMode && (
              <div className="scan-overlay">
                <div className="scan-line" />
              </div>
            )}
            
            {/* লাইভনেস সম্পন্ন হলে ওভারলে */}
            {livenessComplete && (
              <div className="liveness-done-overlay">✅ Ready to Capture!</div>
            )}

            {/* 🆕 ম্যানুয়াল মোডে ক্যামেরা গাইড */}
            {manualMode && (
              <div className="manual-guide-overlay" style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(20, 184, 166, 0.9)',
                color: '#fff',
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600',
                pointerEvents: 'none'
              }}>
                👤 Position face in center
              </div>
            )}
          </div>

          {/* ✅ প্রগ্রেস বার */}
          <div className="liveness-progress">
            <div className="progress-text" id="livenessProgressText">
              {doneCount}/{totalSteps} Completed
            </div>
            <div className="progress-bar-small">
              <div 
                className="progress-fill-small" 
                id="livenessProgressFill" 
                style={{ 
                  width: `${progressPercent}%`,
                  transition: 'width 0.4s ease'
                }} 
              />
            </div>
          </div>

          {/* ✅ বাটন */}
          <div className="btn-row">
            {/* Start Camera */}
            {!camStream && !livenessComplete && (
              <button
                className="btn btn-ghost"
                onClick={startCamera}
              >
                📷 Turn on Camera
              </button>
            )}

            {/* Take Photo - লাইভনেস কমপ্লিট হলে */}
            {camStream && livenessComplete && (
              <button
                className="btn btn-primary"
                onClick={capturePhoto}
                disabled={capturing}
              >
                {capturing ? '⏳ Uploading...' : '📸 Take Photo'}
              </button>
            )}

            {/* Stop Camera */}
            {camStream && (
              <button
                className="btn btn-danger"
                onClick={stopCamera}
              >
                ⏹ Stop
              </button>
            )}
          </div>

          {/* ✅ হেল্প টেক্সট */}
          <div className="info-box info" style={{ marginTop: '1rem' }}>
            <span className="info-icon">ℹ️</span>
            <div>
              <strong>How it works:</strong><br />
              1. Click "Turn on Camera"<br />
              2. Follow the instructions (blink naturally)<br />
              3. Click "Take Photo" once ready<br />
              <span style={{ color: '#f59e0b' }}>
                ⏱️ If auto-detection takes too long, use the "Capture Manually" option.
              </span>
            </div>
          </div>

          {/* 🆕 CSS Animation যোগ করুন */}
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .spinner {
              display: inline-block;
              animation: spin 1s linear infinite;
            }
            .manual-option-box {
              animation: slideDown 0.3s ease-out;
            }
            @keyframes slideDown {
              from { opacity: 0; transform: translateY(-10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .manual-capture-mode {
              animation: fadeIn 0.3s ease-out;
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
        </>
      )}
    </div>
  );
};

export default FaceVerificationTab;