// src/components/profile/ReviewsTab.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const ReviewsTab = ({ reviews, reviewsLoading, userRating, user }) => {
  const navigate = useNavigate();

  return (
    <div className="tab-panel reviews-panel">
      <div className="reviews-header">
        <h3>
          <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i>
          Reviews ({reviews.length})
        </h3>
        {reviews.length > 0 && (
          <div className="average-rating">
            <span className="rating-number">{userRating.average}</span>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <i key={star} className={`fa-solid fa-star ${star <= Math.round(userRating.average) ? 'filled' : ''}`}></i>
              ))}
            </div>
            <span className="rating-total">({userRating.total} reviews)</span>
          </div>
        )}
      </div>

      {reviewsLoading ? (
        <div className="loading-reviews">
          <div className="loading-spinner-small"></div>
          <p>Loading reviews...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="no-reviews">
          <i className="fa-solid fa-star-half-stroke"></i>
          <p>No reviews yet.</p>
          <button className="btn-review" onClick={() => navigate(`/profile/${user?.uid}`)}>
            <i className="fa-solid fa-star"></i> Share your profile to get reviews
          </button>
        </div>
      ) : (
        <div className="reviews-list">
          {reviews.map((review) => (
            <div key={review.id} className="review-card">
              <div className="review-header">
                <div className="reviewer-info">
                  <img
                    src={review.reviewerPhoto || `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`}
                    alt={review.reviewerName}
                    className="reviewer-avatar"
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`;
                    }}
                  />
                  <div>
                    <h4>{review.reviewerName || 'Anonymous'}</h4>
                    <div className="review-stars">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <i key={star} className={`fa-solid fa-star ${star <= review.rating ? 'filled' : ''}`}></i>
                      ))}
                    </div>
                  </div>
                </div>
                <span className="review-date">
                  {review.createdAt?.toDate?.()?.toLocaleDateString() ||
                    review.createdAt?.split?.('T')?.[0] ||
                    'Recently'}
                </span>
              </div>
              <p className="review-text">{review.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewsTab;