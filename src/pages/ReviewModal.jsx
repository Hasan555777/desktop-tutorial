import React, { useState, useEffect } from 'react';
import { auth, db } from '@/firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { 
  doc, 
  addDoc, 
  collection, 
  serverTimestamp, 
  updateDoc, 
  increment, 
  getDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import './ReviewModal.css';

const ReviewModal = ({ 
  userId, 
  userName, 
  userPhoto, 
  onClose, 
  onReviewSubmitted,
  hasReviewed: propHasReviewed = false, // 🔥 প্রপস থেকে নেওয়া
  reviewType = 'user' // 🔥 ডিফল্ট ভ্যালু
}) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasReviewed, setHasReviewed] = useState(propHasReviewed);
  const feedback = useFeedback();

  // ============================================================
  // ✅ চেক করা - ইতিমধ্যে রিভিউ দিয়েছে কিনা
  // ============================================================
  useEffect(() => {
    // যদি প্রপস থেকে পাঠানো হয়
    if (propHasReviewed) {
      setHasReviewed(true);
      setError('You have already reviewed this user.');
      return;
    }

    const checkExistingReview = async () => {
      if (!auth.currentUser || !userId) return;
      
      try {
        const reviewsRef = collection(db, 'reviews');
        const q = query(
          reviewsRef,
          where('reviewerId', '==', auth.currentUser.uid),
          where('userId', '==', userId)
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          setHasReviewed(true);
          setError('You have already reviewed this user.');
        }
      } catch (error) {
        console.error("Error checking review:", error);
      }
    };
    
    checkExistingReview();
  }, [userId, propHasReviewed]);

  // ============================================================
  // ✅ রিভিউ সাবমিট
  // ============================================================
  const handleSubmit = async () => {
    if (!auth.currentUser) {
      setError('Please login to submit a review!');
      return;
    }

    if (rating === 0) {
      setError('Please select a rating!');
      return;
    }

    if (reviewText.trim().length < 10) {
      setError('Please write at least 10 characters!');
      return;
    }

    if (hasReviewed) {
      setError('You have already reviewed this user.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log("📝 Submitting review for:", userId);
      console.log("📝 Rating:", rating);
      console.log("📝 Text:", reviewText);

      const reviewData = {
        reviewerId: auth.currentUser.uid,
        reviewerName: auth.currentUser.displayName || 'Anonymous',
        reviewerPhoto: auth.currentUser.photoURL || '',
        userId: userId,
        rating: Number(rating),
        text: reviewText.trim(),
        type: reviewType, // 🔥 এখন ডিফাইন
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'reviews'), reviewData);
      console.log("✅ Review saved with ID:", docRef.id);

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const currentData = userSnap.data();
        const currentTotalReviews = currentData.totalReviews || 0;
        const currentTotalRating = currentData.totalRating || 0;
        
const newAverage = ((currentTotalRating + rating) / (currentTotalReviews + 1)).toFixed(1);
await updateDoc(userRef, {
  totalReviews: increment(1),
  totalRating: increment(rating),
  averageRating: Number(newAverage)
});
      }

      console.log("✅ User rating updated");

      await addDoc(collection(db, 'notifications'), {
        userId: userId,
        title: '🌟 New Review Received',
        message: `${auth.currentUser.displayName || 'Someone'} rated you ${rating} stars`,
        type: 'review',
        isUnread: true,
        createdAt: serverTimestamp()
      });

      feedback.showSuccess('Success', 'Review submitted successfully!');
      
      if (onReviewSubmitted) {
        onReviewSubmitted();
      }
      
      onClose();

    } catch (error) {
      console.error('❌ Error submitting review:', error);
      setError('Failed to submit review: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // ✅ স্টার রেন্ডার
  // ============================================================
  const renderStars = () => {
    const stars = [];
    const currentRating = hoverRating || rating;
    
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span
          key={i}
          className={`star ${i <= currentRating ? 'filled' : ''}`}
          onClick={() => !hasReviewed && setRating(i)}
          onMouseEnter={() => !hasReviewed && setHoverRating(i)}
          onMouseLeave={() => !hasReviewed && setHoverRating(0)}
          style={{
            fontSize: '32px',
            cursor: hasReviewed ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            color: i <= currentRating ? '#fbbf24' : '#4a4a4a',
            display: 'inline-block',
            opacity: hasReviewed ? 0.5 : 1
          }}
        >
          <i className={i <= currentRating ? 'fa-solid fa-star' : 'fa-regular fa-star'}></i>
        </span>
      );
    }
    return stars;
  };

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className="review-modal-overlay" onClick={onClose}>
      <div className="review-modal" onClick={(e) => e.stopPropagation()}>
        
        <div className="review-modal-header">
          <h3>
            <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i>
            Review {userName || 'User'}
          </h3>
          <button className="modal-close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="review-modal-body">
          
          <div className="review-user-info">
            <img 
              src={userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=14b8a6&color=fff&bold=true&size=60`} 
              alt={userName || 'User'} 
              className="review-user-avatar"
              onError={(e) => {
                e.target.src = `https://ui-avatars.com/api/?name=${userName || 'User'}&background=14b8a6&color=fff&bold=true&size=60`;
              }}
            />
            <div className="review-user-details">
              <h4>{userName || 'Unknown User'}</h4>
              <p>How was your experience working with them?</p>
            </div>
          </div>

          {hasReviewed ? (
            <div className="review-already-done">
              <i className="fa-solid fa-check-circle"></i>
              <p>You have already reviewed this user.</p>
            </div>
          ) : (
            <>
              <div className="rating-section">
                <label>Rate your experience</label>
                <div className="stars-container">
                  {renderStars()}
                </div>
                <span className="rating-text">
                  {rating > 0 ? `${rating} / 5` : 'Select a rating'}
                </span>
              </div>

              <div className="review-text-section">
                <label>Write your review</label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder={`What was it like working with ${userName || 'this user'}?`}
                  rows="4"
                  maxLength="500"
                  disabled={loading}
                />
                <span className="char-count">{reviewText.length}/500</span>
              </div>

              {error && (
                <div className="review-error">
                  <i className="fa-solid fa-exclamation-circle"></i>
                  {error}
                </div>
              )}

              <div className="review-actions">
                <button 
                  className="cancel-btn" 
                  onClick={onClose} 
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  className="submit-btn" 
                  onClick={handleSubmit} 
                  disabled={loading || hasReviewed}
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-paper-plane"></i>
                      Submit Review
                    </>
                  )}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default ReviewModal;