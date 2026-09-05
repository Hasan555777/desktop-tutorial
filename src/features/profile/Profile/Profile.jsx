//src\features\profile\Profile\Profile.jsx
//
// 🆕 FIX APPLIED (this revision):
// - handleProfilePicUpload() and uploadDocuments() updated for
//   profileHelpers.js's uploadToCloudinary() new contract: it now
//   takes a `folder` argument and returns { url, publicId } (throws
//   on failure) instead of a bare URL string — matching Register's
//   version exactly, and fixing the return-shape mismatch that broke
//   face-photo capture via useProfileFaceVerification.js.
// - uploadDocuments() now collects an identity number (NID / birth
//   registration) and runs the same duplicate-identity check Register
//   does, via the shared runIdentityDuplicateCheck() in
//   utils/identityUtils.js. Previously a user who skipped verification
//   during registration and uploaded documents here for the first
//   time completely bypassed duplicate-account detection.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePageLoadingBar } from '../../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate, useLocation, Link } from 'react-router-dom';

import { auth, db } from '../../../shared/firebase/index';
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
import { useAuth } from '../../../shared/context/AuthContext';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';

import { uploadToCloudinary, formatDate } from './utils/profileHelpers';
// 🆕 shared identity-duplicate-check (also used by useRegisterFlow.js)
import { runIdentityDuplicateCheck } from '../utils/identityUtils';
import ProfileHeader from './components/ProfileHeader';
import EditProfileModal from './components/EditProfileModal';
import EditPostModal from './components/EditPostModal';
import PostGrid from './components/PostGrid';
import DocumentsTab from './components/DocumentsTab';
import FaceVerificationTab from './components/FaceVerificationTab';
import ReviewsTab from './components/ReviewsTab';
import { useProfileFaceVerification } from './hooks/useProfileFaceVerification';
import { PageHeader } from '../../navigation/Navigation';
import styles from './Profile.module.css';


function Profile() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const { userData, reloadUserData } = useAuth();
  const feedback = useFeedback();
  const [refreshing, setRefreshing] = useState(false);

  // ========== ✅ ফেস ভেরিফিকেশন হুক (প্রথমে ইনস্ট্যান্স) ==========
  const faceVerification = useProfileFaceVerification(user, {
    onUploaded: async () => {
      await reloadUserData();
      feedback.alert.success({ title: '✅ Face photo uploaded! Admin will verify.' });
    }
  });

  // ========== স্টেট ==========
  const [activeDealPosts, setActiveDealPosts] = useState({});
  const [checkingDeals, setCheckingDeals] = useState(false);
  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading); // 🔧 ADD (#25 loading consistency)
  const [isEditing, setIsEditing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  // 🔧 FIX (routing upgrade): activeTab now comes from the URL
  // (/profile/:tab) instead of local state — real back/forward,
  // refresh, and direct/deep links to a specific tab all work
  // correctly now. App.jsx's route changed from "/profile" to
  // "/profile/*" to allow this. setActiveTab is kept as a thin
  // wrapper around navigate() so every existing call site
  // (including the one outside the tab buttons, at the doc-upload
  // success handler) keeps working unchanged.
  const location = useLocation();
  const profilePathSegments = location.pathname.split('/').filter(Boolean);
  const activeTab = profilePathSegments.length > 1 ? profilePathSegments[profilePathSegments.length - 1] : null;
  const setActiveTab = useCallback((tab) => navigate(`/profile/${tab}`), [navigate]);
  // 🔧 FIX (drill-in navigation): without this, switching tabs is just
  // a client-side re-render — the browser keeps whatever scroll
  // position the previous tab was left at, so the new tab's content
  // can end up rendering off-screen "below" instead of appearing like
  // a fresh page. A real page load always starts at the top, so we
  // replicate that here.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);
  // 🔧 FIX (routing upgrade): unknown /profile/<tab> sub-path (e.g. a
  // stale/typo'd link) previously matched none of the activeTab==='x'
  // blocks below and silently rendered a blank tab panel. Mirrors the
  // same "unknown sub-path -> default tab" fallback Settings/index.jsx
  // already has for /settings/*. Bare /profile (activeTab === null) is
  // its own valid "menu" state now, so it's excluded from this check.
  const VALID_PROFILE_TABS = ['posts', 'saved', 'reviews', 'documents', 'face', 'about', 'skills'];
  useEffect(() => {
    if (activeTab && !VALID_PROFILE_TABS.includes(activeTab)) {
      navigate('/profile/posts', { replace: true });
    }
  }, [activeTab, navigate]);
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

  // 🆕 NID/জন্ম নিবন্ধন নম্বর — ডকুমেন্ট (রি-)আপলোডের সময় ডুপ্লিকেট-চেকের জন্য
  const [identityNumber, setIdentityNumber] = useState('');
  const [identityNumberError, setIdentityNumberError] = useState('');

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
  const [faceVerified, setFaceVerified] = useState(false);

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
  // ✅ পোস্ট লোড ফাংশন (সব useEffect এর আগে ডিফাইন করুন)
  // ============================================================
  const loadPosts = useCallback(async () => {
    if (!user?.uid) return;

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
  }, [user?.uid]);

  // ============================================================
  // ✅ পোস্ট লক/আনলক টগল ফাংশন
  // ============================================================
  const handleToggleLock = useCallback(async (postId, newState) => {
    if (!user) return;

    try {
      const postRef = doc(db, 'posts', postId);
      const field = currentMode === 'seller' ? 'postStatus.isBusy' : 'postStatus.isDealActive';
      
      await updateDoc(postRef, {
        [field]: newState,
        'postStatus.updatedAt': serverTimestamp(),
        'postStatus.updatedBy': user.uid
      });

      feedback.alert.success({
        title: currentMode === 'seller'
          ? `✅ Post ${newState ? 'is now BUSY' : 'is now AVAILABLE'}`
          : `✅ Deal ${newState ? 'is now ACTIVE' : 'is now CLOSED'}`
      });

      await loadPosts();
      
    } catch (error) {
      console.error('Error toggling lock:', error);
      feedback.alert.error({ title: 'Failed to update post status' });
    }
  }, [user, currentMode, loadPosts]);

  // ============================================================
  // ✅ ট্যাব পরিবর্তন হলে বা ক্যামেরা সক্রিয় থাকলে বন্ধ করার useEffect
  // ============================================================
  const { camStream, stopCamera } = faceVerification;

  useEffect(() => {
    if (activeTab !== 'face' && camStream) {
      stopCamera();
    }
  }, [activeTab, camStream, stopCamera]);

  // ============================================================
  // ✅ ইউজারের নিজের পোস্ট লোড করা (useEffect)
  // ============================================================
  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

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
      navigate('/login', { replace: true });
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
  // 🔧 FIX: uploadToCloudinary এখন { url, publicId } রিটার্ন করে এবং
  // ব্যর্থ হলে throw করে (Register-এর ভার্সনের সাথে মিল রেখে)।
  // ============================================================
  const handleProfilePicUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const result = await uploadToCloudinary(file, 'profile_photos');
      const imageUrl = result.url;

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
    } catch (error) {
      console.error("Error:", error);
      feedback.alert.error({ message: error.message || 'Profile picture upload failed!' });
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
  // 🔧 FIX:
  // - এখন identityNumber বাধ্যতামূলক (Register-এর স্টেপ ৪-এর সাথে মিল)।
  // - uploadToCloudinary কে সঠিক folder ('nid_documents'/'birth_documents')
  //   দিয়ে কল করা হচ্ছে এবং { url, publicId } — দুটোই সেভ করা হচ্ছে।
  // - সফল আপলোডের পর runIdentityDuplicateCheck() কল হচ্ছে — Register-এর
  //   মতোই ডুপ্লিকেট-অ্যাকাউন্ট শনাক্ত হলে needsReview + admin_notification।
  // ============================================================
  // 🔧 FIX (#7 — profile re-upload also not reaching Identity DB): this
  // uploaded nidFront → nidBack → birthCert sequentially and threw on the
  // FIRST failure. If e.g. nidFront succeeded but nidBack then failed
  // (a network blip), the whole function jumped straight to `catch` —
  // and the Firestore `updateDoc()` below (which is what actually saves
  // anything, and is also what runIdentityDuplicateCheck() depends on
  // running afterward) never executed. Result: nidFront's file sat
  // orphaned in Cloudinary, storage, nothing reached Firestore, nothing
  // reached admin, nothing reached Identity DB — exactly the reported
  // symptom. Now every selected file is attempted regardless of the
  // others, and whatever succeeds is still saved.
  const uploadDocuments = async () => {
    if (!selectedDocs.nidFront && !selectedDocs.nidBack && !selectedDocs.birthCert) {
      feedback.alert.warning({ message: 'Please select at least one document!' });
      return;
    }

    // 🆕 identity number ভ্যালিডেশন
    const idNum = identityNumber.trim();
    if (!idNum) {
      setIdentityNumberError('দয়া করে আইডি নম্বর দিন');
      feedback.alert.warning({ message: 'দয়া করে NID বা জন্ম নিবন্ধন নম্বর দিন!' });
      return;
    }
    if (idNum.length < 6) {
      setIdentityNumberError('নম্বরটি সঠিক মনে হচ্ছে না');
      feedback.alert.warning({ message: 'সঠিক আইডি নম্বর দিন!' });
      return;
    }
    setIdentityNumberError('');

    setUploadingDocs(true);
    setUploadProgress(0);

    try {
      const tasks = [];
      if (selectedDocs.nidFront) tasks.push({ key: 'nidFront', file: selectedDocs.nidFront, folder: 'nid_documents' });
      if (selectedDocs.nidBack) tasks.push({ key: 'nidBack', file: selectedDocs.nidBack, folder: 'nid_documents' });
      if (selectedDocs.birthCert) tasks.push({ key: 'birthCert', file: selectedDocs.birthCert, folder: 'birth_documents' });

      const settled = await Promise.allSettled(
        tasks.map(t => uploadToCloudinary(t.file, t.folder).then(result => ({ t, result })))
      );

      const uploadedDocs = {};
      const failedKeys = [];
      let progressStep = Math.round(100 / tasks.length);
      let progress = 0;

      settled.forEach((outcome, i) => {
        const { key } = tasks[i];
        if (outcome.status === 'fulfilled') {
          const { result } = outcome.value;
          uploadedDocs[key] = { url: result.url, publicId: result.publicId, status: 'pending', rejectReason: '' };
        } else {
          console.error(`❌ ${key} upload failed:`, outcome.reason);
          failedKeys.push(key);
        }
        progress += progressStep;
        setUploadProgress(Math.min(progress, 100));
      });

      // 🔧 FIX: save whatever succeeded — this used to be unreachable
      // whenever any single file failed.
      if (Object.keys(uploadedDocs).length > 0) {
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

        // 🆕 Register-এর মতোই: ID নম্বর দিয়ে ডুপ্লিকেট-অ্যাকাউন্ট চেক —
        // এখন এটা চলবে যদি অন্তত একটা ফাইল সফল হয়, সব কটা না হলেও।
        const identityType = (uploadedDocs.nidFront || uploadedDocs.nidBack) ? 'nid' : 'birth_certificate';
        runIdentityDuplicateCheck({
          userId: user.uid,
          uniqueId: userData?.uniqueId,
          fullName: profileData.name,
          phone: userData?.phone || '',
          email: user?.email || '',
          identityNumber: idNum,
          identityType,
          documentFrontUrl: uploadedDocs.nidFront?.url || uploadedDocs.birthCert?.url || '',
          documentBackUrl: uploadedDocs.nidBack?.url || '',
        }).catch(err => console.error('Identity duplicate-check failed (non-blocking):', err));

        setIdentityNumber('');
      }

      if (failedKeys.length === 0) {
        feedback.alert.success({ message: 'Document re-uploaded! Admin is verifying...' });
      } else if (Object.keys(uploadedDocs).length > 0) {
        feedback.alert.warning({ message: `${failedKeys.join(', ')} আপলোড ব্যর্থ হয়েছে, বাকিগুলো জমা হয়েছে — ব্যর্থ হওয়া ফাইলগুলো আবার চেষ্টা করুন।` });
      } else {
        feedback.alert.error({ message: 'সব ডকুমেন্ট আপলোড ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
      }

      checkCompletion();

    } catch (error) {
      console.error('Document upload error:', error);
      feedback.alert.error({ message: error.message || 'Document upload failed' });
    } finally {
      setUploadingDocs(false);
    }
  };

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
  // ✅ পোস্ট এডিট ফাংশন
  // ============================================================
  const handleEditPost = (post) => {
    const postDealStatus = activeDealPosts[post.id];

    if (postDealStatus?.hasActiveDeal) {
      const dealCount = postDealStatus.dealCount || 1;
      feedback.alert.error({
        message: `⛔ এই পোস্টটি এডিট করা যাচ্ছে না!`,
        description: `এই পোস্টের সাথে ${dealCount} টি Active Deal রয়েছে।`
      });
      return;
    }

    setEditingPost(post);
  };

  // ============================================================
  // ✅ পোস্ট আপডেট
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
          message: 'This post already has a pending edit.'
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
          message: '✅ Edit submitted for admin approval!'
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
      throw error;
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
  const handleDeletePost = async (postId) => {
    const postDealStatus = activeDealPosts[postId];

    if (postDealStatus?.hasActiveDeal) {
      const dealCount = postDealStatus.dealCount || 1;
      feedback.alert.error({
        message: `⛔ এই পোস্টটি ডিলিট করা যাচ্ছে না!`,
        description: `এই পোস্টের সাথে ${dealCount} টি Active Deal রয়েছে।`
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
    const portfolioLink = `https://WorkTrustbd.com/profile/user/${user?.uid}`;
    navigator.clipboard.writeText(portfolioLink);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await reloadUserData();
      if (data) {
        feedback.alert.success({ title: '✅ Profile refreshed successfully!' });
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
        feedback.alert.error({ title: '❌ Data not found' });
      }
    } catch (error) {
      console.error("Refresh error:", error);
      feedback.alert.error({ title: '❌ Failed to refresh' });
    } finally {
      setRefreshing(false);
    }
  };

  // ============================================================
  // ✅ লোডিং চেক
  // ============================================================
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-cube ${styles.loadingIcon}`} />
          <h2>Loading Profile...</h2>
          <p>
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
    <div className={styles.profilePage}>
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

      {/* 🔧 FIX (drill-in navigation): bare /profile (activeTab === null)
          shows the profile header, mode switcher, and tab menu — no tab
          content underneath. Picking a tab navigates to /profile/<tab>,
          which hides ALL of that and shows ONLY that tab's page (with a
          back button) instead of stacking content underneath this same
          view. */}
      {!activeTab && (
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
      )}

      {!activeTab && (
        <div className={styles.profileTabsWrapper}>
          <div className={styles.profileTabs}>
            <Link to="/profile/posts" className={styles.tabBtn}>
              <i className="fa-solid fa-file-alt"></i> My {currentMode === 'buyer' ? 'Jobs' : 'Services'}
            </Link>

            <Link to="/profile/saved" className={styles.tabBtn}>
              <i className="fa-solid fa-bookmark"></i> Saved
              {savedPostIds.length > 0 && (
                <span className={styles.savedCountBadge}>{savedPostIds.length}</span>
              )}
            </Link>

            <Link to="/profile/reviews" className={styles.tabBtn}>
              <i className="fa-solid fa-star"></i> Reviews
              {userRating.total > 0 && (
                <span className={styles.tabBadge}>{userRating.average}★</span>
              )}
            </Link>

            <Link to="/profile/documents" className={styles.tabBtn}>
              <i className="fa-solid fa-file"></i> Documents
              {!docStatus.documentsUploaded && (
                <span className={`${styles.tabBadge} ${styles.warning}`}>!</span>
              )}
            </Link>

            <Link to="/profile/face" className={styles.tabBtn}>
              <i className="fa-solid fa-camera"></i> Face
              {!docStatus.faceVerified && (
                <span className={`${styles.tabBadge} ${styles.warning}`}>!</span>
              )}
            </Link>

            <Link to="/profile/about" className={styles.tabBtn}>
              <i className="fa-solid fa-user"></i> About
            </Link>

            <Link to="/profile/skills" className={styles.tabBtn}>
              <i className="fa-solid fa-code"></i> Skills
            </Link>
          </div>
        </div>
      )}

      {activeTab && (
        <>
          <PageHeader
            title={
              activeTab === 'posts' ? `My ${currentMode === 'buyer' ? 'Jobs' : 'Services'}` :
              activeTab === 'saved' ? 'Saved' :
              activeTab === 'reviews' ? 'Reviews' :
              activeTab === 'documents' ? 'Documents' :
              activeTab === 'face' ? 'Face Verification' :
              activeTab === 'about' ? 'About' :
              activeTab === 'skills' ? 'Skills' : ''
            }
            icon={
              activeTab === 'posts' ? 'fa-solid fa-file-alt' :
              activeTab === 'saved' ? 'fa-solid fa-bookmark' :
              activeTab === 'reviews' ? 'fa-solid fa-star' :
              activeTab === 'documents' ? 'fa-solid fa-file' :
              activeTab === 'face' ? 'fa-solid fa-camera' :
              activeTab === 'about' ? 'fa-solid fa-user' :
              activeTab === 'skills' ? 'fa-solid fa-code' : ''
            }
            backButton
            backFallback="/profile"
          />

          {/* ===== ট্যাব কন্টেন্ট ===== */}
          <div className={styles.profileContent}>
        {/* পোস্ট ট্যাব */}
        {activeTab === 'posts' && (
          <div className={styles.userPostsSection}>
            {/* ===== Mode Switcher ===== */}
            <div className={styles.profileModeSwitcher}>
              <button
                className={`${styles.profileModeBtn} ${currentMode === 'buyer' ? styles.active : ''}`}
                onClick={() => handleModeChange('buyer')}
              >
                <i className="fa-solid fa-briefcase"></i> Buyer Mode
              </button>
              <button
                className={`${styles.profileModeBtn} ${currentMode === 'seller' ? styles.active : ''}`}
                onClick={() => handleModeChange('seller')}
              >
                <i className="fa-solid fa-laptop-code"></i> Seller Mode
              </button>
            </div>

            <div className={styles.sectionHeaderWithCount}>
              <h3>
                <i className="fa-solid fa-file-alt"></i>
                My {currentMode === 'buyer' ? 'Jobs' : 'Services'} ({filteredPosts.length})
              </h3>
              <div className={styles.statusCounts}>
                {pendingPostsCount > 0 && (
                  <span className={styles.pendingCountBadge}>
                    <i className="fa-solid fa-clock"></i> {pendingPostsCount} pending
                  </span>
                )}
                {rejectedPostsCount > 0 && (
                  <span className={styles.rejectedCountBadge}>
                    <i className="fa-solid fa-xmark-circle"></i> {rejectedPostsCount} rejected
                  </span>
                )}
              </div>
            </div>

            {pendingPostsCount > 0 && (
              <div className={styles.pendingPostsSection}>
                <div className={styles.pendingPostsHeader}>
                  <i className="fa-solid fa-hourglass-half"></i>
                  <span>Your posts are awaiting admin approval</span>
                </div>
                <div className={styles.pendingPostsGrid}>
                  {userPosts.filter(p => p.status === 'pending').map(post => (
                    <div key={post.id} className={styles.pendingPostMini}>
                      <span className={styles.postTitle}>{post.title}</span>
                      <span className={styles.postDate}>{formatDate(post.createdAt)}</span>
                      <button
                        className={styles.deleteBtnSmall}
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
              <div className={styles.rejectedPostsSection}>
                <div className={styles.rejectedPostsHeader}>
                  <i className="fa-solid fa-xmark-circle"></i>
                  <span>Your posts were rejected by admin</span>
                </div>
                <div className={styles.rejectedPostsGrid}>
                  {userPosts.filter(p => p.status === 'rejected').map(post => (
                    <div key={post.id} className={styles.rejectedPostMini}>
                      <span className={styles.postTitle}>{post.title}</span>
                      <span className={styles.postReason}>{post.rejectReason || 'No reason provided'}</span>
                      <button
                        className={styles.deleteBtnSmall}
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
              user={user}
              onToggleLock={handleToggleLock}
            />
          </div>
        )}

        {/* Saved Posts ট্যাব */}
        {activeTab === 'saved' && (
          <div className={styles.userPostsSection}>
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
            identityNumber={identityNumber}
            identityNumberError={identityNumberError}
            onIdentityNumberChange={(val) => { setIdentityNumber(val); setIdentityNumberError(''); }}
            onDocFileChange={handleDocFileChange}
            onRemoveDocFile={handleRemoveDocFile}
            onUploadDocuments={uploadDocuments}
            onUploadAgain={handleUploadAgain}
            onPdfPreview={handlePdfPreview}
          />
        )}

        {/* ✅ ফেস ভেরিফিকেশন ট্যাব */}
        {activeTab === 'face' && (
          <FaceVerificationTab
            docStatus={docStatus}
            isFaceRejected={isFaceRejected}
            userData={userData}
            livenessState={faceVerification.livenessState}
            currentLivenessStep={faceVerification.currentLivenessStep}
            camStream={faceVerification.camStream}
            livenessComplete={faceVerification.livenessComplete}
            capturing={faceVerification.capturing}
            lowLightWarning={faceVerification.lowLightWarning}
            noFaceWarning={faceVerification.noFaceWarning}
            calibrationFailed={faceVerification.calibrationFailed}
            videoRef={faceVerification.videoRef}
            canvasRef={faceVerification.canvasRef}
            cameraBoxRef={faceVerification.cameraBoxRef}
            camStartBtnRef={faceVerification.camStartBtnRef}
            captureBtnRef={faceVerification.captureBtnRef}
            camStopBtnRef={faceVerification.camStopBtnRef}
            startCamera={faceVerification.startCamera}
            stopCamera={faceVerification.stopCamera}
            capturePhoto={faceVerification.capturePhoto}
          />
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div className={styles.aboutSection}>
            <div className={styles.aboutCard}>
              <h3><i className="fa-solid fa-user-pen"></i> About Me</h3>
              <p>{profileData.about}</p>
            </div>
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === 'skills' && (
          <div className={styles.skillsSection}>
            <div className={styles.skillsCard}>
              <h3><i className="fa-solid fa-code"></i> Core Skills</h3>
              <div className={styles.skillsChipContainer}>
                {profileData.skills?.split(',').map((skill, idx) => (
                  <span key={idx} className={styles.skillChip}>{skill.trim()}</span>
                )) || <p>No skills added yet</p>}
              </div>
            </div>
          </div>
        )}
          </div>
        </>
      )}
    </div>
  );
}

export default Profile;