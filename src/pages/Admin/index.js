// src/pages/Admin/index.js

// ============================================================
// 📌 MAIN EXPORT
// ============================================================
export { default } from './AdminDashboard';
export { default as AdminDashboard } from './AdminDashboard';

// ============================================================
// 📌 COMPONENTS EXPORTS
// ============================================================
export { default as Loading } from './components/Loading';
export { default as EmptyState } from './components/EmptyState';
export { default as StatsGrid } from './components/StatsGrid';
export { default as GlobalSearch } from './components/GlobalSearch';
export { default as UserFilters } from './components/UserFilters';
export { default as ConfirmModal } from './components/ConfirmModal';
export { default as RejectModal } from './components/RejectModal';
export { default as UserDetailModal } from './components/UserDetailModal';
export { default as ReportDetailModal } from './components/ReportDetailModal';
export { default as UsersTable } from './components/UsersTable';
export { default as PostsTable } from './components/PostsTable';
export { default as DealsTable } from './components/DealsTable';
export { default as DepositsTable } from './components/DepositsTable';
export { default as WithdrawalsTable } from './components/WithdrawalsTable';
export { default as PendingPosts } from './components/PendingPosts';
export { default as PendingEdits } from './components/PendingEdits';
export { default as ReportsSection } from './components/ReportsSection';
export { default as NotificationsSection } from './components/NotificationsSection';
export { default as AdminNotifications } from './components/AdminNotifications';

// ============================================================
// 📌 HOOKS EXPORTS
// ============================================================
export { default as useAdminData } from './hooks/useAdminData';
export { default as useAdminNotifications } from './hooks/useAdminNotifications';

// ============================================================
// 📌 UTILS EXPORTS
// ============================================================
export * from './utils/adminUtils';

// ============================================================
// 📌 OTHER EXPORTS
// ============================================================
export { default as AdminAnnouncement } from './AdminAnnouncement';