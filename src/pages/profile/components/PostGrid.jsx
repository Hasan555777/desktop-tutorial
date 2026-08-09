// src/components/profile/PostGrid.jsx
import React from 'react';
import { formatBudget, formatDeadline, getImageCacheKey } from '../utils/profileHelpers';

const PostGrid = ({
  posts,
  isLoading,
  emptyMessage,
  activeTab,       // 'posts' | 'saved'
  currentMode,
  activeDealPosts,
  onEdit,
  onDelete,
  onUnsave,
  onCreateClick,
}) => {
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

        return (
          <div key={`${post.id}-${index}`} className="post-card">
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

            {/* ── Images ── */}
            {post.images && post.images.length > 0 && (
              <div className={`post-images-container ${post.images.length > 1 ? 'two-images' : 'one-image'}`}>
                {post.images.slice(0, 2).map((img, imgIndex) => (
                  <img
                    key={imgIndex}
                    src={`${img.split('?')[0]}?v=${getImageCacheKey(post)}`}
                    alt={post.title}
                    className="post-image"
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

              {/* ── Approved Post Actions ── */}
              {activeTab === 'posts' && post.status === 'approved' && (
                <div className="post-actions">
                  {post.editStatus === 'pending' ? (
                    <span className="edit-pending-info">
                      <i className="fa-solid fa-hourglass-half"></i> Edit Pending Approval
                    </span>
                  ) : (
                    <button
                      className={`edit-post-btn ${hasActiveDeal ? 'disabled' : ''}`}
                      onClick={() => onEdit(post)}
                      disabled={hasActiveDeal}
                      title={hasActiveDeal ? 'Active Deal থাকার কারণে এডিট করা যাবে না' : 'Edit Post'}
                    >
                      <i className="fa-solid fa-pen"></i>
                      {hasActiveDeal ? '🔒 Active Deal' : 'Edit'}
                    </button>
                  )}
                  <button
                    className={`delete-btn ${hasActiveDeal ? 'disabled' : ''}`}
                    onClick={() => onDelete(post.id)}
                    disabled={hasActiveDeal}
                    title={hasActiveDeal ? 'Active Deal থাকার কারণে ডিলিট করা যাবে না' : 'Delete Post'}
                  >
                    <i className="fa-solid fa-trash"></i>
                    {hasActiveDeal ? '🔒 Active Deal' : 'Delete'}
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