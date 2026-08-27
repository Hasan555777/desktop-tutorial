// src/pages/Admin/components/PendingEdits.jsx

import React, { useState, useCallback, useEffect } from 'react';
import { formatDate } from '../utils/adminUtils';
import EmptyState from './EmptyState';
import styles from './PendingEdits.module.css';

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

  const oldWords = oldText.split(' ');
  const newWords = newText.split(' ');
  
  let prefixEnd = 0;
  while (prefixEnd < Math.min(oldWords.length, newWords.length) && 
         oldWords[prefixEnd] === newWords[prefixEnd]) {
    prefixEnd++;
  }
  
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
// 🎯 Change Highlight Component
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
// 🎯 Description Diff Component
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
// 🎯 Edit Modal Component
// ============================================================
const EditPendingEditModal = ({ edit, onClose, onSave }) => {
  const pendingChanges = edit?.pendingChanges || {};
  
  const [formData, setFormData] = useState({
    title: pendingChanges?.title || edit?.title || '',
    description: pendingChanges?.description || edit?.description || '',
    budget: pendingChanges?.budget?.amount || pendingChanges?.budget || edit?.budget || '',
    deadline: pendingChanges?.deadline?.days || pendingChanges?.deadline || edit?.deadline || '',
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.title.trim()) {
      newErrors.title = 'টাইটেল প্রয়োজন';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'বিবরণ প্রয়োজন';
    }
    if (formData.budget && Number(formData.budget) < 0) {
      newErrors.budget = 'বাজেট ০ এর কম হতে পারে না';
    }
    if (formData.deadline && Number(formData.deadline) < 1) {
      newErrors.deadline = 'সময়সীমা কমপক্ষে ১ দিন হতে হবে';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    console.log('🔍 EditPendingEditModal - handleSubmit called');
    console.log('📊 Form data:', formData);
    console.log('📊 Edit data:', edit);
    
    if (!validateForm()) {
      console.warn('⚠️ Form validation failed');
      return;
    }

    setLoading(true);
    try {
      const updatedData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        budget: formData.budget ? {
          amount: Number(formData.budget),
          type: 'fixed',
          isNegotiable: edit?.budget?.isNegotiable || false
        } : edit?.budget,
        deadline: formData.deadline ? {
          days: Number(formData.deadline),
          type: 'fixed'
        } : edit?.deadline,
      };

      console.log('📤 Sending updated data:', updatedData);
      console.log('📤 Edit ID:', edit.id);
      
      if (typeof onSave !== 'function') {
        console.error('❌ onSave is not a function!', onSave);
        alert('এডিট ফাংশন সঠিক নয়!');
        return;
      }

      await onSave(edit.id, updatedData);
      console.log('✅ Edit saved successfully');
      onClose();
      
    } catch (error) {
      console.error('❌ Error saving edit:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack
      });
      alert('এডিট আপডেট করতে সমস্যা হয়েছে: ' + error.message);
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
            Edit Pending Edit
          </h3>
          <button className="modal-close-btn" onClick={onClose} disabled={loading}>
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
              className={`edit-input ${errors.title ? 'error' : ''}`}
              disabled={loading}
            />
            {errors.title && <span className="error-message">{errors.title}</span>}
          </div>
          <div className="edit-form-group">
            <label>Description <span className="required">*</span></label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="পোস্টের বিবরণ লিখুন..."
              rows="4"
              className={`edit-textarea ${errors.description ? 'error' : ''}`}
              disabled={loading}
            />
            {errors.description && <span className="error-message">{errors.description}</span>}
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
                className={`edit-input ${errors.budget ? 'error' : ''}`}
                disabled={loading}
                min="0"
              />
              {errors.budget && <span className="error-message">{errors.budget}</span>}
            </div>
            <div className="edit-form-group">
              <label>Deadline (Days)</label>
              <input
                type="number"
                name="deadline"
                value={formData.deadline}
                onChange={handleChange}
                placeholder="সময়সীমা লিখুন..."
                className={`edit-input ${errors.deadline ? 'error' : ''}`}
                disabled={loading}
                min="1"
              />
              {errors.deadline && <span className="error-message">{errors.deadline}</span>}
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
const PendingEdits = ({ 
  edits = [], 
  onApprove, 
  onReject, 
  onRefresh,
  onEdit,
  formatDateFn = formatDate
}) => {
  const [zoomedImage, setZoomedImage] = useState(null);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedEditId, setSelectedEditId] = useState(null);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEdit, setEditingEdit] = useState(null);

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

  const handleRejectClick = (editId) => {
    setSelectedEditId(editId);
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

  const handleEditClick = (edit) => {
    console.log('🔍 Edit button clicked for edit:', edit.id);
    setEditingEdit(edit);
    setShowEditModal(true);
  };

  const handleEditSave = async (editId, updatedData) => {
    console.log('🔍 handleEditSave called with:', { editId, updatedData });
    
    try {
      if (!onEdit) {
        console.error('❌ onEdit callback is not provided!');
        alert('এডিট ফাংশন পাওয়া যায়নি!');
        return;
      }

      if (typeof onEdit !== 'function') {
        console.error('❌ onEdit is not a function!', onEdit);
        alert('এডিট ফাংশন সঠিক নয়!');
        return;
      }

      console.log('📤 Calling onEdit with:', { editId, updatedData });
      await onEdit(editId, updatedData);
      console.log('✅ Edit saved successfully');
      
      setShowEditModal(false);
      setEditingEdit(null);
      
    } catch (error) {
      console.error('❌ Error in handleEditSave:', error);
      alert('এডিট আপডেট করতে সমস্যা হয়েছে: ' + error.message);
    }
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
      <div className={`${styles.dataTable} ${styles.pendingEditsTable}`}>
        <div className={styles.tableHeader}>
          <h3>
            <i className="fa-solid fa-pen-to-square"></i> 
            Pending Post Edits
            <span className={styles.tableCount}>
              {edits.length} টি পেন্ডিং
            </span>
          </h3>
          <button className={styles.refreshBtn} onClick={onRefresh}>
            <i className="fa-solid fa-sync"></i> রিফ্রেশ
          </button>
        </div>

        <div className={styles.pendingEditsGrid}>
          {edits.map((post) => {
            const currentImages = post.images || [];
            const pendingImages = post.pendingChanges?.images || [];
            
            return (
              <div key={post.id} className={styles.pendingEditCard}>
                {/* ── Card Header ── */}
                <div className={styles.editHeader}>
                  <div className={styles.editTitleSection}>
                    <h4 className={styles.editTitle}>{post.title}</h4>
                    <span className={`${styles.statusBadge} ${styles.pending}`}>⏳ Pending Edit</span>
                  </div>
                  <div className={styles.editMetaTop}>
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
                  <div className={styles.editImagesSection}>
                    <div className={styles.editImagesLabel}>
                      <i className="fa-regular fa-image"></i> Images
                    </div>
                    <div className={styles.editImagesCompare}>
                      {currentImages.length > 0 && (
                        <div className={`${styles.imageGroup} ${styles.currentImages}`}>
                          <span className={styles.imageGroupLabel}>Current</span>
                          <div className={styles.imageGroupThumbs}>
                            {currentImages.slice(0, 3).map((img, idx) => (
                              <div 
                                key={idx} 
                                className={styles.imageThumbWrapper}
                                onClick={() => handleImageClick(img)}
                              >
                                <img src={img} alt={`Current ${idx}`} className={styles.editThumb} />
                                <div className={styles.thumbZoomIcon}>
                                  <i className="fa-solid fa-magnifying-glass-plus"></i>
                                </div>
                              </div>
                            ))}
                            {currentImages.length > 3 && (
                              <span className={styles.imageCountMore}>+{currentImages.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {currentImages.length > 0 && pendingImages.length > 0 && (
                        <div className={styles.imageArrow}>→</div>
                      )}

                      {pendingImages.length > 0 && (
                        <div className={`${styles.imageGroup} ${styles.pendingImages}`}>
                          <span className={`${styles.imageGroupLabel} ${styles.pendingLabel}`}>New</span>
                          <div className={styles.imageGroupThumbs}>
                            {pendingImages.slice(0, 3).map((img, idx) => (
                              <div 
                                key={idx} 
                                className={`${styles.imageThumbWrapper} ${styles.pendingThumb}`}
                                onClick={() => handleImageClick(img)}
                              >
                                <img src={img} alt={`Pending ${idx}`} className={styles.editThumb} />
                                <div className={styles.thumbZoomIcon}>
                                  <i className="fa-solid fa-magnifying-glass-plus"></i>
                                </div>
                                <span className={styles.newBadge}>NEW</span>
                              </div>
                            ))}
                            {pendingImages.length > 3 && (
                              <span className={styles.imageCountMore}>+{pendingImages.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Changes Comparison ── */}
                <div className={styles.versionCompare}>
                  <div className={styles.compareHeader}>
                    <span className={`${styles.compareLabel} ${styles.currentLabel}`}>📌 Current</span>
                    <span className={`${styles.compareLabel} ${styles.pendingLabel}`}>✏️ Pending</span>
                  </div>
                  
                  <div className={styles.compareBody}>
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

                {/* ── Full Description ── */}
                {post.pendingChanges?.description && 
                 post.pendingChanges.description !== post.description && (
                  <DescriptionDiff 
                    current={post.description || ''}
                    pending={post.pendingChanges.description}
                  />
                )}

                {/* ── Edit Meta ── */}
                <div className={styles.editMetaBottom}>
                  <span>
                    <i className="fa-regular fa-calendar"></i> 
                    Submitted: {formatDateFn(post.editSubmittedAt)}
                  </span>
                  <span>
                    <i className="fa-regular fa-user"></i> 
                    By: {post.clientName || post.userName || 'Unknown'}
                  </span>
                  {post.pendingChanges?.images && post.pendingChanges.images.length > 0 && (
                    <span className={styles.imageChangeBadge}>
                      <i className="fa-regular fa-image"></i> {post.pendingChanges.images.length} new image(s)
                    </span>
                  )}
                </div>
                
                {/* ── Actions ── */}
                <div className={styles.editActions}>
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
                  >
                    <i className="fa-solid fa-check"></i> Approve Edit
                  </button>
                  <button 
                    className={`${styles.actionBtn} ${styles.reject}`}
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
        <div className={styles.rejectModalOverlay} onClick={handleRejectCancel}>
          <div className={styles.rejectModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.rejectModalHeader}>
              <h3>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444' }}></i>
                Reject Edit
              </h3>
              <button className={styles.modalCloseBtn} onClick={handleRejectCancel}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className={styles.rejectModalBody}>
              <p>দয়া করে এই এডিট রিজেক্ট করার কারণ লিখুন:</p>
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

      {/* ✅ Edit Modal */}
      {showEditModal && editingEdit && (
        <EditPendingEditModal
          edit={editingEdit}
          onClose={() => {
            setShowEditModal(false);
            setEditingEdit(null);
          }}
          onSave={handleEditSave}
        />
      )}
    </>
  );
};

export default PendingEdits;