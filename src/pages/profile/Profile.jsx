// src/pages/Profile.jsx
//
// 🧩 SPLIT NOTICE: this file used to be ~1500 lines. It has been split into:
//   - src/utils/profileHelpers.js          (uploadToCloudinary, formatBudget,
//                                            formatDeadline, formatDate,
//                                            getImageCacheKey, budget/deadline
//                                            <-> form-state converters)
//   - src/components/profile/ProfileHeader.jsx
//   - src/components/profile/EditProfileModal.jsx
//   - src/components/profile/EditPostModal.jsx   (⚠️ budget/deadline editing
//                                                  FIXED — see below)
//   - src/components/profile/PostGrid.jsx
//   - src/components/profile/DocumentsTab.jsx
//   - src/components/profile/FaceVerificationTab.jsx
//   - src/components/profile/ReviewsTab.jsx
// This file keeps ALL state, effects, and business-logic handlers exactly as
// before — only the JSX rendering moved into the components above. No
// functionality was removed.
//
// ⚠️ FIXED BUG: Budget and Deadline in "Edit Post" used to be readOnly with
// "🔒 Edit coming soon", and handleUpdatePost silently discarded any edits
// by re-using the post's ORIGINAL budget/deadline. EditPostModal now has a
// real Fixed/Range editor for both fields (with validation), and
// handleUpdatePost below uses exactly what the modal returns.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './profile.css';
import { auth, db } from '@/firebase';
import {
  doc,
  getDoc,
  updateDoc,
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
import toast from 'react-hot-toast';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';

import { uploadToCloudinary, formatDate } from './utils/profileHelpers';
import ProfileHeader from './components/ProfileHeader';
import EditProfileModal from './components/EditProfileModal';
import EditPostModal from './components/EditPostModal';
import PostGrid from './components/PostGrid';
import DocumentsTab from './components/DocumentsTab';
import FaceVerificationTab from './components/FaceVerificationTab';
import ReviewsTab from './components/ReviewsTab';

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

  // ========== রিভিউ স্টেট ==========
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [userRating, setUserRating] = useState({ average: 0, total: 0 });

  const editFileInputRef = React.useRef(null);
  const nidFrontRef = React.useRef(null);
  const nidBackRef = React.useRef(null);
  const birthCertRef = React.useRef(null);

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
  const [selectedDocs, setSelectedDocs] = useState({ nidFront: null, nidBack: null, birthCert: null });
  const [docPreviews, setDocPreviews] = useState({ nidFront: '', nidBack: '', birthCert: '' });
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('pending');

  // ========== ✅ ফেস ভেরিফিকেশন স্টেট ==========
  const [camStream, setCamStream] = useState(null);
  const [livenessComplete, setLivenessComplete] = useState(false);
  const [currentLivenessStep, setCurrentLivenessStep] = useState(0);
  const [faceVerified, setFaceVerified] = useState(false);

  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const cameraBoxRef = React.useRef(null);
  const camStartBtnRef = React.useRef(null);
  const captureBtnRef = React.useRef(null);
  const camStopBtnRef = React.useRef(null);
  const livenessIntervalRef = React.useRef(null);
  const streamRef = React.useRef(null);

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

      if (selectedDocs.nidFront) {
        const url = await uploadToCloudinary(selectedDocs.nidFront);
        uploadedDocs.nidFront = { url, status: 'pending', rejectReason: '' };
        progress += 33;
        setUploadProgress(progress);
      }

      if (selectedDocs.nidBack) {
        const url = await uploadToCloudinary(selectedDocs.nidBack);
        uploadedDocs.nidBack = { url, status: 'pending', rejectReason: '' };
        progress += 33;
        setUploadProgress(progress);
      }

      if (selectedDocs.birthCert) {
        const url = await uploadToCloudinary(selectedDocs.birthCert);
        uploadedDocs.birthCert = { url, status: 'pending', rejectReason: '' };
        progress += 34;
        setUploadProgress(progress);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        documents: uploadedDocs,
        documentVerified: false,
        verificationStatus: 'pending',
        isVerified: false,
        needsReview: true,
        documentSubmittedAt: serverTimestamp()
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livenessComplete, livenessState.length, updateLivenessUI]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, resetLiveness, startLivenessDetection]);

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

      await updateDoc(doc(db, 'users', user.uid), {
        facePhotoUrl: url,
        faceStatus: 'pending',
        faceRejectReason: '',
        faceVerified: false,
        verificationStatus: 'pending',
        isVerified: false,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const hasRejectedDoc = useMemo(() => {
    return (
      userData?.documents?.nidFront?.status === 'rejected' ||
      userData?.documents?.nidBack?.status === 'rejected' ||
      userData?.documents?.birthCert?.status === 'rejected'
    );
  }, [userData]);

  const isFaceRejected = userData?.faceStatus === 'rejected';

  // ============================================================
  // ✅ পোস্ট সেভ/আনসেভ টগল
  // ============================================================
  const toggleSavePost = async (postId) => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const isCurrentlySaved = savedPostIds.includes(postId);

    try {
      if (isCurrentlySaved) {
        await updateDoc(userRef, { savedPosts: arrayRemove(postId) });
        setSavedPostIds(prev => prev.filter(id => id !== postId));
        setSavedPosts(prev => prev.filter(p => p.id !== postId));
      } else {
        await updateDoc(userRef, { savedPosts: arrayUnion(postId) });
        setSavedPostIds(prev => [...prev, postId]);
      }
    } catch (error) {
      console.error("Error toggling save:", error);
    }
  };

  // ============================================================
  // ✅ পোস্ট এডিট ফাংশন (with Active Deal Check)
  // ============================================================
  const handleEditPost = (post) => {
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
  };

  // ============================================================
  // ✅ পোস্ট আপডেট — এখন EditPostModal থেকে সরাসরি এডিটেড
  // budget/deadline নিয়ে আসে (আগের মতো original ভ্যালু জোর করে না)
  // ============================================================
  const handleUpdatePost = async ({ title, description, images, budget, deadline }) => {
    if (!editingPost) return;

    try {
      const postRef = doc(db, 'posts', editingPost.id);
      const postSnap = await getDoc(postRef);

      if (!postSnap.exists()) {
        feedback.alert.error({ message: 'This post no longer exists.' });
        setEditingPost(null);
        return;
      }

      const postData = postSnap.data();

      if (postData.editStatus === 'pending') {
        feedback.alert.warning({
          message: 'This post already has a pending edit. Please wait for admin approval.'
        });
        setEditingPost(null);
        return;
      }

      const pendingChanges = {
        title,
        description,
        budget,
        deadline,
        images,
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

    } catch (error) {
      console.error("❌ Update error:", error);
      feedback.alert.error({ message: 'Failed to update post: ' + error.message });
      throw error; // let EditPostModal know saving failed (keeps modal open)
    }
  };

  const handlePdfPreview = (file) => {
    if (file) {
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    }
  };

  // ============================================================
  // ✅ পোস্ট ডিলিট (Active Deal Check সহ)
  // ============================================================
  const handleDeletePost = async (postId) => {
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
      <ProfileHeader
        profileData={profileData}
        user={user}
        userData={userData}
        copySuccess={copySuccess}
        onProfilePicUpload={handleProfilePicUpload}
        onCopyLink={handleCopyLink}
        onEditClick={() => setIsEditing(true)}
        feedback={feedback}
      />

      {isEditing && (
        <EditProfileModal
          profileData={profileData}
          setProfileData={setProfileData}
          onSave={handleSaveProfile}
          onClose={() => setIsEditing(false)}
        />
      )}

      {editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={handleUpdatePost}
          feedback={feedback}
        />
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

            <PostGrid
              posts={filteredPosts}
              isLoading={postsLoading}
              emptyMessage={`No ${currentMode === 'buyer' ? 'jobs' : 'services'} posted yet.`}
              activeTab="posts"
              currentMode={currentMode}
              activeDealPosts={activeDealPosts}
              onEdit={handleEditPost}
              onDelete={handleDeletePost}
              onCreateClick={() => navigate('/')}
            />
          </div>
        )}

        {/* Saved Posts ট্যাব */}
        {activeTab === 'saved' && (
          <div className="user-posts-section">
            <h3>
              <i className="fa-solid fa-bookmark"></i>
              Saved Posts ({savedPosts.length})
            </h3>
            <PostGrid
              posts={savedPosts}
              isLoading={savedPostsLoading}
              emptyMessage="No saved posts yet. Save posts you like!"
              activeTab="saved"
              currentMode={currentMode}
              activeDealPosts={activeDealPosts}
              onUnsave={toggleSavePost}
            />
          </div>
        )}

        {/* Reviews Tab */}
        {activeTab === 'reviews' && (
          <ReviewsTab
            reviews={reviews}
            reviewsLoading={reviewsLoading}
            userRating={userRating}
            user={user}
          />
        )}

        {/* ডকুমেন্ট ট্যাব */}
        {activeTab === 'documents' && (
          <DocumentsTab
            docStatus={docStatus}
            hasRejectedDoc={hasRejectedDoc}
            userData={userData}
            verificationStatus={verificationStatus}
            isVerified={isVerified}
            selectedDocs={selectedDocs}
            docPreviews={docPreviews}
            uploadingDocs={uploadingDocs}
            uploadProgress={uploadProgress}
            nidFrontRef={nidFrontRef}
            nidBackRef={nidBackRef}
            birthCertRef={birthCertRef}
            onDocFileChange={handleDocFileChange}
            onRemoveDocFile={handleRemoveDocFile}
            onUploadDocuments={uploadDocuments}
            onUploadAgain={handleUploadAgain}
            onPdfPreview={handlePdfPreview}
          />
        )}

        {/* ফেস ভেরিফিকেশন ট্যাব */}
        {activeTab === 'face' && (
          <FaceVerificationTab
            docStatus={docStatus}
            isFaceRejected={isFaceRejected}
            userData={userData}
            livenessState={livenessState}
            currentLivenessStep={currentLivenessStep}
            camStream={camStream}
            livenessComplete={livenessComplete}
            videoRef={videoRef}
            canvasRef={canvasRef}
            cameraBoxRef={cameraBoxRef}
            camStartBtnRef={camStartBtnRef}
            captureBtnRef={captureBtnRef}
            camStopBtnRef={camStopBtnRef}
            startCamera={startCamera}
            stopCamera={stopCamera}
            capturePhoto={capturePhoto}
          />
        )}

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