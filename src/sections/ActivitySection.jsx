import React, { useState } from 'react';

function ActivitySection({ onBack }) {
  const [mode, setMode] = useState('buyer');

  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-briefcase" style={{ marginRight: '10px', color: '#7c3aed' }}></i>
          Activity
        </div>
      </div>

      <div className="section-content">
        <div className="profile-mode-switcher" style={{ marginBottom: '16px' }}>
          <button 
            className={`profile-mode-btn ${mode === 'buyer' ? 'active' : ''}`}
            onClick={() => setMode('buyer')}
          >
            <i className="fa-solid fa-briefcase"></i> Buyer Mode
          </button>
          <button 
            className={`profile-mode-btn ${mode === 'seller' ? 'active' : ''}`}
            onClick={() => setMode('seller')}
          >
            <i className="fa-solid fa-laptop-code"></i> Seller Mode
          </button>
        </div>

        <div className="detail-item">
          <i className="fas fa-file-alt"></i>
          <span className="detail-label">Posted Jobs</span>
          <span className="detail-value">12</span>
        </div>

        <div className="detail-item">
          <i className="fas fa-tools"></i>
          <span className="detail-label">My Services</span>
          <span className="detail-value">8</span>
        </div>

        <div className="detail-item">
          <i className="fas fa-bookmark"></i>
          <span className="detail-label">Saved Posts</span>
          <span className="detail-value">34</span>
        </div>

        <div className="detail-item">
          <i className="fas fa-paper-plane"></i>
          <span className="detail-label">Applications</span>
          <span className="detail-value">6</span>
        </div>
      </div>
    </div>
  );
}

export default ActivitySection;