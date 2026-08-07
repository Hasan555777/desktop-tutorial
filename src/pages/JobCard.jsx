// src/components/JobCard.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './JobCard.css';
import { arrayUnion, arrayRemove, doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/firebase';



function JobCard({ 
  id, 
  job, 
  onBidAndChatClick, 
  searchTerm, 
  highlightText: highlightTextProp,
  onUnsave,
  isSavedExternally
}) {
  
  // ── ডিস্ট্রাকচারিং ──
  const {
    id: jobId,
    userId,
    clientName: initialClientName,
    clientPhoto: initialClientPhoto,
    avatarBg,
    avatarInitial,
    verified,
    time,
    title,
    description,
    images,
    budget: oldBudget,
    deadline: oldDeadline,
    proposals,
    createdAt,
    budget: budgetData,
    deadline: deadlineData,
    isNegotiable,
    price,
    deliveryDays
  } = job || {};

  const navigate = useNavigate();

  // ── স্টেট ──
  const [activeZoomImage, setActiveZoomImage] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [rating, setRating] = useState({ average: 0, total: 0 });
  const [loadingRating, setLoadingRating] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState({});
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  const [clientProfile, setClientProfile] = useState({
    clientName: initialClientName || '',
    clientPhoto: initialClientPhoto || '',
    avatarBg: avatarBg || 'linear-gradient(135deg, #438e82, #0f172a)',
    avatarInitial: avatarInitial || initialClientName?.charAt(0) || 'U',
    verified: verified || false
  });

  // ============================================================
  // ✅ Budget Display Helper (স্টেটের পর ডিফাইন করুন)
  // ============================================================
  const getBudgetDisplay = useCallback(() => {
    // নতুন ফরম্যাট
    if (budgetData && typeof budgetData === 'object') {
      if (budgetData.type === 'fixed') {
        return {
          display: `TK ${Number(budgetData.amount || 0).toLocaleString('en-IN')} BDT`,
          isNegotiable: budgetData.isNegotiable || false,
          type: 'fixed',
          amount: budgetData.amount
        };
      } else if (budgetData.type === 'range') {
        return {
          display: `TK ${Number(budgetData.min || 0).toLocaleString('en-IN')} - ${Number(budgetData.max || 0).toLocaleString('en-IN')} BDT`,
          isNegotiable: budgetData.isNegotiable || false,
          type: 'range',
          min: budgetData.min,
          max: budgetData.max
        };
      }
    }

    // পুরানো ফরম্যাট (fallback)
    const budgetValue = oldBudget || price || 0;
    return {
      display: `TK ${Number(budgetValue).toLocaleString('en-IN')} BDT`,
      isNegotiable: isNegotiable || false,
      type: 'fixed',
      amount: budgetValue
    };
  }, [oldBudget, budgetData, price, isNegotiable]);

  // ============================================================
  // ✅ Deadline Display Helper (স্টেটের পর ডিফাইন করুন)
  // ============================================================
  const getDeadlineDisplay = useCallback(() => {
    // নতুন ফরম্যাট
    if (deadlineData && typeof deadlineData === 'object') {
      if (deadlineData.type === 'fixed') {
        return {
          display: `${Number(deadlineData.days || 0)} days`,
          type: 'fixed',
          days: deadlineData.days
        };
      } else if (deadlineData.type === 'range') {
        return {
          display: `${Number(deadlineData.min || 0)} - ${Number(deadlineData.max || 0)} days`,
          type: 'range',
          min: deadlineData.min,
          max: deadlineData.max
        };
      }
    }

    // পুরানো ফরম্যাট (fallback)
    const deadlineValue = oldDeadline || deliveryDays || 0;
    return {
      display: `${Number(deadlineValue)} days`,
      type: 'fixed',
      days: deadlineValue
    };
  }, [oldDeadline, deadlineData, deliveryDays]);


  const budgetInfo = getBudgetDisplay();
  const deadlineInfo = getDeadlineDisplay();

  // ============================================================
  // ✅ ইমেজ লোডিং হ্যান্ডলার
  // ============================================================
  const handleImageLoad = useCallback((index) => {
    setImagesLoaded(prev => ({ ...prev, [index]: true }));
  }, []);

  const handleAvatarLoad = useCallback(() => {
    setAvatarLoaded(true);
  }, []);

  // ============================================================
  // ✅ হাইলাইট ফাংশন
  // ============================================================
  const defaultHighlight = useCallback((text, searchTerm) => {
    if (!searchTerm || !text) return text;
    try {
      const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, i) => 
        regex.test(part) ? <mark key={i} className="highlight">{part}</mark> : part
      );
    } catch (e) {
      return text;
    }
  }, []);

  const highlightText = highlightTextProp || defaultHighlight;

  // ============================================================
  // ✅ টাইম ফরম্যাট ফাংশন
  // ============================================================
  const getDateFromTimestamp = useCallback((timestamp) => {
    if (!timestamp) return new Date();
    if (typeof timestamp === 'number') return new Date(timestamp);
    if (typeof timestamp === 'string') return new Date(timestamp);
    if (timestamp instanceof Date) return timestamp;
    if (timestamp.toDate) return timestamp.toDate();
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
    return new Date(timestamp);
  }, []);

  const timeAgo = useCallback((date) => {
    const d = getDateFromTimestamp(date);
    if (isNaN(d.getTime())) return 'Just now';

    const seconds = Math.floor((new Date() - d) / 1000);
    if (seconds < 0) return 'Just now';

    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'mo', seconds: 2592000 },
      { label: 'd', seconds: 86400 },
      { label: 'h', seconds: 3600 },
      { label: 'm', seconds: 60 }
    ];

    for (const interval of intervals) {
      const count = Math.floor(seconds / interval.seconds);
      if (count >= 1) {
        return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
      }
    }
    return 'Just now';
  }, [getDateFromTimestamp]);

  // ============================================================
  // ✅ রেটিং ফেচ
  // ============================================================
  const fetchRating = useCallback(async () => {
    if (!userId) {
      setLoadingRating(false);
      return;
    }

    try {
      const reviewsRef = collection(db, 'reviews');
      const q = query(reviewsRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      const reviews = snapshot.docs.map(doc => doc.data());
      const total = reviews.length;
      
      if (total > 0) {
        const sum = reviews.reduce((acc, rev) => acc + (rev.rating || 0), 0);
        const average = Math.round((sum / total) * 10) / 10;
        setRating({ average, total });
      } else {
        setRating({ average: 0, total: 0 });
      }
    } catch (error) {
      console.error("Error fetching rating:", error);
    } finally {
      setLoadingRating(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRating();
  }, [fetchRating]);

  // ============================================================
  // ✅ ইউজারের সর্বশেষ প্রোফাইল ডেটা ফেচ
  // ============================================================
  const fetchClientProfile = useCallback(async () => {
    if (!userId) return;

    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        
        const displayName = data.displayName || '';
        const firstName = data.firstName || '';
        const lastName = data.lastName || '';
        const fullName = displayName || (firstName && lastName ? `${firstName} ${lastName}` : initialClientName || 'User');
        
        const newPhoto = data.photoURL || initialClientPhoto || '';
        const isVerified = data.isVerified || false;

        setClientProfile(prev => ({
          ...prev,
          clientName: fullName,
          clientPhoto: newPhoto,
          avatarInitial: fullName?.charAt(0) || 'U',
          verified: isVerified
        }));
      }
    } catch (error) {
      console.error("Error fetching client profile:", error);
    }
  }, [userId, initialClientName, initialClientPhoto]);

  useEffect(() => {
    fetchClientProfile();
  }, [fetchClientProfile]);

  // ============================================================
  // ✅ সেভ স্ট্যাটাস সিঙ্ক
  // ============================================================
  useEffect(() => {
    if (isSavedExternally !== undefined) {
      setIsSaved(isSavedExternally);
    }
  }, [isSavedExternally]);

  useEffect(() => {
    if (isSavedExternally !== undefined) return;
    
    const checkIfSaved = async () => {
      if (!auth.currentUser || !jobId) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const savedPosts = data.savedPosts || [];
          setIsSaved(savedPosts.includes(jobId));
        }
      } catch (error) {
        console.error("Error checking saved status:", error);
      }
    };
    
    checkIfSaved();
  }, [jobId, isSavedExternally]);

  // ============================================================
  // ✅ ইমেজ লোডিং
  // ============================================================
  const postImages = useMemo(() => {
    if (!images || !Array.isArray(images) || images.length === 0) return [];
    
    const timestamp = Date.now();
    return images.map(img => {
      if (img && typeof img === 'string') {
        const baseUrl = img.split('?')[0];
        return `${baseUrl}?v=${timestamp}`;
      }
      return img;
    });
  }, [images]);

  // ============================================================
  // ✅ ইমেজ এরর হ্যান্ডলার
  // ============================================================
  const handleImageError = useCallback((e) => {
    e.target.onerror = null;
    e.target.src = '/images/placeholder-image.jpg';
    e.target.alt = 'Image not available';
  }, []);

  // ============================================================
  // ✅ পোস্ট সেভ/আনসেভ
  // ============================================================
  const toggleSavePost = useCallback(async () => {
    if (!auth.currentUser) return;

    const userRef = doc(db, 'users', auth.currentUser.uid);
    setLoadingSave(true);

    try {
      if (isSaved) {
        await updateDoc(userRef, { savedPosts: arrayRemove(jobId) });
        setIsSaved(false);
        if (typeof onUnsave === 'function') {
          onUnsave();
        }
      } else {
        await updateDoc(userRef, { savedPosts: arrayUnion(jobId) });
        setIsSaved(true);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoadingSave(false);
    }
  }, [isSaved, jobId, onUnsave]);

  // ============================================================
  // ✅ হ্যান্ডলার ফাংশন
  // ============================================================
  const handleBidAction = useCallback(() => {
    if (onBidAndChatClick) {
      const chatData = {
        ...job,
        type: job.type || 'hire',
        userId: job.userId,
      };
      onBidAndChatClick(chatData);
    }
  }, [job, onBidAndChatClick]);

  const handleSavePost = useCallback(() => {
    toggleSavePost();
  }, [toggleSavePost]);

  const handleSharePost = useCallback(() => {
    const shareUrl = `${window.location.origin}/job/${jobId || 'demo'}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => alert("🔗 Link copied to clipboard!"))
      .catch((err) => console.error("Failed to copy link: ", err));
  }, [jobId]);

  // ============================================================
  // ✅ রেটিং স্টার রেন্ডার
  // ============================================================
  const renderStars = useCallback((average) => {
    const stars = [];
    const fullStars = Math.floor(average);
    const hasHalfStar = average % 1 >= 0.5;
    
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(<i key={i} className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i>);
      } else if (i === fullStars + 1 && hasHalfStar) {
        stars.push(<i key={i} className="fa-solid fa-star-half-stroke" style={{ color: '#fbbf24' }}></i>);
      } else {
        stars.push(<i key={i} className="fa-regular fa-star" style={{ color: '#4a4a4a' }}></i>);
      }
    }
    return stars;
  }, []);

  const starElements = useMemo(() => {
    return renderStars(rating.average);
  }, [rating.average, renderStars]);

  // ============================================================
  // ✅ ডেসক্রিপশন টেক্সট
  // ============================================================
  const getPlainText = useCallback((html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '');
  }, []);

  const TEXT_LIMIT = 200;
  const plainDescription = useMemo(() => getPlainText(description || ''), [description, getPlainText]);
  const shouldTruncate = plainDescription.length > TEXT_LIMIT;

  const getDisplayText = useCallback(() => {
    if (!description) return '';
    
    if (isExpanded) {
      return highlightText(description, searchTerm);
    }
    
    if (shouldTruncate) {
      let truncated = plainDescription.substring(0, TEXT_LIMIT);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > 0) {
        truncated = truncated.substring(0, lastSpace);
      }
      return highlightText(truncated + '...', searchTerm);
    }
    
    return highlightText(description, searchTerm);
  }, [description, isExpanded, shouldTruncate, plainDescription, highlightText, searchTerm]);

  // ============================================================
  // ✅ ফরম্যাটেড নাম ও টাইটেল
  // ============================================================
  const displayName = useMemo(() => {
    const name = clientProfile.clientName || '';
    if (typeof name === 'string' && name.length > 25) {
      const truncated = name.substring(0, 22) + '...';
      return highlightText(truncated, searchTerm);
    }
    return highlightText(name, searchTerm);
  }, [clientProfile.clientName, highlightText, searchTerm]);

  const displayTitle = useMemo(() => {
    const titleText = title || '';
    if (typeof titleText === 'string') {
      const maxChars = 60;
      if (titleText.length <= maxChars) {
        return highlightText(titleText, searchTerm);
      }
      
      let truncated = titleText.substring(0, maxChars);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > 0) {
        truncated = truncated.substring(0, lastSpace);
      }
      return highlightText(truncated + '...', searchTerm);
    }
    return highlightText(titleText, searchTerm);
  }, [title, highlightText, searchTerm]);

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className="job-post-card" id={id || `post-${jobId}`}>
      {/* ── হেডার সেকশন ── */}
      <div className="post-top-meta">
        <Link 
          to={`/profile/${userId}`} 
          style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="client-profile-block" style={{ display: 'flex', gap: '10px', minWidth: 0 }}>
            {/* Avatar with Loading State */}
            <div className="client-avatar" style={{ flexShrink: 0, position: 'relative' }}>
              {clientProfile.clientPhoto ? (
                <>
                  {!avatarLoaded && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--bg-tertiary, #1a2030)',
                      borderRadius: '50%',
                      zIndex: 1
                    }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{
                        color: 'var(--accent-primary, #14b8a6)',
                        fontSize: '18px'
                      }}></i>
                    </div>
                  )}
                  <img 
                    src={`${clientProfile.clientPhoto.split('?')[0]}?v=${Date.now()}`} 
                    alt={clientProfile.clientName || 'User'} 
                    className={`client-avatar-img ${avatarLoaded ? 'loaded' : 'hidden'}`}
                    onLoad={handleAvatarLoad}
                    onError={handleImageError}
                    style={{
                      opacity: avatarLoaded ? 1 : 0,
                      transition: 'opacity 0.3s ease'
                    }}
                  />
                </>
              ) : null}
              
              <div 
                className="avatar-placeholder" 
                style={{ 
                  background: clientProfile.avatarBg || 'linear-gradient(135deg, #438e82, #0f172a)',
                  display: clientProfile.clientPhoto ? 'none' : 'flex',
                }}
              >
                {clientProfile.avatarInitial || clientProfile.clientName?.charAt(0) || 'U'}
              </div>
            </div>

            <div className="client-info" style={{ minWidth: 0 }}>
              <span className="client-name" title={clientProfile.clientName} style={{ 
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%'
              }}>
                {displayName || clientProfile.clientName || 'Unknown User'}
              </span>

              <div className="client-rating-section">
                <div className="rating-stars">
                  {loadingRating ? (
                    <span className="rating-loading">Loading...</span>
                  ) : (
                    <>
                      {starElements}
                      <span className="rating-average">
                        {rating.average > 0 ? rating.average : 'New'}
                      </span>
                    </>
                  )}
                </div>
                <div className="rating-reviews-count">
                  {rating.total > 0 ? (
                    <span>
                      <i className="fa-regular fa-comment"></i> {rating.total} {rating.total === 1 ? 'Review' : 'Reviews'}
                    </span>
                  ) : (
                    <span className="no-reviews">Be the first to review</span>
                  )}
                </div>
              </div>

              {clientProfile.verified && (
                <span className="verified-badges">
                  <i className="fa-solid fa-shield-check"></i> Verified
                </span>
              )}
            </div>
          </div>
        </Link>

        <div className="jc-top-right-actions">
          <div className="jc-action-icon-group">
            <button 
              className={`jc-action-icon-btn ${isSaved ? 'saved' : ''}`} 
              onClick={handleSavePost}
              disabled={loadingSave}
              aria-label={isSaved ? 'Unsave post' : 'Save post'}
            >
              {loadingSave ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className={isSaved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"}></i>
              )}
            </button>
            <button 
              className="jc-action-icon-btn" 
              onClick={handleSharePost}
              aria-label="Share post"
            >
              <i className="fa-solid fa-share-nodes"></i>
            </button>
          </div>
          <span className="post-time-badge">
            {timeAgo(time || createdAt)}
          </span>
        </div>
      </div>

      {/* ── মেইন কন্টেন্ট ── */}
      <div className="post-main-content">
        <h3 className="job-title" style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: '1.4',
          maxHeight: '2.8em',
          wordBreak: 'break-word'
        }} title={title || ''}>
          {displayTitle}
        </h3>
        
        <p className="jc-dynamic-text">
          {getDisplayText()}
          {shouldTruncate && (
            <button 
              className="jc-see-more-btn" 
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Show less' : 'Show more'}
            >
              {isExpanded ? ' See Less' : ' See More'}
            </button>
          )}
        </p>
      </div>

      {/* ── ইমেজ গ্যালারি ── */}
      {postImages.length > 0 && (
        <div className={`jc-image-gallery-grid gallery-cols-${Math.min(postImages.length, 3)}`}>
          {postImages.slice(0, 3).map((imgUrl, index) => (
            <div 
              key={`img-${jobId}-${index}`} 
              className="jc-gallery-img-wrapper" 
              onClick={() => setActiveZoomImage(imgUrl)}
              style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}
            >
              {!imagesLoaded[index] && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-tertiary, #1a2030)',
                  color: 'var(--text-muted, #64748b)',
                  gap: '8px',
                  zIndex: 1
                }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{
                    fontSize: '24px',
                    color: 'var(--accent-primary, #14b8a6)'
                  }}></i>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>Loading...</span>
                </div>
              )}
              
              <img 
                src={imgUrl} 
                alt={`Job Attachment ${index + 1}`} 
                className={`jc-feed-live-img ${imagesLoaded[index] ? 'loaded' : 'hidden'}`}
                loading="lazy"
                onLoad={() => handleImageLoad(index)}
                onError={handleImageError}
                style={{
                  opacity: imagesLoaded[index] ? 1 : 0,
                  transition: 'opacity 0.3s ease'
                }}
              />
              
              <div className="img-hover-overlay">
                <i className="fa-solid fa-magnifying-glass-plus"></i> Click to Zoom
              </div>
            </div>
          ))}
          {postImages.length > 3 && (
            <div className="jc-gallery-img-wrapper more-images" onClick={() => setActiveZoomImage(postImages[3])}>
              <img 
                src={postImages[3]} 
                alt="More" 
                className="jc-feed-live-img" 
                onError={handleImageError}
              />
              <div className="more-overlay">+{postImages.length - 3}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Budget & Deadline Info Strip (Updated) ── */}
{/* ── Budget & Deadline Info Strip ── */}
<div className="post-info-strip">
  {/* ── Budget Display ── */}
  <div className="strip-item si-budget">
    <i className="fa-solid fa-wallet"></i>
    Budget: <strong>{budgetInfo.display}</strong>
  </div>

  {/* ── Deadline Display ── */}
  <div className="strip-item si-deadline">
    <i className="fa-solid fa-calendar-days"></i>
    Deadline: <strong>{deadlineInfo.display}</strong>
  </div>
</div>

{/* ── ফুটার বাটন ── */}
<div className="post-footer-actions">
  <button className="btn-apply-job" onClick={handleBidAction}>
    <i className="fa-solid fa-paper-plane"></i> Bid & Chat
  </button>
</div>

{/* ── জুম লাইটবক্স ── */}
{activeZoomImage && (
  <div className="zoom-lightbox-overlay" onClick={() => setActiveZoomImage(null)}>
    <button className="lightbox-close-btn" onClick={() => setActiveZoomImage(null)}>
      <i className="fa-solid fa-xmark"></i>
    </button>
    <div className="lightbox-content-box" onClick={(e) => e.stopPropagation()}>
      <img 
        src={activeZoomImage} 
        alt="Zoomed" 
        className="lightbox-zoomed-img" 
        onError={handleImageError}
      />
    </div>
  </div>
)}
    </div>
  );
}

export default JobCard;