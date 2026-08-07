// UI/Feedback/FeedbackProvider.jsx
import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useMemo  } from 'react';
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

// ============================================================
// Constants
// ============================================================
const MAX_MODAL_STACK = 5;
const DEFAULT_AUTO_CLOSE_DELAY = 3000;
const NETWORK_PING_INTERVAL = 30000; // ✅ 30 seconds (was 15)
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
    retryQueue: []
  }
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
      const modal = state.modalStack.find(m => m.id === action.payload);
      if (modal) modal.resolve?.(null);
      
      const newStack = state.modalStack.filter(m => m.id !== action.payload);
      if (newStack.length === 0) unlockBodyScroll();
      
      return { ...state, modalStack: newStack };
    }
    
    case 'MODAL_CLOSE_ALL': {
      state.modalStack.forEach(m => m.resolve?.(null));
      unlockBodyScroll();
      return { ...state, modalStack: [] };
    }
    
    case 'LOADING_SHOW': {
      return { ...state, loadingQueue: [...state.loadingQueue, action.payload] };
    }
    
    case 'LOADING_HIDE': {
      const newQueue = state.loadingQueue.filter(item => item.id !== action.payload);
      return { ...state, loadingQueue: newQueue };
    }
    
    case 'LOADING_CLEAR': {
      return { ...state, loadingQueue: [] };
    }
    
    case 'PROGRESS_START': {
      return { 
        ...state, 
        progressQueue: [...state.progressQueue, { ...action.payload, id: generateId() }] 
      };
    }
    
    case 'PROGRESS_UPDATE': {
      const newQueue = state.progressQueue.map(item => 
        item.id === action.payload.id 
          ? { ...item, value: action.payload.value, message: action.payload.message }
          : item
      );
      return { ...state, progressQueue: newQueue };
    }
    
    case 'PROGRESS_FINISH': {
      return { 
        ...state, 
        progressQueue: state.progressQueue.filter(item => item.id !== action.payload) 
      };
    }
    
    case 'TOAST_SHOW': {
      return { ...state, toastQueue: [...state.toastQueue, action.payload] };
    }
    
    case 'TOAST_HIDE': {
      return { 
        ...state, 
        toastQueue: state.toastQueue.filter(item => item.id !== action.payload) 
      };
    }

    case 'NETWORK_ONLINE': {
      const newState = {
        ...state,
        network: {
          ...state.network,
          online: true,
          reconnecting: false,
          lastOnline: Date.now()
        }
      };
      
      if (state.network.pendingRequests.length > 0) {
        const requests = [...state.network.pendingRequests];
        newState.network.pendingRequests = [];
        requests.forEach(req => {
          newState.network.retryQueue.push(req);
        });
      }
      
      return newState;
    }
    
    case 'NETWORK_OFFLINE': {
      return {
        ...state,
        network: {
          ...state.network,
          online: false,
          reconnecting: false, // ✅ false instead of true
          lastOnline: state.network.lastOnline || Date.now()
        }
      };
    }
    
    case 'NETWORK_RECONNECTING': {
      return {
        ...state,
        network: {
          ...state.network,
          reconnecting: true
        }
      };
    }
    
    case 'NETWORK_RECONNECTED': {
      return {
        ...state,
        network: {
          ...state.network,
          reconnecting: false
        }
      };
    }
    
    case 'NETWORK_SLOW': {
      return {
        ...state,
        network: {
          ...state.network,
          slow: true,
        }
      };
    }
    
    case 'NETWORK_FAST': {
      return {
        ...state,
        network: {
          ...state.network,
          slow: false,
        }
      };
    }
    
    case 'NETWORK_LATENCY': {
      return {
        ...state,
        network: {
          ...state.network,
          latency: action.payload
        }
      };
    }
    
    case 'NETWORK_PENDING_ADD': {
      return {
        ...state,
        network: {
          ...state.network,
          pendingRequests: [...state.network.pendingRequests, action.payload]
        }
      };
    }
    
    case 'NETWORK_PENDING_REMOVE': {
      return {
        ...state,
        network: {
          ...state.network,
          pendingRequests: state.network.pendingRequests.filter(
            req => req.id !== action.payload
          )
        }
      };
    }
    
    case 'NETWORK_RETRY_ADD': {
      return {
        ...state,
        network: {
          ...state.network,
          retryQueue: [...state.network.retryQueue, action.payload]
        }
      };
    }
    
    case 'NETWORK_RETRY_REMOVE': {
      return {
        ...state,
        network: {
          ...state.network,
          retryQueue: state.network.retryQueue.filter(
            req => req.id !== action.payload
          )
        }
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
  const maxReconnectAttempts = 3;

  // ✅ Sound Hook
  const sound = useSound();
  
  // ✅ Create Sound Integration
  const soundIntegration = createSoundIntegration(sound);

  // ============================================================
  // ✅ Sound Integration Helpers
  // ============================================================
  const playFeedbackSound = useCallback((type, options = {}) => {
    soundIntegration.playFeedbackSound(type, options);
  }, [soundIntegration]);

  const playSuccess = useCallback((options = {}) => {
    soundIntegration.playSuccess(options);
  }, [soundIntegration]);

  const playError = useCallback((options = {}) => {
    soundIntegration.playError(options);
  }, [soundIntegration]);

  const playWarning = useCallback((options = {}) => {
    soundIntegration.playWarning(options);
  }, [soundIntegration]);

  const playInfo = useCallback((options = {}) => {
    soundIntegration.playInfo(options);
  }, [soundIntegration]);

  const playClick = useCallback((options = {}) => {
    soundIntegration.playClick(options);
  }, [soundIntegration]);

  const playNetworkOnline = useCallback((options = {}) => {
    soundIntegration.playNetworkOnline(options);
  }, [soundIntegration]);

  const playNetworkOffline = useCallback((options = {}) => {
    soundIntegration.playNetworkOffline(options);
  }, [soundIntegration]);

  const playLoadingComplete = useCallback((options = {}) => {
    soundIntegration.playLoadingComplete(options);
  }, [soundIntegration]);

  const playLoadingError = useCallback((options = {}) => {
    soundIntegration.playLoadingError(options);
  }, [soundIntegration]);

  // ============================================================
  // Cleanup
  // ============================================================
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      autoCloseTimers.current.forEach(timer => clearTimeout(timer));
      autoCloseTimers.current.clear();
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, []);

  // ============================================================
  // Modal System
  // ============================================================
  const openModal = useCallback((config) => {
    return new Promise((resolve) => {
      const id = generateId();
      const modal = {
        id,
        ...config,
        resolve,
        onClose: (result = null) => {
          dispatch({ type: 'MODAL_CLOSE', payload: id });
        },
        onEscape: config.onEscape || (() => dispatch({ type: 'MODAL_CLOSE', payload: id }))
      };
      
      if (state.modalStack.length === 0) lockBodyScroll();
      dispatch({ type: 'MODAL_OPEN', payload: modal });
      
      if (config.autoClose && config.type === 'alert') {
        const timer = setTimeout(() => {
          dispatch({ type: 'MODAL_CLOSE', payload: id });
          autoCloseTimers.current.delete(id);
        }, config.duration || DEFAULT_AUTO_CLOSE_DELAY);
        autoCloseTimers.current.set(id, timer);
      }
    });
  }, [state.modalStack.length]);

  const closeModal = useCallback((id) => {
    const timer = autoCloseTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      autoCloseTimers.current.delete(id);
    }
    dispatch({ type: 'MODAL_CLOSE', payload: id });
  }, []);

  const closeAllModals = useCallback(() => {
    autoCloseTimers.current.forEach(timer => clearTimeout(timer));
    autoCloseTimers.current.clear();
    dispatch({ type: 'MODAL_CLOSE_ALL' });
  }, []);

  // ============================================================
  // Alert System
  // ============================================================
  const alert = useCallback((options) => {
    return openModal({
      type: 'alert',
      ...options
    });
  }, [openModal]);

  const success = useCallback((options) => {
    return alert({ variant: 'success', ...options });
  }, [alert]);

  const error = useCallback((options) => {
    return alert({ variant: 'error', ...options });
  }, [alert]);

  const warning = useCallback((options) => {
    return alert({ variant: 'warning', ...options });
  }, [alert]);

  const info = useCallback((options) => {
    return alert({ variant: 'info', ...options });
  }, [alert]);

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
        }
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
  // Confirm System
  // ============================================================
  const confirm = useCallback((options) => {
    return openModal({
      type: 'confirm',
      ...options
    });
  }, [openModal]);

  // ============================================================
  // Prompt System
  // ============================================================
  const prompt = useCallback((options) => {
    return openModal({
      type: 'prompt',
      ...options
    });
  }, [openModal]);

  // ============================================================
  // Bottom Sheet System
  // ============================================================
  const sheet = useCallback((options) => {
    return openModal({
      type: 'sheet',
      ...options
    });
  }, [openModal]);

  // ============================================================
  // Loading System
  // ============================================================
  const showLoading = useCallback((message = 'Loading...', type = 'page') => {
    const id = generateId();
    dispatch({ type: 'LOADING_SHOW', payload: { id, message, type } });
    return id;
  }, []);

  const hideLoading = useCallback((id) => {
    if (!id) {
      const lastItem = state.loadingQueue[state.loadingQueue.length - 1];
      if (lastItem) {
        dispatch({ type: 'LOADING_HIDE', payload: lastItem.id });
      }
      return;
    }
    dispatch({ type: 'LOADING_HIDE', payload: id });
  }, [state.loadingQueue]);

  const clearAllLoading = useCallback(() => {
    dispatch({ type: 'LOADING_CLEAR' });
  }, []);

  const withLoading = useCallback(async (fn, loadingMessage = 'Loading...') => {
    const id = showLoading(loadingMessage);
    try {
      const result = await fn();
      hideLoading(id);
      return result;
    } catch (error) {
      hideLoading(id);
      throw error;
    }
  }, [showLoading, hideLoading]);

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
  const showError = useCallback((title, message) => {
    return alert({
      title: title || 'Error',
      message: message || 'Something went wrong.',
      variant: 'error',
      confirmText: 'OK'
    });
  }, [alert]);

  const showSuccess = useCallback((title, message) => {
    return alert({
      title: title || 'Success',
      message: message || 'Operation completed.',
      variant: 'success',
      confirmText: 'OK',
      autoClose: true,
      duration: 3000
    });
  }, [alert]);

  const showWarning = useCallback((title, message) => {
    return alert({
      title: title || 'Warning',
      message: message || 'Please be careful.',
      variant: 'warning',
      confirmText: 'OK'
    });
  }, [alert]);

  const showInfo = useCallback((title, message) => {
    return alert({
      title: title || 'Information',
      message: message || '',
      variant: 'info',
      confirmText: 'OK'
    });
  }, [alert]);

  // ============================================================
  // Network Monitoring - OPTIMIZED
  // ============================================================
  const checkNetworkLatency = useCallback(async () => {
    // ✅ Prevent multiple simultaneous checks
    if (isReconnectingRef.current) {
      return state.network.latency;
    }
    
    try {
      isReconnectingRef.current = true;
      dispatch({ type: 'NETWORK_RECONNECTING' });
      
      const start = Date.now();
      await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        mode: 'no-cors'
      });
      const latency = Date.now() - start;
      
      if (isMountedRef.current) {
        dispatch({ type: 'NETWORK_LATENCY', payload: latency });
        
        if (latency > SLOW_NETWORK_THRESHOLD) {
          dispatch({ type: 'NETWORK_SLOW' });
          
          if (!state.network.slow) {
            toast({
              variant: 'warning',
              title: '⚠ Slow Network',
              message: 'Some operations may take longer than usual.',
              duration: 5000
            });
          }
        } else {
          dispatch({ type: 'NETWORK_FAST' });
        }
        
        // ✅ Only dispatch online if we were offline
        if (!state.network.online) {
          dispatch({ type: 'NETWORK_ONLINE' });
          reconnectAttemptRef.current = 0;
          
          toast({
            variant: 'success',
            title: '✅ Connected Again',
            message: 'Your internet connection has been restored.',
            duration: 3000
          });
          
          // Process retry queue
          if (state.network.retryQueue.length > 0) {
            processRetryQueue();
          }
        }
        
        dispatch({ type: 'NETWORK_RECONNECTED' });
      }
      
      return latency;
      
    } catch (error) {
      if (isMountedRef.current) {
        dispatch({ type: 'NETWORK_OFFLINE' });
        dispatch({ type: 'NETWORK_RECONNECTED' });
        
        reconnectAttemptRef.current += 1;
        
        // ✅ Only show toast once
        if (state.network.online) {
          toast({
            variant: 'error',
            title: '📡 No Internet',
            message: 'Please check your connection.',
            duration: false
          });
        }
      }
      return Infinity;
      
    } finally {
      isReconnectingRef.current = false;
    }
  }, [state.network.online, state.network.slow, state.network.retryQueue.length, toast]);

  // ============================================================
  // Retry Queue Processor
  // ============================================================
  const processRetryQueue = useCallback(async () => {
    if (state.network.retryQueue.length === 0) return;
    if (!state.network.online) return;
    
    const requests = [...state.network.retryQueue];
    state.network.retryQueue = [];
    
    for (const req of requests) {
      try {
        await req.execute();
        dispatch({ type: 'NETWORK_RETRY_REMOVE', payload: req.id });
        
        toast({
          variant: 'success',
          title: '✅ Request Completed',
          message: `"${req.name}" has been synced successfully.`,
          duration: 3000
        });
      } catch (error) {
        if (req.retryCount < MAX_RETRY_COUNT) {
          dispatch({ 
            type: 'NETWORK_RETRY_ADD', 
            payload: { ...req, retryCount: (req.retryCount || 0) + 1 } 
          });
        } else {
          toast({
            variant: 'error',
            title: '❌ Sync Failed',
            message: `Failed to sync "${req.name}" after ${MAX_RETRY_COUNT} attempts.`,
            duration: 5000
          });
        }
      }
    }
  }, [state.network.retryQueue, state.network.online, toast]);

  // ============================================================
  // Setup Network Monitoring - OPTIMIZED
  // ============================================================
  useEffect(() => {
    // ✅ Initial check with delay to prevent immediate re-render
    const initialCheck = setTimeout(() => {
      checkNetworkLatency();
    }, 1000);
    
    // ✅ Ping interval - less frequent
    pingTimer.current = setInterval(() => {
      checkNetworkLatency();
    }, NETWORK_PING_INTERVAL);
    
    const handleOnline = () => {
      dispatch({ type: 'NETWORK_ONLINE' });
      checkNetworkLatency();
    };
    
    const handleOffline = () => {
      dispatch({ type: 'NETWORK_OFFLINE' });
      
      // ✅ Only show toast if was online
      if (state.network.online) {
        toast({
          variant: 'error',
          title: '📡 No Internet',
          message: 'Please check your connection.',
          duration: false
        });
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      clearTimeout(initialCheck);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, [checkNetworkLatency, toast, state.network.online]);

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
  const request = useCallback(async (config) => {
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
        const queuedRequest = {
          id,
          name,
          execute,
          retryCount: 0,
          timestamp: Date.now()
        };
        dispatch({ type: 'NETWORK_PENDING_ADD', payload: queuedRequest });
        
        toast({
          variant: 'warning',
          title: '📡 Offline Queue',
          message: `"${name}" will be synced when you're back online.`,
          duration: 4000
        });
        
        return new Promise((resolve, reject) => {
          const retryHandler = {
            id,
            resolve,
            reject,
            execute: async () => {
              try {
                const result = await execute();
                resolve(result);
              } catch (error) {
                reject(error);
              }
            }
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

      const result = await Promise.race([
        execute(),
        timeoutPromise
      ]);

      if (loadingId) {
        hideLoading(loadingId);
      }

      dispatch({ type: 'NETWORK_PENDING_REMOVE', payload: id });

      return result;

    } catch (error) {
      if (loadingId) hideLoading(loadingId);
      if (progressId) finishProgress(progressId);

      if (networkAware && (error.message?.includes('network') || error.message?.includes('timeout'))) {
        const queuedRequest = {
          id,
          name,
          execute,
          retryCount: 0
        };
        dispatch({ type: 'NETWORK_PENDING_ADD', payload: queuedRequest });
        
        toast({
          variant: 'warning',
          title: '📡 Network Issue',
          message: `"${name}" will be retried automatically.`,
          duration: 4000
        });
        
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
            }
          };
          dispatch({ type: 'NETWORK_RETRY_ADD', payload: retryHandler });
        });
      }

      showError(
        'Operation Failed',
        error.message || 'Something went wrong. Please try again.'
      );

      throw error;
    }
  }, [state.network.online, showLoading, hideLoading, startProgress, updateProgress, finishProgress, showError, toast]);

  // ============================================================
  // Utility
  // ============================================================
  const closeAll = useCallback(() => {
    closeAllModals();
    clearAllLoading();
    state.progressQueue.forEach(p => finishProgress(p.id));
  }, [closeAllModals, clearAllLoading, finishProgress, state.progressQueue]);

  // ============================================================
  // Public API
  // ============================================================
// ============================================================
// ✅ Public API - useMemo দিয়ে stabilize করুন
// ============================================================

  // ============================================================
  // ✅ Public API - useMemo দিয়ে stabilize করুন
  // ============================================================
  const feedback = useMemo(() => ({
    modal: {
      open: openModal,
      close: closeModal,
      closeAll: closeAllModals,
    },
    alert: {
      show: alert,
      success,
      error,
      warning,
      info,
    },
    toast,
    confirm,
    prompt,
    sheet,
    loading: {
      show: showLoading,
      hide: hideLoading,
      clear: clearAllLoading,
      with: withLoading,
    },
    progress: {
      start: startProgress,
      update: updateProgress,
      finish: finishProgress,
    },
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
  }), [
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
  ]);

  // ============================================================
  // ✅ Render
  // ============================================================
  return (
    <FeedbackContext.Provider value={feedback}>
      {children}
      
      {/* Loading Queue */}
      {state.loadingQueue.map((item) => (
        <Loader key={item.id} {...item} />
      ))}
      
      {/* Progress Queue */}
      {state.progressQueue.map((item) => (
        <Progress key={item.id} {...item} />
      ))}
      
      {/* Toast Queue */}
      <Toast 
        toasts={state.toastQueue} 
        onClose={(id) => {
          const toastItem = state.toastQueue.find(t => t.id === id);
          if (toastItem) {
            toastItem.onClose?.();
          } else {
            dispatch({ type: 'TOAST_HIDE', payload: id });
          }
        }} 
      />
      
      {/* Network Overlay */}
      {!state.network.online && (
        <NetworkOverlay 
          reconnecting={state.network.reconnecting}
          lastOnline={state.network.lastOnline}
          errorMessage={
            state.network.slow 
              ? 'Your connection is slow. Please wait...' 
              : 'Please check your internet connection.'
          }
          onRetry={async () => {
            try {
              const latency = await checkNetworkLatency();
              if (latency < SLOW_NETWORK_THRESHOLD) {
                dispatch({ type: 'NETWORK_ONLINE' });
                if (state.network.retryQueue.length > 0) {
                  processRetryQueue();
                }
                return true;
              }
              return false;
            } catch (error) {
              console.error('Reconnection failed:', error);
              return false;
            }
          }}
        />
      )}
      
      {/* Modal Stack */}
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