// src/pages/Admin/components/PendingPosts.jsx

import React, { useState, useCallback, useEffect } from 'react';
import { formatDate, formatMoney, getPostTypeLabel } from '../utils/adminUtils';
import EmptyState from './EmptyState';
import './PendingPosts.css';

// ============================================================
// 🎯 Image Zoom Modal Component
// ============================================================
const ImageZoomModal = ({ imageUrl, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [onClose]);

  return (
    <div className="image-zoom-modal" onClick={onClose}>
      <div className="image-zoom-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="image-zoom-close" onClick={onClose}>
          <i className="fa-solid fa-xmark"></i>
        </button>
        <img src={imageUrl} alt="Zoomed" />
      </div>
    </div>
  );
};

// ============================================================
// 🎯 Budget & Deadline Helpers
// ============================================================
const getBudgetDisplay = (post) => {
  const budgetData = post?.budget;
  
  if (!budgetData) {
    const fallback = post?.price || 0;
    return {
      display: `৳${Number(fallback).toLocaleString('en-IN')}`,
      isNegotiable: post?.isNegotiable || false,
      type: 'fixed'
    };
  }

  if (typeof budgetData === 'object') {
    if (budgetData.type === 'range' || (budgetData.min !== undefined && budgetData.max !== undefined)) {
      const min = Number(budgetData.min || 0);
      const max = Number(budgetData.max || 0);
      return {
        display: `৳${min.toLocaleString('en-IN')} - ৳${max.toLocaleString('en-IN')}`,
        isNegotiable: budgetData.isNegotiable || false,
        type: 'range'
      };
    }
    
    if (budgetData.type === 'fixed' || budgetData.amount !== undefined) {
      const amount = Number(budgetData.amount || budgetData.max || 0);
      return {
        display: `৳${amount.toLocaleString('en-IN')}`,
        isNegotiable: budgetData.isNegotiable || false,
        type: 'fixed'
      };
    }
  }

  const amount = Number(budgetData);
  return {
    display: `৳${amount.toLocaleString('en-IN')}`,
    isNegotiable: post?.isNegotiable || false,
    type: 'fixed'
  };
};

const getDeadlineDisplay = (post) => {
  const deadlineData = post?.deadline || post?.deliveryTime || post?.deliveryDays;
  
  if (!deadlineData) {
    return { display: 'N/A', type: 'fixed' };
  }

  if (typeof deadlineData === 'object') {
    if (deadlineData.type === 'range' || (deadlineData.min !== undefined && deadlineData.max !== undefined)) {
      const min = Number(deadlineData.min || 0);
      const max = Number(deadlineData.max || 0);
      return {
        display: `${min} - ${max} days`,
        type: 'range'
      };
    }
    
    if (deadlineData.type === 'fixed' || deadlineData.days !== undefined) {
      const days = Number(deadlineData.days || deadlineData.max || 0);
      return {
        display: `${days} days`,
        type: 'fixed'
      };
    }
  }

  const days = Number(deadlineData);
  return {
    display: `${days} days`,
    type: 'fixed'
  };
};

// ============================================================
// 🎯 Description Component with Expand/Collapse (FIXED)
// ============================================================
const PostDescription = ({ description }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const maxLength = 300;
  const safeDescription = description || '';

  const shouldTruncate = safeDescription.length > maxLength;

  const displayText =
    isExpanded || !shouldTruncate
      ? safeDescription
      : safeDescription.substring(0, maxLength);

  if (!description) {
    return (
      <p className="post-descriptionn no-description">
        No description provided.
      </p>
    );
  }

  return (
    <div className="post-descriptionn-wrapper">
      <p className="post-descriptionn">
        {displayText}
        {shouldTruncate && !isExpanded && '...'}
      </p>

      {shouldTruncate && (
        <button
          type="button"
          className="description-toggle-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? (
            <>
              <i className="fa-solid fa-chevron-up"></i>
              {' '}Show Less
            </>
          ) : (
            <>
              <i className="fa-solid fa-chevron-down"></i>
              {' '}Read More ({safeDescription.length - maxLength} more chars)
            </>
          )}
        </button>
      )}
    </div>
  );
};

// ============================================================
// 🎯 MAIN COMPONENT
// ============================================================

const PendingPosts = ({ 
  posts = [], 
  onApprove, 
  onReject, 
  onRefresh,
  onOpenRejectModal,
  formatDateFn = formatDate,
  formatMoneyFn = formatMoney
}) => {
  // ✅ State for Image Zoom
  const [zoomedImage, setZoomedImage] = useState(null);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  // ============================================================
  // ✅ Image Zoom Handlers
  // ============================================================
  const handleImageClick = useCallback((imageUrl) => {
    if (imageUrl) {
      setZoomedImage(imageUrl);
      setIsZoomModalOpen(true);
    }
  }, []);

  const handleCloseZoom = useCallback(() => {
    setIsZoomModalOpen(false);
    setZoomedImage(null);
  }, []);

  // ============================================================
  // ✅ Reject Modal Handlers
  // ============================================================
  const handleRejectClick = (postId) => {
    setSelectedPostId(postId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleRejectConfirm = () => {
    if (selectedPostId && rejectReason.trim()) {
      onReject(selectedPostId, rejectReason.trim());
      setShowRejectModal(false);
      setSelectedPostId(null);
      setRejectReason('');
    } else {
      alert('দয়া করে রিজেক্ট করার কারণ লিখুন!');
    }
  };

  const handleRejectCancel = () => {
    setShowRejectModal(false);
    setSelectedPostId(null);
    setRejectReason('');
  };

  // ============================================================
  // ✅ Render
  // ============================================================

  if (posts.length === 0) {
    return (
      <div className="data-table pending-posts-table">
        <div className="table-header">
          <h3>
            <i className="fa-solid fa-clock"></i> 
            পেন্ডিং পোস্ট
            <span className="table-count">0 টি</span>
          </h3>
          <button className="refresh-btn" onClick={onRefresh}>
            <i className="fa-solid fa-sync"></i> রিফ্রেশ
          </button>
        </div>
        <EmptyState 
          icon="fa-solid fa-check-circle"
          iconColor="#10b981"
          iconSize="48px"
          title="কোন পেন্ডিং পোস্ট নেই"
          subtitle="সব পোস্ট অ্যাপ্রুভ করা হয়েছে! 🎉"
        />
      </div>
    );
  }

  return (
    <>
      <div className="data-table pending-posts-table">
        <div className="table-header">
          <h3>
            <i className="fa-solid fa-clock"></i> 
            পেন্ডিং পোস্ট
            <span className="pending-badge">{posts.length} pending</span>
          </h3>
          <button className="refresh-btn" onClick={onRefresh}>
            <i className="fa-solid fa-sync"></i> রিফ্রেশ
          </button>
        </div>

        <div className="pending-posts-grid">
          {posts.map((post) => {
            const budgetInfo = getBudgetDisplay(post);
            const deadlineInfo = getDeadlineDisplay(post);
            const images = post.images || [];
            
            return (
              <div key={post.id} className="pending-post-card">
                {/* ── Card Header ── */}
                <div className="post-header">
                  <div className="post-title-section">
                    <h4 className="post-title">{post.title || 'Untitled'}</h4>
                    <span className="status-badge pending">⏳ পেন্ডিং</span>
                  </div>
                  <div className="post-meta-top">
                    <span>
                      <i className="fa-regular fa-clock"></i> 
                      {formatDateFn(post.createdAt)}
                    </span>
                    <span>
                      <i className="fa-regular fa-user"></i> 
                      {post.clientName || post.userName || 'অজানা'}
                    </span>
                  </div>
                </div>

                {/* ── Images Section ── */}
                {images.length > 0 && (
                  <div className="post-images-section">
                    <div className="post-images-label">
                      <i className="fa-regular fa-image"></i> Images
                    </div>
                    <div className="post-images-container">
                      {images.slice(0, 4).map((img, idx) => (
                        <div 
                          key={idx} 
                          className="post-image-item"
                          onClick={() => handleImageClick(img)}
                        >
                          <img 
                            src={img} 
                            alt={`${post.title || 'Post'} - ${idx + 1}`}
                            onError={(e) => {
                              e.target.src = 'https://via.placeholder.com/400x250?text=No+Image';
                            }}
                          />
                          <div className="image-zoom-overlay">
                            <i className="fa-solid fa-magnifying-glass-plus"></i>
                          </div>
                          {idx === 3 && images.length > 4 && (
                            <div className="image-count-badge">
                              +{images.length - 4}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Post Content with Full Description ── */}
                <div className="post-content">
                  {/* Full Title */}
                  <div className="post-title-full">
                    <span className="title-label">📌 Title</span>
                    <h2 className="post-title-text">{post.title || 'Untitled'}</h2>
                  </div>

                  {/* ✅ Fixed Description with Expand/Collapse */}
                  <div className="post-descriptionn-full">
                    <span className="description-label">📝 Description</span>
                    <PostDescription description={post.description} />
                  </div>
                  
                  {/* Post Details */}
                  <div className="post-details">
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fa-solid fa-tag"></i> Type
                      </span>
                      <span className="detail-value">{getPostTypeLabel(post.type)}</span>
                    </div>
                    
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fa-solid fa-money-bill-wave"></i> Budget
                      </span>
                      <span className="detail-value">
                        {budgetInfo.display}
                        {budgetInfo.isNegotiable && (
                          <span className="negotiable-badge">🤝 Negotiable</span>
                        )}
                        {budgetInfo.type === 'range' && (
                          <span className="range-badge">Range</span>
                        )}
                      </span>
                    </div>
                    
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fa-solid fa-calendar-days"></i> Deadline
                      </span>
                      <span className="detail-value">
                        {deadlineInfo.display}
                        {deadlineInfo.type === 'range' && (
                          <span className="range-badge">Flexible</span>
                        )}
                      </span>
                    </div>
                    
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fa-solid fa-user"></i> Posted By
                      </span>
                      <span className="detail-value">
                        {post.clientName || post.userName || 'অজানা'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Actions ── */}
                <div className="post-actions">
                  <button 
                    className="action-btn approve"
                    onClick={() => onApprove(post.id)}
                    title="অ্যাপ্রুভ করুন"
                  >
                    <i className="fa-solid fa-check"></i> Approve
                  </button>
                  <button 
                    className="action-btn reject"
                    onClick={() => handleRejectClick(post.id)}
                    title="রিজেক্ট করুন"
                  >
                    <i className="fa-solid fa-xmark"></i> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ✅ Image Zoom Modal */}
      {isZoomModalOpen && zoomedImage && (
        <ImageZoomModal 
          imageUrl={zoomedImage} 
          onClose={handleCloseZoom} 
        />
      )}

      {/* ✅ Reject Reason Modal */}
      {showRejectModal && (
        <div className="reject-modal-overlay" onClick={handleRejectCancel}>
          <div className="reject-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reject-modal-header">
              <h3>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444' }}></i>
                Reject Post
              </h3>
              <button className="modal-close-btn" onClick={handleRejectCancel}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="reject-modal-body">
              <p>দয়া করে এই পোস্ট রিজেক্ট করার কারণ লিখুন:</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="রিজেক্ট করার কারণ লিখুন..."
                rows="4"
                className="reject-textarea"
                autoFocus
              />
            </div>
            <div className="reject-modal-actions">
              <button className="cancel-btn" onClick={handleRejectCancel}>
                Cancel
              </button>
              <button 
                className="reject-confirm-btn" 
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim()}
              >
                <i className="fa-solid fa-xmark"></i> Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PendingPosts;