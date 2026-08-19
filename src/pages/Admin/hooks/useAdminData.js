// src/pages/Admin/hooks/useAdminData.js
//
// ✅ ADDED (full user access for admin):
// - fetchUserDeals(userId)   — every deal a user is part of (buyer or seller)
// - fetchUserWallet(userId)  — a user's wallet doc (balance/locked/earned)
// - fetchUserPosts(userId)   — every post a user has made
// - adminAdjustWallet(userId, amount, type, reason) — admin credits/debits a
//   wallet directly, with a transaction record + user notification
// - adminCancelDeal(deal, reason) — admin force-cancels a deal; any
//   funded-but-not-released escrow money is refunded to the buyer
// - adminResolveDispute(deal, resolution, note) — admin resolves an open
//   dispute by releasing funded/review milestones to the seller or
//   refunding them to the buyer
// - loadDisputes() / disputes / disputesLoading — list of all deals with an
//   open dispute, for a dedicated admin "Disputes" tab
// Everything else in this file is unchanged from the original.

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

const [identityRecords, setIdentityRecords] = useState([]);
const [identityRecordsLoading, setIdentityRecordsLoading] = useState(false);

  
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

  // ── ✅ NEW: Disputes ──
  const [disputes, setDisputes] = useState([]);
  const [disputesLoading, setDisputesLoading] = useState(false);

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



// ── Load Identity Records Function ──
const loadIdentityRecords = useCallback(async () => {
  setIdentityRecordsLoading(true);
  try {
    const q = query(
      collection(db, 'identityRecords'),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setIdentityRecords(records);
    
    if (import.meta.env.DEV) {
      console.log(`📊 Identity records loaded: ${records.length}`);
    }
  } catch (error) {
    console.error('Load identity records error:', error);
    await feedback.showError('❌ আইডেন্টিটি রেকর্ড লোড ব্যর্থ', 'আইডেন্টিটি রেকর্ড লোড করতে সমস্যা হয়েছে');
  } finally {
    setIdentityRecordsLoading(false);
  }
}, [feedback]);

// ── Save Identity Record ──
const saveIdentityRecord = useCallback(async (data) => {
  try {
    const docRef = await addDoc(collection(db, 'identityRecords'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error('Save identity record error:', error);
    await feedback.showError('❌ সংরক্ষণ ব্যর্থ', 'আইডেন্টিটি রেকর্ড সংরক্ষণ করতে সমস্যা হয়েছে');
    return { success: false, error: error.message };
  }
}, [feedback]);

// ── Update Identity Record Status ──
const updateIdentityRecordStatus = useCallback(async (recordId, status, data = {}) => {
  try {
    await updateDoc(doc(db, 'identityRecords', recordId), {
      status: status,
      ...data,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Update identity record error:', error);
    await feedback.showError('❌ আপডেট ব্যর্থ', 'আইডেন্টিটি রেকর্ড আপডেট করতে সমস্যা হয়েছে');
    return { success: false, error: error.message };
  }
}, [feedback]);

// ── Delete Identity Record ──
const deleteIdentityRecord = useCallback(async (recordId) => {
  try {
    await deleteDoc(doc(db, 'identityRecords', recordId));
    return { success: true };
  } catch (error) {
    console.error('Delete identity record error:', error);
    await feedback.showError('❌ ডিলিট ব্যর্থ', 'আইডেন্টিটি রেকর্ড ডিলিট করতে সমস্যা হয়েছে');
    return { success: false, error: error.message };
  }
}, [feedback]);

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
  // 📌 ✅ NEW: LOAD DISPUTES (all deals with an open dispute)
  // ============================================================

  const loadDisputes = useCallback(async () => {
    setDisputesLoading(true);
    try {
      const q = query(
        collection(db, 'deals'),
        where('disputeStatus', '==', 'open')
      );
      const snapshot = await getDocs(q);
      const disputesList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      if (import.meta.env.DEV) {
        console.log("📊 Open disputes loaded:", disputesList.length);
      }

      setDisputes(disputesList);
    } catch (error) {
      console.error('Load disputes error:', error);
      await feedback.showError('❌ ডিসপিউট লোড ব্যর্থ', 'ডিসপিউট লোড করতে সমস্যা হয়েছে');
    } finally {
      setDisputesLoading(false);
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
        { name: 'Pending Edits', fn: loadPendingEdits },
        { name: 'Disputes', fn: loadDisputes },
        { name: 'Identity Records', fn: loadIdentityRecords }


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
  }, [loadUsers, loadPosts, loadPendingPosts, loadDeals, loadWithdrawals, loadStats, loadNotifications, loadAllDeposits, loadPendingDeposits, loadReports, loadPendingEdits, loadDisputes, feedback]);

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
        loadPendingEdits(),
        loadDisputes(),
        loadIdentityRecords()
      ]);
    } catch (error) {
      console.error("Reload error:", error);
    }
  }, [loadUsers, loadPosts, loadPendingPosts, loadDeals, loadWithdrawals, loadStats, loadNotifications, loadAllDeposits, loadPendingDeposits, loadReports, loadPendingEdits, loadDisputes]);

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
  // 📌 ✅ NEW: FULL USER ACCESS — FETCH FUNCTIONS
  // (used by UserFullAccessModal — fetched on-demand, not part of the
  //  global loadAllData sweep, since these are per-user and could be many)
  // ============================================================

  // ✅ Every deal this user is part of, as buyer OR seller. Primary query
  // uses the `participants` array field (present on deals created via the
  // current flow). Falls back to separate buyerId/sellerId queries merged
  // together in case some older deals don't have `participants` set.
  const fetchUserDeals = useCallback(async (userId) => {
    try {
      const q = query(
        collection(db, 'deals'),
        where('participants', 'array-contains', userId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length > 0) {
        return list.sort((a, b) => {
          const aTime = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime() / 1000 || 0;
          const bTime = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime() / 1000 || 0;
          return bTime - aTime;
        });
      }
      // fall through to legacy fallback if nothing found (participants
      // field might genuinely not exist on this deal set)
      throw new Error('no-participants-field');
    } catch (error) {
      try {
        const buyerQ = query(collection(db, 'deals'), where('buyerId', '==', userId));
        const sellerQ = query(collection(db, 'deals'), where('sellerId', '==', userId));
        const [buyerSnap, sellerSnap] = await Promise.all([getDocs(buyerQ), getDocs(sellerQ)]);
        const map = new Map();
        buyerSnap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        sellerSnap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        return Array.from(map.values()).sort((a, b) => {
          const aTime = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime() / 1000 || 0;
          const bTime = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime() / 1000 || 0;
          return bTime - aTime;
        });
      } catch (fallbackError) {
        console.error('fetchUserDeals error:', fallbackError);
        await feedback.showError('❌ ব্যর্থ', 'ইউজারের ডিল লোড করতে সমস্যা হয়েছে');
        return [];
      }
    }
  }, [feedback]);

  const fetchUserWallet = useCallback(async (userId) => {
    try {
      const snap = await getDoc(doc(db, 'wallets', userId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (error) {
      console.error('fetchUserWallet error:', error);
      await feedback.showError('❌ ব্যর্থ', 'ওয়ালেট লোড করতে সমস্যা হয়েছে');
      return null;
    }
  }, [feedback]);

  const fetchUserPosts = useCallback(async (userId) => {
    try {
      const q = query(
        collection(db, 'posts'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error('fetchUserPosts error:', error);
      await feedback.showError('❌ ব্যর্থ', 'ইউজারের পোস্ট লোড করতে সমস্যা হয়েছে');
      return [];
    }
  }, [feedback]);

  // ============================================================
  // 📌 ✅ NEW: ADMIN — ADJUST WALLET BALANCE DIRECTLY
  // ============================================================

  const adminAdjustWallet = useCallback(async (userId, amount, type, reason) => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      await feedback.showWarning('⚠️ ভুল পরিমাণ', 'দয়া করে একটি সঠিক পরিমাণ দিন');
      return false;
    }
    if (!reason || !reason.trim()) {
      await feedback.showWarning('⚠️ কারণ আবশ্যক', 'ব্যালেন্স পরিবর্তনের কারণ লিখুন');
      return false;
    }

    const confirmed = await feedback.confirm({
      title: type === 'credit' ? '➕ ব্যালেন্স যোগ করুন' : '➖ ব্যালেন্স কর্তন করুন',
      message: `${numAmount.toLocaleString()} BDT ${type === 'credit' ? 'যোগ' : 'কর্তন'} করবেন?\n\nকারণ: ${reason}`,
      variant: 'confirm',
      confirmText: 'নিশ্চিত করুন',
      cancelText: 'বাতিল করুন'
    });
    if (!confirmed) return false;

    try {
      const walletRef = doc(db, 'wallets', userId);

      await runTransaction(db, async (transaction) => {
        const walletSnap = await transaction.get(walletRef);
        if (!walletSnap.exists()) {
          throw new Error('এই ইউজারের ওয়ালেট পাওয়া যায়নি');
        }
        const data = walletSnap.data();
        const currentBalance = data.balance || 0;

        if (type === 'debit' && currentBalance < numAmount) {
          throw new Error(`ব্যালেন্স অপর্যাপ্ত — বর্তমান ব্যালেন্স ${currentBalance.toLocaleString()} BDT`);
        }

        const newBalance = type === 'credit' ? currentBalance + numAmount : currentBalance - numAmount;

        transaction.update(walletRef, {
          balance: newBalance,
          ...(type === 'credit' ? { totalEarned: (data.totalEarned || 0) + numAmount } : {}),
          updatedAt: serverTimestamp(),
        });

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          userId,
          amount: numAmount,
          type: type === 'credit' ? 'credit' : 'debit',
          status: 'completed',
          title: type === 'credit' ? 'Admin Balance Adjustment (Credit)' : 'Admin Balance Adjustment (Debit)',
          description: reason.trim(),
          adminAdjustment: true,
          adjustedBy: auth.currentUser?.uid || 'admin',
          adjustedByEmail: auth.currentUser?.email || 'admin',
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        });
      });

      await createUserNotification(
        userId,
        type === 'credit'
          ? `💰 অ্যাডমিন আপনার ওয়ালেটে ${numAmount.toLocaleString()} BDT যোগ করেছেন।\nকারণ: ${reason}`
          : `💸 অ্যাডমিন আপনার ওয়ালেট থেকে ${numAmount.toLocaleString()} BDT কর্তন করেছেন।\nকারণ: ${reason}`,
        type === 'credit' ? 'success' : 'warning'
      );

      await feedback.showSuccess('✅ সফল', 'ওয়ালেট আপডেট করা হয়েছে');
      return true;
    } catch (error) {
      console.error('adminAdjustWallet error:', error);
      await feedback.showError('❌ ব্যর্থ', error.message || 'ওয়ালেট আপডেট করতে সমস্যা হয়েছে');
      return false;
    }
  }, [feedback, createUserNotification]);

  // ============================================================
  // 📌 ✅ NEW: ADMIN — FORCE CANCEL A DEAL
  // Refunds any funded-but-not-released escrow money to the buyer and
  // releases any still-locked (never funded) budget reservation.
  // Cannot be used once any milestone has already been released to the
  // seller (that money has already moved — use adminAdjustWallet manually
  // for exceptional corrections in that case).
  // ============================================================

  const adminCancelDeal = useCallback(async (deal, reason) => {
    if (!reason || !reason.trim()) {
      await feedback.showWarning('⚠️ কারণ আবশ্যক', 'ডিল বাতিলের কারণ লিখুন');
      return false;
    }
    if (deal.status === 'completed' || deal.status === 'cancelled') {
      await feedback.showWarning('⚠️ সম্ভব না', 'সম্পন্ন বা ইতিমধ্যে বাতিল হওয়া ডিল আবার বাতিল করা যাবে না');
      return false;
    }

    const milestones = deal.milestones || [];
    const hasReleased = milestones.some(m => m.status === 'released');

    if (hasReleased) {
      await feedback.showWarning(
        '⚠️ সরাসরি বাতিল সম্ভব না',
        'এই ডিলে কিছু পেমেন্ট ইতিমধ্যে সেলারকে রিলিজ হয়ে গেছে — সরাসরি ক্যানসেল করা যাবে না। প্রয়োজনে ওয়ালেট Adjust ব্যবহার করে ম্যানুয়ালি সংশোধন করুন।'
      );
      return false;
    }

    const fundedMilestones = milestones.filter(m => m.status === 'funded' || m.status === 'review');
    const refundTotal = fundedMilestones.reduce((sum, m) => sum + (m.amount || 0), 0);
    const stillPendingTotal = milestones.filter(m => m.status === 'pending').reduce((sum, m) => sum + (m.amount || 0), 0);

    const confirmed = await feedback.confirm({
      title: '⚠️ অ্যাডমিন ডিল বাতিল',
      message: `এই ডিলটি বাতিল করবেন?\n\nকারণ: ${reason}${refundTotal > 0 ? `\n\n💸 ${refundTotal.toLocaleString()} BDT বায়ারকে ফেরত দেওয়া হবে (escrow-এ ছিল)।` : ''}`,
      variant: 'delete',
      confirmText: 'হ্যাঁ, বাতিল করুন',
      cancelText: 'বাতিল করুন'
    });
    if (!confirmed) return false;

    try {
      const dealRef = doc(db, 'deals', deal.id);
      const buyerWalletRef = doc(db, 'wallets', deal.buyerId);

      await runTransaction(db, async (transaction) => {
        const buyerWalletSnap = await transaction.get(buyerWalletRef);

        if (buyerWalletSnap.exists()) {
          const walletData = buyerWalletSnap.data();
          transaction.update(buyerWalletRef, {
            balance: (walletData.balance || 0) + refundTotal,
            lockedBalance: Math.max(0, (walletData.lockedBalance || 0) - stillPendingTotal),
            updatedAt: serverTimestamp(),
          });
        }

        const updatedMilestones = milestones.map(m =>
          (m.status === 'funded' || m.status === 'review')
            ? { ...m, status: 'refunded', refundedAt: new Date().toISOString() }
            : m
        );

        transaction.update(dealRef, {
          status: 'cancelled',
          milestones: updatedMilestones,
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'admin',
          cancelledByAdmin: auth.currentUser?.uid || 'admin',
          cancellationReason: reason.trim(),
          disputeStatus: deal.disputeStatus === 'open' ? 'resolved' : (deal.disputeStatus || null),
          updatedAt: serverTimestamp(),
        });

        if (refundTotal > 0) {
          const txRef = doc(collection(db, 'transactions'));
          transaction.set(txRef, {
            userId: deal.buyerId,
            amount: refundTotal,
            type: 'credit',
            status: 'completed',
            title: `Admin Refund: ${deal.postTitle || 'Deal'} (Cancelled by Admin)`,
            description: reason.trim(),
            dealId: deal.id,
            adminAdjustment: true,
            adjustedBy: auth.currentUser?.uid || 'admin',
            createdAt: serverTimestamp(),
            completedAt: serverTimestamp(),
          });
        }
      });

      await createUserNotification(
        deal.buyerId,
        `❌ অ্যাডমিন আপনার ডিল "${deal.postTitle || 'Untitled'}" বাতিল করেছেন।\nকারণ: ${reason}${refundTotal > 0 ? `\n💸 ${refundTotal.toLocaleString()} BDT আপনার ওয়ালেটে ফেরত দেওয়া হয়েছে।` : ''}`,
        'warning'
      );
      await createUserNotification(
        deal.sellerId,
        `❌ অ্যাডমিন ডিল "${deal.postTitle || 'Untitled'}" বাতিল করেছেন।\nকারণ: ${reason}`,
        'warning'
      );

      await feedback.showSuccess('✅ ডিল বাতিল হয়েছে', 'অ্যাডমিন সফলভাবে ডিলটি বাতিল করেছেন');
      await loadDisputes();
      return true;
    } catch (error) {
      console.error('adminCancelDeal error:', error);
      await feedback.showError('❌ ব্যর্থ', error.message || 'ডিল বাতিল করতে সমস্যা হয়েছে');
      return false;
    }
  }, [feedback, createUserNotification, loadDisputes]);

  // ============================================================
  // 📌 ✅ NEW: ADMIN — RESOLVE A DISPUTE
  // resolution: 'release' (pay funded/review milestones to seller)
  //           | 'refund'  (refund funded/review milestones to buyer)
  // ============================================================

  const adminResolveDispute = useCallback(async (deal, resolution, note = '') => {
    if (deal.disputeStatus !== 'open') {
      await feedback.showWarning('⚠️', 'এই ডিলে কোনো active dispute নেই');
      return false;
    }

    const milestones = deal.milestones || [];
    const disputedMilestones = milestones.filter(m => m.status === 'funded' || m.status === 'review');
    const totalAmount = disputedMilestones.reduce((sum, m) => sum + (m.amount || 0), 0);

    if (totalAmount === 0) {
      try {
        await updateDoc(doc(db, 'deals', deal.id), {
          disputeStatus: 'resolved',
          disputeResolution: resolution,
          disputeResolutionNote: note || '',
          disputeResolvedAt: serverTimestamp(),
          disputeResolvedBy: auth.currentUser?.uid || 'admin',
          updatedAt: serverTimestamp(),
        });
        await feedback.showSuccess('✅', 'Dispute সমাধান হয়েছে (কোনো escrow টাকা স্থানান্তরের দরকার ছিল না)');
        await loadDisputes();
        return true;
      } catch (error) {
        console.error('adminResolveDispute (no-amount) error:', error);
        await feedback.showError('❌', 'Dispute সমাধান করতে সমস্যা হয়েছে');
        return false;
      }
    }

    const confirmed = await feedback.confirm({
      title: resolution === 'release' ? '✅ সেলারকে টাকা রিলিজ করুন' : '↩️ বায়ারকে টাকা ফেরত দিন',
      message: `${totalAmount.toLocaleString()} BDT ${resolution === 'release' ? 'সেলারকে দেওয়া হবে' : 'বায়ারকে ফেরত যাবে'}।\n\nনিশ্চিত?`,
      variant: 'confirm',
      confirmText: 'নিশ্চিত করুন',
      cancelText: 'বাতিল করুন',
    });
    if (!confirmed) return false;

    try {
      const dealRef = doc(db, 'deals', deal.id);
      const buyerWalletRef = doc(db, 'wallets', deal.buyerId);
      const sellerWalletRef = doc(db, 'wallets', deal.sellerId);

      await runTransaction(db, async (transaction) => {
        const updatedMilestones = milestones.map(m =>
          (m.status === 'funded' || m.status === 'review')
            ? { ...m, status: resolution === 'release' ? 'released' : 'refunded', resolvedAt: new Date().toISOString() }
            : m
        );
        const allDone = updatedMilestones.every(m => m.status === 'released' || m.status === 'refunded' || m.status === 'pending');

        if (resolution === 'release') {
          const sellerSnap = await transaction.get(sellerWalletRef);
          if (sellerSnap.exists()) {
            const sd = sellerSnap.data();
            transaction.update(sellerWalletRef, {
              balance: (sd.balance || 0) + totalAmount,
              totalEarned: (sd.totalEarned || 0) + totalAmount,
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.set(sellerWalletRef, {
              balance: totalAmount,
              totalEarned: totalAmount,
              totalWithdrawn: 0,
              pendingWithdraw: 0,
              lockedBalance: 0,
              userId: deal.sellerId,
              walletId: `WL-${Date.now().toString(36).toUpperCase()}`,
              currency: 'BDT',
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          const buyerSnap = await transaction.get(buyerWalletRef);
          if (buyerSnap.exists()) {
            transaction.update(buyerWalletRef, {
              balance: (buyerSnap.data().balance || 0) + totalAmount,
              updatedAt: serverTimestamp(),
            });
          }
        }

        transaction.update(dealRef, {
          milestones: updatedMilestones,
          disputeStatus: 'resolved',
          disputeResolution: resolution,
          disputeResolutionNote: note || '',
          disputeResolvedAt: serverTimestamp(),
          disputeResolvedBy: auth.currentUser?.uid || 'admin',
          ...(allDone && { status: resolution === 'release' ? 'completed' : 'cancelled' }),
          updatedAt: serverTimestamp(),
        });

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          userId: resolution === 'release' ? deal.sellerId : deal.buyerId,
          amount: totalAmount,
          type: 'credit',
          status: 'completed',
          title: `Dispute Resolved: ${deal.postTitle || 'Deal'}`,
          description: note || `Admin resolved dispute — ${resolution === 'release' ? 'released to seller' : 'refunded to buyer'}`,
          dealId: deal.id,
          adminAdjustment: true,
          adjustedBy: auth.currentUser?.uid || 'admin',
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        });
      });

      await createUserNotification(
        deal.buyerId,
        `⚖️ Dispute সমাধান হয়েছে: ${resolution === 'release' ? 'সেলারকে escrow টাকা রিলিজ করা হয়েছে' : `${totalAmount.toLocaleString()} BDT আপনাকে ফেরত দেওয়া হয়েছে`}${note ? `\nনোট: ${note}` : ''}`,
        'info'
      );
      await createUserNotification(
        deal.sellerId,
        `⚖️ Dispute সমাধান হয়েছে: ${resolution === 'release' ? `${totalAmount.toLocaleString()} BDT আপনাকে দেওয়া হয়েছে` : 'escrow টাকা বায়ারকে ফেরত দেওয়া হয়েছে'}${note ? `\nনোট: ${note}` : ''}`,
        'info'
      );

      await feedback.showSuccess('✅ Dispute সমাধান হয়েছে', '');
      await loadDisputes();
      return true;
    } catch (error) {
      console.error('adminResolveDispute error:', error);
      await feedback.showError('❌ ব্যর্থ', error.message || 'Dispute সমাধান করতে সমস্যা হয়েছে');
      return false;
    }
  }, [feedback, createUserNotification, loadDisputes]);

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

// src/pages/Admin/hooks/useAdminData.js

// ============================================================
// 📌 EDIT POST (Admin - Pending Posts)
// ============================================================

const handleEditPost = useCallback(async (postId, formData) => {
  try {
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      title: formData.title,
      description: formData.description,
      budget: formData.budget,
      deadline: formData.deadline,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || 'admin',
    });

    // ✅ Pending Posts আপডেট করুন
    setPendingPosts(prev => prev.map(post => 
      post.id === postId ? { 
        ...post, 
        title: formData.title,
        description: formData.description,
        budget: formData.budget,
        deadline: formData.deadline,
      } : post
    ));

    await feedback.showSuccess('✅ পোস্ট আপডেট', 'পোস্ট সফলভাবে আপডেট করা হয়েছে!');
    await reloadAllData();

  } catch (error) {
    console.error('Edit post error:', error);
    await feedback.showError('❌ আপডেট ব্যর্থ', 'পোস্ট আপডেট করতে সমস্যা হয়েছে: ' + error.message);
  }
}, [feedback, reloadAllData]);

// ============================================================
// 📌 EDIT PENDING EDIT (Admin - Pending Edits)
// ============================================================

const handleEditPendingEdit = useCallback(async (editId, formData) => {
  try {
    const postRef = doc(db, 'posts', editId);
    await updateDoc(postRef, {
      'pendingChanges.title': formData.title,
      'pendingChanges.description': formData.description,
      'pendingChanges.budget': formData.budget,
      'pendingChanges.deadline': formData.deadline,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || 'admin',
    });

    // ✅ Pending Edits আপডেট করুন
    setPendingEdits(prev => prev.map(edit => 
      edit.id === editId ? { 
        ...edit, 
        pendingChanges: {
          ...edit.pendingChanges,
          title: formData.title,
          description: formData.description,
          budget: formData.budget,
          deadline: formData.deadline,
        }
      } : edit
    ));

    await feedback.showSuccess('✅ পেন্ডিং এডিট আপডেট', 'পেন্ডিং এডিট সফলভাবে আপডেট করা হয়েছে!');
    await reloadAllData();

  } catch (error) {
    console.error('Edit pending edit error:', error);
    await feedback.showError('❌ আপডেট ব্যর্থ', 'পেন্ডিং এডিট আপডেট করতে সমস্যা হয়েছে: ' + error.message);
  }
}, [feedback, reloadAllData]);


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
    disputes,           // ✅ NEW
    disputesLoading,     // ✅ NEW
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


  identityRecords,
  identityRecordsLoading,
  loadIdentityRecords,
  saveIdentityRecord,
  updateIdentityRecordStatus,
  deleteIdentityRecord,

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
    loadDisputes,       // ✅ NEW
    loadAllData,
    reloadAllData,

    // User operations
    createUserNotification,
    verifyUser,
    toggleBlockUser,
    deleteUser,
    saveVerificationReview, 

    // ✅ NEW — Full user access
    fetchUserDeals,
    fetchUserWallet,
    fetchUserPosts,
    adminAdjustWallet,
    adminCancelDeal,
    adminResolveDispute,

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
      handleEditPost,          // ✅ NEW
  handleEditPendingEdit,

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