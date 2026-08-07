// UI/Feedback/Confirm.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import Modal from '../Modal/Modal';
import './Confirm.css';

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

const ICON_MAP = {
  'fa-solid fa-question-circle': 'fa-solid fa-circle-question',
  'fa-solid fa-exclamation-triangle': 'fa-solid fa-triangle-exclamation',
};

// ============================================================
// Main Component
// ============================================================
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
      
      // Call onConfirm callback if provided
      if (onConfirm) {
        await onConfirm();
      }
      
      // Resolve with true
      await resolve(true);
      
      // Close if configured
      if (closeOnConfirm) {
        onClose();
      }
    } catch (error) {
      // Error handling - don't close on error
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
        // Enter on confirm (unless focused on cancel button)
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
  // Auto Focus (Cancel button for delete/danger)
  // ============================================================
  useEffect(() => {
    const isDanger = ['delete', 'danger'].includes(variant);
    
    if (isDanger) {
      // Focus cancel button for dangerous actions
      cancelButtonRef.current?.focus();
    } else {
      // Focus confirm button for safe actions
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
      className={`confirm-btn ${colorVariant}`}
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
      className="confirm-btn secondary"
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
      className={`confirm-modal ${className}`}
      labelledBy={labelledBy}
      describedBy={describedBy}
      size="sm"
    >
      <div className="confirm-container">
        {/* Icon */}
        <div className={`confirm-icon ${colorVariant}`}>
          <div className="confirm-icon-bg">
            <i className={iconClass}></i>
          </div>
        </div>

        {/* Title */}
        <h3 id={labelledBy} className="confirm-title">
          {title}
        </h3>

        {/* Message */}
        {message && (
          <p id={describedBy} className="confirm-message">
            {message}
          </p>
        )}

        {/* Custom Children / Footer */}
        {children && (
          <div className="confirm-children">
            {children}
          </div>
        )}

        {/* Actions */}
        <div className={`confirm-actions ${isMacOrder ? 'mac-order' : 'windows-order'}`}>
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