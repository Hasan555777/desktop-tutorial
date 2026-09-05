// ============================================================
// 📁 src/rules/constants/security.js
// ============================================================

export const MAX_IDENTITY_CHANGES = 3;
export const IDENTITY_CHANGE_COOLDOWN = 30; // days
export const EMAIL_CHANGE_COOLDOWN = 30; // days
export const PHONE_CHANGE_COOLDOWN = 15; // days
export const MIN_COMPLETED_DEALS = 5;
export const MIN_TRUST_SCORE = 70;

export const MERGE_ACCOUNT_REQUIREMENTS = {
  SAME_NID: true,
  SAME_PHONE: true,
  FACE_VERIFICATION: true,
};

export const SECURITY_POLICIES = {
  STRICT: 'strict',
  MODERATE: 'moderate',
  RELAXED: 'relaxed',
};

export const ALLOWED_FIELDS = {
  STRICT: ['name'],
  MODERATE: ['name', 'phone', 'email'],
  RELAXED: ['name', 'phone', 'email', 'country', 'nationality', 'dob'],
};