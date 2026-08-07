// src/contexts/PostContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc, 
  where,
  getDocs,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';

// ============================================================
// 📌 Context তৈরি
// ============================================================
const PostContext = createContext();

// ============================================================
// 📌 Custom Hook
// ============================================================
export const usePosts = () => {
  const context = useContext(PostContext);
  if (!context) {
    throw new Error('❌ usePosts must be used within PostProvider');
  }
  return context;
};

// ============================================================
// 📌 Post Provider
// ============================================================
export const PostProvider = ({ children }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalPosts, setTotalPosts] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ============================================================
  // 🎯 Firebase রিয়েল-টাইম লিসেনার
  // ============================================================
  useEffect(() => {
    setLoading(true);
    
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const fetchedPosts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log("🔥 Posts updated in Context:", fetchedPosts.length);
        setPosts(fetchedPosts);
        setTotalPosts(fetchedPosts.length);
        setLastUpdated(new Date());
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("❌ Error fetching posts:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    
    return () => unsubscribe();
  }, []);

  // ============================================================
  // 🎯 পোস্ট ডিলিট
  // ============================================================
  const deletePost = useCallback(async (postId) => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
      console.log("✅ Post deleted:", postId);
      return { success: true };
    } catch (error) {
      console.error("❌ Error deleting post:", error);
      return { success: false, error: error.message };
    }
  }, []);

  // ============================================================
  // 🎯 পোস্ট আপডেট
  // ============================================================
  const updatePost = useCallback(async (postId, updatedData) => {
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        ...updatedData,
        updatedAt: serverTimestamp()
      });
      console.log("✅ Post updated:", postId);
      return { success: true };
    } catch (error) {
      console.error("❌ Error updating post:", error);
      return { success: false, error: error.message };
    }
  }, []);

  // ============================================================
  // 🎯 নতুন পোস্ট যোগ
  // ============================================================
  const addPost = useCallback(async (postData) => {
    try {
      const postsRef = collection(db, 'posts');
      const docRef = await addDoc(postsRef, {
        ...postData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log("✅ Post added:", docRef.id);
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error("❌ Error adding post:", error);
      return { success: false, error: error.message };
    }
  }, []);

  // ============================================================
  // 🎯 পোস্ট ফিল্টার (মোড অনুযায়ী)
  // ============================================================
  const getFilteredPosts = useCallback((currentMode, searchTerm = '') => {
    let filtered = posts;
    
    // মোড অনুযায়ী ফিল্টার
    if (currentMode === 'freelancer') {
      filtered = filtered.filter(post => 
        post.type === 'service' || post.type === 'freelancer'
      );
    } else if (currentMode === 'buyer') {
      filtered = filtered.filter(post => 
        post.type === 'hire' || post.type === 'buyer'
      );
    }
    
    // সার্চ টার্ম অনুযায়ী ফিল্টার
    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(post => 
        post.title?.toLowerCase().includes(term) ||
        post.description?.toLowerCase().includes(term) ||
        post.clientName?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [posts]);

  // ============================================================
  // 🎯 একক পোস্ট পাওয়া
  // ============================================================
  const getPostById = useCallback((postId) => {
    return posts.find(post => post.id === postId) || null;
  }, [posts]);

  // ============================================================
  // 🎯 ইউজারের পোস্ট পাওয়া
  // ============================================================
  const getUserPosts = useCallback((userId) => {
    return posts.filter(post => post.userId === userId);
  }, [posts]);

  // ============================================================
  // 🎯 পোস্ট স্ট্যাটাস
  // ============================================================
  const postStats = useMemo(() => {
    const total = posts.length;
    const hired = posts.filter(p => p.type === 'hire').length;
    const services = posts.filter(p => p.type === 'service').length;
    const active = posts.filter(p => p.status === 'active').length;
    const completed = posts.filter(p => p.status === 'completed').length;
    
    return {
      total,
      hired,
      services,
      active,
      completed
    };
  }, [posts]);

  // ============================================================
  // 📌 Context Value
  // ============================================================
  const value = {
    // ডেটা
    posts,
    loading,
    error,
    totalPosts,
    lastUpdated,
    postStats,
    
    // ফাংশন
    deletePost,
    updatePost,
    addPost,
    getFilteredPosts,
    getPostById,
    getUserPosts
  };

  return (
    <PostContext.Provider value={value}>
      {children}
    </PostContext.Provider>
  );
};