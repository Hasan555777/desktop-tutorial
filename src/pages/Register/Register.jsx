// src/pages/Register/Register.jsx
import React from 'react';
import toast, { Toaster } from 'react-hot-toast';
import './Register.css';
import { useRegisterFlow } from './hooks/useRegisterFlow';

const Register = ({ onSwitchToLogin }) => {
const {
    currentStep,
    loading,
    uploadingDocs,
    otpSent,
    otpTimer,
    phoneVerified,
    otpVerifying,
    selectedVerify,
    cameraActive,
    livenessState,
    currentLivIdx,
    livenessComplete,
    faceVerified,
    faceStatusMsg,
    livenessMessage,
    livenessProgress,
    formData,
    setFormData,
    fileErrors,
    doneCount,
    docUploaded,
    anyVerify,

    // ✅ NEW
    isLivenessRunning,
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
    goStep1,
    sendOTP,
    resendOTP,
    otpInput,

    selectVerify,
    goStep3,
    skipVerification,

    removeFile,
    compressAndPreview,
    goStep4,
    skipToFace,

    startCamera,
    stopCamera,
    skipFace,

    handleFinalRegistration,

    checkPwStrength,
    togglePw,
  } = useRegisterFlow();

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
                    placeholder="01712345678"
                    maxLength="11"
                    value={formData.phone}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '');
                      setFormData(p => ({ ...p, phone: value }));
                    }}
                  />
                </div>
                <div className="field-error" id="phoneErr">সঠিক নম্বর দিন (যেমন: 01712345678)</div>
              </div>

              {otpVerifying && (
                <div className="info-box info">
                  <span className="info-icon">🔐</span>
                  <span>OTP যাচাই করা হচ্ছে...</span>
                </div>
              )}

              {phoneVerified && (
                <div className="info-box success">
                  <span className="info-icon">✅</span>
                  <span>ফোন নম্বর সফলভাবে যাচাই হয়েছে!</span>
                </div>
              )}

              {otpSent && !phoneVerified && (
                <div>
                  <div className="info-box info">
                    <span className="info-icon">📱</span>
                    <span>OTP পাঠানো হয়েছে। নিচে ৬ ডিজিটের কোড দিন:</span>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ textAlign: 'center', display: 'block', marginBottom: '.75rem' }}>
                      OTP কোড লিখুন (৬ ডিজিট)
                    </label>
                    <div className="otp-row">
                      {[0, 1, 2, 3, 4, 5].map(idx => (
                        <input
                          key={idx}
                          className="otp-box"
                          maxLength="1"
                          type="text"
                          inputMode="numeric"
                          disabled={phoneVerified}
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
                    <button
                      className="resend-btn"
                      onClick={resendOTP}
                      disabled={otpTimer > 0 || phoneVerified}
                    >
                      পুনরায় পাঠান {otpTimer > 0 && <span>({otpTimer}s)</span>}
                    </button>
                  </div>
                </div>
              )}

              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => goToStep(1)}>← পিছনে</button>
                <button
                  className="btn btn-primary"
                  onClick={sendOTP}
                  disabled={loading || phoneVerified}
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      OTP পাঠানো হচ্ছে...
                    </>
                  ) : phoneVerified ? (
                    '✅ যাচাই সম্পন্ন'
                  ) : otpSent ? (
                    '📨 নতুন OTP পাঠান'
                  ) : (
                    '📨 OTP পাঠান'
                  )}
                </button>
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
                              toast.error('⚠️ ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!');
                              e.target.value = '';
                              return;
                            }
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
                              toast.error('⚠️ ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!');
                              e.target.value = '';
                              return;
                            }
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
                            toast.error('⚠️ PDF ফাইলের সাইজ ৫MB এর বেশি হতে পারবে না!');
                            e.target.value = '';
                            return;
                          }

                          if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) {
                            toast.error('⚠️ ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!');
                            e.target.value = '';
                            return;
                          }

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
{/* ── স্টেপ ৫ (নতুন সিস্টেম) ── */}
            <div className={`step-panel ${currentStep === 5 ? 'active' : ''}`} id="step5">
              <div className="step-title">📸 মুখমণ্ডল যাচাই</div>
              <div className="step-subtitle">
                ক্যামেরা চালু করুন — নিচের অ্যাভাটার যা করবে, আপনিও ঠিক সেটাই করুন।
              </div>

              {modelsLoading && !modelsLoaded && (
                <div className="info-box info">
                  <span className="info-icon">⏳</span>
                  <span>ফেস যাচাই মডেল লোড হচ্ছে, একটু অপেক্ষা করুন...</span>
                </div>
              )}
              {modelError && (
                <div className="info-box warn">
                  <span className="info-icon">⚠️</span>
                  <span>{modelError}</span>
                </div>
              )}

              {/* ── অ্যাভাটার গাইড ── */}
              <div
                className={
                  `liveness-avatar-wrap ` +
                  (calibrating ? 'ls-calibrating' :
                   livenessComplete ? 'ls-done' :
                   livenessState[currentLivIdx]?.key ? `ls-${livenessState[currentLivIdx].key}` : 'ls-idle')
                }
              >
                <svg viewBox="0 0 160 160" className="avatar-svg" aria-hidden="true">
                  <circle className="avatar-face" cx="80" cy="80" r="60" />
                  <g className="avatar-turn-group">
                    <ellipse className="avatar-eye avatar-eye-left" cx="58" cy="74" rx="8" ry="11" />
                    <ellipse className="avatar-eye avatar-eye-right" cx="102" cy="74" rx="8" ry="11" />
                    <path className={`avatar-mouth ${livenessComplete ? 'avatar-mouth-happy' : ''}`} d="M55 106 Q80 106 105 106" />
                  </g>
                </svg>
                <div className="avatar-caption">
                  {calibrating
                    ? `📐 ক্যামেরা মাপা হচ্ছে... ${calibrationProgress}%`
                    : livenessComplete
                      ? '🎉 সব ঠিক আছে!'
                      : livenessMessage}
                </div>
              </div>

              {/* ── সতর্কবার্তা ── */}
              {lowLightWarning && !calibrating && (
                <div className="info-box warn liveness-hint">
                  <span className="info-icon">💡</span>
                  <span>আলো একটু কম মনে হচ্ছে — যতটা সম্ভব আলোর দিকে মুখ করুন</span>
                </div>
              )}
              {noFaceWarning && !calibrating && (
                <div className="info-box warn liveness-hint">
                  <span className="info-icon">🙂</span>
                  <span>মুখ শনাক্ত হচ্ছে না — ক্যামেরার আরেকটু কাছে আসুন</span>
                </div>
              )}

              {/* ── ৪-ধাপের ডট + প্রতি-ধাপ % ── */}
              <div className="step-dots-new">
                {livenessState.map((step, idx) => {
                  const isActive = idx === currentLivIdx && !livenessComplete;
                  const pct = step.done ? 100 : isActive ? currentStepProgress : 0;
                  return (
                    <div key={step.id} className={`step-dot-new ${step.done ? 'done' : isActive ? 'active' : ''}`}>
                      <div className="step-ring" style={{ '--p': pct }}>
                        <span>{step.done ? '✓' : `${pct}%`}</span>
                      </div>
                      <div className="step-dot-label">{step.emoji} {step.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* ── ক্যামেরা বক্স + স্ক্যান অ্যানিমেশন ── */}
              <div className={`camera-box ${cameraActive ? 'camera-active' : ''} ${isLivenessRunning ? 'scanning' : ''}`} style={{ position: 'relative' }}>
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

                {cameraActive && (
                  <>
                    <div className="face-guide-oval" />
                    <div className="scan-overlay">
                      <div className="scan-line" />
                    </div>
                  </>
                )}

                {livenessComplete && (
                  <div className="liveness-done-overlay">🎉 সব সম্পন্ন!</div>
                )}
              </div>

              {/* ── সামগ্রিক প্রগ্রেস ── */}
              <div className="liveness-progress">
                <div className="progress-text">
                  {doneCount}/{livenessState.length} সম্পন্ন · {Math.round(livenessProgress)}%
                </div>
                <div className="progress-bar-small">
                  <div
                    className="progress-fill-small"
                    style={{ width: `${livenessProgress}%`, transition: 'width 0.4s ease' }}
                  />
                </div>
              </div>

              {faceStatusMsg === 'captured' && (
                <div className="info-box success">
                  <span className="info-icon">✅</span>
                  <div>মুখমণ্ডলের ছবি সফলভাবে ক্যাপচার হয়েছে!</div>
                </div>
              )}

              {/* ── ক্যালিব্রেশন বারবার ব্যর্থ হলে ম্যানুয়াল রিট্রাই ── */}
              {calibrationFailed && (
                <div className="info-box warn">
                  <span className="info-icon">⚠️</span>
                  <div>
                    বারবার মুখ শনাক্ত করা যাচ্ছে না। আলো ঠিক করুন বা ক্যামেরার অবস্থান বদলে আবার চেষ্টা করুন।
                    <div style={{ marginTop: '.5rem' }}>
                      <button className="btn btn-ghost" onClick={retryCalibration}>🔄 আবার চেষ্টা করুন</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="btn-row">
                {!cameraActive && !faceVerified && (
                  <button className="btn btn-ghost" onClick={startCamera} disabled={modelsLoading && !modelsLoaded}>
                    {modelsLoading && !modelsLoaded ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i> মডেল লোড হচ্ছে...
                      </>
                    ) : (
                      '📷 ক্যামেরা চালু'
                    )}
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
                  ১. ক্যামেরা চালু করলে প্রথমে আপনার মুখ ~১-২ সেকেন্ড মাপা হয় (ক্যালিব্রেশন)।<br />
                  ২. এরপর অ্যাভাটার যা দেখাবে (পলক, মুখ খোলা-বন্ধ, মাথা ঘোরানো), সেটাই বাস্তবে করুন — সরাসরি মাপা হয়।<br />
                  ৩. রাতে বা কম আলোতেও কাজ করে — শুধু চেষ্টা করুন মুখটা যতটা সম্ভব আলোর দিকে রাখতে।
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

              {!phoneVerified && (
                <div className="info-box warn" style={{ marginTop: '0.75rem' }}>
                  <span className="info-icon">⚠️</span>
                  <div>নিবন্ধন সম্পূর্ণ করতে ফোন নম্বর OTP দিয়ে যাচাই করুন।</div>
                </div>
              )}

              <div className="btn-row" style={{ marginTop: '8px' }}>
                <button
                  className="btn btn-success"
                  onClick={handleFinalRegistration}
                  disabled={loading || uploadingDocs || !phoneVerified}
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
                window.location.assign('/login');
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
