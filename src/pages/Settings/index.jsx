// ============================================================
// 📁 src/pages/Settings/index.jsx
// ============================================================
// Enterprise Grade Settings Component with Rule Engine Integration
//
// 🔧 FIXES APPLIED (search "FIX" to jump to each spot):
// 1. Removed the duplicate `useAppLock()` / `useBiometric()` hook
//    calls. App.js already owns ONE instance of each and passes the
//    live state + toggle functions down as props (appLockStatus,
//    onAppLockToggle, biometricStatus, onBiometricToggle, onChangePin,
//    onSecurityCheckup) — but this file was ignoring every one of
//    those props and building a second, completely disconnected copy
//    of the same state instead. Effect: toggling App Lock from
//    Settings never updated App.js's copy, so the lock screen didn't
//    engage until a full page refresh.
// 2. Removed the local `handleAppLockToggle` / `handleBiometricToggle`
//    wrapper functions. They duplicated the feedback+sound that
//    SecurityTab.jsx ALSO shows for the same action — toggling App
//    Lock or biometric was showing two success toasts and playing the
//    success sound twice. SecurityTab now receives the raw props
//    straight from App.js and is the only layer that shows feedback.
// 3. Removed the `useSoundSettings(user?.uid)` hook call and the
//    dead `localSoundSettings` state + handlers. Nothing in this file
//    ever rendered them (SoundTab is commented out, and
//    NotificationsTab doesn't receive them as props) — but the hook's
//    own effect still ran on every Settings mount, reading
//    `users/{uid}.soundSettings` from Firestore and OVERWRITING
//    `localStorage['workhub_sound_settings']` with it. Since
//    NotificationsTab.jsx only ever writes sound settings to
//    localStorage (never to Firestore), this meant: every time the
//    user reopened Settings, their sound toggles silently reverted to
//    whatever was last saved in Firestore. This was very likely the
//    root cause of "sound off করলেও আবার চালু হয়ে যায়".
// 4. `activeTab` now also reads `location.state?.activeTab` on first
//    render, so AppDeviceTab's "সব সাউন্ড সেটিংস দেখুন" button (which
//    navigates with that state) actually lands on the notifications
//    tab instead of silently staying on Profile.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  doc, getDoc, updateDoc, serverTimestamp,
  collection, query, where, getDocs, deleteDoc, 
  writeBatch, orderBy, onSnapshot
} from "firebase/firestore";
import { 
  updateProfile, updatePassword, reauthenticateWithCredential, 
  EmailAuthProvider, sendEmailVerification
} from "firebase/auth";
import { auth, db } from '@/firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import './Settings.css';
import RulesTab from './tabs/RulesTab';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';

// ✅ Import Rule Engine
import { accountRules } from '@/rules/accountRules';
import { hasActiveDeal } from '@/rules/dealRules';
import { RULE_CODES } from '@/rules/constants/ruleCodes';

// Import All Tab Components
import ProfileTab from './tabs/ProfileTab';
import ExperienceTab from './tabs/ExperienceTab';
import EducationTab from './tabs/EducationTab';
import CertificationsTab from './tabs/CertificationsTab';
import SocialTab from './tabs/SocialTab';
import SecurityTab from './tabs/SecurityTab';
import NotificationsTab from './tabs/NotificationsTab';
import AppDeviceTab from './tabs/AppDeviceTab';
import AnnouncementsTab from './tabs/AnnouncementsTab';

// ✅ Cloudinary Config from Environment
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "drwex6tmf";
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "workhub_preset";

// ✅ Image Validation Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ============================================================
// 📌 HELPER: Compress Image
// ============================================================

const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            reject(new Error('Compression failed'));
          }
        }, file.type, 0.8);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// ============================================================
// 📌 MAIN COMPONENT
// ============================================================
// 🔧 FIX: all of these props are now actually used (previously
// accepted but silently ignored — see fixes #1-#2 above).
const Settings = ({ 
  biometricStatus = false,
  biometricType = '',
  isBiometricSupported = false,
  isBiometricAvailable = false,
  appLockStatus = false,
  onBiometricToggle = null,
  onAppLockToggle = null,
  onChangePin = null,
  onSecurityCheckup = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.currentUser;
  const feedback = useFeedback();
  const sound = useSound();

  // ── States ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 🔧 FIX #4: honor router state (e.g. from AppDeviceTab's shortcut)
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'profile');
  const [userData, setUserData] = useState(null);
  const [walletData, setWalletData] = useState(null);

  // ── Profile Data ──
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    address: '',
    bio: '',
    skills: [],
    role: 'client',
    displayName: '',
    photoURL: '',
    headline: '',
    coverPhoto: ''
  });

  // ── Security Data ──
  const [securityData, setSecurityData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false
  });

  // ── Privacy Settings ──
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: 'public',
    showEmail: false,
    showPhone: false,
    activityStatus: true
  });

  // ── Payment Settings ──
  const [paymentSettings, setPaymentSettings] = useState({
    defaultCurrency: 'BDT',
    paymentMethod: 'bank',
    bankAccount: '',
    bankName: '',
    accountHolder: ''
  });

  // ── Experience ──
  const [experience, setExperience] = useState([]);
  const [isEditingExperience, setIsEditingExperience] = useState(false);
  const [newExperience, setNewExperience] = useState({ 
    company: '', role: '', startDate: '', endDate: '', description: '' 
  });

  // ── Education ──
  const [education, setEducation] = useState([]);
  const [isEditingEducation, setIsEditingEducation] = useState(false);
  const [newEducation, setNewEducation] = useState({ 
    institution: '', degree: '', field: '', startDate: '', endDate: '' 
  });

  // ── Certifications ──
  const [certifications, setCertifications] = useState([]);
  const [isEditingCertifications, setIsEditingCertifications] = useState(false);
  const [newCertification, setNewCertification] = useState({ 
    name: '', issuer: '', date: '', link: '' 
  });

  const [socialLinks, setSocialLinks] = useState({
    linkedin: '',
    github: '',
    facebook: '',
    youtube: '',
    instagram: '',
    twitter: '',
    website: ''
  });

  // ============================================================
  // ✅ RULE CHECK HELPER
  // ============================================================

  const checkRule = useCallback((ruleFunction, params) => {
    const result = ruleFunction(params);
    if (!result.allowed) {
      feedback.alert.warning({ message: result.message });
      return { allowed: false, result };
    }
    return { allowed: true, result };
  }, [feedback]);

  // ============================================================
  // ✅ Security Checkup — 🔧 FIX: now uses the appLockStatus /
  // biometricStatus PROPS (App.js's single source of truth) instead
  // of a second, disconnected useAppLock()/useBiometric() instance.
  // ============================================================

  const handleSecurityCheckup = useCallback(() => {
    const checks = [];
    let score = 0;
    let total = 4;

    const hasPassword = userData?.passwordSet !== false;
    if (hasPassword) {
      checks.push({ name: 'পাসওয়ার্ড', status: '✅ সেট করা আছে', score: 25 });
      score += 25;
    } else {
      checks.push({ name: 'পাসওয়ার্ড', status: '⚠️ সেট করা নেই', score: 0 });
    }

    if (userData?.twoFactorEnabled) {
      checks.push({ name: '2FA', status: '✅ সক্রিয়', score: 25 });
      score += 25;
    } else {
      checks.push({ name: '2FA', status: '⚠️ নিষ্ক্রিয়', score: 0 });
    }

    if (biometricStatus) {
      checks.push({ name: 'বায়োমেট্রিক', status: '✅ সক্রিয়', score: 25 });
      score += 25;
    } else {
      checks.push({ name: 'বায়োমেট্রিক', status: '⚠️ নিষ্ক্রিয়', score: 0 });
    }

    if (appLockStatus) {
      checks.push({ name: 'অ্যাপ লক', status: '✅ সক্রিয়', score: 25 });
      score += 25;
    } else {
      checks.push({ name: 'অ্যাপ লক', status: '⚠️ নিষ্ক্রিয়', score: 0 });
    }

    const percentage = Math.round((score / total) * 100);
    const isSecure = percentage >= 75;
    const report = checks.map(c => `${c.name}: ${c.status}`).join('\n');
    
    if (isSecure) {
      feedback?.showSuccess(`🛡️ নিরাপদ (${percentage}%)`, `আপনার অ্যাকাউন্ট সম্পূর্ণ নিরাপদ!\n\n${report}`);
    } else {
      const insecure = checks.filter(c => c.status.includes('⚠️'));
      feedback?.showWarning(`⚠️ সতর্কতা (${percentage}%)`, `${insecure.length} টি নিরাপত্তা ব্যবস্থা নিষ্ক্রিয় আছে।\n\n${report}`);
    }
    
    sound?.playEvent(SOUND_EVENTS.CLICK);
  }, [userData, biometricStatus, appLockStatus, feedback, sound]);

  // Prefer the richer checkup above; fall back to the parent's
  // (App.js's) if this component is ever rendered without userData.
  const effectiveSecurityCheckup = onSecurityCheckup || handleSecurityCheckup;

  // ============================================================
  // ✅ User Data Load - Real-time with Wallet
  // ============================================================

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    setLoading(true);
    
    const userRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setUserData(data);
        
        setProfileData(prev => ({
          ...prev,
          displayName: data.displayName || user.displayName || '',
          email: user.email || '',
          photoURL: data.photoURL || user.photoURL || '',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          phone: data.phone || '',
          dob: data.dob || '',
          address: data.address || '',
          bio: data.bio || '',
          headline: data.headline || '',
          skills: data.skills || [],
          role: data.role || 'client',
          coverPhoto: data.coverPhoto || ''
        }));

        setExperience(data.experience || []);
        setEducation(data.education || []);
        setCertifications(data.certifications || []);
        setSocialLinks(data.socialLinks || { 
          linkedin: '', github: '', facebook: '', youtube: '',
          instagram: '', twitter: '', website: '' 
        });
        
        if (data.privacySettings) {
          setPrivacySettings(prev => ({ ...prev, ...data.privacySettings }));
        }
        if (data.paymentSettings) {
          setPaymentSettings(prev => ({ ...prev, ...data.paymentSettings }));
        }
        if (data.twoFactorEnabled !== undefined) {
          setSecurityData(prev => ({ ...prev, twoFactorEnabled: data.twoFactorEnabled }));
        }
      }
      setLoading(false);
    }, (error) => {
      console.error("Error loading settings:", error);
      setLoading(false);
    });

    // ✅ Load Wallet Data for Balance Check
    const walletRef = doc(db, 'wallets', user.uid);
    const unsubscribeWallet = onSnapshot(walletRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        setWalletData(docSnapshot.data());
      }
    }, (error) => {
      console.error("Error loading wallet:", error);
    });

    return () => {
      unsubscribeUser();
      unsubscribeWallet();
    };
  }, [user, navigate]);

  // ============================================================
  // ✅ Cloudinary Upload with Validation
  // ============================================================

  const uploadToCloudinary = async (file, folder = 'user_documents') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', folder);
    
    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );
      
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      return { url: data.secure_url, publicId: data.public_id };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw error;
    }
  };

  // ============================================================
  // ✅ Common Update Function
  // ============================================================

  const updateFirebase = async (dataToUpdate, successMessage = '✅ Updated successfully!') => {
    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        ...dataToUpdate,
        updatedAt: serverTimestamp()
      });
      feedback.alert.success({ message: successMessage });
      return true;
    } catch (error) {
      console.error("Error updating:", error);
      feedback.alert.error({ message: '❌ Failed to update: ' + error.message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // ✅ Profile Update with Rule Engine
  // ============================================================

  const handleUpdateProfile = async () => {
    if (!profileData.firstName.trim() || !profileData.lastName.trim()) {
      feedback.alert.warning({ message: '❌ নাম দিন!' });
      return;
    }

    // ── Check Active Deal ──
    const dealCheck = hasActiveDeal({ 
      activeDeals: userData?.stats?.activeDeals || 0 
    });
    
    if (!dealCheck.allowed) {
      feedback.alert.warning({ 
        message: '⚠️ Active Deal থাকাকালীন প্রোফাইল আপডেট করা যাবে না!' 
      });
      return;
    }

    // ── Check Edit Rules ──
    const ruleCheck = accountRules.canEditImportantFields({
      activeDeals: userData?.stats?.activeDeals || 0,
      fieldType: 'name',
      isIdentityLocked: userData?.isIdentityLocked || false,
      verificationStatus: userData?.verificationStatus || 'incomplete'
    });

    if (!ruleCheck.allowed) {
      feedback.alert.warning({ message: ruleCheck.message });
      return;
    }

    setSaving(true);
    try {
      const fullName = `${profileData.firstName} ${profileData.lastName}`.trim();
      
      await updateProfile(user, {
        displayName: fullName,
        photoURL: profileData.photoURL
      });

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        displayName: fullName,
        phone: profileData.phone,
        dob: profileData.dob,
        address: profileData.address,
        bio: profileData.bio,
        headline: profileData.headline,
        skills: profileData.skills,
        role: profileData.role,
        updatedAt: serverTimestamp()
      });

      feedback.alert.success({ message: '✅ প্রোফাইল আপডেট করা হয়েছে!' });
      
    } catch (error) {
      console.error("Error updating profile:", error);
      feedback.alert.error({ message: '❌ প্রোফাইল আপডেট করতে সমস্যা হয়েছে' });
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // ✅ Profile Picture Upload with Validation
  // ============================================================

  const handleProfilePicUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // ── Validate File Type ──
    if (!VALID_IMAGE_TYPES.includes(file.type)) {
      feedback.alert.warning({ 
        message: '❌ শুধুমাত্র JPEG, PNG, WebP ফাইল সমর্থিত!' 
      });
      return;
    }

    // ── Validate File Size ──
    if (file.size > MAX_FILE_SIZE) {
      feedback.alert.warning({ 
        message: `❌ ফাইল সাইজ ${MAX_FILE_SIZE / (1024 * 1024)}MB এর কম হতে হবে!` 
      });
      return;
    }

    setUploading(true);
    try {
      // ── Compress Image ──
      const compressedFile = await compressImage(file);
      
      const result = await uploadToCloudinary(compressedFile, 'profile_pictures');
      if (result.url) {
        await updateProfile(user, { photoURL: result.url });
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { photoURL: result.url });
        setProfileData(prev => ({ ...prev, photoURL: result.url }));
        feedback.alert.success({ message: '✅ প্রোফাইল ছবি আপডেট করা হয়েছে!' });
      }
    } catch (error) {
      console.error("Error:", error);
      feedback.alert.error({ message: '❌ প্রোফাইল ছবি আপলোড ব্যর্থ হয়েছে' });
    } finally {
      setUploading(false);
    }
  };

  // ============================================================
  // ✅ Account Delete with Rule Engine
  // ============================================================

  const handleDeleteAccount = useCallback(async () => {
    // ── Check Rules ──
    const rule = accountRules.canDeleteAccount({
      activeDeals: userData?.stats?.activeDeals || 0,
      balance: walletData?.balance || 0,
      lockedBalance: walletData?.lockedBalance || 0,
      pendingWithdrawals: walletData?.pendingWithdraw || 0,
      hasInvestigation: userData?.hasInvestigation || false,
      role: userData?.role || 'client'
    });

    if (!rule.allowed) {
      feedback.alert.warning({ message: rule.message });
      return;
    }

    // ── User Confirmation ──
    const confirmed = await feedback.confirm({
      title: '⚠️ অ্যাকাউন্ট ডিলিট',
      message: 'আপনি কি নিশ্চিত যে আপনার অ্যাকাউন্ট ডিলিট করতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না!',
      variant: 'delete',
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    // ── Proceed with Deletion ──
    try {
      // This would call a Cloud Function or handle deletion
      feedback.alert.success({ message: '🗑️ অ্যাকাউন্ট ডিলিট করার অনুরোধ পাঠানো হয়েছে!' });
    } catch (error) {
      console.error("Delete account error:", error);
      feedback.alert.error({ message: '❌ অ্যাকাউন্ট ডিলিট করতে সমস্যা হয়েছে' });
    }
  }, [userData, walletData, feedback]);

  // ============================================================
  // ✅ Password Change
  // ============================================================

  const handleChangePassword = async () => {
    if (securityData.newPassword !== securityData.confirmPassword) {
      feedback.alert.warning({ message: '❌ পাসওয়ার্ড মিলছে না!' });
      return;
    }
    if (securityData.newPassword.length < 6) {
      feedback.alert.warning({ message: '❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে!' });
      return;
    }
    if (!securityData.currentPassword) {
      feedback.alert.warning({ message: '❌ বর্তমান পাসওয়ার্ড দিন!' });
      return;
    }

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, securityData.currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, securityData.newPassword);

      setSecurityData({ 
        currentPassword: '', 
        newPassword: '', 
        confirmPassword: '', 
        twoFactorEnabled: securityData.twoFactorEnabled 
      });
      feedback.alert.success({ message: '✅ পাসওয়ার্ড পরিবর্তন করা হয়েছে!' });
      
    } catch (error) {
      console.error("Error changing password:", error);
      if (error.code === 'auth/wrong-password') {
        feedback.alert.error({ message: '❌ বর্তমান পাসওয়ার্ড ভুল!' });
      } else {
        feedback.alert.error({ message: '❌ ' + error.message });
      }
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // ✅ 2FA Toggle
  // ============================================================

  const handleTwoFactorToggle = async () => {
    const newValue = !securityData.twoFactorEnabled;
    setSecurityData(prev => ({ ...prev, twoFactorEnabled: newValue }));
    await updateFirebase(
      { twoFactorEnabled: newValue },
      newValue ? '✅ 2FA সক্রিয় করা হয়েছে!' : '❌ 2FA নিষ্ক্রিয় করা হয়েছে!'
    );
  };

  // ============================================================
  // ✅ Settings Save
  // ============================================================

  const handleSaveSettings = async (section, data) => {
    await updateFirebase(
      { [section]: data },
      `✅ ${section.replace('Settings', '')} সেটিংস সংরক্ষণ করা হয়েছে!`
    );
  };

  // ============================================================
  // ✅ Experience Functions
  // ============================================================

  const handleAddExperience = async () => {
    if (!newExperience.company || !newExperience.role) {
      feedback.alert.warning({ message: '❌ কোম্পানি এবং পদবি দিন!' });
      return;
    }
    const updatedExperience = [...experience, { ...newExperience, id: Date.now() }];
    await updateFirebase({ experience: updatedExperience }, '✅ অভিজ্ঞতা যোগ করা হয়েছে!');
    setExperience(updatedExperience);
    setNewExperience({ company: '', role: '', startDate: '', endDate: '', description: '' });
    setIsEditingExperience(false);
  };

  const handleDeleteExperience = async (id) => {
    const confirmed = await feedback.confirm({
      title: 'অভিজ্ঞতা মুছে ফেলুন',
      message: 'আপনি কি নিশ্চিত যে এই অভিজ্ঞতাটি ডিলিট করতে চান?',
      okText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'না'
    });
    if (!confirmed) return;
    const updatedExperience = experience.filter(exp => exp.id !== id);
    await updateFirebase({ experience: updatedExperience });
    setExperience(updatedExperience);
  };

  // ============================================================
  // ✅ Education Functions
  // ============================================================

  const handleAddEducation = async () => {
    if (!newEducation.institution || !newEducation.degree) {
      feedback.alert.warning({ message: '❌ প্রতিষ্ঠান এবং ডিগ্রি দিন!' });
      return;
    }
    const updatedEducation = [...education, { ...newEducation, id: Date.now() }];
    await updateFirebase({ education: updatedEducation }, '✅ শিক্ষা যোগ করা হয়েছে!');
    setEducation(updatedEducation);
    setNewEducation({ institution: '', degree: '', field: '', startDate: '', endDate: '' });
    setIsEditingEducation(false);
  };

  const handleDeleteEducation = async (id) => {
    const confirmed = await feedback.confirm({
      title: 'শিক্ষা মুছে ফেলুন',
      message: 'আপনি কি নিশ্চিত যে এই শিক্ষা বিবরণীটি ডিলিট করতে চান?',
      okText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'না'
    });
    if (!confirmed) return;
    const updatedEducation = education.filter(edu => edu.id !== id);
    await updateFirebase({ education: updatedEducation });
    setEducation(updatedEducation);
  };

  // ============================================================
  // ✅ Certification Functions
  // ============================================================

  const handleAddCertification = async () => {
    if (!newCertification.name || !newCertification.issuer) {
      feedback.alert.warning({ message: '❌ সার্টিফিকেশন নাম এবং ইস্যুয়ার দিন!' });
      return;
    }
    const updatedCertifications = [...certifications, { ...newCertification, id: Date.now() }];
    await updateFirebase({ certifications: updatedCertifications }, '✅ সার্টিফিকেশন যোগ করা হয়েছে!');
    setCertifications(updatedCertifications);
    setNewCertification({ name: '', issuer: '', date: '', link: '' });
    setIsEditingCertifications(false);
  };

  const handleDeleteCertification = async (id) => {
    const confirmed = await feedback.confirm({
      title: 'সার্টিফিকেশন মুছে ফেলুন',
      message: 'আপনি কি নিশ্চিত যে এই সার্টিফিকেশনটি ডিলিট করতে চান?',
      okText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'না'
    });
    if (!confirmed) return;
    const updatedCertifications = certifications.filter(cert => cert.id !== id);
    await updateFirebase({ certifications: updatedCertifications });
    setCertifications(updatedCertifications);
  };

  // ============================================================
  // ✅ Social Links Save
  // ============================================================

  const handleSaveSocialLinks = async () => {
    await updateFirebase({ socialLinks }, '✅ সোশ্যাল লিংক আপডেট করা হয়েছে!');
  };

  // ============================================================
  // ✅ Tab Content Renderer
  // ============================================================

  const renderTabContent = () => {
    switch(activeTab) {
      case 'profile':
        return (
          <ProfileTab
            profileData={profileData}
            setProfileData={setProfileData}
            saving={saving}
            uploading={uploading}
            onUpdateProfile={handleUpdateProfile}
            onProfilePicUpload={handleProfilePicUpload}
            onDeleteAccount={handleDeleteAccount}
          />
        );
      case 'experience':
        return (
          <ExperienceTab
            experience={experience}
            setExperience={setExperience}
            isEditingExperience={isEditingExperience}
            setIsEditingExperience={setIsEditingExperience}
            newExperience={newExperience}
            setNewExperience={setNewExperience}
            onAddExperience={handleAddExperience}
            onDeleteExperience={handleDeleteExperience}
          />
        );
      case 'education':
        return (
          <EducationTab
            education={education}
            setEducation={setEducation}
            isEditingEducation={isEditingEducation}
            setIsEditingEducation={setIsEditingEducation}
            newEducation={newEducation}
            setNewEducation={setNewEducation}
            onAddEducation={handleAddEducation}
            onDeleteEducation={handleDeleteEducation}
          />
        );
      case 'certifications':
        return (
          <CertificationsTab
            certifications={certifications}
            setCertifications={setCertifications}
            isEditingCertifications={isEditingCertifications}
            setIsEditingCertifications={setIsEditingCertifications}
            newCertification={newCertification}
            setNewCertification={setNewCertification}
            onAddCertification={handleAddCertification}
            onDeleteCertification={handleDeleteCertification}
          />
        );
      case 'social':
        return (
          <SocialTab
            socialLinks={socialLinks}
            setSocialLinks={setSocialLinks}
            onSaveSocialLinks={handleSaveSocialLinks}
            saving={saving} 
          />
        );
      case 'security':
        // 🔧 FIX #1/#2: pass the PROPS straight through — no more
        // local useAppLock()/useBiometric() instances, no more
        // wrapper functions that duplicated SecurityTab's own feedback.
        return (
          <SecurityTab
            securityData={securityData}
            setSecurityData={setSecurityData}
            onChangePassword={handleChangePassword}
            onTwoFactorToggle={handleTwoFactorToggle}
            saving={saving}
            biometricStatus={biometricStatus}
            biometricType={biometricType}
            isBiometricSupported={isBiometricSupported}
            isBiometricAvailable={isBiometricAvailable}
            appLockStatus={appLockStatus}
            onBiometricToggle={onBiometricToggle}
            onAppLockToggle={onAppLockToggle}
            onChangePin={onChangePin}
            onSecurityCheckup={effectiveSecurityCheckup}
          />
        );
      case 'notifications':
        return (
          <NotificationsTab
            userId={user?.uid}
            onSettingsChange={(newSettings) => {
              console.log('📢 Notification settings updated:', newSettings);
            }}
          />
        );
      case 'app-device':
        return <AppDeviceTab />;
      case 'announcements':
        return <AnnouncementsTab />;
      case 'rules':
        return <RulesTab />;
      default:
        return null;
    }
  };

  // ============================================================
  // ✅ Loading State
  // ============================================================
  // 🔧 FIX: no longer waits on appLockLoading/biometricLoading — those
  // belonged to the removed duplicate hooks. App.js's own loading
  // gate already ensures appLockStatus/biometricStatus are settled
  // before this component ever mounts.

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: 'var(--bg-primary)', 
        color: 'var(--accent-primary)' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{ 
            fontSize: '48px', 
            animation: 'spin 2s linear infinite',
            display: 'block',
            marginBottom: '16px'
          }} />
          <h2>Loading Settings...</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your settings...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // ✅ Main Render
  // ============================================================

  return (
    <div className="settings-container">
      <div className="settings-wrapper">
        {/* ── Header ── */}
        <div className="settings-header">
          <div className="settings-header-left">
            <h1>
              <i className="fa-solid fa-sliders"></i> Settings
            </h1>
            <p className="settings-subtitle">
              Manage your account settings and preferences
            </p>
          </div>
          <div className="settings-header-right">
            <span className="settings-user-email">
              <i className="fa-regular fa-envelope"></i> {user?.email}
            </span>
          </div>
        </div>

        {/* ── Settings Navigation Grid ── */}
        <div className="settings-tabs-grid">
          <button 
            className={`settings-card ${activeTab === 'profile' ? 'active' : ''}`} 
            onClick={() => setActiveTab('profile')}
          >
            <div className="card-icon"><i className="fa-solid fa-user"></i></div>
            <span className="card-label">প্রোফাইল</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'experience' ? 'active' : ''}`} 
            onClick={() => setActiveTab('experience')}
          >
            <div className="card-icon"><i className="fa-solid fa-briefcase"></i></div>
            <span className="card-label">অভিজ্ঞতা</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'education' ? 'active' : ''}`} 
            onClick={() => setActiveTab('education')}
          >
            <div className="card-icon"><i className="fa-solid fa-graduation-cap"></i></div>
            <span className="card-label">শিক্ষা</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'certifications' ? 'active' : ''}`} 
            onClick={() => setActiveTab('certifications')}
          >
            <div className="card-icon"><i className="fa-solid fa-award"></i></div>
            <span className="card-label">সার্টিফিকেশন</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'social' ? 'active' : ''}`} 
            onClick={() => setActiveTab('social')}
          >
            <div className="card-icon"><i className="fa-solid fa-share-nodes"></i></div>
            <span className="card-label">সোশ্যাল</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'security' ? 'active' : ''}`} 
            onClick={() => setActiveTab('security')}
          >
            <div className="card-icon"><i className="fa-solid fa-shield"></i></div>
            <span className="card-label">নিরাপত্তা</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'notifications' ? 'active' : ''}`} 
            onClick={() => setActiveTab('notifications')}
          >
            <div className="card-icon"><i className="fa-solid fa-bell"></i></div>
            <span className="card-label">নোটিফিকেশন ও সাউন্ড</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'app-device' ? 'active' : ''}`} 
            onClick={() => setActiveTab('app-device')}
          >
            <div className="card-icon"><i className="fa-solid fa-mobile-screen-button"></i></div>
            <span className="card-label">📱 App & Device</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'announcements' ? 'active' : ''}`} 
            onClick={() => setActiveTab('announcements')}
          >
            <div className="card-icon"><i className="fa-solid fa-bullhorn"></i></div>
            <span className="card-label">📢 Announcements</span>
          </button>
          <button 
            className={`settings-card ${activeTab === 'rules' ? 'active' : ''}`} 
            onClick={() => setActiveTab('rules')}
          >
            <div className="card-icon"><i className="fa-solid fa-gavel"></i></div>
            <span className="card-label">📋 নিয়ম</span>
          </button>
        </div>

        <div className="settings-content">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default Settings;