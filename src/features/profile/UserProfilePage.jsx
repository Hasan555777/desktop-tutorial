import React, { useState, useEffect, useCallback } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
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
import { db, auth } from "../../shared/firebase/index";
import Loading from '../../shared/ui/Loading/Loading';
import styles from './UserProfilePage.module.css';

// ============================================================
// 📌 রিভিউ মোডাল কম্পোনেন্ট
// ============================================================
const ReviewModal = ({ userId, userName, userPhoto, onClose, onReviewSubmitted, hasReviewed: propHasReviewed }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  usePageLoadingBar(loading);
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
      
      feedback.alert.success({ title: '✅ Review submitted successfully!' });
      
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
          className={`${styles.star} ${i <= currentRating ? styles.filled : ''}`}
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
    <div className={styles.reviewModalOverlay} onClick={onClose}>
      <div className={styles.reviewModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.reviewModalHeader}>
          <h3>
            <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i>
            Review {userName || 'User'}
          </h3>
          <button className={styles.modalCloseBtn} onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className={styles.reviewModalBody}>
          <div className={styles.reviewUserInfo}>
            <div className={styles.reviewUserAvatarWrapper}>
              <img 
                src={userPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=14b8a6&color=fff&bold=true&size=60`} 
                alt={userName || 'User'} 
                className={styles.reviewUserAvatar}
                onError={(e) => {
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=14b8a6&color=fff&bold=true&size=60`;
                }}
              />
            </div>
            <div className={styles.reviewUserDetails}>
              <h4>{userName || 'Unknown User'}</h4>
              <p>How was your experience working with them?</p>
            </div>
          </div>

          {hasReviewed ? (
            <div className={styles.reviewAlreadyDone}>
              <i className="fa-solid fa-check-circle"></i>
              <p>You have already reviewed this user.</p>
            </div>
          ) : (
            <>
              <div className={styles.ratingSection}>
                <label>Rate your experience</label>
                <div className={styles.starsContainer}>
                  {renderStars()}
                </div>
                <span className={styles.ratingText}>
                  {rating > 0 ? `${rating} / 5` : 'Select a rating'}
                </span>
              </div>

              <div className={styles.reviewTextSection}>
                <label>Write your review</label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder={`What was it like working with ${userName || 'this user'}?`}
                  rows="4"
                  maxLength="500"
                  disabled={loading}
                />
                <span className={styles.charCount}>{reviewText.length}/500</span>
              </div>

              {error && (
                <div className={styles.reviewError}>
                  <i className="fa-solid fa-exclamation-circle"></i>
                  {error}
                </div>
              )}

              <div className={styles.reviewActions}>
                <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button 
                  className={styles.submitBtn} 
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
  const feedback = useFeedback();
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
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [showAvatarZoom, setShowAvatarZoom] = useState(false);

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
        setIsOnline(data.isOnline || false);
        setFollowersCount(data.followersCount || 0);
        setFollowingCount(data.followingCount || 0);
        
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

  // ✅ অ্যাভাটার জুম
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

  // ✅ ফলো টগল
  const handleFollowToggle = async () => {
    if (!currentUser) {
      feedback.alert.error({ title: 'Please login to follow!' });
      navigate('/login', { replace: true });
      return;
    }

    if (isOwner) {
      feedback.alert.error({ title: 'You cannot follow yourself!' });
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const currentUserRef = doc(db, 'users', currentUser.uid);

      if (isFollowing) {
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
        feedback.alert.success({ title: 'Unfollowed successfully!' });
      } else {
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
        feedback.alert.success({ title: 'Followed successfully!' });
      }
    } catch (error) {
      console.error('Follow error:', error);
      feedback.alert.error({ title: 'Failed to follow/unfollow. Please try again.' });
    }
  };

  // ── চ্যাট আইডি ──
  const getChatId = useCallback(() => {
    if (!currentUser || !userId) return null;
    return [currentUser.uid, userId].sort().join('_');
  }, [userId, currentUser]);

  // ── Hire Flow ──
  const handleStartFlow = async () => {
    if (!currentUser) {
      feedback.alert.error({ title: 'Please login to start a project!' });
      navigate('/login', { replace: true });
      return;
    }

    if (isOwner) {
      feedback.alert.error({ title: 'You cannot start a project with yourself!' });
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
      feedback.alert.error({ title: 'Failed to start project. Please try again.' });
    }
  };

  // ── মেসেজ ──
  const handleSendMessage = useCallback(() => {
    if (!currentUser) {
      feedback.alert.error({ title: 'Please login to send message!' });
      navigate('/login', { replace: true });
      return;
    }
    const chatId = getChatId();
    navigate('/inbox', { state: { chatId, userId } });
  }, [getChatId, navigate, currentUser]);

  // ── রিভিউ সাবমিট ──
  const handleReviewSubmitted = useCallback(() => {
    setHasReviewed(true);
    fetchReviews();
  }, [fetchReviews]);

  const formatPostBudget = (post) => {
    const raw = post?.budget ?? post?.price;
    if (raw && typeof raw === 'object') {
      const range = raw.type === 'range' ? `${raw.min ?? 0}-${raw.max ?? 0}` : `${raw.amount ?? 0}`;
      return raw.isNegotiable ? `${range} (আলোচনাসাপেক্ষ)` : range;
    }
    return raw ?? 0;
  };

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
      <div className={styles.profileNotFound}>
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
      <div className={styles.profilePrivate}>
        <i className="fa-solid fa-lock"></i>
        <h2>This profile is private</h2>
        <p>This user has set their profile to private mode.</p>
        <button onClick={() => navigate('/')}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className={styles.userProfilePage}>
      {/* ===== প্রোফাইল হেডার ===== */}
      <div className={styles.profileHeader}>
        <div className={styles.profileAvatarSection}>
          <div className={styles.avatarWrapper} onClick={() => setShowAvatarZoom(true)}>
            <img 
              src={userData.photoURL || `https://ui-avatars.com/api/?name=${userData.displayName || 'User'}&background=14b8a6&color=fff&bold=true&size=120`} 
              alt={userData.displayName || 'User'} 
              className={styles.profileAvatar}
            />
          </div>
          
          <div className={styles.profileInfo}>
            <div className={styles.profileNameRow}>
              <h1>{userData.displayName || 'Unknown User'}</h1>
            </div>
            
            <p className={styles.profileHeadline}>{userData.headline || 'No headline set'}</p>
            
            <div className={styles.profileIds}>
              <div className={styles.idItem}>
                <span className={styles.idLabel}>🆔 User ID</span>
                <span className={styles.idValue}>{userData.uniqueId || 'N/A'}</span>
                <button 
                  className={styles.copyIdBtn}
                  onClick={() => {
                    navigator.clipboard.writeText(userData.uniqueId || '');
                    feedback.alert.success({ title: '📋 User ID copied!' });
                  }}
                  title="Copy User ID"
                >
                  <i className="fa-solid fa-copy"></i>
                </button>
              </div>
              <div className={styles.idItem}>
                <span className={styles.idLabel}>💳 Wallet ID</span>
                <span className={styles.idValue}>{userData.walletId || 'N/A'}</span>
                <button 
                  className={styles.copyIdBtn}
                  onClick={() => {
                    navigator.clipboard.writeText(userData.walletId || '');
                    feedback.alert.success({ title: '📋 Wallet ID copied!' });
                  }}
                  title="Copy Wallet ID"
                >
                  <i className="fa-solid fa-copy"></i>
                </button>
              </div>
              <div className={styles.idItem}>
                <span className={styles.idLabel}>🔗 Referral Code</span>
                <span className={styles.idValue}>{userData.referralCode || 'N/A'}</span>
                <button 
                  className={styles.copyIdBtn}
                  onClick={() => {
                    navigator.clipboard.writeText(userData.referralCode || '');
                    feedback.alert.success({ title: '📋 Referral code copied!' });
                  }}
                  title="Copy Referral Code"
                >
                  <i className="fa-solid fa-copy"></i>
                </button>
              </div>
            </div>
            
            <div className={styles.profileStats}>
              <span><i className="fa-solid fa-file-alt"></i> {userPosts.length} Posts</span>
              <span><i className="fa-solid fa-users"></i> {followersCount} Followers</span>
              <span><i className="fa-solid fa-user-plus"></i> {followingCount} Following</span>
              <span>
                <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i> 
                {userRating.average > 0 ? `${userRating.average} (${userRating.total})` : 'No reviews'}
              </span>
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
        <div className={styles.profileActions}>
          <button 
            className={`${styles.btnFollow} ${isFollowing ? styles.following : ''}`} 
            onClick={handleFollowToggle}
          >
            <i className={`fa-solid ${isFollowing ? 'fa-user-minus' : 'fa-user-plus'}`}></i>
            {isFollowing ? ' Unfollow' : ' Follow'}
          </button>
          
          <button 
            className={`${styles.btnReview} ${hasReviewed ? styles.reviewed : ''}`} 
            onClick={() => setShowReviewModal(true)}
            disabled={hasReviewed}
          >
            <i className="fa-solid fa-star"></i> 
            {hasReviewed ? 'Already Reviewed' : 'Write a Review'}
          </button>
        </div>
      )}

      {isOwner && (
        <div className={`${styles.profileActions} ${styles.ownerActions}`}>
          <button className={styles.btnEditProfile} onClick={() => navigate('/settings')}>
            <i className="fa-solid fa-pen"></i> Edit Profile
          </button>
        </div>
      )}

      <div className={styles.profileSettingsGrid}>
        <button 
          className={`${styles.settingsCard} ${activeTab === 'about' ? styles.active : ''}`}
          onClick={() => setActiveTab('about')}
        >
          <div className={styles.cardIcon}><i className="fa-solid fa-user"></i></div>
          <span className={styles.cardLabel}>About</span>
        </button>

        <button 
          className={`${styles.settingsCard} ${activeTab === 'posts' ? styles.active : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          <div className={styles.cardIcon}><i className="fa-solid fa-file-alt"></i></div>
          <span className={styles.cardLabel}>Posts</span>
          <span className={styles.cardBadge}>{userPosts.length}</span>
        </button>

        <button 
          className={`${styles.settingsCard} ${activeTab === 'reviews' ? styles.active : ''}`}
          onClick={() => setActiveTab('reviews')}
        >
          <div className={styles.cardIcon}><i className="fa-solid fa-star"></i></div>
          <span className={styles.cardLabel}>Reviews</span>
          <span className={`${styles.cardBadge} ${styles.reviewBadge}`}>
            {reviews.length > 0 ? userRating.average + '★' : '0'}
          </span>
        </button>

        <button 
          className={`${styles.settingsCard} ${activeTab === 'experience' ? styles.active : ''}`}
          onClick={() => setActiveTab('experience')}
        >
          <div className={styles.cardIcon}><i className="fa-solid fa-briefcase"></i></div>
          <span className={styles.cardLabel}>Experience</span>
        </button>

        <button 
          className={`${styles.settingsCard} ${activeTab === 'education' ? styles.active : ''}`}
          onClick={() => setActiveTab('education')}
        >
          <div className={styles.cardIcon}><i className="fa-solid fa-graduation-cap"></i></div>
          <span className={styles.cardLabel}>Education</span>
        </button>

        <button 
          className={`${styles.settingsCard} ${activeTab === 'certifications' ? styles.active : ''}`}
          onClick={() => setActiveTab('certifications')}
        >
          <div className={styles.cardIcon}><i className="fa-solid fa-award"></i></div>
          <span className={styles.cardLabel}>Certifications</span>
        </button>

        <button 
          className={`${styles.settingsCard} ${activeTab === 'social' ? styles.active : ''}`}
          onClick={() => setActiveTab('social')}
        >
          <div className={styles.cardIcon}><i className="fa-solid fa-share-nodes"></i></div>
          <span className={styles.cardLabel}>Connect</span>
        </button>

        {isOwner && (
          <button 
            className={`${styles.settingsCard} ${styles.private} ${activeTab === 'private' ? styles.active : ''}`}
            onClick={() => setActiveTab('private')}
          >
            <div className={styles.cardIcon}><i className="fa-solid fa-lock"></i></div>
            <span className={styles.cardLabel}>Private</span>
          </button>
        )}
      </div>

      {/* ===== ট্যাব কন্টেন্ট ===== */}
      <div className={styles.profileTabContent}>
        {activeTab === 'about' && (
          <div className={`${styles.tabPanel} ${styles.aboutPanel}`}>
            <h3><i className="fa-solid fa-user-pen"></i> About</h3>
            <p>{userData.bio || 'No bio provided yet.'}</p>
            
            {userData.skills && (
              <div className={styles.skillsSection}>
                <h4>Skills</h4>
                <div className={styles.skillsTags}>
                  {typeof userData.skills === 'string' 
                    ? userData.skills.split(',').map((skill, idx) => (
                        <span key={idx} className={styles.skillTag}>{skill.trim()}</span>
                      ))
                    : userData.skills.map((skill, idx) => (
                        <span key={idx} className={styles.skillTag}>{skill}</span>
                      ))
                  }
                </div>
              </div>
            )}
            
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <i className="fa-solid fa-location-dot"></i>
                <span>{userData.location || 'Location not set'}</span>
              </div>
              <div className={styles.infoItem}>
                <i className="fa-solid fa-globe"></i>
                <span>{userData.website || 'No website'}</span>
              </div>
              <div className={styles.infoItem}>
                <i className="fa-solid fa-calendar"></i>
                <span>Joined {formatJoinDate(userData.createdAt)}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'posts' && (
          <div className={`${styles.tabPanel} ${styles.postsPanel}`}>
            <h3><i className="fa-solid fa-file-alt"></i> Posts ({userPosts.length})</h3>
            {userPosts.length === 0 ? (
              <div className={styles.noPosts}><i className="fa-solid fa-folder-open"></i><p>No posts yet.</p></div>
            ) : (
              <div className={styles.postsGrid}>
                {userPosts.map((post) => (
                  <div key={post.id} className={styles.postCardMini} onClick={() => navigate(`/post/${post.id}`)} style={{ cursor: 'pointer' }}>
                    {post.images && post.images.length > 0 && <img src={post.images[0]} alt={post.title} className={styles.postThumbnail} />}
                    <div className={styles.postInfo}>
                      <h4>{post.title}</h4>
                      <p>{post.description?.substring(0, 60)}...</p>
                      <span className={styles.postBudget}>৳ {formatPostBudget(post)} BDT</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className={`${styles.tabPanel} ${styles.reviewsPanel}`}>
            <div className={styles.reviewsHeader}>
              <h3><i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i> Reviews ({reviews.length})</h3>
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
            
            {reviews.length === 0 ? (
              <div className={styles.noReviews}>
                <i className="fa-solid fa-star-half-stroke"></i>
                <p>No reviews yet.</p>
                {!isOwner && !hasReviewed && (
                  <button className={styles.btnReview} onClick={() => setShowReviewModal(true)}>
                    <i className="fa-solid fa-star"></i> Be the first to review
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.reviewsList}>
                {reviews.map((review) => (
                  <div key={review.id} className={styles.reviewCard}>
                    <div className={styles.reviewHeader}>
                      <div className={styles.reviewerInfo}>
                        <img src={review.reviewerPhoto || `https://ui-avatars.com/api/?name=${review.reviewerName}&background=14b8a6&color=fff&bold=true&size=40`} alt={review.reviewerName} className={styles.reviewerAvatar} />
                        <div>
                          <h4>{review.reviewerName}</h4>
                          <div className={styles.reviewStars}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <i key={star} className={`fa-solid fa-star ${star <= review.rating ? styles.filled : ''}`}></i>
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className={styles.reviewDate}>{review.createdAt?.toDate?.()?.toDateString() || 'Recently'}</span>
                    </div>
                    <p className={styles.reviewText}>{review.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'experience' && (
          <div className={`${styles.tabPanel} ${styles.experiencePanel}`}>
            <h3><i className="fa-solid fa-briefcase"></i> Work Experience</h3>
            {userData.experience && userData.experience.length > 0 ? (
              userData.experience.map((exp, index) => (
                <div key={index} className={styles.itemCard}>
                  <div className={styles.itemHeader}><h4>{exp.role} at {exp.company}</h4></div>
                  <p className={styles.itemDate}>{exp.startDate} - {exp.endDate || 'Present'}</p>
                  <p className={styles.itemDescription}>{exp.description}</p>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}><i className="fa-solid fa-briefcase"></i><p>No experience added yet</p></div>
            )}
          </div>
        )}

        {activeTab === 'education' && (
          <div className={`${styles.tabPanel} ${styles.educationPanel}`}>
            <h3><i className="fa-solid fa-graduation-cap"></i> Education</h3>
            {userData.education && userData.education.length > 0 ? (
              userData.education.map((edu, index) => (
                <div key={index} className={styles.itemCard}>
                  <div className={styles.itemHeader}><h4>{edu.degree} - {edu.field}</h4></div>
                  <p className={styles.itemInstitution}>{edu.institution}</p>
                  <p className={styles.itemDate}>{edu.startDate} - {edu.endDate || 'Present'}</p>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}><i className="fa-solid fa-graduation-cap"></i><p>No education added yet</p></div>
            )}
          </div>
        )}

        {activeTab === 'certifications' && (
          <div className={`${styles.tabPanel} ${styles.certificationsPanel}`}>
            <h3><i className="fa-solid fa-award"></i> Certifications</h3>
            {userData.certifications && userData.certifications.length > 0 ? (
              userData.certifications.map((cert, index) => (
                <div key={index} className={styles.itemCard}>
                  <div className={styles.itemHeader}><h4>{cert.name}</h4></div>
                  <p className={styles.itemIssuer}>Issued by: {cert.issuer}</p>
                  <p className={styles.itemDate}>{cert.date}</p>
                  {cert.link && <a href={cert.link} target="_blank" rel="noopener noreferrer" className={styles.certLink}>🔗 View Certificate</a>}
                </div>
              ))
            ) : (
              <div className={styles.emptyState}><i className="fa-solid fa-award"></i><p>No certifications added yet</p></div>
            )}
          </div>
        )}

        {activeTab === 'social' && (
          <div className={`${styles.tabPanel} ${styles.socialPanel}`}>
            <div className={styles.tabHeader}>
              <h3>
                <i className="fa-solid fa-share-nodes" style={{ color: '#14b8a6' }}></i> 
                Connect & Social
              </h3>
              <p className={styles.tabSubtitle}>Connect with {userData.displayName || 'this user'} on social platforms</p>
            </div>
            
            <div className={styles.socialLinksContainer}>
              {userData.socialLinks?.linkedin && (
                <a href={userData.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className={`${styles.socialLinkItem} ${styles.linkedin}`}>
                  <i className="fa-brands fa-linkedin"></i> LinkedIn
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
                </a>
              )}
              
              {userData.socialLinks?.github && (
                <a href={userData.socialLinks.github} target="_blank" rel="noopener noreferrer" className={`${styles.socialLinkItem} ${styles.github}`}>
                  <i className="fa-brands fa-github"></i> GitHub
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
                </a>
              )}
              
              {userData.socialLinks?.youtube && (
                <a href={userData.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className={`${styles.socialLinkItem} ${styles.youtube}`}>
                  <i className="fa-brands fa-youtube"></i> YouTube
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
                </a>
              )}
              
              {userData.socialLinks?.instagram && (
                <a href={userData.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className={`${styles.socialLinkItem} ${styles.instagram}`}>
                  <i className="fa-brands fa-instagram"></i> Instagram
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
                </a>
              )}
              
              {userData.socialLinks?.twitter && (
                <a href={userData.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className={`${styles.socialLinkItem} ${styles.twitter}`}>
                  <i className="fa-brands fa-twitter"></i> Twitter/X
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
                </a>
              )}
              
              {userData.socialLinks?.website && (
                <a href={userData.socialLinks.website} target="_blank" rel="noopener noreferrer" className={`${styles.socialLinkItem} ${styles.website}`}>
                  <i className="fa-solid fa-globe"></i> Website
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '12px', opacity: 0.7 }}></i>
                </a>
              )}
              
              {(!userData.socialLinks?.linkedin && 
                !userData.socialLinks?.github && 
                !userData.socialLinks?.youtube && 
                !userData.socialLinks?.instagram && 
                !userData.socialLinks?.twitter && 
                !userData.socialLinks?.website) && (
                <div className={styles.emptyState}>
                  <i className="fa-solid fa-share-nodes"></i>
                  <p>No social links added yet</p>
                  <small>This user hasn't added any social profiles</small>
                </div>
              )}
            </div>
          </div>
        )}

        {isOwner && activeTab === 'private' && (
          <div className={`${styles.tabPanel} ${styles.privatePanel}`}>
            <h3><i className="fa-solid fa-lock"></i> Private Information</h3>
            <div className={styles.privateInfoGrid}>
              <div className={styles.privateItem}>
                <label>Email</label>
                <p>{currentUser?.email || 'Not set'}</p>
              </div>
              <div className={styles.privateItem}>
                <label>Wallet Balance</label>
                <p>৳ {userData.balance || 0} BDT</p>
              </div>
              <div className={styles.privateItem}>
                <label>User ID</label>
                <p>{userId}</p>
              </div>
              <div className={styles.privateItem}>
                <label>Account Status</label>
                <p className={`${styles[`status${userData.isVerified ? 'Verified' : 'Pending'}`]}`}>
                  {userData.isVerified ? '✅ Verified' : userData.verificationStatus === 'pending' ? '⏳ Pending' : '⚠️ Not Verified'}
                </p>
              </div>
              <div className={styles.privateItem}>
                <label>Phone Number</label>
                <p>{userData.phone || 'Not set'}</p>
              </div>
              <div className={styles.privateItem}>
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

      {/* ✅ Facebook-স্টাইল ফুলস্ক্রিন অ্যাভাটার জুম */}
      {showAvatarZoom && (
        <div className={styles.avatarZoomOverlay} onClick={() => setShowAvatarZoom(false)}>
          <button
            className={styles.avatarZoomClose}
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
            className={styles.avatarZoomImage}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default UserProfilePage;