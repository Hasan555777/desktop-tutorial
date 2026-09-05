// UI/Feedback/Loader.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import styles from './Loader.module.css';


// ============================================================
// Constants
// ============================================================
const VARIANTS = {
  cube: 'fa-solid fa-cube',
  spinner: 'fa-solid fa-spinner',
  dots: 'fa-solid fa-ellipsis',
  pulse: 'fa-solid fa-circle-pulse',
  upload: 'fa-solid fa-upload',
  download: 'fa-solid fa-download',
  sync: 'fa-solid fa-sync',
  check: 'fa-solid fa-check',
  times: 'fa-solid fa-times',
};

const SIZE_CLASSES = {
  xs: 'loader-xs',
  sm: 'loader-sm',
  md: 'loader-md',
  lg: 'loader-lg',
  xl: 'loader-xl',
};

const TYPE_CLASSES = {
  overlay: 'loader-overlay',
  page: 'loader-overlay loader-fullscreen',
  inline: 'loader-inline',
  button: 'loader-button',
  container: 'loader-container',
};

// ============================================================
// Main Component
// ============================================================
const Loader = React.memo(({
  // Core props
  open = true,
  type = 'page',
  variant = 'cube',
  size = 'md',
  message = 'Loading...',
  subMessage = '',
  
  // Timing props
  delay = 200,
  minDuration = 500,
  
  // Visual props
  icon = null,
  blurBackground = true,
  fullscreen = false,
  className = '',
  style = {},
  
  // Progress support
  progress = null,
  showProgress = false,
  
  // Accessibility
  ariaLabel = 'Loading',
  ariaLive = 'polite',
  
  // Children
  children = null,
  
  // Portal
  portalContainer = null,
  
  // Callbacks
  onOpen = null,
  onClose = null,
}) => {
  // ============================================================
  // Refs
  // ============================================================
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const containerRef = useRef(portalContainer || document.body);

  // ============================================================
  // State
  // ============================================================
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // ============================================================
  // Computed Values
  // ============================================================
  const iconClass = useMemo(() => {
    if (icon) return `fa-solid fa-${icon}`;
    return VARIANTS[variant] || VARIANTS.cube;
  }, [icon, variant]);

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const typeClass = TYPE_CLASSES[type] || TYPE_CLASSES.overlay;

  const showProgressBar = showProgress && progress !== null && progress >= 0 && progress <= 100;
  const clampedProgress = showProgressBar ? Math.min(100, Math.max(0, progress)) : 0;

  // ============================================================
  // Timing Logic
  // ============================================================
  useEffect(() => {
    if (!open) {
      // Close logic with minimum duration
      if (startTimeRef.current) {
        const elapsed = Date.now() - startTimeRef.current;
        const remaining = Math.max(0, minDuration - elapsed);
        
        timerRef.current = setTimeout(() => {
          setIsVisible(false);
          setIsMounted(false);
          setShouldRender(false);
          startTimeRef.current = null;
          onClose?.();
        }, remaining);
      } else {
        setIsVisible(false);
        setIsMounted(false);
        setShouldRender(false);
        onClose?.();
      }
      return;
    }

    // Open logic with delay
    setIsMounted(true);
    startTimeRef.current = Date.now();

    timerRef.current = setTimeout(() => {
      setIsVisible(true);
      setShouldRender(true);
      onOpen?.();
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, delay, minDuration, onOpen, onClose]);

  // ============================================================
  // Cleanup on unmount
  // ============================================================
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // ============================================================
  // Render
  // ============================================================
  if (!shouldRender && !open) return null;

const loaderContent = (
    <div
      className={`${styles[typeClass]} ${styles[sizeClass]} ${className} ${isVisible ? styles.loaderVisible : styles.loaderHidden}`}
      style={{
        ...style,
        backdropFilter: blurBackground && type !== 'inline' && type !== 'button' ? 'blur(8px)' : 'none',
        ...(fullscreen ? { position: 'fixed', inset: 0 } : {}),
      }}
      role="status"
      aria-live={ariaLive}
      aria-busy={isVisible}
      aria-label={ariaLabel}
    >
      <div className={styles.loaderContent}>
        {/* Icon */}
        <div className={`${styles.loaderIcon} ${variant === 'cube' ? styles.loaderCubeAnimated : ''}`}>
          <i className={iconClass}></i>
          {variant === 'dots' && (
            <div className={styles.loaderDots}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>

        {/* Message */}
        {message && (
          <h2 className={styles.loaderTitle}>{message}</h2>
        )}
        
        {/* Sub Message */}
        {subMessage && (
          <p className={styles.loaderSubMessage}>{subMessage}</p>
        )}

        {/* Progress Bar */}
        {showProgressBar && (
          <div className={styles.loaderProgressWrapper}>
            <div className={styles.loaderProgressBar}>
              <div 
                className={styles.loaderProgressFill}
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
            <span className={styles.loaderProgressText}>
              {Math.round(clampedProgress)}%
            </span>
          </div>
        )}

        {/* Children */}
        {children && (
          <div className={styles.loaderActions}>
            {children}
          </div>
        )}
      </div>
    </div>
  );

  // Use portal for overlay and page types
  if (type === 'overlay' || type === 'page') {
    return createPortal(loaderContent, containerRef.current);
  }

  return loaderContent;
});

// ============================================================
// PropTypes
// ============================================================
Loader.propTypes = {
  open: PropTypes.bool,
  type: PropTypes.oneOf(['overlay', 'page', 'inline', 'button', 'container']),
  variant: PropTypes.oneOf(['cube', 'spinner', 'dots', 'pulse', 'upload', 'download', 'sync', 'check', 'times']),
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  message: PropTypes.string,
  subMessage: PropTypes.string,
  delay: PropTypes.number,
  minDuration: PropTypes.number,
  icon: PropTypes.string,
  blurBackground: PropTypes.bool,
  fullscreen: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object,
  progress: PropTypes.number,
  showProgress: PropTypes.bool,
  ariaLabel: PropTypes.string,
  ariaLive: PropTypes.oneOf(['off', 'polite', 'assertive']),
  children: PropTypes.node,
  portalContainer: PropTypes.instanceOf(Element),
  onOpen: PropTypes.func,
  onClose: PropTypes.func,
};

Loader.defaultProps = {
  open: true,
  type: 'page',
  variant: 'cube',
  size: 'md',
  message: 'Loading...',
  subMessage: '',
  delay: 200,
  minDuration: 500,
  icon: null,
  blurBackground: true,
  fullscreen: false,
  className: '',
  style: {},
  progress: null,
  showProgress: false,
  ariaLabel: 'Loading',
  ariaLive: 'polite',
  children: null,
  portalContainer: null,
  onOpen: null,
  onClose: null,
};

Loader.displayName = 'Loader';

export default Loader;