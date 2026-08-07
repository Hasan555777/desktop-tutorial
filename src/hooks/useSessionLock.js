// src/hooks/useSessionLock.js

import { useEffect, useRef, useCallback } from 'react';
import { 
  IDLE_TIMEOUT,
  BACKGROUND_TIMEOUT,
  LOCK_ON_TAB_CHANGE,
  LOCK_ON_BROWSER_CLOSE
} from '@/security/constants';

// ============================================================
// 🎯 useSessionLock Hook
// ============================================================

export const useSessionLock = ({
  enabled = false,
  unlocked = true,
  onLock = () => {},
  idleTimeout = IDLE_TIMEOUT || 5 * 60 * 1000, // 5 minutes default
  backgroundTimeout = BACKGROUND_TIMEOUT || 30 * 1000, // 30 seconds default
  lockOnTabChange = LOCK_ON_TAB_CHANGE !== undefined ? LOCK_ON_TAB_CHANGE : true,
  lockOnBrowserClose = LOCK_ON_BROWSER_CLOSE !== undefined ? LOCK_ON_BROWSER_CLOSE : true,
}) => {
  // ── Refs ──
  const idleTimerRef = useRef(null);
  const backgroundTimerRef = useRef(null);
  const isBackgroundRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const isLockedRef = useRef(false);
  const isMountedRef = useRef(true);

  // ============================================================
  // ✅ Lock Function
  // ============================================================

  const lockApp = useCallback(() => {
    // Prevent multiple locks
    if (isLockedRef.current) {
      console.log('🔒 Already locked, skipping...');
      return;
    }

    console.log('🔒 Locking app...');
    isLockedRef.current = true;

    // Clear all timers
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (backgroundTimerRef.current) {
      clearTimeout(backgroundTimerRef.current);
      backgroundTimerRef.current = null;
    }

    // Call onLock callback
    try {
      onLock();
    } catch (error) {
      console.error('❌ Error in onLock callback:', error);
    }
  }, [onLock]);

  // ============================================================
  // ✅ Reset Idle Timer
  // ============================================================

  const resetIdleTimer = useCallback(() => {
    if (!enabled || !unlocked || isLockedRef.current) {
      return;
    }

    lastActivityRef.current = Date.now();

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    // Set new idle timer
    idleTimerRef.current = setTimeout(() => {
      if (unlocked && !isBackgroundRef.current && !isLockedRef.current) {
        console.log('⏰ Idle timeout - locking app');
        lockApp();
      }
    }, idleTimeout);
  }, [enabled, unlocked, idleTimeout, lockApp]);

  // ============================================================
  // ✅ Background Timer
  // ============================================================

  const startBackgroundTimer = useCallback(() => {
    if (!enabled || !unlocked || isLockedRef.current) {
      return;
    }

    if (backgroundTimerRef.current) {
      clearTimeout(backgroundTimerRef.current);
      backgroundTimerRef.current = null;
    }

    backgroundTimerRef.current = setTimeout(() => {
      if (unlocked && isBackgroundRef.current && !isLockedRef.current) {
        console.log('⏰ Background timeout - locking app');
        lockApp();
      }
    }, backgroundTimeout);
  }, [enabled, unlocked, backgroundTimeout, lockApp]);

  // ============================================================
  // ✅ Activity Handlers
  // ============================================================

  const handleActivity = useCallback(() => {
    if (!enabled || !unlocked || isLockedRef.current) {
      return;
    }
    if (isBackgroundRef.current) {
      return;
    }

    resetIdleTimer();
  }, [enabled, unlocked, resetIdleTimer]);

  // ============================================================
  // ✅ Visibility Change Handler
  // ============================================================

  const handleVisibilityChange = useCallback(() => {
    if (!enabled || isLockedRef.current) {
      return;
    }

    if (document.hidden) {
      // App went to background
      console.log('📱 App went to background');
      isBackgroundRef.current = true;

      // Clear idle timer when in background
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      // Start background timer
      if (lockOnTabChange && unlocked) {
        startBackgroundTimer();
      }
    } else {
      // App came to foreground
      console.log('📱 App came to foreground');
      isBackgroundRef.current = false;

      // Clear background timer
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }

      // Reset idle timer
      if (unlocked && !isLockedRef.current) {
        resetIdleTimer();
      }
    }
  }, [enabled, unlocked, lockOnTabChange, startBackgroundTimer, resetIdleTimer]);

  // ============================================================
  // ✅ Window Blur/Focus Handlers
  // ============================================================

  const handleBlur = useCallback(() => {
    if (!enabled || !lockOnTabChange || isLockedRef.current) {
      return;
    }
    if (!document.hidden) {
      // Window lost focus but tab is still visible
      console.log('🪟 Window blurred');
      isBackgroundRef.current = true;

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      if (unlocked) {
        startBackgroundTimer();
      }
    }
  }, [enabled, lockOnTabChange, unlocked, startBackgroundTimer]);

  const handleFocus = useCallback(() => {
    if (!enabled || isLockedRef.current) {
      return;
    }
    if (!document.hidden) {
      console.log('🪟 Window focused');
      isBackgroundRef.current = false;

      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }

      if (unlocked && !isLockedRef.current) {
        resetIdleTimer();
      }
    }
  }, [enabled, unlocked, resetIdleTimer]);

  // ============================================================
  // ✅ Page Visibility for Browser Close
  // ============================================================

  const handleBeforeUnload = useCallback(() => {
    if (!enabled || !lockOnBrowserClose || isLockedRef.current) {
      return;
    }
    console.log('🔄 Browser closing - locking app');
    lockApp();
  }, [enabled, lockOnBrowserClose, lockApp]);

  // ============================================================
  // ✅ Manual Lock Function (for external use)
  // ============================================================

  const manualLock = useCallback(() => {
    console.log('🔒 Manual lock triggered');
    lockApp();
  }, [lockApp]);

  // ============================================================
  // ✅ Reset Function (for external use)
  // ============================================================

  const resetSession = useCallback(() => {
    console.log('🔄 Session reset');
    isLockedRef.current = false;
    isBackgroundRef.current = false;
    
    if (backgroundTimerRef.current) {
      clearTimeout(backgroundTimerRef.current);
      backgroundTimerRef.current = null;
    }
    
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    
    if (enabled && unlocked) {
      resetIdleTimer();
    }
  }, [enabled, unlocked, resetIdleTimer]);

  // ============================================================
  // ✅ Setup Event Listeners
  // ============================================================

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      // Cleanup if disabled
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }
      isLockedRef.current = false;
      isBackgroundRef.current = false;
      return;
    }

    console.log('🔐 Session Lock enabled');

    // ── Visibility API ──
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ── Window Focus/Blur ──
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    // ── Page Visibility ──
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    // ── User Activity Events ──
    const activityEvents = [
      'mousemove',
      'mousedown',
      'click',
      'keydown',
      'touchstart',
      'touchmove',
      'scroll',
      'wheel'
    ];

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // ── Initial timer ──
    if (unlocked && !isLockedRef.current) {
      resetIdleTimer();
    }

    // ── Cleanup ──
    return () => {
      isMountedRef.current = false;
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);

      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }

      console.log('🔐 Session Lock disabled');
    };
  }, [
    enabled,
    handleVisibilityChange,
    handleBlur,
    handleFocus,
    handleBeforeUnload,
    handleActivity,
    resetIdleTimer,
  ]);

  // ── Reset timers when unlock status changes ──
  useEffect(() => {
    if (enabled && unlocked && !isLockedRef.current) {
      console.log('🔓 App unlocked - starting session timers');
      isBackgroundRef.current = false;
      resetIdleTimer();
    } else if (enabled && !unlocked) {
      console.log('🔒 App locked - clearing session timers');
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }
    }
  }, [enabled, unlocked, resetIdleTimer]);

  // ============================================================
  // ✅ Return
  // ============================================================

  return {
    manualLock,
    resetSession,
    isBackground: isBackgroundRef.current,
    lastActivity: lastActivityRef.current,
    isLocked: isLockedRef.current,
  };
};

export default useSessionLock;