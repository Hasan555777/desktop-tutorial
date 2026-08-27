
// src/pages/Admin/AdminDashboard.jsx
//
// ✅ ADDED:
// - New "Disputes" tab (⚖️) rendering DisputesTable, with badge count.
// - New UserFullAccessModal wired via a new `selectedFullAccessUser` state,
//   triggered by the 💰 button added in UsersTable.jsx (onFullAccess prop).
//   This is ADDITIVE — the existing UserDetailModal (KYC review) is
//   untouched and still works exactly as before.
// ✅ FIXED:
// - Added handleEditPost function for editing pending posts
// - Added handleEditPendingEdit function for editing pending edits

// src/pages/Admin/AdminDashboard.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
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
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import useAdminNotifications from './hooks/useAdminNotifications';
import useAdminData from './hooks/useAdminData';
import NotificationBanner from '@/components/NotificationBanner/NotificationBanner';
import SoundSettings from '@/UI/Sound/SoundSettings';
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
    verifyUser,
    toggleBlockUser,
    deleteUser,
    saveVerificationReview, 

    // ✅ NEW — full user access
    fetchUserDeals,
    fetchUserWallet,
    fetchUserPosts,
    adminAdjustWallet,
    adminCancelDeal,
    adminResolveDispute,

    // Post operations
    handleDeletePost,

    // Deposit operations
    handleApproveDeposit,
    handleRejectDeposit,

    // Withdrawal operations
    handleApproveWithdrawal,
    handleCompleteWithdrawal,
    handleRejectWithdrawal,

    // Notification operations
    sendBulkNotification,
    sendAdminNotification,

    // Report operations
    updateReportStatus,

    // Pending post operations
    handleApproveEdit,
    handleApprovePost,
    handleRejectEdit,
    handleRejectPost,

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
        navigate('/login');
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
          navigate('/');
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
          navigate('/');
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
        navigate('/');
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
    <WithdrawalsTable 
      withdrawals={withdrawals}
      onApprove={handleApproveWithdrawal}
      onReject={handleRejectWithdrawal}
      onComplete={handleCompleteWithdrawal}
    />
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
      <DepositsTable 
        deposits={pending}
        history={history}
        onApprove={handleApproveDeposit}
        onReject={handleRejectDeposit}
        isLoading={depositsLoading}
      />
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

  // ============================================================
  // 8️⃣ MAIN RENDER
  // ============================================================
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
            
            <button className={styles.refreshBtn} onClick={loadAllData}>
              <i className="fa-solid fa-sync"></i>
            </button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className={styles.adminTabs}>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'dashboard' ? styles.active : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <i className="fa-solid fa-chart-line"></i> ওভারভিউ
          </button>
          
          <button 
            className={`${styles.tabBtn} ${activeTab === 'users' ? styles.active : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <i className="fa-solid fa-users"></i> ইউজার
            {pendingUsersCount > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{pendingUsersCount}</span>
            )}
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'identity-db' ? styles.active : ''}`}
            onClick={() => setActiveTab('identity-db')}
          >
            <i className="fa-solid fa-database"></i> 
            Identity DB
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'needs-review' ? styles.active : ''}`}
            onClick={() => setActiveTab('needs-review')}
          >
            <i className="fa-solid fa-rotate"></i> 
            রিভিউ 
            {needsReviewCount > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{needsReviewCount}</span>
            )}
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'deposits' ? styles.active : ''}`}
            onClick={() => {
              setActiveTab('deposits');
              loadAllDeposits();
            }}
          >
            <i className="fa-solid fa-money-bill-wave"></i> ডিপোজিট
            {pendingDeposits.length > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{pendingDeposits.length}</span>
            )}
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'guides' ? styles.active : ''}`}
            onClick={() => setActiveTab('guides')}
          >
            <i className="fa-solid fa-book-open"></i> গাইড
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'posts' ? styles.active : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            <i className="fa-solid fa-file-alt"></i> পোস্ট
            {posts.length > 0 && (
              <span className={styles.tabBadge}>{posts.length}</span>
            )}
          </button>
          
          <button 
            className={`${styles.tabBtn} ${activeTab === 'deals' ? styles.active : ''}`}
            onClick={() => setActiveTab('deals')}
          >
            <i className="fa-solid fa-handshake"></i> ডিল
            {deals.length > 0 && (
              <span className={styles.tabBadge}>{deals.length}</span>
            )}
          </button>

          {/* ✅ NEW — Disputes tab */}
          <button
            className={`${styles.tabBtn} ${activeTab === 'disputes' ? styles.active : ''}`}
            onClick={() => {
              setActiveTab('disputes');
              loadDisputes();
            }}
          >
            <i className="fa-solid fa-scale-balanced"></i> ডিসপিউট
            {disputes.length > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{disputes.length}</span>
            )}
          </button>
          
          <button 
            className={`${styles.tabBtn} ${activeTab === 'withdrawals' ? styles.active : ''}`}
            onClick={() => setActiveTab('withdrawals')}
          >
            <i className="fa-solid fa-money-bill-transfer"></i> উইথড্র
            {withdrawals.filter(w => w.status === 'pending').length > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{withdrawals.filter(w => w.status === 'pending').length}</span>
            )}
          </button>
          
          <button 
            className={`${styles.tabBtn} ${activeTab === 'pending-posts' ? styles.active : ''}`}
            onClick={() => {
              setActiveTab('pending-posts');
              loadPendingPosts();
            }}
          >
            <i className="fa-solid fa-clock"></i> পেন্ডিং পোস্ট
            {pendingPosts.length > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{pendingPosts.length}</span>
            )}
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'pending-edits' ? styles.active : ''}`}
            onClick={() => {
              setActiveTab('pending-edits');
              loadPendingEdits();
            }}
          >
            <i className="fa-solid fa-pen-to-square"></i> পেন্ডিং এডিট
            {pendingEdits.length > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{pendingEdits.length}</span>
            )}
          </button>
          
          <button 
            className={`${styles.tabBtn} ${activeTab === 'notifications' ? styles.active : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            <i className="fa-solid fa-bell"></i> নোটিফিকেশন
            {notifications.length > 0 && (
              <span className={styles.tabBadge}>{notifications.length}</span>
            )}
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'reports' ? styles.active : ''}`}
            onClick={() => {
              setActiveTab('reports');
              loadReports();
            }}
          >
            <i className="fa-solid fa-flag"></i> রিপোর্ট
            {reports.filter(r => r.status === 'pending').length > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{reports.filter(r => r.status === 'pending').length}</span>
            )}
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'announcements' ? styles.active : ''}`}
            onClick={() => setActiveTab('announcements')}
          >
            <i className="fa-solid fa-bullhorn"></i> অ্যানাউন্সমেন্ট
          </button>

          <button 
            className={`${styles.tabBtn} ${activeTab === 'admin-notifications' ? styles.active : ''}`}
            onClick={() => setActiveTab('admin-notifications')}
          >
            <i className="fa-solid fa-bell"></i> 
            নোটিফিকেশন
            {adminUnreadCount > 0 && (
              <span className={`${styles.tabBadge} ${styles.danger}`}>{adminUnreadCount}</span>
            )}
          </button>
        </div>

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
          {activeTab === 'admin-notifications' && renderAdminNotifications()}
          {activeTab === 'guides' && <GuideEditor />}

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









// 🔴 এখন সবচেয়ে জরুরি — Firestore Security Rules

// এই কোড এখন সরাসরি অন্য ইউজারের wallets/{uid} ও deals/{id} ডকুমেন্টে admin থেকে write করছে। Rules-এ অন্তত এই লজিক থাকা লাগবে:
// function isAdmin() {
//   return request.auth != null &&
//     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
// }

// match /wallets/{userId} {
//   allow write: if isAdmin() || request.auth.uid == userId;
// }

// match /deals/{dealId} {
//   allow write: if isAdmin() || request.auth.uid in resource.data.participants;
// }

// match /transactions/{txId} {
//   allow create: if isAdmin() || request.auth.uid == request.resource.data.userId;
// }

// match /guides/{guideId} {
//   allow read: if true;      // সব ইউজার popup দেখতে পাবে
//   allow write: if isAdmin(); // শুধু admin এডিট করতে পারবে
// }