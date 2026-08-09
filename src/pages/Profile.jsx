// src/pages/Profile.jsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';
import { auth, db } from '@/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { useAuth } from '@/context/AuthContext';
import ProfileProgress from "@components/ProfileProgress";
import toast from 'react-hot-toast';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { checkActiveDealForUser } from './chatHelpers';
// Cloudinary upload function
const uploadToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "workhub_preset");

  try {
    const response = await fetch(
      "https://api.cloudinary.com/v1_1/drwex6tmf/image/upload",
      { method: "POST", body: formData }
    );
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    return null;
  }
};

function Profile() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const { userData, reloadUserData } = useAuth();
  const feedback = useFeedback();
  const [refreshing, setRefreshing] = useState(false);

  // ========== স্টেট ==========

  const [activeDealPosts, setActiveDealPosts] = useState({});
const [checkingDeals, setCheckingDeals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [userPosts, setUserPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [savedPostIds, setSavedPostIds] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [savedPostsLoading, setSavedPostsLoading] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    budget: '',
    deadline: '',
    images: []
  });

  // ========== রিভিউ স্টেট ==========
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [userRating, setUserRating] = useState({ average: 0, total: 0 });

  const [editImages, setEditImages] = useState([]);
  const [editImagePreviews, setEditImagePreviews] = useState([]);
  const [editImageLoading, setEditImageLoading] = useState(false);
  const editFileInputRef = useRef(null);


const nidFrontRef = useRef(null);
const nidBackRef = useRef(null);
const birthCertRef = useRef(null);

  const [userIdNumber, setUserIdNumber] = useState('');
  const [isEditingId, setIsEditingId] = useState(false);

  // ========== ✅ ডকুমেন্ট ভেরিফিকেশন স্টেট ==========
  const [docStatus, setDocStatus] = useState({
    nidFront: false,
    nidBack: false,
    birth: false,
    faceVerified: false,
    documentsUploaded: false
  });
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('pending');

  // ========== ✅ ফেস ভেরিফিকেশন স্টেট ==========
  const [camStream, setCamStream] = useState(null);
  const [livenessComplete, setLivenessComplete] = useState(false);
  const [currentLivenessStep, setCurrentLivenessStep] = useState(0);
  const [faceVerified, setFaceVerified] = useState(false);

  // Refs for DOM elements
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraBoxRef = useRef(null);
  const camStartBtnRef = useRef(null);
  const captureBtnRef = useRef(null);
  const camStopBtnRef = useRef(null);
  const livenessIntervalRef = useRef(null);
  const streamRef = useRef(null);

  const [livenessState, setLivenessState] = useState([
    { id: 'eyeOpen', label: '👁️ Eyes Open', done: false },
    { id: 'eyeClose', label: '😌 Eyes Closed', done: false },
    { id: 'mouthOpen', label: '👄 Mouth Open', done: false },
    { id: 'mouthClose', label: '😐 Mouth Closed', done: false },
    { id: 'headRight', label: '👉 Head Right', done: false },
    { id: 'headLeft', label: '👈 Head Left', done: false }
  ]);

  // ========== Mode স্টেট ==========
  const [currentMode, setCurrentMode] = useState(() => {
    return localStorage.getItem('profileMode') || 'buyer';
  });

  const handleModeChange = useCallback((mode) => {
    setCurrentMode(mode);
    localStorage.setItem('profileMode', mode);
  }, []);

  // ========== প্রোফাইল ডেটা ==========
  const [profileData, setProfileData] = useState({
    name: '',
    headline: 'Full-Stack Developer | Architecting Scalable Digital Ecosystems',
    about: 'I am a Full-Stack Developer who loves to build scalable digital ecosystems.',
    skills: 'React, Vite, Firebase, Cloudinary, Tailwind CSS, Node.js',
    coverPhoto: 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=1200',
    profilePic: 'https://ui-avatars.com/api/?name=User&background=14b8a6&color=fff&bold=true&size=120'
  });

  // ========== ডকুমেন্ট আপলোড প্রিভিউ স্টেট ==========
  const [selectedDocs, setSelectedDocs] = useState({
    nidFront: null,
    nidBack: null,
    birthCert: null
  });
  const [docPreviews, setDocPreviews] = useState({
    nidFront: '',
    nidBack: '',
    birthCert: ''
  });

  // ============================================================
  // ✅ ক্লিনআপ useEffect — UNMOUNT-ONLY
  // ============================================================
  useEffect(() => {
    return () => {
      if (livenessIntervalRef.current) {
        clearInterval(livenessIntervalRef.current);
        livenessIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);



  // src/pages/Profile.jsx

// ============================================================
// ✅ Check Active Deals for each post
// ============================================================
useEffect(() => {
  const checkActiveDeals = async () => {
    if (!user?.uid || userPosts.length === 0) return;
    
    setCheckingDeals(true);
    try {
      const dealStatus = {};
      
      for (const post of userPosts) {
        // Check if this post has an active deal
        const q = query(
          collection(db, 'deals'),
          where('postId', '==', post.id),
          where('status', 'in', ['active', 'overdue'])
        );
        const snapshot = await getDocs(q);
        dealStatus[post.id] = {
          hasActiveDeal: !snapshot.empty,
          dealCount: snapshot.size,
          deals: snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        };
      }
      
      setActiveDealPosts(dealStatus);
    } catch (error) {
      console.error('❌ Error checking active deals:', error);
    } finally {
      setCheckingDeals(false);
    }
  };
  
  checkActiveDeals();
}, [user?.uid, userPosts]);

  // ============================================================
  // ✅ রিভিউ ফেচ করা
  // ============================================================
  useEffect(() => {
    if (!user?.uid) return;

    const fetchReviews = async () => {
      setReviewsLoading(true);
      try {
        const q = query(
          collection(db, 'reviews'),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        const reviewsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        reviewsData.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB - dateA;
        });

        setReviews(reviewsData);

        if (reviewsData.length > 0) {
          const total = reviewsData.reduce((sum, r) => sum + r.rating, 0);
          const average = total / reviewsData.length;
          setUserRating({
            average: Math.round(average * 10) / 10,
            total: reviewsData.length
          });
        }
      } catch (error) {
        console.error("Error fetching reviews:", error);
      } finally {
        setReviewsLoading(false);
      }
    };

    fetchReviews();
  }, [user?.uid]);

  // ============================================================
  // ✅ ইউজারের savedPosts আইডি লোড করা
  // ============================================================
  useEffect(() => {
    if (!user) return;

    const loadSavedPostIds = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setSavedPostIds(data.savedPosts || []);

          setIsVerified(data.isVerified || false);
          setVerificationStatus(data.verificationStatus || 'pending');

          const docs = data.documents || {};
          setDocStatus({
            nidFront: !!docs.nidFront,
            nidBack: !!docs.nidBack,
            birth: !!docs.birthCert,
            faceVerified: !!data.facePhotoUrl,
            documentsUploaded: !!(docs.nidFront || docs.birthCert)
          });
          setFaceVerified(!!data.facePhotoUrl);
        }
      } catch (error) {
        console.error("Error loading saved posts:", error);
      }
    };

    loadSavedPostIds();
  }, [user]);

  // ============================================================
  // ✅ সেভ করা পোস্ট লোড করা
  // ============================================================
  useEffect(() => {
    if (activeTab !== 'saved' || !user) return;

    const loadSavedPosts = async () => {
      setSavedPostsLoading(true);
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const savedIds = userDoc.data()?.savedPosts || [];

        if (savedIds.length === 0) {
          setSavedPosts([]);
          setSavedPostsLoading(false);
          return;
        }

        const chunkSize = 10;
        const chunks = [];
        for (let i = 0; i < savedIds.length; i += chunkSize) {
          chunks.push(savedIds.slice(i, i + chunkSize));
        }

        const allPosts = [];
        for (const chunk of chunks) {
          const q = query(collection(db, "posts"), where("__name__", "in", chunk));
          const querySnapshot = await getDocs(q);
          querySnapshot.docs.forEach(doc => {
            allPosts.push({ id: doc.id, ...doc.data() });
          });
        }

        setSavedPosts(allPosts);
      } catch (error) {
        console.error("Error loading saved posts:", error);
        setSavedPosts([]);
      } finally {
        setSavedPostsLoading(false);
      }
    };

    loadSavedPosts();
  }, [activeTab, user]);

  // ============================================================
  // ✅ ইউজার ডাটা লোড করা
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const loadUserData = async () => {
      setLoading(true);
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfileData(prev => ({
            ...prev,
            name: data.displayName || user.displayName || user.email?.split('@')[0] || 'User',
            headline: data.headline || prev.headline,
            about: data.about || prev.about,
            skills: data.skills || prev.skills,
            coverPhoto: data.coverPhoto || prev.coverPhoto,
            profilePic: data.photoURL || user.photoURL || prev.profilePic
          }));
          setUserIdNumber(data.userIdNumber || '');
          setSavedPostIds(data.savedPosts || []);

          setIsVerified(data.isVerified || false);
          setVerificationStatus(data.verificationStatus || 'pending');

          const docs = data.documents || {};
          setDocStatus({
            nidFront: !!docs.nidFront,
            nidBack: !!docs.nidBack,
            birth: !!docs.birthCert,
            faceVerified: !!data.facePhotoUrl,
            documentsUploaded: !!(docs.nidFront || docs.birthCert)
          });
          setFaceVerified(!!data.facePhotoUrl);
        } else {
          setProfileData(prev => ({
            ...prev,
            name: user.displayName || user.email?.split('@')[0] || 'User'
          }));
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [user, navigate]);

  // ============================================================
  // ✅ ইউজারের নিজের পোস্ট লোড করা
  // ============================================================
  useEffect(() => {
    if (!user?.uid) return;

    const loadPosts = async () => {
      setPostsLoading(true);
      try {
        const q = query(
          collection(db, 'posts'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

        const uniquePostsMap = new Map();
        snapshot.docs.forEach(doc => {
          if (!uniquePostsMap.has(doc.id)) {
            uniquePostsMap.set(doc.id, {
              id: doc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt || new Date().toISOString(),
              status: doc.data().status || 'pending'
            });
          }
        });

        const posts = Array.from(uniquePostsMap.values());
        setUserPosts(posts);

      } catch (error) {
        console.error("Error loading posts:", error);
      } finally {
        setPostsLoading(false);
      }
    };

    loadPosts();
  }, [user?.uid]);

  // ============================================================
  // ✅ প্রোফাইল সেভ করা
  // ============================================================
  const handleSaveProfile = async () => {
    if (!user) return;

    const trimmedName = profileData.name?.trim() || '';

    if (!trimmedName) {
      feedback.alert.warning({ message: 'Please enter your name!' });
      return;
    }

    if (trimmedName.length > 100) {
      feedback.alert.warning({ 
        message: 'Name cannot be longer than 100 characters!' 
      });
      return;
    }

    const trimmedHeadline = profileData.headline?.trim() || '';
    const trimmedAbout = profileData.about?.trim() || '';
    const trimmedSkills = profileData.skills?.trim() || '';

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', user.uid);

      batch.update(userRef, {
        displayName: trimmedName,
        headline: trimmedHeadline,
        about: trimmedAbout,
        skills: trimmedSkills,
        photoURL: profileData.profilePic,
        updatedAt: serverTimestamp()
      });

      const chatsQuery = query(
        collection(db, 'chats'), 
        where('participants', 'array-contains', user.uid)
      );
      const snapshot = await getDocs(chatsQuery);

      snapshot.forEach((chatDoc) => {
        batch.update(chatDoc.ref, {
          [`participantsData.${user.uid}.name`]: trimmedName,
          [`participantsData.${user.uid}.photo`]: profileData.profilePic
        });
      });

      await batch.commit();

      await updateProfile(user, {
        displayName: trimmedName,
        photoURL: profileData.profilePic
      });

      setProfileData(prev => ({
        ...prev,
        name: trimmedName
      }));

      feedback.alert.success({ message: '✅ Profile updated successfully!' });
      setIsEditing(false);

    } catch (error) {
      console.error("❌ Error saving profile:", error);
      
      if (error.code === 'auth/too-many-requests') {
        feedback.alert.error({ 
          message: 'Too many requests. Please try again later.' 
        });
      } else {
        feedback.alert.error({ 
          message: 'Failed to save profile: ' + error.message 
        });
      }
    }
  };


  // ============================================================
  // ✅ আবার আপলোড হ্যান্ডলার
  // FIX: আগে এই ফাংশন requestAnimationFrame + setTimeout দিয়ে
  // ref.current.click() করার চেষ্টা করত, কিন্তু docStatus.documentsUploaded
  // true থাকলে renderDocumentsTab() আসল <input> গুলোই DOM-এ রেন্ডার করত না
  // (নিচে renderDocumentsTab দেখুন — hasRejectedDoc চেক যোগ করা হয়েছে)।
  // এখন যেহেতু rejected doc থাকলে input সবসময় DOM-এ থাকে, তাই সরাসরি click()
  // করলেই কাজ করবে — বাড়তি hack-এর দরকার নেই।
  // ============================================================
  const handleUploadAgain = useCallback((type) => {
    setActiveTab('documents');

    const inputMap = {
      nidFront: nidFrontRef,
      nidBack: nidBackRef,
      birthCert: birthCertRef
    };

    const ref = inputMap[type];
    if (ref?.current) {
      ref.current.click();
    } else {
      // fallback: ID দিয়ে খোঁজা (এক ফ্রেম পরে, রি-রেন্ডারের জন্য)
      requestAnimationFrame(() => {
        const fallbackInput = document.getElementById(type);
        if (fallbackInput) fallbackInput.click();
      });
    }
  }, []);

  // ============================================================
  // ✅ আইডি নাম্বার সেভ
  // ============================================================
  const handleSaveUserIdNumber = async () => {
    if (!user) return;

    const cleanedId = userIdNumber.trim();
    if (!cleanedId) {
      feedback.alert.warning({ message: 'Please enter a valid ID number!' });
      return;
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(cleanedId)) {
      feedback.alert.warning({ message: 'ID number can only contain letters, numbers, underscore (_) and hyphen (-)!' });
      return;
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        userIdNumber: cleanedId,
        updatedAt: serverTimestamp()
      });

      feedback.alert.success({ message: 'ID Number saved successfully!' });
      setIsEditingId(false);
    } catch (error) {
      console.error("Error saving ID number:", error);
      feedback.alert.error({ message: 'Failed to save ID number: ' + error.message });
    }
  };

  // ============================================================
  // ✅ প্রোফাইল পিক আপলোড
  // ============================================================
  const handleProfilePicUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const imageUrl = await uploadToCloudinary(file);
      if (imageUrl) {
        const batch = writeBatch(db);

        const userRef = doc(db, 'users', auth.currentUser.uid);
        batch.update(userRef, { photoURL: imageUrl });

        const q = query(collection(db, 'posts'), where('userId', '==', auth.currentUser.uid));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((postDoc) => {
          batch.update(postDoc.ref, { userPhotoURL: imageUrl });
        });

        await batch.commit();
        await updateProfile(auth.currentUser, { photoURL: imageUrl });

        setProfileData(prev => ({ ...prev, profilePic: imageUrl }));
        feedback.alert.success({ message: 'Profile and all your posts have been updated!' });
      }
    } catch (error) {
      console.error("Error:", error);
      feedback.alert.error({ message: 'Profile picture upload failed!' });
    }
  };

  // ============================================================
  // ✅ ডকুমেন্ট ফাইল হ্যান্ডলিং ও প্রিভিউ
  // ============================================================
  const handleDocFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) {
      console.warn(`⚠️ No file selected for ${type}`);
      return;
    }

    console.log(`📁 File selected for ${type}:`, file.name, `(${(file.size / 1024).toFixed(1)}KB)`);

    setSelectedDocs(prev => ({ ...prev, [type]: file }));

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setDocPreviews(prev => ({ ...prev, [type]: event.target.result }));
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      setDocPreviews(prev => ({ ...prev, [type]: 'pdf' }));
    } else {
      setDocPreviews(prev => ({ ...prev, [type]: 'file' }));
    }
  };

  const handleRemoveDocFile = (type) => {
    setSelectedDocs(prev => ({ ...prev, [type]: null }));
    setDocPreviews(prev => ({ ...prev, [type]: '' }));

    const input = document.getElementById(type);
    if (input) input.value = '';
  };

  // ============================================================
  // ✅ ডকুমেন্ট আপলোড ফাংশন
  // ============================================================
  const uploadDocuments = async () => {
    if (!selectedDocs.nidFront && !selectedDocs.nidBack && !selectedDocs.birthCert) {
      feedback.alert.warning({ message: 'Please select at least one document!' });
      return;
    }

    setUploadingDocs(true);
    setUploadProgress(0);

    try {
      const uploadedDocs = {};
      let progress = 0;

      // ── NID Front ──
      if (selectedDocs.nidFront) {
        const url = await uploadToCloudinary(selectedDocs.nidFront);
        uploadedDocs.nidFront = {
          url,
          status: 'pending',        // ✅ Re-upload হলে pending
          rejectReason: ''          // ✅ পুরনো reject reason মুছে যায়
        };
        progress += 33;
        setUploadProgress(progress);
      }

      // ── NID Back ──
      if (selectedDocs.nidBack) {
        const url = await uploadToCloudinary(selectedDocs.nidBack);
        uploadedDocs.nidBack = {
          url,
          status: 'pending',        // ✅ Re-upload হলে pending
          rejectReason: ''          // ✅ পুরনো reject reason মুছে যায়
        };
        progress += 33;
        setUploadProgress(progress);
      }

      // ── Birth Certificate ──
      if (selectedDocs.birthCert) {
        const url = await uploadToCloudinary(selectedDocs.birthCert);
        uploadedDocs.birthCert = {
          url,
          status: 'pending',        // ✅ Re-upload হলে pending
          rejectReason: ''          // ✅ পুরনো reject reason মুছে যায়
        };
        progress += 34;
        setUploadProgress(progress);
      }

      // ── Update Firestore ──
      await updateDoc(doc(db, 'users', user.uid), {
        documents: uploadedDocs,
        documentVerified: false,
        verificationStatus: 'pending',  // ✅ আবার পেন্ডিং
        isVerified: false, 
        needsReview: true,             // ✅ আবার অনুমোদিত নয়
        documentSubmittedAt: serverTimestamp()
      });

      // ── Update local state ──
      setDocStatus(prev => ({ 
        ...prev, 
        documentsUploaded: true,
        nidFront: !!uploadedDocs.nidFront,
        nidBack: !!uploadedDocs.nidBack,
        birth: !!uploadedDocs.birthCert
      }));
      setVerificationStatus('pending');
      setIsVerified(false);
      setUploadProgress(100);
      
      feedback.alert.success({ message: 'Document re-uploaded! Admin is verifying...' });
      checkCompletion();

    } catch (error) {
      console.error('Document upload error:', error);
      feedback.alert.error({ message: 'Document upload failed' });
    } finally {
      setUploadingDocs(false);
    }
  };

  // ============================================================
  // ✅ ফেস ভেরিফিকেশন ফাংশন
  // ============================================================

  const updateLivenessUI = useCallback((doneCount) => {
    const total = livenessState.length;
    const progressText = document.getElementById('livenessProgressText');
    const progressFill = document.getElementById('livenessProgressFill');

    if (progressText) progressText.textContent = `${Math.min(doneCount, total)}/${total} Completed`;
    if (progressFill) progressFill.style.width = `${Math.min((doneCount / total) * 100, 100)}%`;
  }, [livenessState.length]);

  const resetLiveness = useCallback(() => {
    if (livenessIntervalRef.current) {
      clearInterval(livenessIntervalRef.current);
      livenessIntervalRef.current = null;
    }

    setLivenessComplete(false);
    setCurrentLivenessStep(0);
    setLivenessState(prev => prev.map(s => ({ ...s, done: false })));
    updateLivenessUI(0);
  }, [updateLivenessUI]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });

      streamRef.current = stream;
      setCamStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const videoEl = videoRef.current;
        await new Promise((resolve) => {
          if (videoEl.readyState >= 1) {
            resolve();
          } else {
            videoEl.onloadedmetadata = () => resolve();
          }
        });
        try {
          await videoEl.play();
        } catch (playErr) {
          console.warn('Video play() failed, retrying once:', playErr);
          try { await videoEl.play(); } catch (e2) { console.error(e2); }
        }
      }

      if (cameraBoxRef.current) cameraBoxRef.current.classList.add('camera-active');
      if (camStartBtnRef.current) camStartBtnRef.current.style.display = 'none';
      if (captureBtnRef.current) captureBtnRef.current.style.display = 'inline-flex';
      if (camStopBtnRef.current) camStopBtnRef.current.style.display = 'inline-flex';

      feedback.toast({ message: '📷 Camera turned on', variant: 'info' });
      resetLiveness();

      setTimeout(startLivenessDetection, 1000);

    } catch (error) {
      console.error('Camera error:', error);
      if (error.name === 'NotAllowedError') {
        feedback.alert.warning({ message: 'Camera access denied' });
      } else {
        feedback.alert.error({ message: 'Could not turn on camera' });
      }
    }
  }, [feedback, resetLiveness]);

  const stopCamera = useCallback(() => {
    if (livenessIntervalRef.current) {
      clearInterval(livenessIntervalRef.current);
      livenessIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCamStream(null);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }

    if (cameraBoxRef.current) cameraBoxRef.current.classList.remove('camera-active');
    if (camStartBtnRef.current) camStartBtnRef.current.style.display = 'inline-flex';
    if (captureBtnRef.current) captureBtnRef.current.style.display = 'none';
    if (camStopBtnRef.current) camStopBtnRef.current.style.display = 'none';

    resetLiveness();
  }, [resetLiveness]);

  const startLivenessDetection = useCallback(() => {
    if (livenessComplete) return;

    if (livenessIntervalRef.current) {
      clearInterval(livenessIntervalRef.current);
      livenessIntervalRef.current = null;
    }

    setLivenessState(prev => prev.map(s => ({ ...s, done: false })));
    setCurrentLivenessStep(0);
    setLivenessComplete(false);

    let step = 0;
    const totalSteps = livenessState.length;

    livenessIntervalRef.current = setInterval(() => {
      if (step >= totalSteps) {
        clearInterval(livenessIntervalRef.current);
        livenessIntervalRef.current = null;
        setLivenessComplete(true);

        updateLivenessUI(totalSteps);

        setTimeout(capturePhoto, 1000);
        return;
      }

      setLivenessState(prev => {
        const updated = [...prev];
        if (step < updated.length) {
          updated[step].done = true;
        }
        return updated;
      });

      setCurrentLivenessStep(step);
      updateLivenessUI(step + 1);
      step++;

    }, 3000);

  }, [livenessComplete, livenessState.length, updateLivenessUI]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      feedback.alert.error({ message: 'ক্যামেরা বা ক্যানভাস পাওয়া যায়নি' });
      return;
    }

    try {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to capture photo'));
          }
        }, 'image/jpeg', 0.92);
      });

      stopCamera();

      const file = new File([blob], 'face_photo.jpg', { type: 'image/jpeg' });
      const url = await uploadToCloudinary(file);

      if (!url) {
        throw new Error('Failed to upload photo');
      }

      // ✅ Re-upload হলে সব রিসেট হবে
      await updateDoc(doc(db, 'users', user.uid), {
        facePhotoUrl: url,
        faceStatus: 'pending',        // ✅ Re-upload হলে pending
        faceRejectReason: '',         // ✅ পুরনো reject reason মুছে যায়
        faceVerified: false,          // ✅ আবার অনুমোদিত নয়
        verificationStatus: 'pending', // ✅ আবার পেন্ডিং
        isVerified: false,            // ✅ আবার অনুমোদিত নয়
        documentVerified: false,
        needsReview: true
      });

      setFaceVerified(false);
      setVerificationStatus('pending');
      setIsVerified(false);
      setDocStatus(prev => ({ ...prev, faceVerified: true }));
      
      feedback.alert.success({ message: 'Face photo re-uploaded! Admin is verifying...' });
      checkCompletion();

    } catch (error) {
      console.error('Photo capture error:', error);
      feedback.alert.error({ message: 'Failed to capture or upload photo' });

      if (camStartBtnRef.current) camStartBtnRef.current.style.display = 'none';
      if (captureBtnRef.current) captureBtnRef.current.style.display = 'inline-flex';
      if (camStopBtnRef.current) camStopBtnRef.current.style.display = 'inline-flex';
    }
  }, [user, feedback, stopCamera]);

  // ============================================================
  // ✅ কমপ্লিটনেস চেক
  // ============================================================
  const checkCompletion = async () => {
    if (!user) return;

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const data = userDoc.data();

      const hasRequiredFields = !!(data.displayName && data.email && data.phone);
      const hasDocument = !!(data.documents?.nidFront || data.documents?.birthCert);
      const hasFace = !!data.facePhotoUrl;
      const isComplete = hasRequiredFields && hasDocument && hasFace;

      if (isComplete && !data.isComplete) {
        await updateDoc(doc(db, 'users', user.uid), {
          isComplete: true,
          completedAt: serverTimestamp()
        });
        feedback.alert.success({ message: 'Your profile is complete! You can now make transactions.' });
      }
    } catch (error) {
      console.error('Completion check error:', error);
    }
  };

  // ============================================================
  // ✅ ফিল্টারিং
  // ============================================================
  const filteredPosts = useMemo(() => {
    return userPosts.filter(post => {
      if (post.status !== 'approved') return false;
      
      if (currentMode === 'buyer') {
        return post.type === 'hire';
      } else {
        return post.type === 'service';
      }
    });
  }, [userPosts, currentMode]);

  const pendingPostsCount = useMemo(() => {
    return userPosts.filter(post => post.status === 'pending').length;
  }, [userPosts]);

  const rejectedPostsCount = useMemo(() => {
    return userPosts.filter(post => post.status === 'rejected').length;
  }, [userPosts]);

  // ============================================================
  // ✅ FIX: ডকুমেন্ট/ফেস rejected কিনা তা আলাদাভাবে ট্র্যাক করা হয়।
  // আগে শুধু docStatus.documentsUploaded / docStatus.faceVerified
  // চেক করে success বক্স দেখানো হতো, যেটা reject হওয়ার পরেও true
  // থাকত (কারণ ডকুমেন্ট/ছবি আগে আপলোড হয়েছিল)। ফলে upload ফর্ম আর
  // ক্যামেরা UI-ই DOM-এ রেন্ডার হতো না, আর "Upload Again" / "Capture
  // Again" বাটন কাজ করত না।
  // ============================================================
  const hasRejectedDoc = useMemo(() => {
    return (
      userData?.documents?.nidFront?.status === 'rejected' ||
      userData?.documents?.nidBack?.status === 'rejected' ||
      userData?.documents?.birthCert?.status === 'rejected'
    );
  }, [userData]);

  const isFaceRejected = userData?.faceStatus === 'rejected';

  const formatDate = (date) => {
    if (!date) return 'N/A';
    
    try {
      let dateObj = null;
      
      if (date && typeof date === 'object' && date.seconds !== undefined) {
        dateObj = new Date(date.seconds * 1000);
      } else if (date && typeof date === 'object' && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (typeof date === 'string' || typeof date === 'number') {
        dateObj = new Date(date);
      } else if (date instanceof Date) {
        dateObj = date;
      }
      
      if (!dateObj || isNaN(dateObj.getTime())) {
        return 'N/A';
      }
      
      return dateObj.toLocaleDateString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'N/A';
    }
  };

  // ============================================================
  // ✅ পোস্ট সেভ/আনসেভ টগল
  // ============================================================
  const toggleSavePost = async (postId) => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const isCurrentlySaved = savedPostIds.includes(postId);

    try {
      if (isCurrentlySaved) {
        await updateDoc(userRef, {
          savedPosts: arrayRemove(postId)
        });
        setSavedPostIds(prev => prev.filter(id => id !== postId));
        setSavedPosts(prev => prev.filter(p => p.id !== postId));
      } else {
        await updateDoc(userRef, {
          savedPosts: arrayUnion(postId)
        });
        setSavedPostIds(prev => [...prev, postId]);
      }
    } catch (error) {
      console.error("Error toggling save:", error);
    }
  };

  // ============================================================
  // ✅ পোস্ট এডিট ফাংশন
  // ============================================================
// src/pages/Profile.jsx

// ============================================================
// ✅ পোস্ট এডিট ফাংশন (with Active Deal Check)
// ============================================================
const handleEditPost = (post) => {
  // ✅ Check if post has active deal
  const postDealStatus = activeDealPosts[post.id];
  
  if (postDealStatus?.hasActiveDeal) {
    const dealCount = postDealStatus.dealCount || 1;
    feedback.alert.error({
      message: `⛔ এই পোস্টটি এডিট করা যাচ্ছে না!`,
      description: `এই পোস্টের সাথে ${dealCount} টি Active Deal রয়েছে। Active Deal শেষ না হওয়া পর্যন্ত পোস্ট এডিট করা যাবে না।`
    });
    return;
  }

  setEditingPost(post);
  setEditForm({
    title: post.title || '',
    description: post.description || '',
    budget: typeof post.budget === 'object' ? JSON.stringify(post.budget) : (post.budget || post.price || ''),
    deadline: typeof post.deadline === 'object' ? JSON.stringify(post.deadline) : (post.deadline || post.deliveryDays || ''),
    images: post.images || []
  });
  setEditImagePreviews([...(post.images || [])]);
  setEditImages([]);
};

  const handleEditImageChange = (e) => {
    const files = Array.from(e.target.files);
    const remainingSlots = 2 - editImagePreviews.length;

    if (files.length > remainingSlots) {
      feedback.alert.warning({ message: `You can only add ${remainingSlots} more image(s). Maximum 2 images allowed!` });
      return;
    }

    const newPreviews = files.map(file => URL.createObjectURL(file));
    setEditImages(prev => [...prev, ...files]);
    setEditImagePreviews(prev => [...prev, ...newPreviews]);
  };

  const handleRemoveEditImage = (indexToRemove) => {
    const previewToRemove = editImagePreviews[indexToRemove];
    const isExistingImage = typeof previewToRemove === 'string' && previewToRemove.startsWith('http');

    if (isExistingImage) {
      const imageUrlToRemove = previewToRemove.split('?')[0];
      setEditForm(prev => ({
        ...prev,
        images: prev.images.filter(img => img.split('?')[0] !== imageUrlToRemove)
      }));
    } else {
      const fileIndex = indexToRemove - (editForm.images?.length || 0);
      if (fileIndex >= 0 && fileIndex < editImages.length) {
        setEditImages(prev => prev.filter((_, i) => i !== fileIndex));
      }
    }

    setEditImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const uploadEditImages = async () => {
    if (editImages.length === 0) return [];

    const uploadedUrls = [];
    for (const file of editImages) {
      try {
        const url = await uploadToCloudinary(file);
        if (url) uploadedUrls.push(url);
      } catch (error) {
        console.error("Image upload failed:", error);
      }
    }
    return uploadedUrls;
  };

const handleUpdatePost = async () => {
  if (!editingPost) return;

  setEditImageLoading(true);

  try {
    const postRef = doc(db, 'posts', editingPost.id);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      feedback.alert.error({ message: 'This post no longer exists.' });
      setEditingPost(null);
      setEditImageLoading(false);
      return;
    }

    const postData = postSnap.data();
    
    if (postData.editStatus === 'pending') {
      feedback.alert.warning({ 
        message: 'This post already has a pending edit. Please wait for admin approval.' 
      });
      setEditingPost(null);
      setEditImageLoading(false);
      return;
    }

    const existingImages = (editForm.images || []).filter(img => typeof img === 'string' && img.startsWith('http'));
    
    let newImageUrls = [];
    if (editImages.length > 0) {
      newImageUrls = await uploadEditImages();
    }

    const finalImages = [...existingImages, ...newImageUrls];

    const hadImagesBefore = Array.isArray(postData.images) && postData.images.length > 0;
    if (hadImagesBefore && finalImages.length === 0) {
      feedback.alert.warning({ message: 'Please keep at least one image for your post.' });
      setEditImageLoading(false);
      return;
    }

    // ✅ Preserve original budget/deadline objects
    const originalBudget = postData.budget || postData.price;
    const originalDeadline = postData.deadline || postData.deliveryDays;

    const pendingChanges = {
      title: editForm.title,
      description: editForm.description,
      budget: originalBudget,
      deadline: originalDeadline,
      images: finalImages,
      updatedAt: serverTimestamp()
    };

    if (postData.status === 'approved') {
      await updateDoc(postRef, {
        editStatus: 'pending',
        pendingChanges: pendingChanges,
        editSubmittedAt: serverTimestamp(),
        editApprovedAt: null,
        editRejectedAt: null,
        editRejectReason: null,
        updatedAt: serverTimestamp()
      });

      feedback.alert.success({ 
        message: '✅ Edit submitted for admin approval!',
        description: 'Your changes will be published once approved by admin.'
      });

    } else {
      await updateDoc(postRef, {
        ...pendingChanges,
        updatedAt: serverTimestamp()
      });

      feedback.alert.success({ message: 'Post updated successfully!' });
    }

    setUserPosts(prev => prev.map(post =>
      post.id === editingPost.id
        ? {
            ...post,
            ...pendingChanges,
            editStatus: postData.status === 'approved' ? 'pending' : null,
            pendingChanges: postData.status === 'approved' ? pendingChanges : null
          }
        : post
    ));

    setEditingPost(null);
    setEditForm({ title: '', description: '', budget: '', deadline: '', images: [] });
    setEditImages([]);
    setEditImagePreviews([]);

  } catch (error) {
    console.error("❌ Update error:", error);
    feedback.alert.error({ message: 'Failed to update post: ' + error.message });
  } finally {
    setEditImageLoading(false);
  }
};

  const handlePdfPreview = (file) => {
    if (file) {
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    }
  };

  // ============================================================
  // ✅ পোস্ট ডিলিট
  // ============================================================
// src/pages/Profile.jsx

// ============================================================
// ✅ পোস্ট ডিলিট (Active Deal Check সহ)
// ============================================================
const handleDeletePost = async (postId) => {
  // ✅ Check if post has active deal
  const postDealStatus = activeDealPosts[postId];
  
  if (postDealStatus?.hasActiveDeal) {
    const dealCount = postDealStatus.dealCount || 1;
    feedback.alert.error({
      message: `⛔ এই পোস্টটি ডিলিট করা যাচ্ছে না!`,
      description: `এই পোস্টের সাথে ${dealCount} টি Active Deal রয়েছে। Active Deal শেষ না হওয়া পর্যন্ত পোস্ট ডিলিট করা যাবে না।`
    });
    return;
  }

  const confirmed = await feedback.confirm({
    title: 'Delete Post?',
    message: 'Are you sure you want to delete this post permanently?',
    variant: 'delete'
  });
  
  if (!confirmed) return;

  setPostsLoading(true);

  try {
    const batch = writeBatch(db);
    const postRef = doc(db, 'posts', postId);
    batch.delete(postRef);
    await batch.commit();

    setUserPosts(prev => prev.filter(p => p.id !== postId));
    feedback.alert.success({ message: 'Post deleted successfully!' });

  } catch (error) {
    console.error("❌ Delete error:", error);
    feedback.alert.error({ message: 'Failed to delete post: ' + error.message });
  } finally {
    setPostsLoading(false);
  }
};

  // ============================================================
  // ✅ পোর্টফোলিও লিংক কপি
  // ============================================================
  const handleCopyLink = () => {
    const portfolioLink = `https://WorkTrustbd.com/profile/${user?.uid}`;
    navigator.clipboard.writeText(portfolioLink);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await reloadUserData();
      if (data) {
        toast.success('✅ Profile refreshed successfully!');
        setProfileData(prev => ({
          ...prev,
          name: data.displayName || prev.name,
          headline: data.headline || prev.headline,
          about: data.about || prev.about,
          skills: data.skills || prev.skills,
          profilePic: data.photoURL || prev.profilePic
        }));
        setUserIdNumber(data.userIdNumber || '');
      } else {
        toast.error('❌ Data not found');
      }
    } catch (error) {
      console.error("Refresh error:", error);
      toast.error('❌ Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };



  // ============================================================
// ✅ বাজেট সেফলি ফরম্যাট করা (number অথবা {amount, type, isNegotiable} — দুটোই সাপোর্ট করে)
// ============================================================
const formatBudget = (post) => {
  const raw = post.budget ?? post.price;
  if (raw && typeof raw === 'object') {
    if (raw.type === 'range') {
      const range = `${raw.min ?? 0}-${raw.max ?? 0}`;
      return raw.isNegotiable ? `${range} (আলোচনাসাপেক্ষ)` : range;
    }
    const amount = raw.amount ?? 0;
    return raw.isNegotiable ? `${amount} (আলোচনাসাপেক্ষ)` : `${amount}`;
  }
  return raw ?? 0;
};




// ✅ New: Handles both number and object deadline
const formatDeadline = (post) => {
  const raw = post.deadline ?? post.deliveryDays;
  if (raw && typeof raw === 'object') {
    return raw.type === 'range' ? `${raw.min ?? 0}-${raw.max ?? 0}` : `${raw.days ?? 0}`;
  }
  return raw ?? 0;
};

  // ============================================================
  // ✅ রেন্ডার পোস্ট গ্রিড



  // ============================================================
 const renderPostGrid = (posts, isLoading, emptyMessage) => {
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '40px 20px',
        color: 'var(--text-secondary, #94a3b8)'
      }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ 
          fontSize: '32px', 
          color: 'var(--accent-primary, #14b8a6)',
          marginBottom: '12px'
        }} />
        <p>Loading posts...</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="no-posts">
        <i className="fa-solid fa-folder-open"></i>
        <p>{emptyMessage}</p>
        {activeTab === 'posts' && (
          <button className="create-post-btn" onClick={() => navigate('/')}>
            <i className="fa-solid fa-plus"></i> Create {currentMode === 'buyer' ? 'Job' : 'Service'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="posts-grid">
      {posts.map((post, index) => (
        <div key={`${post.id}-${index}`} className="post-card">
          {/* ── স্ট্যাটাস ব্যাজ ── */}
          {post.status === 'pending' && (
            <div className="post-status-badge pending">
              <i className="fa-solid fa-clock"></i> Pending Approval
            </div>
          )}
          {post.status === 'rejected' && (
            <div className="post-status-badge rejected">
              <i className="fa-solid fa-xmark-circle"></i> Rejected
            </div>
          )}
          {post.status === 'approved' && (
            <div className="post-status-badge approved">
              <i className="fa-solid fa-check-circle"></i> Published
            </div>
          )}

          {/* ── ✅ Active Deal Indicator ── */}
          {activeDealPosts[post.id]?.hasActiveDeal && (
            <div className="active-deal-badge">
              <i className="fa-solid fa-handshake"></i>
              Active Deal ({activeDealPosts[post.id]?.dealCount || 1})
            </div>
          )}

          {/* ── Images ── */}
          {post.images && post.images.length > 0 && (
            <div className={`post-images-container ${post.images.length > 1 ? 'two-images' : 'one-image'}`}>
              {post.images.slice(0, 2).map((img, imgIndex) => (
                <img
                  key={imgIndex}
                  src={`${img.split('?')[0]}?v=${post._updatedAt || Date.now()}`}
                  alt={post.title}
                  className="post-image"
                />
              ))}
              {post.images.length > 2 && (
                <div className="post-image-badge">+{post.images.length - 2}</div>
              )}
            </div>
          )}

          {/* ── Content ── */}
          <div className="post-content">
            <h4>{post.title}</h4>
            <p className="post-description">{post.description?.substring(0, 100)}...</p>
<div className="post-meta">
  <span><i className="fa-solid fa-wallet"></i> {formatBudget(post)} BDT</span>
  <span><i className="fa-regular fa-clock"></i> {formatDeadline(post)} Days</span>
  <span><i className="fa-solid fa-tag"></i> {post.type === 'hire' ? 'Job' : 'Service'}</span>
</div>
            
{/* ── ✅ Approved Post Actions (with Active Deal Check) ── */}
{activeTab === 'posts' && post.status === 'approved' && (
  <div className="post-actions">
    {post.editStatus === 'pending' ? (
      <span className="edit-pending-info">
        <i className="fa-solid fa-hourglass-half"></i> Edit Pending Approval
      </span>
    ) : (
      <button 
        className={`edit-post-btn ${activeDealPosts[post.id]?.hasActiveDeal ? 'disabled' : ''}`}
        onClick={() => handleEditPost(post)}
        disabled={activeDealPosts[post.id]?.hasActiveDeal}
        title={activeDealPosts[post.id]?.hasActiveDeal ? 'Active Deal থাকার কারণে এডিট করা যাবে না' : 'Edit Post'}
      >
        <i className="fa-solid fa-pen"></i> 
        {activeDealPosts[post.id]?.hasActiveDeal ? '🔒 Active Deal' : 'Edit'}
      </button>
    )}
    <button 
      className={`delete-btn ${activeDealPosts[post.id]?.hasActiveDeal ? 'disabled' : ''}`}
      onClick={() => handleDeletePost(post.id)}
      disabled={activeDealPosts[post.id]?.hasActiveDeal}
      title={activeDealPosts[post.id]?.hasActiveDeal ? 'Active Deal থাকার কারণে ডিলিট করা যাবে না' : 'Delete Post'}
    >
      <i className="fa-solid fa-trash"></i>
      {activeDealPosts[post.id]?.hasActiveDeal ? '🔒 Active Deal' : 'Delete'}
    </button>
  </div>
)}
            
            {/* ── Pending Post Actions ── */}
            {activeTab === 'posts' && post.status === 'pending' && (
              <div className="post-actions">
                <span className="pending-info">
                  <i className="fa-solid fa-hourglass-half"></i> Awaiting Admin Approval
                </span>
                <button className="delete-btn" onClick={() => handleDeletePost(post.id)}>
                  <i className="fa-solid fa-trash"></i> Delete
                </button>
              </div>
            )}
            
            {/* ── Rejected Post Actions ── */}
            {activeTab === 'posts' && post.status === 'rejected' && (
              <div className="post-actions">
                <span className="rejected-info">
                  <i className="fa-solid fa-xmark-circle"></i> Rejected by Admin
                  {post.rejectReason && <span className="reject-reason">: {post.rejectReason}</span>}
                </span>
                <button className="delete-btn" onClick={() => handleDeletePost(post.id)}>
                  <i className="fa-solid fa-trash"></i> Delete
                </button>
              </div>
            )}
            
            {/* ── Saved Posts Actions ── */}
            {activeTab === 'saved' && (
              <button
                className="unsave-btn"
                onClick={() => toggleSavePost(post.id)}
              >
                <i className="fa-solid fa-bookmark"></i> Unsave
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
  // ============================================================
  // ✅ ডকুমেন্ট ট্যাব রেন্ডার
  // FIX: `docStatus.documentsUploaded` এর পাশাপাশি `!hasRejectedDoc`
  // চেক করা হচ্ছে। কোনো ডকুমেন্ট rejected থাকলে success বক্সের বদলে
  // upload ফর্মটাই (আসল <input ref=...> সহ) রেন্ডার হবে, তাই
  // "Upload Again" বাটনে ref.current আর null হবে না।
  // ============================================================
  const renderDocumentsTab = () => (
    <div className="tab-panel documents-panel">
      <h3><i className="fa-solid fa-file"></i> Document Verification</h3>
      <p className="tab-subtitle">Upload documents to verify your identity</p>

      <div className="verification-status-box">
        <div className={`status-badge-large ${verificationStatus}`}>
          {verificationStatus === 'verified' && '✅ Verified'}
          {verificationStatus === 'pending' && '⏳ Verification Pending'}
          {verificationStatus === 'rejected' && '❌ Rejected'}
        </div>
        {isVerified && (
          <div className="verified-badge">
            <i className="fa-solid fa-check-circle"></i> Your account is verified
          </div>
        )}
      </div>


      {userData?.documents?.nidFront?.status === 'rejected' && (
        <div className="verify-error">
          <strong>❌ NID Front Rejected</strong>
          <p>{userData.documents.nidFront.rejectReason || 'No reason provided'}</p>
          <button 
            className="upload-again-btn"
            onClick={() => handleUploadAgain('nidFront')}
          >
            📤 Upload Again
          </button>
        </div>
      )}


      {userData?.documents?.nidBack?.status === 'rejected' && (
        <div className="verify-error">
          <strong>❌ NID Back Rejected</strong>
          <p>{userData.documents.nidBack.rejectReason || 'No reason provided'}</p>
          <button 
            className="upload-again-btn"
            onClick={() => handleUploadAgain('nidBack')}
          >
            📤 Upload Again
          </button>
        </div>
      )}


      {userData?.documents?.birthCert?.status === 'rejected' && (
        <div className="verify-error">
          <strong>❌ Birth Certificate Rejected</strong>
          <p>{userData.documents.birthCert.rejectReason || 'No reason provided'}</p>
          <button 
            className="upload-again-btn"
            onClick={() => handleUploadAgain('birthCert')}
          >
            📤 Upload Again
          </button>
        </div>
      )}

      {docStatus.documentsUploaded && !hasRejectedDoc ? (
        <div className="info-box success">
          <span className="info-icon">✅</span>
          <div>
            <strong>Document upload complete!</strong>
            <p>Your document is being verified by admin.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="upload-row">
            <div className="form-group">
              <label>NID Card (Front) <span className="required">*</span></label>
              <div
                className={`upload-area ${docPreviews.nidFront ? 'has-file' : ''}`}
                id="nidFrontArea"
                onClick={() => {
                  if (!docPreviews.nidFront) {
                    nidFrontRef.current?.click();
                  }
                }}
              >
                <input
                  type="file"
                  id="nidFront"
                  ref={nidFrontRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleDocFileChange(e, 'nidFront');
                    e.target.value = ''; // ✅ same file re-upload
                  }}
                />
                {docPreviews.nidFront ? (
                  <div className="upload-preview-container">
                    <img src={docPreviews.nidFront} alt="NID Front Preview" className="upload-preview" />
                    <button
                      type="button"
                      className="upload-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDocFile('nidFront');
                      }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <div className="upload-default">
                    <div className="upload-icon">🪪</div>
                    <div className="upload-label">Front Image</div>
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>NID Card (Back) <span className="required">*</span></label>
              <div
                className={`upload-area ${docPreviews.nidBack ? 'has-file' : ''}`}
                id="nidBackArea"
                onClick={() => {
                  if (!docPreviews.nidBack) {
                    nidBackRef.current?.click();
                  }
                }}
              >
                <input
                  type="file"
                  id="nidBack"
                  ref={nidBackRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleDocFileChange(e, 'nidBack');
                    e.target.value = ''; // ✅ same file re-upload
                  }}
                />
                {docPreviews.nidBack ? (
                  <div className="upload-preview-container">
                    <img src={docPreviews.nidBack} alt="NID Back Preview" className="upload-preview" />
                    <button
                      type="button"
                      className="upload-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDocFile('nidBack');
                      }}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ) : (
                  <div className="upload-default">
                    <div className="upload-icon">🔄</div>
                    <div className="upload-label">Back Image</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Birth Certificate</label>
            <div
              className={`upload-area ${docPreviews.birthCert ? 'has-file' : ''}`}
              id="birthArea"
              onClick={() => {
                if (!docPreviews.birthCert) {
                  birthCertRef.current?.click();
                }
              }}
            >
              <input
                type="file"
                id="birthCert"
                ref={birthCertRef}
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleDocFileChange(e, 'birthCert');
                  e.target.value = ''; // ✅ same file re-upload
                }}
              />
              {docPreviews.birthCert ? (
                <div className="upload-preview-container">
                  {selectedDocs.birthCert?.type === 'application/pdf' ? (
                    <div className="pdf-preview" onClick={() => handlePdfPreview(selectedDocs.birthCert)}>
                      <i className="fa-solid fa-file-pdf"></i>
                      <span>{selectedDocs.birthCert.name}</span>
                      <button className="pdf-view-btn">👁️ View</button>
                    </div>
                  ) : (
                    <img src={docPreviews.birthCert} alt="Birth Cert Preview" className="upload-preview" />
                  )}
                  <button
                    type="button"
                    className="upload-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveDocFile('birthCert');
                    }}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              ) : (
                <div className="upload-default">
                  <div className="upload-icon">📄</div>
                  <div className="upload-label">Certificate Image or PDF</div>
                </div>
              )}
            </div>
          </div>

          {uploadingDocs && (
            <div className="upload-progress">
              <div className="progress-text">Uploading... {Math.round(uploadProgress)}%</div>
              <div className="progress-bar-small">
                <div className="progress-fill-small" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          )}

          <button className="save-btn" onClick={uploadDocuments} disabled={uploadingDocs}>
            {uploadingDocs ? '⏳ Uploading...' : '📤 Upload Documents'}
          </button>
        </>
      )}
    </div>
  );

  // ============================================================
  // ✅ ফেস ভেরিফিকেশন ট্যাব রেন্ডার
  // FIX: `docStatus.faceVerified` এর পাশাপাশি `!isFaceRejected` চেক
  // করা হচ্ছে। faceStatus === 'rejected' হলে success বক্সের বদলে
  // ক্যামেরা UI (video/canvas সহ) রেন্ডার হবে, তাই "Capture Again"
  // চাপলে videoRef.current আর null হবে না এবং সরাসরি startCamera()
  // কল করলেই ক্যামেরা চালু হবে।
  // ============================================================
  const renderFaceVerificationTab = () => (
    <div className="tab-panel face-panel">
      <h3><i className="fa-solid fa-camera"></i> Face Verification</h3>
      <p className="tab-subtitle">Follow the instructions below</p>

      {/* ── Face Rejected Status ── */}
      {isFaceRejected && (
        <div className="verify-error">
          <strong>❌ Face Verification Rejected</strong>
          <p>{userData.faceRejectReason || 'No reason provided'}</p>
          <button 
            className="upload-again-btn"
            onClick={startCamera}
            disabled={!!camStream}
          >
            📸 Capture Again
          </button>
        </div>
      )}

      {docStatus.faceVerified && !isFaceRejected ? (
        <div className="info-box success">
          <span className="info-icon">✅</span>
          <div>
            <strong>Face verification completed!</strong>
            <p>Your face verification has been completed successfully.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="liveness-instructions">
            {livenessState.map((step, index) => (
              <div
                key={step.id}
                className={`instruction-step ${step.done ? 'done' : ''} ${index === currentLivenessStep && camStream ? 'active' : ''}`}
              >
                <div className="inst-text">{step.label}</div>
                <div className="inst-status">
                  {step.done ? '✅' : index === currentLivenessStep && camStream ? '⏳' : '⬜'}
                </div>
              </div>
            ))}
          </div>

          <div
            className={`camera-box ${camStream ? 'camera-active' : ''}`}
            ref={cameraBoxRef}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ display: camStream ? 'block' : 'none', width: '100%' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {!camStream && (
              <div className="camera-placeholder">
                <span>📷</span>
                <div>Turn on Camera</div>
              </div>
            )}
          </div>

          <div className="liveness-progress">
            <div className="progress-text" id="livenessProgressText">0/{livenessState.length} Completed</div>
            <div className="progress-bar-small">
              <div className="progress-fill-small" id="livenessProgressFill" style={{ width: '0%' }}></div>
            </div>
          </div>

          <div className="btn-row">
            <button
              className="btn btn-ghost"
              ref={camStartBtnRef}
              onClick={startCamera}
              disabled={!!camStream}
            >
              📷 Turn on Camera
            </button>
            <button
              className="btn btn-primary"
              ref={captureBtnRef}
              onClick={capturePhoto}
              style={{ display: 'none' }}
              disabled={!livenessComplete}
            >
              📸 Take Photo
            </button>
            <button
              className="btn btn-danger"
              ref={camStopBtnRef}
              onClick={stopCamera}
              style={{ display: 'none' }}
            >
              ⏹ Stop
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ============================================================
  // ✅ লোডিং চেক
  // ============================================================
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: 'var(--bg-primary, #090d16)', 
        color: 'var(--accent-primary, #14b8a6)' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{ 
            fontSize: '48px', 
            animation: 'spin 2s linear infinite',
            display: 'block',
            marginBottom: '16px'
          }} />
          <h2>Loading Profile...</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your profile...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className="profile-page">
      {/* ===== প্রোফাইল হেডার ===== */}
      <div className="profile-header-wrapper">
        <div className="profile-avatar-wrapper">
          <img src={profileData.profilePic} alt="Profile" className="profile-avatar" />
          <label htmlFor="avatar-upload" className="avatar-upload-btn">
            <i className="fa-solid fa-camera"></i>
          </label>
          <input type="file" id="avatar-upload" hidden accept="image/*" onChange={handleProfilePicUpload} />
        </div>

        <div className="progress-section" style={{ padding: '0 20px' }}>
          <ProfileProgress />
        </div>

        <div className="profile-info-wrapper">
          <div className="profile-name-section">
            <h1>{profileData.name}</h1>
            <button className="copy-link-btn" onClick={handleCopyLink}>
              <i className="fa-solid fa-copy"></i>
              {copySuccess ? 'Copied!' : 'Copy Link'}
            </button>
          </div>

          <p className="profile-headline">{profileData.headline}</p>
          <p className="profile-email">
            <i className="fa-solid fa-envelope"></i> {user?.email}
          </p>

          <div className="profile-stats-row">
            <div className="stat-item">
              <span className="stat-number">{userData?.followersCount || 0}</span>
              <span className="stat-label">
                <i className="fa-solid fa-user-plus"></i> Followers
              </span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-number">{userData?.followingCount || 0}</span>
              <span className="stat-label">
                <i className="fa-solid fa-user-check"></i> Following
              </span>
            </div>
          </div>

          <div className="profile-unique-ids">
            <div className="unique-id-item">
              <span className="id-label">🆔 User ID</span>
              <span className="id-value">{userData?.uniqueId || 'Loading...'}</span>
              <button
                className="copy-id-btn"
                onClick={() => {
                  navigator.clipboard.writeText(userData?.uniqueId || '');
                  feedback.alert.success({ message: '📋 User ID copied!' });
                }}
                title="Copy"
              >
                <i className="fa-solid fa-copy"></i>
              </button>
            </div>

            <div className="unique-id-item">
              <span className="id-label">💳 Wallet ID</span>
              <span className="id-value">{userData?.walletId || 'Loading...'}</span>
              <button
                className="copy-id-btn"
                onClick={() => {
                  navigator.clipboard.writeText(userData?.walletId || '');
                  feedback.alert.success({ message: '📋 Wallet ID copied!' });
                }}
                title="Copy"
              >
                <i className="fa-solid fa-copy"></i>
              </button>
            </div>

            <div className="unique-id-item">
              <span className="id-label">🔗 Referral Code</span>
              <span className="id-value">{userData?.referralCode || 'Loading...'}</span>
              <button
                className="copy-id-btn"
                onClick={() => {
                  navigator.clipboard.writeText(userData?.referralCode || '');
                  feedback.alert.success({ message: '📋 Referral Code copied!' });
                }}
                title="Copy"
              >
                <i className="fa-solid fa-copy"></i>
              </button>
            </div>
          </div>

          <button className="edit-profile-btn" onClick={() => setIsEditing(true)}>
            <i className="fa-solid fa-pen"></i> Edit Profile
          </button>
        </div>
      </div>

      {/* ===== Edit Profile Modal ===== */}
      {isEditing && (
        <div className="modal-overlay" onClick={() => setIsEditing(false)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3><i className="fa-solid fa-user-pen"></i> Edit Profile</h3>
            <div className="edit-form">
              <div className="form-group">
                <label>Full Name <span className="required-star">*</span></label>
                <input
                  type="text"
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  placeholder="Enter your full name"
                  maxLength="100"
                  className="edit-input"
                />
                <small className="char-count">
                  {profileData.name?.length || 0}/100
                </small>
              </div>

              <div className="form-group">
                <label>Headline</label>
                <input
                  type="text"
                  value={profileData.headline}
                  onChange={(e) => setProfileData({ ...profileData, headline: e.target.value })}
                  placeholder="e.g. Full-Stack Developer | UI/UX Designer"
                  maxLength="150"
                  className="edit-input"
                />
                <small className="char-count">
                  {profileData.headline?.length || 0}/150
                </small>
              </div>

              <div className="form-group">
                <label>About Me</label>
                <textarea
                  value={profileData.about}
                  onChange={(e) => setProfileData({ ...profileData, about: e.target.value })}
                  placeholder="Tell people about yourself..."
                  rows="4"
                  maxLength="500"
                  className="edit-textarea"
                />
                <small className="char-count">
                  {profileData.about?.length || 0}/500
                </small>
              </div>

              <div className="form-group">
                <label>Skills <span className="hint-text">(comma separated)</span></label>
                <input
                  type="text"
                  value={profileData.skills}
                  onChange={(e) => setProfileData({ ...profileData, skills: e.target.value })}
                  placeholder="React, Firebase, Tailwind CSS, Node.js"
                  maxLength="200"
                  className="edit-input"
                />
                <small className="char-count">
                  {profileData.skills?.length || 0}/200
                </small>
              </div>

              <div className="edit-actions">
                <button className="cancel-btn" onClick={() => setIsEditing(false)}>
                  <i className="fa-solid fa-times"></i> Cancel
                </button>
                <button className="save-btn" onClick={handleSaveProfile}>
                  <i className="fa-solid fa-check"></i> Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

{editingPost && (
  <div className="modal-overlay" onClick={() => setEditingPost(null)}>
    <div className="edit-modal edit-post-modal" onClick={(e) => e.stopPropagation()}>
      {/* ── Modal Header ── */}
      <div className="edit-modal-header">
        <h3>
          <i className="fa-solid fa-pen-to-square" style={{ color: '#fbbf24' }}></i>
          Edit Post
        </h3>
        <button className="modal-close-btn" onClick={() => setEditingPost(null)}>
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div className="edit-form">
        {/* ── Title ── */}
        <div className="pb-group">
          <label>Post Title <span className="required-star">*</span></label>
          <input
            type="text"
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            placeholder="Enter post title..."
            className="edit-input"
            maxLength="100"
          />
          <small className="char-count">{editForm.title?.length || 0}/100</small>
        </div>

        {/* ── Description ── */}
        <div className="pb-group">
          <label>Description <span className="required-star">*</span></label>
          <textarea
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            placeholder="Describe your post in detail..."
            rows="4"
            className="edit-textarea"
            maxLength="2000"
          />
          <small className="char-count">{editForm.description?.length || 0}/2000</small>
        </div>

        {/* ── ✅ Budget & Deadline (NEW READONLY VERSION) ── */}
        <div className="pb-row-twin">
          {/* Budget - Readonly for now */}
          <div className="pb-group">
            <label>Budget / Price <span className="required-star">*</span></label>
            <div className="input-with-icon">
              <span className="input-icon">৳</span>
              <input
                type="text"
                value={typeof editForm.budget === 'object' ? formatBudget({ budget: editForm.budget }) : editForm.budget}
                readOnly
                className="edit-input with-icon readonly"
                style={{ background: 'var(--bg-tertiary)', cursor: 'not-allowed', opacity: 0.7 }}
              />
              <span className="input-hint">🔒 Edit coming soon</span>
            </div>
          </div>

          {/* Deadline - Readonly for now */}
          <div className="pb-group">
            <label>Deadline / Delivery Days <span className="required-star">*</span></label>
            <div className="input-with-icon">
              <input
                type="text"
                value={typeof editForm.deadline === 'object' ? formatDeadline({ deadline: editForm.deadline }) : editForm.deadline}
                readOnly
                className="edit-input with-icon readonly"
                style={{ background: 'var(--bg-tertiary)', cursor: 'not-allowed', opacity: 0.7 }}
              />
              <span className="input-icon-right">🔒</span>
              <span className="input-hint">Edit coming soon</span>
            </div>
          </div>
        </div>

        {/* ── Images ── */}
        {editingPost?.images?.length > 0 && (
          <div className="pb-group">
            <label>Images ({editImagePreviews.length}/2)</label>
            {/* ... image upload code ... */}
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div className="edit-actions">
          <button className="cancel-btn" onClick={() => setEditingPost(null)}>
            <i className="fa-solid fa-times"></i> Cancel
          </button>
          <button
            className="save-btn"
            onClick={handleUpdatePost}
            disabled={editImageLoading || !editForm.title.trim() || !editForm.description.trim()}
          >
            {editImageLoading ? (
              <><i className="fa-solid fa-spinner fa-spin"></i> Updating...</>
            ) : (
              <><i className="fa-solid fa-check"></i> Update Post</>
            )}
          </button>
        </div>
      </div>
    </div>
  </div>
)}
      {/* ===== Mode Switcher ===== */}
      <div className="profile-mode-switcher">
        <button
          className={`profile-mode-btn ${currentMode === 'buyer' ? 'active' : ''}`}
          onClick={() => handleModeChange('buyer')}
        >
          <i className="fa-solid fa-briefcase"></i> Buyer Mode
        </button>
        <button
          className={`profile-mode-btn ${currentMode === 'seller' ? 'active' : ''}`}
          onClick={() => handleModeChange('seller')}
        >
          <i className="fa-solid fa-laptop-code"></i> Seller Mode
        </button>
      </div>

      {/* ===== Tabs ===== */}
      <div className="profile-tabs-wrapper">
        <div className="profile-tabs">
          <button
            className={`tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            <i className="fa-solid fa-file-alt"></i> My {currentMode === 'buyer' ? 'Jobs' : 'Services'}
          </button>

          <button
            className={`tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => setActiveTab('saved')}
          >
            <i className="fa-solid fa-bookmark"></i> Saved
            {savedPostIds.length > 0 && (
              <span className="saved-count-badge">{savedPostIds.length}</span>
            )}
          </button>

          <button
            className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            <i className="fa-solid fa-star"></i> Reviews
            {userRating.total > 0 && (
              <span className="tab-badge">{userRating.average}★</span>
            )}
          </button>

          <button
            className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <i className="fa-solid fa-file"></i> Documents
            {!docStatus.documentsUploaded && (
              <span className="tab-badge warning">!</span>
            )}
          </button>

          <button
            className={`tab-btn ${activeTab === 'face' ? 'active' : ''}`}
            onClick={() => setActiveTab('face')}
          >
            <i className="fa-solid fa-camera"></i> Face
            {!docStatus.faceVerified && (
              <span className="tab-badge warning">!</span>
            )}
          </button>

          <button
            className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            <i className="fa-solid fa-user"></i> About
          </button>

          <button
            className={`tab-btn ${activeTab === 'skills' ? 'active' : ''}`}
            onClick={() => setActiveTab('skills')}
          >
            <i className="fa-solid fa-code"></i> Skills
          </button>
        </div>
      </div>

      {/* ===== ট্যাব কন্টেন্ট ===== */}
      <div className="profile-content">
        {/* পোস্ট ট্যাব */}
        {activeTab === 'posts' && (
          <div className="user-posts-section">
            <div className="section-header-with-count">
              <h3>
                <i className="fa-solid fa-file-alt"></i>
                My {currentMode === 'buyer' ? 'Jobs' : 'Services'} ({filteredPosts.length})
              </h3>
              <div className="status-counts">
                {pendingPostsCount > 0 && (
                  <span className="pending-count-badge">
                    <i className="fa-solid fa-clock"></i> {pendingPostsCount} pending
                  </span>
                )}
                {rejectedPostsCount > 0 && (
                  <span className="rejected-count-badge">
                    <i className="fa-solid fa-xmark-circle"></i> {rejectedPostsCount} rejected
                  </span>
                )}
              </div>
            </div>
            
            {/* ✅ পেন্ডিং পোস্টের জন্য আলাদা সেকশন */}
            {pendingPostsCount > 0 && (
              <div className="pending-posts-section">
                <div className="pending-posts-header">
                  <i className="fa-solid fa-hourglass-half"></i>
                  <span>Your posts are awaiting admin approval</span>
                </div>
                <div className="pending-posts-grid">
                  {userPosts.filter(p => p.status === 'pending').map(post => (
                    <div key={post.id} className="pending-post-mini">
                      <span className="post-title">{post.title}</span>
                      <span className="post-date">{formatDate(post.createdAt)}</span>
                      <button 
                        className="delete-btn-small" 
                        onClick={() => handleDeletePost(post.id)}
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* ✅ রিজেক্টেড পোস্টের জন্য আলাদা সেকশন */}
            {rejectedPostsCount > 0 && (
              <div className="rejected-posts-section">
                <div className="rejected-posts-header">
                  <i className="fa-solid fa-xmark-circle"></i>
                  <span>Your posts were rejected by admin</span>
                </div>
                <div className="rejected-posts-grid">
                  {userPosts.filter(p => p.status === 'rejected').map(post => (
                    <div key={post.id} className="rejected-post-mini">
                      <span className="post-title">{post.title}</span>
                      <span className="post-reason">{post.rejectReason || 'No reason provided'}</span>
                      <button 
                        className="delete-btn-small" 
                        onClick={() => handleDeletePost(post.id)}
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {renderPostGrid(
              filteredPosts,
              postsLoading,
              `No ${currentMode === 'buyer' ? 'jobs' : 'services'} posted yet.`
            )}
          </div>
        )}

        {/* Saved Posts ট্যাব */}
        {activeTab === 'saved' && (
          <div className="user-posts-section">
            <h3>
              <i className="fa-solid fa-bookmark"></i>
              Saved Posts ({savedPosts.length})
            </h3>
            {renderPostGrid(
              savedPosts,
              savedPostsLoading,
              'No saved posts yet. Save posts you like!'
            )}
          </div>
        )}

        {/* Reviews Tab */}
        {activeTab === 'reviews' && (
          <div className="tab-panel reviews-panel">
            <div className="reviews-header">
              <h3>
                <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i>
                Reviews ({reviews.length})
              </h3>
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

            {reviewsLoading ? (
              <div className="loading-reviews">
                <div className="loading-spinner-small"></div>
                <p>Loading reviews...</p>
              </div>
            ) : reviews.length === 0 ? (
              <div className="no-reviews">
                <i className="fa-solid fa-star-half-stroke"></i>
                <p>No reviews yet.</p>
                <button className="btn-review" onClick={() => navigate(`/profile/${user.uid}`)}>
                  <i className="fa-solid fa-star"></i> Share your profile to get reviews
                </button>
              </div>
            ) : (
              <div className="reviews-list">
                {reviews.map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="review-header">
                      <div className="reviewer-info">
                        <img
                          src={review.reviewerPhoto || `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`}
                          alt={review.reviewerName}
                          className="reviewer-avatar"
                          onError={(e) => {
                            e.target.src = `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`;
                          }}
                        />
                        <div>
                          <h4>{review.reviewerName || 'Anonymous'}</h4>
                          <div className="review-stars">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <i key={star} className={`fa-solid fa-star ${star <= review.rating ? 'filled' : ''}`}></i>
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="review-date">
                        {review.createdAt?.toDate?.()?.toLocaleDateString() ||
                          review.createdAt?.split?.('T')?.[0] ||
                          'Recently'}
                      </span>
                    </div>
                    <p className="review-text">{review.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ডকুমেন্ট ট্যাব */}
        {activeTab === 'documents' && renderDocumentsTab()}

        {/* ফেস ভেরিফিকেশন ট্যাব */}
        {activeTab === 'face' && renderFaceVerificationTab()}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div className="about-section">
            <div className="about-card">
              <h3><i className="fa-solid fa-user-pen"></i> About Me</h3>
              <p>{profileData.about}</p>
            </div>
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === 'skills' && (
          <div className="skills-section">
            <div className="skills-card">
              <h3><i className="fa-solid fa-code"></i> Core Skills</h3>
              <div className="skills-chip-container">
                {profileData.skills?.split(',').map((skill, idx) => (
                  <span key={idx} className="skill-chip">{skill.trim()}</span>
                )) || <p>No skills added yet</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;



