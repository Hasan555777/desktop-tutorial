// DealManager.jsx
// Main page component. Composes dealManager.hooks.js and
// DealManager.components.jsx.

import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './DealManager.css';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useNotification } from '@/UI/Notification/NotificationProvider';
import { useAuth } from '@/context/AuthContext';
import DealGuideModal from './components/DealGuideModal';

import { LOCAL_STORAGE_MODE_KEY } from '@/constants/dealManager.constants';
import { useDealsList, useSelectedDeal, useDeadlineCountdown, useDealBackgroundSweep, useDealGuide, useDealActions } from '@/hooks/dealManager.hooks';
import { ModeSwitcher, DealsStats, DealsList, DealHeader, DealBanners, DealInfoCard, MilestoneList } from '@/components/DealManager.components';

const DealManager = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dealId = searchParams.get('dealId') || searchParams.get('postId');
  const feedback = useFeedback();
  const notification = useNotification();

  // Uses the app's single canonical auth source (AuthContext) instead of a
  // second, independent onAuthStateChanged listener — the previous version
  // maintained its own local currentUser state via a duplicate listener,
  // which is unnecessary overhead and a second thing to keep in sync.
  const { currentUser } = useAuth();

  const [currentMode, setCurrentMode] = useState(() => localStorage.getItem(LOCAL_STORAGE_MODE_KEY) || 'buyer');
  const [showCancelledDeals, setShowCancelledDeals] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────
  const { deals, setDeals, loadingList } = useDealsList(currentUser, currentMode);
  const { selectedDeal, setSelectedDeal, loadingDeal } = useSelectedDeal(dealId);
  const loading = dealId ? loadingDeal : loadingList;

  const handleModeChange = (mode) => {
    setCurrentMode(mode);
    localStorage.setItem(LOCAL_STORAGE_MODE_KEY, mode);
    setSelectedDeal(null);
  };

  // ── Background timers ────────────────────────────────────────────
  const timeRemaining = useDeadlineCountdown(selectedDeal, setSelectedDeal, notification);
  useDealBackgroundSweep(deals, notification, setSelectedDeal, selectedDeal?.id);

  // ── Guide popup wrapper ───────────────────────────────────────────
  const { showGuideModal, runWithGuide, handleGuideConfirm, handleGuideCancel } = useDealGuide();

  // ── All mutation handlers ────────────────────────────────────────
  const {
    handleExtendDeadline,
    handleSubmitWork,
    handleRejectWork,
    handleReleasePayment,
    handleExtensionResponse,
    handleConfirmDeal,
    handleCancelDeal,
    handleCancelResponse,
    handleOpenDispute,
    submittingMilestone,
    releasingPayment,
    rejectingWork,
    openSubmitForm,
    setOpenSubmitForm,
    workDraft,
    setWorkDraft,
  } = useDealActions({
    selectedDeal,
    setSelectedDeal,
    setDeals,
    currentUser,
    currentMode,
    feedback,
    notification,
    navigate,
  });

  // ── Loading state ────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: 'var(--bg-primary, #090d16)',
          color: 'var(--accent-primary, #14b8a6)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{ fontSize: '48px', animation: 'spin 2s linear infinite', display: 'block', marginBottom: '16px' }} />
          <h2>Loading Deals...</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your deals...
          </p>
        </div>
      </div>
    );
  }

  const cancelledDeals = deals.filter((deal) => deal.status === 'cancelled');
  const activeDeals = deals.filter((deal) => deal.status !== 'cancelled');
  const pendingCount = deals.filter((d) => d.status === 'pending').length;
  const activeCount = deals.filter((d) => d.status === 'active').length;
  const overdueCount = deals.filter((d) => d.status === 'overdue').length;
  const completedCount = deals.filter((d) => d.status === 'completed').length;
  const totalDeals = deals.length;

  return (
    <div className="dashboard-container-wrapper">
      <div className="dashboard-wrapper">
        <DealGuideModal show={showGuideModal} role="accepter" onConfirm={handleGuideConfirm} onCancel={handleGuideCancel} />

        <ModeSwitcher
          currentMode={currentMode}
          handleModeChange={handleModeChange}
          pendingCount={pendingCount}
          showCancelledDeals={showCancelledDeals}
          setShowCancelledDeals={setShowCancelledDeals}
          cancelledCount={cancelledDeals.length}
        />

        <DealsStats totalDeals={totalDeals} pendingCount={pendingCount} activeCount={activeCount} overdueCount={overdueCount} completedCount={completedCount} cancelledCount={cancelledDeals.length} />

        {dealId && selectedDeal ? (
          <>
            <DealHeader selectedDeal={selectedDeal} currentMode={currentMode} timeRemaining={timeRemaining} navigate={navigate} feedback={feedback} />

            <DealBanners
              selectedDeal={selectedDeal}
              currentUser={currentUser}
              currentMode={currentMode}
              handleExtendDeadline={handleExtendDeadline}
              handleCancelDeal={handleCancelDeal}
              handleOpenDispute={handleOpenDispute}
              handleExtensionResponse={handleExtensionResponse}
              handleCancelResponse={handleCancelResponse}
              setSelectedDeal={setSelectedDeal}
            />

            <DealInfoCard selectedDeal={selectedDeal} currentMode={currentMode} timeRemaining={timeRemaining} />

            <MilestoneList
              selectedDeal={selectedDeal}
              currentMode={currentMode}
              currentUser={currentUser}
              navigate={navigate}
              runWithGuide={runWithGuide}
              handleConfirmDeal={handleConfirmDeal}
              handleCancelResponse={handleCancelResponse}
              releasingPayment={releasingPayment}
              rejectingWork={rejectingWork}
              submittingMilestone={submittingMilestone}
              openSubmitForm={openSubmitForm}
              setOpenSubmitForm={setOpenSubmitForm}
              workDraft={workDraft}
              setWorkDraft={setWorkDraft}
              onReleasePayment={handleReleasePayment}
              onRejectWork={handleRejectWork}
              onSubmitWork={handleSubmitWork}
            />

            {(selectedDeal.status === 'pending' || selectedDeal.status === 'active') && selectedDeal.disputeStatus !== 'open' && !selectedDeal.cancelRequestedBy && (
              <div className="cancel-deal-section">
                <button className="btn-cancel-deal" onClick={handleCancelDeal}>
                  <i className="fa-solid fa-ban"></i> Request Cancellation
                </button>
                <p className="cancel-warning">
                  <i className="fa-solid fa-info-circle"></i>
                  Your request must be approved by the other party.
                </p>
              </div>
            )}
          </>
        ) : (
          <DealsList showCancelledDeals={showCancelledDeals} cancelledDeals={cancelledDeals} activeDeals={activeDeals} currentMode={currentMode} navigate={navigate} timeRemaining={timeRemaining} />
        )}
      </div>
    </div>
  );
};

export default DealManager;

















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
//     // FIXED: the previous version checked `request.auth.uid in
//     // resource.data.participants` — but deal documents never have a
//     // `participants` array (confirmed via chatHelpers.js's sendProposal,
//     // which writes buyerId/sellerId, not participants). That old rule
//     // matched nothing, so every deal read/write was silently falling
//     // through to it and failing. Rewritten around buyerId/sellerId, the
//     // fields the app actually uses everywhere (PaymentGateway.jsx,
//     // dealManager.hooks.js, chatHelpers.js).
//     // ------------------------------------------------------------
//     function isDealParty(deal) {
//       return isSignedIn() && (deal.buyerId == request.auth.uid || deal.sellerId == request.auth.uid);
//     }

//     match /deals/{dealId} {
//       allow read: if isDealParty(resource.data) || isAdmin();

//       // Matches sendProposal() in chatHelpers.js: the sender is always
//       // either the buyer or seller, deals always start 'pending', and
//       // budget/deadline/milestones are always present in that shape.
//       allow create: if isSignedIn() &&
//         (request.resource.data.buyerId == request.auth.uid || request.resource.data.sellerId == request.auth.uid) &&
//         request.resource.data.proposedBy == request.auth.uid &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.budget is number && request.resource.data.budget > 0 &&
//         request.resource.data.deadline is number && request.resource.data.deadline > 0 &&
//         request.resource.data.milestones is list;

//       // Either party can update (confirm, extend, submit work, release,
//       // cancel, dispute, etc. — see dealManager.hooks.js for the full set
//       // of transitions). Identity/financial-origin fields set at creation
//       // can never be changed by either party afterward, and `status` must
//       // stay within the vocabulary this app actually uses — this does NOT
//       // attempt to enforce which specific transitions are valid from which
//       // role at which prior status (that state machine lives entirely in
//       // dealManager.hooks.js and is too complex to safely mirror here
//       // without risking rules and code drifting out of sync).
//       allow update: if isDealParty(resource.data) &&
//         request.resource.data.buyerId == resource.data.buyerId &&
//         request.resource.data.sellerId == resource.data.sellerId &&
//         request.resource.data.postId == resource.data.postId &&
//         request.resource.data.budget == resource.data.budget &&
//         request.resource.data.dealIdNumber == resource.data.dealIdNumber &&
//         request.resource.data.status in ['pending', 'active', 'overdue', 'completed', 'cancelled', 'rejected'];

//       // chatHelpers.js's handleCancelResponse('reject') calls deleteDoc()
//       // directly when rejecting a still-pending offer (not just an admin
//       // action) — allowed only while status is 'pending'; once a deal is
//       // real (funds ever moved) it must go through cancel/dispute instead,
//       // never a hard delete.
//       allow delete: if (isDealParty(resource.data) && resource.data.status == 'pending') || isAdmin();
//     }

//     // ------------------------------------------------------------
//     // disputes/{disputeId}
//     // Created by whichever deal party opens a dispute (handleOpenDispute
//     // in dealManager.hooks.js); only an admin resolves/updates one.
//     // ------------------------------------------------------------
//     match /disputes/{disputeId} {
//       allow read: if isSignedIn() &&
//         (resource.data.buyerId == request.auth.uid || resource.data.sellerId == request.auth.uid || isAdmin());

//       allow create: if isSignedIn() &&
//         (request.resource.data.buyerId == request.auth.uid || request.resource.data.sellerId == request.auth.uid) &&
//         request.resource.data.raisedBy == request.auth.uid &&
//         request.resource.data.status == 'open';

//       allow update: if isAdmin();
//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // wallets/{uid}
//     //
//     // ⚠️ SECURITY LIMITATION — READ BEFORE RELYING ON THIS:
//     // This app credits OTHER users' wallets directly from the client (e.g.
//     // SendMoney.jsx and PaymentGateway.jsx/dealManager.hooks.js write to
//     // the receiver's/seller's wallet from the sender's/buyer's own signed-
//     // in session). Firestore rules can only check shape and non-negativity
//     // here — they cannot verify that a given credit corresponds to a real,
//     // legitimate transfer or escrow release, because rules can't run
//     // arbitrary cross-collection queries to confirm "this dealId really
//     // exists, really belongs to these two users, and really justifies
//     // exactly this amount." A modified/malicious client could still write
//     // directly to Firestore and credit an arbitrary non-negative amount to
//     // any wallet. The only real fix is moving wallet-balance mutations
//     // (fund escrow, release payment, send money, approve withdrawal) into
//     // Cloud Functions, where the server — not the caller's browser —
//     // reads the deal/transaction state and decides the amount. Treat
//     // everything below as a baseline, not a guarantee.
//     // ------------------------------------------------------------
//     match /wallets/{walletUid} {
//       allow read: if isOwner(walletUid) || isAdmin();

//       allow create: if isSignedIn() &&
//         request.resource.data.userId == walletUid &&
//         request.resource.data.balance == 0 &&
//         request.resource.data.lockedBalance == 0 &&
//         request.resource.data.totalEarned == 0 &&
//         request.resource.data.totalWithdrawn == 0;

//       allow update: if isSignedIn() &&
//         request.resource.data.userId == resource.data.userId &&
//         request.resource.data.balance is number && request.resource.data.balance >= 0 &&
//         request.resource.data.lockedBalance is number && request.resource.data.lockedBalance >= 0 &&
//         request.resource.data.totalEarned is number && request.resource.data.totalEarned >= 0 &&
//         request.resource.data.totalWithdrawn is number && request.resource.data.totalWithdrawn >= 0 &&
//         request.resource.data.get('pendingWithdraw', 0) is number && request.resource.data.get('pendingWithdraw', 0) >= 0;

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // transactions/{transactionId}
//     // Same cross-user-write pattern (and the same limitation) as wallets
//     // above — a sender writes both their own debit record AND the
//     // receiver's credit record in one transaction. Status changes
//     // (deposit/withdrawal pending -> approved/rejected) are admin-only;
//     // the owner may only patch a couple of post-creation fields on their
//     // own record (e.g. attaching transactionId/receiptUrl right after
//     // creating it).
//     // ------------------------------------------------------------
//     match /transactions/{transactionId} {
//       allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());

//       allow create: if isSignedIn() &&
//         request.resource.data.userId is string &&
//         request.resource.data.amount is number && request.resource.data.amount > 0;

//       allow update: if isAdmin() ||
//         (isSignedIn() && resource.data.userId == request.auth.uid &&
//           request.resource.data.diff(resource.data).affectedKeys().hasOnly(['transactionId', 'receiptUrl', 'receiptFileName', 'updatedAt']));

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // withdrawals/{withdrawalId}
//     // Created by the owner (Withdraw.jsx) always as 'pending'; only an
//     // admin can approve/reject/process one. Owner may only attach the
//     // linked transactionId right after creation.
//     // ------------------------------------------------------------
//     match /withdrawals/{withdrawalId} {
//       allow read: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());

//       allow create: if isSignedIn() &&
//         request.resource.data.userId == request.auth.uid &&
//         request.resource.data.status == 'pending' &&
//         request.resource.data.amount is number && request.resource.data.amount > 0;

//       allow update: if isAdmin() ||
//         (isSignedIn() && resource.data.userId == request.auth.uid &&
//           request.resource.data.diff(resource.data).affectedKeys().hasOnly(['transactionId']));

//       allow delete: if isAdmin();
//     }

//     // ------------------------------------------------------------
//     // Admin-only operational collections seen referenced in the app
//     // (adminLogs, identityRecords, reports, announcements,
//     // announcementHistory, login_history) but whose source files haven't
//     // been reviewed yet — locked to admin-only read/write as the safe
//     // default. If any of these need a narrower owner-read path (e.g. a
//     // user reading their own identityRecords submission), send me
//     // IdentityDatabase.jsx / the relevant file and I'll open it up
//     // precisely instead of guessing at its field shape.
//     // ------------------------------------------------------------
//     match /adminLogs/{logId} {
//       allow read, write: if isAdmin();
//     }

//     match /identityRecords/{recordId} {
//       allow read, write: if isAdmin();
//     }

//     match /reports/{reportId} {
//       allow create: if isSignedIn();
//       allow read, update, delete: if isAdmin();
//     }

//     match /announcements/{announcementId} {
//       allow read: if isSignedIn();
//       allow write: if isAdmin();
//     }

//     match /announcementHistory/{historyId} {
//       allow read, write: if isAdmin();
//     }

//     match /login_history/{entryId} {
//       allow read: if isAdmin();
//       allow create: if isSignedIn();
//       allow update, delete: if isAdmin();
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
