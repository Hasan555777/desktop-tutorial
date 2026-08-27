// // src/pages/ProfileDetail.jsx
// import React, { useState, useEffect, useRef } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { useAuth } from '@/context/AuthContext';
// import { db } from '@/firebase';
// import { 
//   doc, 
//   getDoc, 
//   updateDoc, 
//   deleteDoc, 
//   collection, 
//   query, 
//   where, 
//   getDocs, 
//   orderBy, 
//   writeBatch,
//   serverTimestamp,
//   arrayUnion,
//   arrayRemove
// } from 'firebase/firestore';
// import { updateProfile } from 'firebase/auth';
// import toast from 'react-hot-toast';
// import './Profile.css';

// // Cloudinary আপলোড ফাংশন
// const uploadToCloudinary = async (file) => {
//   const formData = new FormData();
//   formData.append("file", file);
//   formData.append("upload_preset", "workhub_preset");

//   try {
//     const response = await fetch(
//       "https://api.cloudinary.com/v1_1/drwex6tmf/image/upload",
//       { method: "POST", body: formData }
//     );
//     const data = await response.json();
//     return data.secure_url;
//   } catch (error) {
//     console.error("Cloudinary Upload Error:", error);
//     return null;
//   }
// };

// const ProfileDetail = () => {
//   const { tab } = useParams();
//   const navigate = useNavigate();
//   const { user, userData, reloadUserData } = useAuth();
//   const [loading, setLoading] = useState(true);
//   const [refreshing, setRefreshing] = useState(false);

//   // ========== প্রোফাইল ডেটা ==========
//   const [profileData, setProfileData] = useState({
//     name: '',
//     headline: '',
//     about: '',
//     skills: '',
//     profilePic: '',
//     coverPhoto: ''
//   });

//   // ========== পোস্ট স্টেট ==========
//   const [userPosts, setUserPosts] = useState([]);
//   const [savedPosts, setSavedPosts] = useState([]);
//   const [savedPostIds, setSavedPostIds] = useState([]);
//   const [postsLoading, setPostsLoading] = useState(true);
//   const [savedPostsLoading, setSavedPostsLoading] = useState(false);
//   const [editingPost, setEditingPost] = useState(null);

//   // ========== রিভিউ স্টেট ==========
//   const [reviews, setReviews] = useState([]);
//   const [reviewsLoading, setReviewsLoading] = useState(false);
//   const [userRating, setUserRating] = useState({ average: 0, total: 0 });

//   // ========== ডকুমেন্ট ভেরিফিকেশন স্টেট ==========
//   const [docStatus, setDocStatus] = useState({
//     nidFront: false,
//     nidBack: false,
//     birth: false,
//     faceVerified: false,
//     documentsUploaded: false
//   });
//   const [uploadingDocs, setUploadingDocs] = useState(false);
//   const [uploadProgress, setUploadProgress] = useState(0);
//   const [isVerified, setIsVerified] = useState(false);
//   const [verificationStatus, setVerificationStatus] = useState('pending');

//   // ========== ফেস ভেরিফিকেশন স্টেট ==========
//   const [camStream, setCamStream] = useState(null);
//   const [livenessComplete, setLivenessComplete] = useState(false);
//   const [currentLivenessStep, setCurrentLivenessStep] = useState(0);
//   const [livenessTimer, setLivenessTimer] = useState(null);
//   const [faceVerified, setFaceVerified] = useState(false);
//   const videoRef = useRef(null);
//   const canvasRef = useRef(null);
//   const [livenessState, setLivenessState] = useState([
//     { id: 'eyeOpen', label: '👁️ চোখ খোলা', done: false },
//     { id: 'eyeClose', label: '😌 চোখ বন্ধ', done: false },
//     { id: 'mouthOpen', label: '👄 মুখ খোলা', done: false },
//     { id: 'mouthClose', label: '😐 মুখ বন্ধ', done: false },
//     { id: 'headRight', label: '👉 মাথা ডানে', done: false },
//     { id: 'headLeft', label: '👈 মাথা বামে', done: false }
//   ]);

//   // ========== এক্সপেরিয়েন্স স্টেট ==========
//   const [experience, setExperience] = useState([]);
//   const [education, setEducation] = useState([]);
//   const [certifications, setCertifications] = useState([]);
//   const [socialLinks, setSocialLinks] = useState({
//     linkedin: '',
//     github: '',
//     website: ''
//   });
//   const [isEditingExperience, setIsEditingExperience] = useState(false);
//   const [isEditingEducation, setIsEditingEducation] = useState(false);
//   const [isEditingCertifications, setIsEditingCertifications] = useState(false);
//   const [newExperience, setNewExperience] = useState({
//     company: '',
//     role: '',
//     startDate: '',
//     endDate: '',
//     description: ''
//   });
//   const [newEducation, setNewEducation] = useState({
//     institution: '',
//     degree: '',
//     field: '',
//     startDate: '',
//     endDate: ''
//   });
//   const [newCertification, setNewCertification] = useState({
//     name: '',
//     issuer: '',
//     date: '',
//     link: ''
//   });

//   // ========== Edit Post State ==========
//   const [editForm, setEditForm] = useState({
//     title: '',
//     description: '',
//     budget: '',
//     deadline: '',
//     images: []
//   });
//   const [editImages, setEditImages] = useState([]);
//   const [editImagePreviews, setEditImagePreviews] = useState([]);
//   const [editImageLoading, setEditImageLoading] = useState(false);
//   const editFileInputRef = useRef(null);

//   // ========== Mode State ==========
//   const [currentMode, setCurrentMode] = useState(() => {
//     return localStorage.getItem('profileMode') || 'buyer';
//   });

//   const handleModeChange = (mode) => {
//     setCurrentMode(mode);
//     localStorage.setItem('profileMode', mode);
//   };

//   // ============================================================
//   // ✅ কমপ্লিটনেস চেক (Profile.jsx থেকে যুক্ত করা হয়েছে)
//   // ============================================================
//   const checkCompletion = async () => {
//     if (!user) return;
    
//     try {
//       const userDoc = await getDoc(doc(db, 'users', user.uid));
//       const data = userDoc.data();
      
//       const isComplete = !!(
//         data.firstName ||
//         data.displayName &&
//         data.email &&
//         data.phone &&
//         data.dob &&
//         (data.documents?.nidFront || data.documents?.birthCert) &&
//         data.facePhotoUrl
//       );
      
//       if (isComplete) {
//         await updateDoc(doc(db, 'users', user.uid), {
//           isComplete: true,
//           completedAt: serverTimestamp()
//         });
//         toast.success('🎉 আপনার প্রোফাইল সম্পূর্ণ! এখন লেনদেন করতে পারবেন।');
//       }
      
//     } catch (error) {
//       console.error('Completion check error:', error);
//     }
//   };

//   // ============================================================
//   // ✅ ইউজার ডাটা লোড (এখানে checkCompletion যুক্ত করা হয়েছে)
//   // ============================================================
//   useEffect(() => {
//     if (!user?.uid) {
//       setLoading(false);
//       return;
//     }

//     const loadUserData = async () => {
//       setLoading(true);
//       try {
//         const userDoc = await getDoc(doc(db, "users", user.uid));
//         if (userDoc.exists()) {
//           const data = userDoc.data();
//           setProfileData({
//             name: data.displayName || user.displayName || 'User',
//             headline: data.headline || '',
//             about: data.about || '',
//             skills: data.skills || '',
//             profilePic: data.photoURL || user.photoURL || '',
//             coverPhoto: data.coverPhoto || ''
//           });
//           setSavedPostIds(data.savedPosts || []);
//           setExperience(data.experience || []);
//           setEducation(data.education || []);
//           setCertifications(data.certifications || []);
//           setSocialLinks(data.socialLinks || { linkedin: '', github: '', website: '' });
          
//           setIsVerified(data.isVerified || false);
//           setVerificationStatus(data.verificationStatus || 'pending');
          
//           const docs = data.documents || {};
//           setDocStatus({
//             nidFront: !!docs.nidFront,
//             nidBack: !!docs.nidBack,
//             birth: !!docs.birthCert,
//             faceVerified: !!data.facePhotoUrl,
//             documentsUploaded: !!(docs.nidFront || docs.birthCert)
//           });
//           setFaceVerified(!!data.facePhotoUrl);

//           // ✅ প্রোফাইল কমপ্লিট চেক করুন
//           checkCompletion();
//         }
//       } catch (error) {
//         console.error("Error loading user data:", error);
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadUserData();
//   }, [user]);

//   // ============================================================
//   // ✅ পোস্ট লোড
//   // ============================================================
//   useEffect(() => {
//     if (!user?.uid) return;

//     const loadPosts = async () => {
//       setPostsLoading(true);
//       try {
//         const q = query(
//           collection(db, 'posts'),
//           where('userId', '==', user.uid),
//           orderBy('createdAt', 'desc')
//         );
//         const snapshot = await getDocs(q);
//         const uniquePostsMap = new Map();
//         snapshot.docs.forEach(doc => {
//           if (!uniquePostsMap.has(doc.id)) {
//             uniquePostsMap.set(doc.id, {
//               id: doc.id,
//               ...doc.data(),
//               createdAt: doc.data().createdAt || new Date().toISOString()
//             });
//           }
//         });
//         setUserPosts(Array.from(uniquePostsMap.values()));
//       } catch (error) {
//         console.error("Error loading posts:", error);
//       } finally {
//         setPostsLoading(false);
//       }
//     };

//     loadPosts();
//   }, [user?.uid]);

//   // ============================================================
//   // ✅ সেভড পোস্ট লোড
//   // ============================================================
//   useEffect(() => {
//     if (tab !== 'saved' || !user) return;

//     const loadSavedPosts = async () => {
//       setSavedPostsLoading(true);
//       try {
//         const userDoc = await getDoc(doc(db, "users", user.uid));
//         const savedIds = userDoc.data()?.savedPosts || [];

//         if (savedIds.length === 0) {
//           setSavedPosts([]);
//           setSavedPostsLoading(false);
//           return;
//         }

//         const q = query(collection(db, "posts"), where("__name__", "in", savedIds));
//         const querySnapshot = await getDocs(q);
//         setSavedPosts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
//       } catch (error) {
//         console.error("Error loading saved posts:", error);
//         setSavedPosts([]);
//       } finally {
//         setSavedPostsLoading(false);
//       }
//     };

//     loadSavedPosts();
//   }, [tab, user]);

//   // ============================================================
//   // ✅ রিভিউ ফেচ
//   // ============================================================
//   useEffect(() => {
//     if (!user?.uid) return;

//     const fetchReviews = async () => {
//       setReviewsLoading(true);
//       try {
//         const q = query(collection(db, 'reviews'), where('userId', '==', user.uid));
//         const snapshot = await getDocs(q);
//         const reviewsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//         reviewsData.sort((a, b) => {
//           const dateA = a.createdAt?.toDate?.() || new Date(0);
//           const dateB = b.createdAt?.toDate?.() || new Date(0);
//           return dateB - dateA;
//         });
//         setReviews(reviewsData);

//         if (reviewsData.length > 0) {
//           const total = reviewsData.reduce((sum, r) => sum + r.rating, 0);
//           const average = total / reviewsData.length;
//           setUserRating({
//             average: Math.round(average * 10) / 10,
//             total: reviewsData.length
//           });
//         }
//       } catch (error) {
//         console.error("Error fetching reviews:", error);
//       } finally {
//         setReviewsLoading(false);
//       }
//     };

//     fetchReviews();
//   }, [user?.uid]);

//   // ============================================================
//   // ✅ ডকুমেন্ট আপলোড
//   // ============================================================
//   const uploadDocuments = async () => {
//     setUploadingDocs(true);
//     setUploadProgress(0);
    
//     try {
//       const uploadedDocs = {};
//       let progress = 0;
      
//       const frontFile = document.getElementById('nidFront')?.files[0];
//       if (frontFile) {
//         const url = await uploadToCloudinary(frontFile);
//         uploadedDocs.nidFront = { url };
//         progress += 33;
//         setUploadProgress(progress);
//       }
      
//       const backFile = document.getElementById('nidBack')?.files[0];
//       if (backFile) {
//         const url = await uploadToCloudinary(backFile);
//         uploadedDocs.nidBack = { url };
//         progress += 33;
//         setUploadProgress(progress);
//       }
      
//       const birthFile = document.getElementById('birthCert')?.files[0];
//       if (birthFile) {
//         const url = await uploadToCloudinary(birthFile);
//         uploadedDocs.birthCert = { url };
//         progress += 34;
//         setUploadProgress(progress);
//       }
      
//       await updateDoc(doc(db, 'users', user.uid), {
//         documents: uploadedDocs,
//         documentVerified: false,
//         verificationStatus: 'pending',
//         documentSubmittedAt: serverTimestamp()
//       });
      
//       setDocStatus(prev => ({ ...prev, documentsUploaded: true }));
//       setVerificationStatus('pending');
//       setUploadProgress(100);
//       toast.success('✅ ডকুমেন্ট আপলোড সম্পন্ন!');
      
//     } catch (error) {
//       console.error('Document upload error:', error);
//       toast.error('❌ ডকুমেন্ট আপলোড ব্যর্থ হয়েছে');
//     } finally {
//       setUploadingDocs(false);
//     }
//   };

//   // ============================================================
//   // ✅ ফেস ভেরিফিকেশন ফাংশন
//   // ============================================================
//   const startCamera = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
//       });
//       setCamStream(stream);
//       if (videoRef.current) videoRef.current.srcObject = stream;
      
//       document.getElementById('cameraBox')?.classList.add('camera-active');
//       document.getElementById('camStartBtn').style.display = 'none';
//       document.getElementById('captureBtn').style.display = '';
//       document.getElementById('camStopBtn').style.display = '';
      
//       toast.success('📷 ক্যামেরা চালু হয়েছে');
//       resetLiveness();
//       setTimeout(startLivenessDetection, 1000);
      
//     } catch (e) {
//       toast.error('⚠️ ক্যামেরা চালু করা যায়নি');
//     }
//   };

//   const stopCamera = () => {
//     if (camStream) {
//       camStream.getTracks().forEach(t => t.stop());
//       setCamStream(null);
//     }
//     document.getElementById('cameraBox')?.classList.remove('camera-active');
//     document.getElementById('camStartBtn').style.display = '';
//     document.getElementById('captureBtn').style.display = 'none';
//     document.getElementById('camStopBtn').style.display = 'none';
//     resetLiveness();
//   };

//   const startLivenessDetection = () => {
//     if (livenessComplete) return;
//     const resetState = livenessState.map(s => ({ ...s, done: false }));
//     setLivenessState(resetState);
//     setCurrentLivenessStep(0);
//     setLivenessComplete(false);
//     startLivenessTimer();
//   };

//   const startLivenessTimer = () => {
//     clearInterval(livenessTimer);
//     const interval = setInterval(() => {
//       if (livenessComplete) { clearInterval(interval); return; }
//       const current = livenessState[currentLivenessStep];
//       if (current && !current.done) {
//         const updated = [...livenessState];
//         updated[currentLivenessStep].done = true;
//         setLivenessState(updated);
//         const nextStep = currentLivenessStep + 1;
//         setCurrentLivenessStep(nextStep);
//         if (nextStep >= livenessState.length) {
//           clearInterval(interval);
//         }
//         updateLivenessUI(updated);
//       }
//     }, 3000);
//     setLivenessTimer(interval);
//   };

//   const updateLivenessUI = (state) => {
//     const doneCount = state.filter(s => s.done).length;
//     const total = state.length;
//     document.getElementById('livenessProgressText').textContent = `${doneCount}/${total} সম্পন্ন`;
//     document.getElementById('livenessProgressFill').style.width = `${(doneCount/total)*100}%`;
    
//     if (doneCount === total) {
//       setLivenessComplete(true);
//       clearInterval(livenessTimer);
//       setTimeout(capturePhoto, 1000);
//     }
//   };

//   const resetLiveness = () => {
//     setLivenessComplete(false);
//     setCurrentLivenessStep(0);
//     const resetState = livenessState.map(s => ({ ...s, done: false }));
//     setLivenessState(resetState);
//     clearInterval(livenessTimer);
//     updateLivenessUI(resetState);
//   };

//   const capturePhoto = async () => {
//     const video = videoRef.current;
//     const canvas = canvasRef.current;
//     if (!video || !canvas) return;
    
//     canvas.width = video.videoWidth || 640;
//     canvas.height = video.videoHeight || 480;
//     const ctx = canvas.getContext('2d');
//     ctx.drawImage(video, 0, 0);
    
//     const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    
//     if (camStream) {
//       camStream.getTracks().forEach(t => t.stop());
//       setCamStream(null);
//     }
    
//     document.getElementById('cameraBox')?.classList.remove('camera-active');
//     document.getElementById('captureBtn').style.display = 'none';
//     document.getElementById('camStartBtn').style.display = '';
    
//     try {
//       const file = new File([blob], 'face_photo.jpg', { type: 'image/jpeg' });
//       const url = await uploadToCloudinary(file);
      
//       await updateDoc(doc(db, 'users', user.uid), {
//         facePhotoUrl: url,
//         faceVerified: true
//       });
      
//       setFaceVerified(true);
//       setDocStatus(prev => ({ ...prev, faceVerified: true }));
//       toast.success('✅ মুখমণ্ডল যাচাই সম্পন্ন!');
      
//     } catch (error) {
//       console.error('Face photo upload error:', error);
//       toast.error('❌ ফেস ফটো আপলোড ব্যর্থ হয়েছে');
//     }
//   };

//   // ============================================================
//   // ✅ এক্সপেরিয়েন্স ফাংশন
//   // ============================================================
//   const handleAddExperience = async () => {
//     if (!newExperience.company || !newExperience.role) {
//       toast.error('Please fill company and role!');
//       return;
//     }
//     try {
//       const userRef = doc(db, 'users', user.uid);
//       const updatedExperience = [...experience, { ...newExperience, id: Date.now() }];
//       await updateDoc(userRef, { experience: updatedExperience });
//       setExperience(updatedExperience);
//       setNewExperience({ company: '', role: '', startDate: '', endDate: '', description: '' });
//       setIsEditingExperience(false);
//       toast.success('✅ Experience added!');
//     } catch (error) {
//       console.error("Error:", error);
//       toast.error('Failed to add experience.');
//     }
//   };

//   const handleDeleteExperience = async (id) => {
//     if (!window.confirm('Delete this experience?')) return;
//     try {
//       const userRef = doc(db, 'users', user.uid);
//       const updatedExperience = experience.filter(exp => exp.id !== id);
//       await updateDoc(userRef, { experience: updatedExperience });
//       setExperience(updatedExperience);
//     } catch (error) {
//       console.error("Error:", error);
//     }
//   };

//   // ============================================================
//   // ✅ এডুকেশন ফাংশন
//   // ============================================================
//   const handleAddEducation = async () => {
//     if (!newEducation.institution || !newEducation.degree) {
//       toast.error('Please fill institution and degree!');
//       return;
//     }
//     try {
//       const userRef = doc(db, 'users', user.uid);
//       const updatedEducation = [...education, { ...newEducation, id: Date.now() }];
//       await updateDoc(userRef, { education: updatedEducation });
//       setEducation(updatedEducation);
//       setNewEducation({ institution: '', degree: '', field: '', startDate: '', endDate: '' });
//       setIsEditingEducation(false);
//       toast.success('✅ Education added!');
//     } catch (error) {
//       console.error("Error:", error);
//       toast.error('Failed to add education.');
//     }
//   };

//   const handleDeleteEducation = async (id) => {
//     if (!window.confirm('Delete this education?')) return;
//     try {
//       const userRef = doc(db, 'users', user.uid);
//       const updatedEducation = education.filter(edu => edu.id !== id);
//       await updateDoc(userRef, { education: updatedEducation });
//       setEducation(updatedEducation);
//     } catch (error) {
//       console.error("Error:", error);
//     }
//   };

//   // ============================================================
//   // ✅ সার্টিফিকেশন ফাংশন
//   // ============================================================
//   const handleAddCertification = async () => {
//     if (!newCertification.name || !newCertification.issuer) {
//       toast.error('Please fill name and issuer!');
//       return;
//     }
//     try {
//       const userRef = doc(db, 'users', user.uid);
//       const updatedCertifications = [...certifications, { ...newCertification, id: Date.now() }];
//       await updateDoc(userRef, { certifications: updatedCertifications });
//       setCertifications(updatedCertifications);
//       setNewCertification({ name: '', issuer: '', date: '', link: '' });
//       setIsEditingCertifications(false);
//       toast.success('✅ Certification added!');
//     } catch (error) {
//       console.error("Error:", error);
//       toast.error('Failed to add certification.');
//     }
//   };

//   const handleDeleteCertification = async (id) => {
//     if (!window.confirm('Delete this certification?')) return;
//     try {
//       const userRef = doc(db, 'users', user.uid);
//       const updatedCertifications = certifications.filter(cert => cert.id !== id);
//       await updateDoc(userRef, { certifications: updatedCertifications });
//       setCertifications(updatedCertifications);
//     } catch (error) {
//       console.error("Error:", error);
//     }
//   };

//   // ============================================================
//   // ✅ সোশ্যাল লিংক সেভ
//   // ============================================================
//   const handleSaveSocialLinks = async () => {
//     try {
//       const userRef = doc(db, 'users', user.uid);
//       await updateDoc(userRef, { socialLinks });
//       toast.success('✅ Social links updated!');
//     } catch (error) {
//       console.error("Error:", error);
//       toast.error('Failed to update social links.');
//     }
//   };

//   // ============================================================
//   // ✅ পোস্ট সেভ টগল
//   // ============================================================
//   const toggleSavePost = async (postId) => {
//     if (!user) return;
//     const userRef = doc(db, 'users', user.uid);
//     const isCurrentlySaved = savedPostIds.includes(postId);
//     try {
//       if (isCurrentlySaved) {
//         await updateDoc(userRef, { savedPosts: arrayRemove(postId) });
//         setSavedPostIds(prev => prev.filter(id => id !== postId));
//         setSavedPosts(prev => prev.filter(p => p.id !== postId));
//       } else {
//         await updateDoc(userRef, { savedPosts: arrayUnion(postId) });
//         setSavedPostIds(prev => [...prev, postId]);
//       }
//     } catch (error) {
//       console.error("Error toggling save:", error);
//     }
//   };

//   // ============================================================
//   // ✅ Render Post Grid
//   // ============================================================
//   const renderPostGrid = (posts, isLoading, emptyMessage, showActions = true) => {
//     if (isLoading) {
//       return (
//         <div className="loading-posts">
//           <div className="loading-spinner-small"></div>
//           <p>Loading posts...</p>
//         </div>
//       );
//     }

//     if (posts.length === 0) {
//       return (
//         <div className="no-posts">
//           <i className="fa-solid fa-folder-open"></i>
//           <p>{emptyMessage}</p>
//           {tab === 'posts' && (
//             <button className="create-post-btn" onClick={() => navigate('/')}>
//               <i className="fa-solid fa-plus"></i> Create {currentMode === 'buyer' ? 'Job' : 'Service'}
//             </button>
//           )}
//         </div>
//       );
//     }

//     return (
//       <div className="posts-grid">
//         {posts.map((post, index) => (
//           <div key={`${post.id}-${index}`} className="post-card">
//             {post.images && post.images.length > 0 && (
//               <div className={`post-images-container ${post.images.length > 1 ? 'two-images' : 'one-image'}`}>
//                 {post.images.slice(0, 2).map((img, imgIndex) => (
//                   <img
//                     key={imgIndex}
//                     src={`${img.split('?')[0]}?v=${post._updatedAt || Date.now()}`}
//                     alt={post.title}
//                     className="post-image"
//                   />
//                 ))}
//                 {post.images.length > 2 && (
//                   <div className="post-image-badge">+{post.images.length - 2}</div>
//                 )}
//               </div>
//             )}

//             <div className="post-content">
//               <h4>{post.title}</h4>
//               <p className="post-description">{post.description?.substring(0, 100)}...</p>
//               <div className="post-meta">
//                 <span><i className="fa-solid fa-wallet"></i> {post.budget || post.price} BDT</span>
//                 <span><i className="fa-regular fa-clock"></i> {post.deadline || post.deliveryDays} Days</span>
//                 <span><i className="fa-solid fa-tag"></i> {post.type === 'hire' ? 'Job' : 'Service'}</span>
//               </div>
//               {showActions && tab === 'posts' && (
//                 <div className="post-actions">
//                   <button className="edit-post-btn" onClick={() => handleEditPost(post)}>
//                     <i className="fa-solid fa-pen"></i> Edit
//                   </button>
//                   <button className="force-delete-btn" onClick={() => handleDeletePost(post.id)}>
//                     <i className="fa-solid fa-trash"></i> Delete
//                   </button>
//                 </div>
//               )}
//               {tab === 'saved' && (
//                 <button className="unsave-btn" onClick={() => toggleSavePost(post.id)}>
//                   <i className="fa-solid fa-bookmark"></i> Unsave
//                 </button>
//               )}
//             </div>
//           </div>
//         ))}
//       </div>
//     );
//   };

//   // ============================================================
//   // ✅ পোস্ট এডিট ফাংশন
//   // ============================================================
//   const handleEditPost = (post) => {
//     setEditingPost(post);
//     setEditForm({
//       title: post.title || '',
//       description: post.description || '',
//       budget: post.budget || post.price || '',
//       deadline: post.deadline || post.deliveryDays || '',
//       images: post.images || []
//     });
//     setEditImagePreviews([...(post.images || [])]);
//     setEditImages([]);
//   };

//   const handleEditImageChange = (e) => {
//     const files = Array.from(e.target.files);
//     const remainingSlots = 2 - editImagePreviews.length;
//     if (files.length > remainingSlots) {
//       toast.error(`⚠️ You can only add ${remainingSlots} more image(s). Maximum 2 images allowed!`);
//       return;
//     }
//     const newPreviews = files.map(file => URL.createObjectURL(file));
//     setEditImages(prev => [...prev, ...files]);
//     setEditImagePreviews(prev => [...prev, ...newPreviews]);
//   };

//   const handleRemoveEditImage = (indexToRemove) => {
//     const previewToRemove = editImagePreviews[indexToRemove];
//     const isExistingImage = typeof previewToRemove === 'string' && previewToRemove.startsWith('http');
//     if (isExistingImage) {
//       const currentImages = [...editForm.images];
//       const imageUrlToRemove = previewToRemove.split('?')[0];
//       const imageIndex = currentImages.findIndex(img => img.split('?')[0] === imageUrlToRemove);
//       if (imageIndex !== -1) {
//         currentImages.splice(imageIndex, 1);
//         setEditForm(prev => ({ ...prev, images: currentImages }));
//       }
//     } else {
//       const fileIndex = indexToRemove - (editForm.images?.length || 0);
//       if (fileIndex >= 0 && fileIndex < editImages.length) {
//         setEditImages(prev => prev.filter((_, i) => i !== fileIndex));
//       }
//     }
//     setEditImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove));
//   };

//   const uploadEditImages = async () => {
//     if (editImages.length === 0) return [];
//     const uploadedUrls = [];
//     for (const file of editImages) {
//       const url = await uploadToCloudinary(file);
//       if (url) uploadedUrls.push(url);
//     }
//     return uploadedUrls;
//   };

//   const handleUpdatePost = async () => {
//     if (!editingPost) return;
//     setEditImageLoading(true);
//     try {
//       const postRef = doc(db, 'posts', editingPost.id);
//       const postSnap = await getDoc(postRef);
//       if (!postSnap.exists()) {
//         toast.error('❌ This post no longer exists.');
//         setEditingPost(null);
//         setEditImageLoading(false);
//         return;
//       }
//       const existingImages = (editForm.images || []).filter(img => typeof img === 'string');
//       let newImageUrls = [];
//       if (editImages.length > 0) {
//         newImageUrls = await uploadEditImages();
//       }
//       const finalImages = [...existingImages, ...newImageUrls];
//       if (finalImages.length === 0) {
//         toast.error('⚠️ Please keep at least one image for your post.');
//         setEditImageLoading(false);
//         return;
//       }
//       await updateDoc(postRef, {
//         title: editForm.title,
//         description: editForm.description,
//         budget: editForm.budget,
//         deadline: editForm.deadline,
//         images: finalImages,
//         updatedAt: serverTimestamp()
//       });
//       toast.success('✅ Post updated successfully!');
//       setUserPosts(prev => prev.map(post =>
//         post.id === editingPost.id ? { ...post, title: editForm.title, description: editForm.description, budget: editForm.budget, deadline: editForm.deadline, images: finalImages } : post
//       ));
//       setEditingPost(null);
//       setEditForm({ title: '', description: '', budget: '', deadline: '', images: [] });
//       setEditImages([]);
//       setEditImagePreviews([]);
//     } catch (error) {
//       console.error("❌ Update error:", error);
//       toast.error('Failed to update post: ' + error.message);
//     } finally {
//       setEditImageLoading(false);
//     }
//   };

//   const handleDeletePost = async (postId) => {
//     if (!window.confirm('⚠️ Delete this post permanently?')) return;
//     setPostsLoading(true);
//     try {
//       const batch = writeBatch(db);
//       batch.delete(doc(db, 'posts', postId));
//       await batch.commit();
//       setUserPosts(prev => prev.filter(p => p.id !== postId));
//       toast.success('✅ Post deleted successfully!');
//     } catch (error) {
//       console.error("❌ Delete error:", error);
//       toast.error('Failed to delete post: ' + error.message);
//     } finally {
//       setPostsLoading(false);
//     }
//   };

//   // ============================================================
//   // ✅ ফিল্টারিং
//   // ============================================================
//   const filteredPosts = userPosts.filter(post => {
//     if (currentMode === 'buyer') {
//       return post.type === 'hire';
//     } else {
//       return post.type === 'service';
//     }
//   });

//   // ============================================================
//   // ✅ Tab Title
//   // ============================================================
//   const getTabTitle = () => {
//     const titles = {
//       posts: 'My ' + (currentMode === 'buyer' ? 'Jobs' : 'Services'),
//       saved: 'Saved Posts',
//       reviews: 'Reviews',
//       documents: 'Document Verification',
//       face: 'Face Verification',
//       experience: 'Work Experience',
//       education: 'Education',
//       certifications: 'Certifications',
//       social: 'Social Links',
//       about: 'About Me',
//       skills: 'Skills'
//     };
//     return titles[tab] || 'Profile';
//   };

//   // ============================================================
//   // ✅ Render Documents Tab
//   // ============================================================
//   const renderDocumentsTab = () => (
//     <div className="tab-panel documents-panel">
//       <h3><i className="fa-solid fa-file"></i> ডকুমেন্ট যাচাই</h3>
//       <p className="tab-subtitle">আপনার পরিচয় প্রমাণের জন্য ডকুমেন্ট আপলোড করুন</p>
      
//       <div className="verification-status-box">
//         <div className={`status-badge-large ${verificationStatus}`}>
//           {verificationStatus === 'verified' && '✅ যাচাইকৃত'}
//           {verificationStatus === 'pending' && '⏳ যাচাই বাকি'}
//           {verificationStatus === 'rejected' && '❌ প্রত্যাখ্যাত'}
//         </div>
//         {isVerified && (
//           <div className="verified-badge">
//             <i className="fa-solid fa-check-circle"></i> আপনার অ্যাকাউন্ট যাচাই করা হয়েছে
//           </div>
//         )}
//       </div>

//       {docStatus.documentsUploaded ? (
//         <div className="info-box success">
//           <span className="info-icon">✅</span>
//           <div>
//             <strong>ডকুমেন্ট আপলোড সম্পন্ন!</strong>
//             <p>আপনার ডকুমেন্ট অ্যাডমিন দ্বারা যাচাই করা হচ্ছে।</p>
//           </div>
//         </div>
//       ) : (
//         <>
//           <div className="upload-row">
//             <div className="form-group">
//               <label>NID কার্ড (সামনে) <span className="required">*</span></label>
//               <div className="upload-area" id="nidFrontArea">
//                 <input type="file" id="nidFront" accept="image/*" />
//                 <div className="upload-default">
//                   <div className="upload-icon">🪪</div>
//                   <div className="upload-label">সামনের ছবি</div>
//                 </div>
//               </div>
//             </div>
//             <div className="form-group">
//               <label>NID কার্ড (পিছনে) <span className="required">*</span></label>
//               <div className="upload-area" id="nidBackArea">
//                 <input type="file" id="nidBack" accept="image/*" />
//                 <div className="upload-default">
//                   <div className="upload-icon">🔄</div>
//                   <div className="upload-label">পিছনের ছবি</div>
//                 </div>
//               </div>
//             </div>
//           </div>
          
//           <div className="form-group">
//             <label>জন্ম নিবন্ধন সনদ</label>
//             <div className="upload-area" id="birthArea">
//               <input type="file" id="birthCert" accept="image/*,application/pdf" />
//               <div className="upload-default">
//                 <div className="upload-icon">📄</div>
//                 <div className="upload-label">সনদের ছবি বা PDF</div>
//               </div>
//             </div>
//           </div>
          
//           {uploadingDocs && (
//             <div className="upload-progress">
//               <div className="progress-text">আপলোড হচ্ছে... {Math.round(uploadProgress)}%</div>
//               <div className="progress-bar-small">
//                 <div className="progress-fill-small" style={{ width: `${uploadProgress}%` }}></div>
//               </div>
//             </div>
//           )}
          
//           <button className="save-btn" onClick={uploadDocuments} disabled={uploadingDocs}>
//             {uploadingDocs ? '⏳ আপলোড হচ্ছে...' : '📤 ডকুমেন্ট আপলোড করুন'}
//           </button>
//         </>
//       )}
//     </div>
//   );

//   // ============================================================
//   // ✅ Render Face Verification Tab
//   // ============================================================
//   const renderFaceVerificationTab = () => (
//     <div className="tab-panel face-panel">
//       <h3><i className="fa-solid fa-camera"></i> মুখমণ্ডল যাচাই</h3>
//       <p className="tab-subtitle">নিচের নির্দেশনা অনুসরণ করুন</p>
      
//       {docStatus.faceVerified ? (
//         <div className="info-box success">
//           <span className="info-icon">✅</span>
//           <div>
//             <strong>মুখমণ্ডল যাচাই সম্পন্ন!</strong>
//             <p>আপনার ফেস ভেরিফিকেশন সফলভাবে সম্পন্ন হয়েছে।</p>
//           </div>
//         </div>
//       ) : (
//         <>
//           <div className="liveness-instructions">
//             {livenessState.map((step) => (
//               <div key={step.id} className={`instruction-step ${step.done ? 'done' : ''}`}>
//                 <div className="inst-text">{step.label}</div>
//                 <div className="inst-status">{step.done ? '✅' : '⬜'}</div>
//               </div>
//             ))}
//           </div>
          
//           <div className="camera-box" id="cameraBox">
//             <video ref={videoRef} autoPlay muted playsInline></video>
//             <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
//             <div className="camera-placeholder">
//               <span>📷</span>
//               <div>ক্যামেরা চালু করুন</div>
//             </div>
//           </div>
          
//           <div className="liveness-progress">
//             <div className="progress-text" id="livenessProgressText">০/৬ সম্পন্ন</div>
//             <div className="progress-bar-small">
//               <div className="progress-fill-small" id="livenessProgressFill" style={{ width: '0%' }}></div>
//             </div>
//           </div>
          
//           <div className="btn-row">
//             <button className="btn btn-ghost" id="camStartBtn" onClick={startCamera}>📷 ক্যামেরা চালু</button>
//             <button className="btn btn-primary" id="captureBtn" onClick={capturePhoto} style={{ display: 'none' }}>📸 ছবি তুলুন</button>
//             <button className="btn btn-danger" id="camStopBtn" onClick={stopCamera} style={{ display: 'none' }}>⏹ বন্ধ</button>
//           </div>
//         </>
//       )}
//     </div>
//   );

//   // ============================================================
//   // ✅ Render Experience Tab
//   // ============================================================
//   const renderExperienceTab = () => {
//     const handleAdd = async () => {
//       await handleAddExperience();
//     };

//     return (
//       <div className="tab-panel experience-panel">
//         <div className="section-header">
//           <h3><i className="fa-solid fa-briefcase"></i> Work Experience</h3>
//           {!isEditingExperience && (
//             <button className="add-btn" onClick={() => setIsEditingExperience(true)}>
//               <i className="fa-solid fa-plus"></i> Add Experience
//             </button>
//           )}
//         </div>

//         {isEditingExperience && (
//           <div className="add-form">
//             <input type="text" placeholder="Company" value={newExperience.company} onChange={(e) => setNewExperience({ ...newExperience, company: e.target.value })} />
//             <input type="text" placeholder="Role / Position" value={newExperience.role} onChange={(e) => setNewExperience({ ...newExperience, role: e.target.value })} />
//             <input type="text" placeholder="Start Date" value={newExperience.startDate} onChange={(e) => setNewExperience({ ...newExperience, startDate: e.target.value })} />
//             <input type="text" placeholder="End Date (or Present)" value={newExperience.endDate} onChange={(e) => setNewExperience({ ...newExperience, endDate: e.target.value })} />
//             <textarea placeholder="Description" value={newExperience.description} onChange={(e) => setNewExperience({ ...newExperience, description: e.target.value })} rows="3" />
//             <div className="form-actions">
//               <button className="cancel-btn" onClick={() => setIsEditingExperience(false)}>Cancel</button>
//               <button className="save-btn" onClick={handleAdd}>Add</button>
//             </div>
//           </div>
//         )}

//         {experience.length === 0 && !isEditingExperience ? (
//           <div className="empty-state">
//             <i className="fa-solid fa-briefcase"></i>
//             <p>No experience added yet</p>
//           </div>
//         ) : (
//           experience.map(exp => (
//             <div key={exp.id} className="item-card">
//               <div className="item-header">
//                 <h4>{exp.role} at {exp.company}</h4>
//                 <button className="delete-btn" onClick={() => handleDeleteExperience(exp.id)}>
//                   <i className="fa-solid fa-trash"></i>
//                 </button>
//               </div>
//               <p className="item-date">{exp.startDate} - {exp.endDate || 'Present'}</p>
//               <p className="item-description">{exp.description}</p>
//             </div>
//           ))
//         )}
//       </div>
//     );
//   };

//   // ============================================================
//   // ✅ Render Education Tab
//   // ============================================================
//   const renderEducationTab = () => {
//     const handleAdd = async () => {
//       await handleAddEducation();
//     };

//     return (
//       <div className="tab-panel education-panel">
//         <div className="section-header">
//           <h3><i className="fa-solid fa-graduation-cap"></i> Education</h3>
//           {!isEditingEducation && (
//             <button className="add-btn" onClick={() => setIsEditingEducation(true)}>
//               <i className="fa-solid fa-plus"></i> Add Education
//             </button>
//           )}
//         </div>

//         {isEditingEducation && (
//           <div className="add-form">
//             <input type="text" placeholder="Institution" value={newEducation.institution} onChange={(e) => setNewEducation({ ...newEducation, institution: e.target.value })} />
//             <input type="text" placeholder="Degree" value={newEducation.degree} onChange={(e) => setNewEducation({ ...newEducation, degree: e.target.value })} />
//             <input type="text" placeholder="Field of Study" value={newEducation.field} onChange={(e) => setNewEducation({ ...newEducation, field: e.target.value })} />
//             <input type="text" placeholder="Start Date" value={newEducation.startDate} onChange={(e) => setNewEducation({ ...newEducation, startDate: e.target.value })} />
//             <input type="text" placeholder="End Date" value={newEducation.endDate} onChange={(e) => setNewEducation({ ...newEducation, endDate: e.target.value })} />
//             <div className="form-actions">
//               <button className="cancel-btn" onClick={() => setIsEditingEducation(false)}>Cancel</button>
//               <button className="save-btn" onClick={handleAdd}>Add</button>
//             </div>
//           </div>
//         )}

//         {education.length === 0 && !isEditingEducation ? (
//           <div className="empty-state">
//             <i className="fa-solid fa-graduation-cap"></i>
//             <p>No education added yet</p>
//           </div>
//         ) : (
//           education.map(edu => (
//             <div key={edu.id} className="item-card">
//               <div className="item-header">
//                 <h4>{edu.degree} - {edu.field}</h4>
//                 <button className="delete-btn" onClick={() => handleDeleteEducation(edu.id)}>
//                   <i className="fa-solid fa-trash"></i>
//                 </button>
//               </div>
//               <p className="item-institution">{edu.institution}</p>
//               <p className="item-date">{edu.startDate} - {edu.endDate || 'Present'}</p>
//             </div>
//           ))
//         )}
//       </div>
//     );
//   };

//   // ============================================================
//   // ✅ Render Certifications Tab
//   // ============================================================
//   const renderCertificationsTab = () => {
//     const handleAdd = async () => {
//       await handleAddCertification();
//     };

//     return (
//       <div className="tab-panel certifications-panel">
//         <div className="section-header">
//           <h3><i className="fa-solid fa-award"></i> Certifications</h3>
//           {!isEditingCertifications && (
//             <button className="add-btn" onClick={() => setIsEditingCertifications(true)}>
//               <i className="fa-solid fa-plus"></i> Add Certification
//             </button>
//           )}
//         </div>

//         {isEditingCertifications && (
//           <div className="add-form">
//             <input type="text" placeholder="Certification Name" value={newCertification.name} onChange={(e) => setNewCertification({ ...newCertification, name: e.target.value })} />
//             <input type="text" placeholder="Issuer" value={newCertification.issuer} onChange={(e) => setNewCertification({ ...newCertification, issuer: e.target.value })} />
//             <input type="text" placeholder="Date" value={newCertification.date} onChange={(e) => setNewCertification({ ...newCertification, date: e.target.value })} />
//             <input type="url" placeholder="Certificate Link (Optional)" value={newCertification.link} onChange={(e) => setNewCertification({ ...newCertification, link: e.target.value })} />
//             <div className="form-actions">
//               <button className="cancel-btn" onClick={() => setIsEditingCertifications(false)}>Cancel</button>
//               <button className="save-btn" onClick={handleAdd}>Add</button>
//             </div>
//           </div>
//         )}

//         {certifications.length === 0 && !isEditingCertifications ? (
//           <div className="empty-state">
//             <i className="fa-solid fa-award"></i>
//             <p>No certifications added yet</p>
//           </div>
//         ) : (
//           certifications.map(cert => (
//             <div key={cert.id} className="item-card">
//               <div className="item-header">
//                 <h4>{cert.name}</h4>
//                 <button className="delete-btn" onClick={() => handleDeleteCertification(cert.id)}>
//                   <i className="fa-solid fa-trash"></i>
//                 </button>
//               </div>
//               <p className="item-issuer">Issued by: {cert.issuer}</p>
//               <p className="item-date">{cert.date}</p>
//               {cert.link && <a href={cert.link} target="_blank" rel="noopener noreferrer" className="cert-link">🔗 View Certificate</a>}
//             </div>
//           ))
//         )}
//       </div>
//     );
//   };

//   // ============================================================
//   // ✅ Render Social Tab
//   // ============================================================
//   const renderSocialTab = () => (
//     <div className="tab-panel social-panel">
//       <h3><i className="fa-solid fa-share-nodes"></i> Connect</h3>

//       <div className="social-form">
//         <div className="form-group">
//           <label><i className="fa-brands fa-linkedin"></i> LinkedIn</label>
//           <input type="url" placeholder="https://linkedin.com/in/yourprofile" value={socialLinks.linkedin} onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })} />
//         </div>
//         <div className="form-group">
//           <label><i className="fa-brands fa-github"></i> GitHub</label>
//           <input type="url" placeholder="https://github.com/yourusername" value={socialLinks.github} onChange={(e) => setSocialLinks({ ...socialLinks, github: e.target.value })} />
//         </div>
//         <div className="form-group">
//           <label><i className="fa-solid fa-globe"></i> Website / Portfolio</label>
//           <input type="url" placeholder="https://yourwebsite.com" value={socialLinks.website} onChange={(e) => setSocialLinks({ ...socialLinks, website: e.target.value })} />
//         </div>
//         <button className="save-btn" onClick={handleSaveSocialLinks}>
//           <i className="fa-solid fa-check"></i> Save Links
//         </button>
//       </div>

//       <div className="social-preview">
//         {socialLinks.linkedin && <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-linkedin"></i> LinkedIn</a>}
//         {socialLinks.github && <a href={socialLinks.github} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-github"></i> GitHub</a>}
//         {socialLinks.website && <a href={socialLinks.website} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-globe"></i> Website</a>}
//       </div>
//     </div>
//   );

//   // ============================================================
//   // ✅ Render About Tab
//   // ============================================================
//   const renderAboutTab = () => (
//     <div className="about-section">
//       <div className="about-card">
//         <h3><i className="fa-solid fa-user-pen"></i> About Me</h3>
//         <p>{profileData.about}</p>
//       </div>
//     </div>
//   );

//   // ============================================================
//   // ✅ Render Skills Tab
//   // ============================================================
//   const renderSkillsTab = () => (
//     <div className="skills-section">
//       <div className="skills-card">
//         <h3><i className="fa-solid fa-code"></i> Core Skills</h3>
//         <div className="skills-chip-container">
//           {profileData.skills?.split(',').map((skill, idx) => (
//             <span key={idx} className="skill-chip">{skill.trim()}</span>
//           )) || <p>No skills added yet</p>}
//         </div>
//       </div>
//     </div>
//   );

//   // ============================================================
//   // ✅ Render Reviews Tab
//   // ============================================================
//   const renderReviewsTab = () => {
//     if (reviewsLoading) {
//       return (
//         <div className="loading-reviews">
//           <div className="loading-spinner-small"></div>
//           <p>Loading reviews...</p>
//         </div>
//       );
//     }

//     if (reviews.length === 0) {
//       return (
//         <div className="no-reviews">
//           <i className="fa-solid fa-star-half-stroke"></i>
//           <p>No reviews yet.</p>
//           <button className="btn-review" onClick={() => navigate(`/profile/${user?.uid}`)}>
//             <i className="fa-solid fa-star"></i> Share your profile to get reviews
//           </button>
//         </div>
//       );
//     }

//     return (
//       <div className="reviews-list">
//         {reviews.map((review) => (
//           <div key={review.id} className="review-card">
//             <div className="review-header">
//               <div className="reviewer-info">
//                 <img
//                   src={review.reviewerPhoto || `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`}
//                   alt={review.reviewerName}
//                   className="reviewer-avatar"
//                   onError={(e) => {
//                     e.target.src = `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`;
//                   }}
//                 />
//                 <div>
//                   <h4>{review.reviewerName || 'Anonymous'}</h4>
//                   <div className="review-stars">
//                     {[1, 2, 3, 4, 5].map((star) => (
//                       <i key={star} className={`fa-solid fa-star ${star <= review.rating ? 'filled' : ''}`}></i>
//                     ))}
//                   </div>
//                 </div>
//               </div>
//               <span className="review-date">
//                 {review.createdAt?.toDate?.()?.toLocaleDateString() ||
//                   review.createdAt?.split?.('T')?.[0] ||
//                   'Recently'}
//               </span>
//             </div>
//             <p className="review-text">{review.text}</p>
//           </div>
//         ))}
//       </div>
//     );
//   };

//   // ============================================================
//   // ✅ Main Render - Tab based content
//   // ============================================================
//   const renderTabContent = () => {
//     switch (tab) {
//       case 'posts':
//         return (
//           <div className="user-posts-section">
//             <h3>
//               <i className="fa-solid fa-file-alt"></i>
//               My {currentMode === 'buyer' ? 'Jobs' : 'Services'} ({filteredPosts.length})
//             </h3>
//             {renderPostGrid(
//               filteredPosts,
//               postsLoading,
//               `No ${currentMode === 'buyer' ? 'jobs' : 'services'} posted yet.`
//             )}
//           </div>
//         );

//       case 'saved':
//         return (
//           <div className="user-posts-section">
//             <h3>
//               <i className="fa-solid fa-bookmark"></i>
//               Saved Posts ({savedPosts.length})
//             </h3>
//             {renderPostGrid(
//               savedPosts,
//               savedPostsLoading,
//               'No saved posts yet. Save posts you like!'
//             )}
//           </div>
//         );

//       case 'reviews':
//         return renderReviewsTab();

//       case 'documents':
//         return renderDocumentsTab();

//       case 'face':
//         return renderFaceVerificationTab();

//       case 'experience':
//         return renderExperienceTab();

//       case 'education':
//         return renderEducationTab();

//       case 'certifications':
//         return renderCertificationsTab();

//       case 'social':
//         return renderSocialTab();

//       case 'about':
//         return renderAboutTab();

//       case 'skills':
//         return renderSkillsTab();

//       default:
//         return (
//           <div className="empty-state">
//             <i className="fa-solid fa-folder-open"></i>
//             <p>Section not found</p>
//           </div>
//         );
//     }
//   };

//   // ============================================================
//   // ✅ Loading State
//   // ============================================================
//   if (loading) {
//     return (
//       <div className="loading-screen">
//         <div className="loading-spinner"></div>
//         <p>Loading...</p>
//       </div>
//     );
//   }

//   // ============================================================
//   // ✅ Render
//   // ============================================================
//   return (
//     <div className="profile-detail-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
//       {/* Header with Back Button */}
//       <div className="detail-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
//         <button 
//           className="back-btn" 
//           onClick={() => navigate('/profile')} 
//           style={{ 
//             marginRight: '15px', 
//             background: 'none', 
//             border: 'none', 
//             fontSize: '20px', 
//             cursor: 'pointer',
//             color: '#14b8a6'
//           }}
//         >
//           <i className="fa-solid fa-arrow-left"></i>
//         </button>
//         <h2 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>
//           <i className={`fa-solid ${tab === 'posts' ? 'fa-file-alt' : tab === 'saved' ? 'fa-bookmark' : tab === 'reviews' ? 'fa-star' : tab === 'documents' ? 'fa-file' : tab === 'face' ? 'fa-camera' : tab === 'experience' ? 'fa-briefcase' : tab === 'education' ? 'fa-graduation-cap' : tab === 'certifications' ? 'fa-award' : tab === 'social' ? 'fa-share-nodes' : tab === 'about' ? 'fa-user' : 'fa-code'}`}></i>
//           {' '}{getTabTitle()}
//         </h2>
//       </div>

//       {/* Content Area */}
//       <div className="tab-content">
//         {renderTabContent()}
//       </div>

//       {/* Edit Post Modal */}
//       {editingPost && (
//         <div className="modal-overlay" onClick={() => setEditingPost(null)}>
//           <div className="edit-modal edit-post-modal" onClick={(e) => e.stopPropagation()}>
//             <div className="edit-modal-header">
//               <h3>
//                 <i className="fa-solid fa-pen-to-square" style={{ color: '#fbbf24' }}></i>
//                 Edit Post
//               </h3>
//               <button className="modal-close-btn" onClick={() => setEditingPost(null)}>
//                 <i className="fa-solid fa-xmark"></i>
//               </button>
//             </div>

//             <div className="edit-form">
//               <div className="pb-group">
//                 <label>Post Title <span className="required-star">*</span></label>
//                 <input
//                   type="text"
//                   value={editForm.title}
//                   onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
//                   placeholder="Enter post title..."
//                   className="edit-input"
//                   maxLength="100"
//                 />
//                 <small className="char-count">{editForm.title?.length || 0}/100</small>
//               </div>

//               <div className="pb-group">
//                 <label>Description <span className="required-star">*</span></label>
//                 <textarea
//                   value={editForm.description}
//                   onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
//                   placeholder="Describe your post in detail..."
//                   rows="4"
//                   className="edit-textarea"
//                   maxLength="2000"
//                 />
//                 <small className="char-count">{editForm.description?.length || 0}/2000</small>
//               </div>

//               <div className="pb-row-twin">
//                 <div className="pb-group">
//                   <label>Budget / Price <span className="required-star">*</span></label>
//                   <div className="input-with-icon">
//                     <span className="input-icon">৳</span>
//                     <input
//                       type="number"
//                       value={editForm.budget}
//                       onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })}
//                       placeholder="Enter amount"
//                       className="edit-input with-icon"
//                       min="0"
//                     />
//                   </div>
//                 </div>
//                 <div className="pb-group">
//                   <label>Deadline / Delivery Days <span className="required-star">*</span></label>
//                   <div className="input-with-icon">
//                     <input
//                       type="number"
//                       value={editForm.deadline}
//                       onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
//                       placeholder="Enter days"
//                       className="edit-input with-icon"
//                       min="1"
//                     />
//                     <span className="input-icon-right">Days</span>
//                   </div>
//                 </div>
//               </div>

//               {editingPost?.images?.length > 0 && (
//                 <div className="pb-group">
//                   <label>Images ({editImagePreviews.length}/2)</label>
//                   <div className="edit-images-section">
//                     {editImagePreviews.length > 0 && (
//                       <div className="edit-images-grid">
//                         {editImagePreviews.map((img, idx) => (
//                           <div key={idx} className="edit-image-item">
//                             <img src={img} alt={`Preview ${idx}`} />
//                             <button
//                               type="button"
//                               className="remove-image-btn"
//                               onClick={() => handleRemoveEditImage(idx)}
//                             >
//                               <i className="fa-solid fa-xmark"></i>
//                             </button>
//                             <div className="image-order-badge">{idx + 1}</div>
//                           </div>
//                         ))}
//                       </div>
//                     )}

//                     {editImagePreviews.length < 2 && (
//                       <div
//                         className="upload-drop-zone-small"
//                         onClick={() => editFileInputRef.current?.click()}
//                       >
//                         <i className="fa-solid fa-cloud-arrow-up"></i>
//                         <p>Drop or click to add image</p>
//                         <span>({editImagePreviews.length}/2 used)</span>
//                       </div>
//                     )}

//                     <input
//                       type="file"
//                       ref={editFileInputRef}
//                       hidden
//                       accept="image/*"
//                       onChange={handleEditImageChange}
//                       multiple={editImagePreviews.length < 2}
//                     />
//                   </div>
//                   <small className="image-hint">
//                     <i className="fa-solid fa-info-circle"></i>
//                     Supported: JPG, PNG, WebP (Max 5MB each)
//                   </small>
//                 </div>
//               )}

//               <div className="edit-actions">
//                 <button className="cancel-btn" onClick={() => setEditingPost(null)}>
//                   <i className="fa-solid fa-times"></i> Cancel
//                 </button>
//                 <button
//                   className="save-btn"
//                   onClick={handleUpdatePost}
//                   disabled={editImageLoading || !editForm.title.trim() || !editForm.description.trim()}
//                 >
//                   {editImageLoading ? (
//                     <><i className="fa-solid fa-spinner fa-spin"></i> Updating...</>
//                   ) : (
//                     <><i className="fa-solid fa-check"></i> Update Post</>
//                   )}
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default ProfileDetail;