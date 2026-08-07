import React from 'react';
import toast from 'react-hot-toast';

function SupportSection({ onBack }) {
  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-life-ring" style={{ marginRight: '10px', color: '#92400e' }}></i>
          Support
        </div>
      </div>

      <div className="section-content">
        <div className="detail-item" onClick={() => toast.success('📖 Opening Help Center')} style={{ cursor: 'pointer' }}>
          <i className="fas fa-question-circle"></i>
          <span className="detail-label">Help Center</span>
          <span className="detail-value">FAQs & Guides</span>
        </div>

        <div className="detail-item" onClick={() => toast.success('💬 Contacting support...')} style={{ cursor: 'pointer' }}>
          <i className="fas fa-headset"></i>
          <span className="detail-label">Contact Support</span>
          <span className="detail-value">24/7 available</span>
        </div>

        <div className="detail-item" onClick={() => toast.success('❓ Showing FAQs')} style={{ cursor: 'pointer' }}>
          <i className="fas fa-file-alt"></i>
          <span className="detail-label">FAQ</span>
          <span className="detail-value">Common questions</span>
        </div>

        <div className="detail-item" onClick={() => toast.success('🚨 Report user form opened')} style={{ cursor: 'pointer' }}>
          <i className="fas fa-flag"></i>
          <span className="detail-label">Report User</span>
          <span className="detail-value">Report abuse</span>
        </div>
      </div>
    </div>
  );
}

export default SupportSection;