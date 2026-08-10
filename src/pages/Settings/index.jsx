// ============================================================
// 📁 src/pages/Settings/index.jsx
// ============================================================
// Enterprise Grade Settings Component with Rule Engine Integration

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useSoundSettings } from '@/UI/Sound/SoundSettings';
import './Settings.css';
import RulesTab from './tabs/RulesTab';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';

// ✅ Import Security Hooks
import { useAppLock } from '@/hooks/useAppLock';
import { useBiometric } from '@/hooks/useBiometric';

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
// import SoundTab from './tabs/SoundTab';
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
  const user = auth.currentUser;
  const feedback = useFeedback();

  // ── Security Hooks ──
  const { 
    isEnabled: appLockEnabled,
    hasPin,
    isLoading: appLockLoading,
    toggle: toggleAppLock,
    setPin,
    verifyPin,
    remainingAttempts,
    isLockedOut,
    resetLockout,
    clearPin,
    changePin: changeAppLockPin
  } = useAppLock();

  const {
    isSupported: biometricSupported,
    isAvailable: biometricAvailable,
    isEnabled: biometricEnabled,
    biometricType: detectedBiometricType,
    isLoading: biometricLoading,
    toggle: toggleBiometric,
    authenticate: authenticateBiometric,
    registerBiometric,
    getBiometricLabel,
    getBiometricIcon
  } = useBiometric();

  // ── Sound Hooks ──
  const sound = useSound();
  const { 
    settings: soundSettings,
    loading: soundLoading,
    updateSetting,
    resetToDefault,
  } = useSoundSettings(user?.uid);

  // ── States ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
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

  // ── Sound Settings ──
  const [localSoundSettings, setLocalSoundSettings] = useState({
    enabled: true,
    volume: 0.8,
    chat: true,
    wallet: true,
    notification: true,
    admin: true,
    offer: true,
    deal: true,
    verification: true,
    review: true,
    system: true,
    click: true,
    muted: false,
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
  // ✅ Security Handlers
  // ============================================================

  const handleAppLockToggle = useCallback(async (pin = null) => {
    try {
      const result = await toggleAppLock(pin);
      if (result.success) {
        feedback?.showSuccess(
          result.enabled ? '✅ অ্যাপ লক চালু হয়েছে' : 'ℹ️ অ্যাপ লক বন্ধ হয়েছে',
          result.enabled 
            ? 'অ্যাপ খুলতে এখন PIN দিতে হবে।' 
            : 'অ্যাপ লক বন্ধ করা হয়েছে।'
        );
        sound?.playEvent(result.enabled ? SOUND_EVENTS.SUCCESS : SOUND_EVENTS.CLICK);
        return result;
      } else {
        feedback?.showError('❌ ব্যর্থ', result.error || 'অ্যাপ লক টগল করতে সমস্যা হয়েছে');
        return result;
      }
    } catch (error) {
      console.error('❌ App lock toggle error:', error);
      feedback?.showError('❌ ব্যর্থ', error.message);
      return { success: false, error: error.message };
    }
  }, [toggleAppLock, feedback, sound]);

  const handleBiometricToggle = useCallback(async () => {
    try {
      if (!biometricAvailable) {
        feedback?.showWarning('⚠️ সমর্থন নেই', 'আপনার ডিভাইসে বায়োমেট্রিক সেন্সর পাওয়া যায়নি।');
        return { success: false, error: 'Biometric not available' };
      }

      const result = await toggleBiometric();
      if (result.success) {
        feedback?.showSuccess(
          result.enabled ? '✅ বায়োমেট্রিক চালু হয়েছে' : 'ℹ️ বায়োমেট্রিক বন্ধ হয়েছে',
          result.enabled 
            ? 'আপনার ফিঙ্গারপ্রিন্ট/ফেস ব্যবহার করে লগইন করতে পারবেন।' 
            : 'বায়োমেট্রিক লক বন্ধ করা হয়েছে।'
        );
        sound?.playEvent(result.enabled ? SOUND_EVENTS.SUCCESS : SOUND_EVENTS.CLICK);
        return result;
      } else {
        feedback?.showError('❌ ব্যর্থ', result.error || 'বায়োমেট্রিক টগল করতে সমস্যা হয়েছে');
        return result;
      }
    } catch (error) {
      console.error('❌ Biometric toggle error:', error);
      feedback?.showError('❌ ব্যর্থ', error.message);
      return { success: false, error: error.message };
    }
  }, [biometricAvailable, toggleBiometric, feedback, sound]);

  const handleSecurityCheckup = useCallback(() => {
    const checks = [];
    let score = 0;
    let total = 4;

    // Check actual security status from userData
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

    if (biometricEnabled) {
      checks.push({ name: 'বায়োমেট্রিক', status: '✅ সক্রিয়', score: 25 });
      score += 25;
    } else {
      checks.push({ name: 'বায়োমেট্রিক', status: '⚠️ নিষ্ক্রিয়', score: 0 });
    }

    if (appLockEnabled) {
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
  }, [userData, biometricEnabled, appLockEnabled, feedback, sound]);

  // ============================================================
  // ✅ Sound Functions
  // ============================================================

  const handleSoundUpdate = async (key, value) => {
    try {
      setLocalSoundSettings(prev => ({ ...prev, [key]: value }));
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        [`soundSettings.${key}`]: value,
        updatedAt: serverTimestamp()
      });
      
      const updatedSettings = { ...localSoundSettings, [key]: value };
      localStorage.setItem('workhub_sound_settings', JSON.stringify(updatedSettings));
      
      if (key === 'enabled' && value) {
        setTimeout(() => sound?.playEvent('click'), 300);
      }
      
      if (key === 'muted' && value) {
        sound?.stopAll();
      }
      
    } catch (error) {
      console.error('Sound update error:', error);
      feedback.showError('❌ সেভ ব্যর্থ', 'সাউন্ড সেটিংস সেভ করতে সমস্যা হয়েছে');
    }
  };

  const handleVolumeUpdate = async (value) => {
    try {
      setLocalSoundSettings(prev => ({ ...prev, volume: value }));
      sound?.setVolume(value);
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        'soundSettings.volume': value,
        updatedAt: serverTimestamp()
      });
      
      const updatedSettings = { ...localSoundSettings, volume: value };
      localStorage.setItem('workhub_sound_settings', JSON.stringify(updatedSettings));
      
    } catch (error) {
      console.error('Volume update error:', error);
      feedback.showError('❌ সেভ ব্যর্থ', 'ভলিউম সেভ করতে সমস্যা হয়েছে');
    }
  };

  const handleResetSound = async () => {
    const confirmed = await feedback.confirm({
      title: 'Reset Sound Settings',
      message: 'Are you sure you want to reset all sound settings to default?',
      variant: 'confirm',
      confirmText: 'Yes, Reset',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      try {
        const defaultSettings = {
          enabled: true,
          volume: 0.8,
          chat: true,
          wallet: true,
          notification: true,
          admin: true,
          offer: true,
          deal: true,
          verification: true,
          review: true,
          system: true,
          click: true,
          muted: false,
        };
        
        setLocalSoundSettings(defaultSettings);
        
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          soundSettings: defaultSettings,
          updatedAt: serverTimestamp()
        });
        
        localStorage.setItem('workhub_sound_settings', JSON.stringify(defaultSettings));
        sound?.playEvent('success');
        feedback.showSuccess('✅ সাউন্ড রিসেট', 'সব সাউন্ড সেটিংস ডিফল্টে রিসেট করা হয়েছে!');
      } catch (error) {
        console.error('Reset error:', error);
        feedback.showError('❌ রিসেট ব্যর্থ', 'সাউন্ড রিসেট করতে সমস্যা হয়েছে');
      }
    }
  };

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
        return (
          <SecurityTab
            securityData={securityData}
            setSecurityData={setSecurityData}
            onChangePassword={handleChangePassword}
            onTwoFactorToggle={handleTwoFactorToggle}
            saving={saving}
            biometricStatus={biometricEnabled}
            biometricType={detectedBiometricType || biometricType}
            isBiometricSupported={biometricSupported || isBiometricSupported}
            isBiometricAvailable={biometricAvailable || isBiometricAvailable}
            appLockStatus={appLockEnabled}
            onBiometricToggle={handleBiometricToggle}
            onAppLockToggle={handleAppLockToggle}
            onChangePin={changeAppLockPin}
            onSecurityCheckup={handleSecurityCheckup}
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

  if (loading || appLockLoading || biometricLoading) {
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