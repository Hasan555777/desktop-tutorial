// src/pages/Admin/AdminDashboard.jsx
//
// ✅ ADDED:
// - New "Disputes" tab (⚖️) rendering DisputesTable, with badge count.
// - New UserFullAccessModal wired via a new `selectedFullAccessUser` state,
//   triggered by the 💰 button added in UsersTable.jsx (onFullAccess prop).
//   This is ADDITIVE — the existing UserDetailModal (KYC review) is
//   untouched and still works exactly as before.
// - Admin-only chat monitor tab (all users' conversations + deleted
//   message recovery, for dispute/support investigation).
// ✅ FIXED:
// - Added handleEditPost function for editing pending posts
// - Added handleEditPendingEdit function for editing pending edits
// - RBAC gap closure: every sensitive admin action (verify/delete
//   user, wallet adjustment, dispute resolution, deal cancellation,
//   post/edit/report moderation) is now gated by requirePermission()
//   at the point of the ACTION, not just by hiding the tab — using
//   the SAME permission keys defined in constants/admin.js
//   (ADMIN_PERMISSIONS = ['users','verification','finance',
//   'moderation','announcements']). An earlier draft of this fix
//   introduced new 'support'/'deals' permission keys that don't
//   exist in ADMIN_PERMISSIONS or in AdminManagement.jsx's grant UI —
//   since a sub-admin can only ever be granted one of the five real
//   keys, checking against 'support'/'deals' would always evaluate
//   false and permanently lock every sub-admin out of posts/deals/
//   disputes/pending-posts/pending-edits/reports regardless of what
//   they were granted. Reverted those checks back to 'moderation',
//   matching the tab-level permission these actions already sit
//   under.

// src/pages/Admin/AdminDashboard.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { 
  doc, 
  getDoc,
  setDoc,
  updateDoc,   // ✅ এই লাইনটি যোগ করুন
  deleteDoc,   // ✅ প্রয়োজন হলে deleteDoc-ও যোগ করুন
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  writeBatch,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import useAdminNotifications from './hooks/useAdminNotifications';
import useAdminData from './hooks/useAdminData';
import NotificationBanner from '../../shared/ui/NotificationBanner/NotificationBanner';
import SoundSettings from '../../shared/ui/Sound/SoundSettings';
import AdminAnnouncement from './AdminAnnouncement';
import AdminContentSkeleton from './components/AdminContentSkeleton';
import IdentityDatabase from './components/IdentityDatabase';
import GuideEditor from './components/GuideEditor';

// ── Components ──
import Loading from './components/Loading';
import StatsGrid from './components/StatsGrid';
import GlobalSearch from './components/GlobalSearch';
import UserFilters from './components/UserFilters';
import UsersTable from './components/UsersTable';
import PostsTable from './components/PostsTable';
import DealsTable from './components/DealsTable';
import DepositsTable from './components/DepositsTable';
import WithdrawalsTable from './components/WithdrawalsTable';
import WithdrawalFeeSettings from './components/WithdrawalFeeSettings';
import PaymentMethodsSettings from './components/PaymentMethodsSettings';
import DepositAmountSettings from './components/DepositAmountSettings';
import AdminLockScreen from '../app-lock/AdminLock/AdminLockScreen';
import { useAdminLock } from '../app-lock/hooks/useAdminLock';
import AdminManagement from './components/AdminManagement';
import AdminChatMonitor from './components/AdminChatMonitor';
import { isMainAdminUser, hasAdminPermission } from './constants/admin';
import PendingPosts from './components/PendingPosts';
import PendingEdits from './components/PendingEdits';
import ReportsSection from './components/ReportsSection';
import NotificationsSection from './components/NotificationsSection';
import AdminNotifications from './components/AdminNotifications';
import UserDetailModal from './components/UserDetailModal';
import UserFullAccessModal from './components/UserFullAccessModal';
import DisputesTable from './components/DisputesTable';
import ReportDetailModal from './components/ReportDetailModal';
import RejectModal from './components/RejectModal';
import VerificationReviewModal from './components/VerificationReviewModal';

// ── Utils ──
import { formatDate, formatMoney } from './utils/adminUtils';

// ── Styles ──
// import './AdminDashboard.css';
import styles from './AdminDashboard.module.css';

// ============================================================
// 📌 CONSTANTS
// ============================================================
const ADMIN_EMAILS = import.meta.env.VITE_ADMIN_EMAILS?.split(',') || [
  'hammanmusa362@gmail.com',
  'hasanmahmudmd362@gmail.com',
];

// ============================================================
// 🎯 COMPONENT
// ============================================================
const AdminDashboard = () => {
  const navigate = useNavigate();
  const feedback = useFeedback();

  // ✅ Admin Notifications Hook
  const { 
    adminNotifications, 
    unreadCount: adminUnreadCount, 
    markAllAsRead: markAdminAllAsRead,
    markNotificationAsRead: markAdminNotificationAsRead,
    deleteNotification: deleteAdminNotification,
    sendTestNotification: sendAdminTestNotification 
  } = useAdminNotifications();

  // ✅ Admin Data Hook
  const {
    // States
    loading,
    loadingSections,
    stats,
    users,
    posts,
    pendingPosts,
    pendingEdits,
    deals,
    withdrawals,
    deposits,
    pendingDeposits,
    depositsLoading,
    reports,
    reportsLoading,
    notifications,
    disputes,
    disputesLoading,
    searchQuery,
    searchResults,
    isSearching,
    selectedUser,
    selectedReport,
    rejectReason,
    showRejectModal,
    selectedPostId,
    notificationMessage,
    notificationType,
    sendingNotification,
    selectedUsersForNotify,

    // Setters
    setUsers,
    setPosts,
    setPendingPosts,
    setPendingEdits,
    setDeals,
    setWithdrawals,
    setDeposits,
    setPendingDeposits,
    setReports,
    setNotifications,
    setStats,
    setSelectedUser,
    setSelectedReport,
    setRejectReason,
    setShowRejectModal,
    setSelectedPostId,
    setNotificationMessage,
    setNotificationType,
    setSendingNotification,
    setSelectedUsersForNotify,
    setSearchQuery,
    setSearchResults,
    setIsSearching,

    // Load functions
    loadUsers,
    loadPosts,
    loadPendingPosts,
    loadPendingEdits,
    loadDeals,
    loadWithdrawals,
    loadStats,
    loadNotifications,
    loadPendingDeposits,
    loadAllDeposits,
    loadReports,
    loadDisputes,
    loadAllData,
    reloadAllData,

    // User operations
    createUserNotification,
    verifyUser: verifyUserRaw,
    toggleBlockUser: toggleBlockUserRaw,
    deleteUser: deleteUserRaw,
    saveVerificationReview: saveVerificationReviewRaw, 

    // ✅ NEW — full user access
    fetchUserDeals,
    fetchUserWallet,
    fetchUserPosts,
    adminAdjustWallet: adminAdjustWalletRaw,
    adminCancelDeal: adminCancelDealRaw,
    adminResolveDispute: adminResolveDisputeRaw,

    // Post operations
    handleDeletePost: handleDeletePostRaw,

    // Deposit operations
    handleApproveDeposit: handleApproveDepositRaw,
    handleRejectDeposit: handleRejectDepositRaw,

    // Withdrawal operations
    handleApproveWithdrawal: handleApproveWithdrawalRaw,
    handleCompleteWithdrawal: handleCompleteWithdrawalRaw,
    handleRejectWithdrawal: handleRejectWithdrawalRaw,

    // Notification operations
    sendBulkNotification,
    sendAdminNotification,

    // Report operations
    updateReportStatus: updateReportStatusRaw,

    // Pending post operations
    handleApproveEdit: handleApproveEditRaw,
    handleApprovePost: handleApprovePostRaw,
    handleRejectEdit: handleRejectEditRaw,
    handleRejectPost: handleRejectPostRaw,

    // Search
    handleGlobalSearch,

    // Modal helpers
    openRejectModal,
    submitReject,

    // Toggle functions
    toggleSelectAllUsers,
    toggleUserSelection,
  } = useAdminData();

  // ============================================================
  // 1️⃣ STATE
  // ============================================================
  const [activeTab, setActiveTab] = useState('dashboard');
  // 🔧 ADD (#6 mobile sidebar)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // 🔧 ADD (admin dashboard lock security requirement)
  const {
    isConfigured: adminLockConfigured,
    isLocked: adminLockActive,
    loading: adminLockLoading,
    setupLock,
    lockDashboard,
    unlockDashboard,
    recoveryUnlock,
  } = useAdminLock(auth.currentUser);
  const [adminLockMode, setAdminLockMode] = useState(null); // null | 'setup' | 'locked'
  const [adminLockError, setAdminLockError] = useState('');

  // 🔧 ADD (#28/#29 admin RBAC): load the CURRENT admin's own
  // permissions, so tabs they don't have access to can be hidden.
  // Client-side gating is a UX nicety only — the real enforcement is
  // the Firestore rules + the isMainAdminUser()/hasAdminPermission()
  // checks inside each admin function itself (the requirements doc
  // explicitly warns hiding buttons alone isn't sufficient).
  const [myAdminPermissions, setMyAdminPermissions] = useState(null);
  const currentUserIsMainAdmin = isMainAdminUser(auth.currentUser);

  useEffect(() => {
    if (currentUserIsMainAdmin || !auth.currentUser) return;
    getDoc(doc(db, 'users', auth.currentUser.uid))
      .then(snap => setMyAdminPermissions(snap.exists() ? snap.data().adminPermissions : null))
      .catch(err => console.error('Failed to load own admin permissions:', err));
  }, [currentUserIsMainAdmin]);

  const canAccessTab = useCallback((permission) => {
    if (!permission) return true; // tabs with no permission requirement (e.g. dashboard overview)
    return hasAdminPermission(auth.currentUser, 'admin', myAdminPermissions, permission);
  }, [myAdminPermissions]);

  // 🔧 ADD (RBAC gap closure): the tab-visibility hiding done earlier
  // only kept a sub-admin from navigating TO these sections in the
  // UI — it never stopped the underlying action functions from being
  // called if triggered another way (e.g. a stale reference, or a
  // future code path that doesn't go through the tab). Wrapping the
  // actual finance/user-management functions here means the
  // permission is checked at the point of the ACTION, not just the
  // navigation, which is what "hiding buttons is not sufficient
  // alone" is really asking for on the client side. Real enforcement
  // is still the Firestore rules (withdrawals/transactions updated
  // below to require the same permission server-side).
  const requirePermission = useCallback((permission, fn) => (...args) => {
    if (!canAccessTab(permission)) {
      feedback.alert.error({ title: 'এই অ্যাকশনের জন্য আপনার পারমিশন নেই।' });
      return;
    }
    return fn(...args);
  }, [canAccessTab, feedback]);

  // 🔧 The actual gated handlers, used everywhere below instead of
  // the raw versions destructured from useAdminData() above. Every
  // key here is one of the real ADMIN_PERMISSIONS
  // ('users' | 'verification' | 'finance' | 'moderation' |
  // 'announcements') — matching exactly what AdminManagement.jsx can
  // actually grant a sub-admin, and what each action's own tab is
  // already gated by below in adminTabConfig.
  const toggleBlockUser = requirePermission('users', toggleBlockUserRaw);
  const deleteUser = requirePermission('users', deleteUserRaw);
  const verifyUser = requirePermission('verification', verifyUserRaw);
  const saveVerificationReview = requirePermission('verification', saveVerificationReviewRaw);
  const handleApproveDeposit = requirePermission('finance', handleApproveDepositRaw);
  const handleRejectDeposit = requirePermission('finance', handleRejectDepositRaw);
  const handleApproveWithdrawal = requirePermission('finance', handleApproveWithdrawalRaw);
  const handleCompleteWithdrawal = requirePermission('finance', handleCompleteWithdrawalRaw);
  const handleRejectWithdrawal = requirePermission('finance', handleRejectWithdrawalRaw);
  const adminAdjustWallet = requirePermission('finance', adminAdjustWalletRaw);
  // 🔧 FIX (RBAC gap closure — "extending it to every single admin
  // action" was explicitly left open in the original audit): these
  // sensitive actions were still calling the raw useAdminData()
  // functions directly, checking only broad isAdmin() rather than
  // the specific permission a sub-admin actually needs — the exact
  // gap flagged as unresolved. Wrapped the same way as the
  // finance/user handlers above, using 'moderation' — the same
  // permission their tabs (posts/deals/disputes/pending-posts/
  // pending-edits/reports) already require below.
  const adminCancelDeal = requirePermission('moderation', adminCancelDealRaw);
  const adminResolveDispute = requirePermission('moderation', adminResolveDisputeRaw);
  const handleDeletePost = requirePermission('moderation', handleDeletePostRaw);
  const updateReportStatus = requirePermission('moderation', updateReportStatusRaw);
  const handleApproveEdit = requirePermission('moderation', handleApproveEditRaw);
  const handleApprovePost = requirePermission('moderation', handleApprovePostRaw);
  const handleRejectEdit = requirePermission('moderation', handleRejectEditRaw);
  const handleRejectPost = requirePermission('moderation', handleRejectPostRaw);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedVerificationUser, setSelectedVerificationUser] = useState(null);
  const [selectedFullAccessUser, setSelectedFullAccessUser] = useState(null);

  // ============================================================
  // 2️⃣ 🛠️ CUSTOM HANDLERS (ADDED)
  // ============================================================

  /**
   * ✅ handleEditPost - Edit a pending post
   * @param {string} postId - The ID of the post to edit
   * @param {object} updatedData - The updated post data
   */
  const handleEditPost = async (postId, updatedData) => {
    try {
      console.log('✏️ Editing pending post:', postId, updatedData);
      
      // Find the post in pendingPosts
      const existingPost = pendingPosts.find(p => p.id === postId);
      if (!existingPost) {
        feedback.showError('❌ পোস্ট খুঁজে পাওয়া যায়নি!');
        return;
      }

      // Update the post in Firestore
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        ...updatedData,
        updatedAt: new Date().toISOString(),
        lastEditedBy: auth.currentUser?.uid || 'admin',
        isEdited: true
      });

      // Update local state - remove from pending posts
      setPendingPosts(prev => prev.filter(p => p.id !== postId));
      
      // Add to posts list (approved)
      setPosts(prev => {
        const updatedPost = { ...existingPost, ...updatedData, status: 'approved' };
        // Check if already exists
        const exists = prev.some(p => p.id === postId);
        if (exists) {
          return prev.map(p => p.id === postId ? { ...p, ...updatedData } : p);
        }
        return [updatedPost, ...prev];
      });

      feedback.showSuccess('✅ পোস্ট আপডেট হয়েছে!', 'পোস্টটি সফলভাবে এডিট এবং অ্যাপ্রুভ করা হয়েছে।');
      return true;
    } catch (error) {
      console.error('❌ Error editing post:', error);
      feedback.showError('❌ পোস্ট আপডেট ব্যর্থ!', error.message);
      throw error;
    }
  };



/**
 * ✅ handleEditPendingEdit - Edit a pending edit request
 * @param {string} editId - The ID of the edit to modify
 * @param {object} updatedData - The updated data
 */



// src/pages/Admin/AdminDashboard.jsx

/**
 * ✅ handleEditPendingEdit - Edit a pending edit request (Both collections)
 */
const handleEditPendingEdit = useCallback(async (editId, updatedData) => {
  console.log('🔍 handleEditPendingEdit called with:', { editId, updatedData });
  
  if (!editId) {
    console.error('❌ No editId provided');
    feedback.showError?.('❌ এডিট আইডি পাওয়া যায়নি!');
    return false;
  }

  try {
    // Find the edit in pendingEdits
    const existingEdit = pendingEdits.find(e => e.id === editId);
    if (!existingEdit) {
      console.error('❌ Edit not found in pendingEdits:', editId);
      feedback.showError?.('❌ এডিট খুঁজে পাওয়া যায়নি!');
      return false;
    }

    console.log('📝 Found edit:', existingEdit);

    // ✅ Try both collections
    let editRef;
    let collectionName = 'pendingEdits';
    let docExists = false;
    
    try {
      // First try pendingEdits
      editRef = doc(db, 'pendingEdits', editId);
      const docSnap = await getDoc(editRef);
      if (docSnap.exists()) {
        docExists = true;
        console.log('✅ Found in pendingEdits');
      } else {
        console.log('⚠️ Not in pendingEdits, trying postEdits...');
        collectionName = 'postEdits';
        editRef = doc(db, 'postEdits', editId);
        const docSnap2 = await getDoc(editRef);
        if (docSnap2.exists()) {
          docExists = true;
          console.log('✅ Found in postEdits');
        }
      }
    } catch (error) {
      console.log('⚠️ Error checking collections:', error.message);
    }

    // ✅ If document doesn't exist in either collection, create it
    if (!docExists) {
      console.log('📝 Document not found, creating new one in pendingEdits...');
      editRef = doc(db, 'pendingEdits', editId);
      await setDoc(editRef, {
        ...existingEdit,
        ...updatedData,
        updatedAt: serverTimestamp(),
        lastEditedBy: auth.currentUser?.uid || 'admin'
      });
      console.log('✅ Document created successfully');
      
      // Update local state
      setPendingEdits(prev => prev.map(e => 
        e.id === editId ? { ...e, ...updatedData, updatedAt: new Date().toISOString() } : e
      ));

      feedback.showSuccess?.('✅ এডিট তৈরি করা হয়েছে!', 'পেন্ডিং এডিট সফলভাবে তৈরি করা হয়েছে।');
      return true;
    }

    // ✅ Update the edit in Firestore
    const updateData = {
      title: updatedData.title || existingEdit.title,
      description: updatedData.description || existingEdit.description,
      budget: updatedData.budget || existingEdit.budget,
      deadline: updatedData.deadline || existingEdit.deadline,
      pendingChanges: {
        ...existingEdit.pendingChanges,
        title: updatedData.title || existingEdit.pendingChanges?.title,
        description: updatedData.description || existingEdit.pendingChanges?.description,
        budget: updatedData.budget || existingEdit.pendingChanges?.budget,
        deadline: updatedData.deadline || existingEdit.pendingChanges?.deadline,
      },
      updatedAt: serverTimestamp(),
      lastEditedBy: auth.currentUser?.uid || 'admin'
    };

    console.log(`📤 Updating ${collectionName} with:`, updateData);

    // ✅ Update the edit in Firestore
    await updateDoc(editRef, updateData);

    // Update local state
    setPendingEdits(prev => prev.map(e => 
      e.id === editId ? { ...e, ...updateData } : e
    ));

    console.log('✅ Edit updated successfully');
    feedback.showSuccess?.('✅ এডিট আপডেট হয়েছে!', 'পেন্ডিং এডিট সফলভাবে পরিবর্তন করা হয়েছে।');
    return true;
    
  } catch (error) {
    console.error('❌ Error editing pending edit:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    feedback.showError?.('❌ এডিট আপডেট ব্যর্থ!', error.message);
    throw error;
  }
}, [pendingEdits, setPendingEdits, feedback]);

  // ============================================================
  // 3️⃣ useMemo - Pending Users Count
  // ============================================================
  const pendingUsersCount = useMemo(() => {
    return users.filter(user => 
      !user.isVerified && 
      !user.isBanned && 
      !user.isBlocked
    ).length;
  }, [users]);

  // ✅ Needs Review Count
  const needsReviewCount = useMemo(() => {
    return users.filter(user => user.needsReview === true).length;
  }, [users]);

  // ============================================================
  // 4️⃣ useMemo - Filtered Users
  // ============================================================
  const filteredUsers = useMemo(() => {
    let filtered = [...users];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(user => 
        user.displayName?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.uniqueId?.toLowerCase().includes(term) ||
        user.firstName?.toLowerCase().includes(term) ||
        user.lastName?.toLowerCase().includes(term) ||
        user.phone?.includes(searchTerm)
      );
    }
    
    switch (filterStatus) {
      case 'verified':
        filtered = filtered.filter(user => user.isVerified === true);
        break;
      case 'pending':
        filtered = filtered.filter(user => user.isComplete && user.verificationStatus === 'pending' && !user.isVerified);
        break;
      case 'pending_verification':
        filtered = filtered.filter(user => user.isComplete && !user.isVerified && user.verificationStatus !== 'pending');
        break;
      case 'incomplete':
        filtered = filtered.filter(user => !user.isComplete && !user.isVerified);
        break;
      case 'blocked':
        filtered = filtered.filter(user => user.isBanned || user.isBlocked);
        break;
      case 'needs_review':
        filtered = filtered.filter(user => user.needsReview === true);
        break;
      default:
        break;
    }
    
    return filtered;
  }, [users, searchTerm, filterStatus]);

  // ============================================================
  // 5️⃣ useEffect - Admin Check
  // ============================================================
  useEffect(() => {
    let isMounted = true;
    
    const checkAdmin = async () => {
      const user = auth.currentUser;
      
      if (import.meta.env.DEV) {
        console.log("🔍 AdminDashboard - Current user:", user?.email);
      }
      
      if (!user) {
        if (import.meta.env.DEV) {
          console.log("❌ No user, redirecting to login");
        }
        navigate('/login', { replace: true });
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
          if (import.meta.env.DEV) {
            console.log("❌ User document not found!");
          }
          if (isMounted) {
            await feedback.showError('❌ ইউজার ডেটা পাওয়া যায়নি', 'আপনার অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।');
          }
          navigate('/', { replace: true });
          return;
        }
        
        const data = userDoc.data();
        
        if (import.meta.env.DEV) {
          console.log("📊 User data:", {
            email: data.email,
            role: data.role,
            isAdmin: data.role === 'admin'
          });
        }
        
        if (data.role !== 'admin' && !ADMIN_EMAILS.includes(user.email)) {
          if (import.meta.env.DEV) {
            console.log(`❌ Access denied! Role: ${data.role}, Email: ${user.email}`);
          }
          if (isMounted) {
            await feedback.showError('⛔ অ্যাক্সেস অস্বীকৃত', 'আপনার অ্যাডমিন অ্যাক্সেস নেই!');
          }
          navigate('/', { replace: true });
          return;
        }
        
        if (import.meta.env.DEV) {
          console.log("✅ Admin access granted!");
        }
        
        if (isMounted) {
          await loadAllData();
        }
        
      } catch (error) {
        console.error('❌ Admin check error:', error);
        if (isMounted) {
          await feedback.showError('❌ অ্যাডমিন চেক ব্যর্থ', 'অ্যাডমিন ভেরিফিকেশন করতে সমস্যা হয়েছে');
        }
        navigate('/', { replace: true });
      }
    };
    
    checkAdmin();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // ============================================================
  // 6️⃣ useEffect - Update Stats from Users
  // ============================================================
  useEffect(() => {
    if (!loading && users.length > 0) {
      const totalUsers = users.length;
      const verifiedUsers = users.filter(u => u.isVerified === true).length;
      const blockedUsers = users.filter(u => u.isBanned === true || u.isBlocked === true).length;
      
      setStats(prev => ({
        ...prev,
        totalUsers: totalUsers,
        verifiedUsers: verifiedUsers,
        pendingUsers: totalUsers - verifiedUsers - blockedUsers,
        blockedUsers: blockedUsers
      }));
    }
  }, [users, loading, setStats]);

  // ============================================================
  // 7️⃣ RENDER FUNCTIONS
  // ============================================================

  // ── Dashboard ──
  const renderDashboard = () => (
    <div className="admin-dashboard">
      <StatsGrid 
        stats={stats} 
        onPendingPostsClick={() => setActiveTab('pending-posts')}
      />
    </div>
  );

  // ── Users ──
  const renderUsers = () => (
    <div className="admin-users">
      <UserFilters 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterStatus={filterStatus}
        onFilterChange={setFilterStatus}
        onNotificationsClick={() => setActiveTab('notifications')}
        onRefreshClick={loadAllData}
      />
      
      <UsersTable 
        users={filteredUsers}
        onViewUser={setSelectedUser}
        onVerifyUser={verifyUser}
        onUnverifyUser={verifyUser}
        onToggleBlock={toggleBlockUser}
        onDeleteUser={deleteUser}
        onReviewVerification={setSelectedVerificationUser}
        onFullAccess={setSelectedFullAccessUser}
      />
    </div>
  );

  // ── Posts ──
  const renderPosts = () => (
    <PostsTable 
      posts={posts}
      onDeletePost={handleDeletePost}
    />
  );

  // ── Deals ──
  const renderDeals = () => (
    <DealsTable deals={deals} />
  );

  // ── Withdrawals ──
  const renderWithdrawals = () => (
    <>
      {/* 🔧 FIX (permission-protected requirement): pass the same
          'finance' permission check used for deposit/withdrawal
          approval, so a sub-admin without it can see but not change
          the fee (see WithdrawalFeeSettings.jsx for the rest). */}
      <WithdrawalFeeSettings feedback={feedback} canEdit={canAccessTab('finance')} />
      <WithdrawalsTable 
        withdrawals={withdrawals}
        onApprove={handleApproveWithdrawal}
        onReject={handleRejectWithdrawal}
        onComplete={handleCompleteWithdrawal}
      />
    </>
  );

  // ── Deposits (Updated with History Support) ──
  const renderDeposits = () => {
    // ✅ পেন্ডিং ডিপোজিট
    const pending = pendingDeposits || [];
    
    // ✅ হিস্ট্রি ডিপোজিট (approved + rejected)
    const history = deposits?.filter(d => 
      d.status === 'completed' || 
      d.status === 'approved' || 
      d.status === 'rejected'
    ) || [];
    
    return (
      <>
        {/* 🔧 ADD (#4 admin should manage deposit/withdraw payment
            methods): lets admin add/edit/enable/disable bKash, Nagad,
            Rocket and Bank details used on the deposit page (and the
            enabled/disabled state also filters Withdraw.jsx's method
            options) — same 'finance' permission gate as
            WithdrawalFeeSettings above. */}
        <PaymentMethodsSettings feedback={feedback} canEdit={canAccessTab('finance')} />
        {/* 🔧 ADD (admin should control Deposit amount limits too,
            matching Withdraw's fee/min/max settings): min/max deposit
            amount, previously hardcoded, now admin-editable. */}
        <DepositAmountSettings feedback={feedback} canEdit={canAccessTab('finance')} />
        <DepositsTable 
          deposits={pending}
          history={history}
          onApprove={handleApproveDeposit}
          onReject={handleRejectDeposit}
          isLoading={depositsLoading}
        />
      </>
    );
  };

  // ── Pending Posts ──
  const renderPendingPosts = () => (
    <PendingPosts 
      posts={pendingPosts}
      onApprove={handleApprovePost}
      onReject={handleRejectPost}
      onRefresh={loadPendingPosts}
      onOpenRejectModal={openRejectModal}
      onEdit={handleEditPost} // ✅ Now defined
      formatDateFn={formatDate}
      formatMoneyFn={formatMoney}
    />
  );

  // ── Pending Edits ──
  const renderPendingEdits = () => (
    <PendingEdits 
      edits={pendingEdits}
      onApprove={handleApproveEdit}
      onReject={handleRejectEdit}
      onRefresh={loadPendingEdits}
      onEdit={handleEditPendingEdit} // ✅ Now defined
      formatDateFn={formatDate}
    />
  );

  // ── Reports ──
  const renderReports = () => (
    <ReportsSection 
      reports={reports}
      onViewReport={setSelectedReport}
      onResolve={(id) => updateReportStatus(id, 'resolved')}
      onCancel={(id) => updateReportStatus(id, 'cancelled')}
      onRefresh={loadReports}
      formatDateFn={formatDate}
    />
  );

  // ── ✅ NEW: Disputes ──
  const renderDisputes = () => (
    <DisputesTable
      disputes={disputes}
      isLoading={disputesLoading}
      onResolve={adminResolveDispute}
      onRefresh={loadDisputes}
      formatDateFn={formatDate}
    />
  );

  // ── Notifications ──
  const renderNotifications = () => (
    <NotificationsSection 
      notifications={notifications}
      notificationMessage={notificationMessage}
      notificationType={notificationType}
      selectedUsersForNotify={selectedUsersForNotify}
      filteredUsers={filteredUsers}
      sendingNotification={sendingNotification}
      onMessageChange={setNotificationMessage}
      onTypeChange={setNotificationType}
      onToggleSelectAll={toggleSelectAllUsers}
      onToggleUser={toggleUserSelection}
      onSend={sendBulkNotification}
      formatDateFn={formatDate}
    />
  );

  // ── Admin Notifications ──
  const renderAdminNotifications = () => (
    <AdminNotifications 
      notifications={adminNotifications}
      unreadCount={adminUnreadCount}
      onMarkAllAsRead={markAdminAllAsRead}
      onMarkAsRead={markAdminNotificationAsRead}
      onDelete={deleteAdminNotification}
      onSendTest={() => sendAdminTestNotification('admin_notification')}
      formatDateFn={formatDate}
    />
  );

  // ── Modals ──
  const renderModals = () => (
    <>
      <UserDetailModal 
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onVerify={verifyUser}
        onToggleBlock={toggleBlockUser}
        onSaveReview={saveVerificationReview}  
        formatDate={formatDate}
      />

      {/* ✅ NEW — Full Access modal (wallet/deals/posts) */}
      <UserFullAccessModal
        user={selectedFullAccessUser}
        onClose={() => setSelectedFullAccessUser(null)}
        fetchUserWallet={fetchUserWallet}
        fetchUserDeals={fetchUserDeals}
        fetchUserPosts={fetchUserPosts}
        adminAdjustWallet={adminAdjustWallet}
        adminCancelDeal={adminCancelDeal}
        adminResolveDispute={adminResolveDispute}
        onDeletePost={handleDeletePost}
      />
      
      <VerificationReviewModal 
        user={selectedVerificationUser}
        onClose={() => setSelectedVerificationUser(null)}
        onSave={saveVerificationReview}
        formatDate={formatDate}
      />
      
      <ReportDetailModal 
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onUpdateStatus={updateReportStatus}
        formatDate={formatDate}
      />
      
      <RejectModal 
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onSubmit={submitReject}
        reason={rejectReason}
        onReasonChange={setRejectReason}
      />
    </>
  );

  // ── Search Result Handler ──
  const handleResultSelect = (item) => {
    if (item.type === 'user') {
      setActiveTab('users');
      setSearchTerm(item.displayName || item.email || '');
    } else if (item.type === 'post') {
      setActiveTab('posts');
    } else if (item.type === 'deal') {
      setActiveTab('deals');
    } else if (item.type === 'withdrawal') {
      setActiveTab('withdrawals');
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  // 🔧 ADD (#6 mobile sidebar): tab config, extracted from the old
  // hand-written buttons — every onClick preserves its original
  // behavior exactly (including the ones that also trigger a data
  // load, like loadAllDeposits).
  const adminTabConfig = [
    { key: 'dashboard', icon: 'fa-solid fa-chart-line', label: 'ওভারভিউ', badge: 0, onSelect: () => setActiveTab('dashboard') },
    { key: 'users', icon: 'fa-solid fa-users', label: 'ইউজার', badge: pendingUsersCount, dangerBadge: true, permission: 'users', onSelect: () => setActiveTab('users') },
    { key: 'identity-db', icon: 'fa-solid fa-database', label: 'Identity DB', badge: 0, permission: 'verification', onSelect: () => setActiveTab('identity-db') },
    { key: 'needs-review', icon: 'fa-solid fa-rotate', label: 'রিভিউ', badge: needsReviewCount, dangerBadge: true, permission: 'verification', onSelect: () => setActiveTab('needs-review') },
    { key: 'deposits', icon: 'fa-solid fa-money-bill-wave', label: 'ডিপোজিট', badge: pendingDeposits.length, dangerBadge: true, permission: 'finance', onSelect: () => { setActiveTab('deposits'); loadAllDeposits(); } },
    { key: 'guides', icon: 'fa-solid fa-book-open', label: 'গাইড', badge: 0, onSelect: () => setActiveTab('guides') },
    { key: 'posts', icon: 'fa-solid fa-file-alt', label: 'পোস্ট', badge: posts.length, permission: 'moderation', onSelect: () => setActiveTab('posts') },
    { key: 'deals', icon: 'fa-solid fa-handshake', label: 'ডিল', badge: deals.length, permission: 'moderation', onSelect: () => setActiveTab('deals') },
    { key: 'disputes', icon: 'fa-solid fa-scale-balanced', label: 'ডিসপিউট', badge: disputes.length, dangerBadge: true, permission: 'moderation', onSelect: () => { setActiveTab('disputes'); loadDisputes(); } },
    { key: 'withdrawals', icon: 'fa-solid fa-money-bill-transfer', label: 'উইথড্র', badge: withdrawals.filter(w => w.status === 'pending').length, dangerBadge: true, permission: 'finance', onSelect: () => setActiveTab('withdrawals') },
    { key: 'pending-posts', icon: 'fa-solid fa-clock', label: 'পেন্ডিং পোস্ট', badge: pendingPosts.length, dangerBadge: true, permission: 'moderation', onSelect: () => { setActiveTab('pending-posts'); loadPendingPosts(); } },
    { key: 'pending-edits', icon: 'fa-solid fa-pen-to-square', label: 'পেন্ডিং এডিট', badge: pendingEdits.length, dangerBadge: true, permission: 'moderation', onSelect: () => { setActiveTab('pending-edits'); loadPendingEdits(); } },
    { key: 'notifications', icon: 'fa-solid fa-bell', label: 'নোটিফিকেশন', badge: notifications.length, onSelect: () => setActiveTab('notifications') },
    { key: 'reports', icon: 'fa-solid fa-flag', label: 'রিপোর্ট', badge: reports.filter(r => r.status === 'pending').length, dangerBadge: true, permission: 'moderation', onSelect: () => { setActiveTab('reports'); loadReports(); } },
    // ✅ admin-only চ্যাট মনিটর: সব ইউজারের সব কনভারসেশন + ডিলিটকৃত
    // মেসেজ রিকভারি (dispute/support-এর জন্য)। 'moderation' পারমিশনের
    // অধীনে, disputes/reports/posts-এর মতোই।
    { key: 'chat-monitor', icon: 'fa-solid fa-comments', label: 'চ্যাট মনিটর', badge: 0, permission: 'moderation', onSelect: () => setActiveTab('chat-monitor') },
    { key: 'announcements', icon: 'fa-solid fa-bullhorn', label: 'অ্যানাউন্সমেন্ট', badge: 0, permission: 'announcements', onSelect: () => setActiveTab('announcements') },
    { key: 'admin-notifications', icon: 'fa-solid fa-bell', label: 'নোটিফিকেশন', badge: adminUnreadCount, dangerBadge: true, onSelect: () => setActiveTab('admin-notifications') },
    // 🔧 ADD (#30 admin RBAC): main-admin-only management tab
    ...(currentUserIsMainAdmin ? [{
      key: 'admin-management', icon: 'fa-solid fa-user-shield', label: 'এডমিন ম্যানেজমেন্ট', badge: 0, onSelect: () => setActiveTab('admin-management'),
    }] : []),
  ].filter(tab => canAccessTab(tab.permission));

  // 🔧 ADD (#6/#36 accessibility): Escape closes the mobile sidebar,
  // and body scroll is locked while it's open so the page behind it
  // doesn't scroll along with a touch-drag on the drawer.
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const handleEscape = (e) => { if (e.key === 'Escape') setMobileSidebarOpen(false); };
    document.addEventListener('keydown', handleEscape);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileSidebarOpen]);

  // 🔧 ADD (admin dashboard lock): keep local mode in sync with the
  // hook's loaded state — shows the lock screen automatically if the
  // admin left the dashboard locked last time.
  useEffect(() => {
    if (adminLockLoading) return;
    setAdminLockMode(adminLockActive ? 'locked' : null);
  }, [adminLockLoading, adminLockActive]);

  const handleAdminLockSetup = async (password, recoveryPassword, validationError) => {
    if (validationError) {
      setAdminLockError(validationError);
      return;
    }
    setAdminLockError('');
    const result = await setupLock(password, recoveryPassword);
    if (result.success) {
      feedback.alert.success({ title: '✅ এডমিন লক সেটআপ সম্পন্ন হয়েছে' });
      setAdminLockMode(null);
    } else {
      setAdminLockError(result.error || 'সেটআপ ব্যর্থ হয়েছে');
    }
  };

  const handleAdminUnlock = async (password) => {
    const result = await unlockDashboard(password);
    if (result.success) {
      setAdminLockError('');
      setAdminLockMode(null);
    } else {
      setAdminLockError(result.error || 'ভুল পাসওয়ার্ড');
    }
  };

  const handleAdminRecovery = async (recoveryPassword) => {
    const result = await recoveryUnlock(recoveryPassword);
    if (result.success) {
      setAdminLockError('');
      feedback.alert.success({ title: 'রিকভারি সফল হয়েছে — নতুন পাসওয়ার্ড সেট করুন' });
      setAdminLockMode(result.needsResetup ? 'setup' : null);
    } else {
      setAdminLockError(result.error || 'রিকভারি ব্যর্থ হয়েছে');
    }
  };

  const handleLockButtonClick = async () => {
    if (!adminLockConfigured) {
      setAdminLockError('');
      setAdminLockMode('setup');
      return;
    }
    await lockDashboard();
    setAdminLockMode('locked');
  };

  // ============================================================
  // 8️⃣ MAIN RENDER
  // ============================================================

  // 🔧 ADD (admin dashboard lock): render the lock screen INSTEAD of
  // the dashboard when locked/mid-setup — actually gates access
  // rather than just overlaying on top, matching "lock" meaning you
  // can't see the dashboard content underneath.
  if (!adminLockLoading && (adminLockMode === 'locked' || adminLockMode === 'setup')) {
    return (
      <AdminLockScreen
        mode={adminLockMode}
        onUnlock={handleAdminUnlock}
        onRecovery={handleAdminRecovery}
        onSetup={handleAdminLockSetup}
        error={adminLockError}
        clearError={() => setAdminLockError('')}
      />
    );
  }

return (
    <div className={styles.adminContainer}>
      <NotificationBanner 
        variant="admin"
        autoShow={true}
        delay={3000}
        customTitle="📢 অ্যাডমিন নোটিফিকেশন চালু করুন"
        customMessage="নতুন অ্যাডমিন আপডেট, রিপোর্ট এবং গুরুত্বপূর্ণ বিজ্ঞপ্তি পেতে নোটিফিকেশন চালু করুন।"
        customIcon="🔔"
      />

      <div className={styles.adminWrapper}>
        
        {/* ── HEADER ── */}
        <div className={styles.adminHeader}>
          {/* 🔧 ADD (#6 mobile sidebar): hamburger button, only
              visible on mobile via CSS media query. */}
          <button
            className={styles.mobileMenuBtn}
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open admin menu"
          >
            <i className="fa-solid fa-bars"></i>
          </button>
          <h1>
            <i className="fa-solid fa-shield-haltered"></i> 
            ADMIN DASHBOARD
            {/* {activeTab !== 'dashboard' && (
              <span className={styles.headerTabName}> / {activeTab.replace('-', ' ').toUpperCase()}</span>
            )} */}
          </h1>
          <div className={styles.headerActions}>
            <GlobalSearch 
              query={searchQuery}
              onSearch={handleGlobalSearch}
              isSearching={isSearching}
              results={searchResults}
              onResultSelect={handleResultSelect}
              formatMoney={formatMoney}
              formatDate={formatDate}
            />
            <SoundSettings variant="compact" />

            {/* 🔧 ADD (admin dashboard lock): lock button - if this
                is the first time (no password set), clicking opens
                setup instead of locking immediately. */}
            <button
              className={styles.refreshBtn}
              onClick={handleLockButtonClick}
              title={adminLockConfigured ? 'ড্যাশবোর্ড লক করুন' : 'এডমিন লক সেটআপ করুন'}
            >
              <i className="fa-solid fa-lock"></i>
            </button>

            <button className={styles.refreshBtn} onClick={loadAllData}>
              <i className="fa-solid fa-sync"></i>
            </button>
          </div>
        </div>

        {/* 🔧 FIX (#5/#6): the 15 tab buttons used to be hand-written
            JSX, each repeating the same button markup — that's why
            mobile just wrapped/shrank them into unreadable tiny
            buttons instead of getting a proper sidebar. Extracted
            into adminTabConfig (below, same file) so this renders
            once via .map() and can be reused for both the desktop
            horizontal bar AND the mobile sidebar drawer without
            duplicating 15 buttons' worth of JSX and onClick logic
            twice. Every tab's original onClick behavior (including
            the ones that also trigger a data load, like
            loadAllDeposits) is preserved exactly as it was. */}
        <div className={styles.adminTabs}>
          {adminTabConfig.map(tab => (
            <button
              key={tab.key}
              className={`${styles.tabBtn} ${activeTab === tab.key ? styles.active : ''}`}
              onClick={tab.onSelect}
            >
              <i className={tab.icon}></i> {tab.label}
              {tab.badge > 0 && (
                <span className={`${styles.tabBadge} ${tab.dangerBadge ? styles.danger : ''}`}>{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* 🔧 ADD (#6 mobile sidebar): same tab list, drawer
            presentation — CSS handles showing only one of these two
            navs at a time depending on screen size. */}
        {mobileSidebarOpen && (
          <>
            <div className={styles.mobileSidebarBackdrop} onClick={() => setMobileSidebarOpen(false)} />
            <nav className={styles.mobileSidebar} aria-label="Admin navigation">
              <div className={styles.mobileSidebarHeader}>
                <span>মেনু</span>
                <button onClick={() => setMobileSidebarOpen(false)} aria-label="Close menu">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              {adminTabConfig.map(tab => (
                <button
                  key={tab.key}
                  className={`${styles.mobileSidebarItem} ${activeTab === tab.key ? styles.active : ''}`}
                  onClick={() => {
                    tab.onSelect();
                    setMobileSidebarOpen(false);
                  }}
                >
                  <i className={tab.icon}></i>
                  <span>{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className={`${styles.tabBadge} ${tab.dangerBadge ? styles.danger : ''}`}>{tab.badge}</span>
                  )}
                </button>
              ))}
            </nav>
          </>
        )}

        {/* ── CONTENT ── */}
        <div className={styles.adminContent}>
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'users' && renderUsers()}
          {activeTab === 'posts' && renderPosts()}
          {activeTab === 'deals' && renderDeals()}
          {activeTab === 'disputes' && renderDisputes()}
          {activeTab === 'withdrawals' && renderWithdrawals()}
          {activeTab === 'deposits' && renderDeposits()} 
          {activeTab === 'pending-posts' && renderPendingPosts()}
          {activeTab === 'pending-edits' && renderPendingEdits()}
          {activeTab === 'notifications' && renderNotifications()}
          {activeTab === 'announcements' && <AdminAnnouncement />}
          {activeTab === 'reports' && renderReports()}
          {activeTab === 'chat-monitor' && <AdminChatMonitor feedback={feedback} />}
          {activeTab === 'admin-notifications' && renderAdminNotifications()}
          {activeTab === 'guides' && <GuideEditor />}
          {/* 🔧 ADD (#30 admin RBAC) */}
          {activeTab === 'admin-management' && <AdminManagement feedback={feedback} />}

          {/* 🔧 FIX (Identity DB tab showing empty): IdentityDatabase was
              imported above but there was no `{activeTab === 'identity-db' &&
              ...}` branch here at all — the nav item correctly set
              activeTab to 'identity-db' on click, but nothing in this list
              ever matched that value, so the component (and the
              loadRecords() fetch that runs in its own useEffect on mount)
              never rendered/ran. Records were being saved to Firestore
              correctly the whole time — the tab just never asked for them
              because the component was never mounted. */}
          {activeTab === 'identity-db' && <IdentityDatabase />}

          {/* ✅ Needs Review Section */}
          {activeTab === 'needs-review' && (
            <div className={styles.needsReviewSection}>
              <div className={styles.sectionHeader}>
                <h3>
                  <i className="fa-solid fa-rotate"></i> 
                  Re-review Needed ({needsReviewCount})
                </h3>
                <p className={styles.sectionSubtitle}>
                  Users who have re-uploaded documents or face photos after rejection
                </p>
              </div>
              
              <UsersTable 
                users={users.filter(user => user.needsReview === true)}
                onViewUser={setSelectedUser}
                onVerifyUser={verifyUser}
                onUnverifyUser={verifyUser}
                onToggleBlock={toggleBlockUser}
                onDeleteUser={deleteUser}
                onReviewVerification={setSelectedVerificationUser}
                onFullAccess={setSelectedFullAccessUser}
              />
            </div>
          )}
        </div>
      </div>
      
      {renderModals()}
    </div>
  );
};

export default AdminDashboard;