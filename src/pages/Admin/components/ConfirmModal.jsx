// src/pages/Admin/components/ConfirmModal.jsx

import React from 'react';
import './ConfirmModal.css';
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? '⏳ অপেক্ষা...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;