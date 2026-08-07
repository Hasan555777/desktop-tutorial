// src/components/NotificationModal.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './NotificationModal.css';

const NotificationModal = ({ notification, onClose }) => {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);
  const navigationTimeoutRef = useRef(null);

  if (!notification) {
    console.log("⚠️ NotificationModal: No notification provided");
    return null;
  }

  console.log("📌 NotificationModal rendering:", notification);

  // ── আইকন জেনারেটর ──
  const getIcon = (type) => {
    const icons = {
      'deal': 'fa-solid fa-handshake',
      'payment': 'fa-solid fa-money-bill-wave',
      'message': 'fa-solid fa-envelope',
      'system': 'fa-solid fa-bell',
      'success': 'fa-solid fa-check-circle',
      'warning': 'fa-solid fa-triangle-exclamation',
      'info': 'fa-solid fa-info-circle',
      'error': 'fa-solid fa-times-circle',
      'deposit': 'fa-solid fa-arrow-up-right-from-square',
      'withdraw': 'fa-solid fa-arrow-up-right-from-square',
      'new_user_registration': 'fa-solid fa-user-plus',
      'pending_verification': 'fa-solid fa-hourglass-half',
      'cancellation_request': 'fa-solid fa-clock',
      'cancellation_approved': 'fa-solid fa-check-circle',
      'cancellation_rejected': 'fa-solid fa-times-circle',
      'deal_cancelled': 'fa-solid fa-ban',
      'deal_rejected': 'fa-solid fa-times-circle',
      'offer_rejected': 'fa-solid fa-times-circle',
      'withdraw_rejected': 'fa-solid fa-times-circle',
      'deposit_rejected': 'fa-solid fa-times-circle',
    };
    return icons[type] || 'fa-solid fa-bell';
  };

  // ── কালার জেনারেটর ──
  const getColor = (type) => {
    const colors = {
      'deal': '#6366f1',
      'payment': '#10b981',
      'message': '#3b82f6',
      'system': '#6b7280',
      'success': '#10b981',
      'warning': '#f59e0b',
      'info': '#3b82f6',
      'error': '#ef4444',
      'deposit': '#10b981',
      'withdraw': '#f59e0b',
      'new_user_registration': '#8b5cf6',
      'pending_verification': '#f59e0b',
      'cancellation_request': '#f59e0b',
      'cancellation_approved': '#10b981',
      'cancellation_rejected': '#ef4444',
      'deal_cancelled': '#ef4444',
      'deal_rejected': '#ef4444',
      'offer_rejected': '#ef4444',
      'withdraw_rejected': '#ef4444',
      'deposit_rejected': '#ef4444',
    };
    return colors[type] || '#6b7280';
  };

  // ── ডেট ফরম্যাট ──
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      let date;
      if (timestamp?.toDate) {
        date = timestamp.toDate();
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        return 'Just now';
      }
      
      if (isNaN(date.getTime())) return 'Just now';
      
      return date.toLocaleString('en-BD', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Just now';
    }
  };

  // ── টাইটেল জেনারেটর ──
  const getTitle = (notification) => {
    if (notification.title) return notification.title;
    
    const titles = {
      'cancellation_request': '⚠️ Cancellation Request',
      'cancellation_approved': '✅ Cancellation Approved',
      'cancellation_rejected': '❌ Cancellation Rejected',
      'deal_cancelled': '❌ Deal Cancelled',
      'deal_rejected': '❌ Deal Rejected',
      'offer_rejected': '❌ Offer Rejected',
      'deal_confirmed': '✅ Deal Confirmed!',
      'new_offer': '📩 New Offer',
      'payment': '💳 Payment Update',
      'deposit': '💰 Deposit Received',
      'withdraw': '💳 Withdrawal Request',
      'withdraw_rejected': '❌ Withdrawal Rejected',
      'deposit_rejected': '❌ Deposit Rejected',
      'error': '❌ Error',
      'success': '✅ Success',
      'warning': '⚠️ Warning',
      'info': 'ℹ️ Information',
    };
    return titles[notification.type] || '📢 Notification';
  };

  const icon = getIcon(notification.type);
  const color = getColor(notification.type);
  const title = getTitle(notification);

  // ── রিজেক্ট/ক্যানসেল চেক ──
  const isRejected = ['cancellation_rejected', 'deal_cancelled', 'deal_rejected', 'offer_rejected', 'withdraw_rejected', 'deposit_rejected', 'error'].includes(notification.type);
  const isPending = ['cancellation_request', 'pending_verification'].includes(notification.type);
  const isApproved = ['cancellation_approved', 'deal_confirmed', 'success'].includes(notification.type);

  // ============================================================
  // ✅ অ্যাকশন হ্যান্ডলার - শুধু এখানেই navigation
  // ============================================================
  const handleAction = () => {
    if (isNavigating) {
      console.log("⏳ Navigation in progress, ignoring click");
      return;
    }
    
    setIsNavigating(true);
    
    // ✅ 100ms delay
    const delay = 100;
    
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    
    navigationTimeoutRef.current = setTimeout(() => {
      if (notification.dealId) {
        navigate(`/deal-manager?dealId=${notification.dealId}`);
        onClose();
      } else if (notification.link) {
        navigate(notification.link);
        onClose();
      } else if (notification.chatId) {
        navigate(`/inbox?chatId=${notification.chatId}`);
        onClose();
      } else if (notification.postId) {
        navigate(`/post/${notification.postId}`);
        onClose();
      }
      
      setIsNavigating(false);
      navigationTimeoutRef.current = null;
    }, delay);
  };

  // ============================================================
  // ✅ ক্লোজ হ্যান্ডলার
  // ============================================================
  const handleClose = () => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    setIsNavigating(false);
    if (onClose) onClose();
  };

  // ============================================================
  // ✅ Escape Key
  // ============================================================
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div className="notification-modal-overlay" onClick={handleClose}>
      <div className="notification-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* ── হেডার ── */}
        <div className="modal-header">
          <div className="modal-icon-wrapper" style={{ background: `${color}15` }}>
            <i className={icon} style={{ color: color }}></i>
          </div>
          <h3>{title}</h3>
          <button className="modal-close-btn" onClick={handleClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* ── বডি ── */}
        <div className="modal-body">
          <div className="notification-detail">
            
            {/* সময় */}
            <div className="detail-item">
              <span className="detail-label">📅 Time</span>
              <span className="detail-value">{formatDate(notification.createdAt)}</span>
            </div>

            {/* মেসেজ */}
            {notification.message && (
              <div className="detail-item">
                <span className="detail-label">💬 Message</span>
                <span className="detail-value message-text">{notification.message}</span>
              </div>
            )}

            {/* টাইপ */}
            {notification.type && (
              <div className="detail-item">
                <span className="detail-label">📌 Type</span>
                <span className="detail-value">
                  <span className="type-badge" style={{ background: `${color}15`, color: color }}>
                    {notification.type.toUpperCase()}
                  </span>
                </span>
              </div>
            )}

            {/* ✅ স্ট্যাটাস */}
            <div className="detail-item">
              <span className="detail-label">📌 Status</span>
              <span className="detail-value">
                {isRejected && (
                  <span className="status-badge rejected">❌ Rejected</span>
                )}
                {isPending && (
                  <span className="status-badge pending">⏳ Pending</span>
                )}
                {isApproved && (
                  <span className="status-badge approved">✅ Approved</span>
                )}
                {!isRejected && !isPending && !isApproved && notification.type && (
                  <span className="status-badge info">ℹ️ {notification.type.toUpperCase()}</span>
                )}
              </span>
            </div>

            {/* ইউজার আইডি */}
            {notification.userId && (
              <div className="detail-item">
                <span className="detail-label">👤 User ID</span>
                <span className="detail-value">{notification.userId}</span>
              </div>
            )}

            {/* ডিল আইডি */}
            {notification.dealId && (
              <div className="detail-item">
                <span className="detail-label">🤝 Deal ID</span>
                <span className="detail-value">{notification.dealId}</span>
              </div>
            )}

          </div>
        </div>

        {/* ── ফুটার ── */}
        <div className="modal-footer">
          <button 
            className="btn-close" 
            onClick={handleClose}
            disabled={isNavigating}
          >
            Close
          </button>
          
          {notification.dealId && (
            <button 
              className={`btn-action ${isNavigating ? 'loading' : ''}`} 
              onClick={handleAction}
              disabled={isNavigating}
            >
{isNavigating ? (
  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <i className="fa-solid fa-spinner fa-spin" style={{ 
      color: 'var(--accent-primary, #14b8a6)' 
    }}></i>
    Loading...
  </span>
) : (
  <>View Deal →</>
)}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default NotificationModal;