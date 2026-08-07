// src/pages/Admin/AdminDashboard.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
import { doc, getDoc } from "firebase/firestore";
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import useAdminNotifications from './hooks/useAdminNotifications';
import useAdminData from './hooks/useAdminData';
import NotificationBanner from '@/components/NotificationBanner/NotificationBanner';
import SoundSettings from '@/UI/Sound/SoundSettings';
import AdminAnnouncement from './AdminAnnouncement';

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
import ReportDetailModal from './components/ReportDetailModal';
import RejectModal from './components/RejectModal';
import VerificationReviewModal from './components/VerificationReviewModal';

// ── Utils ──
import { formatDate, formatMoney } from './utils/adminUtils';

// ── Styles ──
import './AdminDashboard.css';

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
    loadAllData,
    reloadAllData,

    // User operations
    createUserNotification,
    verifyUser,
    toggleBlockUser,
    deleteUser,
    saveVerificationReview, 

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

  // ============================================================
  // 2️⃣ useMemo - Pending Users Count
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
  // 3️⃣ useMemo - Filtered Users
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
  // 4️⃣ useEffect - Admin Check
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
            await feedback.showError('❌ ইউজার ডেটা পাওয়া যায়নি', 'আপনার অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।');
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
  // 5️⃣ useEffect - Update Stats from Users
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
  // 6️⃣ RENDER FUNCTIONS
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
  // 7️⃣ MAIN RENDER
  // ============================================================

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="admin-container">
      <NotificationBanner 
        variant="admin"
        autoShow={true}
        delay={3000}
        customTitle="📢 অ্যাডমিন নোটিফিকেশন চালু করুন"
        customMessage="নতুন অ্যাডমিন আপডেট, রিপোর্ট এবং গুরুত্বপূর্ণ বিজ্ঞপ্তি পেতে নোটিফিকেশন চালু করুন।"
        customIcon="🔔"
      />

      <div className="admin-wrapper">
        
        {/* ── HEADER ── */}
        <div className="admin-header">
          <h1>
            <i className="fa-solid fa-shield-haltered"></i> 
            অ্যাডমিন ড্যাশবোর্ড
            {activeTab !== 'dashboard' && (
              <span className="header-tab-name"> / {activeTab.replace('-', ' ').toUpperCase()}</span>
            )}
          </h1>
          <div className="header-actions">
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
            
            <button className="refresh-btn" onClick={loadAllData}>
              <i className="fa-solid fa-sync"></i>
            </button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="admin-tabs">
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <i className="fa-solid fa-chart-line"></i> ওভারভিউ
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <i className="fa-solid fa-users"></i> ইউজার
            {pendingUsersCount > 0 && (
              <span className="tab-badge danger">{pendingUsersCount}</span>
            )}
          </button>

          <button 
            className={`tab-btn ${activeTab === 'needs-review' ? 'active' : ''}`}
            onClick={() => setActiveTab('needs-review')}
          >
            <i className="fa-solid fa-rotate"></i> 
            Re-review Needed
            {needsReviewCount > 0 && (
              <span className="tab-badge danger">{needsReviewCount}</span>
            )}
          </button>

          <button 
            className={`tab-btn ${activeTab === 'deposits' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('deposits');
              loadAllDeposits(); // ✅ loadDeposits → loadAllDeposits
            }}
          >
            <i className="fa-solid fa-money-bill-wave"></i> ডিপোজিট
            {pendingDeposits.length > 0 && (
              <span className="tab-badge danger">{pendingDeposits.length}</span>
            )}
          </button>

          <button 
            className={`tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            <i className="fa-solid fa-file-alt"></i> পোস্ট
            {posts.length > 0 && (
              <span className="tab-badge">{posts.length}</span>
            )}
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'deals' ? 'active' : ''}`}
            onClick={() => setActiveTab('deals')}
          >
            <i className="fa-solid fa-handshake"></i> ডিল
            {deals.length > 0 && (
              <span className="tab-badge">{deals.length}</span>
            )}
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'withdrawals' ? 'active' : ''}`}
            onClick={() => setActiveTab('withdrawals')}
          >
            <i className="fa-solid fa-money-bill-transfer"></i> উইথড্র
            {withdrawals.filter(w => w.status === 'pending').length > 0 && (
              <span className="tab-badge danger">{withdrawals.filter(w => w.status === 'pending').length}</span>
            )}
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'pending-posts' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('pending-posts');
              loadPendingPosts();
            }}
          >
            <i className="fa-solid fa-clock"></i> পেন্ডিং পোস্ট
            {pendingPosts.length > 0 && (
              <span className="tab-badge danger">{pendingPosts.length}</span>
            )}
          </button>

          <button 
            className={`tab-btn ${activeTab === 'pending-edits' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('pending-edits');
              loadPendingEdits();
            }}
          >
            <i className="fa-solid fa-pen-to-square"></i> পেন্ডিং এডিট
            {pendingEdits.length > 0 && (
              <span className="tab-badge danger">{pendingEdits.length}</span>
            )}
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            <i className="fa-solid fa-bell"></i> নোটিফিকেশন
            {notifications.length > 0 && (
              <span className="tab-badge">{notifications.length}</span>
            )}
          </button>

          <button 
            className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('reports');
              loadReports();
            }}
          >
            <i className="fa-solid fa-flag"></i> রিপোর্ট
            {reports.filter(r => r.status === 'pending').length > 0 && (
              <span className="tab-badge danger">{reports.filter(r => r.status === 'pending').length}</span>
            )}
          </button>

          <button 
            className={`tab-btn ${activeTab === 'announcements' ? 'active' : ''}`}
            onClick={() => setActiveTab('announcements')}
          >
            <i className="fa-solid fa-bullhorn"></i> অ্যানাউন্সমেন্ট
          </button>

          <button 
            className={`tab-btn ${activeTab === 'admin-notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin-notifications')}
          >
            <i className="fa-solid fa-bell"></i> 
            অ্যাডমিন নোটিফিকেশন
            {adminUnreadCount > 0 && (
              <span className="tab-badge danger">{adminUnreadCount}</span>
            )}
          </button>
        </div>

        {/* ── CONTENT ── */}
        <div className="admin-content">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'users' && renderUsers()}
          {activeTab === 'posts' && renderPosts()}
          {activeTab === 'deals' && renderDeals()}
          {activeTab === 'withdrawals' && renderWithdrawals()}
          {activeTab === 'deposits' && renderDeposits()} 
          {activeTab === 'pending-posts' && renderPendingPosts()}
          {activeTab === 'pending-edits' && renderPendingEdits()}
          {activeTab === 'notifications' && renderNotifications()}
          {activeTab === 'announcements' && <AdminAnnouncement />}
          {activeTab === 'reports' && renderReports()}
          {activeTab === 'admin-notifications' && renderAdminNotifications()}
          
          {/* ✅ Needs Review Section */}
          {activeTab === 'needs-review' && (
            <div className="needs-review-section">
              <div className="section-header">
                <h3>
                  <i className="fa-solid fa-rotate"></i> 
                  Re-review Needed ({needsReviewCount})
                </h3>
                <p className="section-subtitle">
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