// src/constants/admin.js
// Single source of truth for "who counts as an admin" so PrivateRoute,
// NotificationProvider, and anywhere else that needs this check can never
// drift out of sync with each other.

export const ADMIN_EMAILS = ['hammanmusa362@gmail.com', 'hasanmahmudmd362@gmail.com'];

/**
 * @param {{ email?: string|null }|null} user - Firebase auth user (or any object with .email)
 * @param {string|null} userRole - role string from the user's Firestore document
 * @param {boolean} [adminDisabled] - users/{uid}.adminDisabled — a MAIN-admin-set
 *   flag that revokes a sub-admin's admin access WITHOUT touching their role or
 *   adminPermissions (see "Disable Admin" vs "Remove Sub-Admin" below). Main
 *   admins can never be disabled through this — see the ADMIN_EMAILS check
 *   ordering here, which always wins first.
 */
export function isAdminUser(user, userRole, adminDisabled = false) {
  if (!user) return false;
  if (ADMIN_EMAILS.includes(user.email)) return true;
  return userRole === 'admin' && !adminDisabled;
}

// ============================================================
// 🔧 ADD (#28/#29 admin RBAC): granular permissions instead of fixed
// named roles like FINANCE_ADMIN/MODERATOR — the requirements doc
// explicitly says "do not blindly create these exact roles if they
// do not fit the project; first inspect what responsibilities
// actually exist." Inspecting AdminDashboard.jsx and
// useAdminData.js's actual handlers surfaced these real clusters:
//   - users: block/unblock/emergency-unlock users
//   - verification: identity DB, needs-review, face verification
//   - finance: deposits, withdrawals
//   - deals: deal management, deal disputes, marketplace operations
//   - support: posts, pending-posts, pending-edits, reports (user
//     support / content moderation / chat-dispute review)
//   - announcements: announcements tab
//   - adminManagement: create/edit/disable other admins (main-admin
//     only — see isMainAdmin below, never grantable through this
//     permission set)
//
// 🔧 FIX (audit vs. requirements doc's named categories): this used
// to be a single 'moderation' bucket covering posts AND deals AND
// disputes AND reports together. The requirements doc explicitly
// asks for separate "Deal Admin" (deal management/disputes) and
// "Support/Admin" (user support/reports/chat-dispute review)
// categories — a sub-admin handling customer support tickets
// shouldn't automatically also be able to act on live deals, and
// vice versa. Split into 'deals' and 'support' below. This is a
// breaking rename for any admin doc that already has
// `adminPermissions.moderation` set — re-grant 'deals'/'support' to
// existing sub-admins after deploying this change, since there's no
// data migration run from this environment (no network access here).
//
// A permission SET (rather than fixed role names) is also just more
// flexible for whatever mix of responsibilities you actually want a
// given sub-admin to have, without needing new role names invented
// every time the mix changes. In other words: "Finance Admin" /
// "Verification Admin" / "Deal Admin" / "Support Admin" from the
// requirements doc are just the common presets you'd get by ticking
// one box each (finance / verification / deals / support) — nothing
// stops mixing them for a sub-admin who genuinely covers more than
// one area.
// ============================================================
export const ADMIN_PERMISSIONS = ['users', 'verification', 'finance', 'deals', 'support', 'announcements'];

/**
 * The two ADMIN_EMAILS accounts are always full-access "main admins"
 * — they predate this permission system and are the only accounts
 * that can create/manage other admins. Anyone else with role==='admin'
 * is a sub-admin, gated by their specific adminPermissions.
 */
export function isMainAdminUser(user) {
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email);
}

/**
 * @param {{ email?: string|null }|null} user
 * @param {string|null} userRole
 * @param {Record<string, boolean>|null} adminPermissions - from users/{uid}.adminPermissions
 * @param {string} permission - one of ADMIN_PERMISSIONS
 * @param {boolean} [adminDisabled] - users/{uid}.adminDisabled, see isAdminUser above
 */
export function hasAdminPermission(user, userRole, adminPermissions, permission, adminDisabled = false) {
  if (!isAdminUser(user, userRole, adminDisabled)) return false;
  if (isMainAdminUser(user)) return true; // main admins bypass granular checks entirely
  return !!adminPermissions?.[permission];
}