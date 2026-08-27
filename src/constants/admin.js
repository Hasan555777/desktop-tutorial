// src/constants/admin.js
// Single source of truth for "who counts as an admin" so PrivateRoute,
// NotificationProvider, and anywhere else that needs this check can never
// drift out of sync with each other.

export const ADMIN_EMAILS = ['hammanmusa362@gmail.com', 'hasanmahmudmd362@gmail.com'];

/**
 * @param {{ email?: string|null }|null} user - Firebase auth user (or any object with .email)
 * @param {string|null} userRole - role string from the user's Firestore document
 */
export function isAdminUser(user, userRole) {
  if (!user) return false;
  return userRole === 'admin' || ADMIN_EMAILS.includes(user.email);
}