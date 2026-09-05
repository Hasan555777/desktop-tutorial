// src/context/AuthContext.jsx

import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  getIdToken,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, messaging, googleProvider } from '../firebase/index';
import { getToken } from 'firebase/messaging';
import { useFeedback } from '../ui/Feedback/FeedbackProvider';
import { logError, logInfo } from '../utils/logger';
import { checkEmailVerified } from '../utils/emailVerification';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// ============================================================
// ইউজার লেভেল ও এক্সেস কন্ট্রোল লজিক
// ============================================================
const getAccessLevel = (userData) => {
  if (!userData) return { level: 0, label: 'Loading...' };

  if (userData.isBanned || userData.isBlocked) {
    return { level: 0, label: 'Blocked', isBlocked: true };
  }

  if (userData.verificationStatus === 'rejected' || userData.isRejected) {
    return { level: 4, label: 'Rejected', isRejected: true };
  }

  if (userData.verificationStatus === 'pending' && userData.isComplete === true) {
    return { level: 2, label: 'Pending', isPending: true, isComplete: true };
  }

  if (userData.isVerified === true && userData.isComplete === true) {
    return { level: 3, label: 'Verified', isVerified: true, isComplete: true };
  }

  if (userData.isComplete === true && userData.isVerified === false) {
    return { level: 1, label: 'Pending Verification', isPendingVerification: true, isComplete: true };
  }

  return { level: 1, label: 'Incomplete', isIncomplete: true };
};

export const AuthProvider = ({ children }) => {
  const feedback = useFeedback();
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const tokenRefreshInterval = useRef(null);
  const unsubscribeSnapshot = useRef(null);
  const currentUserRef = useRef(null);

  // ============================================================
  // Token Refresh Function
  // ============================================================
  const refreshToken = async (force = false) => {
    try {
      const user = auth.currentUser;
      if (!user) return null;
      return await getIdToken(user, force);
    } catch (error) {
      logError('Token refresh failed', error);

      if (error.code === 'auth/network-request-failed') {
        setTimeout(() => refreshToken(true), 5000);
      } else if (error.code === 'auth/user-token-expired') {
        try {
          const user = auth.currentUser;
          if (user) return await getIdToken(user, true);
        } catch (retryError) {
          logError('Token refresh retry failed', retryError);
        }
      } else if (error.code === 'auth/invalid-refresh-token') {
        await signOut(auth);
        setCurrentUser(null);
        setUserData(null);
        setUserRole(null);
        setLoading(false);
      }

      return null;
    }
  };

  // ============================================================
  // FCM Token Save Function
  // ============================================================
  const saveNotificationToken = async (uid) => {
    if (!uid) return;

    let token = null;

    try {
      if (!('Notification' in window)) return;

      let permission = Notification.permission;
      if (permission === 'denied') return;

      // 🔧 FIX (item #7): this used to call Notification.requestPermission()
      // automatically here, with no user gesture behind it — same bug as
      // App.jsx's initFCM (see the fix note there for the full explanation).
      // Two separate places auto-requesting permission on login was also
      // why a user could get two permission prompts back to back. Now this
      // only proceeds if permission was already granted through the
      // banner's proper user-gesture-triggered flow.
      if (permission !== 'granted') return;

      const messagingInstance = await messaging;
      if (!messagingInstance) return;

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        logError('FCM VAPID key missing');
        return;
      }

      const serviceWorkerRegistration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      );

      token = await getToken(messagingInstance, {
        vapidKey,
        serviceWorkerRegistration,
      });
      if (!token) return;

      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        'notification.token': token,
        'notification.platform': 'web',
        'notification.updatedAt': serverTimestamp(),
        'notification.enabled': true,
      });
    } catch (error) {
      logError('Error saving FCM token', error);

      if (token && error.code === 'not-found') {
        try {
          const userRef = doc(db, 'users', uid);
          await setDoc(
            userRef,
            {
              notification: {
                token,
                platform: 'web',
                updatedAt: serverTimestamp(),
                enabled: true,
              },
            },
            { merge: true }
          );
        } catch (setError) {
          logError('Error saving FCM token (fallback)', setError);
        }
      }
    }
  };

  // ============================================================
  // ইউজার ডকুমেন্ট তৈরি/আপডেট হেলপার
  // ============================================================
  const ensureUserDocument = async (user) => {
    if (!user) return null;

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        await updateDoc(userRef, {
          isOnline: true,
          lastSeen: new Date().toISOString(),
        });
        return userSnap.data();
      }

      const newUserData = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'User',
        photoURL: user.photoURL || null,
        role: 'client',
        createdAt: new Date().toISOString(),
        isOnline: true,
        lastSeen: new Date().toISOString(),
        savedPosts: [],
        totalReviews: 0,
        totalRating: 0,
        averageRating: 0,
        isComplete: false,
        isVerified: false,
        verificationStatus: 'incomplete',
        isBanned: false,
        isBlocked: false,
        documentsUploaded: false,
        faceVerified: false,
        verificationMethod: null,
        documentVerified: false,
        completionScore: 0,
      };
      await setDoc(userRef, newUserData);
      return newUserData;
    } catch (error) {
      logError('Error ensuring user document', error);
      return null;
    }
  };

  // ============================================================
  // ইউজার ডাটা লোড
  // ============================================================
  const loadUserData = async (uid, authUser) => {
    if (!uid) return null;

    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        if (authUser) {
          const newData = await ensureUserDocument(authUser);
          if (newData) {
            setUserData(newData);
            setUserRole(newData.role || 'client');
            return newData;
          }
        }

        setUserData(null);
        setUserRole(null);
        return null;
      }

      const data = userSnap.data();

      let isVerified = data.isVerified || false;
      const verificationStatus = data.verificationStatus || 'incomplete';
      if (verificationStatus === 'verified') isVerified = true;

      const isComplete = data.isComplete || false;
      let completionScore = data.completionScore || 0;

      if (isComplete && completionScore < 100) {
        completionScore = 100;
        updateDoc(userRef, { completionScore: 100 }).catch(() => {});
      }

      const updatedData = { ...data, isVerified, isComplete, verificationStatus, completionScore };

      setUserData(updatedData);
      setUserRole(data.role || 'client');

      if (data.isBanned || data.isBlocked) {
        feedback.alert.error({ title: '🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।' });
      }

      return updatedData;
    } catch (error) {
      logError('Error loading user data', error);
      return null;
    }
  };

  // ============================================================
  // ইউজার ডাটা রিলোড
  // ============================================================
  const reloadUserData = async () => {
    if (!currentUser) return null;

    try {
      await refreshToken(true);

      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) return null;

      const data = userSnap.data();
      setUserData(data);
      setUserRole(data.role || 'client');
      return data;
    } catch (error) {
      logError('Error reloading user data', error);
      return null;
    }
  };

  // ============================================================
  // Auth State Listener
  // ============================================================
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      currentUserRef.current = user;

      if (user) {
        // 🔧 FIX (email verification race): `user` here can be a *cached*
        // object restored from IndexedDB persistence (e.g. on a plain page
        // refresh) whose `emailVerified` flag reflects whatever it was the
        // last time this device did a real sign-in/reload — NOT necessarily
        // the truth right now. `checkEmailVerified` forces a real refetch
        // from Firebase's servers (with one short retry, since a lone
        // reload can occasionally land on a stale response) and mutates
        // this same `user` object in place. This is the single choke point
        // every screen's `currentUser` flows through (via useAuth()), so
        // fixing it here fixes it everywhere, instead of every consumer
        // having to remember to reload for itself. Network failures here
        // are non-fatal — we fall back to whatever cached data we have
        // rather than blocking the whole app.
        try {
          await checkEmailVerified(user);
        } catch (reloadError) {
          logError('Auth user reload failed (using cached state)', reloadError);
        }

        setCurrentUser(user);
        setAuthError(null);

        await refreshToken(true);
        await saveNotificationToken(user.uid);

        const userDoc = await loadUserData(user.uid, user);

        // Firestore's `emailVerified` field (written once at registration,
        // used only for display/scoring e.g. ProfileCard) is a mirror, not
        // the source of truth — Firebase Auth's `user.emailVerified` is.
        // Keep the mirror in sync so it doesn't sit stale forever after a
        // real verification.
        if (userDoc && user.emailVerified && userDoc.emailVerified !== true) {
          updateDoc(doc(db, 'users', user.uid), { emailVerified: true }).catch((err) =>
            logError('Failed to sync emailVerified to Firestore', err)
          );
        }

        if (userDoc) {
          if (unsubscribeSnapshot.current) unsubscribeSnapshot.current();

          const userRef = doc(db, 'users', user.uid);
          unsubscribeSnapshot.current = onSnapshot(
            userRef,
            (docSnap) => {
              if (!docSnap.exists()) return;
              const data = docSnap.data();
              let isVerified = data.isVerified || false;
              const verificationStatus = data.verificationStatus || 'incomplete';
              if (verificationStatus === 'verified') isVerified = true;

              setUserData({ ...data, isVerified, verificationStatus });
              setUserRole(data.role || 'client');
            },
            (error) => logError('User document snapshot error', error)
          );
        } else {
          setAuthError('ব্যবহারকারীর তথ্য লোড করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।');
        }

        setLoading(false);
      } else {
        setCurrentUser(null);
        setUserData(null);
        setUserRole(null);
        setAuthError(null);
        setLoading(false);

        if (tokenRefreshInterval.current) {
          clearInterval(tokenRefreshInterval.current);
          tokenRefreshInterval.current = null;
        }
        if (unsubscribeSnapshot.current) {
          unsubscribeSnapshot.current();
          unsubscribeSnapshot.current = null;
        }
      }
    });

    tokenRefreshInterval.current = setInterval(() => {
      refreshToken(false);
    }, 10 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshToken(false);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleOnline = () => refreshToken(false);
    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribeAuth();
      if (tokenRefreshInterval.current) clearInterval(tokenRefreshInterval.current);
      if (unsubscribeSnapshot.current) unsubscribeSnapshot.current();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // ============================================================
  // গুগল লগইন
  // ============================================================
  const googleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userDoc = await ensureUserDocument(user);
      if (userDoc) {
        setUserData(userDoc);
        setUserRole(userDoc.role || 'client');
      }

      feedback.alert.success({ title: '✅ Google login successful!' });
      return { success: true, user };
    } catch (error) {
      if (error.code === 'auth/popup-blocked') {
        feedback.toast({ variant: 'info', title: 'Popup blocked. Redirecting to Google...' });
        await signInWithRedirect(auth, googleProvider);
        return { success: true, message: 'Redirecting to Google...' };
      }

      feedback.alert.error({ title: 'Google login failed: ' + error.message });
      return { success: false, error: error.message };
    }
  };

  // ============================================================
  // লগইন
  // ============================================================
  const login = async (email, password, rememberMe = false) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;

      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('userEmail', email);
      } else {
        localStorage.removeItem('rememberMe');
        localStorage.removeItem('userEmail');
      }

      const userDoc = await ensureUserDocument(user);
      if (userDoc) {
        setUserData(userDoc);
        setUserRole(userDoc.role || 'client');
      }

      feedback.alert.success({ title: '✅ Login successful!' });
      return { success: true, user };
    } catch (error) {
      let errorMessage = 'Login failed!';
      switch (error.code) {
        case 'auth/invalid-credential':
          errorMessage = 'Invalid email or password!';
          break;
        case 'auth/user-not-found':
          errorMessage = 'User not found!';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Wrong password!';
          break;
        default:
          errorMessage = error.message;
      }
      feedback.alert.error({ title: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  // ============================================================
  // Redirect Result Handler
  // ============================================================
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result) return;

        const user = result.user;
        const userDoc = await ensureUserDocument(user);
        if (userDoc) {
          setUserData(userDoc);
          setUserRole(userDoc.role || 'client');
        }
        feedback.alert.success({ title: '✅ Google login successful!' });
      } catch (error) {
        logError('Redirect login error', error);
        feedback.alert.error({ title: 'Google login failed: ' + error.message });
      }
    };

    handleRedirectResult();
  }, []);

  // ============================================================
  // লগআউট
  // ============================================================
  const logout = async () => {
    try {
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          await updateDoc(userRef, { isOnline: false, lastSeen: new Date().toISOString() });
        } catch (error) {
          logInfo('User document not found on logout, skipping status update');
        }
      }

      if (tokenRefreshInterval.current) {
        clearInterval(tokenRefreshInterval.current);
        tokenRefreshInterval.current = null;
      }

      await signOut(auth);
      setCurrentUser(null);
      setUserData(null);
      setUserRole(null);
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('userEmail');
      feedback.alert.success({ title: '✅ Logged out successfully!' });
      return { success: true };
    } catch (error) {
      feedback.alert.error({ title: 'Logout failed: ' + error.message });
      return { success: false };
    }
  };

  // ============================================================
  // পাসওয়ার্ড রিসেট
  // ============================================================
  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      feedback.alert.success({ title: '📧 Password reset email sent! Check your inbox.' });
      return { success: true };
    } catch (error) {
      const errorMessage =
        error.code === 'auth/user-not-found' ? 'No account found with this email!' : 'Failed to send reset email!';
      feedback.alert.error({ title: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  // ============================================================
  // createNewChat
  //
  // ⚠️ NOTE: এখানে chatId ডিটারমিনিস্টিকভাবে `${buyerId}_${sellerId}_${postId}`
  // ফরম্যাটে বানানো হয়। কিন্তু inboxHelpers.js-এর createNewChatObject()
  // (Inbox/chatContext ফ্লো থেকে ব্যবহৃত) সম্পূর্ণ ভিন্ন স্কিম ব্যবহার করে:
  // `chatContext.id || chatContext.postId || chat_${Date.now()}`। যদি
  // অ্যাপে দুই পাথই সক্রিয় থাকে, একই buyer/seller/post-এর জন্য দুইটা
  // আলাদা চ্যাট ডকুমেন্ট তৈরি হতে পারে। কোনটা আসল/প্রোডাকশনে চালু পাথ
  // তা নিশ্চিত না হয়ে এখানে কিছু বদলানো হয়নি — যাচাই করে জানিও।
  // ============================================================
  const createNewChat = async (post) => {
    if (!currentUser || !userData) {
      feedback.alert.error({ title: 'Please login to start a chat!' });
      return { success: false, error: 'User not logged in' };
    }

    const isServicePost = post?.type === 'service';
    const postId = post?.id || post?.postId;

    if (!postId) {
      feedback.alert.error({ title: 'Invalid post data!' });
      return { success: false, error: 'Invalid post' };
    }

    const buyerId = isServicePost ? currentUser.uid : post.userId;
    const sellerId = isServicePost ? post.userId : currentUser.uid;

    const buyerName = isServicePost ? userData.displayName : post.clientName;
    const buyerPhoto = isServicePost ? userData.photoURL : post.clientPhoto;
    const sellerName = isServicePost ? post.clientName : userData.displayName;
    const sellerPhoto = isServicePost ? post.clientPhoto : userData.photoURL;

    const chatId = `${buyerId}_${sellerId}_${postId}`;
    const chatRef = doc(db, 'chats', chatId);
    const postTitle = post?.title || post?.postTitle || 'Untitled Post';

    const chatData = {
      chatId,
      participants: [buyerId, sellerId],
      buyerId,
      sellerId,
      buyerName: buyerName || 'Buyer',
      buyerPhoto: buyerPhoto || null,
      sellerName: sellerName || 'Seller',
      sellerPhoto: sellerPhoto || null,
      postId,
      postTitle,
      postType: isServicePost ? 'service' : 'hire',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: 'Start conversation',
      unreadCount: { [buyerId]: 0, [sellerId]: 1 },
      isBlocked: false,
      blockedBy: null,
    };

    try {
      await setDoc(chatRef, chatData, { merge: true });
      return {
        success: true,
        chatId,
        chatData,
        otherPartyId: isServicePost ? sellerId : buyerId,
        otherPartyName: isServicePost ? sellerName : buyerName,
        otherPartyPhoto: isServicePost ? sellerPhoto : buyerPhoto,
      };
    } catch (error) {
      logError('Error creating chat', error);
      feedback.alert.error({ title: 'Failed to start chat. Please try again.' });
      return { success: false, error: error.message };
    }
  };

  // ============================================================
  // getOrCreateChat
  // ============================================================
  const getOrCreateChat = async (post) => {
    if (!currentUser || !userData) {
      return { success: false, error: 'User not logged in' };
    }

    const postId = post?.id || post?.postId;
    if (!postId) return { success: false, error: 'Invalid post' };

    const isServicePost = post?.type === 'service';
    const buyerId = isServicePost ? currentUser.uid : post.userId;
    const sellerId = isServicePost ? post.userId : currentUser.uid;
    const chatId = `${buyerId}_${sellerId}_${postId}`;

    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (chatSnap.exists()) {
      const data = chatSnap.data();
      const otherPartyId = isServicePost ? sellerId : buyerId;
      return {
        success: true,
        chatId,
        chatData: data,
        exists: true,
        otherPartyId,
        otherPartyName: isServicePost ? data.sellerName : data.buyerName,
        otherPartyPhoto: isServicePost ? data.sellerPhoto : data.buyerPhoto,
      };
    }

    return await createNewChat(post);
  };

  // ============================================================
  // Helpers
  // ============================================================
  const getRememberedEmail = () => {
    const rememberMe = localStorage.getItem('rememberMe');
    const userEmail = localStorage.getItem('userEmail');
    return rememberMe === 'true' && userEmail ? userEmail : '';
  };

  const getDashboardPath = () => {
    switch (userRole) {
      case 'admin':
        return '/admin';
      case 'worker':
        return '/worker';
      case 'seller':
        return '/seller';
      default:
        return '/';
    }
  };

  const getProfileProgress = (data) => {
    if (!data) return 0;
    let progress = 0;
    if (data.displayName || data.firstName) progress += 10;
    if (data.email) progress += 5;
    if (data.phone) progress += 5;
    if (data.documentsUploaded) progress += 40;
    if (data.faceVerified) progress += 40;
    if (data.isComplete) progress = 100;
    return Math.min(progress, 100);
  };

  const accessLevel = getAccessLevel(userData);

  // ============================================================
  // FIX: আগে এই চারটা `accessLevel.level >= 3` চেক করত — কিন্তু
  // getAccessLevel()-এ "Rejected" স্ট্যাটাসের level (4) "Verified"-এর
  // level (3)-এর চেয়ে বেশি! ফলে ভেরিফিকেশন প্রত্যাখ্যাত হওয়া ইউজারও
  // (isBlocked না হলে) এই সব চেক পাস করে যেত — অফার পাঠানো, transact
  // করা, পোস্ট তৈরি করা, ড্যাশবোর্ড অ্যাক্সেস — সবকিছুই একজন verified
  // ইউজারের মতোই পেয়ে যেত। এখন `!isRejected`ও স্পষ্টভাবে চেক করা হচ্ছে।
  // ============================================================
  const hasFullAccessLevel = accessLevel.level >= 3 && !accessLevel.isRejected && !accessLevel.isBlocked;
  const canSendOffer = hasFullAccessLevel;
  const canTransact = hasFullAccessLevel;
  const canCreatePost = hasFullAccessLevel;
  const canAccessDashboard = hasFullAccessLevel;

  const value = {
    currentUser,
    userData,
    userRole,
    loading,
    authError,

    login,
    googleLogin,
    logout,
    resetPassword,
    getRememberedEmail,
    getDashboardPath,
    createNewChat,
    getOrCreateChat,
    reloadUserData,
    refreshToken,

    // 🔧 FIX (item #8): single entry point for (re)saving the FCM
    // token to users/{uid}.notification.token. Previously this only
    // ever ran once, at login (below). App.jsx kept its own second,
    // parallel implementation — writing a *different* field,
    // users/{uid}.fcmToken — specifically so it could refresh the
    // token right after the user granted permission via
    // NotificationBanner (a login-only refresh misses that case
    // entirely). That left two different schemas for the same piece
    // of data. Exposing this function here lets the banner's grant
    // flow refresh the *same* field login already writes to, so
    // there's one schema and one save path either way.
    refreshNotificationToken: () => saveNotificationToken(currentUser?.uid),

    progress: getProfileProgress(userData),
    completionScore: getProfileProgress(userData),

    accessLevel: accessLevel.level,
    accessLabel: accessLevel.label,

    isVerified: userData?.isVerified || false,
    isComplete: userData?.isComplete || false,
    isPending: userData?.verificationStatus === 'pending' || false,
    isRejected: userData?.verificationStatus === 'rejected' || false,
    isBlocked: userData?.isBanned || userData?.isBlocked || false,

    isAdmin: userRole === 'admin',
    isWorker: userRole === 'worker',
    isClient: userRole === 'client' || userRole === 'seller',
    isSeller: userRole === 'seller' || userRole === 'freelancer',
    isBuyer: userRole === 'client' || userRole === 'buyer',

    canViewPosts: true,
    canChat: !(userData?.isBanned || userData?.isBlocked),
    canSendOffer,
    canTransact,
    canCreatePost,
    canAccessDashboard,
    canAccessDeals: canAccessDashboard,
    canAccessPayments: canAccessDashboard,
    canCreatePosts: canCreatePost,

    needsVerification: userData?.isComplete && !userData?.isVerified && !(userData?.isBanned || userData?.isBlocked),
    isFullyVerified: userData?.isVerified && userData?.isComplete && !(userData?.isBanned || userData?.isBlocked),
    hasFullAccess: userData?.isVerified && userData?.isComplete && !(userData?.isBanned || userData?.isBlocked),
    verificationStatus: userData?.verificationStatus || 'incomplete',
    isBanned: userData?.isBanned || false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;




