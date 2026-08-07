// src/hooks/useAccessControl.js
import { useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export const useAccessControl = () => {
  const { 
    userData,
    isVerified,
    isComplete,
    isPending,
    isRejected,
    isBlocked,
    canSendOffer,
    canTransact,
    canCreatePost,
    accessLevel,
    accessLabel,
    needsVerification,
    isFullyVerified,
    userRole,
    currentUser,
    verificationStatus // 🔥 নতুন যোগ
  } = useAuth();

  // ── ✅ লেভেল অনুযায়ী মেসেজ (মেমোয়াইজড) ──
  const statusMessage = useMemo(() => {
    // 🔥 1. ব্লক চেক
    if (isBlocked) {
      return { 
        title: '🚫 অ্যাকাউন্ট ব্লক করা হয়েছে',
        message: 'আপনার অ্যাকাউন্ট অ্যাডমিন দ্বারা ব্লক করা হয়েছে। সাপোর্টে যোগাযোগ করুন।',
        type: 'error',
        icon: 'fa-solid fa-ban'
      };
    }
    
    // 🔥 2. যাচাই প্রত্যাখ্যাত
    if (isRejected) {
      return {
        title: '❌ যাচাই প্রত্যাখ্যাত',
        message: 'আপনার ডকুমেন্ট যাচাই প্রত্যাখ্যাত হয়েছে। সঠিক ডকুমেন্ট আপলোড করুন।',
        type: 'error',
        icon: 'fa-solid fa-times-circle'
      };
    }
    
    // 🔥 3. যাচাই প্রক্রিয়াধীন (ডকুমেন্ট জমা দিয়েছে)
    if (isPending) {
      return {
        title: '⏳ যাচাই প্রক্রিয়াধীন',
        message: 'আপনার ডকুমেন্ট ২-৩ ঘণ্টার মধ্যে পর্যালোচনা করা হবে।',
        type: 'pending',
        icon: 'fa-solid fa-clock'
      };
    }
    
    // 🔥 4. প্রোফাইল সম্পন্ন কিন্তু যাচাই বাকি (নতুন ইউজার)
    if (isComplete && !isVerified && !isPending && !isRejected) {
      return {
        title: '🔄 যাচাই বাকি',
        message: 'আপনার প্রোফাইল সম্পূর্ণ। অ্যাডমিন দ্বারা যাচাই করা বাকি।',
        type: 'pending_verification',
        icon: 'fa-solid fa-hourglass-half'
      };
    }
    
    // 🔥 5. অসম্পূর্ণ প্রোফাইল
    if (!isComplete) {
      return {
        title: '📝 প্রোফাইল সম্পূর্ণ করুন',
        message: 'লেনদেন করার জন্য প্রোফাইল সম্পূর্ণ করুন।',
        type: 'incomplete',
        icon: 'fa-solid fa-user-edit'
      };
    }
    
    // 🔥 6. সম্পূর্ণ যাচাইকৃত
    if (isFullyVerified) {
      return {
        title: '✅ অ্যাকাউন্ট যাচাই সম্পন্ন',
        message: 'আপনি এখন সম্পূর্ণ সক্রিয়। লেনদেন করতে পারবেন।',
        type: 'success',
        icon: 'fa-solid fa-check-circle'
      };
    }
    
    // 🔥 7. ডিফল্ট (লোডিং)
    return {
      title: '📊 প্রোফাইল লোড হচ্ছে',
      message: 'দয়া করে অপেক্ষা করুন...',
      type: 'info',
      icon: 'fa-solid fa-spinner fa-spin'
    };
  }, [isBlocked, isRejected, isPending, isComplete, isVerified, isFullyVerified]);

  // ── ✅ অ্যাকশন পারমিশন চেক (মেমোয়াইজড) ──
  const can = useCallback((action) => {
    const permissions = {
      // 🔥 বেসিক পারমিশন (সবার জন্য)
      'viewPosts': true,
      'viewProfile': true,
      'report': true,
      'viewPublicData': true,
      
      // 🔥 চ্যাট (ব্লক না হলে)
      'chat': !isBlocked,
      
      // 🔥 ইন্টারমিডিয়েট (প্রোফাইল সম্পন্ন হলে)
      'review': isComplete && !isBlocked,
      'rate': isComplete && !isBlocked,
      'editProfile': !isBlocked,
      
      // 🔥 অ্যাডভান্সড (যাচাইকৃত হলে)
      'sendOffer': canSendOffer && !isBlocked,
      'createPost': canCreatePost && !isBlocked,
      'viewDeals': !isBlocked,
      
      // 🔥 ফুল অ্যাক্সেস (সম্পূর্ণ যাচাইকৃত)
      'transact': canTransact && !isBlocked,
      'accessDashboard': isFullyVerified && !isBlocked,
      'createDeal': isFullyVerified && !isBlocked,
      'viewWallet': isFullyVerified && !isBlocked,
      'transferMoney': canTransact && !isBlocked,
      'withdraw': canTransact && !isBlocked,
      'deposit': canTransact && !isBlocked,
      'viewPaymentHistory': canTransact && !isBlocked,
      
      // 🔥 অ্যাডমিন পারমিশন
      'block': userRole === 'admin',
      'verify': userRole === 'admin',
      'delete': userRole === 'admin',
      'viewAllUsers': userRole === 'admin',
      'viewAllDeals': userRole === 'admin',
      'viewAllTransactions': userRole === 'admin',
      'manageReports': userRole === 'admin'
    };
    return permissions[action] || false;
  }, [isBlocked, canSendOffer, canTransact, canCreatePost, isFullyVerified, userRole, isComplete]);

  // ── ✅ গার্ড (রেডিরেক্ট) ──
  const requireVerified = useCallback((navigate, fallbackPath = '/verify-pending') => {
    if (!isFullyVerified && !isBlocked) {
      navigate(fallbackPath);
      return false;
    }
    if (isBlocked) {
      navigate('/blocked');
      return false;
    }
    return true;
  }, [isFullyVerified, isBlocked]);

  const requireComplete = useCallback((navigate, fallbackPath = '/profile') => {
    if (!isComplete && !isBlocked) {
      navigate(fallbackPath);
      return false;
    }
    if (isBlocked) {
      navigate('/blocked');
      return false;
    }
    return true;
  }, [isComplete, isBlocked]);

  const requireAuth = useCallback((navigate, fallbackPath = '/login') => {
    if (!currentUser) {
      navigate(fallbackPath);
      return false;
    }
    return true;
  }, [currentUser]);

  // ── ✅ রেডিরেক্ট হেল্পার (কম্পোনেন্টে ব্যবহারের জন্য) ──
  const getRedirectPath = useCallback(() => {
    if (isBlocked) return '/blocked';
    if (isRejected) return '/verify-rejected';
    if (!isComplete) return '/profile';
    if (isPending) return '/verify-pending';
    if (!isFullyVerified) return '/verify-pending';
    return null;
  }, [isBlocked, isRejected, isComplete, isPending, isFullyVerified]);

  // ── ✅ ইউজার লেভেলের নাম ──
  const levelName = useMemo(() => {
    const levels = {
      0: '🚫 ব্লক করা হয়েছে',
      1: '📝 অসম্পূর্ণ প্রোফাইল',
      2: '⏳ যাচাই প্রক্রিয়াধীন',
      3: '✅ যাচাইকৃত',
      4: '❌ যাচাই প্রত্যাখ্যাত',
      5: '🔄 যাচাই বাকি' // 🔥 নতুন
    };
    return levels[accessLevel] || '📊 লোড হচ্ছে...';
  }, [accessLevel]);

  // ── ✅ ইউজার স্ট্যাটাস লেবেল ──
  const statusLabel = useMemo(() => {
    if (isBlocked) return 'blocked';
    if (isRejected) return 'rejected';
    if (isPending) return 'pending';
    if (isComplete && !isVerified) return 'pending_verification';
    if (!isComplete) return 'incomplete';
    if (isFullyVerified) return 'verified';
    return 'loading';
  }, [isBlocked, isRejected, isPending, isComplete, isVerified, isFullyVerified]);

  // ── ✅ পারমিশন গ্রুপ ──
  const permissions = useMemo(() => ({
    basic: {
      viewPosts: true,
      viewProfile: true,
      report: true
    },
    intermediate: {
      chat: !isBlocked,
      review: isComplete && !isBlocked,
      rate: isComplete && !isBlocked,
      editProfile: !isBlocked
    },
    advanced: {
      sendOffer: canSendOffer && !isBlocked,
      createPost: canCreatePost && !isBlocked,
      viewDeals: !isBlocked,
      viewPublicData: true
    },
    full: {
      transact: canTransact && !isBlocked,
      accessDashboard: isFullyVerified && !isBlocked,
      createDeal: isFullyVerified && !isBlocked,
      viewWallet: isFullyVerified && !isBlocked,
      transferMoney: canTransact && !isBlocked,
      withdraw: canTransact && !isBlocked,
      deposit: canTransact && !isBlocked,
      viewPaymentHistory: canTransact && !isBlocked
    },
    admin: {
      block: userRole === 'admin',
      verify: userRole === 'admin',
      delete: userRole === 'admin',
      viewAllUsers: userRole === 'admin',
      viewAllDeals: userRole === 'admin',
      viewAllTransactions: userRole === 'admin',
      manageReports: userRole === 'admin'
    }
  }), [isBlocked, isComplete, canSendOffer, canCreatePost, canTransact, isFullyVerified, userRole]);

  // ── ✅ কম্পোনেন্টে ব্যবহারের জন্য হেল্পার ──
  const getPermissionLevel = useCallback((requiredLevel) => {
    const levelMap = {
      'basic': 0,
      'intermediate': 1,
      'advanced': 2,
      'full': 3,
      'admin': 4
    };
    return accessLevel >= (levelMap[requiredLevel] || 0);
  }, [accessLevel]);

  // ── ✅ ইউজার কি যাচাই করতে পারবে? ──
  const canVerifyUser = useCallback(() => {
    return userRole === 'admin' && !isBlocked;
  }, [userRole, isBlocked]);

  // ── ✅ ইউজার কি ব্লক করতে পারবে? ──
  const canBlockUser = useCallback(() => {
    return userRole === 'admin' && !isBlocked;
  }, [userRole, isBlocked]);

  // ── ✅ রিটার্ন ──
  return {
    // ── স্ট্যাটাস ──
    isVerified,
    isComplete,
    isPending,
    isRejected,
    isBlocked,
    accessLevel,
    accessLabel,
    needsVerification,
    isFullyVerified,
    levelName,
    userRole,
    statusLabel, // 🔥 নতুন
    
    // ── মেসেজ ──
    statusMessage,
    
    // ── পারমিশন ──
    can,
    canSendOffer,
    canTransact,
    canCreatePost,
    permissions,
    getPermissionLevel,
    
    // ── গার্ড ──
    requireVerified,
    requireComplete,
    requireAuth,
    getRedirectPath,
    
    // ── অ্যাডমিন হেল্পার ──
    canVerifyUser,
    canBlockUser,
    
    // ── এক্সট্রা ──
    isAdmin: userRole === 'admin',
    isClient: userRole === 'client' || userRole === 'seller',
    isSeller: userRole === 'seller' || userRole === 'freelancer',
    isBuyer: userRole === 'client' || userRole === 'buyer',
    isPendingVerification: isComplete && !isVerified && !isPending && !isRejected, // 🔥 নতুন
    isIncomplete: !isComplete,
    isVerifiedUser: isFullyVerified
  };
};

export default useAccessControl;