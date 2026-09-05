// src/pages/ProfileCard.jsx

import React, { useState, useEffect, useRef } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../shared/ui/Sound/SoundEvents';
import useHideBottomNav from "../../shared/hooks/useHideBottomNav";
import styles from './ProfileCard.module.css';

// ============================================================
// ✅ Digital Trust Card ID Generator
// ============================================================
const generateTrustCardId = (uid) => {
  const prefix = 'WTX';
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const suffix = uid?.slice(-6).toUpperCase() || '000000';
  return `${prefix}-${random}-${suffix}`;
};

// ============================================================
// ✅ Trust Score Calculation (Weighted)
// ============================================================
const calculateTrustScore = (userData) => {
  let score = 0;

  // 1. Verification (40%)
  let verificationScore = 0;
  if (userData.isVerified) verificationScore += 15;
  if (userData.emailVerified) verificationScore += 10;
  if (userData.faceVerified) verificationScore += 10;
  if (userData.phoneVerified) verificationScore += 5;
  score += Math.min(verificationScore, 40);

  // 2. Reviews (20%)
  const reviews = userData.reviews || 0;
  const reviewScore = Math.min(reviews * 2, 20);
  score += reviewScore;

  // 3. Completed Jobs (20%)
  const jobsCompleted = userData.completedJobs || 0;
  const jobScore = Math.min(jobsCompleted * 2, 20);
  score += jobScore;

  // 4. Account Age (10%)
  const createdAt = userData.createdAt?.toDate?.() || new Date();
  const ageInDays = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));
  if (ageInDays > 365) score += 10;
  else if (ageInDays > 180) score += 8;
  else if (ageInDays > 90) score += 6;
  else if (ageInDays > 30) score += 4;
  else if (ageInDays > 7) score += 2;

  // 5. Response Rate (5%)
  const responseRate = userData.responseRate || 0;
  if (responseRate > 90) score += 5;
  else if (responseRate > 70) score += 3;
  else if (responseRate > 50) score += 1;

  // 6. Dispute Rate (5%)
  const disputeRate = userData.disputeRate || 0;
  if (disputeRate < 5) score += 5;
  else if (disputeRate < 10) score += 3;
  else if (disputeRate < 20) score += 1;

  return Math.min(Math.round(score), 100);
};

// ============================================================
// ✅ Get Rating Stars (FontAwesome)
// ============================================================
const getRatingStars = (rating) => {
  const fullStars = Math.floor(rating || 0);
  const hasHalfStar = (rating || 0) - fullStars >= 0.5;
  
  let stars = [];
  for (let i = 0; i < fullStars; i++) {
    stars.push(<i key={`full-${i}`} className={`fa-solid fa-star ${styles.filled}`}></i>);
  }
  if (hasHalfStar) {
    stars.push(<i key="half" className={`fa-solid fa-star-half-stroke ${styles.filled}`}></i>);
  }
  const emptyCount = 5 - fullStars - (hasHalfStar ? 1 : 0);
  for (let i = 0; i < emptyCount; i++) {
    stars.push(<i key={`empty-${i}`} className="fa-regular fa-star"></i>);
  }
  return stars;
};

// ============================================================
// ✅ Get Initials
// ============================================================
const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

// ============================================================
// ✅ Get Level Badge
// ============================================================
const getLevelBadge = (trustScore) => {
  if (trustScore >= 90) return { label: '🏆 Legend', color: '#ffd700', bg: '#ffd70015' };
  if (trustScore >= 75) return { label: '💎 Diamond', color: '#b9f2ff', bg: '#b9f2ff15' };
  if (trustScore >= 60) return { label: '🥇 Gold', color: '#f59e0b', bg: '#f59e0b15' };
  if (trustScore >= 45) return { label: '🥈 Silver', color: '#94a3b8', bg: '#94a3b815' };
  return { label: '🥉 Bronze', color: '#cd7f32', bg: '#cd7f3215' };
};

// ============================================================
// ✅ Main Component
// ============================================================
const ProfileCard = () => {
  useHideBottomNav();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const { playEvent } = useSound();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading);
  const [userData, setUserData] = useState(null);
  const [trustScore, setTrustScore] = useState(0);
  const [trustCardId, setTrustCardId] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyIdSuccess, setCopyIdSuccess] = useState(false);
  const cardRef = useRef(null);

  // ============================================================
  // ✅ Load User Data
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    const loadUserData = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserData(data);
          
          const score = calculateTrustScore(data);
          setTrustScore(score);
          
          const cardId = data.trustCardId || generateTrustCardId(user.uid);
          setTrustCardId(cardId);
          
          if (!data.trustCardId) {
            await updateDoc(userRef, { trustCardId: cardId });
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
        feedback.alert.error({ message: 'Failed to load profile data.' });
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [user, navigate]);

  // ============================================================
  // ✅ Back Handler
  // ============================================================
  const handleBack = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate(-1);
  };

  // ============================================================
  // ✅ Share Profile
  // ============================================================
  const handleShare = async () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    const shareData = {
      title: `${userData?.displayName || 'User'}'s Trust Card`,
      text: `Check out ${userData?.displayName || 'User'}'s Digital Trust Card on WorkTrustbd!\nTrust Score: ${trustScore}%`,
      url: `${window.location.origin}/public-profile/${user.uid}`
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        feedback.alert.success({ message: '✅ Trust Card shared!' });
      } else {
        handleCopyLink();
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        feedback.alert.error({ message: 'Failed to share.' });
      }
    }
  };

  // ============================================================
  // ✅ Copy Profile Link
  // ============================================================
  const handleCopyLink = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    const link = `${window.location.origin}/public-profile/${user.uid}`;
    navigator.clipboard.writeText(link);
    setCopySuccess(true);
    feedback.alert.success({ message: '✅ Profile link copied!' });
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // ============================================================
  // ✅ Copy Trust Card ID
  // ============================================================
  const handleCopyCardId = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigator.clipboard.writeText(trustCardId);
    setCopyIdSuccess(true);
    feedback.alert.success({ message: '✅ Trust Card ID copied!' });
    setTimeout(() => setCopyIdSuccess(false), 2000);
  };

  // ============================================================
  // ✅ Download Card
  // ============================================================
  const handleDownload = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    feedback.alert.info({ 
      message: '⏳ Download feature coming soon!',
      description: 'PNG, JPEG, and PDF export will be available in the next update.'
    });
  };

  // ============================================================
  // ✅ Toggle QR
  // ============================================================
  const toggleQR = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setShowQR(!showQR);
  };

  // ============================================================
  // ✅ Public Profile URL & QR Code (API)
  // ============================================================
  const publicProfileUrl = `${window.location.origin}/public-profile/${user?.uid || ''}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicProfileUrl)}&bgcolor=ffffff&color=0f1420&margin=5`;

  // ============================================================
  // ✅ Loading State
  // ============================================================
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-cube ${styles.loadingIcon}`} />
          <h2>Loading Trust Card...</h2>
          <p>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your digital identity...
          </p>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className={styles.profilecardError}>
        <i className="fa-solid fa-triangle-exclamation"></i>
        <p>Could not load profile data.</p>
        <button className={styles.retryBtn} onClick={handleBack}>
          Go Back
        </button>
      </div>
    );
  }

  // ============================================================
  // ✅ Render Data
  // ============================================================
  const displayName = userData.displayName || userData.firstName || 'User';
  const role = userData.role === 'freelancer' ? 'Seller' : 'Buyer';
  const isVerified = userData.isVerified || false;
  const rating = userData.rating || 4.5;
  const completedJobs = userData.completedJobs || 0;
  const successRate = userData.successRate || 95;
  const responseTime = userData.responseTime || '~5 min';
  const lastActive = userData.lastActive?.toDate?.() || new Date();
  const repeatClients = userData.repeatClients || 0;
  const cancellationRate = userData.cancellationRate || 0;
  const memberSince = userData.createdAt?.toDate?.() || new Date();
  const levelBadge = getLevelBadge(trustScore);
  
  const verificationBadges = {
    nid: userData.documentVerified || userData.nidVerified || false,
    face: userData.faceVerified || false,
    email: userData.emailVerified || false,
    phone: userData.phoneVerified || false,
  };

  const verificationCount = Object.values(verificationBadges).filter(Boolean).length;

  return (
    <div className={styles.profilecardContainer}>
      <div className={styles.profilecardWrapper}>
        
        {/* Back Button */}
        <button className={styles.backBtnSimple} onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        {/* Digital Trust Card */}
        <div className={styles.profileCard} ref={cardRef}>
          
          {/* Card Header */}
          <div className={styles.cardHeader}>
            <div className={styles.cardAvatar}>
              {userData.photoURL ? (
                <img src={userData.photoURL} alt={displayName} />
              ) : (
                <div className={styles.avatarInitials}>{getInitials(displayName)}</div>
              )}
              {isVerified && (
                <span className={styles.verifiedBadge}>
                  <i className="fa-solid fa-check-circle"></i>
                </span>
              )}
            </div>
            <div className={styles.cardUserInfo}>
              <div className={styles.nameRow}>
                <h2>{displayName}</h2>
                <span className={styles.levelBadge} style={{ background: levelBadge.bg, color: levelBadge.color }}>
                  {levelBadge.label}
                </span>
              </div>
              <p className={styles.cardRole}>
                {role} {isVerified && '✓'}
              </p>
              <div className={styles.cardRating}>
                {getRatingStars(rating)}
                <span className={styles.ratingScore}>{rating}</span>
                <span className={styles.ratingTotal}>({userData.reviews || 0} reviews)</span>
              </div>
            </div>
          </div>

          {/* Trust Card ID */}
          <div className={styles.trustCardId}>
            <span className={styles.idLabel}>
              <i className="fa-regular fa-id-card"></i> Trust Card ID
            </span>
            <span className={styles.idValue}>{trustCardId}</span>
            <button className={styles.copyIdBtnSmall} onClick={handleCopyCardId}>
              {copyIdSuccess ? (
                <i className="fa-solid fa-check"></i>
              ) : (
                <i className="fa-regular fa-copy"></i>
              )}
            </button>
          </div>

          {/* Trust Score */}
          <div className={styles.cardTrustScore}>
            <div className={styles.trustScoreCircle}>
              <svg viewBox="0 0 100 100">
                <circle className={styles.trustBg} cx="50" cy="50" r="45" />
                <circle 
                  className={styles.trustProgress} 
                  cx="50" 
                  cy="50" 
                  r="45"
                  strokeDasharray={`${trustScore * 2.827} 282.7`}
                />
              </svg>
              <div className={styles.trustScoreText}>
                <span className={styles.trustNumber}>{trustScore}%</span>
                <span className={styles.trustLabel}>Trust Score</span>
              </div>
            </div>
            <div className={styles.trustStats}>
              <div className={styles.trustStat}>
                <span className={styles.statNumber}>{completedJobs}</span>
                <span className={styles.statLabel}>Jobs Done</span>
              </div>
              <div className={styles.trustStat}>
                <span className={styles.statNumber}>{successRate}%</span>
                <span className={styles.statLabel}>Success Rate</span>
              </div>
              <div className={styles.trustStat}>
                <span className={styles.statNumber}>{verificationCount}/4</span>
                <span className={styles.statLabel}>Verified</span>
              </div>
              <div className={styles.trustStat}>
                <span className={styles.statNumber}>{repeatClients}</span>
                <span className={styles.statLabel}>Repeat Clients</span>
              </div>
            </div>
          </div>

          {/* Additional Stats */}
          <div className={styles.cardStatsRow}>
            <div className={styles.statMini}>
              <i className="fa-regular fa-clock"></i>
              <span>Response: {responseTime}</span>
            </div>
            <div className={styles.statMini}>
              <i className="fa-regular fa-calendar"></i>
              <span>Active: {lastActive.toLocaleDateString()}</span>
            </div>
            <div className={styles.statMini}>
              <i className="fa-regular fa-circle-check"></i>
              <span>Cancellation: {cancellationRate}%</span>
            </div>
          </div>

          {/* Verification Badges */}
          <div className={styles.cardVerification}>
            <h4>Verification</h4>
            <div className={styles.badgesGrid}>
              <div className={`${styles.badgeItem} ${verificationBadges.nid ? styles.verified : styles.pending}`}>
                <i className="fa-solid fa-id-card"></i>
                <span>{verificationBadges.nid ? '✅ NID' : '⏳ NID'}</span>
              </div>
              <div className={`${styles.badgeItem} ${verificationBadges.face ? styles.verified : styles.pending}`}>
                <i className="fa-solid fa-face-smile"></i>
                <span>{verificationBadges.face ? '✅ Face' : '⏳ Face'}</span>
              </div>
              <div className={`${styles.badgeItem} ${verificationBadges.email ? styles.verified : styles.pending}`}>
                <i className="fa-solid fa-envelope"></i>
                <span>{verificationBadges.email ? '✅ Email' : '⏳ Email'}</span>
              </div>
              <div className={`${styles.badgeItem} ${verificationBadges.phone ? styles.verified : styles.pending}`}>
                <i className="fa-solid fa-phone"></i>
                <span>{verificationBadges.phone ? '✅ Phone' : '⏳ Phone'}</span>
              </div>
            </div>
          </div>

          {/* QR Code Section - API Version */}
          <div className={styles.cardQrSection}>
            <button className={styles.qrToggleBtn} onClick={toggleQR}>
              <i className="fa-solid fa-qrcode"></i>
              {showQR ? 'Hide QR' : 'Show QR'}
            </button>
            {showQR && (
              <div className={styles.qrDisplay}>
                <img 
                  src={qrCodeUrl} 
                  alt="Profile QR Code" 
                  width={180} 
                  height={180}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/180x180?text=QR+Error';
                  }}
                />
                <p className={styles.qrHint}>Scan to view profile</p>
              </div>
            )}
          </div>

          {/* Public URL */}
          <div className={styles.cardPublicUrl}>
            <i className="fa-solid fa-link"></i>
            <span className={styles.urlText}>{publicProfileUrl}</span>
            <button className={styles.copyUrlBtn} onClick={handleCopyLink}>
              {copySuccess ? (
                <i className="fa-solid fa-check"></i>
              ) : (
                <i className="fa-regular fa-copy"></i>
              )}
            </button>
          </div>

          {/* Card Footer */}
          <div className={styles.cardFooter}>
            <span className={styles.memberSince}>
              <i className="fa-regular fa-calendar"></i>
              Member since {memberSince.toLocaleDateString('bn-BD', {
                month: 'short',
                year: 'numeric'
              })}
            </span>
            <span className={styles.cardVersion}>
              <i className="fa-regular fa-shield-check"></i>
              Digital Trust Card v2
            </span>
          </div>

          {/* Actions */}
          <div className={styles.cardActions}>
            <button className={`${styles.actionBtn} ${styles.share}`} onClick={handleShare}>
              <i className="fa-solid fa-share-nodes"></i> Share
            </button>
            <button className={`${styles.actionBtn} ${styles.copy}`} onClick={handleCopyLink}>
              <i className="fa-regular fa-copy"></i> {copySuccess ? 'Copied!' : 'Copy Link'}
            </button>
            <button className={`${styles.actionBtn} ${styles.download}`} onClick={handleDownload}>
              <i className="fa-solid fa-download"></i> Download
            </button>
          </div>

          {/* Verified by */}
          <div className={styles.cardVerifiedBy}>
            <i className="fa-regular fa-circle-check"></i>
            <span>Verified by WorkTrustbd • Digital Trust Card</span>
          </div>

        </div>

        {/* Footer */}
        <div className={styles.profilecardFooter}>
          <p>
            <i className="fa-solid fa-shield-check"></i>
            Your Trust Card is public and secure. Share it with confidence.
          </p>
        </div>

      </div>
    </div>
  );
};

export default ProfileCard;