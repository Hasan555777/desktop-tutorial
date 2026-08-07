// src/main.jsx - সম্পূর্ণ ফিক্সড ভার্সন

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './index.css';

// ============================================================
// 📌 Constants
// ============================================================
const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;

// ============================================================
// ✅ Service Worker Registration
// ============================================================
const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    if (isDevelopment) console.log('ℹ️ Service Worker not supported');
    return;
  }

  if (!isProduction) {
    if (isDevelopment) console.log('ℹ️ Service Worker skipped in development mode');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    if (isDevelopment) {
      console.log('✅ Service Worker registered:', registration);
    }

    if (registration) {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        if (isDevelopment) console.log('🔄 New Service Worker installing...');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            if (isDevelopment) console.log('🔄 New version available!');
            
            window.dispatchEvent(new CustomEvent('pwa-update-available', {
              detail: { registration, newWorker }
            }));
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (isDevelopment) console.log('🔄 Service Worker controller changed');
      });
    }

    return registration;

  } catch (error) {
    console.error('❌ Service Worker registration failed:', error);
  }
};

// ============================================================
// ✅ PWA Install Handling - COMPLETELY FIXED ✅
// ============================================================
let deferredPrompt = null;

const checkPWAInstall = () => {
  // ✅ beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📱 beforeinstallprompt event fired in main.jsx');
    
    // ✅ Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    
    // ✅ Store the event for later use
    deferredPrompt = e;
    
    // ✅ Also store on window for global access
    window.deferredPrompt = e;
    
    if (isDevelopment) {
      console.log('📥 PWA install prompt available');
      console.log('📥 deferredPrompt saved:', !!e);
    }
    
    // ✅ Dispatch custom event for install banner
    window.dispatchEvent(new CustomEvent('pwa-install-available', {
      detail: { deferredPrompt: e }
    }));
  });

  // ✅ appinstalled event
  window.addEventListener('appinstalled', () => {
    console.log('✅ PWA installed successfully!');
    
    // ✅ Clear the deferred prompt
    deferredPrompt = null;
    window.deferredPrompt = null;
    
    // ✅ Dispatch custom event
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });

  // ✅ ✅ ✅ REMOVED: setIsInstallable - এটি main.jsx-এ নেই
  // if (window.deferredPrompt) {
  //   console.log('📱 Found existing deferredPrompt on window');
  //   deferredPrompt = window.deferredPrompt;
  //   setIsInstallable(true); // ❌ এই লাইনটি সরান!
  // }
};

// ============================================================
// ✅ PWA Status Check
// ============================================================
const checkPWAStatus = () => {
  const isStandalone = 
    window.matchMedia && 
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) {
    if (isDevelopment) console.log('📱 App running in standalone mode (PWA)');
    window.dispatchEvent(new CustomEvent('pwa-standalone'));
  }

  if ('serviceWorker' in navigator) {
    if (isDevelopment) console.log('✅ Service Worker is supported');
  }
};

// ============================================================
// ✅ Manually trigger install (for testing)
// ============================================================
const triggerInstall = async () => {
  console.log('🔧 Manual install triggered');
  
  const prompt = deferredPrompt || window.deferredPrompt;
  
  if (!prompt) {
    console.warn('❌ No deferredPrompt available');
    console.warn('💡 Try refreshing the page or opening in Chrome/Edge');
    return { success: false, reason: 'no_prompt' };
  }

  try {
    console.log('📱 Showing install prompt...');
    await prompt.prompt();
    const result = await prompt.userChoice;
    console.log('📱 User choice:', result);
    
    if (result.outcome === 'accepted') {
      console.log('✅ User accepted install');
      deferredPrompt = null;
      window.deferredPrompt = null;
      return { success: true, outcome: 'accepted' };
    } else {
      console.log('❌ User dismissed install');
      return { success: false, outcome: 'dismissed' };
    }
  } catch (error) {
    console.error('❌ Install error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// ✅ Check PWA Status (Debug)
// ============================================================
const checkPWAStatusDebug = () => {
  console.log('📱 PWA Status:', {
    hasDeferredPrompt: !!deferredPrompt,
    hasWindowPrompt: !!window.deferredPrompt,
    isStandalone: window.matchMedia('(display-mode: standalone)').matches,
    isSWSupported: 'serviceWorker' in navigator,
    isProduction,
    isDevelopment,
  });
};

// ============================================================
// ✅ Register SW on Window Load
// ============================================================
const initPWA = () => {
  checkPWAStatus();
  checkPWAInstall();
  
  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', () => {
      setTimeout(registerServiceWorker, 100);
    });
  }
};

// ============================================================
// ✅ Render App
// ============================================================
const root = document.getElementById('root');

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
} else {
  console.error('❌ Root element not found!');
}

// ============================================================
// ✅ Initialize PWA
// ============================================================
initPWA();

// ============================================================
// ✅ ✅ ✅ Expose for debugging (সব মোডে কাজ করবে)
// ============================================================
window.__PWA = {
  deferredPrompt,
  registerServiceWorker,
  triggerInstall,
  isProduction,
  isDevelopment,
  checkStatus: checkPWAStatusDebug,
};

console.log('🔧 Debug: Run window.__PWA.checkStatus() to check PWA status');
console.log('🔧 Debug: Run window.__PWA.triggerInstall() to test install');

// ============================================================
// ✅ Export for use in other files
// ============================================================
export { deferredPrompt, triggerInstall };