import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  orderBy, 
  addDoc, 
  serverTimestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment
} from 'firebase/firestore';
import { db, auth } from "@/firebase";
import toast from 'react-hot-toast';
import Loading from '@/components/Loading';

import './UserProfilePage.css';

// ============================================================
// 📌 রিভিউ মোডাল কম্পোনেন্ট
// ============================================================
const ReviewModal = ({ userId, userName, userPhoto, onClose, onReviewSubmitted, hasReviewed: propHasReviewed }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasReviewed, setHasReviewed] = useState(propHasReviewed);
  
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

    setLoading(true);
    setError('');

    try {
      const reviewData = {
        reviewerId: auth.currentUser.uid,
        reviewerName: auth.currentUser.displayName || 'Anonymous',
        reviewerPhoto: auth.currentUser.photoURL || '',
        userId: userId,
        rating: rating,
        text: reviewText.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'reviews'), reviewData);
      
      // ✅ রেটিং আপডেট করুন
      const reviewsRef = collection(db, 'reviews');
      const q = query(reviewsRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const reviews = snapshot.docs.map(doc => doc.data());
      const total = reviews.reduce((sum, r) => sum + r.rating, 0);
      const average = total / reviews.length;
      
      await updateDoc(doc(db, 'users', userId), {
        totalReviews: reviews.length,
        totalRating: total,
        averageRating: Math.round(average * 10) / 10
      });
      
      toast.success('✅ Review submitted successfully!');
      
      if (onReviewSubmitted) {
        onReviewSubmitted();
      }
      onClose();
    } catch (error) {
      console.error('Error submitting review:', error);
      setError('Failed to submit review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => {
    const stars = [];
    const currentRating = hoverRating || rating;
    
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span
          key={i}
          className={`star ${i <= currentRating ? 'filled' : ''}`}
          onClick={() => setRating(i)}
          onMouseEnter={() => setHoverRating(i)}
          onMouseLeave={() => setHoverRating(0)}
          style={{ cursor: 'pointer', color: i <= currentRating ? '#fbbf24' : '#ccc' }}
        >
          <i className={i <= currentRating ? 'fa-solid fa-star' : 'fa-regular fa-star'}></i>
        </span>
      );
    }
    return stars;
  };

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
            <div className="review-user-avatar-wrapper">
              <img 
                src={userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=14b8a6&color=fff&bold=true&size=60`} 
                alt={userName || 'User'} 
                className="review-user-avatar"
                onError={(e) => {
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=14b8a6&color=fff&bold=true&size=60`;
                }}
              />
            </div>
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
                <button className="cancel-btn" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button 
                  className="submit-btn" 
                  onClick={handleSubmit} 
                  disabled={loading || hasReviewed}
                >
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Submitting...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-paper-plane"></i> Submit Review
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

// ============================================================
// 📌 মেইন প্রোফাইল পেজ কম্পোনেন্ট
// ============================================================
const UserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  
  const [userData, setUserData] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [userRating, setUserRating] = useState({ average: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [activeTab, setActiveTab] = useState('about');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  
  // ✅ নতুন: ফলো স্টেট
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  
  // ✅ নতুন: অনলাইন স্ট্যাটাস
  const [isOnline, setIsOnline] = useState(false);

  // ✅ নতুন: Facebook-স্টাইল অ্যাভাটার ফুলস্ক্রিন জুম
  const [showAvatarZoom, setShowAvatarZoom] = useState(false);

  // ── রিভিউ ফেচ ফাংশন ──
  const fetchReviews = useCallback(async () => {
    if (!userId) return;

    try {
      const q = query(collection(db, 'reviews'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const reviewsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReviews(reviewsData);

      if (reviewsData.length > 0) {
        const total = reviewsData.reduce((sum, r) => sum + r.rating, 0);
        const average = total / reviewsData.length;
        setUserRating({ average: Math.round(average * 10) / 10, total: reviewsData.length });
      }

      if (currentUser) {
        const hasUserReviewed = reviewsData.some(r => r.reviewerId === currentUser.uid);
        setHasReviewed(hasUserReviewed);
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
    }
  }, [userId, currentUser]);

  // ── ইউজার ডেটা ফেচ ──
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', userId);
    const unsubscribeUser = onSnapshot(userRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setUserData(data);
        setIsOwner(currentUser?.uid === userId);
        
        // ✅ অনলাইন স্ট্যাটাস
        setIsOnline(data.isOnline || false);
        
        // ✅ ফলোয়ার্স কাউন্ট
        setFollowersCount(data.followersCount || 0);
        setFollowingCount(data.followingCount || 0);
        
        // ✅ ফলো স্ট্যাটাস চেক
        if (currentUser && currentUser.uid !== userId) {
          const followers = data.followers || [];
          setIsFollowing(followers.includes(currentUser.uid));
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to user data:", error);
      setLoading(false);
    });

    const fetchPosts = async () => {
      try {
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
        const postsSnap = await getDocs(q);
        const posts = postsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserPosts(posts);
      } catch (error) {
        console.error("Error fetching posts:", error);
      }
    };

    fetchPosts();
    return () => unsubscribeUser();
  }, [userId, currentUser]);

  // ── রিভিউ ফেচ ──
  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // ✅ নতুন: অ্যাভাটার জুম খোলা থাকলে Esc দিয়ে বন্ধ + পেজ স্ক্রল লক
  useEffect(() => {
    if (!showAvatarZoom) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') setShowAvatarZoom(false);
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [showAvatarZoom]);

  // ✅ ফলো টগল ফাংশন
  const handleFollowToggle = async () => {
    if (!currentUser) {
      toast.error('Please login to follow!');
      navigate('/login');
      return;
    }

    if (isOwner) {
      toast.error('You cannot follow yourself!');
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const currentUserRef = doc(db, 'users', currentUser.uid);

      if (isFollowing) {
        // ✅ আনফলো
        await updateDoc(userRef, {
          followers: arrayRemove(currentUser.uid),
          followersCount: increment(-1)
        });
        await updateDoc(currentUserRef, {
          following: arrayRemove(userId),
          followingCount: increment(-1)
        });
        setIsFollowing(false);
        setFollowersCount(prev => prev - 1);
        toast.success('Unfollowed successfully!');
      } else {
        // ✅ ফলো
        await updateDoc(userRef, {
          followers: arrayUnion(currentUser.uid),
          followersCount: increment(1)
        });
        await updateDoc(currentUserRef, {
          following: arrayUnion(userId),
          followingCount: increment(1)
        });
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
        toast.success('Followed successfully!');
      }
    } catch (error) {
      console.error('Follow error:', error);
      toast.error('Failed to follow/unfollow. Please try again.');
    }
  };

  // ── চ্যাট আইডি জেনারেটর ──
  const getChatId = useCallback(() => {
    if (!currentUser || !userId) return null;
    return [currentUser.uid, userId].sort().join('_');
  }, [userId, currentUser]);

  // ── Hire Flow ──
  const handleStartFlow = async () => {
    if (!currentUser) {
      toast.error('Please login to start a project!');
      navigate('/login');
      return;
    }

    if (isOwner) {
      toast.error('You cannot start a project with yourself!');
      return;
    }

    try {
      const chatId = getChatId();
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);

      if (!chatSnap.exists()) {
        await setDoc(chatRef, {
          participants: [currentUser.uid, userId],
          createdAt: serverTimestamp(),
          lastMessage: '',
          unreadCount: {
            [currentUser.uid]: 0,
            [userId]: 0
          }
        });
      }

      navigate('/inbox', { state: { chatId, userId } });
    } catch (error) {
      console.error("Error starting flow:", error);
      toast.error('Failed to start project. Please try again.');
    }
  };

  // ── মেসেজ ──
  const handleSendMessage = useCallback(() => {
    if (!currentUser) {
      toast.error('Please login to send message!');
      navigate('/login');
      return;
    }
    const chatId = getChatId();
    navigate('/inbox', { state: { chatId, userId } });
  }, [getChatId, navigate, currentUser]);

  // ── রিভিউ সাবমিট হ্যান্ডলার ──
  const handleReviewSubmitted = useCallback(() => {
    setHasReviewed(true);
    fetchReviews();
  }, [fetchReviews]);

  // ============================================================
  // ✅ নতুন হেল্পার — বাজেট সেফলি ফরম্যাট করা (number অথবা
  // {type, amount/min/max, isNegotiable} — দুটোই সাপোর্ট করে)।
  // এটা যোগ করা হয়েছে কারণ post.budget সরাসরি JSX-এ বসালে
  // (যখন এটা অবজেক্ট হয়) "Objects are not valid as a React child"
  // এরর দিয়ে পুরো পেজ ক্র্যাশ করত।
  // ============================================================
  const formatPostBudget = (post) => {
    const raw = post?.budget ?? post?.price;
    if (raw && typeof raw === 'object') {
      const range = raw.type === 'range' ? `${raw.min ?? 0}-${raw.max ?? 0}` : `${raw.amount ?? 0}`;
      return raw.isNegotiable ? `${range} (আলোচনাসাপেক্ষ)` : range;
    }
    return raw ?? 0;
  };

  // ============================================================
  // ✅ নতুন হেল্পার — Firestore Timestamp/string/number/Date
  // যেকোনো ফরম্যাট থেকে নিরাপদে "Joined ..." তারিখ বের করা।
  // আগে new Date(TimestampObject) সরাসরি কল করায় "Invalid Date"
  // দেখাত, কারণ Firestore createdAt একটা Timestamp object, স্ট্রিং না।
  // ============================================================
  const formatJoinDate = (createdAt) => {
    if (!createdAt) return 'Recently';
    const d = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
    return isNaN(d.getTime()) ? 'Recently' : d.toDateString();
  };

if (loading) {
  return (
    <Loading 
      message="Loading Profile..."
      subMessage="Fetching user information..."
      icon="fa-solid fa-user"
      minHeight="400px"
      fullScreen={false}
    />
  );
}

  if (!userData) {
    return (
      <div className="profile-not-found">
        <i className="fa-solid fa-user-slash"></i>
        <h2>User Not Found</h2>
        <p>The user you're looking for doesn't exist.</p>
        <button onClick={() => navigate('/')}>Back to Home</button>
      </div>
    );
  }

  const isProfilePrivate = userData.privacySettings?.profileVisibility === 'private';
  const canViewProfile = !isProfilePrivate || isOwner;

  if (!canViewProfile) {
    return (
      <div className="profile-private">
        <i className="fa-solid fa-lock"></i>
        <h2>This profile is private</h2>
        <p>This user has set their profile to private mode.</p>
        <button onClick={() => navigate('/')}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className="user-profile-page">
      {/* ===== প্রোফাইল হেডার ===== */}
      <div className="profile-header">
        <div className="profile-avatar-section">
<div className="avatar-wrapper" style={{
  position: 'relative',
  display: 'inline-block',
  borderRadius: '50%',
  padding: '4px',
  background: 'linear-gradient(135deg, #14b8a6, #0d9488, #14b8a6)',
  backgroundSize: '300% 300%',
  animation: 'gradientGlow 3s ease-in-out infinite',
  boxShadow: '0 0 20px rgba(20, 184, 166, 0.3), 0 0 60px rgba(20, 184, 166, 0.1)',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  cursor: 'zoom-in'
}}
  onClick={() => setShowAvatarZoom(true)}
>
  <img 
    src={userData.photoURL || `https://ui-avatars.com/api/?name=${userData.displayName || 'User'}&background=14b8a6&color=fff&bold=true&size=120`} 
    alt={userData.displayName || 'User'} 
    className="profile-avatar"
    style={{
      display: 'block',
      width: '120px',
      height: '120px',
      borderRadius: '50%',
      objectFit: 'cover',
      border: '3px solid rgba(255, 255, 255, 0.8)',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      filter: 'brightness(1) saturate(1)'
    }}
    onMouseEnter={(e) => {
      e.target.parentElement.style.transform = 'scale(1.05)';
      e.target.parentElement.style.boxShadow = '0 0 30px rgba(20, 184, 166, 0.5), 0 0 80px rgba(20, 184, 166, 0.2)';
      e.target.parentElement.style.padding = '3px';
      e.target.style.filter = 'brightness(1.1) saturate(1.2)';
    }}
    onMouseLeave={(e) => {
      e.target.parentElement.style.transform = 'scale(1)';
      e.target.parentElement.style.boxShadow = '0 0 20px rgba(20, 184, 166, 0.3), 0 0 60px rgba(20, 184, 166, 0.1)';
      e.target.parentElement.style.padding = '4px';
      e.target.style.filter = 'brightness(1) saturate(1)';
    }}
  />
</div>
          
          <div className="profile-info">
            <div className="profile-name-row">
              <h1>{userData.displayName || 'Unknown User'}</h1>

            </div>
            
            <p className="profile-headline">{userData.headline || 'No headline set'}</p>
            
            {/* ✅ ইউজার আইডি, ওয়ালেট আইডি, রেফারেল কোড */}
            <div className="profile-ids">
              <div className="id-item">
                <span className="id-label">🆔 User ID</span>
                <span className="id-value">{userData.uniqueId || 'N/A'}</span>
                <button 
                  className="copy-id-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(userData.uniqueId || '');
                    toast.success('📋 User ID copied!');
                  }}
                  title="Copy User ID"
                >
                  <i className="fa-solid fa-copy"></i>
                </button>
              </div>
              <div className="id-item">
                <span className="id-label">💳 Wallet ID</span>
                <span className="id-value">{userData.walletId || 'N/A'}</span>
                <button 
                  className="copy-id-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(userData.walletId || '');
                    toast.success('📋 Wallet ID copied!');
                  }}
                  title="Copy Wallet ID"
                >
                  <i className="fa-solid fa-copy"></i>
                </button>
              </div>
              <div className="id-item">
                <span className="id-label">🔗 Referral Code</span>
                <span className="id-value">{userData.referralCode || 'N/A'}</span>
                <button 
                  className="copy-id-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(userData.referralCode || '');
                    toast.success('📋 Referral code copied!');
                  }}
                  title="Copy Referral Code"
                >
                  <i className="fa-solid fa-copy"></i>
                </button>
              </div>
            </div>
            
            {/* ✅ পরিসংখ্যান */}
            <div className="profile-stats">
              <span><i className="fa-solid fa-file-alt"></i> {userPosts.length} Posts</span>
              <span><i className="fa-solid fa-users"></i> {followersCount} Followers</span>
              <span><i className="fa-solid fa-user-plus"></i> {followingCount} Following</span>
              <span>
                <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i> 
                {userRating.average > 0 ? `${userRating.average} (${userRating.total})` : 'No reviews'}
              </span>
              {/* ✅ জয়েন তারিখ */}
              <span>
                <i className="fa-solid fa-calendar"></i> 
                Joined {formatJoinDate(userData.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== অ্যাকশন বাটন ===== */}
      {!isOwner && (
        <div className="profile-actions">
          
          
          <button 
            className={`btn-follow ${isFollowing ? 'following' : ''}`} 
            onClick={handleFollowToggle}
          >
            <i className={`fa-solid ${isFollowing ? 'fa-user-minus' : 'fa-user-plus'}`}></i>
            {isFollowing ? ' Unfollow' : ' Follow'}
          </button>
          
          <button 
            className={`btn-review ${hasReviewed ? 'reviewed' : ''}`} 
            onClick={() => setShowReviewModal(true)}
            disabled={hasReviewed}
          >
            <i className="fa-solid fa-star"></i> 
            {hasReviewed ? 'Already Reviewed' : 'Write a Review'}
          </button>
        </div>
      )}

      {isOwner && (
        <div className="profile-actions owner-actions">
          <button className="btn-edit-profile" onClick={() => navigate('/settings')}>
            <i className="fa-solid fa-pen"></i> Edit Profile
          </button>
        </div>
      )}

            {/* ===== রেসপনসিভ কার্ড গ্রিড (মোবাইলে ২ কলাম, ডেস্কটপে ৪-৫ কলাম) ===== */}
      <div className="profile-settings-grid">
  
  {/* About Card */}
  <button 
    className={`settings-card ${activeTab === 'about' ? 'active' : ''}`}
    onClick={() => setActiveTab('about')}
  >
    <div className="card-icon"><i className="fa-solid fa-user"></i></div>
    <span className="card-label">About</span>
  </button>

  {/* Posts Card */}
  <button 
    className={`settings-card ${activeTab === 'posts' ? 'active' : ''}`}
    onClick={() => setActiveTab('posts')}
  >
    <div className="card-icon"><i className="fa-solid fa-file-alt"></i></div>
    <span className="card-label">Posts</span>
    <span className="card-badge">{userPosts.length}</span>
  </button>

  {/* Reviews Card */}
  <button 
    className={`settings-card ${activeTab === 'reviews' ? 'active' : ''}`}
    onClick={() => setActiveTab('reviews')}
  >
    <div className="card-icon"><i className="fa-solid fa-star"></i></div>
    <span className="card-label">Reviews</span>
    <span className="card-badge review-badge">
      {reviews.length > 0 ? userRating.average + '★' : '0'}
    </span>
  </button>

  {/* Experience Card */}
  <button 
    className={`settings-card ${activeTab === 'experience' ? 'active' : ''}`}
    onClick={() => setActiveTab('experience')}
  >
    <div className="card-icon"><i className="fa-solid fa-briefcase"></i></div>
    <span className="card-label">Experience</span>
  </button>

  {/* Education Card */}
  <button 
    className={`settings-card ${activeTab === 'education' ? 'active' : ''}`}
    onClick={() => setActiveTab('education')}
  >
    <div className="card-icon"><i className="fa-solid fa-graduation-cap"></i></div>
    <span className="card-label">Education</span>
  </button>

  {/* Certifications Card */}
  <button 
    className={`settings-card ${activeTab === 'certifications' ? 'active' : ''}`}
    onClick={() => setActiveTab('certifications')}
  >
    <div className="card-icon"><i className="fa-solid fa-award"></i></div>
    <span className="card-label">Certifications</span>
  </button>

  {/* Social / Connect Card */}
  <button 
    className={`settings-card ${activeTab === 'social' ? 'active' : ''}`}
    onClick={() => setActiveTab('social')}
  >
    <div className="card-icon"><i className="fa-solid fa-share-nodes"></i></div>
    <span className="card-label">Connect</span>
  </button>

  {/* Private Info Card (মালিকের জন্য) */}
  {isOwner && (
    <button 
      className={`settings-card private ${activeTab === 'private' ? 'active' : ''}`}
      onClick={() => setActiveTab('private')}
    >
      <div className="card-icon"><i className="fa-solid fa-lock"></i></div>
      <span className="card-label">Private</span>
    </button>
  )}
</div>      
            {/* ===== ট্যাব কন্টেন্ট ===== */}
      <div className="profile-tab-content">
        {activeTab === 'about' && (
          <div className="tab-panel about-panel">
            <h3><i className="fa-solid fa-user-pen"></i> About</h3>
            <p>{userData.bio || 'No bio provided yet.'}</p>
            
            {userData.skills && (
              <div className="skills-section">
                <h4>Skills</h4>
                <div className="skills-tags">
                  {typeof userData.skills === 'string' 
                    ? userData.skills.split(',').map((skill, idx) => (
                        <span key={idx} className="skill-tag">{skill.trim()}</span>
                      ))
                    : userData.skills.map((skill, idx) => (
                        <span key={idx} className="skill-tag">{skill}</span>
                      ))
                  }
                </div>
              </div>
            )}
            
            <div className="info-grid">
              <div className="info-item">
                <i className="fa-solid fa-location-dot"></i>
                <span>{userData.location || 'Location not set'}</span>
              </div>
              <div className="info-item">
                <i className="fa-solid fa-globe"></i>
                <span>{userData.website || 'No website'}</span>
              </div>
              <div className="info-item">
                <i className="fa-solid fa-calendar"></i>
                <span>Joined {formatJoinDate(userData.createdAt)}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="tab-panel posts-panel">
            <h3><i className="fa-solid fa-file-alt"></i> Posts ({userPosts.length})</h3>
            {userPosts.length === 0 ? (
              <div className="no-posts"><i className="fa-solid fa-folder-open"></i><p>No posts yet.</p></div>
            ) : (
              <div className="posts-grid">
                {userPosts.map((post) => (
                  <div key={post.id} className="post-card-mini" onClick={() => navigate(`/post/${post.id}`)} style={{ cursor: 'pointer' }}>
                    {post.images && post.images.length > 0 && <img src={post.images[0]} alt={post.title} className="post-thumbnail" />}
                    <div className="post-info">
                      <h4>{post.title}</h4>
                      <p>{post.description?.substring(0, 60)}...</p>
                      <span className="post-budget">৳ {formatPostBudget(post)} BDT</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="tab-panel reviews-panel">
            <div className="reviews-header">
              <h3><i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i> Reviews ({reviews.length})</h3>
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
            
            {reviews.length === 0 ? (
              <div className="no-reviews">
                <i className="fa-solid fa-star-half-stroke"></i>
                <p>No reviews yet.</p>
                {!isOwner && !hasReviewed && (
                  <button className="btn-review" onClick={() => setShowReviewModal(true)}>
                    <i className="fa-solid fa-star"></i> Be the first to review
                  </button>
                )}
              </div>
            ) : (
              <div className="reviews-list">
                {reviews.map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="review-header">
                      <div className="reviewer-info">
                        <img src={review.reviewerPhoto || `https://ui-avatars.com/api/?name=${review.reviewerName}&background=14b8a6&color=fff&bold=true&size=40`} alt={review.reviewerName} className="reviewer-avatar" />
                        <div>
                          <h4>{review.reviewerName}</h4>
                          <div className="review-stars">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <i key={star} className={`fa-solid fa-star ${star <= review.rating ? 'filled' : ''}`}></i>
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="review-date">{review.createdAt?.toDate?.()?.toDateString() || 'Recently'}</span>
                    </div>
                    <p className="review-text">{review.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'experience' && (
          <div className="tab-panel experience-panel">
            <h3><i className="fa-solid fa-briefcase"></i> Work Experience</h3>
            {userData.experience && userData.experience.length > 0 ? (
              userData.experience.map((exp, index) => (
                <div key={index} className="item-card">
                  <div className="item-header"><h4>{exp.role} at {exp.company}</h4></div>
                  <p className="item-date">{exp.startDate} - {exp.endDate || 'Present'}</p>
                  <p className="item-description">{exp.description}</p>
                </div>
              ))
            ) : (
              <div className="empty-state"><i className="fa-solid fa-briefcase"></i><p>No experience added yet</p></div>
            )}
          </div>
        )}

        {activeTab === 'education' && (
          <div className="tab-panel education-panel">
            <h3><i className="fa-solid fa-graduation-cap"></i> Education</h3>
            {userData.education && userData.education.length > 0 ? (
              userData.education.map((edu, index) => (
                <div key={index} className="item-card">
                  <div className="item-header"><h4>{edu.degree} - {edu.field}</h4></div>
                  <p className="item-institution">{edu.institution}</p>
                  <p className="item-date">{edu.startDate} - {edu.endDate || 'Present'}</p>
                </div>
              ))
            ) : (
              <div className="empty-state"><i className="fa-solid fa-graduation-cap"></i><p>No education added yet</p></div>
            )}
          </div>
        )}

        {activeTab === 'certifications' && (
          <div className="tab-panel certifications-panel">
            <h3><i className="fa-solid fa-award"></i> Certifications</h3>
            {userData.certifications && userData.certifications.length > 0 ? (
              userData.certifications.map((cert, index) => (
                <div key={index} className="item-card">
                  <div className="item-header"><h4>{cert.name}</h4></div>
                  <p className="item-issuer">Issued by: {cert.issuer}</p>
                  <p className="item-date">{cert.date}</p>
                  {cert.link && <a href={cert.link} target="_blank" rel="noopener noreferrer" className="cert-link">🔗 View Certificate</a>}
                </div>
              ))
            ) : (
              <div className="empty-state"><i className="fa-solid fa-award"></i><p>No certifications added yet</p></div>
            )}
          </div>
        )}

{activeTab === 'social' && (
  <div className="tab-panel social-panel">
    <div className="tab-header">
      <h3>
        <i className="fa-solid fa-share-nodes" style={{ color: '#14b8a6' }}></i> 
        Connect & Social
      </h3>
      <p className="tab-subtitle">Connect with {userData.displayName || 'this user'} on social platforms</p>
    </div>
    
    <div className="social-links-container">
      {/* LinkedIn */}
      {userData.socialLinks?.linkedin && (
        <a href={userData.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="social-link-item linkedin">
          <i className="fa-brands fa-linkedin"></i> LinkedIn
          <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
        </a>
      )}
      
      {/* GitHub */}
      {userData.socialLinks?.github && (
        <a href={userData.socialLinks.github} target="_blank" rel="noopener noreferrer" className="social-link-item github">
          <i className="fa-brands fa-github"></i> GitHub
          <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
        </a>
      )}
      
      {/* YouTube */}
      {userData.socialLinks?.youtube && (
        <a href={userData.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="social-link-item youtube">
          <i className="fa-brands fa-youtube"></i> YouTube
          <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
        </a>
      )}
      
      {/* Instagram */}
      {userData.socialLinks?.instagram && (
        <a href={userData.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="social-link-item instagram">
          <i className="fa-brands fa-instagram"></i> Instagram
          <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
        </a>
      )}
      
      {/* Twitter/X */}
      {userData.socialLinks?.twitter && (
        <a href={userData.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="social-link-item twitter">
          <i className="fa-brands fa-twitter"></i> Twitter/X
          <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
        </a>
      )}
      
      {/* Website */}
      {userData.socialLinks?.website && (
        <a href={userData.socialLinks.website} target="_blank" rel="noopener noreferrer" className="social-link-item website">
          <i className="fa-solid fa-globe"></i> Website
          <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
        </a>
      )}
      
      {/* No Links */}
      {(!userData.socialLinks?.linkedin && 
        !userData.socialLinks?.github && 
        !userData.socialLinks?.youtube && 
        !userData.socialLinks?.instagram && 
        !userData.socialLinks?.twitter && 
        !userData.socialLinks?.website) && (
        <div className="empty-state">
          <i className="fa-solid fa-share-nodes"></i>
          <p>No social links added yet</p>
          <small>This user hasn't added any social profiles</small>
        </div>
      )}
    </div>
  </div>
)}

        {isOwner && activeTab === 'private' && (
          <div className="tab-panel private-panel">
            <h3><i className="fa-solid fa-lock"></i> Private Information</h3>
            <div className="private-info-grid">
              <div className="private-item">
                <label>Email</label>
                <p>{currentUser?.email || 'Not set'}</p>
              </div>
              <div className="private-item">
                <label>Wallet Balance</label>
                <p>৳ {userData.balance || 0} BDT</p>
              </div>
              <div className="private-item">
                <label>User ID</label>
                <p>{userId}</p>
              </div>
              <div className="private-item">
                <label>Account Status</label>
                <p className={`status-${userData.isVerified ? 'verified' : 'pending'}`}>
                  {userData.isVerified ? '✅ Verified' : userData.verificationStatus === 'pending' ? '⏳ Pending' : '⚠️ Not Verified'}
                </p>
              </div>
              <div className="private-item">
                <label>Phone Number</label>
                <p>{userData.phone || 'Not set'}</p>
              </div>
              <div className="private-item">
                <label>Role</label>
                <p>{userData.role === 'client' ? '👔 Client' : '💻 Freelancer'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* রিভিউ মোডাল */}
      {showReviewModal && (
        <ReviewModal
          userId={userId}
          userName={userData?.displayName}
          userPhoto={userData?.photoURL}
          onClose={() => setShowReviewModal(false)}
          onReviewSubmitted={handleReviewSubmitted}
          hasReviewed={hasReviewed}
        />
      )}

      {/* ✅ নতুন: Facebook-স্টাইল ফুলস্ক্রিন অ্যাভাটার জুম */}
      {showAvatarZoom && (
        <div className="avatar-zoom-overlay" onClick={() => setShowAvatarZoom(false)}>
          <button
            className="avatar-zoom-close"
            onClick={(e) => { e.stopPropagation(); setShowAvatarZoom(false); }}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
          <img
            src={
              userData.photoURL ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName || 'User')}&background=14b8a6&color=fff&bold=true&size=400`
            }
            alt={userData.displayName || 'User'}
            className="avatar-zoom-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default UserProfilePage;