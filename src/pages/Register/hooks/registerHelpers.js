// registerHelpers.js
// Constants and pure helper functions that don't touch component state —
// safe to unit-test or reuse on their own.
//
// 🔧 FIX APPLIED: getDocumentFolder() / getDocumentLabel() used the key
// 'birthCert', but every other place in the flow (Register.jsx's
// compressAndPreview/removeFile calls, useRegisterFlow.js's
// selectedFiles state) uses the key 'birth'. Because of the mismatch,
// getDocumentFolder('birth') always fell through to the 'user_documents'
// default instead of 'birth_documents' — which fed directly into the
// PDF-upload bug fixed in useRegisterFlow.js (see that file's
// uploadDocuments() for the full explanation).

// ─── কনস্ট্যান্ট ──────────────────────────────────────────────────────────────
export const CLOUD_NAME = "drwex6tmf";
export const UPLOAD_PRESET = "workhub_preset";

// ✅ লাইভনেস স্টেপস - emoji ডুপ্লিকেট রিমুভ করা হয়েছে
export const LIVENESS_STEPS = [
  { id: 1, label: 'চোখ খোলা রাখুন', emoji: '👁️' },
  { id: 2, label: 'চোখ বন্ধ করুন', emoji: '😌' },
  { id: 3, label: 'মুখ খুলুন', emoji: '👄' },
  { id: 4, label: 'মুখ বন্ধ করুন', emoji: '😐' },
  { id: 5, label: 'মাথা ডানে হেলান', emoji: '👉' },
  { id: 6, label: 'মাথা বামে হেলান', emoji: '👈' },
];

// ✅ Progress Map - ডায়নামিক করা হয়েছে
export const PROGRESS_MAP = [0, 14, 28, 44, 58, 76, 100];

// ✅ ডায়নামিক প্রগ্রেস ক্যালকুলেশন
export const getProgress = (step, totalSteps = 6) => {
  if (step <= 0) return 0;
  if (step >= totalSteps) return 100;
  return Math.round(((step - 1) / (totalSteps - 1)) * 100);
};

// initLiveness ফাংশন — প্রতিবার নতুন অ্যারে দেয়
export const initLiveness = () => LIVENESS_STEPS.map(s => ({ ...s, done: false }));

// ─── ফাইল ভ্যালিডেশন ────────────────────────────────────────────────────────
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export const ALLOWED_DOCUMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

export const validateFile = (file, allowedTypes = ALLOWED_IMAGE_TYPES, maxSize = MAX_IMAGE_SIZE) => {
  if (!file) {
    return { valid: false, error: 'ফাইল নির্বাচন করা হয়নি' };
  }

  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: `শুধু ${allowedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')} ফাইল গ্রহণযোগ্য` 
    };
  }

  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: `ফাইল সর্বোচ্চ ${maxSize / (1024 * 1024)}MB হতে পারবে` 
    };
  }

  return { valid: true, error: null };
};

// ─── ক্লাউডিনারি আপলোডার ─────────────────────────────────────────────────────
export const uploadToCloudinary = async (file, folder = 'user_documents') => {
  try {
    // ✅ ফাইল ভ্যালিডেশন
    const isDocument = folder === 'nid_documents' || folder === 'birth_documents';
    const allowedTypes = isDocument ? ALLOWED_DOCUMENT_TYPES : ALLOWED_IMAGE_TYPES;
    const maxSize = isDocument ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
    
    const validation = validateFile(file, allowedTypes, maxSize);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    fd.append('folder', folder);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: fd }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Upload failed');
    }

    const data = await res.json();
    
    // ✅ Cloudinary response validation
    if (!data.secure_url || !data.public_id) {
      throw new Error('Invalid Cloudinary response');
    }

    console.log(`✅ Cloudinary upload success: ${data.secure_url}`);
    return { url: data.secure_url, publicId: data.public_id };

  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    throw error;
  }
};

// ─── ইমেজ কম্প্রেস (ডকুমেন্টের জন্য উন্নত) ───────────────────────────────────
export const compressImage = async (
  file, 
  maxWidth = 1600, 
  maxHeight = 1200, 
  quality = 0.8,
  isDocument = true
) => {
  return new Promise((resolve, reject) => {
    // ✅ ফাইল ভ্যালিডেশন
    const validation = validateFile(file, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE);
    if (!validation.valid) {
      reject(new Error(validation.error));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // ✅ ডকুমেন্টের জন্য বড় সাইজ রাখা হয়েছে
        if (isDocument) {
          // NID/Document: 1600x1200 পর্যন্ত
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        } else {
          // Face photo: 800x800 পর্যন্ত
          const faceMax = 800;
          if (width > faceMax || height > faceMax) {
            const ratio = Math.min(faceMax / width, faceMax / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // ✅ EXIF orientation ফিক্স (ইমেজ রোটেট করা)
        // আপাতত: canvas-এ draw করলে orientation ঠিক হয়ে যায়

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas to Blob failed'));
              return;
            }

            const originalSize = file.size / 1024;
            const compressedSize = blob.size / 1024;
            console.log(`📊 Image: ${originalSize.toFixed(1)}KB → ${compressedSize.toFixed(1)}KB`);

            const extension = file.type === 'image/png' ? '.png' : '.jpg';
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, extension),
              { type: blob.type, lastModified: Date.now() }
            );

            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
  });
};

// ─── ডকুমেন্ট-নির্দিষ্ট কম্প্রেস ────────────────────────────────────────────
export const compressDocument = (file) => {
  return compressImage(file, 1600, 1200, 0.85, true);
};

// ─── ফেস ফটো কম্প্রেস ────────────────────────────────────────────────────────
export const compressFacePhoto = (file) => {
  return compressImage(file, 800, 800, 0.75, false);
};

// ─── হেল্পার: ফাইল সাইজ ফরম্যাট ────────────────────────────────────────────
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// ─── হেল্পার: ফাইল টাইপ চেক ────────────────────────────────────────────────
export const isImageFile = (file) => {
  return file && file.type && file.type.startsWith('image/');
};

export const isPDFFile = (file) => {
  return file && file.type === 'application/pdf';
};

export const isDocumentFile = (file) => {
  return file && ALLOWED_DOCUMENT_TYPES.includes(file.type);
};

// ─── ডকুমেন্ট টাইপ থেকে ফোল্ডার নাম ────────────────────────────────────────
// 🔧 FIX: key was 'birthCert' — actual key used everywhere else in the
// flow (selectedFiles.birth, compressAndPreview(..., 'birth')) is 'birth'.
export const getDocumentFolder = (docType) => {
  const folders = {
    nidFront: 'nid_documents',
    nidBack: 'nid_documents',
    birth: 'birth_documents',
    face: 'face_photos',
  };
  return folders[docType] || 'user_documents';
};

// ─── ডকুমেন্ট টাইপ থেকে লেবেল ──────────────────────────────────────────────
// 🔧 FIX: same key mismatch as above ('birthCert' -> 'birth').
export const getDocumentLabel = (docType) => {
  const labels = {
    nidFront: 'NID (সামনে)',
    nidBack: 'NID (পিছনে)',
    birth: 'জন্ম নিবন্ধন সনদ',
    face: 'মুখমণ্ডলের ছবি',
  };
  return labels[docType] || docType;
};