// src/pages/Home.jsx
//
// ⚠️ NEW: `onRequireModeSwitch` prop — when a targeted post (from the URL,
// e.g. /post/:postId) isn't found in the CURRENT mode's Firestore query, we
// no longer immediately assume "not found". We do one direct getDoc() check:
//   - Doesn't exist at all           -> "Post Not Found" toast (as before)
//   - Exists but not approved yet    -> "Post Pending" toast
//   - Exists, approved, wrong mode   -> call onRequireModeSwitch(requiredMode)
//     instead of failing. This effect then re-runs once the parent flips
//     `currentMode` and the new mode's listener delivers the post, so it
//     scrolls + highlights normally.
//
// 🔧 LOADING SYSTEM UPDATE:
// - Removed the full-screen "Loading Posts..." early-return.
// - Added usePageLoadingBar(loading) for the thin top bar.
// - Skeleton cards only show on a TRUE first load (posts.length === 0).
//   On a mode-switch refetch or manual refresh where posts already exist,
//   the old list stays visible (no flash) while the new snapshot loads —
//   only the top bar + pull indicator signal activity.
//
// 🔄 NEW — PULL-TO-REFRESH (মোবাইল, কোনো বাটন ছাড়া):
// - usePullToRefresh হুক দিয়ে posts listener re-subscribe করা হয়।
// - শুধু মোবাইল viewport-এ touch handlers attach হয় (ডেস্কটপে না)।
// - ডেস্কটপ থেকে Navbar-এর রিফ্রেশ বাটন 'workhub:refresh-request'
//   কাস্টম ইভেন্ট পাঠায়, Home সেটা শুনে একই handleRefresh চালায়।
//
// 📍 NEW — SCROLL POSITION RESTORE:
// - স্ক্রল করতে করতে অন্য পেজে (চ্যাট ইত্যাদি) চলে গেলে sessionStorage-এ
//   window.scrollY সেভ থাকে (মোড অনুযায়ী আলাদা key)।
// - আবার Home-এ ফিরলে (component নতুন করে mount হলে) সেই পজিশনে
//   অটোমেটিক স্ক্রল করে দেয় — একদম শুরুতে চলে যায় না।
// - নির্দিষ্ট পোস্টে হাইলাইট/স্ক্রল করার existing লজিকের সাথে কনফ্লিক্ট
//   এড়াতে, highlightedPostId থাকলে scroll-restore স্কিপ করা হয়।
// - ইচ্ছাকৃত মোড-সুইচে (ইউজার নিজে Buyer/Seller বদলালে) পুরনো মোডের
//   পোস্ট সাথে সাথে সরিয়ে ও টপে স্ক্রল করে ফ্রেশ ভিউ দেওয়া হয়।

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { usePageLoadingBar } from '@/components/LoadingBar/usePageLoadingBar';
import { usePullToRefresh } from '@/components/PullToRefresh/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefresh/PullToRefreshIndicator';
import Skeleton from '@/components/Skeleton/Skeleton';
import JobCard from '@/pages/JobCard/JobCard';
import './Home.css';

// ============================================================
// JobCard-এর শেপ মিলিয়ে skeleton placeholder — শুধু প্রথম লোডে দেখাবে।
// ============================================================
const PostCardSkeleton = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: '16px',
      marginBottom: '16px',
      borderRadius: '14px',
      background: 'var(--bg-secondary, #131826)',
      border: '1px solid var(--border-color, #232937)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <Skeleton width={40} height={40} variant="circle" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Skeleton width="35%" height={12} />
        <Skeleton width="20%" height={10} />
      </div>
    </div>
    <Skeleton width="70%" height={16} />
    <Skeleton width="95%" height={12} />
    <Skeleton width="85%" height={12} />
    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
      <Skeleton width={70} height={26} radius={8} />
      <Skeleton width={70} height={26} radius={8} />
      <Skeleton width={90} height={26} radius={8} style={{ marginLeft: 'auto' }} />
    </div>
  </div>
);

const SCROLL_STORAGE_PREFIX = 'workhub_home_scroll_';

function Home({ 
  currentMode = 'seller',
  currentUser, 
  searchTerm = '', 
  highlightText: propHighlightText, 
  onBidAndChatClick,
  onRequireModeSwitch,
  onToggleLock,          // ✅ NEW: প্রপস যোগ করুন
  isTogglingPostId,      // ✅ NEW: প্রপস যোগ করুন
}) {
  console.count("🏠 Home Render");

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  usePageLoadingBar(loading);
  
  const feedback = useFeedback();
  const feedbackRef = useRef(feedback);
  
  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  const prevFeedback = useRef(feedback);
  useEffect(() => {
    const isChanged = prevFeedback.current !== feedback;
    if (isChanged) {
      console.log("📢 Feedback changed (but Home won't re-render)");
    }
    prevFeedback.current = feedback;
  });

  const { postId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const unsubscribeRef = useRef(null);
  const isMountedRef = useRef(true);
  const listenerActiveRef = useRef(false);
  const currentModeRef = useRef(currentMode || 'seller');
  const prevModeForClearRef = useRef(currentMode || 'seller');

  useEffect(() => {
    currentModeRef.current = currentMode || 'seller';
  }, [currentMode]);

  const searchParams = new URLSearchParams(location.search);
  const postIdFromQuery = searchParams.get('postId');
  const targetPostId = postId || postIdFromQuery;
  const [highlightedPostId, setHighlightedPostId] = useState(targetPostId);

  const verifiedForPostIdRef = useRef(null);

  useEffect(() => {
    console.log("🎯 URL Target Post ID:", targetPostId);
    setHighlightedPostId(targetPostId);
    verifiedForPostIdRef.current = null;
  }, [targetPostId]);

  const highlightText = propHighlightText || ((text, searchTerm) => {
    if (!searchTerm || !text || searchTerm.trim() === '') return text;
    try {
      const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, index) => 
        regex.test(part) ? 
          <mark key={index} className="search-highlight">{part}</mark> : 
          part
      );
    } catch (error) {
      return text;
    }
  });

  const cleanupListener = useCallback(() => {
    if (unsubscribeRef.current) {
      console.log("🔥 Home: Cleaning up posts listener");
      unsubscribeRef.current();
      unsubscribeRef.current = null;
      listenerActiveRef.current = false;
    }
  }, []);

  const setupListener = useCallback(() => {
    if (listenerActiveRef.current) {
      console.log("ℹ️ Home: Listener already active, skipping...");
      return;
    }

    const mode = currentModeRef.current || 'seller';
    console.log("🔥 Home: Setting up posts listener for mode:", mode);
    setLoading(true);

    const postsRef = collection(db, 'posts');
    let q;

    if (mode === 'seller') {
      q = query(
        postsRef,
        where('status', '==', 'approved'),
        where('type', '==', 'service'),
        orderBy('createdAt', 'desc')
      );
    } else if (mode === 'buyer') {
      q = query(
        postsRef,
        where('status', '==', 'approved'),
        where('type', '==', 'hire'),
        orderBy('createdAt', 'desc')
      );
    } else {
      console.log("🔥 Home: Using default query (all approved posts)");
      q = query(
        postsRef,
        where('status', '==', 'approved'),
        orderBy('createdAt', 'desc')
      );
    }

    console.log("🔍 Home: Query created for mode:", mode);

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        if (!isMountedRef.current) {
          console.log("⏭️ Home: Component unmounted, skipping update");
          return;
        }

        console.log("🔥🔥🔥 Home: Real-time update received! Docs:", snapshot.docs.length);

        if (snapshot.docs.length === 0) {
          console.warn("⚠️ Home: No posts found for mode:", mode);
          setPosts([]);
          setLoading(false);
          return;
        }

        const postsArray = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        console.log("📊 Home: Approved posts loaded:", postsArray.length);
        setPosts(postsArray);
        setLoading(false);
      },
      (error) => {
        if (!isMountedRef.current) return;

        console.error("❌ Home: Error fetching posts:", error);
        setLoading(false);

        if (error.code === 'failed-precondition' || error.message.includes('index')) {
          feedbackRef.current?.showError?.(
            'Index Required',
            'Please create the required Firestore index. Check console for link.',
            'INDEX_ERROR'
          );
          console.error('🔗 Create index:', error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0]);
        } else {
          feedbackRef.current?.showError?.(
            'Failed to Load Posts',
            error.message || 'Could not fetch posts. Please refresh.',
            'LOAD_ERROR'
          );
        }
      }
    );

    unsubscribeRef.current = unsubscribe;
    listenerActiveRef.current = true;
  }, []);

  // ✅ Single effect to handle mounting, unmounting, and mode changes robustly
  useEffect(() => {
    console.log("🟢 Home Effect: Setting up listener for mode:", currentMode);
    isMountedRef.current = true;
    currentModeRef.current = currentMode || 'seller';

    const modeActuallyChanged = prevModeForClearRef.current !== (currentMode || 'seller');
    if (modeActuallyChanged) {
      setPosts([]);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    prevModeForClearRef.current = currentMode || 'seller';

    cleanupListener();
    setupListener();

    return () => {
      console.log("🔴 Home Effect: Cleaning up listener");
      isMountedRef.current = false;
      cleanupListener();
    };
  }, [currentMode, setupListener, cleanupListener]);

  // ============================================================
  // ✅ Highlight/scroll effect + self-healing mode-mismatch fallback
  // ============================================================
  useEffect(() => {
    if (loading || !highlightedPostId) return;

    const postExists = posts.some(p => p.id === highlightedPostId);

    if (postExists) {
      setTimeout(() => {
        const postElement = document.getElementById(`post-${highlightedPostId}`);

        if (postElement) {
          console.log("✅ Found post element, scrolling...");
          postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          postElement.classList.add('highlight-post');

          setTimeout(() => {
            postElement.classList.remove('highlight-post');
          }, 3000);
        }
      }, 1000);
      return;
    }

    if (verifiedForPostIdRef.current === highlightedPostId) return;

    let cancelled = false;

    const verifyPost = async () => {
      try {
        const snap = await getDoc(doc(db, 'posts', highlightedPostId));
        if (cancelled) return;

        verifiedForPostIdRef.current = highlightedPostId;

        if (!snap.exists()) {
          console.log("⚠️ Post not found in Firestore at all");
          feedbackRef.current?.toast?.({
            variant: 'warning',
            title: 'Post Not Found',
            message: 'The requested post is not available or has been removed.',
            duration: 3000
          });
          return;
        }

        const data = snap.data();

        if (data.status !== 'approved') {
          feedbackRef.current?.toast?.({
            variant: 'info',
            title: 'Post Pending',
            message: 'This post is still awaiting admin approval and is not publicly visible yet.',
            duration: 3000
          });
          return;
        }

        const requiredMode = data.type === 'hire' ? 'buyer' : 'seller';

        if (requiredMode !== currentModeRef.current) {
          if (onRequireModeSwitch) {
            console.log(`🔀 Post belongs to ${requiredMode} mode — switching automatically`);
            onRequireModeSwitch(requiredMode);
          } else {
            feedbackRef.current?.toast?.({
              variant: 'warning',
              title: 'Post Not Found',
              message: 'The requested post is not available or is pending approval.',
              duration: 3000
            });
          }
          return;
        }
      } catch (error) {
        console.error('Error verifying post existence:', error);
      }
    };

    verifyPost();

    return () => { cancelled = true; };
  }, [loading, highlightedPostId, posts, onRequireModeSwitch]);

  // ============================================================
  // ✅ SCROLL POSITION SAVE
  // ============================================================
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        try {
          const key = `${SCROLL_STORAGE_PREFIX}${currentModeRef.current}`;
          sessionStorage.setItem(key, String(window.scrollY));
        } catch (e) {
          // sessionStorage না থাকলে (private browsing ইত্যাদি) চুপচাপ স্কিপ
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ============================================================
  // ✅ SCROLL POSITION RESTORE
  // ============================================================
  const hasRestoredScrollRef = useRef(false);

  useEffect(() => {
    hasRestoredScrollRef.current = false;
  }, [currentMode]);

  useEffect(() => {
    if (loading) return;
    if (hasRestoredScrollRef.current) return;
    if (highlightedPostId) return;
    if (posts.length === 0) return;

    const key = `${SCROLL_STORAGE_PREFIX}${currentModeRef.current}`;
    let saved = null;
    try {
      saved = sessionStorage.getItem(key);
    } catch (e) {
      saved = null;
    }

    hasRestoredScrollRef.current = true;

    if (saved) {
      const y = parseInt(saved, 10);
      if (!isNaN(y) && y > 0) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: 'auto' });
        });
      }
    }
  }, [loading, posts.length, highlightedPostId]);

  // ============================================================
  // ✅ সার্চ ফিল্টার
  // ============================================================
  const filteredBySearch = useMemo(() => {
    if (!searchTerm || searchTerm.trim() === '') {
      return posts;
    }

    const term = searchTerm.toLowerCase();
    return posts.filter(post =>
      post.title?.toLowerCase().includes(term) ||
      post.description?.toLowerCase().includes(term) ||
      post.clientName?.toLowerCase().includes(term)
    );
  }, [posts, searchTerm]);

  // ============================================================
  // ✅ পোস্ট ফরম্যাটিং
  // ============================================================
  const uniquePosts = useMemo(() => {
    const formatted = filteredBySearch
      .filter(post => post && post.id)
      .map(post => ({
        id: post.id,
        clientName: post.clientName || post.sender || (post.type === 'hire' ? "Job Poster" : "Service Provider"),
        clientPhoto: post.userPhotoURL || post.clientPhoto || post.photoURL || null,
        avatarBg: "linear-gradient(135deg, #f59e0b, #d97706)",
        avatarInitial: (post.clientName || post.sender || "U").charAt(0).toUpperCase(),
        verified: post.verified || false,
        time: post.createdAt,
        createdAt: post.createdAt,
        title: post.title || "Untitled",
        description: post.description || "No description provided",
        budget: post.budget || post.price || 0,
        deadline: post.deadline || (post.deliveryDays ? `${post.deliveryDays} Days` : "N/A"),
        proposals: post.proposals || 0,
        images: post.images && post.images.length > 0 ? post.images : [],
        postImage: (post.images && post.images[0]) || post.postImage || null,
        type: post.type || (currentMode === 'seller' ? 'service' : 'hire'),
        userId: post.userId,
        clientEmail: post.clientEmail,
        status: post.status || 'pending',
        postStatus: post.postStatus || { isBusy: false, isDealActive: false } // ✅ postStatus যোগ করুন
      }));

    const map = new Map();
    formatted.forEach(post => {
      if (!map.has(post.id)) {
        map.set(post.id, post);
      }
    });

    return Array.from(map.values());
  }, [filteredBySearch, currentMode]);

  // ============================================================
  // ✅ Pull-to-refresh
  // ============================================================
  const handleRefresh = useCallback(async () => {
    console.log("🔄 Manual refresh triggered");
    cleanupListener();
    setupListener();
    await new Promise(resolve => setTimeout(resolve, 600));
  }, [cleanupListener, setupListener]);

  const { containerRef, pullDistance, isRefreshing, handlers } = usePullToRefresh(handleRefresh);

  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );
  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const handleExternalRefresh = () => {
      handleRefresh();
    };
    window.addEventListener('workhub:refresh-request', handleExternalRefresh);
    return () => window.removeEventListener('workhub:refresh-request', handleExternalRefresh);
  }, [handleRefresh]);

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div 
      className="home-wrapper" 
      ref={containerRef}
      {...(isMobileViewport ? handlers : {})}
    >
      {isMobileViewport && (
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      )}

      {!feedbackRef.current?.network?.online && (
        <div style={{
          padding: '8px 16px',
          margin: '0 16px 16px 16px',
          background: 'var(--status-danger-bg)',
          color: 'var(--status-danger)',
          borderRadius: '8px',
          textAlign: 'center',
          fontSize: '14px',
          border: '1px solid var(--status-danger)'
        }}>
          <span>📡 You are offline. Showing cached posts.</span>
        </div>
      )}

      <main className="home-content">
        <div className="home-feed-posts-list">
          {loading && posts.length === 0 ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <PostCardSkeleton key={`post-skeleton-${i}`} />
              ))}
            </>
          ) : uniquePosts.length === 0 ? (
            <div className="empty-feed-state">
              <i className="fa-solid fa-folder-open"></i>
              <p>
                {searchTerm
                  ? `No posts found for "${searchTerm}"`
                  : `No ${currentMode === 'seller' ? 'services' : 'jobs'} available right now.`}
              </p>
              <small>
                {searchTerm
                  ? 'Try a different search term'
                  : currentMode === 'seller' 
                    ? 'Switch to Buyer mode to see job posts.' 
                    : 'Switch to Seller mode to see service posts.'}
              </small>
              {searchTerm && (
                <button
                  className="clear-search-btn"
                  onClick={() => navigate('/')}
                >
                  <i className="fa-solid fa-times"></i> Clear Search
                </button>
              )}
            </div>
          ) : (
            uniquePosts.map((post) => (
              <JobCard
                key={post.id}
                id={`post-${post.id}`}
                job={post}
                userId={post.userId}
                currentUser={currentUser}
                searchTerm={searchTerm}
                highlightText={highlightText}
                currentMode={currentMode}           // ✅ পাস করুন
                onToggleLock={onToggleLock}         // ✅ পাস করুন
                isToggling={isTogglingPostId === post.id}  // ✅ পাস করুন
                onBidAndChatClick={() => {
                  if (onBidAndChatClick) {
                    onBidAndChatClick(post);
                  }
                }}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export default Home;