// src/context/AuthContext.jsx

import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut, 
  sendPasswordResetEmail,
  onAuthStateChanged,
  getIdToken,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { getToken } from 'firebase/messaging';
import { messaging } from '@/firebase';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// ============================================================
// ✅ ইউজার লেভেল ও এক্সেস কন্ট্রোল লজিক
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
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  
  const tokenRefreshInterval = useRef(null);
  const unsubscribeSnapshot = useRef(null);

  // ============================================================
  // ✅ Token Refresh Function
  // ============================================================
  const refreshToken = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await getIdToken(user, true);
        if (import.meta.env.DEV) {
          console.log('✅ Token refreshed successfully');
        }
        return token;
      }
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      
      if (error.code === 'auth/network-request-failed') {
        console.warn('Network error, retrying in 5s...');
        setTimeout(refreshToken, 5000);
      } else if (error.code === 'auth/user-token-expired') {
        console.warn('Token expired, refreshing...');
        try {
          const user = auth.currentUser;
          if (user) {
            return await getIdToken(user, true);
          }
        } catch (retryError) {
          console.error('Retry failed:', retryError);
        }
      } else if (error.code === 'auth/invalid-refresh-token') {
        console.warn('Invalid refresh token, logging out...');
        await signOut(auth);
        setCurrentUser(null);
        setUserData(null);
        setUserRole(null);
      }
      
      return null;
    }
  };

  // ============================================================
  // ✅ FCM Token Save Function (FIXED)
  // ============================================================
  const saveNotificationToken = async (uid) => {
    if (!uid) {
      console.warn("⚠️ No UID provided for FCM token save");
      return;
    }

    // ✅ token variable outside try-catch
    let token = null;

    try {
      // ✅ Check if browser supports notifications
      if (!('Notification' in window)) {
        console.warn("⚠️ This browser doesn't support notifications");
        return;
      }

      // ✅ Check permission
      let permission = Notification.permission;
      
      if (permission === 'denied') {
        console.warn("⚠️ Notification permission denied");
        return;
      }

      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn("⚠️ Notification permission not granted");
          return;
        }
      }

      // ✅ Get messaging instance
      const messagingInstance = await messaging;
      
      if (!messagingInstance) {
        console.warn("⚠️ Firebase Messaging not supported");
        return;
      }

      // ✅ Get VAPID key
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.error("❌ VAPID key missing");
        return;
      }

      // ✅ Get FCM token
      token = await getToken(messagingInstance, {
        vapidKey: vapidKey,
      });

      if (!token) {
        console.warn("⚠️ Failed to get FCM token");
        return;
      }

      console.log("✅ FCM Token received:", token);

      // ✅ Save token to Firestore
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        'notification.token': token,
        'notification.platform': 'web',
        'notification.updatedAt': serverTimestamp(),
        'notification.enabled': true,
      });

      console.log("✅ FCM Token saved to Firestore for user:", uid);

    } catch (error) {
      console.error("❌ Error saving FCM token:", error);
      
      // ✅ Try with setDoc as fallback (token is accessible here)
      if (token) {
        try {
          const userRef = doc(db, 'users', uid);
          await setDoc(userRef, {
            notification: {
              token: token,
              platform: 'web',
              updatedAt: new Date().toISOString(),
              enabled: true,
            }
          }, { merge: true });
          console.log("✅ FCM Token saved (setDoc fallback) for user:", uid);
        } catch (setError) {
          console.error("❌ Error saving FCM token (setDoc fallback):", setError);
        }
      } else {
        console.warn("⚠️ No token to save in fallback");
      }
    }
  };

  // ============================================================
  // ✅ ইউজার ডকুমেন্ট তৈরি/আপডেট হেলপার
  // ============================================================
  const ensureUserDocument = async (user) => {
    if (!user) return null;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          isOnline: true,
          lastSeen: new Date().toISOString()
        });
        return userSnap.data();
      } else {
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
          completionScore: 0
        };
        await setDoc(userRef, newUserData);
        return newUserData;
      }
    } catch (error) {
      console.error("Error ensuring user document:", error);
      return null;
    }
  };

  // ============================================================
  // ✅ ইউজার ডাটা লোড (রিয়েল-টাইম)
  // ============================================================
  const loadUserData = async (uid) => {
    if (!uid) return null;
    
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        console.warn("⚠️ User document not found for uid:", uid);
        
        if (currentUser && currentUser.uid === uid) {
          console.log("🔄 Creating missing user document...");
          const newData = await ensureUserDocument(currentUser);
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
      let verificationStatus = data.verificationStatus || 'incomplete';
      
      if (verificationStatus === 'verified') {
        isVerified = true;
      }
      
      let isComplete = data.isComplete || false;
      let completionScore = data.completionScore || 0;
      
      if (isComplete && completionScore < 100) {
        completionScore = 100;
        await updateDoc(userRef, { completionScore: 100 });
      }
      
      const updatedData = {
        ...data,
        isVerified: isVerified,
        isComplete: isComplete,
        verificationStatus: verificationStatus,
        completionScore: completionScore
      };
      
      setUserData(updatedData);
      setUserRole(data.role || 'client');
      
      if (data.isBanned || data.isBlocked) {
        console.log("🚫 User is blocked:", uid);
        toast.error('🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।');
      }
      
      return updatedData;
      
    } catch (error) {
      console.error("Error loading user data:", error);
      return null;
    }
  };

  // ============================================================
  // ✅ ইউজার ডাটা রিলোড ফাংশন
  // ============================================================
  const reloadUserData = async () => {
    if (!currentUser) {
      console.log("⚠️ No user to reload");
      return null;
    }
    
    try {
      console.log("🔄 Reloading user data for:", currentUser.uid);
      
      await refreshToken();
      
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const data = userSnap.data();
        console.log("📊 Reloaded user data:", data);
        
        setUserData(data);
        setUserRole(data.role || 'client');
        
        return data;
      } else {
        console.warn("⚠️ User document not found on reload");
        return null;
      }
    } catch (error) {
      console.error("❌ Error reloading user data:", error);
      return null;
    }
  };

  // ============================================================
  // ✅ Auth State Listener
  // ============================================================
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        console.log('✅ Auth persistence set to LOCAL');
      })
      .catch((error) => {
        console.error('❌ Error setting persistence:', error);
      });

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log("🔥 Auth state changed - User logged in:", user.uid);
        setCurrentUser(user);
        setAuthError(null);
        
        await refreshToken();
        await saveNotificationToken(user.uid);
        
        const userDoc = await loadUserData(user.uid);
        
        if (userDoc) {
          setUserData(userDoc);
          setUserRole(userDoc.role || 'client');
          setLoading(false);
          
          if (unsubscribeSnapshot.current) {
            unsubscribeSnapshot.current();
          }
          
          const userRef = doc(db, 'users', user.uid);
          unsubscribeSnapshot.current = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              console.log("🔄 User document updated in real-time:", data);
              
              let isVerified = data.isVerified || false;
              let verificationStatus = data.verificationStatus || 'incomplete';
              
              if (verificationStatus === 'verified') {
                isVerified = true;
              }
                
              setUserData({
                ...data,
                isVerified: isVerified,
                verificationStatus: verificationStatus
              });
              setUserRole(data.role || 'client');
            }
          });
        } else {
          console.log("⏳ Waiting for user document to be created...");
          setLoading(true);
        }
        
      } else {
        console.log("🔥 Auth state changed - User logged out");
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
      refreshToken();
    }, 10 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshToken();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleOnline = () => {
      refreshToken();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribeAuth();
      if (tokenRefreshInterval.current) {
        clearInterval(tokenRefreshInterval.current);
      }
      if (unsubscribeSnapshot.current) {
        unsubscribeSnapshot.current();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // ============================================================
  // ✅ গুগল লগইন
  // ============================================================
  const googleLogin = async () => {
    const provider = new GoogleAuthProvider();
    
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      await refreshToken();
      await saveNotificationToken(user.uid);
      
      const userDoc = await ensureUserDocument(user);
      if (userDoc) {
        setUserData(userDoc);
        setUserRole(userDoc.role || 'client');
      }
      
      toast.success('✅ Google login successful!');
      return { success: true, user };
      
    } catch (error) {
      if (error.code === 'auth/popup-blocked') {
        toast.loading('Popup blocked. Redirecting to Google...');
        await signInWithRedirect(auth, provider);
        return { success: true, message: 'Redirecting to Google...' };
      }
      
      toast.error('Google login failed: ' + error.message);
      return { success: false, error: error.message };
    }
  };

  // ============================================================
  // ✅ লগইন ফাংশন
  // ============================================================
  const login = async (email, password, rememberMe = false) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
      await refreshToken();
      await saveNotificationToken(user.uid);
      
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
      
      toast.success('✅ Login successful!');
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
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // ============================================================
  // ✅ Redirect Result Handler
  // ============================================================
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          
          await refreshToken();
          await saveNotificationToken(user.uid);
          
          const userDoc = await ensureUserDocument(user);
          if (userDoc) {
            setUserData(userDoc);
            setUserRole(userDoc.role || 'client');
          }
          toast.success('✅ Google login successful!');
        }
      } catch (error) {
        console.error("Redirect login error:", error);
        toast.error('Google login failed: ' + error.message);
      }
    };
    
    handleRedirectResult();
  }, []);

  // ============================================================
  // ✅ লগআউট
  // ============================================================
  const logout = async () => {
    try {
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          await updateDoc(userRef, {
            isOnline: false,
            lastSeen: new Date().toISOString()
          });
        } catch (error) {
          console.log("User document not found, skipping status update");
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
      toast.success('✅ Logged out successfully!');
      return { success: true };
    } catch (error) {
      toast.error('Logout failed: ' + error.message);
      return { success: false };
    }
  };

  // ============================================================
  // ✅ পাসওয়ার্ড রিসেট
  // ============================================================
  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success('📧 Password reset email sent! Check your inbox.');
      return { success: true };
    } catch (error) {
      let errorMessage = 'Failed to send reset email!';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email!';
      }
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // ============================================================
  // ✅ createNewChat ফাংশন
  // ============================================================
  const createNewChat = async (post) => {
    if (!currentUser || !userData) {
      toast.error('Please login to start a chat!');
      return { success: false, error: 'User not logged in' };
    }

    const isServicePost = post?.type === 'service';
    const postId = post?.id || post?.postId;
    
    if (!postId) {
      toast.error('Invalid post data!');
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
      chatId: chatId,
      participants: [buyerId, sellerId],
      buyerId: buyerId,
      sellerId: sellerId,
      buyerName: buyerName || 'Buyer',
      buyerPhoto: buyerPhoto || null,
      sellerName: sellerName || 'Seller',
      sellerPhoto: sellerPhoto || null,
      postId: postId,
      postTitle: postTitle,
      postType: isServicePost ? 'service' : 'hire',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: 'Start conversation',
      unreadCount: {
        [buyerId]: 0,
        [sellerId]: 1
      },
      isBlocked: false,
      blockedBy: null
    };

    try {
      await setDoc(chatRef, chatData, { merge: true });
      console.log("✅ Chat created successfully!", { chatId, buyerId, sellerId });
      
      return { 
        success: true, 
        chatId: chatId, 
        chatData: chatData,
        otherPartyId: isServicePost ? sellerId : buyerId,
        otherPartyName: isServicePost ? sellerName : buyerName,
        otherPartyPhoto: isServicePost ? sellerPhoto : buyerPhoto
      };
      
    } catch (error) {
      console.error("❌ Error creating chat:", error);
      toast.error('Failed to start chat. Please try again.');
      return { success: false, error: error.message };
    }
  };

  // ============================================================
  // ✅ getOrCreateChat
  // ============================================================
  const getOrCreateChat = async (post) => {
    if (!currentUser || !userData) {
      return { success: false, error: 'User not logged in' };
    }

    const postId = post?.id || post?.postId;
    if (!postId) {
      return { success: false, error: 'Invalid post' };
    }

    const isServicePost = post?.type === 'service';
    const buyerId = isServicePost ? currentUser.uid : post.userId;
    const sellerId = isServicePost ? post.userId : currentUser.uid;
    const chatId = `${buyerId}_${sellerId}_${postId}`;

    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (chatSnap.exists()) {
      const data = chatSnap.data();
      const otherPartyId = isServicePost ? sellerId : buyerId;
      const otherPartyName = isServicePost ? data.sellerName : data.buyerName;
      const otherPartyPhoto = isServicePost ? data.sellerPhoto : data.buyerPhoto;
      
      return {
        success: true,
        chatId: chatId,
        chatData: data,
        exists: true,
        otherPartyId,
        otherPartyName,
        otherPartyPhoto
      };
    } else {
      return await createNewChat(post);
    }
  };

  // ============================================================
  // ✅ রিমেম্বার মি চেক
  // ============================================================
  const getRememberedEmail = () => {
    const rememberMe = localStorage.getItem('rememberMe');
    const userEmail = localStorage.getItem('userEmail');
    if (rememberMe === 'true' && userEmail) {
      return userEmail;
    }
    return '';
  };

  // ============================================================
  // ✅ ইউজারের রোল অনুযায়ী রিডাইরেক্ট
  // ============================================================
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

  // ============================================================
  // ✅ প্রোফাইল প্রগ্রেস ক্যালকুলেটর
  // ============================================================
  const getProfileProgress = (userData) => {
    if (!userData) return 0;
    
    let progress = 0;
    
    if (userData.displayName || userData.firstName) progress += 10;
    if (userData.email) progress += 5;
    if (userData.phone) progress += 5;
    if (userData.documentsUploaded) progress += 40;
    if (userData.faceVerified) progress += 40;
    if (userData.isComplete) progress = 100;
    
    return Math.min(progress, 100);
  };

  // ============================================================
  // ✅ অ্যাক্সেস লেভেল ক্যালকুলেট করুন
  // ============================================================
  const accessLevel = getAccessLevel(userData);

  // ============================================================
  // ✅ পারমিশন ফ্ল্যাগ
  // ============================================================
  const canSendOffer = accessLevel.level >= 3 && !accessLevel.isBlocked;
  const canTransact = accessLevel.level >= 3 && !accessLevel.isBlocked;
  const canCreatePost = accessLevel.level >= 3 && !accessLevel.isBlocked;
  const canAccessDashboard = accessLevel.level >= 3 && !accessLevel.isBlocked;

  // ============================================================
  // ✅ Value অবজেক্ট
  // ============================================================
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
    canSendOffer: canSendOffer,
    canTransact: canTransact,
    canCreatePost: canCreatePost,
    canAccessDashboard: canAccessDashboard,
    canAccessDeals: canAccessDashboard,
    canAccessPayments: canAccessDashboard,
    canCreatePosts: canCreatePost,
    
    needsVerification: userData?.isComplete && !userData?.isVerified && !(userData?.isBanned || userData?.isBlocked),
    isFullyVerified: userData?.isVerified && userData?.isComplete && !(userData?.isBanned || userData?.isBlocked),
    hasFullAccess: userData?.isVerified && userData?.isComplete && !(userData?.isBanned || userData?.isBlocked),
    verificationStatus: userData?.verificationStatus || 'incomplete',
    isBanned: userData?.isBanned || false
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;