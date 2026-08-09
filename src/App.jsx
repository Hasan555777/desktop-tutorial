// App.js - সম্পূর্ণ আপডেটেড

import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  where, 
  updateDoc,
  doc
} from 'firebase/firestore';

// ===== Hooks =====
import { useBiometric } from '@/hooks/useBiometric';
import { useAppLock } from '@/hooks/useAppLock';
import AppLockScreen from '@/components/AppLock/AppLockScreen';
import { useSessionLock } from '@/hooks/useSessionLock';
import { device } from '@/security/device';

// ===== Context =====
import { NavigationProvider } from '@/components/Navigation';

// ===== UI System =====
import './components/LockScreen.css';
import { 
  FeedbackProvider,
  useFeedback 
} from './UI/Feedback/FeedbackProvider';
import { useAuth } from '@/context/AuthContext';
import { SoundProvider } from '@/UI/Sound';
import { NotificationProvider } from '@/UI/Notification/NotificationProvider';
import NotificationBanner from '@/components/NotificationBanner/NotificationBanner';
import { LayoutProvider, useLayout } from "./context/LayoutContext";
import DevSoundTest from './pages/DevSoundTest';


// ===== Pages =====
import Settings from './pages/Settings/index';
import UserProfilePage from './pages/UserProfilePage';
import VerifyEmail from './pages/VerifyEmail';
import PrivateRoute from './components/PrivateRoute';
import VerifyPending from './pages/VerifyPending';
import VerifyRejected from './pages/VerifyRejected';
import BlockedPage from './pages/BlockedPage';
import FloatingFeedbackButton from './components/FloatingFeedbackButton/FloatingFeedbackButton';
import SavedJobsPage from './pages/SavedJobsPage';
import { PostProvider } from './pages/PostContext';
import AdminDashboard from './pages/Admin/AdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Navbar from "./pages/Navbar";
import Inbox from './pages/Inbox';
import Notifications from './pages/Notifications';
import DealManager from './pages/DealManager';
import Profile from './pages/profile/Profile';
import Withdraw from './pages/Withdraw';
import Transactions from './pages/Transactions';
import PaymentGateway from './pages/PaymentGateway';
import Wallet from './pages/Wallet';
import Deposit from './pages/Deposit';
import ProfileCard from './pages/ProfileCard';
import SendMoney from './pages/SendMoney';
import BankAccount from './pages/BankAccount';
import PaymentHistory from './pages/PaymentHistory';
import Referral from './pages/Referral';

// ===== FCM =====
import { messaging } from './firebase';
import { getToken, onMessage } from 'firebase/messaging';

// ===== Announcement =====
import AnnouncementPopup from '@/components/AnnouncementPopup/AnnouncementPopup';
import { useAnnouncement } from '@/hooks/useAnnouncement';
import './App.css';

// ============================================================
// ✅ Constants
// ============================================================
const NOTIFICATION_SETTINGS_KEY = 'workhub_notification_settings';

// লগআউটে যেসব localStorage key মুছে ফেলা উচিত (theme/notification prefs রাখা হবে)
const AUTH_SCOPED_LOCAL_KEYS = ['currentMode', 'activeTab', 'activeChat'];

const getNotificationSettings = () => {
  try {
    const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading notification settings:', e);
  }
  return null;
};

// ============================================================
// ✅ Inner App Component
// ============================================================
const AppContent = () => {
  const { hideBottomNav } = useLayout();
  const feedback = useFeedback();
  const navigate = useNavigate();
  
  // ── Auth ──
  const { currentUser, loading: authLoading } = useAuth();
  
  // ── Security Hooks (একবারই) ──
  const biometric = useBiometric();
  const appLock = useAppLock();
  
  // ── Destructure ──
  const {
    isSupported: isBiometricSupported,
    isAvailable: isBiometricAvailable,
    isEnabled: isBiometricEnabled,
    biometricType,
    authenticate: biometricAuthenticate,
    toggle: toggleBiometric,
  } = biometric;

  const {
    isEnabled: isAppLockEnabled,
    isLoading: appLockSettingsLoading, // ✅ For initial load
    toggle: toggleAppLock,
    changePin: changeAppLockPin, // ✅ New - PIN change without disabling
  } = appLock;

  // ── Refs ──
  const feedbackRef = useRef(feedback);
  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  // ── States (Unique) ──
  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== 'light';
  });

  // ✅ FIX: Initial lock state - default to true until we know
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const hasCheckedInitialLock = useRef(false);
  

  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [localLoading, setLocalLoading] = useState(true);
  
  // ✅ Updated loading - wait for app lock settings
  const loading = authLoading || localLoading || (!!currentUser && appLockSettingsLoading);

  // ✅ Session Lock
  const { manualLock, resetSession } = useSessionLock({
    enabled: isAppLockEnabled,
    unlocked: isAppUnlocked,
    onLock: () => {
      console.log('🔒 Auto-lock triggered');
      setIsAppUnlocked(false);
    },
    idleTimeout: 5 * 60 * 1000,
    backgroundTimeout: 30 * 1000,
    lockOnTabChange: true,
    lockOnBrowserClose: true,
  });

  // ── Notification Settings ──
  const [notificationSettingsLoaded, setNotificationSettingsLoaded] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState(null);

  // ── App State ──
  const [deals, setDeals] = useState([]);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 768);
  const [currentMode, setCurrentMode] = useState(() => {
    const saved = localStorage.getItem('currentMode');
    return saved || 'seller';
  });
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'dashboard';
  });
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [chats, setChats] = useState([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [activeChatContext, setActiveChatContext] = useState(() => {
    const savedChat = localStorage.getItem('activeChat');
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        return parsed.fullData || parsed;
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [securityData, setSecurityData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false
  });

  const [fcmToken, setFcmToken] = useState(null);

  // ── Refs ──
  const unsubscribeRefs = useRef({
    deals: null,
    posts: null,
    notifications: null,
    chats: null
  });
  const isMountedRef = useRef(true);
  const userId = currentUser?.uid;

  // ── Announcement ──
  const {
    announcement,
    showPopup,
    loading: announcementLoading,
    dismiss,
    dismissForever,
    refresh
  } = useAnnouncement();

  // ============================================================
  // ✅ App Lock Initial Check - CRITICAL FIX
  // ============================================================

  useLayoutEffect(() => {
    if (!currentUser) {
      setIsAppUnlocked(false);
      hasCheckedInitialLock.current = false;
      return;
    }

    // Wait for app lock settings to load
    if (appLockSettingsLoading) {
      return;
    }

    // First time check - fresh page load
    if (!hasCheckedInitialLock.current) {
      hasCheckedInitialLock.current = true;
      const shouldBeUnlocked = !isAppLockEnabled;
      console.log(`🔐 Initial lock check: enabled=${isAppLockEnabled}, unlocked=${shouldBeUnlocked}`);
      setIsAppUnlocked(shouldBeUnlocked);
      
      // If unlocked, reset session timer
      if (shouldBeUnlocked) {
        resetSession();
      }
    } 
  }, [currentUser, appLockSettingsLoading, isAppLockEnabled, isAppUnlocked, resetSession]);

  // ============================================================
  // ✅ Notification Functions
  // ============================================================

  const arePushNotificationsEnabled = useCallback(() => {
    if (!notificationPrefs) return true;
    return notificationPrefs.pushNotifications !== false;
  }, [notificationPrefs]);

  const isNotificationTypeEnabled = useCallback((type) => {
    if (!notificationPrefs) return true;
    const keyMap = {
      'message': 'messageNotifications',
      'deal': 'dealUpdates',
      'wallet': 'walletNotifications',
      'admin': 'adminNotifications',
      'review': 'reviewNotifications',
      'verification': 'verificationNotifications',
      'system': 'systemNotifications',
    };
    const key = keyMap[type] || type;
    return notificationPrefs[key] !== false;
  }, [notificationPrefs]);

  // ============================================================
  // ✅ Device Tracking
  // ============================================================

  useEffect(() => {
    const trackDevice = async () => {
      if (!currentUser) return;
      const deviceInfo = await device.getCurrentDevice();
      const isTrusted = await device.isTrusted();
      
      console.log('📱 Device Info:', deviceInfo);
      console.log('🔒 Is Trusted:', isTrusted);
      
      device.updateLastActive();
    };
    
    trackDevice();
  }, [currentUser]);

  // ============================================================
  // ✅ Security Checkup
  // ============================================================

  const handleSecurityCheckup = useCallback(() => {
    const checks = {
      password: securityData?.newPassword?.length >= 8,
      twoFactor: securityData?.twoFactorEnabled || false,
      biometric: isBiometricEnabled,
      appLock: isAppLockEnabled,
    };

    const allSecure = Object.values(checks).every(v => v === true);
    const insecureCount = Object.values(checks).filter(v => v === false).length;

    if (allSecure) {
      feedback?.showSuccess('🛡️ নিরাপদ', 'আপনার অ্যাকাউন্ট সম্পূর্ণ নিরাপদ!');
    } else {
      feedback?.showWarning('⚠️ সতর্কতা', `${insecureCount} টি নিরাপত্তা ব্যবস্থা নিষ্ক্রিয় আছে।`);
    }
  }, [securityData, isBiometricEnabled, isAppLockEnabled, feedback]);

  // ============================================================
  // ✅ Notification Settings Load
  // ============================================================

  useEffect(() => {
    const settings = getNotificationSettings();
    if (settings) {
      setNotificationPrefs(settings);
    }
    setNotificationSettingsLoaded(true);
    setLocalLoading(false);
  }, []);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === NOTIFICATION_SETTINGS_KEY) {
        const newSettings = getNotificationSettings();
        setNotificationPrefs(newSettings);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // ============================================================
  // ✅ Theme
  // ============================================================

  const toggleTheme = useCallback(() => {
    const newMode = !isDark;
    setIsDark(newMode);
    if (!newMode) {
      document.documentElement.classList.add('light-mode');
      document.documentElement.classList.remove('dark-mode');
    } else {
      document.documentElement.classList.add('dark-mode');
      document.documentElement.classList.remove('light-mode');
    }
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark-mode');
      html.classList.remove('light-mode');
    } else {
      html.classList.add('light-mode');
      html.classList.remove('dark-mode');
    }
  }, [isDark]);

  // ============================================================
  // ✅ FCM
  // ============================================================

  useEffect(() => {
    const initFCM = async () => {
      if (!currentUser) return;
      try {
        const messagingInstance = await messaging;
        if (!messagingInstance) return;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const token = await getToken(messagingInstance, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        });
        if (token) {
          console.log("✅ FCM Token:", token);
          setFcmToken(token);
        }
      } catch (error) {
        console.error("❌ FCM initialization failed:", error);
      }
    };
    initFCM();
  }, [currentUser]);

  useEffect(() => {
    const saveFCMToken = async () => {
      if (!currentUser?.uid || !fcmToken) return;
      try {
        await updateDoc(
          doc(db, "users", currentUser.uid),
          {
            fcmToken: fcmToken,
            fcmUpdatedAt: new Date().toISOString()
          }
        );
      } catch (error) {
        console.error("❌ Failed to save FCM token:", error);
      }
    };
    saveFCMToken();
  }, [currentUser?.uid, fcmToken]);

  useEffect(() => {
    let unsubscribe;
    const initForegroundListener = async () => {
      try {
        const messagingInstance = await messaging;
        if (!messagingInstance) return;
        unsubscribe = onMessage(messagingInstance, (payload) => {
          feedbackRef.current?.toast?.({
            variant: "info",
            title: payload.notification?.title || "WorkTrustbd",
            message: payload.notification?.body || "You have a new notification.",
            duration: 6000,
          });
        });
      } catch (err) {
        console.error("❌ onMessage Error:", err);
      }
    };
    initForegroundListener();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ============================================================
  // ✅ Cleanup
  // ============================================================

  const cleanupAllListeners = useCallback(() => {
    Object.keys(unsubscribeRefs.current).forEach(key => {
      if (unsubscribeRefs.current[key]) {
        unsubscribeRefs.current[key]();
        unsubscribeRefs.current[key] = null;
      }
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupAllListeners();
    };
  }, [cleanupAllListeners]);

  // ============================================================
  // ✅ All Deals Fetching
  // ============================================================

  useEffect(() => {
    if (!currentUser?.uid) {
      setDeals([]);
      return;
    }
    
    if (unsubscribeRefs.current.deals) {
      unsubscribeRefs.current.deals();
      unsubscribeRefs.current.deals = null;
    }
    
    const q = query(
      collection(db, 'deals'),
      where('participants', 'array-contains', currentUser.uid)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isMountedRef.current) return;
      
      const fetchedDeals = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDeals(fetchedDeals);
    }, (error) => {
      console.error("Error fetching deals:", error);
      if (isMountedRef.current) {
        setDeals([]);
      }
    });
    
    unsubscribeRefs.current.deals = unsubscribe;
    
    return () => {
      if (unsubscribeRefs.current.deals) {
        unsubscribeRefs.current.deals();
        unsubscribeRefs.current.deals = null;
      }
    };
  }, [currentUser?.uid]);

  const pendingDealsCount = useMemo(() => {
    if (!currentUser?.uid) return 0;
    if (!isNotificationTypeEnabled('deal')) return 0;
    return deals.filter(d => d.status === 'pending').length;
  }, [deals, currentUser?.uid, isNotificationTypeEnabled]);

  // ============================================================
  // PWA Install Prompt
  // ============================================================

  useEffect(() => {
    let installInProgress = false;
    let installPromptShown = false;

    const showInstallBanner = async (prompt) => {
      if (installInProgress) return;
      if (installPromptShown) return;
      
      installInProgress = true;
      installPromptShown = true;

      try {
        const shouldInstall = await feedbackRef.current?.confirm?.({
          title: "📱 Install WorkTrustbd",
          message: "Install WorkTrustbd on your device for a faster, offline-ready experience.",
          confirmText: "Install Now",
          cancelText: "Later",
          variant: "info"
        });

        if (!shouldInstall) {
          console.log("❌ User declined install from dialog");
          installInProgress = false;
          return;
        }

        console.log("📱 Showing install prompt...");
        
        await prompt.prompt();
        
        const choiceResult = await prompt.userChoice;
        console.log("📱 User choice:", choiceResult);
        
        if (choiceResult.outcome === 'accepted') {
          console.log("✅ User accepted install");
          feedbackRef.current?.showSuccess?.(
            "✅ Installed",
            "WorkTrustbd installed successfully!",
            "INSTALL_SUCCESS"
          );
        } else {
          console.log("❌ User dismissed install");
          feedbackRef.current?.showInfo?.(
            "⏭️ Skipped",
            "You can install later from the browser menu."
          );
        }
      } catch (error) {
        console.error("❌ Install error:", error);
        feedbackRef.current?.showError?.(
          "❌ Failed",
          "Could not install the app. Please try again."
        );
      } finally {
        installInProgress = false;
        window.deferredPrompt = null;
        
        setTimeout(() => {
          installPromptShown = false;
        }, 5 * 60 * 1000);
      }
    };

    const handleInstallAvailable = (event) => {
      console.log("📲 Install Prompt Ready");
      
      const prompt = event?.detail?.deferredPrompt || window.deferredPrompt;
      
      if (!prompt) {
        console.log("⏳ No deferredPrompt available yet");
        return;
      }

      console.log("📱 DeferredPrompt available!");
      
      setTimeout(() => {
        showInstallBanner(prompt);
      }, 2000);
    };

    const handleInstalled = () => {
      console.log("✅ App installed!");
      window.deferredPrompt = null;
      
      feedbackRef.current?.toast?.({
        variant: "success",
        title: "✅ Installed",
        message: "WorkTrustbd installed successfully.",
        duration: 5000
      });
    };

    const handleUpdateAvailable = () => {
      console.log("🔄 Update available!");
    };

    window.addEventListener("pwa-install-available", handleInstallAvailable);
    window.addEventListener("pwa-installed", handleInstalled);
    window.addEventListener("pwa-update-available", handleUpdateAvailable);

    if (window.deferredPrompt) {
      console.log("📱 Found existing deferredPrompt on load");
      setTimeout(() => {
        handleInstallAvailable({ detail: { deferredPrompt: window.deferredPrompt } });
      }, 1000);
    }

    return () => {
      window.removeEventListener("pwa-install-available", handleInstallAvailable);
      window.removeEventListener("pwa-installed", handleInstalled);
      window.removeEventListener("pwa-update-available", handleUpdateAvailable);
    };
  }, []);

  // ============================================================
  // New Update Available
  // ============================================================

  useEffect(() => {
    const handleUpdate = async () => {
      const yes = await feedbackRef.current?.confirm?.({
        title: "New Update",
        message: "A new version of WorkTrustbd is available.",
        confirmText: "Update",
        cancelText: "Later"
      });

      if (yes) {
        window.location.reload();
      }
    };

    window.addEventListener("pwa-update-available", handleUpdate);

    return () => {
      window.removeEventListener("pwa-update-available", handleUpdate);
    };
  }, []);

  // ============================================================
  // ✅ Posts Fetching
  // ============================================================

  useEffect(() => {
    if (!currentUser) {
      setPostsLoading(false);
      return;
    }

    if (unsubscribeRefs.current.posts) {
      unsubscribeRefs.current.posts();
      unsubscribeRefs.current.posts = null;
    }

    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        if (!isMountedRef.current) return;
        
        const uniqueMap = new Map();
        snapshot.docs.forEach(doc => {
          if (!uniqueMap.has(doc.id)) {
            uniqueMap.set(doc.id, {
              id: doc.id,
              ...doc.data()
            });
          }
        });
        
        const fetchedPosts = Array.from(uniqueMap.values());
        setPosts(fetchedPosts);
        setFilteredPosts(fetchedPosts);
        setPostsLoading(false);
      }, 
      (error) => {
        console.error("Firebase Error:", error.message);
        if (isMountedRef.current) {
          setPostsLoading(false);
          feedbackRef.current?.showError?.(
            'Error',
            'Failed to load posts. Please refresh.',
            'LOAD_ERROR'
          );
        }
      }
    );

    unsubscribeRefs.current.posts = unsubscribe;

    return () => {
      if (unsubscribeRefs.current.posts) {
        unsubscribeRefs.current.posts();
        unsubscribeRefs.current.posts = null;
      }
    };
  }, [currentUser]);

  // ============================================================
  // ✅ Notifications Unread Count
  // ============================================================

  useEffect(() => {
    if (!arePushNotificationsEnabled()) {
      setUnreadNotificationsCount(0);
      return;
    }

    if (!currentUser?.uid) {
      setUnreadNotificationsCount(0);
      return;
    }

    if (unsubscribeRefs.current.notifications) {
      unsubscribeRefs.current.notifications();
      unsubscribeRefs.current.notifications = null;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      where('isUnread', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isMountedRef.current) return;
      
      const unreadCount = snapshot.docs.filter(doc => {
        const data = doc.data();
        const event = data.event || 'NOTIFICATION';
        
        const categoryMap = {
          'CHAT_MESSAGE': 'message',
          'CHAT_IMAGE': 'message',
          'CHAT_PROPOSAL': 'message',
          'CHAT_PROPOSAL_ACCEPTED': 'message',
          'CHAT_PROPOSAL_REJECTED': 'message',
          'CHAT_DEAL_STARTED': 'deal',
          'DEAL_CREATED': 'deal',
          'DEAL_CONFIRMED': 'deal',
          'DEAL_APPROVED': 'deal',
          'DEAL_REJECTED': 'deal',
          'DEAL_COMPLETED': 'deal',
          'DEAL_CANCELLED': 'deal',
          'DEAL_EXTENDED': 'deal',
          'DEADLINE_PASSED': 'deal',
          'PAYMENT_RECEIVED': 'wallet',
          'PAYMENT_RELEASED': 'wallet',
          'WALLET_CREDITED': 'wallet',
          'WALLET_DEBITED': 'wallet',
          'WALLET_DEPOSIT_APPROVED': 'wallet',
          'WALLET_WITHDRAW_APPROVED': 'wallet',
          'ADMIN_ANNOUNCEMENT': 'admin',
          'ADMIN_NOTIFICATION': 'admin',
          'USER_VERIFIED': 'admin',
          'USER_BLOCKED': 'admin',
          'USER_UNBLOCKED': 'admin',
          'POST_APPROVED': 'admin',
          'POST_REJECTED': 'admin',
          'DEPOSIT_APPROVED': 'admin',
          'DEPOSIT_REJECTED': 'admin',
          'WITHDRAW_APPROVED': 'admin',
          'WITHDRAW_REJECTED': 'admin',
          'REPORT_RESOLVED': 'admin',
          'REPORT_CANCELLED': 'admin',
          'REVIEW_RECEIVED': 'review',
          'VERIFY_APPROVED': 'verification',
          'VERIFY_REJECTED': 'verification',
          'SYSTEM': 'system',
          'SYSTEM_UPDATE': 'system',
          'SYSTEM_ERROR': 'system',
        };
        
        const category = categoryMap[event] || 'system';
        return isNotificationTypeEnabled(category);
      }).length;
      
      setUnreadNotificationsCount(unreadCount);
    }, (error) => {
      console.error("Error fetching unread count:", error);
    });

    unsubscribeRefs.current.notifications = unsubscribe;

    return () => {
      if (unsubscribeRefs.current.notifications) {
        unsubscribeRefs.current.notifications();
        unsubscribeRefs.current.notifications = null;
      }
    };
  }, [currentUser?.uid, arePushNotificationsEnabled, isNotificationTypeEnabled]);

  // ============================================================
  // ✅ Chats Fetching
  // ============================================================

  useEffect(() => {
    if (!currentUser?.uid) {
      setChats([]);
      return;
    }

    if (!isNotificationTypeEnabled('message')) {
      setChats([]);
      return;
    }

    if (unsubscribeRefs.current.chats) {
      unsubscribeRefs.current.chats();
      unsubscribeRefs.current.chats = null;
    }

    const chatsRef = collection(db, 'chats');
    const q = query(
      chatsRef,
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        if (!isMountedRef.current) return;
        
        const fetchedChats = snapshot.docs.map(doc => {
          const data = doc.data();
          
          let userUnread = 0;
          if (data.unreadCount && typeof data.unreadCount === 'object') {
            userUnread = data.unreadCount[currentUser.uid] || 0;
          } else if (typeof data.unreadCount === 'number') {
            userUnread = data.unreadCount;
          }
          
          return {
            id: doc.id,
            ...data,
            userUnreadCount: userUnread,
            unreadCount: data.unreadCount || 0
          };
        });
        
        setChats(fetchedChats);
      }, 
      (error) => {
        console.error("Error loading chats:", error.message);
      }
    );

    unsubscribeRefs.current.chats = unsubscribe;

    return () => {
      if (unsubscribeRefs.current.chats) {
        unsubscribeRefs.current.chats();
        unsubscribeRefs.current.chats = null;
      }
    };
  }, [currentUser?.uid, isNotificationTypeEnabled]);

  // ============================================================
  // Local Storage Effects
  // ============================================================

  useEffect(() => {
    localStorage.setItem('currentMode', currentMode);
  }, [currentMode]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeChatContext) {
        localStorage.setItem('activeChat', JSON.stringify(activeChatContext));
      } else {
        localStorage.removeItem('activeChat');
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [activeChatContext]);

  // ============================================================
  // Handlers
  // ============================================================

  const handleModeChange = useCallback((mode) => {
    setCurrentMode(mode);
    localStorage.setItem('currentMode', mode);
  }, []);

  const handleUnreadCountChange = useCallback((count) => {
    setUnreadNotificationsCount(count);
  }, []);

  const handleGlobalSearch = useCallback((searchTerm) => {
    setSearchQuery(searchTerm);
    if (!searchTerm || searchTerm.trim() === '') {
      setFilteredPosts(posts);
    } else {
      const lowerQuery = searchTerm.toLowerCase();
      const filtered = posts.filter(post => 
        post.title?.toLowerCase().includes(lowerQuery) ||
        post.description?.toLowerCase().includes(lowerQuery) ||
        post.clientName?.toLowerCase().includes(lowerQuery)
      );
      setFilteredPosts(filtered);
    }
  }, [posts]);

  const handleLogout = useCallback(async () => {
    const confirmed = await feedbackRef.current?.confirm?.({
      title: 'Logout?',
      message: 'Are you sure you want to logout?',
      variant: 'confirm',
      confirmText: 'Yes, Logout',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      try {
        await feedbackRef.current?.withLoading?.(
          async () => {
            await signOut(auth);
          },
          'Logging out...'
        );
        cleanupAllListeners();
        AUTH_SCOPED_LOCAL_KEYS.forEach(key => localStorage.removeItem(key));
        setIsAppUnlocked(false);
        hasCheckedInitialLock.current = false; // ✅ Reset for next login
        await feedbackRef.current?.showSuccess?.(
          'Logged Out',
          'See you next time!',
          'SUCCESS'
        );
        navigate('/login');
      } catch (error) {
        await feedbackRef.current?.showError?.(
          'Error',
          'Failed to logout.',
          'FAILED'
        );
        console.error("Logout error:", error);
      }
    }
  }, [navigate, cleanupAllListeners]);

  const handleAddNewPost = useCallback(async (newPostData) => {
    try {
      await feedbackRef.current?.withLoading?.(
        async () => {
          await addDoc(collection(db, 'posts'), {
            ...newPostData,
            escrowSystem: true,
            targetCountry: 'BD',
            currency: 'BDT',
            createdAt: new Date().toISOString(),
            userId: currentUser?.uid,
            status: 'pending',
            isPublished: false,
            reviewedBy: null,
            reviewedAt: null,
            rejectionReason: '',
            submittedAt: new Date().toISOString(),
          });
        },
        'Submitting post for review...'
      );
      await feedbackRef.current?.showSuccess?.(
        '✅ Post Submitted',
        'Your post has been sent to the admin for review.',
        'POST_PENDING'
      );
      setActiveTab('dashboard');
    } catch (error) {
      console.error('Error saving post:', error);
      await feedbackRef.current?.showError?.(
        '❌ Submission Failed',
        'Failed to submit your post. Please try again.',
        'POST_FAILED'
      );
    }
  }, [currentUser]);

  const handleInitiateBidAndChat = useCallback((postData) => {
    if (!postData) {
      feedbackRef.current?.alert?.error?.({ message: '❌ পোস্ট ডেটা পাওয়া যায়নি!' });
      return;
    }
    if (!postData.userId) {
      feedbackRef.current?.alert?.error?.({ message: '❌ পোস্টের মালিক খুঁজে পাওয়া যায়নি!' });
      return;
    }
    if (postData.userId === currentUser?.uid) {
      feedbackRef.current?.alert?.warning?.({ 
        message: '⚠️ আপনি নিজের পোস্টে বিড করতে পারবেন না!' 
      });
      return;
    }
    setActiveChatContext(postData);
    navigate('/inbox');
  }, [currentUser, navigate]);

  // ============================================================
  // ✅ Home Component
  // ============================================================

  const homeComponent = useMemo(() => (
    <Home 
      key="home"
      currentMode={currentMode || 'seller'}
      currentUser={currentUser}
      searchTerm={searchQuery}
      onBidAndChatClick={handleInitiateBidAndChat}
    />
  ), [currentMode, currentUser, searchQuery, handleInitiateBidAndChat]);

  // ============================================================
  // ✅ Loading Screen
  // ============================================================

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: 'var(--bg-primary, #090d16)', 
        color: 'var(--accent-primary, #14b8a6)' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{ 
            fontSize: '48px', 
            animation: 'spin 2s linear infinite',
            display: 'block',
            marginBottom: '16px'
          }} />
          <h2>Loading WorkTrustbd...</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your experience...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // ✅ App Lock Screen
  // ============================================================

  if (currentUser && isAppLockEnabled && !isAppUnlocked) {
    return (
      <AppLockScreen
        onUnlock={() => {
          setIsAppUnlocked(true);
          resetSession(); // ✅ Reset session timer on unlock
          if (isBiometricEnabled) {
            biometricAuthenticate().then(success => {
              if (success) console.log('✅ Biometric authenticated');
            });
          }
        }}
      />
    );
  }

  // ============================================================
  // ✅ Main Render
  // ============================================================

  return (
    <div className="main-app">
      {/* Network Status */}
      {!feedbackRef.current?.network?.online && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: '#ef4444',
          color: 'white',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}>
          <span>📡</span>
          <span>You are offline. Please check your connection.</span>
          <button
            onClick={() => feedbackRef.current?.network?.checkLatency?.()}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Retry
          </button>
        </div>
      )}
      
      {/* Announcement */}
      {currentUser && (
        <AnnouncementPopup
          announcement={announcement}
          showPopup={showPopup}
          loading={announcementLoading}
          onDismiss={dismiss}
          onDismissForever={dismissForever}
        />
      )}
      
      <FloatingFeedbackButton />
      
      {currentUser ? (
        <Navbar 
          totalUnread={chats.reduce((sum, chat) => sum + (chat.userUnreadCount || 0), 0)}
          unreadNotifications={unreadNotificationsCount}
          totalDeals={pendingDealsCount}
          currentMode={currentMode} 
          setCurrentMode={handleModeChange}
          onLogout={handleLogout}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onSilentPost={handleAddNewPost}
          currentUser={currentUser}
          onSearch={handleGlobalSearch}
          searchQuery={searchQuery}
          searchResults={searchQuery ? filteredPosts : []}
        >
          <Routes>
            <Route path="/" element={homeComponent} />
            <Route path="/post/:postId" element={homeComponent} />
            <Route path="/home" element={homeComponent} />

            <Route path="/inbox" element={
              <Inbox chatContext={activeChatContext} currentUser={currentUser} />
            } />

            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:userId" element={<UserProfilePage />} />
            <Route path="/saved-jobs" element={<SavedJobsPage />} />
            
            <Route path="/settings/*" element={
              <PrivateRoute>
                <Settings 
                  biometricStatus={isBiometricEnabled}
                  biometricType={biometricType}
                  isBiometricSupported={isBiometricSupported}
                  isBiometricAvailable={isBiometricAvailable}
                  appLockStatus={isAppLockEnabled}
                  onBiometricToggle={toggleBiometric}
                  onAppLockToggle={toggleAppLock}
                  onChangePin={changeAppLockPin} // ✅ NEW - PIN change handler
                  onSecurityCheckup={handleSecurityCheckup}
                  securityData={securityData}
                  setSecurityData={setSecurityData}
                />
              </PrivateRoute>
            } />

            <Route path="/dev-sound-test" element={
              <PrivateRoute><DevSoundTest /></PrivateRoute>
            } />

            <Route path="/deal-manager" element={
              <PrivateRoute requireVerified><DealManager /></PrivateRoute>
            } />

            <Route path="/wallet" element={
              <PrivateRoute requireVerified><Wallet /></PrivateRoute>
            } />

            <Route path="/transactions" element={
              <PrivateRoute requireVerified><Transactions /></PrivateRoute>
            } />

            <Route path="/withdraw" element={
              <PrivateRoute requireVerified><Withdraw /></PrivateRoute>
            } />

            <Route path="/deposit" element={
              <PrivateRoute requireVerified><Deposit /></PrivateRoute>
            } />

            <Route path="/payment/:dealId/:milestoneId" element={
              <PrivateRoute requireVerified><PaymentGateway /></PrivateRoute>
            } />

            <Route path="/send-money" element={
              <PrivateRoute requireVerified><SendMoney /></PrivateRoute>
            } />

            <Route path="/bank-account" element={
              <PrivateRoute requireVerified><BankAccount /></PrivateRoute>
            } />

            <Route path="/payment-history" element={
              <PrivateRoute requireVerified><PaymentHistory /></PrivateRoute>
            } />

            <Route path="/profile-card" element={
              <PrivateRoute requireVerified><ProfileCard /></PrivateRoute>
            } />

            <Route path="/referral" element={
              <PrivateRoute requireVerified><Referral /></PrivateRoute>
            } />

            <Route path="/admin" element={
              <PrivateRoute requireAdmin><AdminDashboard /></PrivateRoute>
            } />

            <Route path="/notifications" element={
              <Notifications 
                currentUser={currentUser}
                currentMode={currentMode}
                onUnreadCountChange={handleUnreadCountChange}
              />
            } />

            <Route path="/verify-pending" element={<VerifyPending />} />
            <Route path="/verify-rejected" element={<VerifyRejected />} />
            <Route path="/blocked" element={<BlockedPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Navbar>
      ) : (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh', 
          width: '100vw',
          background: '#090d16' 
        }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register setIsCreatingUser={setIsCreatingUser} />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      )}
    </div>
  );
};

// ============================================================
// ✅ App Component thanks 
// ============================================================

function App() {
  return (
    <SoundProvider>
      <FeedbackProvider>
        <NavigationProvider>
          <LayoutProvider>
            <NotificationProvider>
              <PostProvider>
                <AppContent />
                <NotificationBanner />
              </PostProvider>
            </NotificationProvider>
          </LayoutProvider>
        </NavigationProvider>
      </FeedbackProvider>
    </SoundProvider>
  );
}

export default React.memo(App);