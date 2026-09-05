// src/pages/Admin/utils/adminUtils.js

// ============================================================
// 📌 HELPER FUNCTIONS - Admin Dashboard
// ============================================================

/**
 * Format date to Bangladesh locale string
 * @param {Date|Object|string|number} date - Date to format
 * @returns {string} Formatted date string or 'N/A'
 */
export const formatDate = (date) => {
  if (!date) return 'N/A';
  
  try {
    let dateObj = null;
    
    if (date && typeof date === 'object' && date.seconds !== undefined) {
      dateObj = new Date(date.seconds * 1000);
    } else if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (typeof date === 'string' || typeof date === 'number') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    }
    
    if (!dateObj || isNaN(dateObj.getTime())) {
      return 'N/A';
    }
    
    return dateObj.toLocaleDateString('bn-BD', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'N/A';
  }
};

/**
 * Format money amount to BDT currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export const formatMoney = (amount) => {
  return new Intl.NumberFormat('bn-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0
  }).format(amount || 0);
};

/**
 * Get status badge class based on status
 * @param {string} status - Status string
 * @returns {string} CSS class name
 */
export const getStatusBadge = (status) => {
  const statusMap = {
    'active': 'active',
    'pending': 'pending',
    'processing': 'processing',
    'completed': 'completed',
    'rejected': 'rejected',
    'blocked': 'blocked',
    'verified': 'verified'
  };
  return statusMap[status] || 'pending';
};

/**
 * Get user status label and class
 * @param {Object} user - User object
 * @returns {Object} { label, className }
 */
export const getUserStatus = (user) => {
  if (user.isBanned || user.isBlocked) {
    return { label: '🚫 ব্লক', className: 'blocked' };
  }
  if (user.isVerified) {
    return { label: '✅ যাচাইকৃত', className: 'verified' };
  }
  if (user.isComplete && user.verificationStatus === 'pending') {
    return { label: '⏳ যাচাই প্রক্রিয়াধীন', className: 'pending' };
  }
  if (user.isComplete && !user.isVerified) {
    return { label: '🔄 যাচাই বাকি', className: 'pending_verification' };
  }
  return { label: '📝 অসম্পূর্ণ', className: 'incomplete' };
};

/**
 * Check if user is admin
 * @param {Object} user - User object with role and email
 * @param {Array} adminEmails - List of admin emails
 * @returns {boolean}
 */
export const isAdminUser = (user, adminEmails) => {
  return user?.role === 'admin' || adminEmails?.includes(user?.email);
};

/**
 * Get pending reports count
 * @param {Array} reports - Reports array
 * @returns {number}
 */
export const getPendingReportsCount = (reports) => {
  return reports?.filter(r => r.status === 'pending').length || 0;
};

/**
 * Get pending withdrawals count
 * @param {Array} withdrawals - Withdrawals array
 * @returns {number}
 */
export const getPendingWithdrawalsCount = (withdrawals) => {
  return withdrawals?.filter(w => w.status === 'pending').length || 0;
};

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export const truncateText = (text, maxLength = 40) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Get display name from user object
 * @param {Object} user - User object
 * @returns {string} Display name
 */
export const getUserDisplayName = (user) => {
  if (user.displayName) return user.displayName;
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
  return 'N/A';
};

/**
 * Get user ID short display
 * @param {Object} user - User object
 * @returns {string} Short ID
 */
export const getUserShortId = (user) => {
  return user.uniqueId || user.id?.slice(-8) || 'N/A';
};

/**
 * Get post type display label
 * @param {string} type - Post type
 * @returns {string} Display label
 */
export const getPostTypeLabel = (type) => {
  return type === 'hire' ? '💼 চাকরি' : '🛠️ সার্ভিস';
};

/**
 * Get report type display label
 * @param {string} type - Report type
 * @returns {string} Display label
 */
export const getReportTypeLabel = (type) => {
  return type === 'complaint' ? '❌ অভিযোগ' : '💡 পরামর্শ';
};

/**
 * Get status display label
 * @param {string} status - Status
 * @returns {string} Display label
 */
export const getStatusLabel = (status) => {
  const labels = {
    'pending': '⏳ অপেক্ষমান',
    'processing': '🔄 প্রক্রিয়াধীন',
    'completed': '✅ সম্পন্ন',
    'rejected': '❌ প্রত্যাখ্যাত',
    'resolved': '✅ সমাধানকৃত',
    'cancelled': '❌ বাতিলকৃত',
    'active': '✅ সক্রিয়',
    'blocked': '🚫 ব্লক',
    'verified': '✅ যাচাইকৃত'
  };
  return labels[status] || status || 'প্রক্রিয়াধীন';
};

/**
 * Get withdrawal status display label
 * @param {string} status - Withdrawal status
 * @returns {string} Display label
 */
export const getWithdrawalStatusLabel = (status) => {
  const labels = {
    'pending': '⏳ অপেক্ষমান',
    'processing': '🔄 প্রক্রিয়াধীন',
    'completed': '✅ সম্পন্ন',
    'rejected': '❌ প্রত্যাখ্যাত'
  };
  return labels[status] || status || 'অজানা';
};

/**
 * Get report status display label
 * @param {string} status - Report status
 * @returns {string} Display label
 */
export const getReportStatusLabel = (status) => {
  const labels = {
    'pending': '⏳ অপেক্ষমান',
    'resolved': '✅ সমাধানকৃত',
    'cancelled': '❌ বাতিলকৃত'
  };
  return labels[status] || status || 'অজানা';
};

/**
 * Get user role display label
 * @param {string} role - User role
 * @returns {string} Display label
 */
export const getUserRoleLabel = (role) => {
  return role === 'client' ? 'ক্লায়েন্ট' : 'ফ্রিল্যান্সার';
};

/**
 * Format withdrawal status for badge
 * @param {string} status - Withdrawal status
 * @returns {string} Badge class
 */
export const getWithdrawalBadgeClass = (status) => {
  const map = {
    'pending': 'pending',
    'processing': 'processing',
    'completed': 'completed',
    'rejected': 'rejected'
  };
  return map[status] || 'pending';
};

/**
 * Format report status for badge
 * @param {string} status - Report status
 * @returns {string} Badge class
 */
export const getReportBadgeClass = (status) => {
  const map = {
    'pending': 'pending',
    'resolved': 'resolved',
    'cancelled': 'cancelled'
  };
  return map[status] || 'pending';
};

/**
 * Get deal status display label
 * @param {string} status - Deal status
 * @returns {string} Display label
 */
export const getDealStatusLabel = (status) => {
  return status || 'প্রক্রিয়াধীন';
};

/**
 * Check if user has documents
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const hasUserDocuments = (user) => {
  return !!(user.documents?.nidFront || user.documents?.birthCert);
};

/**
 * Check if user has face photo
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const hasFacePhoto = (user) => {
  return !!user.facePhotoUrl;
};

/**
 * Get document icons based on user documents
 * @param {Object} user - User object
 * @returns {Array} Array of icon strings
 */
export const getUserDocumentIcons = (user) => {
  const icons = [];
  if (user.documents?.nidFront) icons.push('🪪');
  if (user.documents?.nidBack) icons.push('🔄');
  if (user.documents?.birthCert) icons.push('📄');
  return icons;
};