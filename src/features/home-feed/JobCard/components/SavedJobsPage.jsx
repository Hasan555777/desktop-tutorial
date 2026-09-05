// src/pages/SavedJobsPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { usePageLoadingBar } from '../../../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../../../shared/firebase/index';
import { useFeedback } from '../../../../shared/ui/Feedback/FeedbackProvider';
import { 
  doc, 
  getDoc,
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';
import JobCard from '../JobCard';
import styles from './SavedJobsPage.module.css';

function SavedJobsPage({ onBidAndChatClick }) {
  const navigate = useNavigate();
  const [savedIds, setSavedIds] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading);
  const [debug, setDebug] = useState('');
  const [error, setError] = useState('');
  const feedback = useFeedback();

  const isDev = import.meta.env.DEV;

  // ============================================================
  // ✅ রিয়েল-টাইম savedIds লোড করা
  // ============================================================
  useEffect(() => {
    if (!auth.currentUser) {
      navigate('/login', { replace: true });
      return;
    }

    const userRef = doc(db, 'users', auth.currentUser.uid);
    
    const unsubscribe = onSnapshot(userRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const ids = docSnapshot.data().savedPosts || [];
        if (isDev) {
          console.log("📌 Real-time saved IDs updated:", ids);
        }
        setSavedIds(ids);
        setError('');
      } else {
        setSavedIds([]);
        setError('User data not found');
      }
    }, (error) => {
      console.error("Error listening to user data:", error);
      setError('Failed to load user data');
    });

    return () => unsubscribe();
  }, [navigate, isDev]);

  // ============================================================
  // ✅ savedIds পরিবর্তিত হলে পোস্ট ফেচ করুন
  // ============================================================
  useEffect(() => {
    const fetchSavedPosts = async () => {
      if (!savedIds || savedIds.length === 0) {
        if (isDev) {
          console.log("🟡 No saved IDs, setting empty posts");
        }
        setSavedPosts([]);
        setLoading(false);
        setDebug('No saved posts');
        return;
      }

      if (isDev) {
        console.log("🔵 Fetching posts for IDs:", savedIds);
      }
      setLoading(true);
      setDebug(`Fetching ${savedIds.length} posts...`);
      
      try {
        const postsRef = collection(db, 'posts');
        const batchSize = 30;
        let allPosts = [];
        
        for (let i = 0; i < savedIds.length; i += batchSize) {
          const batch = savedIds.slice(i, i + batchSize);
          if (isDev) {
            console.log(`🔵 Fetching batch ${Math.floor(i/batchSize) + 1}:`, batch);
          }
          
          const q = query(postsRef, where("__name__", "in", batch));
          const querySnapshot = await getDocs(q);
          
          const posts = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          if (isDev) {
            console.log(`✅ Batch returned ${posts.length} posts`);
          }
          allPosts = [...allPosts, ...posts];
        }
        
        if (isDev) {
          console.log("✅ Total posts fetched:", allPosts.length);
        }
        setSavedPosts(allPosts);
        setDebug(`Loaded ${allPosts.length} posts`);
        setError('');
        
      } catch (error) {
        console.error("🔴 Error fetching posts:", error);
        setDebug('Error: ' + error.message);
        setError('Failed to load saved posts');
        setSavedPosts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSavedPosts();
  }, [savedIds, isDev]);

  // ============================================================
  // ✅ রিফ্রেশ ফাংশন
  // ============================================================
  const handleRefresh = useCallback(async () => {
    if (isDev) {
      console.log("🔄 Manual refresh triggered...");
    }
    setLoading(true);
    setError('');
    
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const ids = userSnap.data().savedPosts || [];
        if (isDev) {
          console.log("📌 Reloaded saved IDs:", ids);
        }
        setSavedIds(ids);
        setDebug('Refreshed');
      } else {
        setSavedIds([]);
        setError('User data not found');
      }
    } catch (error) {
      console.error("Error refreshing:", error);
      setError('Failed to refresh');
    } finally {
      setLoading(false);
    }
  }, [isDev]);

  // ============================================================
  // ✅ পেজ ফোকাস করলে রিফ্রেশ
  // ============================================================
  useEffect(() => {
    const handleFocus = () => {
      if (isDev) {
        console.log("🔄 Page focused - refreshing...");
      }
      handleRefresh();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [handleRefresh, isDev]);

  // ============================================================
  // ✅ আনসেভ ফাংশন
  // ============================================================
  const handleUnsavePost = useCallback(async (postId) => {
    if (!auth.currentUser) {
      feedback.showError('Login Required', 'Please login first!');
      return;
    }
    
    const confirmed = await feedback.confirm({
      title: 'Remove Saved Job',
      message: 'Remove this post from saved list?',
      variant: 'delete',
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });

    if (!confirmed) {
      return;
    }
    
    const userRef = doc(db, 'users', auth.currentUser.uid);
    
    try {
      await updateDoc(userRef, {
        savedPosts: arrayRemove(postId)
      });
      
      setSavedPosts(prev => prev.filter(post => post.id !== postId));
      setSavedIds(prev => prev.filter(id => id !== postId));
      
      if (isDev) {
        console.log("✅ Post unsaved successfully!");
      }
      
      feedback.showSuccess('Removed', 'Job removed from saved list!');
      
    } catch (error) {
      console.error("❌ Error unsaving post:", error);
      feedback.showError('Error', 'Failed to unsave post. Please try again.');
    }
  }, [feedback, isDev]);

  // ============================================================
  // ✅ বিড হ্যান্ডলার
  // ============================================================
  const handleBidAndChat = useCallback((jobData) => {
    console.log("📩 SavedJobsPage - Received job data:", jobData);
    
    if (!jobData) {
      console.error("❌ No job data received");
      feedback.showError('Error', 'No job data found!');
      return;
    }

    if (!auth.currentUser) {
      feedback.showError('Login Required', 'Please login to bid on this job!');
      return;
    }

    const chatData = {
      id: jobData.id || jobData.jobId,
      userId: jobData.userId,
      title: jobData.title || 'Untitled Job',
      description: jobData.description || '',
      budget: jobData.budget || 0,
      deadline: jobData.deadline || 'N/A',
      type: jobData.type || 'hire',
      images: jobData.images || [],
      createdAt: jobData.createdAt || new Date(),
      clientName: jobData.clientName || jobData.userName || 'User',
      clientPhoto: jobData.clientPhoto || jobData.userPhoto || '',
    };

    console.log("📤 Sending to chat:", chatData);

    if (typeof onBidAndChatClick === 'function') {
      console.log("✅ Using parent onBidAndChatClick");
      onBidAndChatClick(chatData);
      return;
    }

    console.log("✅ Navigating to inbox with job data");
    navigate('/inbox', { 
      state: { 
        job: chatData,
        openChat: true 
      } 
    });
    
  }, [onBidAndChatClick, navigate, feedback]);

  // ============================================================
  // ✅ খালি স্টেট UI
  // ============================================================
  const renderEmptyState = () => (
    <div className={styles.emptySavedContainer}>
      <div className={styles.emptySavedIcon}>
        <i className="fa-regular fa-bookmark"></i>
      </div>
      <h3>No Saved Jobs Yet</h3>
      <p>Start saving jobs you're interested in! Click the bookmark icon on any job card to save it.</p>
      <button className={styles.browseJobsBtn} onClick={() => navigate('/')}>
        <i className="fa-solid fa-search"></i> Browse Jobs
      </button>
    </div>
  );

  // ============================================================
  // ✅ লোডিং UI
  // ============================================================
  const renderLoading = () => (
    <div className={styles.savedLoadingContainer}>
      <div className={styles.savedLoadingSpinner}></div>
      <p>Loading your saved jobs...</p>
      {isDev && debug && <p className={styles.debugText}>{debug}</p>}
    </div>
  );

  // ============================================================
  // ✅ Error UI
  // ============================================================
  if (error) {
    return (
      <div className={styles.savedErrorContainer}>
        <i className="fa-solid fa-triangle-exclamation"></i>
        <h3>Something went wrong</h3>
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={handleRefresh}>
          <i className="fa-solid fa-rotate-right"></i> Retry
        </button>
      </div>
    );
  }

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className={styles.savedJobsPage}>
      {/* হেডার */}
      <div className={styles.savedJobsHeader}>
        <div className={styles.headerLeft}>
          <h1>
            <i className="fa-solid fa-bookmark" style={{ color: '#fbbf24' }}></i>
            Saved Jobs
          </h1>
          <span className={styles.savedCount}>
            {savedPosts.length} {savedPosts.length === 1 ? 'Job' : 'Jobs'}
          </span>
        </div>
        <button className={styles.backToHomeBtn} onClick={() => navigate('/')}>
          <i className="fa-solid fa-arrow-left"></i> Back to Home
        </button>
      </div>

      {/* কন্টেন্ট */}
      <div className={styles.savedJobsGrid}>
        {loading ? (
          renderLoading()
        ) : savedPosts.length > 0 ? (
          savedPosts.map((post) => (
            <JobCard
              key={post.id}
              id={post.id}
              job={post}
              isSavedExternally={true}
              onUnsave={() => handleUnsavePost(post.id)}
              onBidAndChatClick={handleBidAndChat}
              searchTerm=""
              highlightText={(text) => text}
            />
          ))
        ) : (
          renderEmptyState()
        )}
      </div>
    </div>
  );
}

export default SavedJobsPage;