// src/pages/Admin/components/PendingEdits.jsx

import React, { useState, useCallback, useEffect } from 'react';
import { formatDate } from '../utils/adminUtils';
import EmptyState from './EmptyState';
import './PendingEdits.css';

// ============================================================
// 🎯 Image Zoom Modal
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
const formatBudget = (budget) => {
  if (!budget) return 'N/A';
  if (typeof budget === 'object') {
    if (budget.type === 'range' || (budget.min !== undefined && budget.max !== undefined)) {
      const min = Number(budget.min || 0);
      const max = Number(budget.max || 0);
      return `৳${min.toLocaleString('en-IN')} - ৳${max.toLocaleString('en-IN')}`;
    }
    const amount = Number(budget.amount || budget.max || 0);
    return `৳${amount.toLocaleString('en-IN')}`;
  }
  return `৳${Number(budget).toLocaleString('en-IN')}`;
};

const formatDeadline = (deadline) => {
  if (!deadline) return 'N/A';
  if (typeof deadline === 'object') {
    if (deadline.type === 'range' || (deadline.min !== undefined && deadline.max !== undefined)) {
      return `${deadline.min} - ${deadline.max} days`;
    }
    const days = deadline.days || deadline.max || 0;
    return `${days} days`;
  }
  return `${deadline} days`;
};

// ============================================================
// 🎯 Text Diff Helper - Shows added/removed parts
// ============================================================
const getTextDiff = (oldText, newText) => {
  if (!oldText && !newText) return null;
  if (!oldText) return { type: 'added', text: newText };
  if (!newText) return { type: 'removed', text: oldText };
  if (oldText === newText) return { type: 'same', text: oldText };

  // Simple diff - find common parts
  const oldWords = oldText.split(' ');
  const newWords = newText.split(' ');
  
  // Find longest common prefix
  let prefixEnd = 0;
  while (prefixEnd < Math.min(oldWords.length, newWords.length) && 
         oldWords[prefixEnd] === newWords[prefixEnd]) {
    prefixEnd++;
  }
  
  // Find longest common suffix
  let suffixStartOld = oldWords.length - 1;
  let suffixStartNew = newWords.length - 1;
  while (suffixStartOld >= prefixEnd && suffixStartNew >= prefixEnd &&
         oldWords[suffixStartOld] === newWords[suffixStartNew]) {
    suffixStartOld--;
    suffixStartNew--;
  }
  
  const prefix = oldWords.slice(0, prefixEnd).join(' ');
  const oldMiddle = oldWords.slice(prefixEnd, suffixStartOld + 1).join(' ');
  const newMiddle = newWords.slice(prefixEnd, suffixStartNew + 1).join(' ');
  const suffix = oldWords.slice(suffixStartOld + 1).join(' ');
  
  return {
    type: 'changed',
    prefix,
    oldMiddle,
    newMiddle,
    suffix,
    fullOld: oldText,
    fullNew: newText
  };
};

// ============================================================
// 🎯 Change Highlight Component with Word-Level Diff
// ============================================================
const ChangeHighlight = ({ label, current, pending }) => {
  const isChanged = current !== pending && pending !== undefined && pending !== null;
  const diff = getTextDiff(current, pending);
  
  return (
    <div className="change-row">
      <span className="change-label">{label}</span>
      <div className="change-values">
        <span className="current-value">{current || 'N/A'}</span>
        <span className="change-arrow">→</span>
        <span className={`pending-value ${isChanged ? 'changed' : 'same'}`}>
          {!isChanged ? (
            pending || 'N/A'
          ) : (
            <span className="diff-content">
              {diff?.type === 'added' && (
                <span className="diff-added">{diff.text}</span>
              )}
              {diff?.type === 'removed' && (
                <span className="diff-removed">{diff.text}</span>
              )}
              {diff?.type === 'changed' && (
                <>
                  {diff.prefix && <span className="diff-same">{diff.prefix} </span>}
                  <span className="diff-removed">{diff.oldMiddle}</span>
                  <span className="diff-added">{diff.newMiddle}</span>
                  {diff.suffix && <span className="diff-same"> {diff.suffix}</span>}
                </>
              )}
              {isChanged && <span className="change-indicator">✦</span>}
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

// ============================================================
// 🎯 Description Diff Component (Full View)
// ============================================================
const DescriptionDiff = ({ current, pending }) => {
  if (!pending || pending === current) return null;
  
  const diff = getTextDiff(current, pending);
  
  return (
    <div className="full-description-section">
      <details>
        <summary>
          <i className="fa-regular fa-file-lines"></i> 
          View Full Description Changes
          <span className="diff-summary-badge">
            <span className="diff-added-badge">+{pending?.length - (current?.length || 0)} chars</span>
          </span>
        </summary>
        <div className="description-diff">
          <div className="diff-current">
            <strong>📌 Current:</strong>
            <p>{current || 'N/A'}</p>
          </div>
          <div className="diff-pending">
            <strong>✏️ Pending:</strong>
            <p className="diff-pending-text">
              {diff?.type === 'added' && (
                <span className="diff-added">{diff.text}</span>
              )}
              {diff?.type === 'removed' && (
                <span className="diff-removed">{diff.text}</span>
              )}
              {diff?.type === 'changed' && (
                <>
                  {diff.prefix && <span className="diff-same">{diff.prefix} </span>}
                  <span className="diff-removed">{diff.oldMiddle}</span>
                  <span className="diff-added">{diff.newMiddle}</span>
                  {diff.suffix && <span className="diff-same"> {diff.suffix}</span>}
                </>
              )}
              {diff?.type === 'same' && diff?.text}
            </p>
          </div>
        </div>
      </details>
    </div>
  );
};

// ============================================================
// 🎯 MAIN COMPONENT
// ============================================================

const PendingEdits = ({ 
  edits = [], 
  onApprove, 
  onReject, 
  onRefresh,
  formatDateFn = formatDate
}) => {
  const [zoomedImage, setZoomedImage] = useState(null);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedEditId, setSelectedEditId] = useState(null);

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

  const handleRejectClick = (postId) => {
    setSelectedEditId(postId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleRejectConfirm = () => {
    if (selectedEditId && rejectReason.trim()) {
      onReject(selectedEditId, rejectReason.trim());
      setShowRejectModal(false);
      setSelectedEditId(null);
      setRejectReason('');
    } else {
      alert('দয়া করে রিজেক্ট করার কারণ লিখুন!');
    }
  };

  const handleRejectCancel = () => {
    setShowRejectModal(false);
    setSelectedEditId(null);
    setRejectReason('');
  };

  if (edits.length === 0) {
    return (
      <div className="data-table pending-edits-table">
        <div className="table-header">
          <h3>
            <i className="fa-solid fa-pen-to-square"></i> 
            Pending Post Edits
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
          title="কোন পেন্ডিং এডিট নেই"
          subtitle="সব এডিট অ্যাপ্রুভ করা হয়েছে! 🎉"
        />
      </div>
    );
  }

  return (
    <>
      <div className="data-table pending-edits-table">
       <div className="table-header">
  <h3>
    <i className="fa-solid fa-pen-to-square"></i> 
    Pending Post Edits
    <span className="table-count">
      {edits.length} টি {edits.length > 0 && 'পেন্ডিং'}
    </span>
  </h3>
</div>

        <div className="pending-edits-grid">
          {edits.map((post) => {
            const currentImages = post.images || [];
            const pendingImages = post.pendingChanges?.images || [];
            
            return (
              <div key={post.id} className="pending-edit-card">
                {/* ── Card Header ── */}
                <div className="edit-header">
                  <div className="edit-title-section">
                    <h4 className="edit-title">{post.title}</h4>
                    <span className="status-badge pending">⏳ Pending Edit</span>
                  </div>
                  <div className="edit-meta-top">
                    <span>
                      <i className="fa-regular fa-clock"></i> 
                      {formatDateFn(post.editSubmittedAt)}
                    </span>
                    <span>
                      <i className="fa-regular fa-user"></i> 
                      {post.clientName || post.userName || 'Unknown'}
                    </span>
                  </div>
                </div>

                {/* ── Images Section ── */}
                {(currentImages.length > 0 || pendingImages.length > 0) && (
                  <div className="edit-images-section">
                    <div className="edit-images-label">
                      <i className="fa-regular fa-image"></i> Images
                    </div>
                    <div className="edit-images-compare">
                      {currentImages.length > 0 && (
                        <div className="image-group current-images">
                          <span className="image-group-label">Current</span>
                          <div className="image-group-thumbs">
                            {currentImages.slice(0, 3).map((img, idx) => (
                              <div 
                                key={idx} 
                                className="image-thumb-wrapper"
                                onClick={() => handleImageClick(img)}
                              >
                                <img src={img} alt={`Current ${idx}`} className="edit-thumb" />
                                <div className="thumb-zoom-icon">
                                  <i className="fa-solid fa-magnifying-glass-plus"></i>
                                </div>
                              </div>
                            ))}
                            {currentImages.length > 3 && (
                              <span className="image-count-more">+{currentImages.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {currentImages.length > 0 && pendingImages.length > 0 && (
                        <div className="image-arrow">→</div>
                      )}

                      {pendingImages.length > 0 && (
                        <div className="image-group pending-images">
                          <span className="image-group-label pending-label">New</span>
                          <div className="image-group-thumbs">
                            {pendingImages.slice(0, 3).map((img, idx) => (
                              <div 
                                key={idx} 
                                className="image-thumb-wrapper pending-thumb"
                                onClick={() => handleImageClick(img)}
                              >
                                <img src={img} alt={`Pending ${idx}`} className="edit-thumb" />
                                <div className="thumb-zoom-icon">
                                  <i className="fa-solid fa-magnifying-glass-plus"></i>
                                </div>
                                <span className="new-badge">NEW</span>
                              </div>
                            ))}
                            {pendingImages.length > 3 && (
                              <span className="image-count-more">+{pendingImages.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Changes Comparison with Word-Level Diff ── */}
                <div className="version-compare">
                  <div className="compare-header">
                    <span className="compare-label current-label">📌 Current</span>
                    <span className="compare-label pending-label">✏️ Pending</span>
                  </div>
                  
                  <div className="compare-body">
                    <ChangeHighlight 
                      label="Title"
                      current={post.title}
                      pending={post.pendingChanges?.title}
                    />
                    <ChangeHighlight 
                      label="Description"
                      current={post.description?.substring(0, 150) + (post.description?.length > 150 ? '...' : '')}
                      pending={post.pendingChanges?.description?.substring(0, 150) + (post.pendingChanges?.description?.length > 150 ? '...' : '')}
                    />
                    <ChangeHighlight 
                      label="Budget"
                      current={formatBudget(post.budget)}
                      pending={formatBudget(post.pendingChanges?.budget)}
                    />
                    <ChangeHighlight 
                      label="Deadline"
                      current={formatDeadline(post.deadline)}
                      pending={formatDeadline(post.pendingChanges?.deadline)}
                    />
                  </div>
                </div>

                {/* ── Full Description with Word-Level Diff ── */}
                {post.pendingChanges?.description && 
                 post.pendingChanges.description !== post.description && (
                  <DescriptionDiff 
                    current={post.description || ''}
                    pending={post.pendingChanges.description}
                  />
                )}

                {/* ── Edit Meta ── */}
                <div className="edit-meta-bottom">
                  <span>
                    <i className="fa-regular fa-calendar"></i> 
                    Submitted: {formatDateFn(post.editSubmittedAt)}
                  </span>
                  <span>
                    <i className="fa-regular fa-user"></i> 
                    By: {post.clientName || post.userName || 'Unknown'}
                  </span>
                  {post.pendingChanges?.images && post.pendingChanges.images.length > 0 && (
                    <span className="image-change-badge">
                      <i className="fa-regular fa-image"></i> {post.pendingChanges.images.length} new image(s)
                    </span>
                  )}
                </div>
                
                {/* ── Actions ── */}
                <div className="edit-actions">
                  <button 
                    className="action-btn approve"
                    onClick={() => onApprove(post.id)}
                  >
                    <i className="fa-solid fa-check"></i> Approve Edit
                  </button>
                  <button 
                    className="action-btn reject"
                    onClick={() => handleRejectClick(post.id)}
                  >
                    <i className="fa-solid fa-xmark"></i> Reject Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Image Zoom Modal */}
      {isZoomModalOpen && zoomedImage && (
        <ImageZoomModal 
          imageUrl={zoomedImage} 
          onClose={handleCloseZoom} 
        />
      )}

      {/* Reject Reason Modal */}
      {showRejectModal && (
        <div className="reject-modal-overlay" onClick={handleRejectCancel}>
          <div className="reject-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reject-modal-header">
              <h3>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444' }}></i>
                Reject Edit
              </h3>
              <button className="modal-close-btn" onClick={handleRejectCancel}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="reject-modal-body">
              <p>দয়া করে এই এডিট রিজেক্ট করার কারণ লিখুন:</p>
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

export default PendingEdits;