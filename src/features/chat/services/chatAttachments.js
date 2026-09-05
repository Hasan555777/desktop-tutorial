// src/services/chatAttachments.js
//
// New (#16 voice messages, #17 documents) — the existing
// uploadToCloudinary (pages/Register/hooks/registerHelpers.js) only
// targets Cloudinary's /image/upload endpoint, which rejects audio
// and most document types outright. This uses /auto/upload instead,
// which lets Cloudinary detect and route image/video/raw resource
// types itself — needed for voice recordings (audio) and documents
// (PDF, Word, etc.) that aren't images.

import { CLOUD_NAME, UPLOAD_PRESET } from '../../register/hooks/registerHelpers';

// Reasonable, explicit allow-list rather than "anything goes" — the
// requirements explicitly call out not allowing dangerous unrestricted
// uploads or executables.
export const ALLOWED_CHAT_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
  'image/jpeg',
  'image/png',
];

export const ALLOWED_VOICE_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
];

export const MAX_CHAT_DOCUMENT_SIZE = 15 * 1024 * 1024; // 15MB
export const MAX_VOICE_SIZE = 10 * 1024 * 1024; // 10MB — a few minutes of compressed audio

// 🔧 FIX (#10 documents can't be opened): the chat bubble linked
// straight to the raw Cloudinary `secure_url` in a plain <a href>
// with no `download` attribute (and even a `download` attribute
// would have been silently ignored here — browsers ignore it on
// CROSS-ORIGIN links, and Cloudinary is a different origin than this
// app). That left the browser to guess what to do with the response
// based on Cloudinary's own default Content-Disposition. For MIME
// types phones don't know how to preview (.docx, .xlsx) that shows
// up to the user as "nothing happens" / a blank tab — matches the
// reported bug exactly.
//
// Cloudinary's `fl_attachment` delivery flag fixes this server-side:
// it makes CLOUDINARY itself respond with
// `Content-Disposition: attachment; filename="..."`, which works
// regardless of origin and gives the file its real name back (the
// stored public_id is a random Cloudinary id, not the original
// filename). Inserted right after `/upload/` per Cloudinary's
// transformation syntax — no re-upload, no backend call, and no
// change to how/where the file is stored, so authorization is still
// whatever it already was (this only affects response HEADERS on a
// URL only chat participants ever receive, per Firestore rules on
// the `chats/{id}/messages` subcollection).
const sanitizeForCloudinaryFlag = (name) => {
  // Cloudinary auto-appends the real file extension to the
  // fl_attachment name, so strip any extension the user's filename
  // already has first — otherwise a "resume.pdf" download could come
  // back named "resume.pdf.pdf".
  const withoutExt = (name || 'document').replace(/\.[^./\\]+$/, '');
  return (withoutExt || 'document').replace(/[^\w.-]+/g, '_');
};

export const getChatDocumentOpenUrl = (url, filename) => {
  if (!url) return url;
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const flag = `fl_attachment:${sanitizeForCloudinaryFlag(filename)}/`;
  return url.slice(0, idx + marker.length) + flag + url.slice(idx + marker.length);
};

function validate(file, allowedTypes, maxSize, label) {
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`অসমর্থিত ${label} ফরম্যাট।`);
  }
  if (file.size > maxSize) {
    throw new Error(`${label} সাইজ সীমার বেশি (max ${Math.round(maxSize / (1024 * 1024))}MB)।`);
  }
}

async function uploadRaw(file, folder) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Upload failed');
  }

  const data = await res.json();
  if (!data.secure_url || !data.public_id) {
    throw new Error('Invalid Cloudinary response');
  }
  return { url: data.secure_url, publicId: data.public_id, bytes: data.bytes, format: data.format };
}

export const uploadChatDocument = async (file) => {
  validate(file, ALLOWED_CHAT_DOCUMENT_TYPES, MAX_CHAT_DOCUMENT_SIZE, 'ফাইল');
  return uploadRaw(file, 'chat_documents');
};

export const uploadVoiceMessage = async (blob, mimeType) => {
  // Blobs from MediaRecorder don't carry a File's `.type` the way
  // File objects do in all browsers consistently, so accept the mime
  // type explicitly from the recorder rather than trusting blob.type.
  const file = new File([blob], `voice-${Date.now()}.webm`, { type: mimeType || blob.type });
  validate(file, ALLOWED_VOICE_TYPES, MAX_VOICE_SIZE, 'ভয়েস মেসেজ');
  return uploadRaw(file, 'chat_voice_messages');
};
