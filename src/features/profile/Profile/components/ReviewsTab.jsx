// src/components/profile/ReviewsTab.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ReviewsTab.module.css';

const ReviewsTab = ({ reviews, reviewsLoading, userRating, user }) => {
  const navigate = useNavigate();

  return (
    <div className={`${styles.tabPanel} ${styles.reviewsPanel}`}>
      <div className={styles.reviewsHeader}>
        <h3>
          <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i>
          Reviews ({reviews.length})
        </h3>
        {reviews.length > 0 && (
          <div className={styles.averageRating}>
            <span className={styles.ratingNumber}>{userRating.average}</span>
            <div className={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <i key={star} className={`fa-solid fa-star ${star <= Math.round(userRating.average) ? styles.filled : ''}`}></i>
              ))}
            </div>
            <span className={styles.ratingTotal}>({userRating.total} reviews)</span>
          </div>
        )}
      </div>

      {reviewsLoading ? (
        <div className={styles.loadingReviews}>
          <div className={styles.loadingSpinnerSmall}></div>
          <p>Loading reviews...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className={styles.noReviews}>
          <i className="fa-solid fa-star-half-stroke"></i>
          <p>No reviews yet.</p>
          <button className={styles.btnReview} onClick={() => navigate(`/profile/user/${user?.uid}`)}>
            <i className="fa-solid fa-star"></i> Share your profile to get reviews
          </button>
        </div>
      ) : (
        <div className={styles.reviewsList}>
          {reviews.map((review) => (
            <div key={review.id} className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <div className={styles.reviewerInfo}>
                  <img
                    src={review.reviewerPhoto || `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`}
                    alt={review.reviewerName}
                    className={styles.reviewerAvatar}
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`;
                    }}
                  />
                  <div>
                    <h4>{review.reviewerName || 'Anonymous'}</h4>
                    <div className={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <i key={star} className={`fa-solid fa-star ${star <= review.rating ? styles.filled : ''}`}></i>
                      ))}
                    </div>
                  </div>
                </div>
                <span className={styles.reviewDate}>
                  {review.createdAt?.toDate?.()?.toLocaleDateString() ||
                    review.createdAt?.split?.('T')?.[0] ||
                    'Recently'}
                </span>
              </div>
              <p className={styles.reviewText}>{review.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewsTab;