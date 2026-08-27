// DealManager.components.jsx
// Every presentational (non-page) component merged into one file:
//   MilestoneRow, MilestoneList, DealBanners, DealHeader, DealInfoCard,
//   ModeSwitcher, DealsStats, DealsList.

import React from 'react';
import { MAX_EXTENSIONS, formatDeadlineDisplay } from '@/constants/dealManager.constants';
import { getMilestoneStatusBadge, getSubmitDeadlineText, getDealStatusBadge } from '@/utils/dealManager.utils';
import styles from './DealManager.module.css';

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
    <div className={`${styles.milestoneRow} ${styles[milestone.status]}`}>
      <div className={styles.mInfoBlock}>
        <div className={styles.mNumber}>{String(index + 1).padStart(2, '0')}</div>
        <div className={styles.mDetails}>
          <h4>{milestone.title}</h4>
          <p className={styles.mAmount}>💰 Amount: {milestone.amount?.toLocaleString()} BDT</p>
          {milestone.status === 'funded' && milestone.workRejectReason && (
            <p className={styles.mRejectReason}>
              <i className="fa-solid fa-triangle-exclamation"></i> পূর্বের সাবমিশন প্রত্যাখ্যাত হয়েছে: {milestone.workRejectReason}
            </p>
          )}
          {deadlineInfo && <p className={`${styles.mDeadline} ${deadlineInfo.urgent ? styles.urgent : ''}`}>{deadlineInfo.text}</p>}
          {milestone.status === 'refunded' && (
            <p className={styles.mRefundInfo}>
              <i className="fa-solid fa-rotate-left"></i>{' '}
              {milestone.refundReason === 'seller_no_submission' ? 'সময়মতো কাজ জমা না দেওয়ায় অটো-রিফান্ড হয়েছে।' : 'Buyer-কে টাকা ফেরত দেওয়া হয়েছে।'}
            </p>
          )}
        </div>
      </div>

      <div className={styles.mStatusSide}>
        <span className={`${styles.statusBadge} ${styles[statusBadge.class]}`}>{statusBadge.text}</span>

        {isActive && isBuyer && milestone.status === 'pending' && (
          <button className={styles.btnFund} onClick={() => navigate(`/payment/${dealId}/${milestone.id}`)}>
            <i className="fa-solid fa-credit-card"></i> Pay & Fund
          </button>
        )}

        {isActive && isBuyer && milestone.status === 'review' && (
          <div className={styles.mReviewActions}>
            {(milestone.workProofLink || milestone.workProofNote) && (
              <div className={styles.mProofInfo}>
                {milestone.workProofLink && (
                  <div>
                    <a href={milestone.workProofLink} target="_blank" rel="noopener noreferrer" className={styles.mProofLink}>
                      <i className="fa-solid fa-link"></i> Proof Link দেখুন
                    </a>
                  </div>
                )}
                {milestone.workProofNote && <div className={styles.mProofNote}>📝 {milestone.workProofNote}</div>}
              </div>
            )}
            <div className={styles.mReviewButtons}>
              <button 
                className={styles.btnReviewRelease} 
                onClick={() => onReleasePayment(milestone.id)} 
                disabled={releasingPayment === milestone.id}
              >
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
                className={styles.btnRejectWork}
                onClick={() => onRejectWork(milestone.id)}
                disabled={rejectingWork === milestone.id}
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
            <div className={styles.workSubmitForm}>
              <input
                type="text"
                placeholder="🔗 Proof link (স্ক্রিনশট/ফাইল/ড্রাইভ লিংক)"
                value={workDraft[milestone.id]?.link || ''}
                onChange={(e) => setWorkDraft((prev) => ({ ...prev, [milestone.id]: { ...prev[milestone.id], link: e.target.value } }))}
                className={styles.workSubmitInput}
              />
              <textarea
                placeholder="নোট (যেমন: বাকি ফাইল WhatsApp/Messenger-এ পাঠানো হয়েছে)"
                value={workDraft[milestone.id]?.note || ''}
                onChange={(e) => setWorkDraft((prev) => ({ ...prev, [milestone.id]: { ...prev[milestone.id], note: e.target.value } }))}
                rows={2}
                className={styles.workSubmitTextarea}
              />
              <div className={styles.workSubmitButtons}>
                <button 
                  className={styles.btnSubmitWork} 
                  onClick={() => onSubmitWork(milestone.id)} 
                  disabled={submittingMilestone === milestone.id}
                >
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
                  className={styles.btnCancelSubmit}
                  onClick={() => setOpenSubmitForm(null)}
                >
                  বাতিল
                </button>
              </div>
            </div>
          ) : (
            <button className={styles.btnSubmitWork} onClick={() => setOpenSubmitForm(milestone.id)}>
              <i className="fa-solid fa-upload"></i> Submit Work
            </button>
          )
        )}

        {milestone.status === 'released' && (
          <span className={styles.badgeCompleted}>
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
      <div className={styles.dealCancelledBanner}>
        <i className="fa-solid fa-ban"></i>
        <h4>Deal Cancelled</h4>
        <p>Cancelled on: {selectedDeal.cancelledAt ? new Date(selectedDeal.cancelledAt).toLocaleDateString() : 'N/A'}</p>
        <p>Reason: {selectedDeal.cancellationReason || 'No reason provided'}</p>
      </div>
    );
  }

  return (
    <div className={styles.milestoneContainer}>
      {isPending && (
        <div className={styles.confirmDealBanner}>
          <p>
            <i className="fa-solid fa-gavel"></i> একটি অফার পাঠানো হয়েছে!
          </p>

          <div className={styles.confirmDealButtons}>
            {postType === 'service' && selectedDeal.sellerId === currentUser?.uid && (
              <>
                <button className={styles.btnConfirmDeal} onClick={() => runWithGuide(handleConfirmDeal)}>
                  <i className="fa-solid fa-check-circle"></i> অফার গ্রহণ করুন
                </button>
                <button className={styles.btnCancelDeal} onClick={() => handleCancelResponse('reject')}>
                  <i className="fa-solid fa-times-circle"></i> অফার প্রত্যাখ্যান করুন
                </button>
              </>
            )}

            {postType === 'hire' && selectedDeal.buyerId === currentUser?.uid && (
              <>
                <button className={styles.btnConfirmDeal} onClick={() => runWithGuide(handleConfirmDeal)}>
                  <i className="fa-solid fa-check-circle"></i> অফার গ্রহণ করুন
                </button>
                <button className={styles.btnCancelDeal} onClick={() => handleCancelResponse('reject')}>
                  <i className="fa-solid fa-times-circle"></i> অফার প্রত্যাখ্যান করুন
                </button>
              </>
            )}

            {!((postType === 'service' && selectedDeal.sellerId === currentUser?.uid) || (postType === 'hire' && selectedDeal.buyerId === currentUser?.uid)) && (
              <span className={styles.pendingMessage}>⏳ {postType === 'service' ? 'সেলার' : 'বায়ার'} এর সিদ্ধান্তের জন্য অপেক্ষা করছেন...</span>
            )}
          </div>

          {selectedDeal.proposedAt && (
            <p className={styles.pendingTimeout}>
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
        <div className={styles.dealCompletedBanner}>
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
export const DealBanners = ({ selectedDeal, currentUser, currentMode, handleExtendDeadline, handleCancelDeal, handleOpenDispute, handleExtensionResponse, handleCancelResponse, setSelectedDeal }) => {
  return (
    <>
      {selectedDeal.disputeStatus === 'open' && (
        <div className={`${styles.disputeBanner} ${styles.open}`}>
          <i className="fa-solid fa-scale-balanced"></i>
          <div>
            <h4>⚖️ Dispute Under Admin Review</h4>
            <p>{selectedDeal.disputeRaisedBy === currentUser?.uid ? 'আপনি এই ডিলে Dispute ওপেন করেছেন।' : `${currentMode === 'buyer' ? 'Seller' : 'Buyer'} এই ডিলে Dispute ওপেন করেছেন।`}</p>
            <p className={styles.extensionDetails}>
              <strong>কারণ:</strong> {selectedDeal.disputeReason}
            </p>
            <p className={styles.extensionHint}>
              <i className="fa-solid fa-info-circle"></i> Admin সিদ্ধান্ত না দেওয়া পর্যন্ত Extend/Cancel বন্ধ থাকবে।
            </p>
          </div>
        </div>
      )}

      {selectedDeal.status === 'overdue' && selectedDeal.disputeStatus !== 'open' && (
        <div className={styles.overdueBanner}>
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            <h4>🔴 এই ডিলটি Overdue!</h4>
            <p>ডেডলাইন এবং ২৪ ঘণ্টার Grace Period দুটোই পার হয়ে গেছে। এখন কী করতে চান?</p>
          </div>
          <div className={styles.overdueActionBtns}>
            {selectedDeal.extensionRequestStatus !== 'pending' && (
              <button className={styles.btnAgree} onClick={handleExtendDeadline}>
                <i className="fa-solid fa-clock"></i> Extend Deadline
              </button>
            )}
            {!selectedDeal.cancelRequestedBy && (
              <button className={styles.btnReject} onClick={handleCancelDeal}>
                <i className="fa-solid fa-ban"></i> Cancel Deal
              </button>
            )}
            <button className={styles.btnDispute} onClick={handleOpenDispute}>
              <i className="fa-solid fa-scale-balanced"></i> Open Dispute
            </button>
          </div>
        </div>
      )}

      {selectedDeal.extensionRequestStatus === 'pending' && (
        <div className={`${styles.extensionRequestBanner} ${styles.pending}`}>
          <i className="fa-solid fa-clock"></i>
          <div>
            <h4>📅 Deadline Extension Request Pending</h4>
            <p>
              {selectedDeal.extensionRequestedBy === currentUser?.uid
                ? `⏳ Waiting for ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} to respond...`
                : `${selectedDeal.extensionRequestedByName || 'Someone'} has requested to extend the deadline by ${selectedDeal.extensionRequestDays || 0} days.`}
            </p>
            <p className={styles.extensionDetails}>
              <strong>Current Deadline:</strong> {formatDeadlineDisplay(selectedDeal.deadline)} &nbsp;|&nbsp;
              <strong>New Deadline:</strong> {formatDeadlineDisplay((selectedDeal.deadline || 0) + (selectedDeal.extensionRequestDays || 0))}
            </p>
          </div>
          {selectedDeal.extensionRequestedBy !== currentUser?.uid && (
            <div className={styles.extensionResponseBtns}>
              <button className={styles.btnAgree} onClick={() => handleExtensionResponse('approve')}>
                <i className="fa-solid fa-check"></i> Approve
              </button>
              <button className={styles.btnReject} onClick={() => handleExtensionResponse('reject')}>
                <i className="fa-solid fa-times"></i> Reject
              </button>
            </div>
          )}
          {selectedDeal.extensionRequestedBy === currentUser?.uid && (
            <span className={styles.pendingWaiting}>
              <i className="fa-solid fa-hourglass-half"></i> Waiting for response...
            </span>
          )}
        </div>
      )}

      {selectedDeal.extensionRequestStatus === 'approved' && (
        <div className={`${styles.extensionRequestBanner} ${styles.approved}`}>
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
        <div className={`${styles.extensionRequestBanner} ${styles.rejected}`}>
          <i className="fa-solid fa-times-circle"></i>
          <div>
            <h4>❌ Extension Request Rejected</h4>
            <p>
              The extension request was rejected by the other party.
              <br />
              <strong>Current Deadline:</strong> {formatDeadlineDisplay(selectedDeal.deadline)}
            </p>
            <button
              className={styles.btnDismiss}
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
        <div className={`${styles.cancelRequestBanner} ${styles.pending}`}>
          <i className="fa-solid fa-clock"></i>
          <div>
            <h4>Cancellation Request Pending</h4>
            <p>
              {selectedDeal.cancelRequestedBy === currentUser?.uid
                ? `Waiting for ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} to respond...`
                : `The ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} has requested to cancel this deal.`}
            </p>
            <p className={styles.cancelReason}>
              <strong>Reason:</strong> {selectedDeal.cancelReason || 'No reason provided'}
            </p>
          </div>
          {selectedDeal.cancelRequestedBy !== currentUser?.uid && (
            <div className={styles.cancelResponseBtns}>
              <button className={styles.btnAgree} onClick={() => handleCancelResponse('approve')}>
                <i className="fa-solid fa-check"></i> Agree to Cancel
              </button>
              <button className={styles.btnReject} onClick={() => handleCancelResponse('reject')}>
                <i className="fa-solid fa-times"></i> Reject
              </button>
            </div>
          )}
        </div>
      )}

      {selectedDeal.status === 'active' && selectedDeal.disputeStatus !== 'open' && selectedDeal.extensionRequestStatus !== 'pending' && (
        <div className={styles.extendDeadlineSection}>
          <button className={styles.btnExtendDeadline} onClick={handleExtendDeadline} disabled={(selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS}>
            <i className="fa-solid fa-clock"></i>
            {(selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS ? '🚫 Extension Limit Reached' : 'Request Deadline Extension'}
          </button>
          <p className={styles.extensionHint}>
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
  <div className={styles.dashHeader}>
    <div className={styles.projectMeta}>
      <button className={styles.backToList} onClick={() => navigate('/deal-manager')}>
        <i className="fa-solid fa-arrow-left"></i> Back
      </button>

      <div className={styles.dealTitleSection}>
        <h2>{selectedDeal.postTitle || 'Deal Dashboard'}</h2>

        <div className={styles.dealPartnerInfo}>
          <span className={styles.partnerLabel}>{currentMode === 'buyer' ? '🤝 Seller' : '🤝 Buyer'}:</span>
          <span className={styles.partnerName}>
            {currentMode === 'buyer' ? selectedDeal.sellerName || selectedDeal.sellerDisplayName || 'Unknown Seller' : selectedDeal.buyerName || selectedDeal.buyerDisplayName || 'Unknown Buyer'}
          </span>
        </div>

        <div className={styles.dealIdDisplay}>
          <span className={styles.dealIdLabel}>Deal ID:</span>
          <span className={styles.dealIdNumber}>#{selectedDeal.dealIdNumber || selectedDeal.id?.slice(-8)}</span>
          <button
            className={styles.copyIdBtn}
            onClick={() => {
              navigator.clipboard.writeText(selectedDeal.dealIdNumber || selectedDeal.id);
              feedback.alert.success({ message: '✅ Deal ID copied!' });
            }}
          >
            <i className="fa-regular fa-copy"></i>
          </button>
        </div>
      </div>

      <span className={`${styles.modeBadge} ${styles[selectedDeal.status]}`}>{getDealStatusBadge(selectedDeal.status).text}</span>
      {(selectedDeal.status === 'active' || selectedDeal.status === 'overdue') && timeRemaining[selectedDeal.id] && (
        <span className={styles.timerBadge}>
          <i className="fa-solid fa-clock"></i> {timeRemaining[selectedDeal.id]}
        </span>
      )}
    </div>
  </div>
);

// ============================================================
// DealInfoCard
// ============================================================
export const DealInfoCard = ({ selectedDeal, currentMode, timeRemaining }) => (
  <div className={styles.dealInfoCard}>
    <div className={styles.dealInfoRow}>
      <span>
        <i className="fa-solid fa-hashtag"></i> Deal ID:
      </span>
      <strong className={styles.dealIdHighlight}>#{selectedDeal.dealIdNumber || selectedDeal.id?.slice(-8)}</strong>
    </div>

    <div className={`${styles.dealInfoRow} ${styles.partnerRow}`}>
      <span>
        <i className="fa-solid fa-user"></i> {currentMode === 'buyer' ? 'Seller' : 'Buyer'}:
      </span>
      <strong>{currentMode === 'buyer' ? selectedDeal.sellerName || selectedDeal.sellerDisplayName || 'Unknown Seller' : selectedDeal.buyerName || selectedDeal.buyerDisplayName || 'Unknown Buyer'}</strong>
    </div>

    <div className={styles.dealInfoRow}>
      <span>
        <i className="fa-solid fa-wallet"></i> Total Budget:
      </span>
      <strong>{selectedDeal.budget?.toLocaleString()} BDT</strong>
    </div>

    <div className={styles.dealInfoRow}>
      <span>
        <i className="fa-regular fa-calendar"></i> Deadline:
      </span>
      <strong>{formatDeadlineDisplay(selectedDeal.deadline)}</strong>
    </div>

    {(selectedDeal.status === 'active' || selectedDeal.status === 'overdue') && (
      <div className={styles.dealInfoRow}>
        <span>
          <i className="fa-solid fa-clock"></i> Time Remaining:
        </span>
        <strong className={styles.timerDisplay}>{timeRemaining[selectedDeal.id] || 'Calculating...'}</strong>
      </div>
    )}
    <div className={styles.dealInfoRow}>
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
  <div className={styles.dealModeSwitcher}>
    <button className={`${styles.modeSwitchButton} ${currentMode === 'buyer' ? styles.active : ''}`} onClick={() => handleModeChange('buyer')}>
      <i className="fa-solid fa-briefcase"></i> Buyer Mode
      {pendingCount > 0 && currentMode === 'buyer' && <span className={styles.modeBadgeCount}>{pendingCount}</span>}
    </button>
    <button className={`${styles.modeSwitchButton} ${currentMode === 'seller' ? styles.active : ''}`} onClick={() => handleModeChange('seller')}>
      <i className="fa-solid fa-laptop-code"></i> Seller Mode
      {pendingCount > 0 && currentMode === 'seller' && <span className={styles.modeBadgeCount}>{pendingCount}</span>}
    </button>

    <button className={`${styles.modeSwitchButton} ${showCancelledDeals ? styles.active : styles.cancelledBtn}`} onClick={() => setShowCancelledDeals(!showCancelledDeals)}>
      <i className="fa-solid fa-ban"></i> Cancelled ({cancelledCount})
    </button>
  </div>
);

export const DealsStats = ({ totalDeals, pendingCount, activeCount, overdueCount, completedCount, cancelledCount }) => (
  <div className={styles.dealsStats}>
    <span className={`${styles.statItems} ${styles.total}`}>📊 Total: {totalDeals}</span>
    <span className={`${styles.statItems} ${styles.pending}`}>⏳ Pending: {pendingCount}</span>
    <span className={`${styles.statItems} ${styles.active}`}>⚡ Active: {activeCount}</span>
    <span className={`${styles.statItems} ${styles.overdue}`}>🔴 Overdue: {overdueCount}</span>
    <span className={`${styles.statItems} ${styles.completed}`}>✅ Completed: {completedCount}</span>
    <span className={`${styles.statItems} ${styles.cancelled}`}>❌ Cancelled: {cancelledCount}</span>
  </div>
);

export const DealsList = ({ showCancelledDeals, cancelledDeals, activeDeals, currentMode, navigate, timeRemaining }) => (
  <div className={styles.dealsList}>
    {showCancelledDeals ? (
      cancelledDeals.length === 0 ? (
        <div className={styles.noDealSelected}>
          <i className="fa-solid fa-check-circle"></i>
          <p>No cancelled deals</p>
        </div>
      ) : (
        cancelledDeals.map((deal) => (
          <div key={deal.id} className={`${styles.dealListItem} ${styles.cancelled}`} onClick={() => navigate(`/deal-manager?dealId=${deal.id}`)}>
            <div className={styles.dealListInfo}>
              <h4>
                {deal.postTitle || 'Untitled Deal'}
                <span className={styles.dealIdBadge}>#{deal.dealIdNumber || deal.id?.slice(-8)}</span>
              </h4>
              <p className={styles.dealPartnerCancelled}>
                <i className="fa-solid fa-user"></i>
                {currentMode === 'buyer' ? 'Seller' : 'Buyer'}: <strong>{currentMode === 'buyer' ? deal.sellerName || deal.sellerDisplayName || 'Unknown Seller' : deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer'}</strong>
              </p>
              <p>
                <i className="fa-solid fa-ban" style={{ color: '#ef4444' }}></i>
                {deal.cancellationReason || 'No reason provided'}
              </p>
              <p className={styles.dealCancelledDate}>
                <i className="fa-regular fa-calendar"></i>
                {deal.cancelledAt ? new Date(deal.cancelledAt).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
            <div className={styles.dealListStatus}>
              <span className={`${styles.statusBadge} ${styles.cancelled}`}>❌ Cancelled</span>
            </div>
          </div>
        ))
      )
    ) : activeDeals.length === 0 ? (
      <div className={styles.noDealSelected}>
        <i className="fa-solid fa-folder-open"></i>
        <p>You don't have any {currentMode === 'buyer' ? 'buyer' : 'seller'} deals yet.</p>
      </div>
    ) : (
      activeDeals.map((deal) => (
        <div key={deal.id} className={styles.dealListItem} onClick={() => navigate(`/deal-manager?dealId=${deal.id}`)}>
          <div className={styles.dealListInfo}>
            <h4>
              {deal.postTitle || 'Untitled Deal'}
              <span className={styles.dealIdBadge}>#{deal.dealIdNumber || deal.id?.slice(-8)}</span>
            </h4>
            <p className={styles.dealPartner}>
              <i className="fa-solid fa-user"></i>
              {currentMode === 'buyer' ? 'Seller' : 'Buyer'}: <strong>{currentMode === 'buyer' ? deal.sellerName || deal.sellerDisplayName || 'Unknown Seller' : deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer'}</strong>
            </p>
            <p>Budget: {deal.budget?.toLocaleString()} BDT</p>
            {(deal.status === 'active' || deal.status === 'overdue') && timeRemaining[deal.id] && (
              <p className={styles.dealTimer}>
                <i className="fa-solid fa-clock"></i> {timeRemaining[deal.id]}
              </p>
            )}
          </div>
          <div className={styles.dealListStatus}>
            <span className={`${styles.statusBadge} ${styles[deal.status]}`}>
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