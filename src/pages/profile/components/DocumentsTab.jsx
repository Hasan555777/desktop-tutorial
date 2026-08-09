// src/components/profile/DocumentsTab.jsx
import React from 'react';

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
  onDocFileChange,
  onRemoveDocFile,
  onUploadDocuments,
  onUploadAgain,
  onPdfPreview,
}) => {
  return (
    <div className="tab-panel documents-panel">
      <h3><i className="fa-solid fa-file"></i> Document Verification</h3>
      <p className="tab-subtitle">Upload documents to verify your identity</p>

      <div className="verification-status-box">
        <div className={`status-badge-large ${verificationStatus}`}>
          {verificationStatus === 'verified' && '✅ Verified'}
          {verificationStatus === 'pending' && '⏳ Verification Pending'}
          {verificationStatus === 'rejected' && '❌ Rejected'}
        </div>
        {isVerified && (
          <div className="verified-badge">
            <i className="fa-solid fa-check-circle"></i> Your account is verified
          </div>
        )}
      </div>

      {userData?.documents?.nidFront?.status === 'rejected' && (
        <div className="verify-error">
          <strong>❌ NID Front Rejected</strong>
          <p>{userData.documents.nidFront.rejectReason || 'No reason provided'}</p>
          <button className="upload-again-btn" onClick={() => onUploadAgain('nidFront')}>
            📤 Upload Again
          </button>
        </div>
      )}

      {userData?.documents?.nidBack?.status === 'rejected' && (
        <div className="verify-error">
          <strong>❌ NID Back Rejected</strong>
          <p>{userData.documents.nidBack.rejectReason || 'No reason provided'}</p>
          <button className="upload-again-btn" onClick={() => onUploadAgain('nidBack')}>
            📤 Upload Again
          </button>
        </div>
      )}

      {userData?.documents?.birthCert?.status === 'rejected' && (
        <div className="verify-error">
          <strong>❌ Birth Certificate Rejected</strong>
          <p>{userData.documents.birthCert.rejectReason || 'No reason provided'}</p>
          <button className="upload-again-btn" onClick={() => onUploadAgain('birthCert')}>
            📤 Upload Again
          </button>
        </div>
      )}

      {docStatus.documentsUploaded && !hasRejectedDoc ? (
        <div className="info-box success">
          <span className="info-icon">✅</span>
          <div>
            <strong>Document upload complete!</strong>
            <p>Your document is being verified by admin.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="upload-row">
            <div className="form-group">
              <label>NID Card (Front) <span className="required">*</span></label>
              <div
                className={`upload-area ${docPreviews.nidFront ? 'has-file' : ''}`}
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
                  <div className="upload-preview-container">
                    <img src={docPreviews.nidFront} alt="NID Front Preview" className="upload-preview" />
                    <button
                      type="button"
                      className="upload-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveDocFile('nidFront');
                      }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <div className="upload-default">
                    <div className="upload-icon">🪪</div>
                    <div className="upload-label">Front Image</div>
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>NID Card (Back) <span className="required">*</span></label>
              <div
                className={`upload-area ${docPreviews.nidBack ? 'has-file' : ''}`}
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
                  <div className="upload-preview-container">
                    <img src={docPreviews.nidBack} alt="NID Back Preview" className="upload-preview" />
                    <button
                      type="button"
                      className="upload-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveDocFile('nidBack');
                      }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <div className="upload-default">
                    <div className="upload-icon">🔄</div>
                    <div className="upload-label">Back Image</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Birth Certificate</label>
            <div
              className={`upload-area ${docPreviews.birthCert ? 'has-file' : ''}`}
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
                <div className="upload-preview-container">
                  {selectedDocs.birthCert?.type === 'application/pdf' ? (
                    <div className="pdf-preview" onClick={() => onPdfPreview(selectedDocs.birthCert)}>
                      <i className="fa-solid fa-file-pdf"></i>
                      <span>{selectedDocs.birthCert.name}</span>
                      <button className="pdf-view-btn">👁️ View</button>
                    </div>
                  ) : (
                    <img src={docPreviews.birthCert} alt="Birth Cert Preview" className="upload-preview" />
                  )}
                  <button
                    type="button"
                    className="upload-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveDocFile('birthCert');
                    }}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              ) : (
                <div className="upload-default">
                  <div className="upload-icon">📄</div>
                  <div className="upload-label">Certificate Image or PDF</div>
                </div>
              )}
            </div>
          </div>

          {uploadingDocs && (
            <div className="upload-progress">
              <div className="progress-text">Uploading... {Math.round(uploadProgress)}%</div>
              <div className="progress-bar-small">
                <div className="progress-fill-small" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          )}

          <button className="save-btn" onClick={onUploadDocuments} disabled={uploadingDocs}>
            {uploadingDocs ? '⏳ Uploading...' : '📤 Upload Documents'}
          </button>
        </>
      )}
    </div>
  );
};

export default DocumentsTab;