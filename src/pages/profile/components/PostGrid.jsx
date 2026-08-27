// src/components/profile/PostGrid.jsx
import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import toast from 'react-hot-toast';
import { formatBudget, formatDeadline, getImageCacheKey } from '../utils/profileHelpers';

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
  onToggleLock, // ✅ এই প্রপস ব্যবহার করুন
}) => {
  const [togglingPostId, setTogglingPostId] = useState(null);

  // ── Busy/Deal Active টগল ফাংশন ──
  const togglePostStatus = async (postId, currentStatus) => {
    if (!user || !onToggleLock) {
      console.warn('Toggle lock not available');
      return;
    }

    setTogglingPostId(postId);
    try {
      // ✅ onToggleLock কল করুন (Parent component এ handleToggleLock কল হবে)
      await onToggleLock(postId, !currentStatus);
      
    } catch (error) {
      console.error('Error toggling post status:', error);
      toast.error('Failed to update post status');
    } finally {
      setTogglingPostId(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'var(--text-secondary, #94a3b8)'
      }}>
        <i className="fa-solid fa-spinner fa-spin" style={{
          fontSize: '32px',
          color: 'var(--accent-primary, #14b8a6)',
          marginBottom: '12px'
        }} />
        <p>Loading posts...</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="no-posts">
        <i className="fa-solid fa-folder-open"></i>
        <p>{emptyMessage}</p>
        {activeTab === 'posts' && (
          <button className="create-post-btn" onClick={onCreateClick}>
            <i className="fa-solid fa-plus"></i> Create {currentMode === 'buyer' ? 'Job' : 'Service'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="posts-grid">
      {posts.map((post, index) => {
        const dealInfo = activeDealPosts[post.id];
        const hasActiveDeal = !!dealInfo?.hasActiveDeal;
        
        // ── স্ট্যাটাস চেক ──
        const isBusy = post.postStatus?.isBusy || false;
        const isDealActive = post.postStatus?.isDealActive || false;
        const isStatusActive = currentMode === 'seller' ? isBusy : isDealActive;

        // ── statusText ডিফাইন করুন ──
        const statusText = currentMode === 'seller'
          ? (isBusy ? '🔒 Currently Busy' : '🟢 Available')
          : (isDealActive ? '🔒 Deal Active' : '🟢 Open for Proposals');

        // ── টগল বাটন লেবেল ──
        const toggleLabel = currentMode === 'seller' 
          ? (isBusy ? 'Unbusy' : '🔒 Busy')
          : (isDealActive ? 'Unbusy' : 'Busy');

        const toggleIcon = currentMode === 'seller'
          ? (isBusy ? 'fa-unlock' : 'fa-lock')
          : (isDealActive ? 'fa-door-open' : 'fa-handshake');

        return (
          <div key={`${post.id}-${index}`} className={`post-card ${isStatusActive ? 'status-active' : ''}`}>
            {/* ── স্ট্যাটাস ব্যাজ ── */}
            {post.status === 'pending' && (
              <div className="post-status-badge pending">
                <i className="fa-solid fa-clock"></i> Pending Approval
              </div>
            )}
            {post.status === 'rejected' && (
              <div className="post-status-badge rejected">
                <i className="fa-solid fa-xmark-circle"></i> Rejected
              </div>
            )}
            {post.status === 'approved' && (
              <div className="post-status-badge approved">
                <i className="fa-solid fa-check-circle"></i> Published
              </div>
            )}

            {/* ── Active Deal Indicator ── */}
            {hasActiveDeal && (
              <div className="active-deal-badge">
                <i className="fa-solid fa-handshake"></i>
                Active Deal ({dealInfo?.dealCount || 1})
              </div>
            )}

            {/* ── 🔥 Post Status Indicator ── */}
            

            {/* ── Images ── */}
            {post.images && post.images.length > 0 && (
              <div className={`post-images-container ${post.images.length > 1 ? 'two-images' : 'one-image'}`}>
                {post.images.slice(0, 2).map((img, imgIndex) => (
                  <img
                    key={imgIndex}
                    src={`${img.split('?')[0]}?v=${getImageCacheKey(post)}`}
                    alt={post.title}
                    className="post-image"
                    loading="lazy"
                  />
                ))}
                {post.images.length > 2 && (
                  <div className="post-image-badge">+{post.images.length - 2}</div>
                )}
              </div>
            )}

            {/* ── Content ── */}
            <div className="post-content">
              <h4>{post.title}</h4>
              <p className="post-description">{post.description?.substring(0, 100)}...</p>
              <div className="post-meta">
                <span><i className="fa-solid fa-wallet"></i> {formatBudget(post)} BDT</span>
                <span><i className="fa-regular fa-clock"></i> {formatDeadline(post)} Days</span>
                <span><i className="fa-solid fa-tag"></i> {post.type === 'hire' ? 'Job' : 'Service'}</span>
              </div>

              {/* ── ✅ Status Toggle Button (শুধু Approved পোস্টের জন্য) ── */}
              {activeTab === 'posts' && post.status === 'approved' && (
                <div className="post-actions">
                  {/* 🔥 Busy/Deal Active টগল */}
                  <button
                    className={`status-toggle-btn ${isStatusActive ? 'active' : ''}`}
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
                    <span className="edit-pending-info">
                      <i className="fa-solid fa-hourglass-half"></i> Edit Pending
                    </span>
                  ) : (
                    <button
                      className={`edit-post-btn ${hasActiveDeal || isStatusActive ? 'disabled' : ''}`}
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
                    className={`delete-btn ${hasActiveDeal || isStatusActive ? 'disabled' : ''}`}
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
                <div className="post-actions">
                  <span className="pending-info">
                    <i className="fa-solid fa-hourglass-half"></i> Awaiting Admin Approval
                  </span>
                  <button className="delete-btn" onClick={() => onDelete(post.id)}>
                    <i className="fa-solid fa-trash"></i> Delete
                  </button>
                </div>
              )}

              {/* ── Rejected Post Actions ── */}
              {activeTab === 'posts' && post.status === 'rejected' && (
                <div className="post-actions">
                  <span className="rejected-info">
                    <i className="fa-solid fa-xmark-circle"></i> Rejected by Admin
                    {post.rejectReason && <span className="reject-reason">: {post.rejectReason}</span>}
                  </span>
                  <button className="delete-btn" onClick={() => onDelete(post.id)}>
                    <i className="fa-solid fa-trash"></i> Delete
                  </button>
                </div>
              )}

              {/* ── Saved Posts Actions ── */}
              {activeTab === 'saved' && (
                <button
                  className="unsave-btn"
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