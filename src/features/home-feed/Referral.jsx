// src/pages/Referral.jsx

import React, { useState, useEffect } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../shared/ui/Sound/SoundEvents';
import useHideBottomNav from "../../shared/hooks/useHideBottomNav";
import styles from './Referral.module.css';

// ============================================================
// ✅ Badge System
// ============================================================
const BADGE_SYSTEM = [
  { name: 'Bronze', icon: '🥉', minReferrals: 0, color: '#cd7f32' },
  { name: 'Silver', icon: '🥈', minReferrals: 5, color: '#c0c0c0' },
  { name: 'Gold', icon: '🥇', minReferrals: 20, color: '#ffd700' },
  { name: 'Platinum', icon: '💎', minReferrals: 50, color: '#e5e4e2' },
  { name: 'Diamond', icon: '💎', minReferrals: 100, color: '#b9f2ff' },
  { name: 'Legend', icon: '👑', minReferrals: 500, color: '#ff6b35' },
];

const Referral = () => {
  useHideBottomNav();
  const navigate = useNavigate();
  const user = auth.currentUser;
  const feedback = useFeedback();
  const { playEvent } = useSound();
  
  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading);
  const [referralCode, setReferralCode] = useState('');
  const [stats, setStats] = useState({
    totalInvites: 0,
    registeredUsers: 0,
    verifiedUsers: 0,
    activeUsers: 0
  });
  const [referrals, setReferrals] = useState([]);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [userBadge, setUserBadge] = useState({ name: 'Bronze', icon: '🥉', color: '#cd7f32' });

  // ============================================================
  // ✅ Back Handler - with Sound
  // ============================================================
  const handleBack = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate(-1);
  };

  // ============================================================
  // ✅ Generate Referral Code
  // ============================================================
  const generateReferralCode = (email) => {
    const prefix = email?.split('@')[0]?.slice(0, 4)?.toUpperCase() || 'USER';
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}${random}`;
  };

  // ============================================================
  // ✅ Get User Badge
  // ============================================================
  const getUserBadge = (totalReferrals) => {
    let badge = BADGE_SYSTEM[0];
    for (const b of BADGE_SYSTEM) {
      if (totalReferrals >= b.minReferrals) {
        badge = b;
      }
    }
    return badge;
  };

  // ============================================================
  // ✅ Load Referral Data
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    const loadReferralData = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const data = userSnap.data();
          
          let code = data.referralCode;
          if (!code) {
            code = generateReferralCode(user.email);
            await updateDoc(userRef, { 
              referralCode: code,
              referralCount: 0,
              updatedAt: new Date()
            });
          }
          setReferralCode(code);
          
          await loadReferrals(userRef);
        }
      } catch (error) {
        console.error("Error loading referral data:", error);
        feedback.alert.error({ message: 'Failed to load referral data.' });
      } finally {
        setLoading(false);
      }
    };

    loadReferralData();
  }, [user, navigate]);

  // ============================================================
  // ✅ Load Referrals List with Status
  // ============================================================
  const loadReferrals = async (userRef) => {
    try {
      const q = query(
        collection(db, 'users'),
        where('referredBy', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      
      let totalInvites = snapshot.size;
      let registeredUsers = 0;
      let verifiedUsers = 0;
      let activeUsers = 0;
      
      const referralList = snapshot.docs.map(doc => {
        const data = doc.data();
        const isVerified = data.isVerified || false;
        const isComplete = data.isComplete || false;
        const hasDeal = data.hasDeal || false;
        
        let status = 'registered';
        if (isVerified && isComplete && hasDeal) {
          status = 'active';
          activeUsers++;
        } else if (isVerified && isComplete) {
          status = 'verified';
          verifiedUsers++;
        } else {
          status = 'registered';
          registeredUsers++;
        }
        
        if (isVerified) verifiedUsers++;
        if (isComplete) registeredUsers++;
        
        return {
          id: doc.id,
          ...data,
          status: status,
          statusLabel: status === 'active' ? '✅ Active' : 
                       status === 'verified' ? '🔄 Verified' : '📝 Registered',
          createdAt: data.createdAt?.toDate?.() || new Date()
        };
      });
      
      const verifiedCount = referralList.filter(r => r.status === 'verified' || r.status === 'active').length;
      const activeCount = referralList.filter(r => r.status === 'active').length;
      
      setStats({
        totalInvites: totalInvites,
        registeredUsers: totalInvites,
        verifiedUsers: verifiedCount,
        activeUsers: activeCount
      });
      
      const badge = getUserBadge(totalInvites);
      setUserBadge(badge);
      
      if (userRef) {
        await updateDoc(userRef, {
          referralBadge: badge.name,
          referralCount: totalInvites,
          updatedAt: new Date()
        });
      }
      
      setReferrals(referralList);
      
    } catch (error) {
      console.error("Error loading referrals:", error);
      feedback.alert.error({ message: 'Failed to load referral list.' });
    }
  };

  // ============================================================
  // ✅ Copy Code - with Sound
  // ============================================================
  const copyCode = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    feedback.alert.success({ message: '✅ Referral code copied!' });
    setTimeout(() => setCopied(false), 2000);
  };

  // ============================================================
  // ✅ Copy Link - with Sound
  // ============================================================
  const copyLink = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    const link = `${window.location.origin}/register?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    feedback.alert.success({ message: '✅ Referral link copied!' });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // ============================================================
  // ✅ Share Referral - with Sound
  // ============================================================
  const shareReferral = async () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    
    const shareData = {
      title: 'Join WorkTrustbd!',
      text: `Use my referral code ${referralCode} to join WorkTrustbd!`,
      url: `${window.location.origin}/register?ref=${referralCode}`
    };

    setShareLoading(true);

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        feedback.alert.success({ message: '✅ Shared successfully!' });
      } else {
        copyLink();
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error("Share error:", error);
        feedback.alert.error({ message: 'Failed to share. Please try again.' });
      }
    } finally {
      setShareLoading(false);
    }
  };

  // ============================================================
  // ✅ Format Date
  // ============================================================
  const formatDate = (date) => {
    if (!date) return 'Recently';
    return date.toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // ============================================================
  // ✅ Loading State
  // ============================================================
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-cube ${styles.loadingIcon}`} />
          <h2>Loading Referral Data...</h2>
          <p>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your referral information...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // ✅ Render
  // ============================================================
  return (
    <div className={styles.referralContainer}>
      <div className={styles.referralCard}>
        
        {/* Back Button */}
        <button className={styles.backBtnSimple} onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        {/* Header */}
        <div className={styles.referralHeader}>
          <h2>
            <i className="fa-solid fa-user-plus" style={{ color: '#fbbf24' }}></i> 
            Refer & Earn
          </h2>
        </div>

        <p className={styles.referralSubtitle}>
          Invite friends to join WorkTrustbd and grow together!
        </p>

        {/* Badge Display */}
        <div className={styles.referralBadgeDisplay}>
          <div className={styles.badgeIcon} style={{ background: userBadge.color }}>
            {userBadge.icon}
          </div>
          <div className={styles.badgeInfo}>
            <h3>{userBadge.name} Referrer</h3>
            <p>You've invited {stats.totalInvites} friends</p>
          </div>
        </div>

        {/* Stats */}
        <div className={styles.referralStats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Invites</span>
            <strong className={styles.statValue}>{stats.totalInvites}</strong>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Registered</span>
            <strong className={styles.statValue}>{stats.registeredUsers}</strong>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Verified</span>
            <strong className={styles.statValue}>{stats.verifiedUsers}</strong>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Active</span>
            <strong className={styles.statValue}>{stats.activeUsers}</strong>
          </div>
        </div>

        {/* Next Badge Progress */}
        <div className={styles.nextBadgeSection}>
          <div className={styles.nextBadgeHeader}>
            <span>Next Badge</span>
            <span className={styles.nextBadgeName}>
              {getUserBadge(stats.totalInvites + 1).icon} {getUserBadge(stats.totalInvites + 1).name}
            </span>
          </div>
          <div className={styles.badgeProgress}>
            <div 
              className={styles.badgeProgressBar} 
              style={{ 
                width: `${Math.min((stats.totalInvites / BADGE_SYSTEM.find(b => b.name === getUserBadge(stats.totalInvites + 1).name)?.minReferrals || 5) * 100, 100)}%` 
              }}
            ></div>
          </div>
          <p className={styles.badgeProgressText}>
            {stats.totalInvites} / {BADGE_SYSTEM.find(b => b.name === getUserBadge(stats.totalInvites + 1).name)?.minReferrals || 5} invites needed
          </p>
        </div>

        {/* Referral Code */}
        <div className={styles.referralCodeSection}>
          <p className={styles.sectionLabel}>
            <i className="fa-solid fa-key"></i> Your Referral Code
          </p>
          <div className={styles.codeBox}>
            <span className={styles.codeText}>{referralCode}</span>
            <button className={styles.copyBtn} onClick={copyCode}>
              {copied ? (
                <>
                  <i className="fa-solid fa-check"></i> Copied!
                </>
              ) : (
                <>
                  <i className="fa-regular fa-copy"></i> Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Referral Link */}
        <div className={styles.referralLinkSection}>
          <p className={styles.sectionLabel}>
            <i className="fa-solid fa-link"></i> Referral Link
          </p>
          <div className={styles.linkBox}>
            <span className={styles.linkText}>
              {window.location.origin}/register?ref={referralCode}
            </span>
            <button className={styles.copyBtn} onClick={copyLink}>
              {copiedLink ? (
                <>
                  <i className="fa-solid fa-check"></i> Copied!
                </>
              ) : (
                <>
                  <i className="fa-regular fa-copy"></i> Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Share Button */}
        <button 
          className={styles.shareBtn} 
          onClick={shareReferral}
          disabled={shareLoading}
        >
          {shareLoading ? (
            <>
              <i className="fa-solid fa-spinner fa-spin"></i> Sharing...
            </>
          ) : (
            <>
              <i className="fa-solid fa-share-nodes"></i> Share with Friends
            </>
          )}
        </button>

        {/* How it Works */}
        <div className={styles.referralInfo}>
          <h4>
            <i className="fa-solid fa-circle-info"></i> How it works?
          </h4>
          <ul>
            <li>
              <i className="fa-solid fa-share"></i>
              Share your referral code with friends
            </li>
            <li>
              <i className="fa-solid fa-user-check"></i>
              They sign up using your code
            </li>
            <li>
              <i className="fa-solid fa-user-plus"></i>
              Earn referral badges as you invite more friends
            </li>
            <li>
              <i className="fa-solid fa-trophy"></i>
              Get featured on the leaderboard
            </li>
          </ul>
        </div>

        {/* Referral List */}
        {referrals.length > 0 && (
          <div className={styles.referralListSection}>
            <h4>
              <i className="fa-solid fa-users"></i> Your Referrals ({referrals.length})
            </h4>
            <div className={styles.referralList}>
              {referrals.map((ref) => (
                <div key={ref.id} className={styles.referralItem}>
                  <div className={styles.refAvatar}>
                    <i className="fa-solid fa-user"></i>
                  </div>
                  <div className={styles.refInfo}>
                    <span className={styles.refName}>{ref.displayName || 'User'}</span>
                    <span className={styles.refDate}>{formatDate(ref.createdAt)}</span>
                  </div>
                  <span className={`${styles.refStatus} ${styles[ref.status]}`}>
                    {ref.statusLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard (Coming Soon) */}
        <div className={styles.leaderboardComing}>
          <h4>
            <i className="fa-solid fa-trophy"></i> Leaderboard
          </h4>
          <p className={styles.comingSoon}>
            <i className="fa-solid fa-clock"></i> Coming Soon!
          </p>
          <p className={styles.leaderboardHint}>
            Top referrers will be featured here monthly
          </p>
        </div>

        {/* Footer */}
        <div className={styles.referralFooter}>
          <p>
            <i className="fa-solid fa-shield-check"></i> 
            Terms and conditions apply
          </p>
        </div>

      </div>
    </div>
  );
};

export default Referral;