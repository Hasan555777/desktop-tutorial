// src/pages/Admin/components/PendingPosts.jsx

import React, { useState, useCallback, useEffect } from 'react';
import { formatDate, formatMoney, getPostTypeLabel } from '../utils/adminUtils';
import EmptyState from './EmptyState';
// import './PendingPosts.css';
import styles from './PendingPosts.module.css';


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
// 🎯 Description Component with Expand/Collapse
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
// 🎯 Edit Modal Component (NEW)
// ============================================================
// ============================================================
// 🎯 Edit Modal Component (UPDATED)
// ============================================================
const EditPostModal = ({ post, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: post?.title || '',
    description: post?.description || '',
    budget: post?.budget?.amount || post?.budget || '',
    deadline: post?.deadline?.days || post?.deadline || '',
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      alert('দয়া করে টাইটেল লিখুন!');
      return;
    }
    if (!formData.description.trim()) {
      alert('দয়া করে বিবরণ লিখুন!');
      return;
    }

    setLoading(true);
    try {
      // ✅ সম্পূর্ণ পোস্ট ডেটা তৈরি করুন
      const updatedPost = {
        ...post,
        title: formData.title.trim(),
        description: formData.description.trim(),
        budget: formData.budget ? {
          amount: Number(formData.budget),
          type: 'fixed',
          isNegotiable: post?.budget?.isNegotiable || false
        } : post?.budget,
        deadline: formData.deadline ? {
          days: Number(formData.deadline),
          type: 'fixed'
        } : post?.deadline,
        updatedAt: new Date().toISOString(),
        isEdited: true
      };

      await onSave(post.id, updatedPost);
      onClose();
    } catch (error) {
      console.error('Error saving post:', error);
      alert('পোস্ট আপডেট করতে সমস্যা হয়েছে!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reject-modal-overlay" onClick={onClose}>
      <div className="reject-modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reject-modal-header">
          <h3>
            <i className="fa-solid fa-pen" style={{ color: '#3b82f6' }}></i>
            Edit Post
          </h3>
          <button className="modal-close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className="reject-modal-body">
          <div className="edit-form-group">
            <label>Title <span className="required">*</span></label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="পোস্টের টাইটেল লিখুন..."
              className="edit-input"
              disabled={loading}
            />
          </div>
          <div className="edit-form-group">
            <label>Description <span className="required">*</span></label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="পোস্টের বিবরণ লিখুন..."
              rows="4"
              className="edit-textarea"
              disabled={loading}
            />
          </div>
          <div className="edit-form-row">
            <div className="edit-form-group">
              <label>Budget (BDT)</label>
              <input
                type="number"
                name="budget"
                value={formData.budget}
                onChange={handleChange}
                placeholder="বাজেট লিখুন..."
                className="edit-input"
                disabled={loading}
                min="0"
              />
            </div>
            <div className="edit-form-group">
              <label>Deadline (Days)</label>
              <input
                type="number"
                name="deadline"
                value={formData.deadline}
                onChange={handleChange}
                placeholder="সময়সীমা লিখুন..."
                className="edit-input"
                disabled={loading}
                min="1"
              />
            </div>
          </div>
        </div>
        <div className="reject-modal-actions">
          <button className="cancel-btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="edit-confirm-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Saving...
              </>
            ) : (
              <>
                <i className="fa-solid fa-check"></i> Save Changes
              </>
            )}
          </button>
        </div>
      </div>
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
  onEdit, // ✅ এই প্রপটি ইতিমধ্যে আছে, কিন্তু নিশ্চিত করুন
  formatDateFn = formatDate,
  formatMoneyFn = formatMoney,
  onEditPost // ✅ ব্যাকআপ প্রপ নাম (যদি প্রয়োজন হয়)
}) => {
  const [zoomedImage, setZoomedImage] = useState(null);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  
  // ✅ এডিট মোডাল স্টেট
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);

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
  // ✅ Edit Modal Handlers (NEW)
  // ============================================================
 // ============================================================
// ✅ Edit Modal Handlers (UPDATED)
// ============================================================
const handleEditClick = (post) => {
  setEditingPost(post);
  setShowEditModal(true);
};

const handleEditSave = async (postId, updatedData) => {
  try {
    if (onEdit) {
      // ✅ onEdit কলব্যাক কল করুন
      await onEdit(postId, updatedData);
      
      // ✅ সফল হলে মডাল বন্ধ করুন
      setShowEditModal(false);
      setEditingPost(null);
    } else {
      console.warn('⚠️ onEdit callback is not provided');
      alert('এডিট ফাংশন পাওয়া যায়নি!');
    }
  } catch (error) {
    console.error('❌ Error in handleEditSave:', error);
    alert('পোস্ট আপডেট করতে সমস্যা হয়েছে!');
  }
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
      <div className={`${styles.dataTable} ${styles.pendingPostsTable}`}>
        <div className={styles.tableHeader}>
          <h3>
            <i className="fa-solid fa-clock"></i> 
            পেন্ডিং পোস্ট
            <span className={styles.pendingBadge}>{posts.length} pending</span>
          </h3>
          <button className={styles.refreshBtn} onClick={onRefresh}>
            <i className="fa-solid fa-sync"></i> রিফ্রেশ
          </button>
        </div>

        <div className={styles.pendingPostsGrid}>
          {posts.map((post) => {
            const budgetInfo = getBudgetDisplay(post);
            const deadlineInfo = getDeadlineDisplay(post);
            const images = post.images || [];
            
            return (
              <div key={post.id} className={styles.pendingPostCard}>
                {/* ── Card Header ── */}
                <div className={styles.postHeader}>
                  <div className={styles.postTitleSection}>
                    <h4 className={styles.postTitle}>{post.title || 'Untitled'}</h4>
                    <span className={`${styles.statusBadge} ${styles.pending}`}>⏳ পেন্ডিং</span>
                  </div>
                  <div className={styles.postMetaTop}>
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
                  <div className={styles.postImagesSection}>
                    <div className={styles.postImagesLabel}>
                      <i className="fa-regular fa-image"></i> Images
                    </div>
                    <div className={styles.postImagesContainer}>
                      {images.slice(0, 4).map((img, idx) => (
                        <div 
                          key={idx} 
                          className={styles.postImageItem}
                          onClick={() => handleImageClick(img)}
                        >
                          <img 
                            src={img} 
                            alt={`${post.title || 'Post'} - ${idx + 1}`}
                            onError={(e) => {
                              e.target.src = 'https://via.placeholder.com/400x250?text=No+Image';
                            }}
                          />
                          <div className={styles.imageZoomOverlay}>
                            <i className="fa-solid fa-magnifying-glass-plus"></i>
                          </div>
                          {idx === 3 && images.length > 4 && (
                            <div className={styles.imageCountBadge}>
                              +{images.length - 4}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Post Content ── */}
                <div className={styles.postContent}>
                  <div className={styles.postTitleFull}>
                    <span className={styles.titleLabel}>📌 Title</span>
                    <h2 className={styles.postTitleText}>{post.title || 'Untitled'}</h2>
                  </div>

                  <div className={styles.postDescriptionFull}>
                    <span className={styles.descriptionLabel}>📝 Description</span>
                    <PostDescription description={post.description} />
                  </div>
                  
                  <div className={styles.postDetails}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>
                        <i className="fa-solid fa-tag"></i> Type
                      </span>
                      <span className={styles.detailValue}>{getPostTypeLabel(post.type)}</span>
                    </div>
                    
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>
                        <i className="fa-solid fa-money-bill-wave"></i> Budget
                      </span>
                      <span className={styles.detailValue}>
                        {budgetInfo.display}
                        {budgetInfo.isNegotiable && (
                          <span className={styles.negotiableBadge}>🤝 Negotiable</span>
                        )}
                        {budgetInfo.type === 'range' && (
                          <span className={styles.rangeBadge}>Range</span>
                        )}
                      </span>
                    </div>
                    
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>
                        <i className="fa-solid fa-calendar-days"></i> Deadline
                      </span>
                      <span className={styles.detailValue}>
                        {deadlineInfo.display}
                        {deadlineInfo.type === 'range' && (
                          <span className={styles.rangeBadge}>Flexible</span>
                        )}
                      </span>
                    </div>
                    
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>
                        <i className="fa-solid fa-user"></i> Posted By
                      </span>
                      <span className={styles.detailValue}>
                        {post.clientName || post.userName || 'অজানা'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Actions ── */}
                <div className={styles.postActions}>
                  <button 
                    className={`${styles.actionBtn} ${styles.edit}`}
                    onClick={() => handleEditClick(post)}
                    title="এডিট করুন"
                  >
                    <i className="fa-solid fa-pen"></i> Edit
                  </button>
                  <button 
                    className={`${styles.actionBtn} ${styles.approve}`}
                    onClick={() => onApprove(post.id)}
                    title="অ্যাপ্রুভ করুন"
                  >
                    <i className="fa-solid fa-check"></i> Approve
                  </button>
                  <button 
                    className={`${styles.actionBtn} ${styles.reject}`}
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
        <div className={styles.rejectModalOverlay} onClick={handleRejectCancel}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.rejectModalHeader}>
              <h3>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444' }}></i>
                Reject Post
              </h3>
              <button className={styles.modalCloseBtn} onClick={handleRejectCancel}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className={styles.rejectModalBody}>
              <p>দয়া করে এই পোস্ট রিজেক্ট করার কারণ লিখুন:</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="রিজেক্ট করার কারণ লিখুন..."
                rows="4"
                className={styles.rejectTextarea}
                autoFocus
              />
            </div>
            <div className={styles.rejectModalActions}>
              <button className={styles.cancelBtn} onClick={handleRejectCancel}>
                Cancel
              </button>
              <button 
                className={styles.rejectConfirmBtn} 
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim()}
              >
                <i className="fa-solid fa-xmark"></i> Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Edit Modal (NEW) */}
      {showEditModal && editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => {
            setShowEditModal(false);
            setEditingPost(null);
          }}
          onSave={handleEditSave}
        />
      )}
    </>
  );
};

export default PendingPosts;