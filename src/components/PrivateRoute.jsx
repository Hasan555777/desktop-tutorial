// src/components/PrivateRoute.jsx

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAccessControl } from '../hooks/useAccessControl';
import LoadingSpinner from './LoadingSpinner';

// ✅ অ্যাডমিন ইমেইল লিস্ট
const ADMIN_EMAILS = [
  'hammanmusa362@gmail.com',
  'hasanmahmudmd362@gmail.com',
];

const PrivateRoute = ({ 
  children, 
  requireVerified = false, 
  requireComplete = false,
  requireAdmin = false,
  requireSeller = false,
  requireBuyer = false,
  redirectPath = null,
  allowedRoles = []
}) => {
  const { currentUser, loading } = useAuth();
  
  const { 
    isFullyVerified, 
    isComplete, 
    isBlocked,
    isPending,
    isRejected,
    userRole,
    accessLevel,
    getRedirectPath
  } = useAccessControl();



  // ✅ ইউজার অ্যাডমিন কিনা চেক করুন (রোল অথবা ইমেইল)
  const isAdmin = currentUser && (
    userRole === 'admin' || 
    ADMIN_EMAILS.includes(currentUser.email)
  );

  // ── লোডিং ──
  if (loading) {
    return <LoadingSpinner />;
  }

  // ── ১. ইউজার লগইন চেক ──
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // ── ২. ব্লকড চেক ──
  if (isBlocked) {
    if (import.meta.env.DEV) {
      console.log("🚫 User is blocked, redirecting to /blocked");
    }
    return <Navigate to="/blocked" replace />;
  }

  // ── ৩. রিজেক্টেড চেক ──
  if (isRejected) {
    return <Navigate to="/verify-rejected" replace />;
  }

  // ── ৪. পেন্ডিং চেক ──
  if (isPending && requireVerified) {
    return <Navigate to="/verify-pending" replace />;
  }

  // ── ৫. কমপ্লিট চেক ──
  if (requireComplete && !isComplete) {
    const path = redirectPath || '/profile';
    return <Navigate to={path} replace />;
  }




  // ── ৬. ভেরিফাইড চেক ──
  if (requireVerified && !isFullyVerified) {
    const path = redirectPath || '/verify-pending';
    return <Navigate to={path} replace />;
  }

  // ── ৭. অ্যাডমিন চেক (ইমেইল + রোল) ──
  if (requireAdmin && !isAdmin) {
    if (import.meta.env.DEV) {
      console.log("❌ Admin access denied:", {
        email: currentUser?.email,
        userRole: userRole,
        isAdmin: isAdmin
      });
    }
    return <Navigate to="/" replace />;
  }

  // ── ৮. রোল বেসড চেক ──
  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  // ── ৯. সেলার চেক ──
  if (requireSeller && userRole !== 'seller' && userRole !== 'freelancer') {
    return <Navigate to="/" replace />;
  }

  // ── ১০. বায়ার চেক ──
  if (requireBuyer && userRole !== 'client' && userRole !== 'buyer') {
    return <Navigate to="/" replace />;
  }

  // ── ১১. অ্যাক্সেস লেভেল চেক ──
  if (requireVerified && accessLevel < 3) {
    const path = redirectPath || getRedirectPath();
    return <Navigate to={path} replace />;
  }

  if (import.meta.env.DEV) {
    console.log("✅ PrivateRoute -> Rendering Children");
  }

  // ── ১২. সব চেক পাস → চাইল্ড রেন্ডার ──
  return children;
};

export default PrivateRoute;