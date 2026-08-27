import React, { useState } from 'react';
import toast from 'react-hot-toast';

function TrustSection({ userData, onBack }) {
  const [trustScore, setTrustScore] = useState(userData?.trustScore || 4.8);
  const [reviews, setReviews] = useState([
    { id: 1, reviewer: 'John Doe', rating: 5, text: 'Excellent work! Highly recommended.' },
    { id: 2, reviewer: 'Jane Smith', rating: 4, text: 'Good communication and quality work.' },
    { id: 3, reviewer: 'Mike Johnson', rating: 5, text: 'Professional and delivered on time.' }
  ]);

  const handleRefreshTrust = () => {
    const newScore = Math.round((3.5 + Math.random() * 1.5) * 10) / 10;
    setTrustScore(newScore);
    toast.success(`⭐ Trust score updated: ${newScore}/5`);
  };

  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-star" style={{ marginRight: '10px', color: '#fbbf24' }}></i>
          Trust & Reputation
        </div>
      </div>

      <div className="section-content">
        {/* Trust Score */}
        <div className="detail-item" style={{ background: '#fef3c7', borderColor: '#fcd34d' }}>
          <i className="fas fa-star" style={{ color: '#f59e0b' }}></i>
          <span className="detail-label" style={{ fontWeight: 'bold' }}>Trust Score</span>
          <span className="detail-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>
            {trustScore}/5
          </span>
          <button className="action-btn" onClick={handleRefreshTrust}>Refresh</button>
        </div>

        {/* Reviews */}
        <div className="detail-item">
          <i className="fas fa-comment"></i>
          <span className="detail-label">Reviews</span>
          <span className="detail-value">{reviews.length} reviews</span>
          <button className="action-btn" onClick={() => toast.success('📝 Showing all reviews')}>View</button>
        </div>

        {/* Ratings */}
        <div className="detail-item">
          <i className="fas fa-star-half-alt"></i>
          <span className="detail-label">Average Rating</span>
          <span className="detail-value">
            {reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : 'N/A'} ★
          </span>
        </div>

        {/* Completed Jobs */}
        <div className="detail-item">
          <i className="fas fa-check-circle"></i>
          <span className="detail-label">Completed Jobs</span>
          <span className="detail-value">47</span>
          <button className="action-btn" onClick={() => toast.success('📊 Viewing 47 completed jobs')}>Details</button>
        </div>

        {/* Followers */}
        <div className="detail-item">
          <i className="fas fa-user-plus"></i>
          <span className="detail-label">Followers</span>
          <span className="detail-value">312</span>
          <button className="action-btn" onClick={() => toast.success('👥 Showing 312 followers')}>See All</button>
        </div>

        {/* Following */}
        <div className="detail-item">
          <i className="fas fa-user-check"></i>
          <span className="detail-label">Following</span>
          <span className="detail-value">89</span>
          <button className="action-btn" onClick={() => toast.success('👤 Showing 89 following')}>See All</button>
        </div>

        {/* Recent Reviews List */}
        {reviews.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ marginBottom: '10px', fontSize: '16px', fontWeight: '600' }}>
              <i className="fas fa-comment-dots" style={{ marginRight: '8px' }}></i>
              Recent Reviews
            </h4>
            {reviews.slice(0, 3).map(review => (
              <div key={review.id} className="review-card" style={{ marginBottom: '8px' }}>
                <div className="review-header">
                  <div className="reviewer-info">
                    <div>
                      <h4 style={{ fontSize: '14px' }}>{review.reviewer}</h4>
                      <div className="review-stars">
                        {[1, 2, 3, 4, 5].map(star => (
                          <i key={star} className={`fa-solid fa-star ${star <= review.rating ? 'filled' : ''}`}></i>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="review-text" style={{ fontSize: '13px', marginTop: '4px' }}>{review.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TrustSection;