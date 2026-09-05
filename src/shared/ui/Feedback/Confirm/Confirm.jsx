// UI/Feedback/Confirm.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import Modal from '../Modal/Modal';
import styles from './Confirm.module.css';

// ============================================================
// Constants
// ============================================================
const VARIANTS = {
  confirm: { icon: 'fa-solid fa-question-circle', color: 'primary' },
  delete: { icon: 'fa-solid fa-trash', color: 'danger' },
  danger: { icon: 'fa-solid fa-exclamation-triangle', color: 'danger' },
  warning: { icon: 'fa-solid fa-triangle-exclamation', color: 'warning' },
  logout: { icon: 'fa-solid fa-sign-out-alt', color: 'warning' },
  archive: { icon: 'fa-solid fa-archive', color: 'primary' },
  publish: { icon: 'fa-solid fa-upload', color: 'success' },
  discard: { icon: 'fa-solid fa-ban', color: 'danger' },
  save: { icon: 'fa-solid fa-save', color: 'success' },
  remove: { icon: 'fa-solid fa-xmark', color: 'danger' },
  info: { icon: 'fa-solid fa-circle-info', color: 'info' },
};

const Confirm = React.memo(({
  // Core props
  title = 'Confirm',
  message = 'Are you sure?',
  variant = 'confirm',
  
  // Button text
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  
  // Loading state
  loading = false,
  
  // Behavior props
  closeOnOverlay = false,
  closeOnEsc = true,
  closeOnConfirm = true,
  
  // Icon
  icon = null,
  
  // Button order (windows: Cancel/Confirm, mac: Confirm/Cancel)
  buttonOrder = 'windows',
  
  // Accessibility
  labelledBy = 'confirm-title',
  describedBy = 'confirm-desc',
  
  // Additional classes
  className = '',
  
  // Callbacks
  resolve,
  onClose,
  onConfirm = null,
  onCancel = null,
  
  // Children (custom footer)
  children = null,
}) => {
  // ============================================================
  // State & Refs
  // ============================================================
  const [isLoading, setIsLoading] = useState(false);
  const confirmButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const isControlled = loading !== undefined;
  const isLoadingState = isControlled ? loading : isLoading;

  // ============================================================
  // Variant Config
  // ============================================================
  const variantConfig = VARIANTS[variant] || VARIANTS.confirm;
  const iconClass = icon || variantConfig.icon;
  const colorVariant = variantConfig.color;

  // ============================================================
  // Handlers
  // ============================================================
  const handleConfirm = useCallback(async () => {
    if (isLoadingState) return;
    
    try {
      if (!isControlled) {
        setIsLoading(true);
      }
      
      if (onConfirm) {
        await onConfirm();
      }
      
      await resolve(true);
      
      if (closeOnConfirm) {
        onClose();
      }
    } catch (error) {
      console.error('Confirm error:', error);
    } finally {
      if (!isControlled) {
        setIsLoading(false);
      }
    }
  }, [isLoadingState, isControlled, onConfirm, resolve, closeOnConfirm, onClose]);

  const handleCancel = useCallback(async () => {
    if (isLoadingState) return;
    
    try {
      if (onCancel) {
        await onCancel();
      }
      
      resolve(false);
      onClose();
    } catch (error) {
      console.error('Cancel error:', error);
    }
  }, [isLoadingState, onCancel, resolve, onClose]);

  // ============================================================
  // Keyboard Support
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !isLoadingState) {
        e.preventDefault();
        if (document.activeElement === cancelButtonRef.current) {
          handleCancel();
        } else {
          handleConfirm();
        }
      }
      
      if (e.key === 'Escape' && closeOnEsc && !isLoadingState) {
        e.preventDefault();
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleConfirm, handleCancel, isLoadingState, closeOnEsc]);

  // ============================================================
  // Auto Focus
  // ============================================================
  useEffect(() => {
    const isDanger = ['delete', 'danger'].includes(variant);
    
    if (isDanger) {
      cancelButtonRef.current?.focus();
    } else {
      confirmButtonRef.current?.focus();
    }
  }, [variant]);

  // ============================================================
  // Button Order
  // ============================================================
  const isMacOrder = buttonOrder === 'mac';
  
  const confirmButton = (
    <button
      ref={confirmButtonRef}
      className={`${styles.confirmBtn} ${styles[colorVariant]}`}
      onClick={handleConfirm}
      disabled={isLoadingState}
      aria-label={confirmText}
    >
      {isLoadingState ? (
        <>
          <i className="fa-solid fa-spinner fa-spin"></i>
          {confirmText}...
        </>
      ) : (
        confirmText
      )}
    </button>
  );

  const cancelButton = (
    <button
      ref={cancelButtonRef}
      className={`${styles.confirmBtn} ${styles.secondary}`}
      onClick={handleCancel}
      disabled={isLoadingState}
      aria-label={cancelText}
    >
      {cancelText}
    </button>
  );

  // ============================================================
  // Render
  // ============================================================
  return (
    <Modal
      onClose={handleCancel}
      closeOnOverlay={closeOnOverlay}
      closeOnEsc={closeOnEsc}
      className={`${styles.confirmModal} ${className}`}
      labelledBy={labelledBy}
      describedBy={describedBy}
      size="sm"
    >
      <div className={styles.confirmContainer}>
        {/* Icon */}
        <div className={`${styles.confirmIcon} ${styles[colorVariant]}`}>
          <div className={styles.confirmIconBg}>
            <i className={iconClass}></i>
          </div>
        </div>

        {/* Title */}
        <h3 id={labelledBy} className={styles.confirmTitle}>
          {title}
        </h3>

        {/* Message */}
        {message && (
          <p id={describedBy} className={styles.confirmMessage}>
            {message}
          </p>
        )}

        {/* Custom Children / Footer */}
        {children && (
          <div className={styles.confirmChildren}>
            {children}
          </div>
        )}

        {/* Actions */}
        <div className={`${styles.confirmActions} ${isMacOrder ? styles.macOrder : styles.windowsOrder}`}>
          {isMacOrder ? (
            <>
              {confirmButton}
              {cancelButton}
            </>
          ) : (
            <>
              {cancelButton}
              {confirmButton}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
});

// ============================================================
// PropTypes
// ============================================================
Confirm.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  variant: PropTypes.oneOf([
    'confirm', 'delete', 'danger', 'warning', 
    'logout', 'archive', 'publish', 'discard', 
    'save', 'remove', 'info'
  ]),
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  loading: PropTypes.bool,
  closeOnOverlay: PropTypes.bool,
  closeOnEsc: PropTypes.bool,
  closeOnConfirm: PropTypes.bool,
  icon: PropTypes.string,
  buttonOrder: PropTypes.oneOf(['windows', 'mac']),
  labelledBy: PropTypes.string,
  describedBy: PropTypes.string,
  className: PropTypes.string,
  resolve: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func,
  onCancel: PropTypes.func,
  children: PropTypes.node,
};

Confirm.defaultProps = {
  title: 'Confirm',
  message: 'Are you sure?',
  variant: 'confirm',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  loading: undefined,
  closeOnOverlay: false,
  closeOnEsc: true,
  closeOnConfirm: true,
  icon: null,
  buttonOrder: 'windows',
  labelledBy: 'confirm-title',
  describedBy: 'confirm-desc',
  className: '',
  onConfirm: null,
  onCancel: null,
  children: null,
};

Confirm.displayName = 'Confirm';

export default Confirm;