import React from 'react';
import './PostDetailCard.css'; // ✅ CSS ইম্পোর্ট

export const PostDetailCard = ({ 
  postData, onViewPost, canSendOffer, onSendOffer, 
  canApproveDeal, onApproveDeal, onRejectDeal, onReopenDeal,
  existingDeal, getPendingBadgeText 
}) => {
  // ✅ ট্রাংকেটেড ডেটা ব্যবহার
  const { 
    title, 
    fullTitle, 
    description, 
    fullDescription, 
    image, 
    budget, 
    deadline 
  } = postData || {};

  // ✅ স্টাইল অবজেক্ট
  const styles = {
    card: {
      padding: '12px 16px',
      borderBottom: '1px solid #e5e7eb',
      backgroundColor: '#fafafa',
      margin: '8px 12px',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      transition: 'all 0.3s ease'
    },
    inner: {
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start'
    },
    image: {
      width: '60px',
      height: '60px',
      objectFit: 'cover',
      borderRadius: '8px',
      flexShrink: 0,
      backgroundColor: '#f3f4f6'
    },
    info: {
      flex: 1,
      minWidth: 0
    },
    title: {
      fontWeight: '600',
      fontSize: '14px',
      color: '#1a1a1a',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      lineHeight: '1.4',
      maxHeight: '2.8em',
      marginBottom: '4px',
      wordBreak: 'break-word'
    },
    description: {
      fontSize: '12px',
      color: '#6b7280',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      lineHeight: '1.5',
      maxHeight: '3em',
      marginBottom: '8px',
      wordBreak: 'break-word'
    },
    meta: {
      display: 'flex',
      gap: '12px',
      fontSize: '12px',
      color: '#4b5563',
      marginBottom: '8px',
      flexWrap: 'wrap'
    },
    metaItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    },
    metaIcon: {
      marginRight: '4px'
    },
    actions: {
      display: 'flex',
      gap: '6px',
      flexWrap: 'wrap',
      alignItems: 'center'
    },
    button: {
      padding: '4px 12px',
      fontSize: '12px',
      borderRadius: '6px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      border: 'none',
      transition: 'all 0.2s ease',
      fontWeight: '500'
    },
    buttonView: {
      backgroundColor: '#f3f4f6',
      border: '1px solid #d1d5db',
      color: '#374151'
    },
    buttonOffer: {
      backgroundColor: '#3b82f6',
      color: 'white'
    },
    buttonApprove: {
      backgroundColor: '#10b981',
      color: 'white'
    },
    buttonReject: {
      backgroundColor: '#ef4444',
      color: 'white'
    },
    buttonReopen: {
      backgroundColor: '#8b5cf6',
      color: 'white'
    },
    badge: {
      padding: '4px 12px',
      fontSize: '12px',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontWeight: '500'
    },
    badgeActive: {
      backgroundColor: '#d1fae5',
      color: '#065f46'
    },
    badgePending: {
      backgroundColor: '#fef3c7',
      color: '#92400e'
    },
    badgeRejected: {
      backgroundColor: '#fee2e2',
      color: '#991b1b'
    },
    badgeCancelled: {
      backgroundColor: '#fef2f2',
      color: '#991b1b'
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.inner}>
        {/* পোস্ট ইমেজ */}
        {image && (
          <img 
            src={image} 
            alt="Post" 
            style={styles.image}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/images/placeholder-image.jpg';
            }}
          />
        )}
        
        <div style={styles.info}>
          {/* ✅ ট্রাংকেটেড টাইটেল - ২ লাইন */}
          <div 
            style={styles.title}
            title={fullTitle || title || 'No title'}
          >
            {title || 'No title'}
          </div>
          
          {/* ✅ ট্রাংকেটেড ডেস্ক্রিপশন - ২ লাইন */}
          <div 
            style={styles.description}
            title={fullDescription || description || 'No description'}
          >
            {description || 'No description'}
          </div>
          
          {/* ✅ বাজেট ও ডেডলাইন */}
          {/* {(budget > 0 || deadline > 0) && (
            <div style={styles.meta}>
              {budget > 0 && (
                <span style={styles.metaItem}>
                  <i className="fa-solid fa-wallet" style={styles.metaIcon}></i>
                  ৳{budget}
                </span>
              )}
              {deadline > 0 && (
                <span style={styles.metaItem}>
                  <i className="fa-regular fa-calendar" style={styles.metaIcon}></i>
                  {deadline} days
                </span>
              )}
            </div>
          )} */}
          
          <div style={styles.actions}>
            <button 
              style={{ ...styles.button, ...styles.buttonView }}
              onClick={onViewPost}
            >
              <i className="fa-regular fa-eye"></i> View Post
            </button>

            {canSendOffer && (
              <button 
                style={{ ...styles.button, ...styles.buttonOffer }}
                onClick={onSendOffer}
              >
                <i className="fa-solid fa-paper-plane"></i> Send Offer
              </button>
            )}

{canApproveDeal && (
  <>
    <button 
      style={{ 
        ...styles.button, 
        ...styles.buttonApprove,
        opacity: 0.5,
        cursor: 'not-allowed',
        pointerEvents: 'none'
      }}
      onClick={onApproveDeal}
      disabled={true}
      title="⚠️ This feature is temporarily disabled"
    >
      <i className="fa-solid fa-check-circle"></i> Confirm Deal
    </button>
    <button 
      style={{ 
        ...styles.button, 
        ...styles.buttonReject,
        opacity: 0.5,
        cursor: 'not-allowed',
        pointerEvents: 'none'
      }}
      onClick={onRejectDeal}
      disabled={true}
      title="⚠️ This feature is temporarily disabled"
    >
      <i className="fa-solid fa-times-circle"></i> Reject Offer
    </button>
  </>
)}

            {existingDeal?.status === 'active' && (
              <span style={{ ...styles.badge, ...styles.badgeActive }}>
                <i className="fa-solid fa-check-double"></i> ⚡ Deal Active
              </span>
            )}

            {existingDeal?.status === 'pending' && !canApproveDeal && (
              <span style={{ ...styles.badge, ...styles.badgePending }}>
                <i className="fa-solid fa-clock"></i> {getPendingBadgeText()}
              </span>
            )}

            {existingDeal?.status === 'rejected' && (
              <span style={{ ...styles.badge, ...styles.badgeRejected }}>
                <i className="fa-solid fa-ban"></i> ❌ Offer Rejected
              </span>
            )}

            {existingDeal?.status === 'cancelled' && (
              <>
                <span style={{ ...styles.badge, ...styles.badgeCancelled }}>
                  <i className="fa-solid fa-ban"></i> ❌ Deal Cancelled
                </span>
                <button 
                  style={{ ...styles.button, ...styles.buttonReopen }}
                  onClick={onReopenDeal}
                >
                  <i className="fa-solid fa-rotate-right"></i> Re-open Deal
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetailCard;
