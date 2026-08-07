import React from 'react';
import toast from 'react-hot-toast';

function LegalSection({ onBack }) {
  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-balance-scale" style={{ marginRight: '10px', color: '#3730a3' }}></i>
          Legal
        </div>
      </div>

      <div className="section-content">
        <div className="detail-item" onClick={() => toast.success('📱 App version 2.0')} style={{ cursor: 'pointer' }}>
          <i className="fas fa-info-circle"></i>
          <span className="detail-label">About</span>
          <span className="detail-value">App version 2.0</span>
        </div>

        <div className="detail-item" onClick={() => toast.success('📄 Terms & Conditions')} style={{ cursor: 'pointer' }}>
          <i className="fas fa-file-contract"></i>
          <span className="detail-label">Terms & Conditions</span>
          <span className="detail-value">Updated 2026</span>
        </div>

        <div className="detail-item" onClick={() => toast.success('🔐 Privacy Policy')} style={{ cursor: 'pointer' }}>
          <i className="fas fa-user-secret"></i>
          <span className="detail-label">Privacy Policy</span>
          <span className="detail-value">GDPR compliant</span>
        </div>

        <div className="detail-item" onClick={() => toast.success('📜 MIT License')} style={{ cursor: 'pointer' }}>
          <i className="fas fa-certificate"></i>
          <span className="detail-label">Licenses</span>
          <span className="detail-value">MIT</span>
        </div>
      </div>
    </div>
  );
}

export default LegalSection;