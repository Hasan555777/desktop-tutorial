// src/pages/Home.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import JobCard from './JobCard';
import './Home.css';

function Home({ 
  currentMode = 'seller', // ✅ ডিফল্ট 'seller'
  currentUser, 
  searchTerm = '', 
  highlightText: propHighlightText, 
  onBidAndChatClick 
}) {
  console.count("🏠 Home Render");

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  
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

  const searchParams = new URLSearchParams(location.search);
  const postIdFromQuery = searchParams.get('postId');
  const targetPostId = postId || postIdFromQuery;
  const [highlightedPostId, setHighlightedPostId] = useState(targetPostId);


useEffect(() => {
  console.log("🎯 URL Target Post ID:", targetPostId);
  setHighlightedPostId(targetPostId);
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

  // ✅ আপনার Firestore-এ type: 'service' এবং 'hire'
  if (mode === 'seller') {
    // seller mode: service টাইপের পোস্ট
    q = query(
      postsRef,
      where('status', '==', 'approved'),
      where('type', '==', 'service'), // ✅ 'service'
      orderBy('createdAt', 'desc')
    );
  } else if (mode === 'buyer') {
    // buyer mode: hire টাইপের পোস্ট
    q = query(
      postsRef,
      where('status', '==', 'approved'),
      where('type', '==', 'hire'), // ✅ 'hire'
      orderBy('createdAt', 'desc')
    );
  } else {
    // ডিফল্ট: সব approved পোস্ট
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
        console.warn(`⚠️ Check if posts have type: '${mode === 'seller' ? 'service' : 'hire'}' and status: 'approved'`);
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
      console.error("❌ Error code:", error.code);
      console.error("❌ Error message:", error.message);
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
    
    // Always sync the ref with the latest mode prop
    currentModeRef.current = currentMode || 'seller';

    // Clean up any existing listener before setting up the new one
    cleanupListener();
    setupListener();

    return () => {
      console.log("🔴 Home Effect: Cleaning up listener");
      isMountedRef.current = false;
      cleanupListener();
    };
  }, [currentMode, setupListener, cleanupListener]);

  // ✅ highlightedPostId effect
  useEffect(() => {
    if (!loading && highlightedPostId && posts.length > 0) {
      const postExists = posts.some(p => p.id === highlightedPostId);

      if (!postExists) {
        console.log("⚠️ Post not found in current list");
        feedbackRef.current?.toast?.({
          variant: 'warning',
          title: 'Post Not Found',
          message: 'The requested post is not available or pending approval.',
          duration: 3000
        });
        return;
      }

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
    }
  }, [loading, highlightedPostId, posts]);

  // ✅ সার্চ ফিল্টার
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

  // ✅ পোস্ট ফরম্যাটিং
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
        status: post.status || 'pending'
      }));

    const map = new Map();
    formatted.forEach(post => {
      if (!map.has(post.id)) {
        map.set(post.id, post);
      }
    });

    return Array.from(map.values());
  }, [filteredBySearch, currentMode]);

  // ✅ লোডিং UI
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#090d16',
        color: '#14b8a6'
      }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{
            fontSize: '48px',
            animation: 'spin 2s linear infinite',
            display: 'block',
            marginBottom: '16px'
          }} />
          <h2>Loading Posts...</h2>
          {!feedbackRef.current?.network?.online && (
            <p style={{ color: '#ef4444', marginTop: '12px', fontSize: '14px' }}>
              📡 Offline - Waiting for connection...
            </p>
          )}
        </div>
      </div>
    );
  }

  // ✅ রেন্ডার
  return (
    <div className="home-wrapper">
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
          {uniquePosts.length === 0 ? (
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