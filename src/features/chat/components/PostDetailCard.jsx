import React from 'react';
import styles from './PostDetailCard.module.css';

export const PostDetailCard = ({
  postData, onViewPost, canSendOffer, onSendOffer,
  canApproveDeal, onApproveDeal, onRejectDeal, onReopenDeal,
  existingDeal, getPendingBadgeText
}) => {
  const {
    title,
    fullTitle,
    description,
    fullDescription,
    image,
    budget,
    deadline,
    budgetDisplay,
    deadlineDisplay
  } = postData || {};

  return (
    <div className={styles.card}>
      <div className={styles.inner}>
        {image && (
          <img
            src={image}
            alt="Post"
            className={styles.image}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/images/placeholder-image.jpg';
            }}
          />
        )}

        <div className={styles.info}>
          <div className={styles.title} title={fullTitle || title || 'No title'}>
            {title || 'No title'}
          </div>

          <div className={styles.description} title={fullDescription || description || 'No description'}>
            {description || 'No description'}
          </div>

          {(budget > 0 || deadline > 0) && (
            <div className={styles.meta}>
              {budget > 0 && (
                <span className={styles.metaItem}>
                  <i className={`fa-solid fa-wallet ${styles.metaIcon}`}></i>
                  ৳{budgetDisplay ?? budget}
                </span>
              )}
              {deadline > 0 && (
                <span className={styles.metaItem}>
                  <i className={`fa-regular fa-calendar ${styles.metaIcon}`}></i>
                  {deadlineDisplay ?? `${deadline} days`}
                </span>
              )}
            </div>
          )}

          <div className={styles.actions}>
            <button className={`${styles.button} ${styles.buttonView}`} onClick={onViewPost}>
              <i className="fa-regular fa-eye"></i> View Post
            </button>

            {canSendOffer && (
              <button className={`${styles.button} ${styles.buttonOffer}`} onClick={onSendOffer}>
                <i className="fa-solid fa-paper-plane"></i> Send Offer
              </button>
            )}

            {canApproveDeal && (
              <>
                <button className={`${styles.button} ${styles.buttonApprove}`} onClick={onApproveDeal}>
                  <i className="fa-solid fa-check-circle"></i> Confirm Deal
                </button>
                <button className={`${styles.button} ${styles.buttonReject}`} onClick={onRejectDeal}>
                  <i className="fa-solid fa-times-circle"></i> Reject Offer
                </button>
              </>
            )}

            {existingDeal?.status === 'active' && (
              <span className={`${styles.badge} ${styles.badgeActive}`}>
                <i className="fa-solid fa-check-double"></i> ⚡ Deal Active
              </span>
            )}

            {existingDeal?.status === 'pending' && !canApproveDeal && (
              <span className={`${styles.badge} ${styles.badgePending}`}>
                <i className="fa-solid fa-clock"></i> {getPendingBadgeText()}
              </span>
            )}

            {existingDeal?.status === 'rejected' && (
              <span className={`${styles.badge} ${styles.badgeRejected}`}>
                <i className="fa-solid fa-ban"></i> ❌ Offer Rejected
              </span>
            )}

            {existingDeal?.status === 'cancelled' && (
              <>
                <span className={`${styles.badge} ${styles.badgeCancelled}`}>
                  <i className="fa-solid fa-ban"></i> ❌ Deal Cancelled
                </span>
                <button className={`${styles.button} ${styles.buttonReopen}`} onClick={onReopenDeal}>
                  <i className="fa-solid fa-rotate-right"></i> Re-open Deal
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetailCard;