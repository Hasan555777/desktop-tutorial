// UI/Feedback/FeedbackProvider.jsx
import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import Modal from './Modal/Modal';
import Loader from './Loader/Loader';
import Alert from './Alert/Alert';
import Confirm from './Confirm/Confirm';
import Prompt from './Prompt/Prompt';
import BottomSheet from './BottomSheet/BottomSheet';
import Progress from './Progress/Progress';
import Toast from './Toast/Toast';
import NetworkOverlay from './NetworkOverlay/NetworkOverlay';
import { useSound } from '../Sound';
import { createSoundIntegration } from '../Sound/SoundIntegration';
import { logError } from '../../utils/logger';

// ============================================================
// Constants
// ============================================================
const MAX_MODAL_STACK = 5;
const DEFAULT_AUTO_CLOSE_DELAY = 3000;
const NETWORK_PING_INTERVAL = 30000;
const SLOW_NETWORK_THRESHOLD = 2000;
const MAX_RETRY_COUNT = 3;
const REQUEST_TIMEOUT = 15000;

// ============================================================
// ID Generator
// ============================================================
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// ============================================================
// Body Scroll Lock
// ============================================================
const lockBodyScroll = () => {
  document.body.style.overflow = 'hidden';
};

const unlockBodyScroll = () => {
  document.body.style.overflow = '';
};

// ============================================================
// Reducer
//
// IMPORTANT: reducers must be pure — no side effects. The previous version
// called `modal.resolve?.(null)` from inside MODAL_CLOSE/MODAL_CLOSE_ALL,
// which (a) always resolved with `null` regardless of what button the user
// actually pressed — meaning every confirm()/prompt() call in the app
// resolved to `null` no matter what, so e.g. "Yes, Logout" never actually
// logged anyone out — and (b) violates React's reducer-purity contract
// (can double-fire under StrictMode). Resolving the promise now happens in
// closeModal()/closeAllModals() *before* dispatch, with the real result.
// ============================================================
const initialState = {
  modalStack: [],
  loadingQueue: [],
  progressQueue: [],
  toastQueue: [],
  network: {
    online: navigator.onLine,
    slow: false,
    reconnecting: false,
    lastOnline: Date.now(),
    latency: 0,
    pendingRequests: [],
    retryQueue: [],
  },
};

function feedbackReducer(state, action) {
  switch (action.type) {
    case 'MODAL_OPEN': {
      if (state.modalStack.length >= MAX_MODAL_STACK) {
        const newStack = [...state.modalStack.slice(1), action.payload];
        return { ...state, modalStack: newStack };
      }
      return { ...state, modalStack: [...state.modalStack, action.payload] };
    }

    case 'MODAL_CLOSE': {
      const newStack = state.modalStack.filter((m) => m.id !== action.payload);
      if (newStack.length === 0) unlockBodyScroll();
      return { ...state, modalStack: newStack };
    }

    case 'MODAL_CLOSE_ALL': {
      unlockBodyScroll();
      return { ...state, modalStack: [] };
    }

    case 'LOADING_SHOW': {
      return { ...state, loadingQueue: [...state.loadingQueue, action.payload] };
    }

    case 'LOADING_HIDE': {
      const newQueue = state.loadingQueue.filter((item) => item.id !== action.payload);
      return { ...state, loadingQueue: newQueue };
    }

    case 'LOADING_CLEAR': {
      return { ...state, loadingQueue: [] };
    }

    case 'PROGRESS_START': {
      return { ...state, progressQueue: [...state.progressQueue, { ...action.payload, id: generateId() }] };
    }

    case 'PROGRESS_UPDATE': {
      const newQueue = state.progressQueue.map((item) =>
        item.id === action.payload.id ? { ...item, value: action.payload.value, message: action.payload.message } : item
      );
      return { ...state, progressQueue: newQueue };
    }

    case 'PROGRESS_FINISH': {
      return { ...state, progressQueue: state.progressQueue.filter((item) => item.id !== action.payload) };
    }

    case 'TOAST_SHOW': {
      return { ...state, toastQueue: [...state.toastQueue, action.payload] };
    }

    case 'TOAST_HIDE': {
      return { ...state, toastQueue: state.toastQueue.filter((item) => item.id !== action.payload) };
    }

    case 'NETWORK_ONLINE': {
      const newState = {
        ...state,
        network: { ...state.network, online: true, reconnecting: false, lastOnline: Date.now() },
      };

      if (state.network.pendingRequests.length > 0) {
        newState.network = {
          ...newState.network,
          pendingRequests: [],
          retryQueue: [...newState.network.retryQueue, ...state.network.pendingRequests],
        };
      }

      return newState;
    }

    case 'NETWORK_OFFLINE': {
      return {
        ...state,
        network: {
          ...state.network,
          online: false,
          reconnecting: false,
          lastOnline: state.network.lastOnline || Date.now(),
        },
      };
    }

    case 'NETWORK_RECONNECTING': {
      return { ...state, network: { ...state.network, reconnecting: true } };
    }

    case 'NETWORK_RECONNECTED': {
      return { ...state, network: { ...state.network, reconnecting: false } };
    }

    case 'NETWORK_SLOW': {
      return { ...state, network: { ...state.network, slow: true } };
    }

    case 'NETWORK_FAST': {
      return { ...state, network: { ...state.network, slow: false } };
    }

    case 'NETWORK_LATENCY': {
      return { ...state, network: { ...state.network, latency: action.payload } };
    }

    case 'NETWORK_PENDING_ADD': {
      return { ...state, network: { ...state.network, pendingRequests: [...state.network.pendingRequests, action.payload] } };
    }

    case 'NETWORK_PENDING_REMOVE': {
      return {
        ...state,
        network: {
          ...state.network,
          pendingRequests: state.network.pendingRequests.filter((req) => req.id !== action.payload),
        },
      };
    }

    case 'NETWORK_RETRY_ADD': {
      return { ...state, network: { ...state.network, retryQueue: [...state.network.retryQueue, action.payload] } };
    }

    case 'NETWORK_RETRY_REMOVE': {
      return {
        ...state,
        network: { ...state.network, retryQueue: state.network.retryQueue.filter((req) => req.id !== action.payload) },
      };
    }

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================
const FeedbackContext = createContext();

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within FeedbackProvider');
  }
  return context;
};

// ============================================================
// Provider
// ============================================================
export const FeedbackProvider = ({ children }) => {
  const [state, dispatch] = useReducer(feedbackReducer, initialState);
  const autoCloseTimers = useRef(new Map());
  const pingTimer = useRef(null);
  const isMountedRef = useRef(true);
  const reconnectAttemptRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const isProcessingRetryRef = useRef(false);

  // Live snapshot of network state, read by functions that must stay
  // identity-stable (checkNetworkLatency, processRetryQueue) so they don't
  // force the ping-interval effect to tear down and restart on every
  // network state change.
  const networkStateRef = useRef(state.network);
  useEffect(() => {
    networkStateRef.current = state.network;
  }, [state.network]);

  const sound = useSound();
  const soundIntegration = createSoundIntegration(sound);

  // ============================================================
  // Sound Integration Helpers
  // ============================================================
  const playFeedbackSound = useCallback((type, options = {}) => soundIntegration.playFeedbackSound(type, options), [soundIntegration]);
  const playSuccess = useCallback((options = {}) => soundIntegration.playSuccess(options), [soundIntegration]);
  const playError = useCallback((options = {}) => soundIntegration.playError(options), [soundIntegration]);
  const playWarning = useCallback((options = {}) => soundIntegration.playWarning(options), [soundIntegration]);
  const playInfo = useCallback((options = {}) => soundIntegration.playInfo(options), [soundIntegration]);
  const playClick = useCallback((options = {}) => soundIntegration.playClick(options), [soundIntegration]);
  const playNetworkOnline = useCallback((options = {}) => soundIntegration.playNetworkOnline(options), [soundIntegration]);
  const playNetworkOffline = useCallback((options = {}) => soundIntegration.playNetworkOffline(options), [soundIntegration]);
  const playLoadingComplete = useCallback((options = {}) => soundIntegration.playLoadingComplete(options), [soundIntegration]);
  const playLoadingError = useCallback((options = {}) => soundIntegration.playLoadingError(options), [soundIntegration]);

  // ============================================================
  // Cleanup
  // ============================================================
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      autoCloseTimers.current.forEach((timer) => clearTimeout(timer));
      autoCloseTimers.current.clear();
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, []);

  // ============================================================
  // Modal System
  //
  // closeModal / closeAllModals are the ONLY places that resolve a modal's
  // promise — with the actual result the caller passed in — before
  // dispatching the (now side-effect-free) reducer action.
  // ============================================================
  const closeModal = useCallback(
    (id, result = null) => {
      const timer = autoCloseTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        autoCloseTimers.current.delete(id);
      }

      const modal = state.modalStack.find((m) => m.id === id);
      modal?.resolve?.(result);

      dispatch({ type: 'MODAL_CLOSE', payload: id });
    },
    [state.modalStack]
  );

  const closeAllModals = useCallback(() => {
    autoCloseTimers.current.forEach((timer) => clearTimeout(timer));
    autoCloseTimers.current.clear();
    state.modalStack.forEach((m) => m.resolve?.(null));
    dispatch({ type: 'MODAL_CLOSE_ALL' });
  }, [state.modalStack]);

  const openModal = useCallback(
    (config) => {
      return new Promise((resolve) => {
        const id = generateId();
        const modal = {
          id,
          ...config,
          resolve,
          // Forward the real result the modal component passes (e.g. true/
          // false from Confirm, the typed value from Prompt) through to the
          // promise, via closeModal — not a bare dispatch.
          onClose: (result = null) => closeModal(id, result),
          onEscape: config.onEscape || (() => closeModal(id, null)),
        };

        if (state.modalStack.length === 0) lockBodyScroll();
        dispatch({ type: 'MODAL_OPEN', payload: modal });

        if (config.autoClose && config.type === 'alert') {
          const timer = setTimeout(() => {
            closeModal(id, null);
          }, config.duration || DEFAULT_AUTO_CLOSE_DELAY);
          autoCloseTimers.current.set(id, timer);
        }
      });
    },
    [state.modalStack.length, closeModal]
  );

  // ============================================================
  // Alert System
  // ============================================================
  const alert = useCallback((options) => openModal({ type: 'alert', ...options }), [openModal]);
  const success = useCallback((options) => alert({ variant: 'success', ...options }), [alert]);
  const error = useCallback((options) => alert({ variant: 'error', ...options }), [alert]);
  const warning = useCallback((options) => alert({ variant: 'warning', ...options }), [alert]);
  const info = useCallback((options) => alert({ variant: 'info', ...options }), [alert]);

  // ============================================================
  // Toast System
  // ============================================================
  const toast = useCallback((options) => {
    return new Promise((resolve) => {
      const id = generateId();
      const toastItem = {
        id,
        ...options,
        resolve,
        onClose: (result = null) => {
          dispatch({ type: 'TOAST_HIDE', payload: id });
          resolve(result);
        },
      };

      dispatch({ type: 'TOAST_SHOW', payload: toastItem });

      if (options.autoClose !== false) {
        const timer = setTimeout(() => {
          dispatch({ type: 'TOAST_HIDE', payload: id });
          resolve(null);
        }, options.duration || DEFAULT_AUTO_CLOSE_DELAY);
        autoCloseTimers.current.set(id, timer);
      }
    });
  }, []);

  // ============================================================
  // Confirm / Prompt / Sheet
  // ============================================================
  const confirm = useCallback((options) => openModal({ type: 'confirm', ...options }), [openModal]);
  const prompt = useCallback((options) => openModal({ type: 'prompt', ...options }), [openModal]);
  const sheet = useCallback((options) => openModal({ type: 'sheet', ...options }), [openModal]);

  // ============================================================
  // Loading System
  // ============================================================
  const showLoading = useCallback((message = 'Loading...', type = 'page') => {
    const id = generateId();
    dispatch({ type: 'LOADING_SHOW', payload: { id, message, type } });
    return id;
  }, []);

  const hideLoading = useCallback(
    (id) => {
      if (!id) {
        const lastItem = state.loadingQueue[state.loadingQueue.length - 1];
        if (lastItem) dispatch({ type: 'LOADING_HIDE', payload: lastItem.id });
        return;
      }
      dispatch({ type: 'LOADING_HIDE', payload: id });
    },
    [state.loadingQueue]
  );

  const clearAllLoading = useCallback(() => dispatch({ type: 'LOADING_CLEAR' }), []);

  const withLoading = useCallback(
    async (fn, loadingMessage = 'Loading...') => {
      const id = showLoading(loadingMessage);
      try {
        const result = await fn();
        hideLoading(id);
        return result;
      } catch (err) {
        hideLoading(id);
        throw err;
      }
    },
    [showLoading, hideLoading]
  );

  // ============================================================
  // Progress System
  // ============================================================
  const startProgress = useCallback((message = 'Loading...') => {
    const id = generateId();
    dispatch({ type: 'PROGRESS_START', payload: { id, message, value: 0 } });
    return id;
  }, []);

  const updateProgress = useCallback((id, value, message) => {
    if (!id) return;
    dispatch({ type: 'PROGRESS_UPDATE', payload: { id, value, message } });
  }, []);

  const finishProgress = useCallback((id) => {
    if (!id) return;
    dispatch({ type: 'PROGRESS_FINISH', payload: id });
  }, []);

  // ============================================================
  // Show Error/Success/Warning/Info
  // ============================================================
  const showError = useCallback(
    (title, message) => alert({ title: title || 'Error', message: message || 'Something went wrong.', variant: 'error', confirmText: 'OK' }),
    [alert]
  );

  const showSuccess = useCallback(
    (title, message) =>
      alert({
        title: title || 'Success',
        message: message || 'Operation completed.',
        variant: 'success',
        confirmText: 'OK',
        autoClose: true,
        duration: 3000,
      }),
    [alert]
  );

  const showWarning = useCallback(
    (title, message) => alert({ title: title || 'Warning', message: message || 'Please be careful.', variant: 'warning', confirmText: 'OK' }),
    [alert]
  );

  const showInfo = useCallback(
    (title, message) => alert({ title: title || 'Information', message: message || '', variant: 'info', confirmText: 'OK' }),
    [alert]
  );

  // ============================================================
  // Network Monitoring
  //
  // Reads/writes networkStateRef instead of closing over `state.network.*`
  // directly, so this callback's identity stays stable across network state
  // changes — otherwise the ping-interval effect below (which depends on
  // this function) would tear down and restart its setInterval every time
  // online/slow/latency changed, i.e. constantly.
  // ============================================================
  const checkNetworkLatency = useCallback(async () => {
    if (isReconnectingRef.current) {
      return networkStateRef.current.latency;
    }

    try {
      isReconnectingRef.current = true;
      dispatch({ type: 'NETWORK_RECONNECTING' });

      const start = Date.now();
      const pingController = new AbortController();
      const pingTimeoutId = setTimeout(() => pingController.abort(), 8000);
      try {
        await fetch('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          cache: 'no-cache',
          mode: 'no-cors',
          signal: pingController.signal,
        });
      } finally {
        clearTimeout(pingTimeoutId);
      }
      const latency = Date.now() - start;

      if (isMountedRef.current) {
        dispatch({ type: 'NETWORK_LATENCY', payload: latency });

        const wasSlow = networkStateRef.current.slow;
        if (latency > SLOW_NETWORK_THRESHOLD) {
          dispatch({ type: 'NETWORK_SLOW' });
          if (!wasSlow) {
            toast({ variant: 'warning', title: '⚠ Slow Network', message: 'Some operations may take longer than usual.', duration: 5000 });
          }
        } else {
          dispatch({ type: 'NETWORK_FAST' });
        }

        const wasOffline = !networkStateRef.current.online;
        if (wasOffline) {
          dispatch({ type: 'NETWORK_ONLINE' });
          reconnectAttemptRef.current = 0;

          toast({ variant: 'success', title: '✅ Connected Again', message: 'Your internet connection has been restored.', duration: 3000 });

          if (networkStateRef.current.retryQueue.length > 0) {
            processRetryQueueRef.current?.();
          }
        }

        dispatch({ type: 'NETWORK_RECONNECTED' });
      }

      return latency;
    } catch (err) {
      if (isMountedRef.current) {
        const wasOnline = networkStateRef.current.online;

        // 🔧 FIX (#1 — weak network blurs the whole app): a single
        // failed/timed-out ping to google.com does NOT reliably mean
        // "no internet" — it just as easily means one slow/flaky
        // request on an otherwise-working, merely weak connection.
        // Only trust navigator.onLine's genuine offline signal (which
        // the native 'offline' event below already handles) to flip
        // the app into full offline mode; a weak connection instead
        // just gets marked 'slow' with a toast, never the blocking
        // full-screen overlay.
        if (navigator.onLine === false) {
          dispatch({ type: 'NETWORK_OFFLINE' });
          if (wasOnline) {
            toast({ variant: 'error', title: '📡 No Internet', message: 'Please check your connection.', duration: false });
          }
        } else {
          dispatch({ type: 'NETWORK_SLOW' });
          if (!networkStateRef.current.slow) {
            toast({ variant: 'warning', title: '⚠ Unstable Connection', message: 'Your network seems slow or unstable.', duration: 5000 });
          }
        }

        dispatch({ type: 'NETWORK_RECONNECTED' });
        reconnectAttemptRef.current += 1;
      }
      return Infinity;
    } finally {
      isReconnectingRef.current = false;
    }
  }, [toast]);

  // ============================================================
  // Retry Queue Processor
  //
  // CRITICAL FIX: this used to directly mutate `state.network.retryQueue =
  // []`, bypassing the reducer entirely — React state must never be
  // mutated in place. It also re-added a failed request without removing
  // the stale copy first, so the same request could get processed twice on
  // the next pass. A ref-based re-entrancy guard replaces the mutation, and
  // failures now REMOVE the old entry before re-adding the incremented one.
  // ============================================================
  const processRetryQueue = useCallback(async () => {
    if (isProcessingRetryRef.current) return;
    if (networkStateRef.current.retryQueue.length === 0) return;
    if (!networkStateRef.current.online) return;

    isProcessingRetryRef.current = true;

    try {
      const requests = [...networkStateRef.current.retryQueue];

      for (const req of requests) {
        try {
          await req.execute();
          dispatch({ type: 'NETWORK_RETRY_REMOVE', payload: req.id });

          toast({ variant: 'success', title: '✅ Request Completed', message: `"${req.name}" has been synced successfully.`, duration: 3000 });
        } catch (err) {
          dispatch({ type: 'NETWORK_RETRY_REMOVE', payload: req.id });

          if ((req.retryCount || 0) < MAX_RETRY_COUNT) {
            dispatch({ type: 'NETWORK_RETRY_ADD', payload: { ...req, retryCount: (req.retryCount || 0) + 1 } });
          } else {
            toast({ variant: 'error', title: '❌ Sync Failed', message: `Failed to sync "${req.name}" after ${MAX_RETRY_COUNT} attempts.`, duration: 5000 });
          }
        }
      }
    } finally {
      isProcessingRetryRef.current = false;
    }
  }, [toast]);

  // processRetryQueue is referenced from inside checkNetworkLatency (which
  // is defined above it and must stay identity-stable), so it's threaded
  // through a ref rather than a direct closure reference.
  const processRetryQueueRef = useRef(processRetryQueue);
  useEffect(() => {
    processRetryQueueRef.current = processRetryQueue;
  }, [processRetryQueue]);

  // ============================================================
  // Setup Network Monitoring
  // ============================================================
  useEffect(() => {
    const initialCheck = setTimeout(() => {
      checkNetworkLatency();
    }, 1000);

    pingTimer.current = setInterval(() => {
      checkNetworkLatency();
    }, NETWORK_PING_INTERVAL);

    const handleOnline = () => {
      dispatch({ type: 'NETWORK_ONLINE' });
      checkNetworkLatency();
    };

    // The native 'offline' event only fires on a genuine online→offline
    // transition, so there's no need to re-check current state before
    // showing the toast.
    const handleOffline = () => {
      dispatch({ type: 'NETWORK_OFFLINE' });
      toast({ variant: 'error', title: '📡 No Internet', message: 'Please check your connection.', duration: false });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(initialCheck);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, [checkNetworkLatency, toast]);

  // ============================================================
  // Process retry queue when online
  // ============================================================
  useEffect(() => {
    if (state.network.online && state.network.retryQueue.length > 0) {
      const timer = setTimeout(() => {
        processRetryQueue();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [state.network.online, state.network.retryQueue.length, processRetryQueue]);

  // ============================================================
  // Request System
  // ============================================================
  const request = useCallback(
    async (config) => {
      const {
        execute,
        name = 'Request',
        showLoading: showLoadingParam = true,
        loadingMessage = 'Loading...',
        timeout = REQUEST_TIMEOUT,
        networkAware = true,
      } = config;

      const id = generateId();
      let loadingId = null;
      let progressId = null;

      try {
        if (networkAware && !state.network.online) {
          const queuedRequest = { id, name, execute, retryCount: 0, timestamp: Date.now() };
          dispatch({ type: 'NETWORK_PENDING_ADD', payload: queuedRequest });

          toast({ variant: 'warning', title: '📡 Offline Queue', message: `"${name}" will be synced when you're back online.`, duration: 4000 });

          return new Promise((resolve, reject) => {
            const retryHandler = {
              id,
              resolve,
              reject,
              execute: async () => {
                try {
                  const result = await execute();
                  resolve(result);
                } catch (err) {
                  reject(err);
                }
              },
            };
            dispatch({ type: 'NETWORK_RETRY_ADD', payload: retryHandler });
          });
        }

        if (showLoadingParam) {
          loadingId = showLoading(loadingMessage);
        }

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), timeout);
        });

        const result = await Promise.race([execute(), timeoutPromise]);

        if (loadingId) hideLoading(loadingId);
        dispatch({ type: 'NETWORK_PENDING_REMOVE', payload: id });

        return result;
      } catch (err) {
        if (loadingId) hideLoading(loadingId);
        if (progressId) finishProgress(progressId);

        if (networkAware && (err.message?.includes('network') || err.message?.includes('timeout'))) {
          const queuedRequest = { id, name, execute, retryCount: 0 };
          dispatch({ type: 'NETWORK_PENDING_ADD', payload: queuedRequest });

          toast({ variant: 'warning', title: '📡 Network Issue', message: `"${name}" will be retried automatically.`, duration: 4000 });

          return new Promise((resolve, reject) => {
            const retryHandler = {
              id,
              resolve,
              reject,
              execute: async () => {
                try {
                  const result = await execute();
                  resolve(result);
                } catch (e2) {
                  reject(e2);
                }
              },
            };
            dispatch({ type: 'NETWORK_RETRY_ADD', payload: retryHandler });
          });
        }

        showError('Operation Failed', err.message || 'Something went wrong. Please try again.');
        throw err;
      }
    },
    [state.network.online, showLoading, hideLoading, finishProgress, showError, toast]
  );

  // ============================================================
  // Utility
  // ============================================================
  const closeAll = useCallback(() => {
    closeAllModals();
    clearAllLoading();
    state.progressQueue.forEach((p) => finishProgress(p.id));
  }, [closeAllModals, clearAllLoading, finishProgress, state.progressQueue]);

  // ============================================================
  // Public API
  // ============================================================
  const feedback = useMemo(
    () => ({
      modal: { open: openModal, close: closeModal, closeAll: closeAllModals },
      alert: { show: alert, success, error, warning, info },
      toast,
      confirm,
      prompt,
      sheet,
      loading: { show: showLoading, hide: hideLoading, clear: clearAllLoading, with: withLoading },
      progress: { start: startProgress, update: updateProgress, finish: finishProgress },
      network: {
        online: state.network.online,
        slow: state.network.slow,
        latency: state.network.latency,
        reconnecting: state.network.reconnecting,
        pendingRequests: state.network.pendingRequests,
        retryQueue: state.network.retryQueue,
        checkLatency: checkNetworkLatency,
      },
      request,
      withLoading,
      showError,
      showSuccess,
      showWarning,
      showInfo,
      closeAll,
    }),
    [
      state.network.online,
      state.network.slow,
      state.network.latency,
      state.network.reconnecting,
      state.network.pendingRequests,
      state.network.retryQueue,
      openModal,
      closeModal,
      closeAllModals,
      alert,
      success,
      error,
      warning,
      info,
      toast,
      confirm,
      prompt,
      sheet,
      showLoading,
      hideLoading,
      clearAllLoading,
      withLoading,
      startProgress,
      updateProgress,
      finishProgress,
      checkNetworkLatency,
      request,
      showError,
      showSuccess,
      showWarning,
      showInfo,
      closeAll,
    ]
  );

  // ============================================================
  // Render
  // ============================================================
  return (
    <FeedbackContext.Provider value={feedback}>
      {children}

      {state.loadingQueue.map((item) => (
        <Loader key={item.id} {...item} />
      ))}

      {state.progressQueue.map((item) => (
        <Progress key={item.id} {...item} />
      ))}

      <Toast
        toasts={state.toastQueue}
        onClose={(id) => {
          const toastItem = state.toastQueue.find((t) => t.id === id);
          if (toastItem) {
            toastItem.onClose?.();
          } else {
            dispatch({ type: 'TOAST_HIDE', payload: id });
          }
        }}
      />

      {!state.network.online && (
        <NetworkOverlay
          reconnecting={state.network.reconnecting}
          lastOnline={state.network.lastOnline}
          errorMessage={state.network.slow ? 'Your connection is slow. Please wait...' : 'Please check your internet connection.'}
          onRetry={async () => {
            try {
              const latency = await checkNetworkLatency();
              if (latency < SLOW_NETWORK_THRESHOLD) {
                dispatch({ type: 'NETWORK_ONLINE' });
                if (state.network.retryQueue.length > 0) processRetryQueue();
                return true;
              }
              return false;
            } catch (err) {
              logError('Reconnection failed', err);
              return false;
            }
          }}
        />
      )}

      {state.modalStack.map((modal) => {
        switch (modal.type) {
          case 'alert':
            return <Alert key={modal.id} {...modal} />;
          case 'confirm':
            return <Confirm key={modal.id} {...modal} />;
          case 'prompt':
            return <Prompt key={modal.id} {...modal} />;
          case 'sheet':
            return <BottomSheet key={modal.id} {...modal} />;
          default:
            return <Modal key={modal.id} {...modal} />;
        }
      })}
    </FeedbackContext.Provider>
  );
};

export default FeedbackProvider;