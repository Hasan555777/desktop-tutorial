// src/utils/profileHelpers.js
// Shared helpers extracted out of Profile.jsx so every profile sub-component
// can import them without duplicating logic.

// ============================================================
// ✅ Cloudinary Upload
// ============================================================
export const uploadToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "workhub_preset");

  try {
    const response = await fetch(
      "https://api.cloudinary.com/v1_1/drwex6tmf/image/upload",
      { method: "POST", body: formData }
    );
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    return null;
  }
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
// ⚠️ FIXED BUG: the old code read `post._updatedAt`, a field that is never
// actually set anywhere when a post is created or updated — so it always
// fell back to `Date.now()`, which busts the cache on literally every
// render (defeats the purpose of a cache key, and makes images "flicker"
// reload on every re-render). This now uses the real `updatedAt` field
// (Firestore Timestamp OR ISO string, both handled), and only falls back
// to a stable per-post value (the post id) — never `Date.now()` — when
// `updatedAt` is missing, so the cache key stays stable across renders.
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