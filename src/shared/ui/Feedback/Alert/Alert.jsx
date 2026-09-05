// UI/Feedback/Alert.jsx
import React, { useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import Modal from '../Modal/Modal';
import styles from './Alert.module.css';


// ============================================================
// Constants (Component এর বাইরে)
// ============================================================
const ALERT_CONFIGS = {
  success: {
    icon: 'fa-solid fa-circle-check',
    variantClass: 'success',
    defaultTitle: 'Success',
    defaultMessage: 'Operation completed successfully.',
    defaultOkText: 'OK',
  },
  error: {
    icon: 'fa-solid fa-circle-xmark',
    variantClass: 'error',
    defaultTitle: 'Error',
    defaultMessage: 'Something went wrong.',
    defaultOkText: 'OK',
  },
  warning: {
    icon: 'fa-solid fa-triangle-exclamation',
    variantClass: 'warning',
    defaultTitle: 'Warning',
    defaultMessage: 'Please be careful.',
    defaultOkText: 'OK',
  },
  info: {
    icon: 'fa-solid fa-circle-info',
    variantClass: 'info',
    defaultTitle: 'Information',
    defaultMessage: 'Here is some information for you.',
    defaultOkText: 'OK',
  },
};

const DEFAULT_AUTO_CLOSE_DELAY = 3000;

// ============================================================
// Main Component
// ============================================================
const Alert = React.memo(({
  // Core props
  variant = 'info',
  title = '',
  message = '',
  statusLabel = '',
  
  // Button
  okText = 'OK',
  
  // Behavior
  autoClose = false,
  autoCloseDelay = DEFAULT_AUTO_CLOSE_DELAY,
  closeOnOverlay = true,
  closeOnEsc = true,
  
  // Visual
  icon = null,
  className = '',
  
  // Accessibility
  labelledBy = 'alert-title',
  describedBy = 'alert-desc',
  
  // Callbacks
  resolve,
  onClose,
  onConfirm = null,
}) => {
  // ============================================================
  // Refs
  // ============================================================
  const timerRef = useRef(null);
  const okButtonRef = useRef(null);

  // ============================================================
  // Config
  // ============================================================
  const config = ALERT_CONFIGS[variant] || ALERT_CONFIGS.info;
  const finalTitle = title || config.defaultTitle;
  const finalMessage = message || config.defaultMessage;
  const finalOkText = okText || config.defaultOkText;
  const iconClass = icon || config.icon;
  const variantClass = config.variantClass;

  // ============================================================
  // Handlers
  // ============================================================
  const handleConfirm = useCallback(() => {
    // Clear auto-close timer if any
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // Call onConfirm if provided
    if (onConfirm) {
      onConfirm();
    }
    
    // Resolve with true
    resolve?.(true);
    onClose?.();
  }, [onConfirm, resolve, onClose]);

  // ============================================================
  // Auto Close
  // ============================================================
  useEffect(() => {
    if (autoClose && autoCloseDelay > 0) {
      timerRef.current = setTimeout(() => {
        handleConfirm();
      }, autoCloseDelay);
    }
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoClose, autoCloseDelay, handleConfirm]);

  // ============================================================
  // Auto Focus
  // ============================================================
  useEffect(() => {
    if (okButtonRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        okButtonRef.current?.focus();
      }, 100);
    }
  }, []);

  // ============================================================
  // Keyboard Support (Enter key)
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !autoClose) {
        e.preventDefault();
        handleConfirm();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleConfirm, autoClose]);

  // ============================================================
  // Render
  // ============================================================
 return (
    <Modal
      onClose={handleConfirm}
      closeOnOverlay={closeOnOverlay}
      closeOnEsc={closeOnEsc}
      className={`${styles.alertModal} ${className}`}
      labelledBy={labelledBy}
      describedBy={describedBy}
      size="sm"
    >
      <div className={`${styles.alertContainer} ${styles[variantClass]}`}>
        {/* Icon */}
        <div className={styles.alertIconWrapper}>
          <div className={styles.cubeBackground}>
            <i className="fa-solid fa-cube"></i>
          </div>
          <div className={`${styles.alertStatusIcon} ${styles[variantClass]}`}>
            <i className={iconClass}></i>
          </div>
        </div>

        {/* Status Label */}
        {statusLabel && (
          <div className={`${styles.alertStatusLabel} ${styles[variantClass]}`}>
            {statusLabel}
          </div>
        )}

        {/* Title */}
        <h3 id={labelledBy} className={styles.alertTitle}>
          {finalTitle}
        </h3>

        {/* Message */}
        {finalMessage && (
          <p id={describedBy} className={styles.alertMessage}>
            {finalMessage}
          </p>
        )}

        {/* OK Button */}
        <button
          ref={okButtonRef}
          className={`${styles.alertBtn} ${styles[variantClass]}`}
          onClick={handleConfirm}
          aria-label={finalOkText}
        >
          {finalOkText}
        </button>
      </div>
    </Modal>
  );
});

// ============================================================
// PropTypes
// ============================================================
Alert.propTypes = {
  variant: PropTypes.oneOf(['success', 'error', 'warning', 'info']),
  title: PropTypes.string,
  message: PropTypes.string,
  statusLabel: PropTypes.string,
  okText: PropTypes.string,
  autoClose: PropTypes.bool,
  autoCloseDelay: PropTypes.number,
  closeOnOverlay: PropTypes.bool,
  closeOnEsc: PropTypes.bool,
  icon: PropTypes.string,
  className: PropTypes.string,
  labelledBy: PropTypes.string,
  describedBy: PropTypes.string,
  resolve: PropTypes.func,
  onClose: PropTypes.func,
  onConfirm: PropTypes.func,
};

Alert.defaultProps = {
  variant: 'info',
  title: '',
  message: '',
  statusLabel: '',
  okText: 'OK',
  autoClose: false,
  autoCloseDelay: DEFAULT_AUTO_CLOSE_DELAY,
  closeOnOverlay: true,
  closeOnEsc: true,
  icon: null,
  className: '',
  labelledBy: 'alert-title',
  describedBy: 'alert-desc',
  resolve: undefined,
  onClose: undefined,
  onConfirm: null,
};

Alert.displayName = 'Alert';

export default Alert;