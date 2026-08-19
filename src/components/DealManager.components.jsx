// DealManager.components.jsx
// Every presentational (non-page) component merged into one file:
//   MilestoneRow, MilestoneList, DealBanners, DealHeader, DealInfoCard,
//   ModeSwitcher, DealsStats, DealsList.
// Markup/behavior unchanged from the original file — only pulled out of
// the giant render() and merged per your request.

import React from 'react';
import { MAX_EXTENSIONS } from '@/constants/dealManager.constants';
import { getMilestoneStatusBadge, getSubmitDeadlineText, getDealStatusBadge } from '@/utils/dealManager.utils';

// ============================================================
// ✅ formatDeadlineDisplay - ডেডলাইন ফরম্যাট (মিনিট/দিন)
// ============================================================
const formatDeadlineDisplay = (deadline) => {
  if (deadline === null || deadline === undefined) return '0';
  
  if (typeof deadline === 'number') {
    // ✅ ১ দিনের কম (মিনিটে)
    if (deadline < 1440) {
      if (deadline < 60) {
        return `${deadline} মিনিট`;
      }
      const hours = Math.floor(deadline / 60);
      const minutes = deadline % 60;
      if (minutes === 0) {
        return `${hours} ঘন্টা`;
      }
      return `${hours} ঘন্টা ${minutes} মিনিট`;
    }
    // ✅ ১ দিন বা তার বেশি
    const days = Math.ceil(deadline / 1440);
    const remainingMinutes = deadline % 1440;
    if (remainingMinutes === 0) {
      return `${days} দিন`;
    }
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    if (hours === 0) {
      return `${days} দিন ${minutes} মিনিট`;
    }
    return `${days} দিন ${hours} ঘন্টা`;
  }
  
  if (typeof deadline === 'string') return deadline;
  if (typeof deadline === 'object') {
    if (deadline.type === 'range') {
      const min = deadline.min || 0;
      const max = deadline.max || 0;
      return `${min}-${max}`;
    }
    const days = deadline.days || 0;
    return String(days);
  }
  return String(deadline);
};

// ============================================================
// MilestoneRow — one milestone line + its buyer/seller actions
// ============================================================
export const MilestoneRow = ({
  milestone,
  index,
  isActive,
  isBuyer,
  isSeller,
  navigate,
  dealId,
  releasingPayment,
  rejectingWork,
  submittingMilestone,
  openSubmitForm,
  setOpenSubmitForm,
  workDraft,
  setWorkDraft,
  onReleasePayment,
  onRejectWork,
  onSubmitWork,
}) => {
  const statusBadge = getMilestoneStatusBadge(milestone.status);
  const deadlineInfo = milestone.status === 'funded' ? getSubmitDeadlineText(milestone) : null;

  return (
    <div className={`milestone-row ${milestone.status}`}>
      <div className="m-info-block">
        <div className="m-number">{String(index + 1).padStart(2, '0')}</div>
        <div className="m-details">
          <h4>{milestone.title}</h4>
          <p className="m-amount">💰 Amount: {milestone.amount?.toLocaleString()} BDT</p>
          {milestone.status === 'funded' && milestone.workRejectReason && (
            <p style={{ fontSize: '12px', color: '#ef4444', margin: '4px 0 0' }}>
              <i className="fa-solid fa-triangle-exclamation"></i> পূর্বের সাবমিশন প্রত্যাখ্যাত হয়েছে: {milestone.workRejectReason}
            </p>
          )}
          {deadlineInfo && (
            <p style={{ fontSize: '12px', color: deadlineInfo.urgent ? '#ef4444' : '#f59e0b', margin: '4px 0 0' }}>
              {deadlineInfo.text}
            </p>
          )}
          {milestone.status === 'refunded' && (
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
              <i className="fa-solid fa-rotate-left"></i>{' '}
              {milestone.refundReason === 'seller_no_submission'
                ? 'সময়মতো কাজ জমা না দেওয়ায় অটো-রিফান্ড হয়েছে।'
                : 'Buyer-কে টাকা ফেরত দেওয়া হয়েছে।'}
            </p>
          )}
        </div>
      </div>

      <div className="m-status-side">
        <span className={`status-badge ${statusBadge.class}`}>{statusBadge.text}</span>

        {isActive && isBuyer && milestone.status === 'pending' && (
          <button className="btn-fund" onClick={() => navigate(`/payment/${dealId}/${milestone.id}`)}>
            <i className="fa-solid fa-credit-card"></i> Pay & Fund
          </button>
        )}

        {isActive && isBuyer && milestone.status === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            {(milestone.workProofLink || milestone.workProofNote) && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', textAlign: 'right', maxWidth: '260px' }}>
                {milestone.workProofLink && (
                  <div>
                    <a
                      href={milestone.workProofLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-primary, #14b8a6)' }}
                    >
                      <i className="fa-solid fa-link"></i> Proof Link দেখুন
                    </a>
                  </div>
                )}
                {milestone.workProofNote && <div style={{ marginTop: '2px' }}>📝 {milestone.workProofNote}</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-review-release" onClick={() => onReleasePayment(milestone.id)} disabled={releasingPayment === milestone.id}>
                {releasingPayment === milestone.id ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i> ...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check"></i> Accept & Release
                  </>
                )}
              </button>
              <button
                className="btn-reject-work"
                onClick={() => onRejectWork(milestone.id)}
                disabled={rejectingWork === milestone.id}
                style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer' }}
              >
                {rejectingWork === milestone.id ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i> ...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-times"></i> Reject
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {isActive && isSeller && milestone.status === 'funded' && (
          openSubmitForm === milestone.id ? (
            <div className="work-submit-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '240px' }}>
              <input
                type="text"
                placeholder="🔗 Proof link (স্ক্রিনশট/ফাইল/ড্রাইভ লিংক)"
                value={workDraft[milestone.id]?.link || ''}
                onChange={(e) => setWorkDraft((prev) => ({ ...prev, [milestone.id]: { ...prev[milestone.id], link: e.target.value } }))}
                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
              />
              <textarea
                placeholder="নোট (যেমন: বাকি ফাইল WhatsApp/Messenger-এ পাঠানো হয়েছে)"
                value={workDraft[milestone.id]?.note || ''}
                onChange={(e) => setWorkDraft((prev) => ({ ...prev, [milestone.id]: { ...prev[milestone.id], note: e.target.value } }))}
                rows={2}
                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'inherit', resize: 'vertical', fontSize: '13px' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-submit-work" onClick={() => onSubmitWork(milestone.id)} disabled={submittingMilestone === milestone.id}>
                  {submittingMilestone === milestone.id ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Submitting...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-paper-plane"></i> Submit
                    </>
                  )}
                </button>
                <button
                  onClick={() => setOpenSubmitForm(null)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--text-muted, #94a3b8)', cursor: 'pointer', fontSize: '13px' }}
                >
                  বাতিল
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-submit-work" onClick={() => setOpenSubmitForm(milestone.id)}>
              <i className="fa-solid fa-upload"></i> Submit Work
            </button>
          )
        )}

        {milestone.status === 'released' && (
          <span className="badge-completed">
            <i className="fa-solid fa-check-circle"></i> Payment Released
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================================
// MilestoneList — pending-offer banner + milestone rows + completed banner
// ============================================================
export const MilestoneList = ({
  selectedDeal,
  currentMode,
  currentUser,
  navigate,
  runWithGuide,
  handleConfirmDeal,
  handleCancelResponse,
  releasingPayment,
  rejectingWork,
  submittingMilestone,
  openSubmitForm,
  setOpenSubmitForm,
  workDraft,
  setWorkDraft,
  onReleasePayment,
  onRejectWork,
  onSubmitWork,
}) => {
  if (!selectedDeal?.milestones) return null;

  const isBuyer = currentMode === 'buyer';
  const isSeller = currentMode === 'seller';
  const isActive = selectedDeal.status === 'active' || selectedDeal.status === 'overdue';
  const isPending = selectedDeal.status === 'pending';
  const isCancelled = selectedDeal.status === 'cancelled';
  const postType = selectedDeal.postType || 'hire';

  if (isCancelled) {
    return (
      <div className="deal-cancelled-banner">
        <i className="fa-solid fa-ban"></i>
        <h4>Deal Cancelled</h4>
        <p>Cancelled on: {selectedDeal.cancelledAt ? new Date(selectedDeal.cancelledAt).toLocaleDateString() : 'N/A'}</p>
        <p>Reason: {selectedDeal.cancellationReason || 'No reason provided'}</p>
      </div>
    );
  }

  return (
    <div className="milestone-container">
      {isPending && (
        <div className="confirm-deal-banner">
          <p>
            <i className="fa-solid fa-gavel"></i> একটি অফার পাঠানো হয়েছে!
          </p>

          <div style={{ display: 'flex', gap: '10px' }}>
            {postType === 'service' && selectedDeal.sellerId === currentUser?.uid && (
              <>
                <button className="btn-confirm-deal" onClick={() => runWithGuide(handleConfirmDeal)}>
                  <i className="fa-solid fa-check-circle"></i> অফার গ্রহণ করুন
                </button>
                <button className="btn-cancel-deal" style={{ backgroundColor: '#ef4444', color: 'white' }} onClick={() => handleCancelResponse('reject')}>
                  <i className="fa-solid fa-times-circle"></i> অফার প্রত্যাখ্যান করুন
                </button>
              </>
            )}

            {postType === 'hire' && selectedDeal.buyerId === currentUser?.uid && (
              <>
                <button className="btn-confirm-deal" onClick={() => runWithGuide(handleConfirmDeal)}>
                  <i className="fa-solid fa-check-circle"></i> অফার গ্রহণ করুন
                </button>
                <button className="btn-cancel-deal" style={{ backgroundColor: '#ef4444', color: 'white' }} onClick={() => handleCancelResponse('reject')}>
                  <i className="fa-solid fa-times-circle"></i> অফার প্রত্যাখ্যান করুন
                </button>
              </>
            )}

            {!(
              (postType === 'service' && selectedDeal.sellerId === currentUser?.uid) ||
              (postType === 'hire' && selectedDeal.buyerId === currentUser?.uid)
            ) && (
              <span className="pending-message">⏳ {postType === 'service' ? 'সেলার' : 'বায়ার'} এর সিদ্ধান্তের জন্য অপেক্ষা করছেন...</span>
            )}
          </div>

          {selectedDeal.proposedAt && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '8px' }}>
              <i className="fa-solid fa-hourglass-half"></i> এই অফারটি ৪৮ ঘণ্টার মধ্যে গ্রহণ না করা হলে স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।
            </p>
          )}
        </div>
      )}

      {selectedDeal.milestones.map((milestone, index) => (
        <MilestoneRow
          key={milestone.id}
          milestone={milestone}
          index={index}
          isActive={isActive}
          isBuyer={isBuyer}
          isSeller={isSeller}
          navigate={navigate}
          dealId={selectedDeal.id}
          releasingPayment={releasingPayment}
          rejectingWork={rejectingWork}
          submittingMilestone={submittingMilestone}
          openSubmitForm={openSubmitForm}
          setOpenSubmitForm={setOpenSubmitForm}
          workDraft={workDraft}
          setWorkDraft={setWorkDraft}
          onReleasePayment={onReleasePayment}
          onRejectWork={onRejectWork}
          onSubmitWork={onSubmitWork}
        />
      ))}

      {selectedDeal.status === 'completed' && (
        <div className="deal-completed-banner">
          <i className="fa-solid fa-trophy"></i>
          <h4>Deal Completed!</h4>
          <p>All milestones have been completed and payments released.</p>
        </div>
      )}
    </div>
  );
};

// ============================================================
// DealBanners — dispute / overdue / extension / cancel banners
// ============================================================
export const DealBanners = ({
  selectedDeal,
  currentUser,
  currentMode,
  handleExtendDeadline,
  handleCancelDeal,
  handleOpenDispute,
  handleExtensionResponse,
  handleCancelResponse,
  setSelectedDeal,
}) => {
  return (
    <>
      {selectedDeal.disputeStatus === 'open' && (
        <div className="dispute-banner open">
          <i className="fa-solid fa-scale-balanced"></i>
          <div>
            <h4>⚖️ Dispute Under Admin Review</h4>
            <p>
              {selectedDeal.disputeRaisedBy === currentUser?.uid
                ? 'আপনি এই ডিলে Dispute ওপেন করেছেন।'
                : `${currentMode === 'buyer' ? 'Seller' : 'Buyer'} এই ডিলে Dispute ওপেন করেছেন।`}
            </p>
            <p className="extension-details">
              <strong>কারণ:</strong> {selectedDeal.disputeReason}
            </p>
            <p className="extension-hint">
              <i className="fa-solid fa-info-circle"></i> Admin সিদ্ধান্ত না দেওয়া পর্যন্ত Extend/Cancel বন্ধ থাকবে।
            </p>
          </div>
        </div>
      )}

      {selectedDeal.status === 'overdue' && selectedDeal.disputeStatus !== 'open' && (
        <div className="overdue-banner">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            <h4>🔴 এই ডিলটি Overdue!</h4>
            <p>ডেডলাইন এবং ২৪ ঘণ্টার Grace Period দুটোই পার হয়ে গেছে। এখন কী করতে চান?</p>
          </div>
          <div className="overdue-action-btns" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {selectedDeal.extensionRequestStatus !== 'pending' && (
              <button className="btn-agree" onClick={handleExtendDeadline}>
                <i className="fa-solid fa-clock"></i> Extend Deadline
              </button>
            )}
            {!selectedDeal.cancelRequestedBy && (
              <button className="btn-reject" onClick={handleCancelDeal}>
                <i className="fa-solid fa-ban"></i> Cancel Deal
              </button>
            )}
            <button className="btn-dispute" onClick={handleOpenDispute} style={{ backgroundColor: '#f59e0b', color: '#111' }}>
              <i className="fa-solid fa-scale-balanced"></i> Open Dispute
            </button>
          </div>
        </div>
      )}

      {selectedDeal.extensionRequestStatus === 'pending' && (
        <div className="extension-request-banner pending">
          <i className="fa-solid fa-clock"></i>
          <div>
            <h4>📅 Deadline Extension Request Pending</h4>
            <p>
              {selectedDeal.extensionRequestedBy === currentUser?.uid
                ? `⏳ Waiting for ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} to respond...`
                : `${selectedDeal.extensionRequestedByName || 'Someone'} has requested to extend the deadline by ${selectedDeal.extensionRequestDays || 0} days.`}
            </p>
            <p className="extension-details">
              <strong>Current Deadline:</strong> {formatDeadlineDisplay(selectedDeal.deadline)} &nbsp;|&nbsp;
              <strong>New Deadline:</strong> {formatDeadlineDisplay((selectedDeal.deadline || 0) + (selectedDeal.extensionRequestDays || 0))}
            </p>
          </div>
          {selectedDeal.extensionRequestedBy !== currentUser?.uid && (
            <div className="extension-response-btns">
              <button className="btn-agree" onClick={() => handleExtensionResponse('approve')}>
                <i className="fa-solid fa-check"></i> Approve
              </button>
              <button className="btn-reject" onClick={() => handleExtensionResponse('reject')}>
                <i className="fa-solid fa-times"></i> Reject
              </button>
            </div>
          )}
          {selectedDeal.extensionRequestedBy === currentUser?.uid && (
            <span className="pending-waiting">
              <i className="fa-solid fa-hourglass-half"></i> Waiting for response...
            </span>
          )}
        </div>
      )}

      {selectedDeal.extensionRequestStatus === 'approved' && (
        <div className="extension-request-banner approved">
          <i className="fa-solid fa-check-circle"></i>
          <div>
            <h4>✅ Deadline Extended!</h4>
            <p>
              Deadline has been extended by {selectedDeal.extensionRequestDays || 0} days.
              <br />
              <strong>New Deadline:</strong> {formatDeadlineDisplay(selectedDeal.deadline)}
              <br />
              <strong>Extensions used:</strong> {selectedDeal.extensionCount || 0}/{MAX_EXTENSIONS}
            </p>
          </div>
        </div>
      )}

      {selectedDeal.extensionRequestStatus === 'rejected' && (
        <div className="extension-request-banner rejected">
          <i className="fa-solid fa-times-circle"></i>
          <div>
            <h4>❌ Extension Request Rejected</h4>
            <p>
              The extension request was rejected by the other party.
              <br />
              <strong>Current Deadline:</strong> {formatDeadlineDisplay(selectedDeal.deadline)}
            </p>
            <button
              className="btn-dismiss"
              onClick={() => {
                setSelectedDeal((prev) => ({ ...prev, extensionRequestStatus: null }));
              }}
            >
              <i className="fa-solid fa-times"></i> Dismiss
            </button>
          </div>
        </div>
      )}

      {selectedDeal.cancelRequestStatus === 'pending' && (
        <div className="cancel-request-banner pending">
          <i className="fa-solid fa-clock"></i>
          <div>
            <h4>Cancellation Request Pending</h4>
            <p>
              {selectedDeal.cancelRequestedBy === currentUser?.uid
                ? `Waiting for ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} to respond...`
                : `The ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} has requested to cancel this deal.`}
            </p>
            <p className="cancel-reason">
              <strong>Reason:</strong> {selectedDeal.cancelReason || 'No reason provided'}
            </p>
          </div>
          {selectedDeal.cancelRequestedBy !== currentUser?.uid && (
            <div className="cancel-response-btns">
              <button className="btn-agree" onClick={() => handleCancelResponse('approve')}>
                <i className="fa-solid fa-check"></i> Agree to Cancel
              </button>
              <button className="btn-reject" onClick={() => handleCancelResponse('reject')}>
                <i className="fa-solid fa-times"></i> Reject
              </button>
            </div>
          )}
        </div>
      )}

      {selectedDeal.status === 'active' && selectedDeal.disputeStatus !== 'open' && selectedDeal.extensionRequestStatus !== 'pending' && (
        <div className="extend-deadline-section">
          <button className="btn-extend-deadline" onClick={handleExtendDeadline} disabled={(selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS}>
            <i className="fa-solid fa-clock"></i>
            {(selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS ? '🚫 Extension Limit Reached' : 'Request Deadline Extension'}
          </button>
          <p className="extension-hint">
            <i className="fa-solid fa-info-circle"></i>
            Your request must be approved by the other party. &nbsp;({selectedDeal.extensionCount || 0}/{MAX_EXTENSIONS} used)
          </p>
        </div>
      )}
    </>
  );
};

// ============================================================
// DealHeader + DealInfoCard
// ============================================================
export const DealHeader = ({ selectedDeal, currentMode, timeRemaining, navigate, feedback }) => (
  <div className="dash-header">
    <div className="project-meta">
      <button className="back-to-list" onClick={() => navigate('/deal-manager')}>
        <i className="fa-solid fa-arrow-left"></i> Back
      </button>

      <div className="deal-title-section">
        <h2>{selectedDeal.postTitle || 'Deal Dashboard'}</h2>

        <div className="deal-partner-info">
          <span className="partner-label">{currentMode === 'buyer' ? '🤝 Seller' : '🤝 Buyer'}:</span>
          <span className="partner-name">
            {currentMode === 'buyer'
              ? selectedDeal.sellerName || selectedDeal.sellerDisplayName || 'Unknown Seller'
              : selectedDeal.buyerName || selectedDeal.buyerDisplayName || 'Unknown Buyer'}
          </span>
        </div>

        <div className="deal-id-display">
          <span className="deal-id-label">Deal ID:</span>
          <span className="deal-id-number">#{selectedDeal.dealIdNumber || selectedDeal.id?.slice(-8)}</span>
          <button
            className="copy-id-btn"
            onClick={() => {
              navigator.clipboard.writeText(selectedDeal.dealIdNumber || selectedDeal.id);
              feedback.alert.success({ message: '✅ Deal ID copied!' });
            }}
          >
            <i className="fa-regular fa-copy"></i>
          </button>
        </div>
      </div>

      <span className={`mode-badge ${selectedDeal.status}`}>{getDealStatusBadge(selectedDeal.status).text}</span>
      {(selectedDeal.status === 'active' || selectedDeal.status === 'overdue') && timeRemaining[selectedDeal.id] && (
        <span className="timer-badge">
          <i className="fa-solid fa-clock"></i> {timeRemaining[selectedDeal.id]}
        </span>
      )}
    </div>
  </div>
);

// ============================================================
// ✅ DealInfoCard - আপডেটেড (formatDeadlineDisplay ব্যবহার)
// ============================================================
export const DealInfoCard = ({ selectedDeal, currentMode, timeRemaining }) => (
  <div className="deal-info-card">
    <div className="deal-info-row">
      <span>
        <i className="fa-solid fa-hashtag"></i> Deal ID:
      </span>
      <strong className="deal-id-highlight">#{selectedDeal.dealIdNumber || selectedDeal.id?.slice(-8)}</strong>
    </div>

    <div className="deal-info-row partner-row">
      <span>
        <i className="fa-solid fa-user"></i> {currentMode === 'buyer' ? 'Seller' : 'Buyer'}:
      </span>
      <strong>
        {currentMode === 'buyer'
          ? selectedDeal.sellerName || selectedDeal.sellerDisplayName || 'Unknown Seller'
          : selectedDeal.buyerName || selectedDeal.buyerDisplayName || 'Unknown Buyer'}
      </strong>
    </div>

    <div className="deal-info-row">
      <span>
        <i className="fa-solid fa-wallet"></i> Total Budget:
      </span>
      <strong>{selectedDeal.budget?.toLocaleString()} BDT</strong>
    </div>
    
    {/* ✅ আপডেটেড: Deadline এখন formatDeadlineDisplay ব্যবহার করে */}
    <div className="deal-info-row">
      <span>
        <i className="fa-regular fa-calendar"></i> Deadline:
      </span>
      <strong>{formatDeadlineDisplay(selectedDeal.deadline)}</strong>
    </div>
    
    {(selectedDeal.status === 'active' || selectedDeal.status === 'overdue') && (
      <div className="deal-info-row">
        <span>
          <i className="fa-solid fa-clock"></i> Time Remaining:
        </span>
        <strong className="timer-display">{timeRemaining[selectedDeal.id] || 'Calculating...'}</strong>
      </div>
    )}
    <div className="deal-info-row">
      <span>
        <i className="fa-solid fa-file-lines"></i> Details:
      </span>
      <p>{selectedDeal.details || 'No details provided'}</p>
    </div>
  </div>
);

// ============================================================
// ModeSwitcher + DealsStats + DealsList
// ============================================================
export const ModeSwitcher = ({ currentMode, handleModeChange, pendingCount, showCancelledDeals, setShowCancelledDeals, cancelledCount }) => (
  <div className="deal-mode-switcher">
    <button className={`mode-switch-button ${currentMode === 'buyer' ? 'active' : ''}`} onClick={() => handleModeChange('buyer')}>
      <i className="fa-solid fa-briefcase"></i> Buyer Mode
      {pendingCount > 0 && currentMode === 'buyer' && <span className="mode-badge-count">{pendingCount}</span>}
    </button>
    <button className={`mode-switch-button ${currentMode === 'seller' ? 'active' : ''}`} onClick={() => handleModeChange('seller')}>
      <i className="fa-solid fa-laptop-code"></i> Seller Mode
      {pendingCount > 0 && currentMode === 'seller' && <span className="mode-badge-count">{pendingCount}</span>}
    </button>

    <button
      className={`mode-switch-button ${showCancelledDeals ? 'active cancelled-active' : 'cancelled-btn'}`}
      onClick={() => setShowCancelledDeals(!showCancelledDeals)}
    >
      <i className="fa-solid fa-ban"></i> Cancelled ({cancelledCount})
    </button>
  </div>
);

export const DealsStats = ({ totalDeals, pendingCount, activeCount, overdueCount, completedCount, cancelledCount }) => (
  <div className="deals-stats">
    <span className="stat-items total">📊 Total: {totalDeals}</span>
    <span className="stat-items pending">⏳ Pending: {pendingCount}</span>
    <span className="stat-items active">⚡ Active: {activeCount}</span>
    <span className="stat-items overdue">🔴 Overdue: {overdueCount}</span>
    <span className="stat-items completed">✅ Completed: {completedCount}</span>
    <span className="stat-items cancelled">❌ Cancelled: {cancelledCount}</span>
  </div>
);

export const DealsList = ({ showCancelledDeals, cancelledDeals, activeDeals, currentMode, navigate, timeRemaining }) => (
  <div className="deals-list">
    {showCancelledDeals ? (
      cancelledDeals.length === 0 ? (
        <div className="no-deal-selected">
          <i className="fa-solid fa-check-circle"></i>
          <p>No cancelled deals</p>
        </div>
      ) : (
        cancelledDeals.map((deal) => (
          <div key={deal.id} className="deal-list-item cancelled" onClick={() => navigate(`/deal-manager?dealId=${deal.id}`)}>
            <div className="deal-list-info">
              <h4>
                {deal.postTitle || 'Untitled Deal'}
                <span className="deal-id-badge">#{deal.dealIdNumber || deal.id?.slice(-8)}</span>
              </h4>
              <p className="deal-partner cancelled">
                <i className="fa-solid fa-user"></i>
                {currentMode === 'buyer' ? 'Seller' : 'Buyer'}:{' '}
                <strong>
                  {currentMode === 'buyer' ? deal.sellerName || deal.sellerDisplayName || 'Unknown Seller' : deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer'}
                </strong>
              </p>
              <p>
                <i className="fa-solid fa-ban" style={{ color: '#ef4444' }}></i>
                {deal.cancellationReason || 'No reason provided'}
              </p>
              <p className="deal-cancelled-date">
                <i className="fa-regular fa-calendar"></i>
                {deal.cancelledAt ? new Date(deal.cancelledAt).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
            <div className="deal-list-status">
              <span className="status-badge cancelled">❌ Cancelled</span>
            </div>
          </div>
        ))
      )
    ) : activeDeals.length === 0 ? (
      <div className="no-deal-selected">
        <i className="fa-solid fa-folder-open"></i>
        <p>You don't have any {currentMode === 'buyer' ? 'buyer' : 'seller'} deals yet.</p>
      </div>
    ) : (
      activeDeals.map((deal) => (
        <div key={deal.id} className="deal-list-item" onClick={() => navigate(`/deal-manager?dealId=${deal.id}`)}>
          <div className="deal-list-info">
            <h4>
              {deal.postTitle || 'Untitled Deal'}
              <span className="deal-id-badge">#{deal.dealIdNumber || deal.id?.slice(-8)}</span>
            </h4>
            <p className="deal-partner">
              <i className="fa-solid fa-user"></i>
              {currentMode === 'buyer' ? 'Seller' : 'Buyer'}:{' '}
              <strong>
                {currentMode === 'buyer' ? deal.sellerName || deal.sellerDisplayName || 'Unknown Seller' : deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer'}
              </strong>
            </p>
            <p>Budget: {deal.budget?.toLocaleString()} BDT</p>
            {(deal.status === 'active' || deal.status === 'overdue') && timeRemaining[deal.id] && (
              <p className="deal-timer">
                <i className="fa-solid fa-clock"></i> {timeRemaining[deal.id]}
              </p>
            )}
          </div>
          <div className="deal-list-status">
            <span className={`status-badge ${deal.status}`}>
              {deal.status === 'pending' && '⏳ Pending'}
              {deal.status === 'active' && '⚡ Active'}
              {deal.status === 'overdue' && '🔴 Overdue'}
              {deal.status === 'completed' && '✅ Completed'}
            </span>
          </div>
        </div>
      ))
    )}
  </div>
);