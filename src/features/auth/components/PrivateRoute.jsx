// src/components/PrivateRoute.jsx

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../shared/context/AuthContext';
import { useAccessControl } from '../hooks/useAccessControl';
import LoadingSpinner from '../../../shared/ui/LoadingSpinner/LoadingSpinner';
import { isAdminUser } from '../../admin/constants/admin';
import { logInfo } from '../../../shared/utils/logger';

const PrivateRoute = ({
  children,
  requireVerified = false,
  requireComplete = false,
  requireAdmin = false,
  requireSeller = false,
  requireBuyer = false,
  redirectPath = null,
  allowedRoles = [],
}) => {
  const { currentUser, loading } = useAuth();

  const { isFullyVerified, isComplete, isBlocked, isPending, isRejected, userRole, adminDisabled } = useAccessControl();

  const isAdmin = isAdminUser(currentUser, userRole, adminDisabled);

  // ── লোডিং ──
  if (loading) {
    return <LoadingSpinner />;
  }

  // ── ১. ইউজার লগইন চেক ──
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // ── ২. ব্লকড চেক ──
  if (isBlocked) {
    logInfo('User is blocked, redirecting to /blocked');
    return <Navigate to="/blocked" replace />;
  }

  // ── ৩. রিজেক্টেড চেক ──
  if (isRejected) {
    return <Navigate to="/verify-rejected" replace />;
  }

  // ── ৪. পেন্ডিং চেক ──
  if (isPending && requireVerified) {
    return <Navigate to="/verify-pending" replace />;
  }

  // ── ৫. কমপ্লিট চেক ──
  if (requireComplete && !isComplete) {
    const path = redirectPath || '/profile';
    return <Navigate to={path} replace />;
  }

  // ── ৬. ভেরিফাইড চেক ──
  // NOTE: this is also the final gate for `requireVerified` routes — if a
  // route requires verification, this check (or the pending/rejected ones
  // above it) always resolves it, so no separate accessLevel<3 check is
  // needed after this point (the old code had one further down that could
  // never actually be reached — removed).
  if (requireVerified && !isFullyVerified) {
    const path = redirectPath || '/verify-pending';
    return <Navigate to={path} replace />;
  }

  // ── ৭. অ্যাডমিন চেক (ইমেইল + রোল) ──
  if (requireAdmin && !isAdmin) {
    logInfo('Admin access denied', { email: currentUser?.email, userRole, isAdmin });
    return <Navigate to="/" replace />;
  }

  // ── ৮. রোল বেসড চেক ──
  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  // ── ৯. সেলার চেক ──
  if (requireSeller && userRole !== 'seller' && userRole !== 'freelancer') {
    return <Navigate to="/" replace />;
  }

  // ── ১০. বায়ার চেক ──
  if (requireBuyer && userRole !== 'client' && userRole !== 'buyer') {
    return <Navigate to="/" replace />;
  }

  // ── ১১. সব চেক পাস → চাইল্ড রেন্ডার ──
  return children;
};

export default PrivateRoute;













// rules_version = '2';

// service cloud.firestore {
//   match /databases/{database}/documents {

//     // ------------------------------------------------------------
//     // Helpers
//     // ------------------------------------------------------------
//     function isSignedIn() {
//       return request.auth != null;
//     }

//     function isOwner(userId) {
//       return isSignedIn() && request.auth.uid == userId;
//     }

//     function isAdmin() {
//       return isSignedIn() &&
//         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
//         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
//     }

//     // ------------------------------------------------------------
//     // users/{userId}
//     // Fields written by the client (App.js / AuthContext.jsx):
//     //   displayName, photoURL, isOnline, lastSeen, savedPosts,
//     //   notification.token/platform/updatedAt/enabled, fcmToken, fcmUpdatedAt
//     // Fields that must ONLY ever change via admin action or a trusted
//     // backend (Cloud Function) — never directly by the owning client:
//     //   role, isVerified, verificationStatus, isBanned, isBlocked,
//     //   documentVerified, faceVerified, documentsUploaded,
//     //   verificationMethod, completionScore, totalReviews, totalRating,
//     //   averageRating
//     // Without this, a signed-in user could call updateDoc on their own
//     // document and self-verify or clear a ban.
//     // ------------------------------------------------------------
//     function userTrustFieldsUnchanged() {
//       let before = resource.data;
//       let after = request.resource.data;
//       return
//         after.get('role', null) == before.get('role', null) &&
//         after.get('isVerified', null) == before.get('isVerified', null) &&
//         after.get('verificationStatus', null) == before.get('verificationStatus', null) &&
//         after.get('isBanned', null) == before.get('isBanned', null) &&
//         after.get('isBlocked', null) == before.get('isBlocked', null) &&
//         after.get('documentVerified', null) == before.get('documentVerified', null) &&
//         after.get('faceVerified', null) == before.get('faceVerified', null) &&
//         after.get('documentsUploaded', null) == before.get('documentsUploaded', null) &&
//         after.get('verificationMethod', null) == before.get('verificationMethod', null) &&
//         after.get('completionScore', null) == before.get('completionScore', null) &&
//         after.get('totalReviews', null) == before.get('totalReviews', null) &&
//         after.get('totalRating', null) == before.get('totalRating', null) &&
//         after.get('averageRating', null) == before.get('averageRating', null);
//     }

//     match /users/{userId} {
//       // SECURITY: restricted to owner/admin because this document holds
//       // sensitive fields (appLock.pinHash/pinSalt, biometric.credentialId,
//       // notification.token) that must never be readable by other users.
//       // If pages like /profile/:userId need to show public info
//       // (displayName, photoURL, averageRating) for OTHER users, that data
//       // should live in a separate `publicProfiles/{uid}` document (kept in
//       // sync via a Cloud Function) rather than reading this document
//       // directly — tell me if that page needs adjusting and I'll wire it up.
//       allow read: if isOwner(userId) || isAdmin();

//       // New accounts always start unverified, unbanned, role 'client' —
//       // matches ensureUserDocument() in AuthContext.jsx.
//       allow create: if isOwner(userId) &&
//         request.resource.data.role == 'client' &&
//         request.resource.data.isVerified == false &&
//         request.resource.data.isBanned == false &&
//         request.resource.data.isBlocked == false;

//       allow update: if (isOwner(userId) && userTrustFieldsUnchanged()) || isAdmin();

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // posts/{postId}
//     // App.js: any signed-in user can create a post with status 'pending'.
//     // Only an admin may move a post to 'approved' / 'rejected'.
//     // Everyone (incl. signed-out) can read approved posts; owner can read
//     // their own pending/rejected posts.
//     // ------------------------------------------------------------
//     match /posts/{postId} {
//       allow read: if resource.data.status == 'approved'
//         || (isSignedIn() && resource.data.userId == request.auth.uid)
//         || isAdmin();

//       allow create: if isSignedIn() &&
//         request.resource.data.userId == request.auth.uid &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.isPublished == false;

//       // Owner may edit their own pending post's content, but cannot touch
//       // moderation fields. Admin may update moderation fields freely.
//       allow update: if (
//         isSignedIn() &&
//         resource.data.userId == request.auth.uid &&
//         resource.data.status == 'pending' &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.userId == resource.data.userId
//       ) || isAdmin();

//       allow delete: if isSignedIn() && resource.data.userId == request.auth.uid || isAdmin();
//     }

//     // ------------------------------------------------------------
//     // deals/{dealId}
//     // App.js reads deals where the current user is in `participants`.
//     // Only participants (or admin) may read/update a deal; deal creation
//     // and status transitions should generally go through a trusted backend
//     // (Cloud Function) once money is involved — this rule only covers the
//     // client read/update paths actually used by App.js.
//     // ------------------------------------------------------------
//     match /deals/{dealId} {
//       allow read: if isSignedIn() &&
//         request.auth.uid in resource.data.participants;

//       allow create: if isSignedIn() &&
//         request.auth.uid in request.resource.data.participants;

//       allow update: if isSignedIn() &&
//         request.auth.uid in resource.data.participants &&
//         request.auth.uid in request.resource.data.participants;

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // chats/{chatId}
//     // App.js reads chats where the current user is in `participants`, and
//     // reads a per-user unreadCount map keyed by uid.
//     // ------------------------------------------------------------
//     match /chats/{chatId} {
//       allow read: if isSignedIn() &&
//         request.auth.uid in resource.data.participants;

//       allow create: if isSignedIn() &&
//         request.auth.uid in request.resource.data.participants;

//       // Participants can update the chat (send messages, adjust their own
//       // unreadCount entry) but cannot remove other participants or edit
//       // someone else's unread counter.
//       allow update: if isSignedIn() &&
//         request.auth.uid in resource.data.participants &&
//         request.auth.uid in request.resource.data.participants;

//       allow delete: if false; // chats are never hard-deleted from the client
//     }

//     // ------------------------------------------------------------
//     // notifications/{notificationId}
//     // Written by NotificationProvider.jsx's createFirestoreNotification()
//     // for a single userId. Only that user (or admin) may read it; only that
//     // user may mark it read/unread — nothing else about a notification
//     // should be editable by the client once created.
//     // ------------------------------------------------------------
//     match /notifications/{notificationId} {
//       allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());

//       // Any signed-in user can create a notification FOR another user (e.g.
//       // notifying the other party in a deal/chat) — this is a normal app
//       // flow, not an admin-only action. Basic shape validation only; this
//       // can't fully prevent spam client-side. If abuse becomes a problem,
//       // move notification creation behind a Cloud Function instead.
//       allow create: if isSignedIn() &&
//         request.resource.data.userId is string &&
//         request.resource.data.event is string &&
//         request.resource.data.keys().hasAll(['userId', 'event', 'title', 'createdAt']);

//       allow update: if isSignedIn() &&
//         resource.data.userId == request.auth.uid &&
//         request.resource.data.userId == resource.data.userId &&
//         request.resource.data.event == resource.data.event &&
//         request.resource.data.diff(resource.data).affectedKeys()
//           .hasOnly(['isUnread', 'isRead', 'readAt']);

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // admin_notifications/{notificationId}
//     // Only admins may read/write — these are internal ops notifications.
//     // ------------------------------------------------------------
//     match /admin_notifications/{notificationId} {
//       allow read: if isAdmin();

//       // Regular user actions (e.g. submitting a post for review) trigger
//       // these to alert admins — not admin-only to create.
//       allow create: if isSignedIn() &&
//         request.resource.data.event is string &&
//         request.resource.data.keys().hasAll(['event', 'title', 'createdAt']);

//       allow update: if isAdmin() &&
//         request.resource.data.diff(resource.data).affectedKeys().hasOnly(['isRead', 'readAt']);
//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // Default deny — anything not explicitly matched above is blocked.
//     // ------------------------------------------------------------
//     match /{document=**} {
//       allow read, write: if false;
//     }
//   }
// }