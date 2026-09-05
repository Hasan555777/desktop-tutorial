// UI/Feedback/NetworkOverlay/NetworkOverlay.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './NetworkStatus.module.css';


const NetworkOverlay = ({ 
  reconnecting, 
  onRetry, 
  lastOnline,
  errorMessage = 'Please check your connection',
  isVisible = true // ✅ নতুন prop - কখন দেখাবে
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // ✅ Refs to prevent infinite loops
  const retryTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const autoRetryDoneRef = useRef(false);

  // ✅ Handle retry button click - useCallback
  const handleRetry = useCallback(async () => {
    if (isRetrying) return;
    
    setIsRetrying(true);
    setShowSuccess(false);
    
    try {
      await onRetry?.();
      if (isMountedRef.current) {
        setShowSuccess(true);
        
        // Auto-hide success state after 2 seconds
        setTimeout(() => {
          if (isMountedRef.current) {
            setShowSuccess(false);
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Retry failed:', error);
    } finally {
      if (isMountedRef.current) {
        setIsRetrying(false);
      }
    }
  }, [isRetrying, onRetry]);

  // ✅ Auto retry when reconnecting - FIXED (only once)
  useEffect(() => {
    // ✅ Clear previous timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // ✅ Only auto-retry if reconnecting and not already retrying
    if (reconnecting && !isRetrying && !autoRetryDoneRef.current) {
      autoRetryDoneRef.current = true; // ✅ Prevent multiple retries
      
      retryTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && reconnecting) {
          handleRetry();
        }
      }, 3000);
    }

    // ✅ Reset auto-retry flag when reconnecting becomes false
    if (!reconnecting) {
      autoRetryDoneRef.current = false;
    }
    
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [reconnecting, isRetrying, handleRetry]);

  // ✅ Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  // ✅ Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Determine status class
  const getStatusClass = () => {
    if (showSuccess) return 'is-success';
    if (isRetrying) return 'is-loading';
    return '';
  };

  const formatLastOnline = (timestamp) => {
    if (!timestamp) return null;
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'moments ago';
    if (diffMin === 1) return '1 minute ago';
    if (diffMin < 60) return `${diffMin} minutes ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr === 1) return '1 hour ago';
    return `${diffHr} hours ago`;
  };

  const statusClass = getStatusClass();

  return (
    <div className={styles.networkOverlay} role="dialog" aria-modal="true">
      <div className={styles.card}>
        <div className={`${styles.iconWrapper} ${statusClass ? styles[statusClass] : ''}`}>
          <i
            className={
              showSuccess
                ? 'fa-solid fa-check'
                : isRetrying
                ? 'fa-solid fa-arrows-rotate'
                : 'fa-solid fa-wifi-slash'
            }
          ></i>
        </div>

        <h3 className={styles.title}>
          {showSuccess ? 'Connected!' : isRetrying ? 'Reconnecting...' : 'No Internet Connection'}
        </h3>

        <p className={styles.message}>
          {showSuccess ? 'Your connection has been restored.' : errorMessage}
        </p>

        {!showSuccess && (
          <p className={styles.subMessage}>
            Some features may not work until you're back online.
          </p>
        )}

        {!showSuccess && lastOnline && (
          <div className={styles.lastOnline}>
            <i className="fa-regular fa-clock"></i>
            Last online: {formatLastOnline(lastOnline)}
          </div>
        )}

        {showSuccess ? (
          <div className={styles.successCheck}>
            <i className="fa-solid fa-check"></i> Back online
          </div>
        ) : (
          <button className={styles.retryBtn} onClick={handleRetry} disabled={isRetrying}>
            {isRetrying ? (
              <>
                <span className={styles.spinner}></span> Checking...
              </>
            ) : (
              <>
                <i className="fa-solid fa-rotate-right"></i> Try Again
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default NetworkOverlay;