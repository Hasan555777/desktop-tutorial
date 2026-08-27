// UI/Feedback/NetworkOverlay/NetworkOverlay.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './NetworkOverlay.css';

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

  return (
    <div className="network-overlayy" role="dialog" aria-modal="true">

    </div>
  );
};

export default NetworkOverlay;