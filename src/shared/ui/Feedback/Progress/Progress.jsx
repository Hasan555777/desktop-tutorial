// UI/Feedback/Progress.jsx
import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import styles from './Progress.module.css';


// ============================================================
// Constants (Component এর বাইরে)
// ============================================================
const ICON_MAP = {
  cube: 'fa-solid fa-cube',
  spinner: 'fa-solid fa-spinner',
  upload: 'fa-solid fa-upload',
  download: 'fa-solid fa-download',
  sync: 'fa-solid fa-sync',
  check: 'fa-solid fa-check',
  times: 'fa-solid fa-times',
};

const OVERLAY_STYLES = {
  pointerEvents: 'all',
  userSelect: 'none',
};

// ============================================================
// ETA Calculation Helper (Pure Function)
// ============================================================
const calculateETA = (startTime, progress) => {
  if (progress <= 0 || progress >= 100) return null;
  
  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed < 1) return null;
  
  const totalEstimated = (elapsed / progress) * 100;
  const remaining = totalEstimated - elapsed;
  
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

// ============================================================
// Main Component
// ============================================================
const Progress = React.memo(({ 
  value = 0,
  message = 'Loading...',
  subMessage = '',
  icon = 'cube',
  showPercent = true,
  animated = true,
  showCompleted = true,
  completeMessage = 'Completed! ✅',
  onComplete = null,
  children = null,
  className = '',
  showEta = true,
  etaUpdateInterval = 1000,
}) => {
  // ============================================================
  // Refs
  // ============================================================
  const onCompleteCalledRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const intervalRef = useRef(null);
  
  // ============================================================
  // State
  // ============================================================
  const [eta, setEta] = useState(null);

  // ============================================================
  // Safe Number Handling
  // ============================================================
  const clampedValue = useMemo(() => {
    const progress = Number(value);
    if (!Number.isFinite(progress)) return 0;
    return Math.min(100, Math.max(0, progress));
  }, [value]);

  const isComplete = clampedValue >= 100;
  const displayValue = Math.round(clampedValue);

  // ============================================================
  // ETA Calculation with Interval (Redesigned)
  // ============================================================
  useEffect(() => {
    // Reset on new progress start
    if (clampedValue === 0) {
      startTimeRef.current = Date.now();
      onCompleteCalledRef.current = false;
    }
  }, [clampedValue]);

  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only run ETA if enabled and in progress
    if (!showEta || isComplete || clampedValue <= 0 || clampedValue >= 100) {
      setEta(null);
      return;
    }

    // Initial ETA calculation
    const newEta = calculateETA(startTimeRef.current, clampedValue);
    setEta(newEta);

    // Update ETA periodically
    intervalRef.current = setInterval(() => {
      const updatedEta = calculateETA(startTimeRef.current, clampedValue);
      setEta(updatedEta);
    }, etaUpdateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [clampedValue, isComplete, showEta, etaUpdateInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // ============================================================
  // Complete Callback (Guarded with useRef)
  // ============================================================
  useEffect(() => {
    if (isComplete && onComplete && typeof onComplete === 'function' && !onCompleteCalledRef.current) {
      onCompleteCalledRef.current = true;
      onComplete();
    }
    
    // Reset guard if progress goes back below 100
    if (!isComplete) {
      onCompleteCalledRef.current = false;
    }
  }, [isComplete, onComplete]);

  // ============================================================
  // Icon Mapping (Memoized)
  // ============================================================
  const iconClass = useMemo(() => {
    return ICON_MAP[icon] || ICON_MAP.cube;
  }, [icon]);

  // ============================================================
  // Render
  // ============================================================
 return (
    <div 
      className={`${styles.progressOverlay} ${className}`}
      style={OVERLAY_STYLES}
    >
      <div className={styles.progressContainer}>
        {/* Icon */}
        <div className={`${styles.progressIcon} ${animated && !isComplete ? styles.animated : ''}`}>
          <i className={iconClass}></i>
          {isComplete && (
            <div className={styles.progressCheckmark}>
              <i className="fa-solid fa-check"></i>
            </div>
          )}
        </div>

        {/* Message */}
        <p className={styles.progressMessage}>
          {isComplete && showCompleted ? completeMessage : message}
        </p>

        {/* Sub Message */}
        {subMessage && !isComplete && (
          <p className={styles.progressSubMessage}>{subMessage}</p>
        )}

        {/* Progress Bar */}
        <div 
          className={styles.progressBarWrapper}
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={displayValue}
          aria-label={message}
        >
          <div className={styles.progressBar}>
            <div 
              className={`${styles.progressFill} ${isComplete ? styles.complete : ''} ${animated ? styles.animated : ''}`}
              style={{ width: `${clampedValue}%` }}
            />
          </div>
        </div>

        {/* Percentage / ETA / Status */}
        <div className={styles.progressFooter}>
          {showPercent && !isComplete && (
            <span className={styles.progressText}>{displayValue}%</span>
          )}
          
          {isComplete && showCompleted && (
            <span className={`${styles.progressText} ${styles.complete}`}>
              <i className="fa-solid fa-check-circle"></i>
              {completeMessage}
            </span>
          )}

          {eta && !isComplete && showEta && (
            <span className={styles.progressEta}>
              <i className="fa-regular fa-clock"></i>
              {eta} remaining
            </span>
          )}
        </div>

        {/* Children (Cancel Button, etc.) */}
        {children && (
          <div className={styles.progressActions}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
});

Progress.displayName = 'Progress';

export default Progress;