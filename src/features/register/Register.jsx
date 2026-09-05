// src/pages/Register/Register.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom'; // 🔧 FIX: needed for client-side navigation
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import styles from './Register.module.css';
import { useRegisterFlow } from './hooks/useRegisterFlow';

const Register = ({ onSwitchToLogin }) => {
  const navigate = useNavigate(); // 🔧 FIX: react-router navigation, no full page reload
  const feedback = useFeedback();

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

    emailTaken,
    phoneTaken,

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

    manualUploadAvailable,
    manualUploading,
    handleManualCapture,

    goToStep,
    goStep1,
    sendOTP,
    resendOTP,
    otpInput,
    verifyOtp,

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

  // ══════════════════════════════════════════════════════════════
  // 🔧 FIX: এখানে আগে window.location.assign('/login') ব্যবহার হতো
  // fallback হিসেবে — সেটা ব্রাউজারের হার্ড নেভিগেশন, যা পুরো পেজ
  // রিলোড করে দেয় (React state, রেজিস্ট্রেশন প্রগ্রেস সব হারিয়ে যায়)।
  // এখন react-router-এর navigate() ব্যবহার করা হচ্ছে, যেটা ক্লায়েন্ট-
  // সাইড রাউট পরিবর্তন করে — কোনো পেজ রিফ্রেশ হয় না। onSwitchToLogin
  // prop দেওয়া থাকলে সেটাই আগে ব্যবহার হবে (parent যদি টগল-স্টেট দিয়ে
  // Login/Register সুইচ করে), না থাকলে navigate('/login') fallback।
  // ══════════════════════════════════════════════════════════════
  const goToLogin = (e) => {
    e.preventDefault();
    if (onSwitchToLogin) {
      onSwitchToLogin();
    } else {
      navigate('/login');
    }
  };

  return (
    <div className={styles.shopnestRegister}>
      <div className={styles.authCard} id="authCard">

        {/* ── প্রগ্রেস বার ── */}
        <div className={styles.progressBar}>
          <div className={styles.progressFill} id="progressFill" style={{ width: '14%' }} />
        </div>

        <div id="registerFlow">
          <div className={styles.stepIndicator} id="stepIndicator">
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
                  className={styles.stepDotWrap}
                  onClick={() => {}}
                  style={{ cursor: 'default' }}
                >
                  <div
                    className={`${styles.stepDot} ${n === currentStep ? styles.active : n < currentStep ? styles.done : ''}`}
                    id={`dot${n}`}
                  >
                    {n < currentStep ? '✓' : n < 6 ? n : '✓'}
                  </div>
                  <div className={`${styles.stepLabel} ${n === currentStep ? styles.active : ''}`} id={`lbl${n}`}>
                    {lbl}
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div className={`${styles.stepLine} ${n < currentStep ? styles.done : ''}`} id={`line${n}${n + 1}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className={styles.cardBody}>
            {/* ── স্টেপ ১ ── */}
            <div className={`${styles.stepPanel} ${currentStep === 1 ? styles.active : ''}`} id="step1">
              <div className={styles.stepSubtitle}>WorkTrustbd-এ স্বাগতম! প্রথমে আপনার তথ্য দিন।</div>

              <div className={styles.fieldRow}> 
                <div className={styles.field}>
                  <label> নাম দিন  <span className={styles.req}>*</span></label>
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

                <div className={styles.field}>
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

              <div className={styles.field}>
                <label>ইমেইল <span className={styles.req}>*</span></label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                />
                <div className={styles.fieldError} id="emailErr">সঠিক ইমেইল দিন</div>
                {emailTaken && (
                  <div className={`${styles.fieldError} ${styles.show}`}>
                    ❌ এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে।{' '}
                    <a href="#" className={styles.link} onClick={goToLogin}>লগইন করুন</a>
                    {' '}অথবা পাসওয়ার্ড রিসেট করুন।
                  </div>
                )}
              </div>

              <div className={styles.field}>
                <label>পাসওয়ার্ড <span className={styles.req}>*</span></label>
                <div className={styles.pwWrap}>
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
                  <button className={styles.pwToggle} onClick={e => togglePw('regPass', e.currentTarget)}>👁️</button>
                </div>
                <div className={styles.pwStrength}><div className={styles.pwStrengthFill} id="pwFill" /></div>
                <div className={styles.fieldHint} id="pwHint">🔒 পাসওয়ার্ড দিন</div>
              </div>

              <div className={styles.field}>
                <label>পাসওয়ার্ড নিশ্চিত করুন <span className={styles.req}>*</span></label>
                <div className={styles.pwWrap}>
                  <input
                    type="password"
                    id="regPass2"
                    placeholder="একই পাসওয়ার্ড পুনরায়"
                    value={formData.confirmPassword}
                    onChange={e => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                  />
                  <button className={styles.pwToggle} onClick={e => togglePw('regPass2', e.currentTarget)}>👁️</button>
                </div>
                <div className={styles.fieldError} id="pass2Err">পাসওয়ার্ড মিলছে না</div>
              </div>

              <div className={styles.field}>
                <label>জন্ম তারিখ <span className={styles.req}>*</span></label>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={e => setFormData(p => ({ ...p, dob: e.target.value }))}
                />
              </div> 

              {/* <div className={`${styles.field} ${styles.mt1}`}>
                <label>আপনি কি হিসেবে যোগ দিতে চান? <span className={styles.req}>*</span></label>
                <div className={styles.roleSelector}>
                  {['client', 'freelancer'].map(r => (
                    <label key={r} className={`${styles.roleOption} ${formData.role === r ? styles.active : ''}`}>
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
              </div> */}

              <div className={styles.btnRow}>
                <button className={styles.btnPrimary} onClick={goStep1} disabled={loading}>
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> যাচাই করা হচ্ছে...
                    </>
                  ) : (
                    'পরবর্তী ধাপ →'
                  )}
                </button>
              </div>
            </div>

            {/* ── স্টেপ ২ ── */}
            <div className={`${styles.stepPanel} ${currentStep === 2 ? styles.active : ''}`} id="step2">
              <div className={styles.stepTitle}>📱 ফোন নম্বর যাচাই</div>
              <div className={styles.stepSubtitle}>আপনার মোবাইলে একটি OTP পাঠানো হবে।</div>

              <div className={styles.field}>
                <label>মোবাইল নম্বর <span className={styles.req}>*</span></label>
                <div className={styles.phoneRow}>
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
                <div className={styles.fieldError} id="phoneErr">সঠিক নম্বর দিন (যেমন: 01712345678)</div>
                {phoneTaken && (
                  <div className={`${styles.fieldError} ${styles.show}`}>
                    ❌ এই নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে। দয়া করে নতুন নম্বর দিন, অথবা{' '}
                    <a href="#" className={styles.link} onClick={goToLogin}>পাসওয়ার্ড রিসেট</a>
                    {' '}করে অ্যাকাউন্ট ফিরিয়ে আনুন।
                  </div>
                )}
              </div>

              {otpVerifying && (
                <div className={`${styles.infoBox} ${styles.info}`}>
                  <span className={styles.infoIcon}>🔐</span>
                  <span>OTP যাচাই করা হচ্ছে...</span>
                </div>
              )}

              {phoneVerified && (
                <div className={`${styles.infoBox} ${styles.success}`}>
                  <span className={styles.infoIcon}>✅</span>
                  <span>ফোন নম্বর সফলভাবে যাচাই হয়েছে!</span>
                </div>
              )}

              {otpSent && !phoneVerified && (
                <div>
                  <div className={`${styles.infoBox} ${styles.info}`}>
                    <span className={styles.infoIcon}>📱</span>
                    <span>OTP পাঠানো হয়েছে। নিচে ৬ ডিজিটের কোড দিন:</span>
                  </div>
                  <div className={styles.otpContainer}>
                    <label>OTP কোড লিখুন (৬ ডিজিট)</label>
                    <div className={styles.otpRow}>
                      {[0, 1, 2, 3, 4, 5].map(idx => (
                        <input
                          key={idx}
                          className={styles.otpBox}
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
                  <div className={styles.resendRow}>
                    কোড পাননি?{' '}
                    <button
                      className={styles.resendBtn}
                      onClick={resendOTP}
                      disabled={otpTimer > 0 || phoneVerified}
                    >
                      পুনরায় পাঠান {otpTimer > 0 && <span>({otpTimer}s)</span>}
                    </button>
                  </div>

                  {/* 🆕 FIX (#6): explicit Verify OTP button — auto-submit on
                      the last digit still works, but this is the reliable
                      fallback the ticket asked for (SMS autofill / paste
                      that fills all six boxes at once doesn't always fire
                      the auto-submit path). Disabled while a verification
                      request is already in flight or once already verified,
                      so it can't be used to fire duplicate requests. */}
                  <div className={styles.btnRow}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={verifyOtp}
                      disabled={otpVerifying || phoneVerified}
                    >
                      {otpVerifying ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i>
                          যাচাই করা হচ্ছে...
                        </>
                      ) : (
                        '🔐 OTP যাচাই করুন'
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.btnRow}>
                <button className={styles.btnGhost} onClick={() => goToStep(1)}>← পিছনে</button>
                <button
                  className={styles.btnPrimary}
                  onClick={sendOTP}
                  disabled={loading || phoneVerified}
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      {otpSent ? 'পাঠানো হচ্ছে...' : 'যাচাই করা হচ্ছে...'}
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
            <div className={`${styles.stepPanel} ${currentStep === 3 ? styles.active : ''}`} id="step3">
              <div className={styles.stepTitle}>🪪 পরিচয় যাচাইয়ের উপায়</div>
              <div className={styles.stepSubtitle}>কোন পদ্ধতিতে যাচাই করতে চান?</div>

              <div className={styles.verifyOptions}>
                {[
                  { type: 'nid', icon: '🪪', cls: 'vo-blue', title: 'জাতীয় পরিচয়পত্র (NID)', sub: 'উভয় পাশের ছবি আপলোড করুন' },
                  { type: 'birth', icon: '📄', cls: 'vo-green', title: 'জন্ম নিবন্ধন সনদ', sub: 'জন্ম নিবন্ধন সার্টিফিকেটের ছবি' },
                ].map(({ type, icon, cls, title, sub }) => (
                  <label
                    key={type}
                    className={`${styles.verifyOption} ${selectedVerify === type ? styles.selected : ''}`}
                    onClick={() => selectVerify(type)}
                  >
                    <input type="radio" name="verifyType" value={type} readOnly checked={selectedVerify === type} />
                    <div className={`${styles.voIcon} ${styles[cls]}`}>{icon}</div>
                    <div className={styles.voBody}>
                      <div className={styles.voTitle}>{title}</div>
                      <div className={styles.voSub}>{sub}</div>
                    </div>
                    <div className={styles.voCheck} />
                  </label>
                ))}
              </div>

              <div className={`${styles.infoBox} ${styles.warn}`}>
                <span className={styles.infoIcon}>⚠️</span>
                <div>লেনদেন করতে হলে পরিচয় যাচাই <strong>বাধ্যতামূলক</strong>।</div>
              </div>

              <div className={styles.btnRow}>
                <button className={styles.btnGhost} onClick={() => goToStep(2)}>← পিছনে</button>
                <button className={styles.btnPrimary} onClick={goStep3}>পরবর্তী →</button>
              </div>
              <div className={styles.skipLink}>
                <button onClick={skipVerification}>⏭ এখন এড়িয়ে যান</button>
              </div>
            </div>

            {/* ── স্টেপ ৪ ── */}
            <div className={`${styles.stepPanel} ${currentStep === 4 ? styles.active : ''}`} id="step4">
              <div className={styles.stepTitle}>
                {selectedVerify === 'birth' ? '📄 জন্ম নিবন্ধন আপলোড' :
                 selectedVerify === 'google' ? '🔐 Google যাচাই' : '🪪 NID কার্ড আপলোড'}
              </div>
              <div className={styles.stepSubtitle}>
                {selectedVerify === 'birth' ? 'জন্ম নিবন্ধন সনদের নম্বর ও পরিষ্কার ছবি দিন।' :
                 selectedVerify === 'google' ? 'Google অ্যাকাউন্ট যুক্ত করে যাচাই করুন।' :
                 'NID নম্বর ও কার্ডের সামনে-পিছনের পরিষ্কার ছবি দিন।'}
              </div>

              {(selectedVerify === 'nid' || selectedVerify === 'birth') && (
                <div className={styles.field}>
                  <label>
                    {selectedVerify === 'birth' ? 'জন্ম নিবন্ধন নম্বর' : 'জাতীয় পরিচয়পত্র (NID) নম্বর'}
                    <span className={styles.req}>*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength="20"
                    placeholder={selectedVerify === 'birth' ? 'যেমন: 19998765432101234' : 'যেমন: 1234567890'}
                    value={formData.identityNumber}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '');
                      setFormData(p => ({ ...p, identityNumber: value }));
                    }}
                  />
                  {fileErrors.identityNumber && (
                    <div className={`${styles.fieldError} ${styles.show}`}>{fileErrors.identityNumber}</div>
                  )}
                  <small className={styles.uploadSub}>
                    🔒 এই নম্বরটি শুধু অ্যাডমিন যাচাইয়ের জন্য সংরক্ষিত থাকবে — ডুপ্লিকেট অ্যাকাউন্ট প্রতিরোধে ব্যবহৃত হয়।
                  </small>
                </div>
              )}

              {selectedVerify === 'nid' && (
                <div className={styles.uploadRow}>
                  <div className={styles.field}>
                    <label>সামনের পাশ <span className={styles.req}>*</span></label>
                    <div className={styles.uploadArea} id="nidFrontArea" onClick={() => nidFrontRef.current?.click()}>
                      <input
                        type="file"
                        accept="image/*"
                        ref={nidFrontRef}
                        id="nidFront"
                        onChange={e => {
                          const file = e.target.files[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              feedback.alert.error({ title: '⚠️ ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!' });
                              e.target.value = '';
                              return;
                            }
                            compressAndPreview(file, 'nidFrontArea', 'nidFrontPreview', 'nidFrontRemove', 'nidFront');
                          }
                        }}
                      />
                      <div className={styles.uploadDefault}>
                        <div className={styles.uploadIcon}>🪪</div>
                        <div className={styles.uploadLabel}>সামনের ছবি</div>
                        <div className={styles.uploadSub}>JPG, PNG, HEIC (Max 2MB)</div>
                      </div>
                      <img id="nidFrontPreview" className={styles.uploadPreview} alt="" />
                      <button
                        className={styles.uploadRemoveBtn}
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
                    {fileErrors.nidFront && <div className={styles.fieldError}>{fileErrors.nidFront}</div>}
                  </div>

                  <div className={styles.field}>
                    <label>পিছনের পাশ <span className={styles.req}>*</span></label>
                    <div className={styles.uploadArea} id="nidBackArea" onClick={() => nidBackRef.current?.click()}>
                      <input
                        type="file"
                        accept="image/*"
                        ref={nidBackRef}
                        id="nidBack"
                        onChange={e => {
                          const file = e.target.files[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              feedback.alert.error({ title: '⚠️ ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!' });
                              e.target.value = '';
                              return;
                            }
                            compressAndPreview(file, 'nidBackArea', 'nidBackPreview', 'nidBackRemove', 'nidBack');
                          }
                        }}
                      />
                      <div className={styles.uploadDefault}>
                        <div className={styles.uploadIcon}>🔄</div>
                        <div className={styles.uploadLabel}>পিছনের ছবি</div>
                        <div className={styles.uploadSub}>JPG, PNG, HEIC (Max 2MB)</div>
                      </div>
                      <img id="nidBackPreview" className={styles.uploadPreview} alt="" />
                      <button
                        className={styles.uploadRemoveBtn}
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
                    {fileErrors.nidBack && <div className={styles.fieldError}>{fileErrors.nidBack}</div>}
                  </div>
                </div>
              )}

              {selectedVerify === 'birth' && (
                <div className={styles.field}>
                  <label>জন্ম নিবন্ধন সনদ <span className={styles.req}>*</span></label>
                  <div className={styles.uploadArea} id="birthArea" onClick={() => birthRef.current?.click()}>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      ref={birthRef}
                      id="birthCert"
                      onChange={e => {
                        const file = e.target.files[0];
                        if (file) {
                          if (file.type === 'application/pdf' && file.size > 5 * 1024 * 1024) {
                            feedback.alert.error({ title: '⚠️ PDF ফাইলের সাইজ ৫MB এর বেশি হতে পারবে না!' });
                            e.target.value = '';
                            return;
                          }

                          if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) {
                            feedback.alert.error({ title: '⚠️ ইমেজ ফাইলের সাইজ ২MB এর বেশি হতে পারবে না!' });
                            e.target.value = '';
                            return;
                          }

                          compressAndPreview(file, 'birthArea', 'birthPreview', 'birthRemove', 'birth');
                        }
                      }}
                    />
                    <div className={styles.uploadDefault}>
                      <div className={styles.uploadIcon}>📄</div>
                      <div className={styles.uploadLabel}>সনদের ছবি বা PDF</div>
                      <div className={styles.uploadSub}>JPG, PNG (Max 2MB) | PDF (Max 5MB)</div>
                    </div>
                    <img id="birthPreview" className={styles.uploadPreview} alt="" />
                    <button
                      className={styles.uploadRemoveBtn}
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
                  {fileErrors.birth && <div className={styles.fieldError}>{fileErrors.birth}</div>}
                </div>
              )}

              <div className={styles.btnRow}>
                <button className={styles.btnGhost} onClick={() => goToStep(3)}>← পিছনে</button>
                <button className={styles.btnPrimary} onClick={goStep4} disabled={uploadingDocs}>পরবর্তী →</button>
              </div>
              <div className={styles.skipLink}>
                <button onClick={skipToFace}>⏭ এই ধাপ এড়িয়ে যান</button>
              </div>
            </div>

            {/* ── স্টেপ ৫ ── */}
            <div className={`${styles.stepPanel} ${currentStep === 5 ? styles.active : ''}`} id="step5">
              <div className={styles.stepTitle}>📸 মুখমণ্ডল যাচাই</div>
              <div className={styles.stepSubtitle}>
                ক্যামেরা চালু করুন এবং স্বাভাবিকভাবে একবার চোখে পলক ফেলুন — বাকিটা সিস্টেম নিজেই করবে।
              </div>

              {modelsLoading && !modelsLoaded && (
                <div className={`${styles.infoBox} ${styles.info}`}>
                  <span className={styles.infoIcon}>⏳</span>
                  <span>ফেস যাচাই মডেল লোড হচ্ছে, একটু অপেক্ষা করুন...</span>
                </div>
              )}
              {modelError && (
                <div className={`${styles.infoBox} ${styles.warn}`}>
                  <span className={styles.infoIcon}>⚠️</span>
                  <span>{modelError}</span>
                </div>
              )}

              {/* ── অ্যাভাটার গাইড ── */}
              <div
                className={
                  `${styles.livenessAvatarWrap} ` +
                  (calibrating ? styles.lsCalibrating :
                   livenessComplete ? styles.lsDone :
                   livenessState[currentLivIdx]?.key ? styles[`ls-${livenessState[currentLivIdx].key}`] : styles.lsIdle)
                }
              >
                <svg viewBox="0 0 160 160" className={styles.avatarSvg} aria-hidden="true">
                  <circle className={styles.avatarFace} cx="80" cy="80" r="60" />
                  <g className={styles.avatarTurnGroup}>
                    <ellipse className={`${styles.avatarEye} ${styles.avatarEyeLeft}`} cx="58" cy="74" rx="8" ry="11" />
                    <ellipse className={`${styles.avatarEye} ${styles.avatarEyeRight}`} cx="102" cy="74" rx="8" ry="11" />
                    <path className={`${styles.avatarMouth} ${livenessComplete ? styles.avatarMouthHappy : ''}`} d="M55 106 Q80 106 105 106" />
                  </g>
                </svg>
                <div className={styles.avatarCaption}>
                  {calibrating
                    ? `📐 ক্যামেরা মাপা হচ্ছে... ${calibrationProgress}%`
                    : livenessComplete
                      ? '🎉 সব ঠিক আছে!'
                      : livenessMessage}
                </div>
              </div>

              {/* ── সতর্কবার্তা ── */}
              {lowLightWarning && !calibrating && (
                <div className={`${styles.infoBox} ${styles.warn} ${styles.livenessHint}`}>
                  <span className={styles.infoIcon}>💡</span>
                  <span>আলো একটু কম মনে হচ্ছে — যতটা সম্ভব আলোর দিকে মুখ করুন</span>
                </div>
              )}
              {noFaceWarning && !calibrating && (
                <div className={`${styles.infoBox} ${styles.warn} ${styles.livenessHint}`}>
                  <span className={styles.infoIcon}>🙂</span>
                  <span>মুখ শনাক্ত হচ্ছে না — ক্যামেরার আরেকটু কাছে আসুন</span>
                </div>
              )}

              {/* ── ক্যামেরা বক্স ── */}
              <div className={`${styles.cameraBox} ${cameraActive ? styles.cameraActive : ''} ${isLivenessRunning ? styles.scanning : ''}`}>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ display: cameraActive ? 'block' : 'none', width: '100%', borderRadius: '8px' }}
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                {!cameraActive && (
                  <div className={styles.cameraPlaceholder}>
                    <span>📷</span>
                    <div>ক্যামেরা চালু করুন</div>
                  </div>
                )}

                {cameraActive && (
                  <>
                    <div className={styles.faceGuideOval} />
                    <div className={styles.scanOverlay}>
                      <div className={styles.scanLine} />
                    </div>
                  </>
                )}

                {livenessComplete && (
                  <div className={styles.livenessDoneOverlay}>🎉 সব সম্পন্ন!</div>
                )}
              </div>

              {/* ── প্রগ্রেস ── */}
              <div className={styles.livenessProgress}>
                <div className={styles.progressText}>
                  {livenessComplete ? '✅ সম্পন্ন' : `পলক শনাক্তকরণ · ${Math.round(livenessProgress)}%`}
                </div>
                <div className={styles.progressBarSmall}>
                  <div
                    className={styles.progressFillSmall}
                    style={{ width: `${livenessProgress}%`, transition: 'width 0.4s ease' }}
                  />
                </div>
              </div>

              {faceStatusMsg === 'captured' && (
                <div className={`${styles.infoBox} ${styles.success}`}>
                  <span className={styles.infoIcon}>✅</span>
                  <div>মুখমণ্ডলের ছবি সফলভাবে ক্যাপচার হয়েছে!</div>
                </div>
              )}

              {calibrationFailed && (
                <div className={`${styles.infoBox} ${styles.warn}`}>
                  <span className={styles.infoIcon}>⚠️</span>
                  <div>
                    বারবার মুখ শনাক্ত করা যাচ্ছে না। আলো ঠিক করুন বা ক্যামেরার অবস্থান বদলে আবার চেষ্টা করুন।
                    <div className={styles.retryContainer}>
                      <button className={styles.btnGhost} onClick={retryCalibration}>🔄 আবার চেষ্টা করুন</button>
                    </div>
                  </div>
                </div>
              )}

              {manualUploadAvailable && !livenessComplete && !faceVerified && (
                <div className={`${styles.infoBox} ${styles.info}`}>
                  <span className={styles.infoIcon}>📸</span>
                  <div>
                    লাইভনেসে সমস্যা হচ্ছে? এখন যে ছবিটা ক্যামেরায় দেখা যাচ্ছে সেটাই তুলে জমা দিতে পারেন।
                    <div className={styles.retryContainer}>
                      <button
                        className={styles.btnGhost}
                        onClick={handleManualCapture}
                        disabled={manualUploading || !cameraActive}
                      >
                        {manualUploading ? (
                          <><i className="fa-solid fa-spinner fa-spin"></i> আপলোড হচ্ছে...</>
                        ) : (
                          '📸 এই মুহূর্তের ছবি জমা দিন'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.btnRow}>
                {!cameraActive && !faceVerified && (
                  <button className={styles.btnGhost} onClick={startCamera} disabled={modelsLoading && !modelsLoaded}>
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
                  <button className={styles.btnDanger} onClick={stopCamera}>
                    ⏹ বাতিল
                  </button>
                )}
              </div>

              <div className={styles.backButton}>
                <button className={styles.btnGhost} onClick={() => { stopCamera(); goToStep(4); }}>
                  ← পিছনে
                </button>
              </div>

              <div className={`${styles.infoBox} ${styles.info}`}>
                <span className={styles.infoIcon}>ℹ️</span>
                <div>
                  <strong>লাইভনেস চেক কীভাবে কাজ করে?</strong><br />
                  ১. ক্যামেরা চালু করলে প্রথমে আপনার মুখ কয়েক সেকেন্ড মাপা হয়।<br />
                  ২. এরপর শুধু স্বাভাবিকভাবে চোখে একবার পলক ফেলুন — সিস্টেম নিজেই সেটা শনাক্ত করে ছবি তুলে নেবে।<br />
                  ৩. রাতে বা কম আলোতেও কাজ করে — শুধু চেষ্টা করুন মুখটা যতটা সম্ভব আলোর দিকে রাখতে।
                </div>
              </div>

              <div className={styles.skipLink}>
                <button onClick={skipFace}>⏭ এখন এড়িয়ে যান</button>
              </div>
            </div>

            {/* ── স্টেপ ৬ ── */}
            <div className={`${styles.stepPanel} ${currentStep === 6 ? styles.active : ''}`} id="step6">
              <div className={styles.resultScreen}>
                {anyVerify ? (
                  <>
                    <div className={styles.resultTitle}>যাচাই প্রক্রিয়াধীন</div>
                    <div className={styles.resultSub}>অ্যাডমিন যাচাই করার পর অ্যাকাউন্ট সম্পূর্ণ সক্রিয় হবে।</div>
                    <div className={styles.timerBadge}>⏱ সাধারণত ১–২ ঘণ্টা লাগতে পারে।</div>
                  </>
                ) : (
                  <>
                    <div className={`${styles.resultIcon} ${styles.successIcon}`}>🎉</div>
                    <div className={styles.resultTitle}>নিবন্ধন সম্পন্ন!</div>
                    <div className={styles.resultSub}>আপনার অ্যাকাউন্ট তৈরি হয়েছে।</div>
                  </>
                )}

                <div className={styles.resultSteps}>
                  <div className={styles.resultStep}><div className={`${styles.resultStepDot} ${styles.done}`} /> ✅ নিবন্ধন সম্পন্ন</div>
                  <div className={styles.resultStep}><div className={`${styles.resultStepDot} ${styles.done}`} /> ✅ ফোন নম্বর যাচাই</div>
                  <div className={styles.resultStep}>
                    <div className={styles.resultStepDot} style={{ background: docUploaded ? 'var(--warning)' : 'var(--border)' }} />
                    {docUploaded ? '📄 ডকুমেন্ট পর্যালোচনাধীন' : '⏭ ডকুমেন্ট এড়ানো হয়েছে'}
                  </div>
                  <div className={styles.resultStep}>
                    <div className={styles.resultStepDot} style={{ background: faceVerified ? 'var(--warning)' : 'var(--border)' }} />
                    {faceVerified ? '📸 ফেস যাচাই সম্পন্ন ✅' : '⏭ ফেস যাচাই এড়ানো হয়েছে'}
                  </div>
                </div>

                <div className={`${styles.infoBox} ${styles.warn}`}>
                  <span className={styles.infoIcon}>{anyVerify ? '📧' : '⚠️'}</span>
                  <div>{anyVerify ? 'আপনার ইমেইলে আপডেট পাঠানো হবে।' : 'লেনদেন করতে পরিচয় যাচাই করতে হবে।'}</div>
                </div>
              </div>

              {!phoneVerified && (
                <div className={`${styles.infoBox} ${styles.warn}`}>
                  <span className={styles.infoIcon}>⚠️</span>
                  <div>নিবন্ধন সম্পূর্ণ করতে ফোন নম্বর OTP দিয়ে যাচাই করুন।</div>
                </div>
              )}

              <div className={styles.btnRow}>
                <button
                  className={styles.btnSuccess}
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
        <div className={styles.cardFooter}>
          ইতিমধ্যে অ্যাকাউন্ট আছে?{' '}
          <a
            href="#"
            className={styles.link}
            onClick={goToLogin}
          >
            লগইন করুন
          </a>
        </div>
      </div>

      <div className={styles.toast} id="toast" />
    </div>
  );
};

export default Register;