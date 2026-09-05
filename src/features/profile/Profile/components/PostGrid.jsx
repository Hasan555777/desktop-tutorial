// src/components/profile/PostGrid.jsx

import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../shared/firebase/index';
import { useFeedback } from '../../../../shared/ui/Feedback/FeedbackProvider';
import { formatBudget, formatDeadline, getImageCacheKey } from '../utils/profileHelpers';
import styles from './PostGrid.module.css';

const PostGrid = ({
  posts,
  isLoading,
  emptyMessage,
  activeTab,
  currentMode,
  activeDealPosts,
  onEdit,
  onDelete,
  onUnsave,
  onCreateClick,
  user,
  onToggleLock,
}) => {
  const feedback = useFeedback();
  const [togglingPostId, setTogglingPostId] = useState(null);

  // ── Busy/Deal Active টগল ফাংশন ──
  const togglePostStatus = async (postId, currentStatus) => {
    if (!user || !onToggleLock) {
      console.warn('Toggle lock not available');
      return;
    }

    setTogglingPostId(postId);
    try {
      await onToggleLock(postId, !currentStatus);
    } catch (error) {
      console.error('Error toggling post status:', error);
      feedback.alert.error({ title: 'Failed to update post status' });
    } finally {
      setTogglingPostId(null);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <i className={`fa-solid fa-spinner fa-spin ${styles.loadingIcon}`} />
        <p>Loading posts...</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={styles.noPosts}>
        <i className="fa-solid fa-folder-open"></i>
        <p>{emptyMessage}</p>
        {activeTab === 'posts' && (
          <button className={styles.createPostBtn} onClick={onCreateClick}>
            <i className="fa-solid fa-plus"></i> Create {currentMode === 'buyer' ? 'Job' : 'Service'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.postsGrid}>
      {posts.map((post, index) => {
        const dealInfo = activeDealPosts[post.id];
        const hasActiveDeal = !!dealInfo?.hasActiveDeal;
        
        const isBusy = post.postStatus?.isBusy || false;
        const isDealActive = post.postStatus?.isDealActive || false;
        const isStatusActive = currentMode === 'seller' ? isBusy : isDealActive;

        const statusText = currentMode === 'seller'
          ? (isBusy ? '🔒 Currently Busy' : '🟢 Available')
          : (isDealActive ? '🔒 Deal Active' : '🟢 Open for Proposals');

        const toggleLabel = currentMode === 'seller' 
          ? (isBusy ? 'Unbusy' : '🔒 Busy')
          : (isDealActive ? 'Unbusy' : 'Busy');

        const toggleIcon = currentMode === 'seller'
          ? (isBusy ? 'fa-unlock' : 'fa-lock')
          : (isDealActive ? 'fa-door-open' : 'fa-handshake');

        return (
          <div key={`${post.id}-${index}`} className={`${styles.postCard} ${isStatusActive ? styles.statusActive : ''}`}>
            {/* ── স্ট্যাটাস ব্যাজ ── */}
            {post.status === 'pending' && (
              <div className={`${styles.postStatusBadge} ${styles.pending}`}>
                <i className="fa-solid fa-clock"></i> Pending Approval
              </div>
            )}
            {post.status === 'rejected' && (
              <div className={`${styles.postStatusBadge} ${styles.rejected}`}>
                <i className="fa-solid fa-xmark-circle"></i> Rejected
              </div>
            )}
            {post.status === 'approved' && (
              <div className={`${styles.postStatusBadge} ${styles.approved}`}>
                <i className="fa-solid fa-check-circle"></i> Published
              </div>
            )}

            {/* ── Active Deal Indicator ── */}
            {hasActiveDeal && (
              <div className={styles.activeDealBadge}>
                <i className="fa-solid fa-handshake"></i>
                Active Deal ({dealInfo?.dealCount || 1})
              </div>
            )}

            {/* ── Images ── */}
            {post.images && post.images.length > 0 && (
              <div className={`${styles.postImagesContainer} ${post.images.length > 1 ? styles.twoImages : styles.oneImage}`}>
                {post.images.slice(0, 2).map((img, imgIndex) => (
                  <img
                    key={imgIndex}
                    src={`${img.split('?')[0]}?v=${getImageCacheKey(post)}`}
                    alt={post.title}
                    className={styles.postImage}
                    loading="lazy"
                  />
                ))}
                {post.images.length > 2 && (
                  <div className={styles.postImageBadge}>+{post.images.length - 2}</div>
                )}
              </div>
            )}

            {/* ── Content ── */}
            <div className={styles.postContent}>
              <h4>{post.title}</h4>
              <p className={styles.postDescription}>{post.description?.substring(0, 100)}...</p>
              <div className={styles.postMeta}>
                <span><i className="fa-solid fa-wallet"></i> {formatBudget(post)} BDT</span>
                <span><i className="fa-regular fa-clock"></i> {formatDeadline(post)} Days</span>
                <span><i className="fa-solid fa-tag"></i> {post.type === 'hire' ? 'Job' : 'Service'}</span>
              </div>

              {/* ── ✅ Status Toggle Button ── */}
              {activeTab === 'posts' && post.status === 'approved' && (
                <div className={styles.postActions}>
                  <button
                    className={`${styles.statusToggleBtn} ${isStatusActive ? styles.active : ''}`}
                    onClick={() => togglePostStatus(post.id, isStatusActive)}
                    disabled={togglingPostId === post.id}
                    title={currentMode === 'seller' 
                      ? (isBusy ? 'Mark as Available' : 'Mark as Busy')
                      : (isDealActive ? 'Close Deal' : 'Mark as Busy')
                    }
                  >
                    {togglingPostId === post.id ? (
                      <i className="fa-solid fa-spinner fa-spin"></i>
                    ) : (
                      <>
                        <i className={`fa-solid ${toggleIcon}`}></i>
                        {toggleLabel}
                      </>
                    )}
                  </button>

                  {/* ── Edit Button ── */}
                  {post.editStatus === 'pending' ? (
                    <span className={styles.editPendingInfo}>
                      <i className="fa-solid fa-hourglass-half"></i> Edit Pending
                    </span>
                  ) : (
                    <button
                      className={`${styles.editPostBtn} ${hasActiveDeal || isStatusActive ? styles.disabled : ''}`}
                      onClick={() => onEdit(post)}
                      disabled={hasActiveDeal || isStatusActive}
                      title={
                        hasActiveDeal 
                          ? 'Active Deal থাকার কারণে এডিট করা যাবে না' 
                          : isStatusActive
                            ? (currentMode === 'seller' ? 'Busy থাকাকালীন এডিট করা যাবে না' : 'Deal Active থাকাকালীন এডিট করা যাবে না')
                            : 'Edit Post'
                      }
                    >
                      <i className="fa-solid fa-pen"></i>
                      {hasActiveDeal ? '🔒 Active Deal' : isStatusActive ? '🔒 Locked' : 'Edit'}
                    </button>
                  )}

                  {/* ── Delete Button ── */}
                  <button
                    className={`${styles.deleteBtn} ${hasActiveDeal || isStatusActive ? styles.disabled : ''}`}
                    onClick={() => onDelete(post.id)}
                    disabled={hasActiveDeal || isStatusActive}
                    title={
                      hasActiveDeal 
                        ? 'Active Deal থাকার কারণে ডিলিট করা যাবে না'
                        : isStatusActive
                          ? (currentMode === 'seller' ? 'Busy থাকাকালীন ডিলিট করা যাবে না' : 'Deal Active থাকাকালীন ডিলিট করা যাবে না')
                          : 'Delete Post'
                    }
                  >
                    <i className="fa-solid fa-trash"></i>
                    {hasActiveDeal ? '🔒 Active Deal' : isStatusActive ? '🔒 Locked' : 'Delete'}
                  </button>
                </div>
              )}

              {/* ── Pending Post Actions ── */}
              {activeTab === 'posts' && post.status === 'pending' && (
                <div className={styles.postActions}>
                  <span className={styles.pendingInfo}>
                    <i className="fa-solid fa-hourglass-half"></i> Awaiting Admin Approval
                  </span>
                  <button className={styles.deleteBtn} onClick={() => onDelete(post.id)}>
                    <i className="fa-solid fa-trash"></i> Delete
                  </button>
                </div>
              )}

              {/* ── Rejected Post Actions ── */}
              {activeTab === 'posts' && post.status === 'rejected' && (
                <div className={styles.postActions}>
                  <span className={styles.rejectedInfo}>
                    <i className="fa-solid fa-xmark-circle"></i> Rejected by Admin
                    {post.rejectReason && <span className={styles.rejectReason}>: {post.rejectReason}</span>}
                  </span>
                  <button className={styles.deleteBtn} onClick={() => onDelete(post.id)}>
                    <i className="fa-solid fa-trash"></i> Delete
                  </button>
                </div>
              )}

              {/* ── Saved Posts Actions ── */}
              {activeTab === 'saved' && (
                <button
                  className={styles.unsaveBtn}
                  onClick={() => onUnsave(post.id)}
                >
                  <i className="fa-solid fa-bookmark"></i> Unsave
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PostGrid;