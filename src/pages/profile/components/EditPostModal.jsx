// src/components/profile/EditPostModal.jsx
//
// ⚠️ FIXED BUG (was in Profile.jsx before this file was split out):
// Budget and Deadline inputs used to be `readOnly` with a "🔒 Edit coming
// soon" label, AND `handleUpdatePost` forced `budget: originalBudget,
// deadline: originalDeadline` regardless of what was typed — so editing
// price/deadline was completely non-functional. This component now has a
// real Fixed/Range editor for both, with validation, and always returns
// the edited values to the parent's onSave callback.

import React, { useState, useEffect } from 'react';
import {
  budgetToFormState,
  formStateToBudget,
  deadlineToFormState,
  formStateToDeadline,
  uploadToCloudinary,
} from '../utils/profileHelpers';

const EditPostModal = ({ post, onClose, onSave, feedback }) => {
  const [title, setTitle] = useState(post?.title || '');
  const [description, setDescription] = useState(post?.description || '');

  const [budgetState, setBudgetState] = useState(() =>
    budgetToFormState(post?.budget ?? post?.price)
  );
  const [deadlineState, setDeadlineState] = useState(() =>
    deadlineToFormState(post?.deadline ?? post?.deliveryDays)
  );

  const existingImages = (post?.images || []).filter(img => typeof img === 'string' && img.startsWith('http'));
  const [keptImages, setKeptImages] = useState(existingImages);
  const [newImageFiles, setNewImageFiles] = useState([]);
  const [newImagePreviews, setNewImagePreviews] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(post?.title || '');
    setDescription(post?.description || '');
    setBudgetState(budgetToFormState(post?.budget ?? post?.price));
    setDeadlineState(deadlineToFormState(post?.deadline ?? post?.deliveryDays));
    const existing = (post?.images || []).filter(img => typeof img === 'string' && img.startsWith('http'));
    setKeptImages(existing);
    setNewImageFiles([]);
    setNewImagePreviews([]);
  }, [post]);

  if (!post) return null;

  const totalImageCount = keptImages.length + newImagePreviews.length;

  // ============================================================
  // ✅ Image handlers
  // ============================================================
const handleImageChange = (e) => {
  // ✅ Only posts that already have images can edit/replace images
  if ((post?.images || []).length === 0) {
    feedback?.alert?.warning?.({
      message: 'এই পোস্টে আগে কোনো ছবি ছিল না, তাই ছবির Edit করা যাবে না।'
    });
    e.target.value = '';
    return;
  }

  const files = Array.from(e.target.files);
  const remainingSlots = 2 - totalImageCount;

  if (files.length > remainingSlots) {
    feedback?.alert?.warning?.({
      message: `You can only add ${remainingSlots} more image(s). Maximum 2 images allowed!`
    });
    return;
  }

  const previews = files.map(file => URL.createObjectURL(file));
  setNewImageFiles(prev => [...prev, ...files]);
  setNewImagePreviews(prev => [...prev, ...previews]);
  e.target.value = '';
};

  const removeExistingImage = (url) => {
    setKeptImages(prev => prev.filter(img => img !== url));
  };

  const removeNewImage = (index) => {
    setNewImageFiles(prev => prev.filter((_, i) => i !== index));
    setNewImagePreviews(prev => prev.filter((_, i) => i !== index));
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

    const hadImagesBefore = (post.images || []).length > 0;
    if (hadImagesBefore && totalImageCount === 0) {
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

    try {
      let uploadedUrls = [];
      if (newImageFiles.length > 0) {
        for (const file of newImageFiles) {
          const url = await uploadToCloudinary(file);
          if (url) uploadedUrls.push(url);
        }
      }

      const finalImages = [...keptImages, ...uploadedUrls];
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
    }
  };

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

          {/* ── ✅ Budget editor (Fixed / Range) ── */}
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

          {/* ── ✅ Deadline editor (Fixed / Range) ── */}
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

          {/* ── Images ── */}
          <div className="pb-group">
            <label>Images ({totalImageCount}/2)</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
              {keptImages.map((img) => (
                <div key={img} style={{ position: 'relative' }}>
                  <img src={img} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                  <button
                    type="button"
                    onClick={() => removeExistingImage(img)}
                    style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}
                  >
                    <i className="fa-solid fa-xmark" style={{ fontSize: 10 }}></i>
                  </button>
                </div>
              ))}
              {newImagePreviews.map((src, idx) => (
                <div key={src} style={{ position: 'relative' }}>
                  <img src={src} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                  <button
                    type="button"
                    onClick={() => removeNewImage(idx)}
                    style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}
                  >
                    <i className="fa-solid fa-xmark" style={{ fontSize: 10 }}></i>
                  </button>
                </div>
              ))}
              {(post?.images || []).length > 0 && totalImageCount < 2 && (
                <label style={{ width: 80, height: 80, border: '2px dashed var(--border-color)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <i className="fa-solid fa-plus"></i>
                  <input type="file" accept="image/*" multiple hidden onChange={handleImageChange} />
                </label>
              )}
            </div>
          </div>

          {/* ── Action Buttons ── */}
          <div className="edit-actions">
            <button className="cancel-btn" onClick={onClose} disabled={saving}>
              <i className="fa-solid fa-times"></i> Cancel
            </button>
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saving || !title.trim() || !description.trim()}
            >
              {saving ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> Updating...</>
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