// src/components/profile/FaceVerificationTab.jsx
import React from 'react';

const FaceVerificationTab = ({
  docStatus,
  isFaceRejected,
  userData,
  livenessState,
  currentLivenessStep,
  camStream,
  livenessComplete,
  videoRef,
  canvasRef,
  cameraBoxRef,
  camStartBtnRef,
  captureBtnRef,
  camStopBtnRef,
  startCamera,
  stopCamera,
  capturePhoto,
}) => {
  return (
    <div className="tab-panel face-panel">
      <h3><i className="fa-solid fa-camera"></i> Face Verification</h3>
      <p className="tab-subtitle">Follow the instructions below</p>

      {isFaceRejected && (
        <div className="verify-error">
          <strong>❌ Face Verification Rejected</strong>
          <p>{userData.faceRejectReason || 'No reason provided'}</p>
          <button
            className="upload-again-btn"
            onClick={startCamera}
            disabled={!!camStream}
          >
            📸 Capture Again
          </button>
        </div>
      )}

      {docStatus.faceVerified && !isFaceRejected ? (
        <div className="info-box success">
          <span className="info-icon">✅</span>
          <div>
            <strong>Face verification completed!</strong>
            <p>Your face verification has been completed successfully.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="liveness-instructions">
            {livenessState.map((step, index) => (
              <div
                key={step.id}
                className={`instruction-step ${step.done ? 'done' : ''} ${index === currentLivenessStep && camStream ? 'active' : ''}`}
              >
                <div className="inst-text">{step.label}</div>
                <div className="inst-status">
                  {step.done ? '✅' : index === currentLivenessStep && camStream ? '⏳' : '⬜'}
                </div>
              </div>
            ))}
          </div>

          <div
            className={`camera-box ${camStream ? 'camera-active' : ''}`}
            ref={cameraBoxRef}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ display: camStream ? 'block' : 'none', width: '100%' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {!camStream && (
              <div className="camera-placeholder">
                <span>📷</span>
                <div>Turn on Camera</div>
              </div>
            )}
          </div>

          <div className="liveness-progress">
            <div className="progress-text" id="livenessProgressText">0/{livenessState.length} Completed</div>
            <div className="progress-bar-small">
              <div className="progress-fill-small" id="livenessProgressFill" style={{ width: '0%' }}></div>
            </div>
          </div>

          <div className="btn-row">
            <button
              className="btn btn-ghost"
              ref={camStartBtnRef}
              onClick={startCamera}
              disabled={!!camStream}
            >
              📷 Turn on Camera
            </button>
            <button
              className="btn btn-primary"
              ref={captureBtnRef}
              onClick={capturePhoto}
              style={{ display: 'none' }}
              disabled={!livenessComplete}
            >
              📸 Take Photo
            </button>
            <button
              className="btn btn-danger"
              ref={camStopBtnRef}
              onClick={stopCamera}
              style={{ display: 'none' }}
            >
              ⏹ Stop
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FaceVerificationTab;