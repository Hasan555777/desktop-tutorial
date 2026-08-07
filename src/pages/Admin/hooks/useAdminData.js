// src/pages/Admin/hooks/useAdminData.js

import { useState, useCallback, useRef, useMemo  } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  doc, getDoc, getDocs, updateDoc, deleteDoc, 
  collection, query, where, orderBy, limit, 
  serverTimestamp, setDoc, addDoc,
  increment, getCountFromServer, runTransaction    
} from "firebase/firestore";
import { auth, db, functions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';

// ============================================================
// 📌 CONSTANTS
// ============================================================
const MAX_ROWS = Number(import.meta.env.VITE_MAX_ROWS) || 100;
const MAX_NOTIFICATIONS = 50;
const BLOCK_DURATION_HOURS = 24;
const BLOCK_DURATION_SECONDS = 86400;

// ============================================================
// 🎯 CUSTOM HOOK - useAdminData
// ============================================================

export const useAdminData = () => {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const sound = useSound();

  // ── States ──
  const [loading, setLoading] = useState(true);
  const [loadingSections, setLoadingSections] = useState({});
  const [stats, setStats] = useState({
    totalUsers: 0,
    verifiedUsers: 0,
    pendingUsers: 0,
    blockedUsers: 0,
    totalPosts: 0,
    totalDeals: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    pendingWithdrawals: 0,
    pendingPosts: 0
  });
  
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [pendingPosts, setPendingPosts] = useState([]);
  const [pendingEdits, setPendingEdits] = useState([]);
  const [deals, setDeals] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // ── Search States ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  // ── Modal States ──
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);

  // ── Notification States ──
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState('info');
  const [sendingNotification, setSendingNotification] = useState(false);
  const [selectedUsersForNotify, setSelectedUsersForNotify] = useState([]);

  const pendingUsersCount = useMemo(() => {
    return users.filter(user => 
      !user.isVerified && 
      !user.isBanned && 
      !user.isBlocked
    ).length;
  }, [users]);

  // ============================================================
  // 📌 SECTION LOADING HELPER
  // ============================================================

  const setSectionLoading = useCallback((section, isLoading) => {
    setLoadingSections(prev => ({ ...prev, [section]: isLoading }));
  }, []);

  // ============================================================
  // 📌 LOAD FUNCTIONS
  // ============================================================

  const loadUsers = useCallback(async () => {
    setSectionLoading('users', true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const querySnap = await getDocs(q);
      
      const usersList = [];
      querySnap.forEach((doc) => {
        const data = doc.data();
        if (data.role !== 'admin') {
          usersList.push({
            id: doc.id,
            ...data,
            documents: data.documents || {},
            isComplete: data.isComplete || false,
            isVerified: data.isVerified || false,
            isBanned: data.isBanned || false,
            isBlocked: data.isBlocked || data.isBanned || false,
            needsReview: data.needsReview || false,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            lastLogin: data.lastLogin?.toDate?.() || null
          });
        }
      });
      
      setUsers(usersList);
      
      if (import.meta.env.DEV) {
        console.log("📊 Users loaded:", usersList.length);
      }
      
    } catch (error) {
      console.error('Load users error:', error);
      await feedback.showError('❌ ইউজার লোড ব্যর্থ', 'ইউজার লোড করতে সমস্যা হয়েছে');
    } finally {
      setSectionLoading('users', false);
    }
  }, [feedback, setSectionLoading]);

  const loadPosts = useCallback(async () => {
    setSectionLoading('posts', true);
    try {
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef, 
        where('status', '==', 'approved'),
        orderBy('createdAt', 'desc'), 
        limit(MAX_ROWS)
      );
      const querySnap = await getDocs(q);
      
      const postsList = [];
      querySnap.forEach((doc) => {
        postsList.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        });
      });
      
      setPosts(postsList);
      
      if (import.meta.env.DEV) {
        console.log("📊 Posts loaded:", postsList.length);
      }
      
    } catch (error) {
      console.error('Load posts error:', error);
      await feedback.showError('❌ পোস্ট লোড ব্যর্থ', 'পোস্ট লোড করতে সমস্যা হয়েছে');
    } finally {
      setSectionLoading('posts', false);
    }
  }, [feedback, setSectionLoading]);

  const loadPendingPosts = useCallback(async () => {
    setSectionLoading('pendingPosts', true);
    try {
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );
      const querySnap = await getDocs(q);
      
      const pendingList = [];
      querySnap.forEach((doc) => {
        pendingList.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        });
      });
      
      setPendingPosts(pendingList);
      
      if (import.meta.env.DEV) {
        console.log(`📊 Pending posts loaded: ${pendingList.length}`);
      }
      
    } catch (error) {
      console.error('Load pending posts error:', error);
      await feedback.showError('❌ পেন্ডিং পোস্ট লোড ব্যর্থ', 'পেন্ডিং পোস্ট লোড করতে সমস্যা হয়েছে');
    } finally {
      setSectionLoading('pendingPosts', false);
    }
  }, [feedback, setSectionLoading]);

  const loadPendingEdits = useCallback(async () => {
    setSectionLoading('pendingEdits', true);
    try {
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('editStatus', '==', 'pending'),
        orderBy('editSubmittedAt', 'desc')
      );
      const querySnap = await getDocs(q);
      
      const editsList = [];
      querySnap.forEach((doc) => {
        const data = doc.data();
        editsList.push({
          id: doc.id,
          ...data,
          editSubmittedAt: data.editSubmittedAt?.toDate?.() || new Date(),
          pendingChanges: data.pendingChanges || null
        });
      });
      
      setPendingEdits(editsList);
      
      if (import.meta.env.DEV) {
        console.log("📊 Pending edits loaded:", editsList.length);
      }
      
    } catch (error) {
      console.error('Load pending edits error:', error);
      await feedback.showError('❌ লোড ব্যর্থ', 'পেন্ডিং এডিট লোড করতে সমস্যা হয়েছে');
    } finally {
      setSectionLoading('pendingEdits', false);
    }
  }, [feedback, setSectionLoading]);

  const loadDeals = useCallback(async () => {
    setSectionLoading('deals', true);
    try {
      const dealsRef = collection(db, 'deals');
      const q = query(dealsRef, orderBy('createdAt', 'desc'), limit(MAX_ROWS));
      const querySnap = await getDocs(q);
      
      const dealsList = [];
      querySnap.forEach((doc) => {
        dealsList.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        });
      });
      
      setDeals(dealsList);
      
      if (import.meta.env.DEV) {
        console.log("📊 Deals loaded:", dealsList.length);
      }
      
    } catch (error) {
      console.error('Load deals error:', error);
      await feedback.showError('❌ ডিল লোড ব্যর্থ', 'ডিল লোড করতে সমস্যা হয়েছে');
    } finally {
      setSectionLoading('deals', false);
    }
  }, [feedback, setSectionLoading]);

  const loadWithdrawals = useCallback(async () => {
    setSectionLoading('withdrawals', true);
    try {
      const withdrawalsRef = collection(db, 'withdrawals');
      const q = query(withdrawalsRef, orderBy('requestedAt', 'desc'), limit(MAX_ROWS));
      const querySnap = await getDocs(q);
      
      const withdrawalsList = [];
      querySnap.forEach((doc) => {
        withdrawalsList.push({
          id: doc.id,
          ...doc.data(),
          requestedAt: doc.data().requestedAt?.toDate?.() || new Date()
        });
      });
      
      setWithdrawals(withdrawalsList);
      
      if (import.meta.env.DEV) {
        console.log("📊 Withdrawals loaded:", withdrawalsList.length);
      }
      
    } catch (error) {
      console.error('Load withdrawals error:', error);
      await feedback.showError('❌ উইথড্র লোড ব্যর্থ', 'উইথড্র লোড করতে সমস্যা হয়েছে');
    } finally {
      setSectionLoading('withdrawals', false);
    }
  }, [feedback, setSectionLoading]);

  const loadStats = useCallback(async () => {
    setSectionLoading('stats', true);
    try {
      const usersRef = collection(db, 'users');
      const usersSnap = await getCountFromServer(usersRef);
      
      const postsRef = collection(db, 'posts');
      const postsSnap = await getCountFromServer(postsRef);
      
      const dealsRef = collection(db, 'deals');
      const dealsSnap = await getCountFromServer(dealsRef);
      
      const transactionsRef = collection(db, 'transactions');
      const transactionsSnap = await getCountFromServer(transactionsRef);
      
      const withdrawalsRef = collection(db, 'withdrawals');
      const pendingWithdrawalsQuery = query(withdrawalsRef, where('status', '==', 'pending'));
      const pendingWithdrawalsSnap = await getCountFromServer(pendingWithdrawalsQuery);
      
      const verifiedQuery = query(usersRef, where('isVerified', '==', true));
      const verifiedSnap = await getCountFromServer(verifiedQuery);
      
      const blockedQuery = query(usersRef, where('isBanned', '==', true));
      const blockedSnap = await getCountFromServer(blockedQuery);
      
      const pendingPostsQuery = query(postsRef, where('status', '==', 'pending'));
      const pendingPostsSnap = await getCountFromServer(pendingPostsQuery);
      
      const totalUsers = usersSnap.data().count;
      const verifiedUsers = verifiedSnap.data().count;
      const blockedUsers = blockedSnap.data().count;
      
      setStats({
        totalUsers: totalUsers,
        verifiedUsers: verifiedUsers,
        pendingUsers: totalUsers - verifiedUsers - blockedUsers,
        blockedUsers: blockedUsers,
        totalPosts: postsSnap.data().count,
        totalDeals: dealsSnap.data().count,
        totalTransactions: transactionsSnap.data().count,
        totalRevenue: 125000,
        pendingWithdrawals: pendingWithdrawalsSnap.data().count,
        pendingPosts: pendingPostsSnap.data().count
      });
      
      if (import.meta.env.DEV) {
        console.log("📊 Stats loaded");
      }
      
    } catch (error) {
      console.error('Load stats error:', error);
      await feedback.showError('❌ স্ট্যাট লোড ব্যর্থ', 'স্ট্যাট লোড করতে সমস্যা হয়েছে');
    } finally {
      setSectionLoading('stats', false);
    }
  }, [feedback, setSectionLoading]);

  const loadNotifications = useCallback(async () => {
    setSectionLoading('notifications', true);
    try {
      const notifRef = collection(db, 'admin_notifications');
      const q = query(notifRef, orderBy('createdAt', 'desc'), limit(MAX_NOTIFICATIONS));
      const querySnap = await getDocs(q);
      
      const notifList = [];
      querySnap.forEach((doc) => {
        notifList.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        });
      });
      
      setNotifications(notifList);
      
      if (import.meta.env.DEV) {
        console.log("📊 Notifications loaded:", notifList.length);
      }
      
    } catch (error) {
      console.error('Load notifications error:', error);
      await feedback.showError('❌ নোটিফিকেশন লোড ব্যর্থ', 'নোটিফিকেশন লোড করতে সমস্যা হয়েছে');
    } finally {
      setSectionLoading('notifications', false);
    }
  }, [feedback, setSectionLoading]);

  const loadPendingDeposits = useCallback(async () => {
    setDepositsLoading(true);
    try {
      const q = query(
        collection(db, 'transactions'),
        where('status', '==', 'pending'),
        where('type', 'in', ['deposit', 'bank-transfer']),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      
      if (import.meta.env.DEV) {
        console.log('📊 Pending deposits query result:', snapshot.size);
      }
      
      const deposits = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (import.meta.env.DEV) {
          console.log('📄 Deposit doc:', doc.id, data.type, data.method);
        }
        deposits.push({ 
          id: doc.id, 
          ...data,
          method: data.method || (data.type === 'bank-transfer' ? 'Bank Transfer' : 'Unknown'),
          bankDetails: data.bankDetails || null,
          receiptUrl: data.receiptUrl || null,
          receiptFileName: data.receiptFileName || null,
        });
      });
      
      setPendingDeposits(deposits);
      
    } catch (error) {
      console.error('❌ Error loading pending deposits:', error);
      await feedback.showError('❌ পেন্ডিং ডিপোজিট লোড ব্যর্থ', 'পেন্ডিং ডিপোজিট লোড করতে সমস্যা হয়েছে');
    } finally {
      setDepositsLoading(false);
    }
  }, [feedback]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const q = query(
        collection(db, 'reports'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const reportsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReports(reportsData);
      
      if (import.meta.env.DEV) {
        console.log("📊 Reports loaded:", reportsData.length);
      }
      
    } catch (error) {
      console.error('Error loading reports:', error);
      await feedback.showError('❌ রিপোর্ট লোড ব্যর্থ', 'রিপোর্ট লোড করতে সমস্যা হয়েছে');
    } finally {
      setReportsLoading(false);
    }
  }, [feedback]);

  // ============================================================
  // 📌 LOAD ALL DEPOSITS (Pending + History)
  // ============================================================

  const loadAllDeposits = useCallback(async () => {
    setDepositsLoading(true);
    try {
      const q = query(
        collection(db, 'transactions'),
        where('type', 'in', ['deposit', 'bank-transfer']),
        orderBy('createdAt', 'desc'),
        limit(200)
      );
      
      const snapshot = await getDocs(q);
      const depositsList = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        depositsList.push({
          id: doc.id,
          ...data,
          method: data.method || (data.type === 'bank-transfer' ? 'Bank Transfer' : 'Unknown'),
          bankDetails: data.bankDetails || null,
          receiptUrl: data.receiptUrl || null,
          receiptFileName: data.receiptFileName || null,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        });
      });
      
      setDeposits(depositsList);
      
      const pending = depositsList.filter(d => d.status === 'pending' || !d.status);
      setPendingDeposits(pending);
      
      if (import.meta.env.DEV) {
        console.log(`📊 All deposits loaded: ${depositsList.length} (pending: ${pending.length})`);
      }
      
    } catch (error) {
      console.error('❌ Error loading deposits:', error);
      await feedback.showError('❌ ডিপোজিট লোড ব্যর্থ', 'ডিপোজিট লোড করতে সমস্যা হয়েছে');
    } finally {
      setDepositsLoading(false);
    }
  }, [feedback]);

  // ============================================================
  // 📌 LOAD ALL DATA
  // ============================================================

  const loadAllData = useCallback(async () => {
    setLoading(true);
    const errors = [];
    
    try {
      const loadFunctions = [
        { name: 'Users', fn: loadUsers },
        { name: 'Posts', fn: loadPosts },
        { name: 'Pending Posts', fn: loadPendingPosts },
        { name: 'Deals', fn: loadDeals },
        { name: 'Withdrawals', fn: loadWithdrawals },
        { name: 'Stats', fn: loadStats },
        { name: 'Notifications', fn: loadNotifications },
        { name: 'All Deposits', fn: loadAllDeposits },
        { name: 'Pending Deposits', fn: loadPendingDeposits },
        { name: 'Reports', fn: loadReports },
        { name: 'Pending Edits', fn: loadPendingEdits }
      ];
      
      await Promise.allSettled(
        loadFunctions.map(async ({ name, fn }) => {
          try {
            await fn();
          } catch (error) {
            errors.push(`${name}: ${error.message}`);
            console.error(`Failed to load ${name}:`, error);
          }
        })
      );
      
      if (errors.length > 0) {
        console.warn('⚠️ Some sections failed to load:', errors);
        await feedback.showWarning('⚠️ আংশিক লোড', `${errors.length} টি বিভাগ লোড করতে সমস্যা হয়েছে`);
      }
      
    } catch (error) {
      console.error("Error loading data:", error);
      await feedback.showError('❌ ডেটা লোড ব্যর্থ', 'ডেটা লোড করতে সমস্যা হয়েছে: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [loadUsers, loadPosts, loadPendingPosts, loadDeals, loadWithdrawals, loadStats, loadNotifications, loadAllDeposits, loadPendingDeposits, loadReports, loadPendingEdits, feedback]);

  const reloadAllData = useCallback(async () => {
    try {
      await Promise.all([
        loadUsers(),
        loadPosts(),
        loadPendingPosts(),
        loadDeals(),
        loadWithdrawals(),
        loadStats(),
        loadNotifications(),
        loadAllDeposits(),
        loadPendingDeposits(),
        loadReports(),
        loadPendingEdits()
      ]);
    } catch (error) {
      console.error("Reload error:", error);
    }
  }, [loadUsers, loadPosts, loadPendingPosts, loadDeals, loadWithdrawals, loadStats, loadNotifications, loadAllDeposits, loadPendingDeposits, loadReports, loadPendingEdits]);

  // ============================================================
  // 📌 USER OPERATIONS
  // ============================================================

  const createUserNotification = useCallback(async (userId, message, type = 'info') => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: userId,
        message: message,
        type: type,
        isUnread: true,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }, []);

  const verifyUser = useCallback(async (userId, verified = true) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isVerified: verified,
        isComplete: verified,
        verifiedAt: serverTimestamp(),
        verifiedBy: auth.currentUser?.uid || 'admin',
        verificationStatus: verified ? 'verified' : 'rejected',
        documentsUploaded: true,
        documentVerified: verified
      });
      
      setUsers(prev => prev.map(user => 
        user.id === userId ? { 
          ...user, 
          isVerified: verified, 
          isComplete: verified,
          verificationStatus: verified ? 'verified' : 'rejected',
          documentVerified: verified
        } : user
      ));
      
      await createUserNotification(
        userId,
        verified ? '✅ আপনার অ্যাকাউন্ট যাচাই সম্পন্ন হয়েছে!' : '❌ আপনার অ্যাকাউন্ট যাচাই প্রত্যাখ্যান করা হয়েছে।',
        verified ? 'success' : 'error'
      );
      
      if (verified) {
        await feedback.showSuccess('✅ যাচাই সম্পন্ন', 'ইউজার সফলভাবে যাচাই করা হয়েছে।');
      } else {
        await feedback.showWarning('❌ যাচাই প্রত্যাখ্যান', 'ইউজারের যাচাই বাতিল করা হয়েছে।');
      }
      
      await reloadAllData();
      
    } catch (error) {
      console.error('Verify user error:', error);
      await feedback.showError('❌ যাচাই ব্যর্থ', 'যাচাই করতে সমস্যা হয়েছে: ' + error.message);
    }
  }, [feedback, reloadAllData, createUserNotification]);

  // ============================================================
  // 📌 VERIFICATION REVIEW (KYC)
  // ============================================================

  const saveVerificationReview = useCallback(async (userId, faceReview, documentReview) => {
    try {
      const allStatuses = [
        faceReview.status,
        documentReview.nidFront.status,
        documentReview.nidBack.status,
        documentReview.birthCert.status
      ];

      let verificationStatus = 'pending';
      
      if (allStatuses.every(s => s === 'approved')) {
        verificationStatus = 'verified';
      } else if (allStatuses.some(s => s === 'rejected')) {
        verificationStatus = 'rejected';
      } else {
        verificationStatus = 'pending';
      }

      const isApproved = verificationStatus === 'verified';

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await feedback.showError('❌ ত্রুটি', 'ইউজার পাওয়া যায়নি');
        return;
      }

      const currentData = userSnap.data();
      const currentDocuments = currentData.documents || {};

      const updatedDocuments = {
        nidFront: {
          url: currentDocuments.nidFront?.url || '',
          status: documentReview.nidFront.status,
          rejectReason: documentReview.nidFront.reason || ''
        },
        nidBack: {
          url: currentDocuments.nidBack?.url || '',
          status: documentReview.nidBack.status,
          rejectReason: documentReview.nidBack.reason || ''
        },
        birthCert: {
          url: currentDocuments.birthCert?.url || '',
          status: documentReview.birthCert.status,
          rejectReason: documentReview.birthCert.reason || ''
        }
      };

      await updateDoc(userRef, {
        faceStatus: faceReview.status,
        faceRejectReason: faceReview.reason || '',
        faceVerified: faceReview.status === 'approved',
        documents: updatedDocuments,
        documentVerified: isApproved,
        verificationStatus: verificationStatus,
        isVerified: isApproved,
        isComplete: isApproved,
        needsReview: false,
        reviewedBy: auth.currentUser?.uid || 'admin',
        reviewedByEmail: auth.currentUser?.email || 'admin',
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setUsers(prev => prev.map(user => 
        user.id === userId ? {
          ...user,
          faceStatus: faceReview.status,
          faceRejectReason: faceReview.reason || '',
          faceVerified: faceReview.status === 'approved',
          documents: updatedDocuments,
          documentVerified: isApproved,
          verificationStatus: verificationStatus,
          isVerified: isApproved,
          isComplete: isApproved,
          reviewedBy: auth.currentUser?.uid || 'admin',
          reviewedAt: new Date().toISOString()
        } : user
      ));

      if (verificationStatus === 'verified') {
        await createUserNotification(
          userId,
          '✅ আপনার KYC যাচাই সম্পন্ন হয়েছে! আপনার অ্যাকাউন্ট এখন সম্পূর্ণ সক্রিয়।',
          'success'
        );
        await feedback.showSuccess('✅ KYC অনুমোদিত', 'ইউজারের KYC সফলভাবে অনুমোদন করা হয়েছে!');
      } else if (verificationStatus === 'rejected') {
        const reasons = [];
        if (faceReview.status === 'rejected') reasons.push(`Face: ${faceReview.reason || 'No reason provided'}`);
        if (documentReview.nidFront.status === 'rejected') reasons.push(`NID Front: ${documentReview.nidFront.reason || 'No reason provided'}`);
        if (documentReview.nidBack.status === 'rejected') reasons.push(`NID Back: ${documentReview.nidBack.reason || 'No reason provided'}`);
        if (documentReview.birthCert.status === 'rejected') reasons.push(`Birth Certificate: ${documentReview.birthCert.reason || 'No reason provided'}`);
        
        const reasonText = reasons.join('\n');
        
        await createUserNotification(
          userId,
          `❌ আপনার KYC প্রত্যাখ্যান করা হয়েছে।\n\nকারণ:\n${reasonText}\n\nঅনুগ্রহ করে সংশোধন করে পুনরায় আপলোড করুন।`,
          'error'
        );
        await feedback.showWarning('❌ KYC প্রত্যাখ্যান', 'ইউজারের KYC প্রত্যাখ্যান করা হয়েছে!');
      } else {
        await createUserNotification(
          userId,
          '⏳ আপনার KYC পর্যালোচনা চলমান রয়েছে। কিছু আইটেম এখনও যাচাই হয়নি।',
          'info'
        );
        await feedback.showInfo('⏳ KYC আংশিক', 'কিছু আইটেম এখনও যাচাই হয়নি।');
      }

      await reloadAllData();

    } catch (error) {
      console.error('Save verification review error:', error);
      await feedback.showError('❌ সংরক্ষণ ব্যর্থ', 'KYC রিভিউ সংরক্ষণ করতে সমস্যা হয়েছে: ' + error.message);
    }
  }, [feedback, reloadAllData, createUserNotification]);

  const toggleBlockUser = useCallback(async (userId, block = true) => {
    try {
      const blockData = block ? {
        isBanned: true,
        isBlocked: true,
        bannedAt: serverTimestamp(),
        bannedBy: auth.currentUser?.uid || 'admin',
        banReason: 'অ্যাডমিন দ্বারা ব্লক করা হয়েছে',
        blockExpiry: new Date(Date.now() + BLOCK_DURATION_HOURS * 60 * 60 * 1000).toISOString(),
        blockCountdown: BLOCK_DURATION_SECONDS
      } : {
        isBanned: false,
        isBlocked: false,
        bannedAt: null,
        bannedBy: null,
        banReason: null,
        blockExpiry: null,
        blockCountdown: null
      };
      
      await updateDoc(doc(db, 'users', userId), blockData);
      
      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, isBanned: block, isBlocked: block } : user
      ));
      
      await createUserNotification(
        userId,
        block ? '🚫 আপনার অ্যাকাউন্ট ব্লক করা হয়েছে।' : '✅ আপনার অ্যাকাউন্ট আনব্লক করা হয়েছে।',
        block ? 'error' : 'success'
      );
      
      if (block) {
        await feedback.showWarning('🚫 ইউজার ব্লক', 'ইউজারকে ব্লক করা হয়েছে।');
      } else {
        await feedback.showSuccess('✅ ইউজার আনব্লক', 'ইউজারকে আনব্লক করা হয়েছে।');
      }
      
      await reloadAllData();
      
    } catch (error) {
      console.error('Toggle block error:', error);
      await feedback.showError('❌ অপারেশন ব্যর্থ', 'ব্লক/আনব্লক করতে সমস্যা হয়েছে: ' + error.message);
    }
  }, [feedback, reloadAllData, createUserNotification]);

  const deleteUser = useCallback(async (userId) => {
    const confirmed = await feedback.confirm({
      title: '⚠️ ইউজার ডিলিট',
      message: 'আপনি কি এই ইউজারকে স্থায়ীভাবে ডিলিট করতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না!',
      variant: 'delete',
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const deleteUserCallable = httpsCallable(functions, 'adminDeleteUser');
      const result = await deleteUserCallable({ userId });

      if (!result?.data?.success) {
        throw new Error(result?.data?.message || 'ডিলিট ব্যর্থ হয়েছে');
      }

      setUsers(prev => prev.filter(user => user.id !== userId));

      await feedback.showSuccess('🗑️ ইউজার ডিলিট', 'ইউজার সম্পূর্ণ ডিলিট করা হয়েছে! (Auth + Firestore)');
      await reloadAllData();

    } catch (error) {
      console.error('Delete user error:', error);
      await feedback.showError('❌ ডিলিট ব্যর্থ', 'ডিলিট করতে সমস্যা হয়েছে: ' + (error?.message || 'অজানা ত্রুটি'));
    }
  }, [feedback, reloadAllData]);

  // ============================================================
  // 📌 POST OPERATIONS
  // ============================================================

  const handleDeletePost = useCallback(async (postId) => {
    const confirmed = await feedback.confirm({
      title: '⚠️ পোস্ট ডিলিট',
      message: 'আপনি কি এই পোস্ট ডিলিট করতে চান?',
      variant: 'delete',
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'বাতিল করুন'
    });
    
    if (!confirmed) return;
    
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setPosts(prev => prev.filter(p => p.id !== postId));
      await feedback.showSuccess('✅ পোস্ট ডিলিট', 'পোস্ট সফলভাবে ডিলিট করা হয়েছে!');
      await reloadAllData();
    } catch (error) {
      console.error("Delete post error:", error);
      await feedback.showError('❌ ডিলিট ব্যর্থ', 'পোস্ট ডিলিট করতে সমস্যা হয়েছে');
    }
  }, [feedback, reloadAllData]);

  // ============================================================
  // 📌 DEPOSIT OPERATIONS
  // ============================================================

  const handleApproveDeposit = useCallback(async (transactionId, userId, amount) => {
    const confirmed = await feedback.confirm({
      title: '✅ ডিপোজিট অ্যাপ্রুভ',
      message: `৳${amount} ডিপোজিট অ্যাপ্রুভ করবেন?`,
      variant: 'confirm',
      confirmText: 'হ্যাঁ, অ্যাপ্রুভ করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const txRef = doc(db, 'transactions', transactionId);
      const walletRef = doc(db, 'wallets', userId);

      const txSnap = await getDoc(txRef);
      if (!txSnap.exists()) {
        await feedback.showError('❌ ত্রুটি', 'ট্রানজাকশন পাওয়া যায়নি!');
        return;
      }
      
      const txData = txSnap.data();
      const isBankTransfer = txData.type === 'bank-transfer' || txData.method === 'Bank Transfer';

      await runTransaction(db, async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        if (!walletDoc.exists()) {
          throw new Error('Wallet not found!');
        }

        const currentBalance = walletDoc.data().balance || 0;

        transaction.update(walletRef, {
          balance: currentBalance + Number(amount),
          totalEarned: increment(Number(amount)),
          updatedAt: serverTimestamp()
        });

        const updateData = {
          status: 'completed',
          verifiedAt: serverTimestamp(),
          verifiedBy: auth.currentUser?.uid || 'admin'
        };
        
        if (isBankTransfer && txData.receiptUrl) {
          updateData.receiptVerified = true;
          updateData.receiptVerifiedAt = serverTimestamp();
        }
        
        transaction.update(txRef, updateData);

        const notifRef = doc(collection(db, 'notifications'));
        transaction.set(notifRef, {
          userId: userId,
          type: isBankTransfer ? 'bank_transfer_success' : 'deposit_success',
          title: isBankTransfer ? '✅ Bank Transfer Approved' : '✅ Deposit Approved',
          message: isBankTransfer 
            ? `৳${amount} Bank Transfer has been added to your wallet.`
            : `৳${amount} has been added to your wallet.`,
          isUnread: true,
          createdAt: serverTimestamp()
        });
      });

      const successMsg = isBankTransfer 
        ? `৳${amount} Bank Transfer সফলভাবে অ্যাপ্রুভ করা হয়েছে!`
        : `৳${amount} ডিপোজিট সফলভাবে অ্যাপ্রুভ করা হয়েছে!`;
      
      await feedback.showSuccess('✅ অ্যাপ্রুভ সম্পন্ন', successMsg);
      await reloadAllData();

    } catch (error) {
      console.error('Approve error:', error);
      await feedback.showError('❌ অ্যাপ্রুভ ব্যর্থ', 'অ্যাপ্রুভ করতে সমস্যা হয়েছে: ' + error.message);
    }
  }, [feedback, reloadAllData]);

  const handleRejectDeposit = useCallback(async (transactionId, userId, amount) => {
    const confirmed = await feedback.confirm({
      title: '❌ ডিপোজিট রিজেক্ট',
      message: `৳${amount} ডিপোজিট রিজেক্ট করবেন?`,
      variant: 'delete',
      confirmText: 'হ্যাঁ, রিজেক্ট করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const txRef = doc(db, 'transactions', transactionId);

      await updateDoc(txRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: auth.currentUser?.uid || 'admin',
        rejectionReason: 'Rejected by admin'
      });

      await addDoc(collection(db, 'notifications'), {
        userId: userId,
        type: 'deposit_rejected',
        title: '❌ Deposit Rejected',
        message: `Your ৳${amount} deposit request was rejected.`,
        isUnread: true,
        createdAt: serverTimestamp()
      });

      await feedback.showWarning('❌ ডিপোজিট রিজেক্ট', `৳${amount} ডিপোজিট রিজেক্ট করা হয়েছে!`);
      await reloadAllData();

    } catch (error) {
      console.error('Reject error:', error);
      await feedback.showError('❌ রিজেক্ট ব্যর্থ', 'রিজেক্ট করতে সমস্যা হয়েছে');
    }
  }, [feedback, reloadAllData]);

  // ============================================================
  // 📌 WITHDRAWAL OPERATIONS
  // ============================================================

  const handleApproveWithdrawal = useCallback(async (withdrawalId, userId, amount) => {
    const confirmed = await feedback.confirm({
      title: '✅ উইথড্র অ্যাপ্রুভ',
      message: `৳${amount} উইথড্র অ্যাপ্রুভ করবেন?`,
      variant: 'confirm',
      confirmText: 'হ্যাঁ, অ্যাপ্রুভ করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
      
      await updateDoc(withdrawalRef, { 
        status: 'processing',
        processedAt: serverTimestamp(),
        processedBy: auth.currentUser?.uid || 'admin'
      });
      
      setWithdrawals(prev => prev.map(w => 
        w.id === withdrawalId ? { ...w, status: 'processing' } : w
      ));
      
      await createUserNotification(
        userId,
        `💳 আপনার ৳${amount} উইথড্র অনুমোদন করা হয়েছে এবং প্রক্রিয়াধীন।`,
        'info'
      );
      
      await feedback.showSuccess('✅ উইথড্র অ্যাপ্রুভ', `৳${amount} উইথড্র অনুমোদন করা হয়েছে!`);
      await reloadAllData();
      
    } catch (error) {
      console.error("Approve withdrawal error:", error);
      await feedback.showError('❌ অ্যাপ্রুভ ব্যর্থ', 'উইথড্র অনুমোদন করতে সমস্যা হয়েছে');
    }
  }, [feedback, reloadAllData, createUserNotification]);

  const handleCompleteWithdrawal = useCallback(async (withdrawalId, userId, amount) => {
    const confirmed = await feedback.confirm({
      title: '✅ উইথড্র সম্পন্ন',
      message: `৳${amount} উইথড্র সম্পন্ন করবেন?`,
      variant: 'confirm',
      confirmText: 'হ্যাঁ, সম্পন্ন করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
      
      await updateDoc(withdrawalRef, { 
        status: 'completed',
        completedAt: serverTimestamp(),
        completedBy: auth.currentUser?.uid || 'admin'
      });
      
      const walletRef = doc(db, 'wallets', userId);
      const walletSnap = await getDoc(walletRef);
      if (walletSnap.exists()) {
        const currentPending = walletSnap.data().pendingWithdraw || 0;
        await updateDoc(walletRef, {
          pendingWithdraw: currentPending - Number(amount),
          totalWithdrawn: (walletSnap.data().totalWithdrawn || 0) + Number(amount),
          updatedAt: serverTimestamp()
        });
      }
      
      const txQuery = query(
        collection(db, 'transactions'),
        where('reference', '==', withdrawalId),
        where('type', '==', 'withdraw')
      );
      const txSnap = await getDocs(txQuery);
      if (!txSnap.empty) {
        const txDoc = txSnap.docs[0];
        await updateDoc(txDoc.ref, {
          status: 'completed',
          completedAt: serverTimestamp()
        });
      }
      
      setWithdrawals(prev => prev.map(w => 
        w.id === withdrawalId ? { ...w, status: 'completed' } : w
      ));
      
      await createUserNotification(
        userId,
        `✅ আপনার ৳${amount} উইথড্র সম্পন্ন হয়েছে।`,
        'success'
      );
      
      await feedback.showSuccess('✅ উইথড্র সম্পন্ন', `৳${amount} উইথড্র সম্পন্ন!`);
      await reloadAllData();
      
    } catch (error) {
      console.error("Complete withdrawal error:", error);
      await feedback.showError('❌ সম্পন্ন ব্যর্থ', 'উইথড্র সম্পন্ন করতে সমস্যা হয়েছে');
    }
  }, [feedback, reloadAllData, createUserNotification]);

  const handleRejectWithdrawal = useCallback(async (withdrawalId, userId, amount) => {
    const confirmed = await feedback.confirm({
      title: '❌ উইথড্র রিজেক্ট',
      message: `৳${amount} উইথড্র প্রত্যাখ্যান করবেন?`,
      variant: 'delete',
      confirmText: 'হ্যাঁ, রিজেক্ট করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
      
      await updateDoc(withdrawalRef, { 
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: auth.currentUser?.uid || 'admin'
      });
      
      const walletRef = doc(db, 'wallets', userId);
      const walletSnap = await getDoc(walletRef);
      if (walletSnap.exists()) {
        const currentPending = walletSnap.data().pendingWithdraw || 0;
        const currentBalance = walletSnap.data().balance || 0;
        await updateDoc(walletRef, {
          balance: currentBalance + Number(amount),
          pendingWithdraw: currentPending - Number(amount),
          updatedAt: serverTimestamp()
        });
      }
      
      const txQuery = query(
        collection(db, 'transactions'),
        where('reference', '==', withdrawalId),
        where('type', '==', 'withdraw')
      );
      const txSnap = await getDocs(txQuery);
      if (!txSnap.empty) {
        const txDoc = txSnap.docs[0];
        await updateDoc(txDoc.ref, {
          status: 'rejected',
          rejectedAt: serverTimestamp()
        });
      }
      
      setWithdrawals(prev => prev.map(w => 
        w.id === withdrawalId ? { ...w, status: 'rejected' } : w
      ));
      
      await createUserNotification(
        userId,
        `❌ আপনার ৳${amount} উইথড্র প্রত্যাখ্যান করা হয়েছে।`,
        'error'
      );
      
      await feedback.showWarning('❌ উইথড্র রিজেক্ট', `৳${amount} উইথড্র প্রত্যাখ্যান করা হয়েছে!`);
      await reloadAllData();
      
    } catch (error) {
      console.error("Reject withdrawal error:", error);
      await feedback.showError('❌ রিজেক্ট ব্যর্থ', 'উইথড্র প্রত্যাখ্যান করতে সমস্যা হয়েছে');
    }
  }, [feedback, reloadAllData, createUserNotification]);

  // ============================================================
  // 📌 BULK NOTIFICATION
  // ============================================================

  const sendBulkNotification = useCallback(async () => {
    if (!notificationMessage.trim()) {
      await feedback.showWarning('❌ মেসেজ খালি', 'দয়া করে একটি মেসেজ লিখুন!');
      return;
    }
    
    setSendingNotification(true);
    
    try {
      const targetUsers = selectedUsersForNotify.length > 0 
        ? selectedUsersForNotify 
        : users.map(u => u.id);
      
      await Promise.all(
        targetUsers.map(userId =>
          createUserNotification(userId, notificationMessage, notificationType)
        )
      );
      
      await addDoc(collection(db, 'admin_notifications'), {
        message: notificationMessage,
        type: notificationType,
        recipients: targetUsers,
        recipientCount: targetUsers.length,
        sentBy: auth.currentUser?.uid || 'admin',
        sentByEmail: auth.currentUser?.email || 'admin',
        createdAt: serverTimestamp()
      });
      
      await feedback.showSuccess(
        '✅ নোটিফিকেশন পাঠানো হয়েছে',
        `${targetUsers.length} জন ইউজারকে নোটিফিকেশন পাঠানো হয়েছে!`
      );
      
      setNotificationMessage('');
      setSelectedUsersForNotify([]);
      await reloadAllData();
      
    } catch (error) {
      console.error('Send notification error:', error);
      await feedback.showError('❌ পাঠাতে ব্যর্থ', 'নোটিফিকেশন পাঠাতে সমস্যা হয়েছে');
    } finally {
      setSendingNotification(false);
    }
  }, [notificationMessage, notificationType, selectedUsersForNotify, users, feedback, reloadAllData, createUserNotification]);

  // ============================================================
  // 📌 REPORT OPERATIONS
  // ============================================================

  const updateReportStatus = useCallback(async (reportId, status) => {
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status: status,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || 'admin'
      });
      
      setReports(prev => prev.map(r => 
        r.id === reportId ? { ...r, status: status } : r
      ));
      
      await feedback.showSuccess('✅ সফল', 'রিপোর্ট স্ট্যাটাস আপডেট করা হয়েছে!');
      await reloadAllData();
    } catch (error) {
      console.error('Update report error:', error);
      await feedback.showError('❌ ব্যর্থ', 'স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে');
    }
  }, [feedback, reloadAllData]);

  // ============================================================
  // 📌 ADMIN NOTIFICATION
  // ============================================================

  const sendAdminNotification = useCallback(async (title, message, type = 'admin_notification') => {
    try {
      const adminId = auth.currentUser?.uid;
      if (!adminId) {
        feedback.showError('❌ এরর', 'অ্যাডমিন ইউজার পাওয়া যায়নি');
        return;
      }

      await addDoc(collection(db, 'admin_notifications'), {
        title: title,
        message: message,
        type: type,
        event: type,
        icon: 'fa-solid fa-bell',
        colorClass: 'noti-system',
        isRead: false,
        createdAt: serverTimestamp(),
        sentBy: adminId,
        sentByEmail: auth.currentUser?.email,
      });

      sound?.playEvent(SOUND_EVENTS.ADMIN_NOTIFICATION);
      
      feedback.showSuccess('✅ সফল', 'অ্যাডমিন নোটিফিকেশন পাঠানো হয়েছে!');
      
    } catch (error) {
      console.error('Error sending admin notification:', error);
      feedback.showError('❌ ব্যর্থ', 'নোটিফিকেশন পাঠাতে সমস্যা হয়েছে');
    }
  }, [feedback, sound]);

  // ============================================================
  // 📌 PENDING POST OPERATIONS
  // ============================================================

  const handleApproveEdit = useCallback(async (postId) => {
    const confirmed = await feedback.confirm({
      title: '✅ Edit Approve',
      message: 'আপনি কি এই পোস্টের এডিট অ্যাপ্রুভ করতে চান?',
      variant: 'confirm',
      confirmText: 'হ্যাঁ, অ্যাপ্রুভ করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      const postData = postSnap.data();

      if (!postData.pendingChanges) {
        await feedback.showError('❌ ত্রুটি', 'কোন পেন্ডিং চেঞ্জেস পাওয়া যায়নি!');
        return;
      }

      await updateDoc(postRef, {
        ...postData.pendingChanges,
        editStatus: 'approved',
        editApprovedAt: serverTimestamp(),
        editApprovedBy: auth.currentUser?.uid || 'admin',
        pendingChanges: null,
        updatedAt: serverTimestamp()
      });

      await createUserNotification(
        postData.userId,
        `✅ আপনার পোস্টের এডিট অনুমোদন করা হয়েছে! "${postData.pendingChanges.title}"`,
        'success'
      );

      setPendingEdits(prev => prev.filter(p => p.id !== postId));

      await feedback.showSuccess('✅ Edit Approved', 'পোস্টের এডিট সফলভাবে অ্যাপ্রুভ করা হয়েছে!');
      await reloadAllData();

      await sendAdminNotification(
        '📝 Edit Approved',
        `পোস্ট "${postData.pendingChanges.title}" এর এডিট অ্যাপ্রুভ করা হয়েছে।`,
        'post_approved'
      );

    } catch (error) {
      console.error('Approve edit error:', error);
      await feedback.showError('❌ অ্যাপ্রুভ ব্যর্থ', 'এডিট অ্যাপ্রুভ করতে সমস্যা হয়েছে: ' + error.message);
    }
  }, [feedback, reloadAllData, sendAdminNotification, createUserNotification]);

  const handleApprovePost = useCallback(async (postId) => {
    const confirmed = await feedback.confirm({
      title: '✅ পোস্ট অ্যাপ্রুভ',
      message: 'আপনি কি এই পোস্টটি অ্যাপ্রুভ করতে চান?',
      variant: 'confirm',
      confirmText: 'হ্যাঁ, অ্যাপ্রুভ করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser?.uid || 'admin'
      });

      const post = pendingPosts.find(p => p.id === postId);
      if (post?.userId) {
        await createUserNotification(
          post.userId,
          '✅ আপনার পোস্টটি অ্যাপ্রুভ করা হয়েছে! এটি এখন হোম পেজে দেখা যাবে।',
          'success'
        );
      }

      setPendingPosts(prev => prev.filter(p => p.id !== postId));
      setStats(prev => ({
        ...prev,
        pendingPosts: prev.pendingPosts - 1
      }));

      await feedback.showSuccess('✅ পোস্ট অ্যাপ্রুভ', 'পোস্টটি সফলভাবে অ্যাপ্রুভ করা হয়েছে!');
      await reloadAllData();

      await sendAdminNotification(
        '✅ Post Approved',
        `"${post?.title || 'A post'}" অ্যাপ্রুভ করা হয়েছে।`,
        'post_approved'
      );

    } catch (error) {
      console.error('Approve post error:', error);
      await feedback.showError('❌ অ্যাপ্রুভ ব্যর্থ', 'পোস্ট অ্যাপ্রুভ করতে সমস্যা হয়েছে: ' + error.message);
    }
  }, [feedback, pendingPosts, reloadAllData, sendAdminNotification, createUserNotification]);

  const handleRejectEdit = useCallback(async (postId, reason = '') => {
    const confirmed = await feedback.confirm({
      title: '❌ Edit Reject',
      message: 'আপনি কি এই পোস্টের এডিট রিজেক্ট করতে চান?',
      variant: 'delete',
      confirmText: 'হ্যাঁ, রিজেক্ট করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);
      const postData = postSnap.data();

      await updateDoc(postRef, {
        editStatus: 'rejected',
        editRejectedAt: serverTimestamp(),
        editRejectedBy: auth.currentUser?.uid || 'admin',
        editRejectReason: reason || 'Edit rejected by admin',
        pendingChanges: null,
        updatedAt: serverTimestamp()
      });

      await createUserNotification(
        postData.userId,
        `❌ আপনার পোস্টের এডিট প্রত্যাখ্যান করা হয়েছে।\nকারণ: ${reason || 'No reason provided'}`,
        'error'
      );

      setPendingEdits(prev => prev.filter(p => p.id !== postId));

      await feedback.showWarning('❌ Edit Rejected', 'পোস্টের এডিট রিজেক্ট করা হয়েছে!');
      await reloadAllData();

    } catch (error) {
      console.error('Reject edit error:', error);
      await feedback.showError('❌ রিজেক্ট ব্যর্থ', 'এডিট রিজেক্ট করতে সমস্যা হয়েছে: ' + error.message);
    }
  }, [feedback, reloadAllData, createUserNotification]);

  const handleRejectPost = useCallback(async (postId, reason = '') => {
    const confirmed = await feedback.confirm({
      title: '❌ পোস্ট রিজেক্ট',
      message: 'আপনি কি এই পোস্টটি রিজেক্ট করতে চান?',
      variant: 'delete',
      confirmText: 'হ্যাঁ, রিজেক্ট করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: auth.currentUser?.uid || 'admin',
        rejectReason: reason || 'Admin rejected the post'
      });

      const post = pendingPosts.find(p => p.id === postId);
      if (post?.userId) {
        await createUserNotification(
          post.userId,
          `❌ আপনার পোস্টটি রিজেক্ট করা হয়েছে।\nকারণ: ${reason || 'Admin rejected the post'}`,
          'error'
        );
      }

      setPendingPosts(prev => prev.filter(p => p.id !== postId));
      setStats(prev => ({
        ...prev,
        pendingPosts: prev.pendingPosts - 1
      }));

      await feedback.showWarning('❌ পোস্ট রিজেক্ট', 'পোস্টটি রিজেক্ট করা হয়েছে!');
      await reloadAllData();

    } catch (error) {
      console.error('Reject post error:', error);
      await feedback.showError('❌ রিজেক্ট ব্যর্থ', 'পোস্ট রিজেক্ট করতে সমস্যা হয়েছে: ' + error.message);
    }
  }, [feedback, pendingPosts, reloadAllData, createUserNotification]);

  // ============================================================
  // 📌 SEARCH
  // ============================================================

  const handleGlobalSearch = useCallback((query) => {
    setSearchQuery(query);
    clearTimeout(searchTimeoutRef.current);
    
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    
    searchTimeoutRef.current = setTimeout(() => {
      const searchTerm = query.trim().toLowerCase();
      const results = [];
      
      try {
        const userResults = users.filter(user => 
          user.displayName?.toLowerCase().includes(searchTerm) ||
          user.email?.toLowerCase().includes(searchTerm) ||
          user.uniqueId?.toLowerCase().includes(searchTerm) ||
          user.id?.toLowerCase().includes(searchTerm) ||
          user.firstName?.toLowerCase().includes(searchTerm) ||
          user.lastName?.toLowerCase().includes(searchTerm) ||
          user.phone?.includes(searchTerm)
        ).map(user => ({ 
          ...user, 
          type: 'user',
          displayTitle: user.displayName || user.email || 'Unknown User'
        }));
        
        results.push(...userResults);
        
        const postResults = posts.filter(post =>
          post.title?.toLowerCase().includes(searchTerm) ||
          post.id?.toLowerCase().includes(searchTerm) ||
          post.postId?.toLowerCase().includes(searchTerm) ||
          post.description?.toLowerCase().includes(searchTerm)
        ).map(post => ({ 
          ...post, 
          type: 'post',
          displayTitle: post.title || 'Untitled Post'
        }));
        
        results.push(...postResults);
        
        const dealResults = deals.filter(deal =>
          deal.postTitle?.toLowerCase().includes(searchTerm) ||
          deal.id?.toLowerCase().includes(searchTerm) ||
          deal.dealIdNumber?.toLowerCase().includes(searchTerm) ||
          deal.buyerId?.toLowerCase().includes(searchTerm) ||
          deal.sellerId?.toLowerCase().includes(searchTerm)
        ).map(deal => ({ 
          ...deal, 
          type: 'deal',
          displayTitle: deal.postTitle || 'Deal'
        }));
        
        results.push(...dealResults);
        
        const withdrawalResults = withdrawals.filter(w =>
          w.id?.toLowerCase().includes(searchTerm) ||
          w.mobileNumber?.includes(searchTerm) ||
          w.userId?.toLowerCase().includes(searchTerm) ||
          w.bankAccount?.includes(searchTerm) ||
          w.accountHolder?.toLowerCase().includes(searchTerm)
        ).map(w => ({ 
          ...w, 
          type: 'withdrawal',
          displayTitle: `Withdrawal: ${w.id?.slice(-8)}`
        }));
        
        results.push(...withdrawalResults);
        
        setSearchResults(results);
        
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [users, posts, deals, withdrawals]);

  // ============================================================
  // 📌 MODAL HELPERS
  // ============================================================

  const openRejectModal = useCallback((postId) => {
    setSelectedPostId(postId);
    setRejectReason('');
    setShowRejectModal(true);
  }, []);

  const submitReject = useCallback(async () => {
    if (selectedPostId) {
      await handleRejectPost(selectedPostId, rejectReason);
      setShowRejectModal(false);
      setSelectedPostId(null);
      setRejectReason('');
    }
  }, [selectedPostId, rejectReason, handleRejectPost]);

  // ============================================================
  // 📌 TOGGLE FUNCTIONS
  // ============================================================

  const toggleSelectAllUsers = useCallback(() => {
    if (selectedUsersForNotify.length === users.length) {
      setSelectedUsersForNotify([]);
    } else {
      setSelectedUsersForNotify(users.map(u => u.id));
    }
  }, [selectedUsersForNotify, users]);

  const toggleUserSelection = useCallback((userId) => {
    setSelectedUsersForNotify(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  }, []);

  // ============================================================
  // 📌 RETURN
  // ============================================================

  return {
    // States
    loading,
    loadingSections,
    stats,
    users,
    posts,
    pendingPosts,
    pendingEdits,
    deals,
    withdrawals,
    deposits,
    pendingDeposits,
    depositsLoading,
    reports,
    reportsLoading,
    notifications,
    searchQuery,
    searchResults,
    isSearching,
    selectedUser,
    selectedReport,
    rejectReason,
    showRejectModal,
    selectedPostId,
    notificationMessage,
    notificationType,
    sendingNotification,
    selectedUsersForNotify,
    searchTimeoutRef,
    pendingUsersCount,

    // Setters
    setUsers,
    setPosts,
    setPendingPosts,
    setPendingEdits,
    setDeals,
    setWithdrawals,
    setDeposits,
    setPendingDeposits,
    setReports,
    setNotifications,
    setStats,
    setSelectedUser,
    setSelectedReport,
    setRejectReason,
    setShowRejectModal,
    setSelectedPostId,
    setNotificationMessage,
    setNotificationType,
    setSendingNotification,
    setSelectedUsersForNotify,
    setSearchQuery,
    setSearchResults,
    setIsSearching,

    // Load functions
    loadUsers,
    loadPosts,
    loadPendingPosts,
    loadPendingEdits,
    loadDeals,
    loadWithdrawals,
    loadStats,
    loadNotifications,
    loadPendingDeposits,
    loadAllDeposits,
    loadReports,
    loadAllData,
    reloadAllData,

    // User operations
    createUserNotification,
    verifyUser,
    toggleBlockUser,
    deleteUser,
    saveVerificationReview, 

    // Post operations
    handleDeletePost,

    // Deposit operations
    handleApproveDeposit,
    handleRejectDeposit,

    // Withdrawal operations
    handleApproveWithdrawal,
    handleCompleteWithdrawal,
    handleRejectWithdrawal,

    // Notification operations
    sendBulkNotification,
    sendAdminNotification,

    // Report operations
    updateReportStatus,

    // Pending post operations
    handleApproveEdit,
    handleApprovePost,
    handleRejectEdit,
    handleRejectPost,

    // Search
    handleGlobalSearch,

    // Modal helpers
    openRejectModal,
    submitReject,

    // Toggle functions
    toggleSelectAllUsers,
    toggleUserSelection,
  };
};

export default useAdminData;