// UI/Feedback/Toast/Toast.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import styles from './Toast.module.css';


// ============================================================
// Constants
// ============================================================
const TOAST_CONFIGS = {
  success: {
    icon: 'fa-solid fa-circle-check',
    variantClass: 'success',
    defaultMessage: 'Success!',
  },
  error: {
    icon: 'fa-solid fa-circle-xmark',
    variantClass: 'error',
    defaultMessage: 'Error!',
  },
  warning: {
    icon: 'fa-solid fa-triangle-exclamation',
    variantClass: 'warning',
    defaultMessage: 'Warning!',
  },
  info: {
    icon: 'fa-solid fa-circle-info',
    variantClass: 'info',
    defaultMessage: 'Info',
  },
};

const POSITIONS = {
  'top-right': 'toast-top-right',
  'top-left': 'toast-top-left',
  'top-center': 'toast-top-center',
  'bottom-right': 'toast-bottom-right',
  'bottom-left': 'toast-bottom-left',
  'bottom-center': 'toast-bottom-center',
};

const DEFAULT_DURATION = 3000;
const DEFAULT_POSITION = 'top-right';

// ============================================================
// Toast Item Component (Internal)
// ============================================================
const ToastItem = React.memo(({
  id,
  message,
  variant = 'info',
  icon = null,
  duration = DEFAULT_DURATION,
  position = DEFAULT_POSITION,
  closable = true,
  showProgress = true,
  onClose,
  onComplete,
  className = '',
}) => {
  // ============================================================
  // State & Refs
  // ============================================================
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef(null);
  const progressRef = useRef(null);
  const pauseRef = useRef(false);

  // ============================================================
  // Config
  // ============================================================
  const config = TOAST_CONFIGS[variant] || TOAST_CONFIGS.info;
  const iconClass = icon || config.icon;
  const variantClass = config.variantClass;
  const finalMessage = message || config.defaultMessage;

  // ============================================================
  // Progress Animation
  // ============================================================
  const startProgress = useCallback(() => {
    if (!showProgress || duration === 0) return;
    
    const startTime = Date.now();
    const totalDuration = duration;

    const updateProgress = () => {
      if (pauseRef.current) return;
      
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / totalDuration) * 100);
      
      setProgress(remaining);
      
      if (remaining > 0) {
        progressRef.current = requestAnimationFrame(updateProgress);
      } else {
        handleClose();
      }
    };

    progressRef.current = requestAnimationFrame(updateProgress);
  }, [duration, showProgress]);

  // ============================================================
  // Close Handler
  // ============================================================
  const handleClose = useCallback(() => {
    if (isExiting) return;
    
    setIsExiting(true);
    
    if (progressRef.current) {
      cancelAnimationFrame(progressRef.current);
      progressRef.current = null;
    }
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Wait for exit animation
    setTimeout(() => {
      setIsVisible(false);
      onClose(id);
    }, 300);
  }, [isExiting, id, onClose]);

  // ============================================================
  // Pause/Resume on Hover
  // ============================================================
  const handleMouseEnter = useCallback(() => {
    pauseRef.current = true;
    if (progressRef.current) {
      cancelAnimationFrame(progressRef.current);
      progressRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    pauseRef.current = false;
    if (!isExiting && duration > 0) {
      // Resume from current progress
      const remainingDuration = (progress / 100) * duration;
      const startTime = Date.now();
      const totalDuration = remainingDuration;

      const updateProgress = () => {
        if (pauseRef.current) return;
        
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / totalDuration) * 100);
        
        setProgress(remaining);
        
        if (remaining > 0) {
          progressRef.current = requestAnimationFrame(updateProgress);
        } else {
          handleClose();
        }
      };

      progressRef.current = requestAnimationFrame(updateProgress);
    }
  }, [duration, progress, isExiting, handleClose]);

  // ============================================================
  // Auto Close Timer
  // ============================================================
  useEffect(() => {
    if (duration === 0) {
      // Infinite duration (no auto close)
      setIsVisible(true);
      return;
    }

    // Small delay for enter animation
    const enterTimer = setTimeout(() => {
      setIsVisible(true);
      startProgress();
    }, 50);

    return () => {
      clearTimeout(enterTimer);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (progressRef.current) {
        cancelAnimationFrame(progressRef.current);
        progressRef.current = null;
      }
    };
  }, [duration, startProgress]);

  // ============================================================
  // Keyboard Support (Escape)
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // ============================================================
  // Render
  // ============================================================
  const positionClass = POSITIONS[position] || POSITIONS[DEFAULT_POSITION];

return (
    <div
      className={`${styles.toastItem} ${styles[positionClass]} ${styles[variantClass]} ${isVisible ? styles.toastEnter : ''} ${isExiting ? styles.toastExit : ''} ${className}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={styles.toastContent}>
        {/* Icon */}
        <div className={`${styles.toastIcon} ${styles[variantClass]}`}>
          <i className={iconClass}></i>
        </div>

        {/* Message */}
        <div className={styles.toastBody}>
          <p className={styles.toastMessage}>{finalMessage}</p>
        </div>

        {/* Close Button */}
        {closable && (
          <button
            className={styles.toastClose}
            onClick={handleClose}
            aria-label="Close notification"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {showProgress && duration > 0 && (
        <div className={styles.toastProgress}>
          <div
            className={`${styles.toastProgressBar} ${styles[variantClass]}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
});

ToastItem.displayName = 'ToastItem';

// ============================================================
// Main Toast Container Component
// ============================================================
const Toast = React.memo(({
  // Toast list
  toasts = [],
  onClose,
  
  // Container props
  position = DEFAULT_POSITION,
  className = '',
  zIndex = 10000,
  maxToasts = 5,
  portalContainer = null,
}) => {
  // ============================================================
  // Refs
  // ============================================================
  const containerRef = useRef(portalContainer || document.body);

  // ============================================================
  // Limit toasts
  // ============================================================
  const visibleToasts = toasts.slice(0, maxToasts);

  // ============================================================
  // Render
  // ============================================================
  if (toasts.length === 0) return null;

  const containerContent = (
    <div
      className={`${styles.toastContainer} ${styles[POSITIONS[position] || POSITIONS[DEFAULT_POSITION]]} ${className}`}
      style={{ zIndex }}
      role="region"
      aria-label="Notifications"
    >
      {visibleToasts.map((toast) => (
        <ToastItem
          key={toast.id}
          {...toast}
          onClose={onClose}
        />
      ))}
    </div>
  );

  return createPortal(containerContent, containerRef.current);
});

// ============================================================
// PropTypes
// ============================================================
ToastItem.propTypes = {
  id: PropTypes.string.isRequired,
  message: PropTypes.string,
  variant: PropTypes.oneOf(['success', 'error', 'warning', 'info']),
  icon: PropTypes.string,
  duration: PropTypes.number,
  position: PropTypes.oneOf(Object.keys(POSITIONS)),
  closable: PropTypes.bool,
  showProgress: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onComplete: PropTypes.func,
  className: PropTypes.string,
};

ToastItem.defaultProps = {
  message: '',
  variant: 'info',
  icon: null,
  duration: DEFAULT_DURATION,
  position: DEFAULT_POSITION,
  closable: true,
  showProgress: true,
  onComplete: undefined,
  className: '',
};

Toast.propTypes = {
  toasts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    message: PropTypes.string,
    variant: PropTypes.oneOf(['success', 'error', 'warning', 'info']),
    icon: PropTypes.string,
    duration: PropTypes.number,
    position: PropTypes.oneOf(Object.keys(POSITIONS)),
    closable: PropTypes.bool,
    showProgress: PropTypes.bool,
    onComplete: PropTypes.func,
  })),
  onClose: PropTypes.func.isRequired,
  position: PropTypes.oneOf(Object.keys(POSITIONS)),
  className: PropTypes.string,
  zIndex: PropTypes.number,
  maxToasts: PropTypes.number,
  portalContainer: PropTypes.instanceOf(Element),
};

Toast.defaultProps = {
  toasts: [],
  position: DEFAULT_POSITION,
  className: '',
  zIndex: 10000,
  maxToasts: 5,
  portalContainer: null,
};

Toast.displayName = 'Toast';

export default Toast;