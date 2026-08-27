// src\pages\profile\utils\profileHelpers.jsx
// Shared helpers extracted out of Profile.jsx so every profile sub-component
// can import them without duplicating logic.
//
// 🔧 FIX APPLIED (this revision): uploadToCloudinary() was completely out
// of sync with the Register flow's version (registerHelpers.js):
// - It ignored the `folder` argument entirely, so profile uploads never
//   got organized into nid_documents/birth_documents/face_photos in
//   Cloudinary the way registration uploads do.
// - It returned a bare URL string (`data.secure_url`), while every
//   caller across the Profile feature that mattered — most critically
//   useProfileFaceVerification.js's capturePhoto() — was written
//   expecting an `{ url, publicId }` object and reading `result.url`.
//   On a string, `.url` is `undefined`, which was then written straight
//   into Firestore as `facePhotoUrl: undefined` — an update Firestore
//   rejects outright. In other words: face verification from the
//   Profile page was silently broken by this mismatch.
// - It skipped file-type/size validation entirely (Register's version
//   validates via validateFile()).
//
// Fixed by importing the exact same constants/validator Register uses,
// so both flows share one implementation and can't drift again.

import {
  CLOUD_NAME,
  UPLOAD_PRESET,
  validateFile,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_IMAGE_SIZE,
  MAX_DOCUMENT_SIZE,
} from '@/pages/Register/hooks/registerHelpers';
// NOTE: uses the '@/' alias (same convention as '@/firebase',
// '@/utils/identityUtils' elsewhere in this codebase) instead of a
// relative path, since this file's exact folder depth relative to
// Register's hooks isn't guaranteed. If your project doesn't have an
// '@' -> 'src' alias configured, replace this with the correct
// relative path to src/pages/Register/hooks/registerHelpers.js.

// ============================================================
// ✅ Cloudinary Upload
// 🔧 FIX: now matches registerHelpers.js's uploadToCloudinary exactly —
// accepts a folder, validates the file, and returns { url, publicId }.
// Throws on failure instead of returning null, so callers get a real
// error message instead of a silent falsy value.
// ============================================================
export const uploadToCloudinary = async (file, folder = 'user_documents') => {
  const isDocument = folder === 'nid_documents' || folder === 'birth_documents';
  const allowedTypes = isDocument ? ALLOWED_DOCUMENT_TYPES : ALLOWED_IMAGE_TYPES;
  const maxSize = isDocument ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;

  const validation = validateFile(file, allowedTypes, maxSize);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Upload failed');
  }

  const data = await response.json();

  if (!data.secure_url || !data.public_id) {
    throw new Error('Invalid Cloudinary response');
  }

  return { url: data.secure_url, publicId: data.public_id };
};

// ============================================================
// ✅ Budget formatting — supports:
//    - plain number/string
//    - { amount, isNegotiable }
//    - { type: 'range', min, max, isNegotiable }
// ============================================================
export const formatBudget = (post) => {
  const raw = post.budget ?? post.price;
  if (raw && typeof raw === 'object') {
    if (raw.type === 'range') {
      const range = `${raw.min ?? 0}-${raw.max ?? 0}`;
      return raw.isNegotiable ? `${range} (আলোচনাসাপেক্ষ)` : range;
    }
    const amount = raw.amount ?? 0;
    return raw.isNegotiable ? `${amount} (আলোচনাসাপেক্ষ)` : `${amount}`;
  }
  return raw ?? 0;
};

// ============================================================
// ✅ Deadline formatting — supports:
//    - plain number/string
//    - { days }
//    - { type: 'range', min, max }
// ============================================================
export const formatDeadline = (post) => {
  const raw = post.deadline ?? post.deliveryDays;
  if (raw && typeof raw === 'object') {
    return raw.type === 'range' ? `${raw.min ?? 0}-${raw.max ?? 0}` : `${raw.days ?? 0}`;
  }
  return raw ?? 0;
};

// ============================================================
// ✅ Date formatting (handles Firestore Timestamp, ISO string, Date, etc.)
// ============================================================
export const formatDate = (date) => {
  if (!date) return 'N/A';

  try {
    let dateObj = null;

    if (date && typeof date === 'object' && date.seconds !== undefined) {
      dateObj = new Date(date.seconds * 1000);
    } else if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (typeof date === 'string' || typeof date === 'number') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      return 'N/A';
    }

    return dateObj.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

  } catch (error) {
    console.error('Date formatting error:', error);
    return 'N/A';
  }
};

// ============================================================
// ✅ Cache-busting image URL helper.
// ============================================================
export const getImageCacheKey = (post) => {
  const updated = post?.updatedAt;
  if (updated && typeof updated === 'object' && updated.seconds !== undefined) {
    return updated.seconds;
  }
  if (updated) {
    const parsed = new Date(updated).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return post?.id || 'v1';
};

// ============================================================
// ✅ Budget <-> editable-form-state conversion (used by EditPostModal)
// ============================================================
export const budgetToFormState = (raw) => {
  if (raw && typeof raw === 'object') {
    if (raw.type === 'range') {
      return { mode: 'range', amount: '', min: raw.min ?? '', max: raw.max ?? '', isNegotiable: !!raw.isNegotiable };
    }
    return { mode: 'fixed', amount: raw.amount ?? '', min: '', max: '', isNegotiable: !!raw.isNegotiable };
  }
  return { mode: 'fixed', amount: raw ?? '', min: '', max: '', isNegotiable: false };
};

export const formStateToBudget = (state) => {
  if (state.mode === 'range') {
    return {
      type: 'range',
      min: Number(state.min) || 0,
      max: Number(state.max) || 0,
      isNegotiable: !!state.isNegotiable,
    };
  }
  return {
    amount: Number(state.amount) || 0,
    isNegotiable: !!state.isNegotiable,
  };
};

// ============================================================
// ✅ Deadline <-> editable-form-state conversion (used by EditPostModal)
// ============================================================
export const deadlineToFormState = (raw) => {
  if (raw && typeof raw === 'object') {
    if (raw.type === 'range') {
      return { mode: 'range', days: '', min: raw.min ?? '', max: raw.max ?? '' };
    }
    return { mode: 'fixed', days: raw.days ?? '', min: '', max: '' };
  }
  return { mode: 'fixed', days: raw ?? '', min: '', max: '' };
};

export const formStateToDeadline = (state) => {
  if (state.mode === 'range') {
    return {
      type: 'range',
      min: Number(state.min) || 0,
      max: Number(state.max) || 0,
    };
  }
  return { days: Number(state.days) || 0 };
};