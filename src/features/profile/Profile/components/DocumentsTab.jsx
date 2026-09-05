// src/components/profile/DocumentsTab.jsx
//
// 🆕 FIX APPLIED (this revision): added an identity-number field
// (NID / জন্ম নিবন্ধন নম্বর), matching Register's Step 4. Previously
// this tab only collected document PHOTOS with no number at all — so
// a user who skipped verification during registration and uploaded
// documents here for the first time would completely bypass the
// duplicate-identity detection system that Register enforces. See
// Profile.jsx's uploadDocuments() for how this number is now used.

import React from 'react';
import styles from './DocumentsTab.module.css';

const DocumentsTab = ({
  docStatus,
  hasRejectedDoc,
  userData,
  verificationStatus,
  isVerified,
  selectedDocs,
  docPreviews,
  uploadingDocs,
  uploadProgress,
  nidFrontRef,
  nidBackRef,
  birthCertRef,
  identityNumber,
  identityNumberError,
  onIdentityNumberChange,
  onDocFileChange,
  onRemoveDocFile,
  onUploadDocuments,
  onUploadAgain,
  onPdfPreview,
}) => {
  return (
    <div className={`${styles.tabPanel} ${styles.documentsPanel}`}>
      <h3><i className="fa-solid fa-file"></i> Document Verification</h3>
      <p className={styles.tabSubtitle}>Upload documents to verify your identity</p>

      <div className={styles.verificationStatusBox}>
        <div className={`${styles.statusBadgeLarge} ${styles[verificationStatus]}`}>
          {verificationStatus === 'verified' && '✅ Verified'}
          {verificationStatus === 'pending' && '⏳ Verification Pending'}
          {verificationStatus === 'rejected' && '❌ Rejected'}
        </div>
        {isVerified && (
          <div className={styles.verifiedBadge}>
            <i className="fa-solid fa-check-circle"></i> Your account is verified
          </div>
        )}
      </div>

      {userData?.documents?.nidFront?.status === 'rejected' && (
        <div className={styles.verifyError}>
          <strong>❌ NID Front Rejected</strong>
          <p>{userData.documents.nidFront.rejectReason || 'No reason provided'}</p>
          <button className={styles.uploadAgainBtn} onClick={() => onUploadAgain('nidFront')}>
            📤 Upload Again
          </button>
        </div>
      )}

      {userData?.documents?.nidBack?.status === 'rejected' && (
        <div className={styles.verifyError}>
          <strong>❌ NID Back Rejected</strong>
          <p>{userData.documents.nidBack.rejectReason || 'No reason provided'}</p>
          <button className={styles.uploadAgainBtn} onClick={() => onUploadAgain('nidBack')}>
            📤 Upload Again
          </button>
        </div>
      )}

      {userData?.documents?.birthCert?.status === 'rejected' && (
        <div className={styles.verifyError}>
          <strong>❌ Birth Certificate Rejected</strong>
          <p>{userData.documents.birthCert.rejectReason || 'No reason provided'}</p>
          <button className={styles.uploadAgainBtn} onClick={() => onUploadAgain('birthCert')}>
            📤 Upload Again
          </button>
        </div>
      )}

      {docStatus.documentsUploaded && !hasRejectedDoc ? (
        <div className={`${styles.infoBox} ${styles.success}`}>
          <span className={styles.infoIcon}>✅</span>
          <div>
            <strong>Document upload complete!</strong>
            <p>Your document is being verified by admin.</p>
          </div>
        </div>
      ) : (
        <>
          {/* 🆕 NID / জন্ম নিবন্ধন নম্বর — Register-এর স্টেপ ৪-এর সাথে মিল রেখে,
              ডুপ্লিকেট-অ্যাকাউন্ট প্রতিরোধে ব্যবহৃত হয় */}
          <div className={styles.formGroup}>
            <label>NID অথবা জন্ম নিবন্ধন নম্বর <span className={styles.required}>*</span></label>
            <input
              type="text"
              inputMode="numeric"
              maxLength="20"
              placeholder="যেমন: 1234567890"
              value={identityNumber}
              onChange={(e) => onIdentityNumberChange(e.target.value.replace(/\D/g, ''))}
              className={styles.editInput}
            />
            {identityNumberError && (
              <div className={`${styles.fieldError} ${styles.show}`} style={{ display: 'block' }}>{identityNumberError}</div>
            )}
            <small className={styles.fieldHint}>
              🔒 এই নম্বরটি শুধু অ্যাডমিন যাচাইয়ের জন্য সংরক্ষিত থাকবে — ডুপ্লিকেট অ্যাকাউন্ট প্রতিরোধে ব্যবহৃত হয়।
            </small>
          </div>

          <div className={styles.uploadRow}>
            <div className={styles.formGroup}>
              <label>NID Card (Front) <span className={styles.required}>*</span></label>
              <div
                className={`${styles.uploadArea} ${docPreviews.nidFront ? styles.hasFile : ''}`}
                id="nidFrontArea"
                onClick={() => {
                  if (!docPreviews.nidFront) {
                    nidFrontRef.current?.click();
                  }
                }}
              >
                <input
                  type="file"
                  id="nidFront"
                  ref={nidFrontRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    onDocFileChange(e, 'nidFront');
                    e.target.value = '';
                  }}
                />
                {docPreviews.nidFront ? (
                  <div className={styles.uploadPreviewContainer}>
                    <img src={docPreviews.nidFront} alt="NID Front Preview" className={styles.uploadPreview} />
                    <button
                      type="button"
                      className={styles.uploadRemoveBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveDocFile('nidFront');
                      }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <div className={styles.uploadDefault}>
                    <div className={styles.uploadIcon}>🪪</div>
                    <div className={styles.uploadLabel}>Front Image</div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>NID Card (Back) <span className={styles.required}>*</span></label>
              <div
                className={`${styles.uploadArea} ${docPreviews.nidBack ? styles.hasFile : ''}`}
                id="nidBackArea"
                onClick={() => {
                  if (!docPreviews.nidBack) {
                    nidBackRef.current?.click();
                  }
                }}
              >
                <input
                  type="file"
                  id="nidBack"
                  ref={nidBackRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    onDocFileChange(e, 'nidBack');
                    e.target.value = '';
                  }}
                />
                {docPreviews.nidBack ? (
                  <div className={styles.uploadPreviewContainer}>
                    <img src={docPreviews.nidBack} alt="NID Back Preview" className={styles.uploadPreview} />
                    <button
                      type="button"
                      className={styles.uploadRemoveBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveDocFile('nidBack');
                      }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <div className={styles.uploadDefault}>
                    <div className={styles.uploadIcon}>🔄</div>
                    <div className={styles.uploadLabel}>Back Image</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Birth Certificate</label>
            <div
              className={`${styles.uploadArea} ${docPreviews.birthCert ? styles.hasFile : ''}`}
              id="birthArea"
              onClick={() => {
                if (!docPreviews.birthCert) {
                  birthCertRef.current?.click();
                }
              }}
            >
              <input
                type="file"
                id="birthCert"
                ref={birthCertRef}
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  onDocFileChange(e, 'birthCert');
                  e.target.value = '';
                }}
              />
              {docPreviews.birthCert ? (
                <div className={styles.uploadPreviewContainer}>
                  {selectedDocs.birthCert?.type === 'application/pdf' ? (
                    <div className={styles.pdfPreview} onClick={() => onPdfPreview(selectedDocs.birthCert)}>
                      <i className="fa-solid fa-file-pdf"></i>
                      <span>{selectedDocs.birthCert.name}</span>
                      <button className={styles.pdfViewBtn}>👁️ View</button>
                    </div>
                  ) : (
                    <img src={docPreviews.birthCert} alt="Birth Cert Preview" className={styles.uploadPreview} />
                  )}
                  <button
                    type="button"
                    className={styles.uploadRemoveBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveDocFile('birthCert');
                    }}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              ) : (
                <div className={styles.uploadDefault}>
                  <div className={styles.uploadIcon}>📄</div>
                  <div className={styles.uploadLabel}>Certificate Image or PDF</div>
                </div>
              )}
            </div>
          </div>

          {uploadingDocs && (
            <div className={styles.uploadProgress}>
              <div className={styles.progressText}>Uploading... {Math.round(uploadProgress)}%</div>
              <div className={styles.progressBarSmall}>
                <div className={styles.progressFillSmall} style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          )}

          <button className={styles.saveBtn} onClick={onUploadDocuments} disabled={uploadingDocs}>
            {uploadingDocs ? '⏳ Uploading...' : '📤 Upload Documents'}
          </button>
        </>
      )}
    </div>
  );
};

export default DocumentsTab;