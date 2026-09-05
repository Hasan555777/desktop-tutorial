// App.js - Production build

import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../shared/firebase/index';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  where,
  updateDoc,
  doc,
  limit,
} from 'firebase/firestore';

// ===== Hooks =====
import { useBiometric } from '../features/app-lock/hooks/useBiometric';
import { useAppLock } from '../features/app-lock/hooks/useAppLock';
import AppLockScreen from '../features/app-lock/AppLock/AppLockScreen';
import { useSessionLock } from '../features/auth/hooks/useSessionLock';
import { useOnlineStatus } from '../shared/hooks/useOnlineStatus';
import { device } from '../shared/security/device';

// ===== Context =====
import { NavigationProvider } from '../features/navigation/Navigation';
import Welcome from '../features/welcome/Welcome';
// ===== UI System =====

import '../features/app-lock/LockScreen.css';
import { useFeedback } from '../shared/ui/Feedback/FeedbackProvider'; // FeedbackProvider itself moved to main.jsx
// 🔧 REMOVED (item #11 complete): react-hot-toast's <Toaster/> and
// import used to live here as a temporary safety net while migration
// to this app's own FeedbackProvider was in progress file-by-file.
// Every file that used to call toast() is now migrated — this file,
// ProfileDetail.jsx (deleted, was dead code), Login.jsx, and
// AuthContext.jsx were the last ones. react-hot-toast can be removed
// from package.json entirely now; nothing in the app imports it anymore.
import { useAuth } from '../shared/context/AuthContext';
// SoundProvider moved to main.jsx (see the App() function's comment below)
import { NotificationProvider, useNotification } from '../shared/ui/Notification/NotificationProvider';
import NotificationBanner from '../shared/ui/NotificationBanner/NotificationBanner';
import { LayoutProvider, useLayout } from '../shared/context/LayoutContext';

import { LoadingBarProvider } from '../shared/ui/LoadingBar/LoadingBarContext';
import TopLoadingBar from '../shared/ui/LoadingBar/TopLoadingBar';

// ===== Error Handling =====
import ErrorBoundary from '../shared/ui/ErrorBoundary/ErrorBoundary';
import { logError } from '../shared/utils/logger';

// ===== Pages =====
// 🔧 FIX (#34 low-bandwidth): none of these were code-split before —
// every visitor's initial bundle included the full Admin Dashboard
// (huge), every financial page, Settings, etc. even if they never
// touch any of them. Lazy-loading the pages that aren't needed on
// first paint means a first-time visitor downloads meaningfully less
// JS before the app becomes interactive. Kept Login/Register/Home/
// Navbar/Profile/Inbox/Notifications as regular imports since those
// are needed immediately after (or even before) auth resolves, where
// an extra loading flicker would hurt more than it helps.
import UserProfilePage from '../features/profile/UserProfilePage';
import VerifyEmail from '../features/auth/VerifyEmail';
import PrivateRoute from '../features/auth/components/PrivateRoute';
import VerifyPending from '../features/auth/VerifyPending';
import VerifyRejected from '../features/auth/VerifyRejected';
import BlockedPage from '../features/profile/BlockedPage';
import FloatingFeedbackButton from '../features/feedback-widget/FloatingFeedbackButton/FloatingFeedbackButton';
import { PostProvider } from '../features/home-feed/PostContext';
import Login from '../features/auth/Login';
import Register from '../features/register/Register';
import Home from '../features/home-feed/Home';
import Navbar from '../features/navigation/Navbar';
import Inbox from '../features/chat/Inbox/Inbox';
import Notifications from '../features/notifications/Notifications';
import Profile from '../features/profile/Profile/Profile';

const Settings = React.lazy(() => import('../features/settings/index'));
const SavedJobsPage = React.lazy(() => import('../features/home-feed/JobCard/components/SavedJobsPage'));
const AdminDashboard = React.lazy(() => import('../features/admin/AdminDashboard'));
const DealManager = React.lazy(() => import('../features/deal-manager/DealManager'));
const Withdraw = React.lazy(() => import('../features/wallet-payments/Withdraw'));
const Transactions = React.lazy(() => import('../features/wallet-payments/Transactions'));
const PaymentGateway = React.lazy(() => import('../features/wallet-payments/PaymentGateway'));
const Wallet = React.lazy(() => import('../features/wallet-payments/Wallet'));
const Deposit = React.lazy(() => import('../features/wallet-payments/Deposit'));
const ProfileCard = React.lazy(() => import('../features/profile/ProfileCard'));
const SendMoney = React.lazy(() => import('../features/wallet-payments/SendMoney'));
const BankAccount = React.lazy(() => import('../features/wallet-payments/BankAccount'));
const PaymentHistory = React.lazy(() => import('../features/wallet-payments/PaymentHistory'));
const Referral = React.lazy(() => import('../features/home-feed/Referral'));

// ===== FCM =====
import { messaging } from '../shared/firebase/index';
import { onMessage } from 'firebase/messaging';

// ===== Announcement =====
import AnnouncementPopup from '../features/announcements/components/AnnouncementPopup/AnnouncementPopup';
import { useAnnouncement } from '../features/announcements/hooks/useAnnouncement';
import './index.css';

// ============================================================
// Constants
// ============================================================
const NOTIFICATION_SETTINGS_KEY = 'workhub_notification_settings';
const POSTS_QUERY_LIMIT = 200; // TODO: replace with real pagination (startAfter) when post volume grows
const INSTALL_PROMPT_COOLDOWN_MS = 5 * 60 * 1000;

// Auth-scoped keys cleared on logout (theme/notification prefs are kept)
const AUTH_SCOPED_LOCAL_KEYS = ['currentMode', 'activeTab', 'activeChat'];

const getNotificationSettings = () => {
  try {
    const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    logError('Error loading notification settings', e);
  }
  return null;
};

// ============================================================
// Inner App Component
// ============================================================
// 🔧 ADD (#34 low-bandwidth): fallback shown while a lazy-loaded
// page's JS chunk is downloading. Brief on a fast connection, but on
// a slow one this replaces what would otherwise be a blank screen.
const PageLoadingFallback = () => (
  <div style={{
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    minHeight: '60vh', width: '100%',
  }}>
    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '32px', color: 'var(--accent-primary, #14b8a6)' }} />
  </div>
);

const AppContent = () => {
  useLayout(); // keeps LayoutProvider context wired for descendants
  const feedback = useFeedback();
  const navigate = useNavigate();

  // ── Auth ──
  const { currentUser, loading: authLoading, refreshNotificationToken } = useAuth();
  const { unreadCount } = useNotification();

  // ── Online/Presence Status ──
  // FIX: এটা আগে ChatInterface.jsx-এর ভেতরে কল হতো — যেটা প্রতিবার একটা
  // চ্যাট খোলা/বন্ধ করলে mount/unmount হয়, আর হুকের cleanup
  // `isOnline: false` সেট করে দিত। মানে কেউ শুধু একটা চ্যাট বন্ধ করলেই
  // পুরো অ্যাকাউন্ট ভুলভাবে "Offline" দেখাত, যদিও ইউজার তখনো অ্যাপে
  // সক্রিয়। এখন এখানে app-root-এ একবারই কল হচ্ছে (currentUser সেশনজুড়ে
  // যতক্ষণ লগইন থাকে ততক্ষণ), তাই শুধুমাত্র প্রকৃত লগআউট/ট্যাব-বন্ধেই
  // isOnline false হবে — চ্যাট খোলা/বন্ধ করায় প্রভাবিত হবে না।
  useOnlineStatus(currentUser);

  // ── Security Hooks ──
  const biometric = useBiometric();
  const appLock = useAppLock();

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
    isLoading: appLockSettingsLoading,
    toggle: toggleAppLock,
    changePin: changeAppLockPin,
  } = appLock;

  // ── Refs ──
  const feedbackRef = useRef(feedback);
  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  // ── States ──
  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== 'light';
  });

  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const hasCheckedInitialLock = useRef(false);

  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [localLoading, setLocalLoading] = useState(true);

  const loading = authLoading || localLoading || (!!currentUser && appLockSettingsLoading);

  // ── Session Lock ──
  const { manualLock, resetSession } = useSessionLock({
    enabled: isAppLockEnabled,
    unlocked: isAppUnlocked,
    onLock: () => setIsAppUnlocked(false),
    idleTimeout: 5 * 60 * 1000,
    backgroundTimeout: 30 * 1000,
    lockOnTabChange: true,
    lockOnBrowserClose: true,
  });

  // ── Notification Settings ──
  const [notificationPrefs, setNotificationPrefs] = useState(null);

  // ── App State ──
  const [deals, setDeals] = useState([]);
  const [currentMode, setCurrentMode] = useState(() => localStorage.getItem('currentMode') || 'seller');
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'dashboard');
  const [posts, setPosts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [chats, setChats] = useState([]);

  // 🔧 FIX (#9 unified unread count): single place that computes the
  // chat unread total, reused for BOTH the navbar Chat icon and the
  // notifications bell badge below — so there's exactly one number
  // for "how many unread chat messages", not two that can drift.
  // Source of truth is `chats/{id}.unreadCount[currentUser.uid]`,
  // which is the map sendMessage()/markChatAsRead() (useChatMessages.js)
  // already keep accurate; no extra Firestore reads needed.
  const totalChatUnread = useMemo(
    () => chats.reduce((sum, chat) => sum + (chat.userUnreadCount || 0), 0),
    [chats]
  );
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
    twoFactorEnabled: false,
  });

  // 🔧 FIX (item #8): fcmToken local state removed — token save now
  // goes through AuthContext's refreshNotificationToken() (see the
  // FCM effect below), so there's nothing left to hold here.

  // ── Refs ──
  const unsubscribeRefs = useRef({ deals: null, posts: null, notifications: null, chats: null });
  const isMountedRef = useRef(true);

  // ── Announcement ──
  const {
    announcement,
    showPopup,
    loading: announcementLoading,
    dismiss,
    dismissForever,
  } = useAnnouncement();

  // ============================================================
  // Derived data
  // ============================================================
  const approvedPosts = useMemo(() => posts.filter((p) => p.status === 'approved'), [posts]);

  const runSearch = useCallback(
    (term, postList) => {
      if (!term || term.trim() === '') return [];
      const lowerQuery = term.toLowerCase();
      return postList.filter(
        (post) =>
          post.title?.toLowerCase().includes(lowerQuery) ||
          post.description?.toLowerCase().includes(lowerQuery) ||
          post.clientName?.toLowerCase().includes(lowerQuery)
      );
    },
    []
  );

  useEffect(() => {
    setFilteredPosts(runSearch(searchQuery, approvedPosts));
  }, [approvedPosts, searchQuery, runSearch]);

  // ============================================================
  // App Lock Initial Check
  // ============================================================
  useLayoutEffect(() => {
    if (!currentUser) {
      setIsAppUnlocked(false);
      hasCheckedInitialLock.current = false;
      return;
    }

    if (appLockSettingsLoading) return;

    if (!hasCheckedInitialLock.current) {
      hasCheckedInitialLock.current = true;
      const shouldBeUnlocked = !isAppLockEnabled;
      setIsAppUnlocked(shouldBeUnlocked);
      if (shouldBeUnlocked) resetSession();
    }
  }, [currentUser, appLockSettingsLoading, isAppLockEnabled, resetSession]);

  // ============================================================
  // Notification Helpers
  // ============================================================
  const isNotificationTypeEnabled = useCallback(
    (type) => {
      if (!notificationPrefs) return true;
      const keyMap = {
        message: 'messageNotifications',
        deal: 'dealUpdates',
        wallet: 'walletNotifications',
        admin: 'adminNotifications',
        review: 'reviewNotifications',
        verification: 'verificationNotifications',
        system: 'systemNotifications',
      };
      const key = keyMap[type] || type;
      return notificationPrefs[key] !== false;
    },
    [notificationPrefs]
  );

  // ============================================================
  // Device Tracking
  // ============================================================
  useEffect(() => {
    if (!currentUser) return;
    device.updateLastActive();
  }, [currentUser]);

  // ============================================================
  // Security Checkup
  // ============================================================
  const handleSecurityCheckup = useCallback(() => {
    const checks = {
      password: securityData?.newPassword?.length >= 8,
      twoFactor: securityData?.twoFactorEnabled || false,
      biometric: isBiometricEnabled,
      appLock: isAppLockEnabled,
    };

    const allSecure = Object.values(checks).every((v) => v === true);
    const insecureCount = Object.values(checks).filter((v) => v === false).length;

    if (allSecure) {
      feedback?.showSuccess('🛡️ নিরাপদ', 'আপনার অ্যাকাউন্ট সম্পূর্ণ নিরাপদ!');
    } else {
      feedback?.showWarning('⚠️ সতর্কতা', `${insecureCount} টি নিরাপত্তা ব্যবস্থা নিষ্ক্রিয় আছে।`);
    }
  }, [securityData, isBiometricEnabled, isAppLockEnabled, feedback]);

  // ============================================================
  // Notification Settings Load
  // ============================================================
  useEffect(() => {
    const settings = getNotificationSettings();
    if (settings) setNotificationPrefs(settings);
    setLocalLoading(false);
  }, []);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === NOTIFICATION_SETTINGS_KEY) {
        setNotificationPrefs(getNotificationSettings());
      }
    };
    const handleSettingsChange = (e) => setNotificationPrefs(e.detail || getNotificationSettings());
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('workhub:notification-settings', handleSettingsChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('workhub:notification-settings', handleSettingsChange);
    };
  }, []);

  // ============================================================
  // Theme
  // ============================================================
  const toggleTheme = useCallback(() => {
    const newMode = !isDark;
    setIsDark(newMode);
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
  // FCM
  //
  // 🔧 FIX (item #8): this used to keep a second, separate FCM
  // token-save mechanism here — fetching its own token into local
  // `fcmToken` state and writing it to users/{uid}.fcmToken (a
  // top-level field) — while AuthContext.jsx's saveNotificationToken
  // wrote the *same* token to a different field,
  // users/{uid}.notification.token, on login. Two schemas for one
  // piece of data, as this file's own previous comment already
  // flagged. Now this just calls AuthContext's single
  // refreshNotificationToken() — both at login (AuthContext already
  // does that itself) and right after the user grants permission via
  // NotificationBanner, which is the one case a login-only refresh
  // would miss.
  // ============================================================
  useEffect(() => {
    const handleFcmRefresh = () => refreshNotificationToken?.();
    window.addEventListener('workhub:fcm-token-refresh', handleFcmRefresh);
    return () => window.removeEventListener('workhub:fcm-token-refresh', handleFcmRefresh);
  }, [refreshNotificationToken]);

  useEffect(() => {
    let unsubscribe;
    const initForegroundListener = async () => {
      try {
        const messagingInstance = await messaging;
        if (!messagingInstance) return;
        unsubscribe = onMessage(messagingInstance, (payload) => {
          feedbackRef.current?.toast?.({
            variant: 'info',
            title: payload.notification?.title || 'WorkTrustbd',
            message: payload.notification?.body || 'You have a new notification.',
            duration: 6000,
          });
        });
      } catch (err) {
        logError('onMessage listener failed', err);
      }
    };
    initForegroundListener();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ============================================================
  // Cleanup
  // ============================================================
  const cleanupAllListeners = useCallback(() => {
    Object.keys(unsubscribeRefs.current).forEach((key) => {
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
  // Deals Fetching
  //
  // FIX: deal ডকুমেন্টে 'participants' নামে কোনো ফিল্ড নেই — sendProposal()
  // (chatHelpers.js) শুধু buyerId/sellerId সেট করে। আগে এখানে
  // `where('participants', 'array-contains', uid)` কোয়েরি চালানো হতো,
  // যা সবসময় শূন্য রেজাল্ট দিত — `deals` স্টেট সবসময় খালি থাকত এবং
  // Navbar-এর "pending deals" ব্যাজ কখনো কোনো সংখ্যা দেখাত না। এখন
  // buyerId ও sellerId-এর জন্য দুইটা আলাদা listener merge করা হচ্ছে
  // (Firestore এক কোয়েরিতে দুই ভিন্ন ফিল্ডে OR করতে পারে না)।
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

    const dealsRef = collection(db, 'deals');
    const qAsBuyer = query(dealsRef, where('buyerId', '==', currentUser.uid));
    const qAsSeller = query(dealsRef, where('sellerId', '==', currentUser.uid));

    let buyerDeals = [];
    let sellerDeals = [];
    let buyerReady = false;
    let sellerReady = false;

    const mergeAndSet = () => {
      if (!buyerReady || !sellerReady || !isMountedRef.current) return;
      const map = new Map();
      [...buyerDeals, ...sellerDeals].forEach((d) => map.set(d.id, d));
      setDeals(Array.from(map.values()));
    };

    const unsubBuyer = onSnapshot(
      qAsBuyer,
      (snapshot) => {
        buyerDeals = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        buyerReady = true;
        mergeAndSet();
      },
      (error) => {
        logError('Error fetching deals (buyer)', error);
        buyerReady = true;
        mergeAndSet();
      }
    );

    const unsubSeller = onSnapshot(
      qAsSeller,
      (snapshot) => {
        sellerDeals = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        sellerReady = true;
        mergeAndSet();
      },
      (error) => {
        logError('Error fetching deals (seller)', error);
        sellerReady = true;
        mergeAndSet();
      }
    );

    unsubscribeRefs.current.deals = () => {
      unsubBuyer();
      unsubSeller();
    };

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
    return deals.filter((d) => d.status === 'pending').length;
  }, [deals, currentUser?.uid, isNotificationTypeEnabled]);

  // ============================================================
  // PWA Install Prompt
  // ============================================================
  useEffect(() => {
    let installInProgress = false;
    let installPromptShown = false;
    let cooldownTimeoutId = null;
    let showTimeoutId = null;

    const showInstallBanner = async (prompt) => {
      if (installInProgress || installPromptShown) return;

      installInProgress = true;
      installPromptShown = true;

      try {
        const shouldInstall = await feedbackRef.current?.confirm?.({
          title: '📱 Install WorkTrustbd',
          message: 'Install WorkTrustbd on your device for a faster, offline-ready experience.',
          confirmText: 'Install Now',
          cancelText: 'Later',
          variant: 'info',
        });

        if (!shouldInstall) {
          installInProgress = false;
          return;
        }

        await prompt.prompt();
        const choiceResult = await prompt.userChoice;

        if (choiceResult.outcome === 'accepted') {
          feedbackRef.current?.showSuccess?.('✅ Installed', 'WorkTrustbd installed successfully!', 'INSTALL_SUCCESS');
        } else {
          feedbackRef.current?.showInfo?.('⏭️ Skipped', 'You can install later from the browser menu.');
        }
      } catch (error) {
        logError('PWA install error', error);
        feedbackRef.current?.showError?.('❌ Failed', 'Could not install the app. Please try again.');
      } finally {
        installInProgress = false;
        window.deferredPrompt = null;
        cooldownTimeoutId = setTimeout(() => {
          installPromptShown = false;
        }, INSTALL_PROMPT_COOLDOWN_MS);
      }
    };

    const handleInstallAvailable = (event) => {
      const prompt = event?.detail?.deferredPrompt || window.deferredPrompt;
      if (!prompt) return;
      showTimeoutId = setTimeout(() => showInstallBanner(prompt), 2000);
    };

    const handleInstalled = () => {
      window.deferredPrompt = null;
      feedbackRef.current?.toast?.({
        variant: 'success',
        title: '✅ Installed',
        message: 'WorkTrustbd installed successfully.',
        duration: 5000,
      });
    };

    window.addEventListener('pwa-install-available', handleInstallAvailable);
    window.addEventListener('pwa-installed', handleInstalled);

    if (window.deferredPrompt) {
      showTimeoutId = setTimeout(() => {
        handleInstallAvailable({ detail: { deferredPrompt: window.deferredPrompt } });
      }, 1000);
    }

    return () => {
      window.removeEventListener('pwa-install-available', handleInstallAvailable);
      window.removeEventListener('pwa-installed', handleInstalled);
      if (cooldownTimeoutId) clearTimeout(cooldownTimeoutId);
      if (showTimeoutId) clearTimeout(showTimeoutId);
    };
  }, []);

  // ============================================================
  // App Update Available
  // ============================================================
  useEffect(() => {
    // 🔧 FIX (#3 — "New Update" reappears forever, clicking does
    // nothing): this used to just call window.location.reload() on
    // confirm. A reload alone does NOT activate a waiting service
    // worker — the OLD worker keeps controlling the page unless the
    // new one is explicitly told to skip waiting and takes over
    // (controllerchange). So the reload just re-served the old
    // version, the "new" worker sat in `waiting` forever, and the
    // browser's normal update check would detect that same
    // still-different worker again on the next load/navigation —
    // re-firing this exact event, forever, with the click never
    // having done anything. main.jsx already passes the registration
    // and the new worker in the event's `detail`; use them to
    // actually skip-waiting and wait for the new worker to take
    // control before reloading.
    const handleUpdate = async (event) => {
      const yes = await feedbackRef.current?.confirm?.({
        title: 'New Update',
        message: 'A new version of WorkTrustbd is available.',
        confirmText: 'Update',
        cancelText: 'Later',
      });
      if (!yes) return;

      const registration = event?.detail?.registration;
      const waitingWorker = registration?.waiting || event?.detail?.newWorker;

      if (!waitingWorker) {
        // No worker to activate (already updated by another tab, etc.) —
        // a plain reload is the correct fallback here.
        window.location.reload();
        return;
      }

      const reloadOnce = (() => {
        let done = false;
        return () => {
          if (done) return;
          done = true;
          window.location.reload();
        };
      })();

      // Reload as soon as the new worker actually takes control...
      navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true });
      // ...but don't leave the user stuck if controllerchange never
      // fires for some reason (e.g. no other tabs, edge-case browser
      // behavior) — fall back to a reload after a short wait either way.
      setTimeout(reloadOnce, 3000);

      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    };

    window.addEventListener('pwa-update-available', handleUpdate);
    return () => window.removeEventListener('pwa-update-available', handleUpdate);
  }, []);

  // ============================================================
  // Posts Fetching
  // ============================================================
  useEffect(() => {
    if (!currentUser) return;

    if (unsubscribeRefs.current.posts) {
      unsubscribeRefs.current.posts();
      unsubscribeRefs.current.posts = null;
    }

    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(POSTS_QUERY_LIMIT));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isMountedRef.current) return;

        const uniqueMap = new Map();
        snapshot.docs.forEach((d) => {
          if (!uniqueMap.has(d.id)) uniqueMap.set(d.id, { id: d.id, ...d.data() });
        });

        setPosts(Array.from(uniqueMap.values()));
      },
      (error) => {
        logError('Error fetching posts', error);
        if (isMountedRef.current) {
          feedbackRef.current?.showError?.('Error', 'Failed to load posts. Please refresh.', 'LOAD_ERROR');
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
  // Chats Fetching
  // ============================================================
  useEffect(() => {
    if (!currentUser?.uid || !isNotificationTypeEnabled('message')) {
      setChats([]);
      return;
    }

    if (unsubscribeRefs.current.chats) {
      unsubscribeRefs.current.chats();
      unsubscribeRefs.current.chats = null;
    }

    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isMountedRef.current) return;

        const fetchedChats = snapshot.docs.map((d) => {
          const data = d.data();
          let userUnread = 0;
          if (data.unreadCount && typeof data.unreadCount === 'object') {
            userUnread = data.unreadCount[currentUser.uid] || 0;
          } else if (typeof data.unreadCount === 'number') {
            userUnread = data.unreadCount;
          }
          return { id: d.id, ...data, userUnreadCount: userUnread, unreadCount: data.unreadCount || 0 };
        });

        setChats(fetchedChats);
      },
      (error) => logError('Error loading chats', error)
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
  //
  // ⚠️ NOTE: useInboxChats.js-এর handleSelectChat ALSO সরাসরি
  // localStorage['activeChat']-এ লেখে (ভিন্ন shape: {id, otherPartyName,
  // otherPartyPhoto, fullData})। App.js-এর read (নিচে initial state-এ)
  // `parsed.fullData || parsed` দিয়ে দুই shape-ই defensively হ্যান্ডল
  // করে, কিন্তু দুইটা independent writer + এই 300ms ডিবাউন্স মিলিয়ে
  // দ্রুত নেভিগেশনে একটা লেখা আরেকটাকে ওভাররাইট করার তাত্ত্বিক রেসের
  // সুযোগ থেকে যায়। এখন পর্যন্ত observed crash নেই, architecture
  // consolidation-এর সুযোগ আছে ভবিষ্যতে।
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

  const handleGlobalSearch = useCallback((searchTerm) => {
    setSearchQuery(searchTerm);
  }, []);

  const handleLogout = useCallback(async () => {
    const confirmed = await feedbackRef.current?.confirm?.({
      title: 'Logout?',
      message: 'Are you sure you want to logout?',
      variant: 'confirm',
      confirmText: 'Yes, Logout',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    try {
      await feedbackRef.current?.withLoading?.(async () => {
        await signOut(auth);
      }, 'Logging out...');
      cleanupAllListeners();
      AUTH_SCOPED_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key));
      setIsAppUnlocked(false);
      hasCheckedInitialLock.current = false;
      await feedbackRef.current?.showSuccess?.('Logged Out', 'See you next time!', 'SUCCESS');
      navigate('/login', { replace: true });
    } catch (error) {
      logError('Logout error', error);
      await feedbackRef.current?.showError?.('Error', 'Failed to logout.', 'FAILED');
    }
  }, [navigate, cleanupAllListeners]);

  const handleAddNewPost = useCallback(
    async (newPostData) => {
      try {
        await feedbackRef.current?.withLoading?.(async () => {
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
        }, 'Submitting post for review...');
        await feedbackRef.current?.showSuccess?.(
          '✅ Post Submitted',
          'Your post has been sent to the admin for review.',
          'POST_PENDING'
        );
        setActiveTab('dashboard');
      } catch (error) {
        logError('Error saving post', error);
        await feedbackRef.current?.showError?.(
          '❌ Submission Failed',
          'Failed to submit your post. Please try again.',
          'POST_FAILED'
        );
      }
    },
    [currentUser]
  );

  const handleInitiateBidAndChat = useCallback(
    (postData) => {
      if (!postData) {
        feedbackRef.current?.alert?.error?.({ message: '❌ পোস্ট ডেটা পাওয়া যায়নি!' });
        return;
      }
      if (!postData.userId) {
        feedbackRef.current?.alert?.error?.({ message: '❌ পোস্টের মালিক খুঁজে পাওয়া যায়নি!' });
        return;
      }
      if (postData.userId === currentUser?.uid) {
        feedbackRef.current?.alert?.warning?.({ message: '⚠️ আপনি নিজের পোস্টে বিড করতে পারবেন না!' });
        return;
      }
      setActiveChatContext(postData);
      navigate('/inbox');
    },
    [currentUser, navigate]
  );

  const homeComponent = useMemo(
    () => (
      <Home
        key="home"
        currentMode={currentMode || 'seller'}
        currentUser={currentUser}
        searchTerm={searchQuery}
        onBidAndChatClick={handleInitiateBidAndChat}
        onRequireModeSwitch={handleModeChange}
      />
    ),
    [currentMode, currentUser, searchQuery, handleInitiateBidAndChat, handleModeChange]
  );

  // ============================================================
  // Loading Screen
  // ============================================================
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: 'var(--bg-primary, #090d16)',
          color: 'var(--accent-primary, #14b8a6)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <i
            className="fa-solid fa-cube"
            style={{ fontSize: '48px', animation: 'spin 2s linear infinite', display: 'block', marginBottom: '16px' }}
          />
          <h2>Loading WorkTrustbd...</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your experience...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // App Lock Screen
  // ============================================================
  if (currentUser && isAppLockEnabled && !isAppUnlocked) {
    return (
      <AppLockScreen
        onUnlock={() => {
          setIsAppUnlocked(true);
          resetSession();
          if (isBiometricEnabled) {
            biometricAuthenticate().catch((error) => logError('Biometric authentication failed', error));
          }
        }}
      />
    );
  }

  // ============================================================
  // Main Render
  // ============================================================
  return (
    <div className="main-app">
      <TopLoadingBar />

      {!feedback?.network?.online && (
        <div
          style={{
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
          }}
        >
          <span>📡</span>
          <span>You are offline. Please check your connection.</span>
          <button
            onClick={() => feedback?.network?.checkLatency?.()}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Retry
          </button>
        </div>
      )}

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
          totalUnread={totalChatUnread}
          unreadNotifications={unreadCount}
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
          <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            <Route path="/" element={homeComponent} />
            <Route path="/post/:postId" element={homeComponent} />
            <Route path="/home" element={homeComponent} />

            <Route path="/inbox" element={<Inbox chatContext={activeChatContext} currentUser={currentUser} />} />

            <Route path="/profile/*" element={<Profile />} />
            <Route path="/profile/user/:userId" element={<UserProfilePage />} />
            <Route path="/saved-jobs" element={<SavedJobsPage />} />

            <Route
              path="/settings/*"
              element={
                <PrivateRoute>
                  <Settings
                    biometricStatus={isBiometricEnabled}
                    biometricType={biometricType}
                    isBiometricSupported={isBiometricSupported}
                    isBiometricAvailable={isBiometricAvailable}
                    appLockStatus={isAppLockEnabled}
                    onBiometricToggle={toggleBiometric}
                    onAppLockToggle={toggleAppLock}
                    onChangePin={changeAppLockPin}
                    onSecurityCheckup={handleSecurityCheckup}
                    securityData={securityData}
                    setSecurityData={setSecurityData}
                  />
                </PrivateRoute>
              }
            />

            <Route
              path="/deal-manager"
              element={
                <PrivateRoute requireVerified>
                  <DealManager />
                </PrivateRoute>
              }
            />

            <Route
              path="/wallet"
              element={
                <PrivateRoute requireVerified>
                  <Wallet />
                </PrivateRoute>
              }
            />

            <Route
              path="/transactions"
              element={
                <PrivateRoute requireVerified>
                  <Transactions />
                </PrivateRoute>
              }
            />

            <Route
              path="/withdraw"
              element={
                <PrivateRoute requireVerified>
                  <Withdraw />
                </PrivateRoute>
              }
            />

            <Route
              path="/deposit"
              element={
                <PrivateRoute requireVerified>
                  <Deposit />
                </PrivateRoute>
              }
            />

            <Route
              path="/payment/:dealId/:milestoneId"
              element={
                <PrivateRoute requireVerified>
                  <PaymentGateway />
                </PrivateRoute>
              }
            />

            <Route
              path="/send-money"
              element={
                <PrivateRoute requireVerified>
                  <SendMoney />
                </PrivateRoute>
              }
            />

            <Route
              path="/bank-account"
              element={
                <PrivateRoute requireVerified>
                  <BankAccount />
                </PrivateRoute>
              }
            />

            <Route
              path="/payment-history"
              element={
                <PrivateRoute requireVerified>
                  <PaymentHistory />
                </PrivateRoute>
              }
            />

            <Route
              path="/profile-card"
              element={
                <PrivateRoute requireVerified>
                  <ProfileCard />
                </PrivateRoute>
              }
            />

            <Route
              path="/referral"
              element={
                <PrivateRoute requireVerified>
                  <Referral />
                </PrivateRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <PrivateRoute requireAdmin>
                  <AdminDashboard />
                </PrivateRoute>
              }
            />

            <Route
              path="/notifications"
              element={<Notifications currentUser={currentUser} currentMode={currentMode} />}
            />

            <Route path="/verify-pending" element={<VerifyPending />} />
            <Route path="/verify-rejected" element={<VerifyRejected />} />
            <Route path="/blocked" element={<BlockedPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </Navbar>
      ) : (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            width: '100vw',
            background: '#090d16',
          }}
        >
          <Routes>
            <Route path="/" element={<Welcome />} />
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
// App Component
// ============================================================
// 🔧 CHANGED: SoundProvider and FeedbackProvider used to wrap
// everything HERE, inside App — but AuthContext.jsx (in
// context/AuthContext.jsx) wraps <App/> itself in main.jsx, making it
// an ANCESTOR of these providers, not a descendant. That meant
// AuthContext could never call useFeedback(), which is why its toasts
// stayed on react-hot-toast for most of this audit. Moved both
// providers to main.jsx (wrapping AuthProvider) instead — one single
// instance, now positioned high enough for the whole app including
// AuthContext to use it. See main.jsx for the new provider order.
function App() {
  return (
    <ErrorBoundary>
      <LoadingBarProvider>
        <NavigationProvider>
          <LayoutProvider>
            <NotificationProvider>
              <PostProvider>
                <AppContent />
                <NotificationBanner onEnable={(granted) => granted && window.dispatchEvent(new CustomEvent('workhub:fcm-token-refresh'))} />
              </PostProvider>
            </NotificationProvider>
          </LayoutProvider>
        </NavigationProvider>
      </LoadingBarProvider>
    </ErrorBoundary>
  );
}

export default React.memo(App);







// rules_version = '2';

// service cloud.firestore {
//   match /databases/{database}/documents {

//     // ------------------------------------------------------------
//     // Helpers
//     // ------------------------------------------------------------
//     function isSignedIn() {
//       return request.auth != null;
//     }

//     function isOwner(userId) {
//       return isSignedIn() && request.auth.uid == userId;
//     }

//     function isAdmin() {
//       return isSignedIn() &&
//         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
//         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
//     }

//     // ------------------------------------------------------------
//     // users/{userId}
//     // App.js writes: fcmToken, fcmUpdatedAt (via updateDoc), and
//     // device tracking (lastActive) via device.updateLastActive().
//     // ------------------------------------------------------------
//     match /users/{userId} {
//       allow read: if isSignedIn();
//       allow create: if isOwner(userId);

//       // Owner can update their own profile/settings, but never their own
//       // role/verification flags — only an admin can promote/verify a user.
//       allow update: if isOwner(userId) &&
//         request.resource.data.role == resource.data.role &&
//         request.resource.data.get('isVerified', resource.data.get('isVerified', false))
//           == resource.data.get('isVerified', false)
//         || isAdmin();

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // posts/{postId}
//     // App.js: any signed-in user can create a post with status 'pending'.
//     // Only an admin may move a post to 'approved' / 'rejected'.
//     // Everyone (incl. signed-out) can read approved posts; owner can read
//     // their own pending/rejected posts.
//     // ------------------------------------------------------------
//     match /posts/{postId} {
//       allow read: if resource.data.status == 'approved'
//         || (isSignedIn() && resource.data.userId == request.auth.uid)
//         || isAdmin();

//       allow create: if isSignedIn() &&
//         request.resource.data.userId == request.auth.uid &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.isPublished == false;

//       // Owner may edit their own pending post's content, but cannot touch
//       // moderation fields. Admin may update moderation fields freely.
//       allow update: if (
//         isSignedIn() &&
//         resource.data.userId == request.auth.uid &&
//         resource.data.status == 'pending' &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.userId == resource.data.userId
//       ) || isAdmin();

//       allow delete: if isSignedIn() && resource.data.userId == request.auth.uid || isAdmin();
//     }

//     // ------------------------------------------------------------
//     // deals/{dealId}
//     // App.js reads deals where the current user is in `participants`.
//     // Only participants (or admin) may read/update a deal; deal creation
//     // and status transitions should generally go through a trusted backend
//     // (Cloud Function) once money is involved — this rule only covers the
//     // client read/update paths actually used by App.js.
//     // ------------------------------------------------------------
//     match /deals/{dealId} {
//       allow read: if isSignedIn() &&
//         request.auth.uid in resource.data.participants;

//       allow create: if isSignedIn() &&
//         request.auth.uid in request.resource.data.participants;

//       allow update: if isSignedIn() &&
//         request.auth.uid in resource.data.participants &&
//         request.auth.uid in request.resource.data.participants;

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // chats/{chatId}
//     // App.js reads chats where the current user is in `participants`, and
//     // reads a per-user unreadCount map keyed by uid.
//     // ------------------------------------------------------------
//     match /chats/{chatId} {
//       allow read: if isSignedIn() &&
//         request.auth.uid in resource.data.participants;

//       allow create: if isSignedIn() &&
//         request.auth.uid in request.resource.data.participants;

//       // Participants can update the chat (send messages, adjust their own
//       // unreadCount entry) but cannot remove other participants or edit
//       // someone else's unread counter.
//       allow update: if isSignedIn() &&
//         request.auth.uid in resource.data.participants &&
//         request.auth.uid in request.resource.data.participants;

//       allow delete: if false; // chats are never hard-deleted from the client
//     }

//     // ------------------------------------------------------------
//     // Default deny — anything not explicitly matched above is blocked.
//     // ------------------------------------------------------------
//     match /{document=**} {
//       allow read, write: if false;
//     }
//   }
// }