// src/pages/Admin/components/RejectModal.jsx

import React from 'react';
import './RejectModal.css';
// ============================================================
// 🎯 REJECT MODAL COMPONENT
// ============================================================

const RejectModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  reason, 
  onReasonChange,
  isLoading = false 
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content reject-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>❌ পোস্ট রিজেক্ট</h3>
          <button className="close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div className="modal-body">
          <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>
            রিজেক্ট করার কারণ লিখুন (ঐচ্ছিক):
          </p>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="যেমন: Spam content, Inappropriate language, etc."
            rows="4"
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '14px',
              resize: 'vertical'
            }}
          />
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
            বাতিল করুন
          </button>
          <button className="btn btn-danger" onClick={onSubmit} disabled={isLoading}>
            {isLoading ? '⏳ অপেক্ষা...' : '❌ রিজেক্ট করুন'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectModal;