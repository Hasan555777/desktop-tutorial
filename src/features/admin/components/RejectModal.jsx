// src/pages/Admin/components/RejectModal.jsx

import React from 'react';
import styles from './RejectModal.module.css';

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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalContent} ${styles.rejectModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>❌ পোস্ট রিজেক্ট</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div className={styles.modalBody}>
          <p className={styles.rejectHint}>
            রিজেক্ট করার কারণ লিখুন (ঐচ্ছিক):
          </p>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="যেমন: Spam content, Inappropriate language, etc."
            rows="4"
            className={styles.rejectTextarea}
          />
        </div>
        
        <div className={styles.modalFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={isLoading}>
            বাতিল করুন
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={onSubmit} disabled={isLoading}>
            {isLoading ? '⏳ অপেক্ষা...' : '❌ রিজেক্ট করুন'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectModal;