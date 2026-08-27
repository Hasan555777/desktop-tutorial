// src/components/profile/EditPostModal.jsx
//
// ✅ UPDATED: Automatic image compression on upload
// ✅ UPDATED: No text shown for posts without images (entire section hidden)
// ✅ Fixed all image handling bugs
// ✅ Memory leak fixed (revokes blob URLs)
// ✅ Single source of truth for images

import React, { useState, useEffect, useRef } from 'react';
import {
  budgetToFormState,
  formStateToBudget,
  deadlineToFormState,
  formStateToDeadline,
  uploadToCloudinary,
} from '../utils/profileHelpers';

const MAX_IMAGES = 2;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const TARGET_QUALITY = 0.85; // 85% quality after compression
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;

// ============================================================
// ✅ Image Compression Function
// ============================================================
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    // If file is already small enough, return as-is
    if (file.size <= MAX_FILE_SIZE && file.type !== 'image/gif') {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions (maintain aspect ratio)
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Determine output format
        let mimeType = file.type;
        let quality = TARGET_QUALITY;
        
        // If it's a PNG, keep PNG but compress
        if (file.type === 'image/png') {
          mimeType = 'image/png';
          quality = 0.9;
        }
        // If it's a GIF, keep as GIF (don't compress)
        else if (file.type === 'image/gif') {
          resolve(file);
          return;
        }
        // For others, use JPEG with quality
        else if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          mimeType = 'image/jpeg';
          quality = TARGET_QUALITY;
        }
        // For webp, keep webp
        else if (file.type === 'image/webp') {
          mimeType = 'image/webp';
          quality = TARGET_QUALITY;
        }
        // Default to JPEG
        else {
          mimeType = 'image/jpeg';
          quality = TARGET_QUALITY;
        }
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            
            // If compressed file is larger than original, use original
            if (blob.size > file.size && file.size < MAX_FILE_SIZE) {
              resolve(file);
              return;
            }
            
            const compressedFile = new File(
              [blob], 
              file.name.replace(/\.[^.]+$/, '') + '.jpg',
              { type: mimeType }
            );
            
            resolve(compressedFile);
          },
          mimeType,
          quality
        );
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image for compression'));
      };
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
  });
};

// ============================================================
// ✅ Build initial images
// ============================================================
const buildInitialImages = (post) =>
  (post?.images || [])
    .filter(img => typeof img === 'string' && img.startsWith('http'))
    .map(url => ({ id: url, kind: 'existing', url }));

// ============================================================
// ✅ Main Component
// ============================================================
const EditPostModal = ({ post, onClose, onSave, feedback }) => {
  const [title, setTitle] = useState(post?.title || '');
  const [description, setDescription] = useState(post?.description || '');

  const [budgetState, setBudgetState] = useState(() =>
    budgetToFormState(post?.budget ?? post?.price)
  );
  const [deadlineState, setDeadlineState] = useState(() =>
    deadlineToFormState(post?.deadline ?? post?.deliveryDays)
  );

  const [images, setImages] = useState(() => buildInitialImages(post));
  const [hasOriginalImages, setHasOriginalImages] = useState(
    () => buildInitialImages(post).length > 0
  );

  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef(null);

  // Re-sync on post change
  useEffect(() => {
    setTitle(post?.title || '');
    setDescription(post?.description || '');
    setBudgetState(budgetToFormState(post?.budget ?? post?.price));
    setDeadlineState(deadlineToFormState(post?.deadline ?? post?.deliveryDays));

    setImages(prev => {
      prev.forEach(img => {
        if (img.kind === 'new' && img.url) URL.revokeObjectURL(img.url);
      });
      return buildInitialImages(post);
    });
    setHasOriginalImages(buildInitialImages(post).length > 0);
  }, [post]);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach(img => {
        if (img.kind === 'new' && img.url) URL.revokeObjectURL(img.url);
      });
    };
  }, [images]);

  if (!post) return null;

  const totalImageCount = images.length;
  const canAddMoreImages = hasOriginalImages && totalImageCount < MAX_IMAGES;

  // ============================================================
  // ✅ Image handlers with compression
  // ============================================================
  const handleImageChange = async (e) => {
    if (!hasOriginalImages) {
      feedback?.alert?.warning?.({
        message: 'এই পোস্টে আগে কোনো ছবি ছিল না, তাই ছবির Edit করা যাবে না।'
      });
      e.target.value = '';
      return;
    }

    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = MAX_IMAGES - totalImageCount;

    if (files.length > remainingSlots) {
      feedback?.alert?.warning?.({
        message: `You can only add ${remainingSlots} more image(s). Maximum ${MAX_IMAGES} images allowed!`
      });
      e.target.value = '';
      return;
    }

    // Check file types
    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      feedback?.alert?.warning?.({
        message: 'Please select only image files (jpg, png, gif, webp).'
      });
      e.target.value = '';
      return;
    }

    setCompressing(true);

    try {
      const compressedItems = [];

      for (const file of files) {
        // Compress image
        const compressedFile = await compressImage(file);
        
        compressedItems.push({
          id: `new-${Date.now()}-${compressedItems.length}-${file.name}`,
          kind: 'new',
          file: compressedFile,
          url: URL.createObjectURL(compressedFile),
          originalSize: file.size,
          compressedSize: compressedFile.size,
        });
      }

      setImages(prev => [...prev, ...compressedItems]);
      
      const totalSaved = compressedItems.reduce(
        (sum, item) => sum + (item.originalSize - item.compressedSize), 
        0
      );
      
      if (totalSaved > 0 && feedback) {
        const savedKB = Math.round(totalSaved / 1024);
        feedback.toast?.({
          variant: 'info',
          title: '📸 Image Compressed',
          message: `Saved ${savedKB}KB by optimizing image size.`,
          duration: 3000,
        });
      }

    } catch (error) {
      console.error('Compression error:', error);
      feedback?.alert?.warning?.({
        message: 'Could not compress image. Using original file.'
      });
      
      // Fallback: add without compression
      const newItems = files.map((file, i) => ({
        id: `new-${Date.now()}-${i}-${file.name}`,
        kind: 'new',
        file,
        url: URL.createObjectURL(file),
      }));
      setImages(prev => [...prev, ...newItems]);
      
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  };

  const removeImage = (id) => {
    setImages(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.kind === 'new' && item.url) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter(i => i.id !== id);
    });
  };

  // ============================================================
  // ✅ Validation
  // ============================================================
  const validate = () => {
    if (!title.trim()) {
      feedback?.alert?.warning?.({ message: 'Post title is required!' });
      return false;
    }
    if (!description.trim()) {
      feedback?.alert?.warning?.({ message: 'Description is required!' });
      return false;
    }

    if (budgetState.mode === 'fixed') {
      if (!budgetState.amount || Number(budgetState.amount) <= 0) {
        feedback?.alert?.warning?.({ message: 'দয়া করে একটি সঠিক বাজেট দিন!' });
        return false;
      }
    } else {
      const min = Number(budgetState.min);
      const max = Number(budgetState.max);
      if (!min || !max || min <= 0 || max <= 0) {
        feedback?.alert?.warning?.({ message: 'দয়া করে সঠিক বাজেট রেঞ্জ দিন!' });
        return false;
      }
      if (min > max) {
        feedback?.alert?.warning?.({ message: 'সর্বনিম্ন বাজেট সর্বোচ্চ বাজেটের চেয়ে বেশি হতে পারে না!' });
        return false;
      }
    }

    if (deadlineState.mode === 'fixed') {
      if (!deadlineState.days || Number(deadlineState.days) <= 0) {
        feedback?.alert?.warning?.({ message: 'দয়া করে একটি সঠিক ডেডলাইন দিন!' });
        return false;
      }
    } else {
      const min = Number(deadlineState.min);
      const max = Number(deadlineState.max);
      if (!min || !max || min <= 0 || max <= 0) {
        feedback?.alert?.warning?.({ message: 'দয়া করে সঠিক ডেডলাইন রেঞ্জ দিন!' });
        return false;
      }
      if (min > max) {
        feedback?.alert?.warning?.({ message: 'সর্বনিম্ন দিন সর্বোচ্চ দিনের চেয়ে বেশি হতে পারে না!' });
        return false;
      }
    }

    if (hasOriginalImages && totalImageCount === 0) {
      feedback?.alert?.warning?.({ message: 'Please keep at least one image for your post.' });
      return false;
    }

    return true;
  };

  // ============================================================
  // ✅ Save
  // ============================================================
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setUploadProgress(0);

    try {
      const newImages = images.filter(img => img.kind === 'new');
      const existingUrls = images.filter(i => i.kind === 'existing').map(i => i.url);

      let uploadedUrls = [];

      if (newImages.length > 0) {
        let completed = 0;
        const total = newImages.length;

        for (const img of newImages) {
          try {
            const url = await uploadToCloudinary(img.file);
            if (url) uploadedUrls.push(url);
          } catch (uploadError) {
            console.error('Error uploading image:', uploadError);
            feedback?.alert?.error?.({
              message: `Failed to upload image: ${uploadError.message}`
            });
          }
          completed++;
          setUploadProgress(Math.round((completed / total) * 100));
        }
      }

      const finalImages = [...existingUrls, ...uploadedUrls];

      if (hasOriginalImages && finalImages.length === 0) {
        feedback?.alert?.error?.({
          message: 'Failed to upload images. Please try again.'
        });
        setSaving(false);
        return;
      }

      const budget = formStateToBudget(budgetState);
      const deadline = formStateToDeadline(deadlineState);

      await onSave({
        title: title.trim(),
        description: description.trim(),
        images: finalImages,
        budget,
        deadline,
      });

    } catch (error) {
      console.error('EditPostModal save error:', error);
      feedback?.alert?.error?.({ message: 'Failed to save changes: ' + error.message });
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  // ============================================================
  // ✅ Render - HIDE ENTIRE IMAGE SECTION if no original images
  // ============================================================
  const renderImageSection = () => {
    // ✅ যদি পোস্টে আগে কোনো ছবি না থাকে, তাহলে কিছুই রেন্ডার করবে না
    if (!hasOriginalImages) {
      return null;
    }

    return (
      <div className="pb-group">
        <label>Images ({totalImageCount}/{MAX_IMAGES})</label>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
          {images.map((img) => (
            <div key={img.id} style={{ position: 'relative' }}>
              <img
                src={img.url}
                alt={img.kind === 'new' ? 'New upload' : 'Post image'}
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--border-color)' }}
              />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                style={{ 
                  position: 'absolute', 
                  top: -6, 
                  right: -6, 
                  background: '#ef4444', 
                  color: '#fff', 
                  border: 'none', 
                  borderRadius: '50%', 
                  width: 20, 
                  height: 20, 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i className="fa-solid fa-xmark" style={{ fontSize: 10 }}></i>
              </button>
            </div>
          ))}

          {canAddMoreImages && (
            <label
              style={{ 
                width: 80, 
                height: 80, 
                border: '2px dashed var(--border-color)', 
                borderRadius: 8, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                cursor: compressing ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                background: 'var(--bg-secondary)',
                opacity: compressing ? 0.5 : 1,
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
            >
              {compressing ? (
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 20, color: 'var(--accent-primary)' }} />
              ) : (
                <i className="fa-solid fa-plus" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleImageChange}
                disabled={compressing}
              />
            </label>
          )}
        </div>

        {compressing && (
          <div style={{ marginTop: '8px' }}>
            <small style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-spinner fa-spin"></i> Optimizing images...
            </small>
          </div>
        )}

        {saving && uploadProgress > 0 && uploadProgress < 100 && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ 
              width: '100%', 
              height: '4px', 
              background: 'var(--bg-secondary)', 
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: `${uploadProgress}%`, 
                height: '100%', 
                background: 'var(--accent-primary)',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <small style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Uploading images... {uploadProgress}%
            </small>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // ✅ Main Render
  // ============================================================
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-modal edit-post-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-modal-header">
          <h3>
            <i className="fa-solid fa-pen-to-square" style={{ color: '#fbbf24' }}></i>
            Edit Post
          </h3>
          <button className="modal-close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="edit-form">
          {/* ── Title ── */}
          <div className="pb-group">
            <label>Post Title <span className="required-star">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter post title..."
              className="edit-input"
              maxLength="100"
            />
            <small className="char-count">{title.length}/100</small>
          </div>

          {/* ── Description ── */}
          <div className="pb-group">
            <label>Description <span className="required-star">*</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your post in detail..."
              rows="4"
              className="edit-textarea"
              maxLength="2000"
            />
            <small className="char-count">{description.length}/2000</small>
          </div>

          {/* ── Budget editor ── */}
          <div className="pb-group">
            <label>Budget / Price <span className="required-star">*</span></label>

            <div className="budget-mode-toggle" style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
              <button
                type="button"
                className={`mode-toggle-btn ${budgetState.mode === 'fixed' ? 'active' : ''}`}
                onClick={() => setBudgetState(prev => ({ ...prev, mode: 'fixed' }))}
              >
                Fixed
              </button>
              <button
                type="button"
                className={`mode-toggle-btn ${budgetState.mode === 'range' ? 'active' : ''}`}
                onClick={() => setBudgetState(prev => ({ ...prev, mode: 'range' }))}
              >
                Range
              </button>
            </div>

            {budgetState.mode === 'fixed' ? (
              <div className="input-with-icon">
                <span className="input-icon">৳</span>
                <input
                  type="number"
                  min="1"
                  value={budgetState.amount}
                  onChange={(e) => setBudgetState(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="Amount"
                  className="edit-input with-icon"
                />
              </div>
            ) : (
              <div className="pb-row-twin">
                <div className="input-with-icon">
                  <span className="input-icon">৳</span>
                  <input
                    type="number"
                    min="1"
                    value={budgetState.min}
                    onChange={(e) => setBudgetState(prev => ({ ...prev, min: e.target.value }))}
                    placeholder="Min"
                    className="edit-input with-icon"
                  />
                </div>
                <div className="input-with-icon">
                  <span className="input-icon">৳</span>
                  <input
                    type="number"
                    min="1"
                    value={budgetState.max}
                    onChange={(e) => setBudgetState(prev => ({ ...prev, max: e.target.value }))}
                    placeholder="Max"
                    className="edit-input with-icon"
                  />
                </div>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={budgetState.isNegotiable}
                onChange={(e) => setBudgetState(prev => ({ ...prev, isNegotiable: e.target.checked }))}
              />
              আলোচনাসাপেক্ষ (Negotiable)
            </label>
          </div>

          {/* ── Deadline editor ── */}
          <div className="pb-group">
            <label>Deadline / Delivery Days <span className="required-star">*</span></label>

            <div className="budget-mode-toggle" style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
              <button
                type="button"
                className={`mode-toggle-btn ${deadlineState.mode === 'fixed' ? 'active' : ''}`}
                onClick={() => setDeadlineState(prev => ({ ...prev, mode: 'fixed' }))}
              >
                Fixed
              </button>
              <button
                type="button"
                className={`mode-toggle-btn ${deadlineState.mode === 'range' ? 'active' : ''}`}
                onClick={() => setDeadlineState(prev => ({ ...prev, mode: 'range' }))}
              >
                Range
              </button>
            </div>

            {deadlineState.mode === 'fixed' ? (
              <input
                type="number"
                min="1"
                value={deadlineState.days}
                onChange={(e) => setDeadlineState(prev => ({ ...prev, days: e.target.value }))}
                placeholder="Days"
                className="edit-input"
              />
            ) : (
              <div className="pb-row-twin">
                <input
                  type="number"
                  min="1"
                  value={deadlineState.min}
                  onChange={(e) => setDeadlineState(prev => ({ ...prev, min: e.target.value }))}
                  placeholder="Min days"
                  className="edit-input"
                />
                <input
                  type="number"
                  min="1"
                  value={deadlineState.max}
                  onChange={(e) => setDeadlineState(prev => ({ ...prev, max: e.target.value }))}
                  placeholder="Max days"
                  className="edit-input"
                />
              </div>
            )}
          </div>

          {/* ── ✅ Images Section (হidden if no original images) ── */}
          {renderImageSection()}

          {/* ── Action Buttons ── */}
          <div className="edit-actions">
            <button className="cancel-btn" onClick={onClose} disabled={saving || compressing}>
              <i className="fa-solid fa-times"></i> Cancel
            </button>
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saving || compressing || !title.trim() || !description.trim()}
              style={{ 
                opacity: (saving || compressing || !title.trim() || !description.trim()) ? 0.5 : 1,
                cursor: (saving || compressing || !title.trim() || !description.trim()) ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> {uploadProgress > 0 ? `Uploading ${uploadProgress}%` : 'Updating...'}</>
              ) : compressing ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> Optimizing...</>
              ) : (
                <><i className="fa-solid fa-check"></i> Update Post</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditPostModal;