// src/pages/Admin/components/ConfirmModal.jsx

import React from 'react';
import styles from './ConfirmModal.module.css';

// ============================================================
// 🎯 CONFIRM MODAL COMPONENT
// ============================================================

const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = '❌ নিশ্চিত করুন',
  message = 'আপনি কি এই কাজটি করতে চান?',
  confirmText = '✅ নিশ্চিত',
  cancelText = 'বাতিল',
  isLoading = false
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalContent} ${styles.confirmModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className={styles.modalBody}>
          <p>{message}</p>
        </div>
        <div className={styles.modalFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={isLoading}>
            {cancelText}
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? '⏳ অপেক্ষা...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;