// src/hooks/useSessionLock.js

import { useEffect, useRef, useCallback } from 'react';
import { IDLE_TIMEOUT, BACKGROUND_TIMEOUT, LOCK_ON_TAB_CHANGE, LOCK_ON_BROWSER_CLOSE } from '@/security/constants';
import { logInfo, logError } from '@/utils/logger';

// ============================================================
// useSessionLock Hook
// ============================================================

export const useSessionLock = ({
  enabled = false,
  unlocked = true,
  onLock = () => {},
  idleTimeout = IDLE_TIMEOUT || 5 * 60 * 1000,
  backgroundTimeout = BACKGROUND_TIMEOUT || 30 * 1000,
  lockOnTabChange = LOCK_ON_TAB_CHANGE !== undefined ? LOCK_ON_TAB_CHANGE : true,
  lockOnBrowserClose = LOCK_ON_BROWSER_CLOSE !== undefined ? LOCK_ON_BROWSER_CLOSE : true,
}) => {
  const idleTimerRef = useRef(null);
  const backgroundTimerRef = useRef(null);
  const isBackgroundRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const isLockedRef = useRef(false);
  const isMountedRef = useRef(true);

  // ============================================================
  // Lock Function
  // ============================================================
  const lockApp = useCallback(() => {
    if (isLockedRef.current) return;

    isLockedRef.current = true;

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (backgroundTimerRef.current) {
      clearTimeout(backgroundTimerRef.current);
      backgroundTimerRef.current = null;
    }

    try {
      onLock();
    } catch (error) {
      logError('Error in onLock callback', error);
    }
  }, [onLock]);

  // ============================================================
  // Idle Timer
  // ============================================================
  const resetIdleTimer = useCallback(() => {
    if (!enabled || !unlocked || isLockedRef.current) return;

    lastActivityRef.current = Date.now();

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    idleTimerRef.current = setTimeout(() => {
      if (unlocked && !isBackgroundRef.current && !isLockedRef.current) {
        lockApp();
      }
    }, idleTimeout);
  }, [enabled, unlocked, idleTimeout, lockApp]);

  // ============================================================
  // Background Timer
  // ============================================================
  const startBackgroundTimer = useCallback(() => {
    if (!enabled || !unlocked || isLockedRef.current) return;

    if (backgroundTimerRef.current) {
      clearTimeout(backgroundTimerRef.current);
      backgroundTimerRef.current = null;
    }

    backgroundTimerRef.current = setTimeout(() => {
      if (unlocked && isBackgroundRef.current && !isLockedRef.current) {
        lockApp();
      }
    }, backgroundTimeout);
  }, [enabled, unlocked, backgroundTimeout, lockApp]);

  // ============================================================
  // Activity Handler
  // ============================================================
  const handleActivity = useCallback(() => {
    if (!enabled || !unlocked || isLockedRef.current) return;
    if (isBackgroundRef.current) return;
    resetIdleTimer();
  }, [enabled, unlocked, resetIdleTimer]);

  // ============================================================
  // Visibility Change Handler
  // ============================================================
  const handleVisibilityChange = useCallback(() => {
    if (!enabled || isLockedRef.current) return;

    if (document.hidden) {
      isBackgroundRef.current = true;

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      if (lockOnTabChange && unlocked) startBackgroundTimer();
    } else {
      isBackgroundRef.current = false;

      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }

      if (unlocked && !isLockedRef.current) resetIdleTimer();
    }
  }, [enabled, unlocked, lockOnTabChange, startBackgroundTimer, resetIdleTimer]);

  // ============================================================
  // Window Blur/Focus Handlers
  // ============================================================
  const handleBlur = useCallback(() => {
    if (!enabled || !lockOnTabChange || isLockedRef.current) return;
    if (!document.hidden) {
      isBackgroundRef.current = true;

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      if (unlocked) startBackgroundTimer();
    }
  }, [enabled, lockOnTabChange, unlocked, startBackgroundTimer]);

  const handleFocus = useCallback(() => {
    if (!enabled || isLockedRef.current) return;
    if (!document.hidden) {
      isBackgroundRef.current = false;

      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }

      if (unlocked && !isLockedRef.current) resetIdleTimer();
    }
  }, [enabled, unlocked, resetIdleTimer]);

  // ============================================================
  // Browser Close / Page Hide
  // ============================================================
  const handleBeforeUnload = useCallback(() => {
    if (!enabled || !lockOnBrowserClose || isLockedRef.current) return;
    lockApp();
  }, [enabled, lockOnBrowserClose, lockApp]);

  // ============================================================
  // Manual Controls (for external use)
  // ============================================================
  const manualLock = useCallback(() => {
    lockApp();
  }, [lockApp]);

  const resetSession = useCallback(() => {
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

    if (enabled && unlocked) resetIdleTimer();
  }, [enabled, unlocked, resetIdleTimer]);

  // Live reads of the ref-backed state. The plain `isBackground`/`isLocked`
  // values returned below are snapshots taken at the last render and won't
  // reflect changes that happen between renders (refs don't trigger
  // re-renders) — use these getters instead if you need an up-to-date value
  // at the moment you check it.
  const getIsLocked = useCallback(() => isLockedRef.current, []);
  const getIsBackground = useCallback(() => isBackgroundRef.current, []);
  const getLastActivity = useCallback(() => lastActivityRef.current, []);

  // ============================================================
  // Setup Event Listeners
  // ============================================================
  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
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

    logInfo('Session lock enabled');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    const activityEvents = ['mousemove', 'mousedown', 'click', 'keydown', 'touchstart', 'touchmove', 'scroll', 'wheel'];
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    if (unlocked && !isLockedRef.current) {
      resetIdleTimer();
    }

    return () => {
      isMountedRef.current = false;

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);

      activityEvents.forEach((event) => {
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
    };
  }, [enabled, handleVisibilityChange, handleBlur, handleFocus, handleBeforeUnload, handleActivity, resetIdleTimer]);

  // Reset timers when unlock status changes
  useEffect(() => {
    if (enabled && unlocked && !isLockedRef.current) {
      isBackgroundRef.current = false;
      resetIdleTimer();
    } else if (enabled && !unlocked) {
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

  return {
    manualLock,
    resetSession,
    // Point-in-time snapshots (see note above) — kept for backward
    // compatibility with existing callers.
    isBackground: isBackgroundRef.current,
    lastActivity: lastActivityRef.current,
    isLocked: isLockedRef.current,
    // Prefer these for an always-current read.
    getIsLocked,
    getIsBackground,
    getLastActivity,
  };
};

export default useSessionLock;