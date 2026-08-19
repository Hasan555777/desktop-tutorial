// src/pages/Wallet.jsx
//
// 🔒 CHANGE: wallets/{uid}.lockedBalance now represents money the user (as a
// BUYER) has committed to active deals — it is set/released exclusively by
// DealManager.jsx (activateDealWithEscrowLock / releaseEscrowLock) and
// PaymentGateway.jsx (funding a milestone moves money from locked -> gone).
// This page now reads and displays it so the person always sees what's
// actually theirs to withdraw or send, vs. what's tied up in a deal.
//
// ⚠️ IMPORTANT FOR /withdraw AND /send-money PAGES (not included here):
// Both of those flows MUST check the requested amount against
// `balance - lockedBalance`, not raw `balance` — otherwise a buyer could
// withdraw or send money that's already committed to an active deal's
// escrow, leaving the deal under-funded when milestones need to be paid.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '@/firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { 
  doc, getDoc, setDoc, updateDoc, collection, query, where, 
  onSnapshot, orderBy, addDoc, serverTimestamp, 
  runTransaction, Timestamp
} from 'firebase/firestore';
import './Wallet.css';
import WalletActions from './WalletActions';
import { useAuth } from '../context/AuthContext';
import { 
  sendWalletDepositNotification, 
  sendWalletWithdrawNotification,
  sendWalletBalanceNotification,
  sendDealPaymentNotification
} from './notificationHelper';
import GuideModal from '@/components/GuideModal';

// ============================================================
// ✅ Constants - Shared with Transactions/PaymentHistory
// ============================================================
const TRANSACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const STATUS_CONFIG = {
  [TRANSACTION_STATUS.PENDING]: { color: '#f59e0b', icon: 'fa-clock', bg: '#f59e0b15', label: 'Pending' },
  [TRANSACTION_STATUS.PROCESSING]: { color: '#3b82f6', icon: 'fa-spinner fa-spin', bg: '#3b82f615', label: 'Processing' },
  [TRANSACTION_STATUS.COMPLETED]: { color: '#10b981', icon: 'fa-check-circle', bg: '#10b98115', label: 'Completed' },
  [TRANSACTION_STATUS.REJECTED]: { color: '#ef4444', icon: 'fa-times-circle', bg: '#ef444415', label: 'Rejected' },
  [TRANSACTION_STATUS.FAILED]: { color: '#ef4444', icon: 'fa-circle-exclamation', bg: '#ef444415', label: 'Failed' },
  [TRANSACTION_STATUS.CANCELLED]: { color: '#6b7280', icon: 'fa-ban', bg: '#6b728015', label: 'Cancelled' },
};

const TYPE_CONFIG = {
  credit: { icon: 'fa-solid fa-arrow-down', color: '#10b981', bg: '#10b98115', label: 'Received' },
  debit: { icon: 'fa-solid fa-arrow-up', color: '#ef4444', bg: '#ef444415', label: 'Sent' },
  withdraw: { icon: 'fa-solid fa-money-bill-transfer', color: '#f59e0b', bg: '#f59e0b15', label: 'Withdrawn' },
  deposit: { icon: 'fa-solid fa-circle-dollar', color: '#14b8a6', bg: '#14b8a615', label: 'Deposit' },
  'bank-transfer': { icon: 'fa-solid fa-building-columns', color: '#438e82', bg: '#438e8215', label: 'Bank Transfer' },
  earning: { icon: 'fa-solid fa-chart-simple', color: '#8b5cf6', bg: '#8b5cf615', label: 'Earning' },
  bonus: { icon: 'fa-solid fa-gift', color: '#ec4899', bg: '#ec489915', label: 'Bonus' },
};

const FILTER_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'bank-transfer', label: 'Bank Transfer' },
  { key: 'withdraw', label: 'Withdrawals' },
  { key: 'credit', label: 'Received' },
  { key: 'debit', label: 'Sent' },
];

const Wallet = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.currentUser;
  const { userData } = useAuth();
  const feedback = useFeedback();
  const { playEvent } = useSound();
  
  // ✅ State
  const [loading, setLoading] = useState(true);
  const [walletData, setWalletData] = useState({
    balance: 0,
    totalEarned: 0,
    totalWithdrawn: 0,
    pendingWithdraw: 0,
    lockedBalance: 0, // ✅ NEW — money committed to active deals as buyer
  });
  const [transactions, setTransactions] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [stats, setStats] = useState({
    totalCredit: 0,
    totalDebit: 0,
    totalWithdraw: 0,
    totalTransactions: 0,
    pendingCount: 0
  });

  // ✅ Refs
  const previousBalanceRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const lastNotificationTimeRef = useRef(0);
  const previousStatusMap = useRef({});
  const previousIdsRef = useRef(new Set());
  const pendingAlertRef = useRef(false);

  // ✅ pendingProposal check
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const autoSubmit = params.get('autoSubmitProposal');
    const chatId = params.get('chatId');
    
    if (autoSubmit === 'true' && chatId) {
      const pendingOffer = sessionStorage.getItem('pendingProposal');
      if (pendingOffer) {
        sessionStorage.removeItem('pendingProposal');
        const parsed = JSON.parse(pendingOffer);
        
        const submitData = {
          chatId: parsed.chatId,
          amount: parsed.amount,
          description: parsed.description,
          fromDeposit: true
        };
        
        setTimeout(() => {
          navigate(`/chat/${chatId}?autoSubmit=true`, { 
            state: { pendingProposal: submitData } 
          });
        }, 500);
      }
    }
  }, [location, navigate]);

  // ============================================================
  // ✅ Load Wallet & Transactions
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    feedback.toast({
      title: 'Loading',
      message: 'Loading wallet...',
      duration: 2000
    });

    const initWallet = async () => {
      try {
        const walletRef = doc(db, 'wallets', user.uid);
        const walletSnap = await getDoc(walletRef);
        
        if (!walletSnap.exists()) {
          const newWallet = {
            userId: user.uid,
            walletId: userData?.walletId || `WL-${Date.now()}`,
            balance: 0,
            totalEarned: 0,
            totalWithdrawn: 0,
            pendingWithdraw: 0,
            lockedBalance: 0,
            isActive: true,
            currency: 'BDT',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          await setDoc(walletRef, newWallet);
          console.log('✅ New wallet created for user:', user.uid);
        }
      } catch (error) {
        console.error('❌ Error initializing wallet:', error);
      }
    };
    initWallet();

    // ✅ Wallet Listener
    const walletRef = doc(db, 'wallets', user.uid);
    const unsubscribeWallet = onSnapshot(walletRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const newBalance = data.balance || 0;
        const oldBalance = previousBalanceRef.current;

        setWalletData({
          balance: newBalance,
          totalEarned: data.totalEarned || 0,
          totalWithdrawn: data.totalWithdrawn || 0,
          pendingWithdraw: data.pendingWithdraw || 0,
          lockedBalance: data.lockedBalance || 0, // ✅ NEW
        });

        // ✅ Balance change notification
        const now = Date.now();
        if (!isInitialLoadRef.current && oldBalance !== newBalance) {
          const difference = newBalance - oldBalance;
          
          if (difference > 0 && (now - lastNotificationTimeRef.current) > 3000) {
            lastNotificationTimeRef.current = now;
            playEvent?.(SOUND_EVENTS.WALLET);
            if (user?.uid) {
              sendWalletBalanceNotification(
                user.uid,
                difference,
                'credit',
                'Wallet Balance Updated'
              );
            }
          }

          if (difference < 0 && (now - lastNotificationTimeRef.current) > 3000) {
            lastNotificationTimeRef.current = now;
            playEvent?.(SOUND_EVENTS.WALLET);
            sendWalletBalanceNotification(
              user.uid,
              Math.abs(difference),
              'debit',
              'Wallet Balance Decreased'
            );
          }
        }

        previousBalanceRef.current = newBalance;
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
        }
      }
      setLoading(false);
    }, (error) => {
      console.error("❌ Wallet listener error:", error);
      setLoading(false);
    });

    // ✅ Transactions Listener
    const transactionsRef = collection(db, 'transactions');
    const q = query(
      transactionsRef,
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTransactions = onSnapshot(q, (snapshot) => {
      const fetchedTransactions = snapshot.docs.map(doc => {
        const data = doc.data();
        let date = new Date();
        let formattedDate = 'Just now';
        
        if (data.createdAt) {
          if (data.createdAt instanceof Timestamp) {
            date = data.createdAt.toDate();
          } else if (data.createdAt?.toDate) {
            date = data.createdAt.toDate();
          }
          formattedDate = formatDate(date);
        }
        
        const docId = doc.id || `tx-${Date.now()}`;
        
        return {
          id: docId,
          ...data,
          date: date,
          formattedDate: formattedDate,
          amount: data.amount || 0,
          type: data.type || 'debit',
          status: data.status || 'pending',
          title: data.title || getDefaultTitle(data.type),
          reference: data.reference || data.transactionId || data.id || docId.slice(-8) || 'N/A',
          adminRemark: data.adminRemark || null,
          paymentMethod: data.paymentMethod || null,
          mobileNumber: data.mobileNumber || null,
          description: data.description || null,
          bankDetails: data.bankDetails || null,
          receiptUrl: data.receiptUrl || null,
          receiptFileName: data.receiptFileName || null,
          isEscrow: data.isEscrow || false, // ✅ NEW — flags escrow-fund debits distinct from real transfers
        };
      });
      
      // ✅ Pending count
      const newPendingCount = fetchedTransactions.filter(t => t.status === TRANSACTION_STATUS.PENDING).length;
      
      // ✅ Status change sound
      if (!isInitialLoadRef.current) {
        fetchedTransactions.forEach((tx) => {
          const prevStatus = previousStatusMap.current[tx.id];
          if (prevStatus && prevStatus !== tx.status) {
            if (tx.status === TRANSACTION_STATUS.COMPLETED) {
              playEvent?.(SOUND_EVENTS.SUCCESS);
            } else if (tx.status === TRANSACTION_STATUS.PENDING) {
              playEvent?.(SOUND_EVENTS.NOTIFICATION);
            } else if (tx.status === TRANSACTION_STATUS.REJECTED || tx.status === TRANSACTION_STATUS.FAILED) {
              playEvent?.(SOUND_EVENTS.ERROR);
            }
          }
          previousStatusMap.current[tx.id] = tx.status;
        });
      }
      
      // ✅ New transaction detection
      if (!isInitialLoadRef.current) {
        const currentIds = new Set(fetchedTransactions.map(p => p.id));
        const newIds = new Set([...currentIds].filter(id => !previousIdsRef.current.has(id)));
        
        if (newIds.size > 0) {
          const newTx = fetchedTransactions.find(p => newIds.has(p.id));
          if (newTx) {
            if (newTx.status === TRANSACTION_STATUS.COMPLETED) {
              playEvent?.(SOUND_EVENTS.SUCCESS);
            } else if (newTx.status === TRANSACTION_STATUS.PENDING) {
              playEvent?.(SOUND_EVENTS.NOTIFICATION);
            }
          }
        }
        previousIdsRef.current = currentIds;
      }
      
      setPendingCount(newPendingCount);
      setTransactions(fetchedTransactions);
      calculateStats(fetchedTransactions);
      
      // ✅ Pending notification
      if (newPendingCount > 0 && !pendingAlertRef.current) {
        pendingAlertRef.current = true;
        feedback.alert.info({
          message: `⏳ You have ${newPendingCount} pending transaction${newPendingCount > 1 ? 's' : ''}.`
        });
      }

      if (newPendingCount === 0) {
        pendingAlertRef.current = false;
      }

    }, (error) => {
      console.error("❌ Transactions listener error:", error);
    });

    return () => {
      unsubscribeWallet();
      unsubscribeTransactions();
      previousStatusMap.current = {};
      previousIdsRef.current = new Set();
      pendingAlertRef.current = false;
    };
  }, [user, navigate, userData?.walletId]);

  // ============================================================
  // ✅ Available (withdrawable) balance = total balance minus whatever is
  // locked/reserved for active deals as a buyer.
  // ============================================================
  const availableBalance = Math.max(0, walletData.balance - walletData.lockedBalance);

  // ============================================================
  // ✅ Stats Calculation
  // ============================================================
  const calculateStats = (txns) => {
    const totalCredit = txns
      .filter(t => t.type === 'credit' || t.type === 'deposit' || t.type === 'earning' || t.type === 'bank-transfer')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const totalDebit = txns
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const totalWithdraw = txns
      .filter(t => t.type === 'withdraw')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const pendingCount = txns.filter(t => t.status === TRANSACTION_STATUS.PENDING).length;
    
    setStats({
      totalCredit,
      totalDebit,
      totalWithdraw,
      totalTransactions: txns.length,
      pendingCount
    });
  };

  // ============================================================
  // ✅ Filtered Transactions
  // ============================================================
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.type === filterType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(t => 
        t.title?.toLowerCase().includes(query) ||
        t.reference?.toLowerCase().includes(query) ||
        t.id?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.paymentMethod?.toLowerCase().includes(query) ||
        t.bankDetails?.accountName?.toLowerCase().includes(query) ||
        t.bankDetails?.bankName?.toLowerCase().includes(query) ||
        t.bankDetails?.accountNumber?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [transactions, filterType, searchQuery]);

  // ============================================================
  // ✅ Date Format
  // ============================================================
  const formatDate = (date) => {
    if (!date) return 'Just now';
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ============================================================
  // ✅ Default Title
  // ============================================================
  const getDefaultTitle = (type) => {
    const titles = {
      'credit': 'Payment Received',
      'debit': 'Payment Sent',
      'withdraw': 'Withdrawal Request',
      'deposit': 'Deposit',
      'bank-transfer': 'Bank Transfer Deposit',
      'earning': 'Earning',
      'bonus': 'Bonus Received'
    };
    return titles[type] || 'Transaction';
  };

  // ============================================================
  // ✅ Get Transaction Title
  // ============================================================
  const getTransactionTitle = (tx) => {
    if (tx.title) return tx.title;
    return getDefaultTitle(tx.type);
  };

  // ============================================================
  // ✅ Format Money
  // ============================================================
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('bn-BD', {
      style: 'currency',
      currency: 'BDT',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  // ============================================================
  // ✅ Clear Filters
  // ============================================================
  const clearFilters = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setFilterType('all');
    setSearchQuery('');
  };

  // ============================================================
  // ✅ Refresh
  // ============================================================
  const handleRefresh = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    feedback.toast({
      title: 'Refreshed',
      message: 'Wallet is up to date!',
      duration: 2000
    });
  };

  // ============================================================
  // ✅ Transaction Click
  // ============================================================
  const handleTransactionClick = (tx) => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setSelectedTransaction(tx);
  };

  // ============================================================
  // ✅ Modal Close
  // ============================================================
  const handleModalClose = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setSelectedTransaction(null);
  };

  // ============================================================
  // ✅ Get Status Config
  // ============================================================
  const getStatusConfig = (status) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG[TRANSACTION_STATUS.PENDING];
  };

  // ============================================================
  // ✅ Get Type Config
  // ============================================================
  const getTypeConfig = (type) => {
    return TYPE_CONFIG[type] || TYPE_CONFIG['deposit'];
  };

  // ============================================================
  // ✅ Loading State
  // ============================================================
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: '60px 20px',
        minHeight: '400px',
        background: 'var(--bg-primary, #090d16)', 
        color: 'var(--accent-primary, #14b8a6)' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-wallet" style={{ 
            fontSize: '48px', 
            animation: 'spin 2s linear infinite',
            display: 'block',
            marginBottom: '16px',
            color: 'var(--accent-primary, #14b8a6)'
          }} />
          <h2 style={{ 
            color: 'var(--text-primary, #f1f5f9)', 
            fontSize: '20px', 
            fontWeight: '600',
            margin: '0 0 8px 0'
          }}>
            Loading Wallet...
          </h2>
          <p style={{ 
            color: 'var(--text-muted, #64748b)', 
            marginTop: '8px', 
            fontSize: '14px' 
          }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your wallet information...
          </p>
          <div style={{ marginTop: '20px' }}>
            <div className="loading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ✅ Render
  // ============================================================
  const showPendingBanner = pendingCount > 0;
  const showLockedBanner = walletData.lockedBalance > 0;

  return (
    <div className="wallet-container-modern">

      <GuideModal guideKey="wallet" />
      
      {/* ✅ Pending Banner */}
      {showPendingBanner && (
        <div className="pending-banner">
          <i className="fa-solid fa-clock"></i>
          <span>
            ⏳ You have <strong>{pendingCount}</strong> pending transaction{pendingCount > 1 ? 's' : ''}. 
            Please wait for admin approval.
          </span>
        </div>
      )}

      {/* ✅ Locked Balance Banner — money committed to active deals */}
      {showLockedBanner && (
        <div className="pending-banner" style={{ background: '#f59e0b15', borderColor: '#f59e0b40' }}>
          <i className="fa-solid fa-lock" style={{ color: '#f59e0b' }}></i>
          <span>
            🔒 <strong>{formatMoney(walletData.lockedBalance)}</strong> আপনার একটিভ ডিলে reserved আছে —
            এই টাকা withdraw বা send করা যাবে না যতক্ষণ না ডিল শেষ/বাতিল হয়।
            Available to withdraw: <strong>{formatMoney(availableBalance)}</strong>
          </span>
        </div>
      )}

      {/* ✅ Wallet ID Display */}
      <div className="wallet-id-display">
        <span className="wallet-id-label">
          <i className="fa-regular fa-credit-card"></i> Wallet ID:
        </span>
        <strong className="wallet-id-value">{userData?.walletId || 'Loading...'}</strong>
        <button 
          className="copy-wallet-id-btn"
          onClick={() => {
            playEvent?.(SOUND_EVENTS.CLICK);
            navigator.clipboard.writeText(userData?.walletId || '');
            feedback.alert.success({ message: 'Wallet ID copied!' });
          }}
        >
          <i className="fa-solid fa-copy"></i> Copy
        </button>
      </div>

      {/* ✅ Wallet Actions — now passing both total and available balance so
          the balance card / withdraw shortcuts can show the real
          withdrawable amount, not the raw total. */}
      <WalletActions
        walletBalance={walletData.balance}
        availableBalance={availableBalance}
        lockedBalance={walletData.lockedBalance}
        onRefresh={handleRefresh}
      />

      {/* ✅ Stats Bar */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-label">Total Received</span>
          <span className="stat-value positive">{formatMoney(stats.totalCredit)}</span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <span className="stat-label">Total Sent</span>
          <span className="stat-value negative">{formatMoney(stats.totalDebit)}</span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <span className="stat-label">Total Withdrawn</span>
          <span className="stat-value">{formatMoney(stats.totalWithdraw)}</span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <span className="stat-label">Locked (Active Deals)</span>
          <span className="stat-value" style={{ color: walletData.lockedBalance > 0 ? '#f59e0b' : undefined }}>
            {formatMoney(walletData.lockedBalance)}
          </span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <span className="stat-label">Pending</span>
          <span className="stat-value pending-count">{stats.pendingCount}</span>
        </div>
      </div>

      {/* ✅ Header with Search & Filter */}
      <div className="wallet-section-header">
        <h3>
          <i className="fa-solid fa-clock-rotate-left"></i> Recent Transactions
          {pendingCount > 0 && (
            <span className="pending-badge">{pendingCount}</span>
          )}
        </h3>
        <button className="view-all-btn" onClick={() => {
          playEvent?.(SOUND_EVENTS.CLICK);
          navigate('/transactions');
        }}>
          View All <i className="fa-solid fa-arrow-right"></i>
        </button>
      </div>

      {/* ✅ Search Bar */}
      <div className="search-bar">
        <i className="fa-solid fa-search"></i>
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="clear-search" onClick={() => setSearchQuery('')}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      {/* ✅ Filter Buttons */}
      <div className="filter-section">
        {FILTER_TYPES.map((type) => (
          <button 
            key={type.key}
            className={`filter-btn ${filterType === type.key ? 'active' : ''}`}
            onClick={() => {
              playEvent?.(SOUND_EVENTS.CLICK);
              setFilterType(type.key);
            }}
          >
            {type.label}
            {type.key === 'all' && transactions.length > 0 && (
              <span className="filter-count">{transactions.length}</span>
            )}
          </button>
        ))}
        {(filterType !== 'all' || searchQuery) && (
          <button className="clear-filters-btn" onClick={clearFilters}>
            <i className="fa-solid fa-eraser"></i> Clear
          </button>
        )}
      </div>

      {/* ✅ Result Count */}
      <div className="result-count">
        <span>
          Showing <strong>{filteredTransactions.length}</strong> of <strong>{transactions.length}</strong> transactions
        </span>
      </div>

      {/* ✅ Transactions List */}
      <div className="transactions-list-modern">
        {filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-receipt"></i>
            <h3>No Transactions Found</h3>
            <p>
              {searchQuery || filterType !== 'all'
                ? 'No transactions match your filters. Try adjusting your search criteria.'
                : 'You don\'t have any transactions yet.'}
            </p>
            {(searchQuery || filterType !== 'all') && (
              <button className="clear-filters-btn" onClick={clearFilters}>
                <i className="fa-solid fa-eraser"></i> Clear Filters
              </button>
            )}
            {!searchQuery && filterType === 'all' && (
              <div className="empty-actions">
                <button className="browse-btn" onClick={() => {
                  playEvent?.(SOUND_EVENTS.CLICK);
                  navigate('/deposit');
                }}>
                  <i className="fa-solid fa-circle-dollar"></i> Deposit
                </button>
                <button className="browse-btn secondary" onClick={() => {
                  playEvent?.(SOUND_EVENTS.CLICK);
                  navigate('/send-money');
                }}>
                  <i className="fa-solid fa-paper-plane"></i> Send Money
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredTransactions.slice(0, 10).map((tx) => {
            const typeConfig = getTypeConfig(tx.type);
            const statusConfig = getStatusConfig(tx.status);
            const isCredit = tx.type === 'credit' || tx.type === 'deposit' || tx.type === 'earning' || tx.type === 'bank-transfer';

            return (
              <div 
                key={tx.id} 
                className={`transaction-item-modern ${tx.status}`}
                onClick={() => handleTransactionClick(tx)}
              >
                <div className="tx-icon" style={{ background: typeConfig.bg, color: typeConfig.color }}>
                  <i className={typeConfig.icon}></i>
                </div>
                
                <div className="tx-details">
                  <h4>
                    {getTransactionTitle(tx)}
                    {tx.isEscrow && (
                      <span style={{ fontSize: '10px', marginLeft: '6px', color: '#f59e0b', border: '1px solid #f59e0b60', borderRadius: '20px', padding: '1px 8px' }}>
                        ESCROW
                      </span>
                    )}
                  </h4>
                  <p className="tx-date">{tx.formattedDate}</p>
                  {tx.reference && (
                    <small className="tx-reference">Ref: {tx.reference}</small>
                  )}
                  {tx.description && (
                    <small className="tx-description">{tx.description}</small>
                  )}
                  {tx.bankDetails && (
                    <small className="tx-bank-details">
                      <i className="fa-solid fa-building-columns"></i> {tx.bankDetails.bankName}
                    </small>
                  )}
                </div>
                
                <div className="tx-right">
                  <div className={`tx-amount ${isCredit ? 'credit' : 'debit'}`}>
                    {isCredit ? '+' : '-'} {formatMoney(tx.amount)}
                  </div>
                  
                  <div className={`tx-status ${tx.status}`} style={{ 
                    color: statusConfig.color, 
                    background: statusConfig.bg 
                  }}>
                    <i className={`fa-solid ${statusConfig.icon}`}></i>
                    <span>{statusConfig.label}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ✅ Footer */}
      {transactions.length > 0 && (
        <div className="wallet-footer">
          <span>Showing {Math.min(filteredTransactions.length, 10)} of {transactions.length} transactions</span>
          {transactions.length > 10 && (
            <button className="view-all-btn" onClick={() => {
              playEvent?.(SOUND_EVENTS.CLICK);
              navigate('/transactions');
            }}>
              View All <i className="fa-solid fa-arrow-right"></i>
            </button>
          )}
        </div>
      )}

      {/* ✅ Transaction Details Modal */}
      {selectedTransaction && (
        <div className="modal-overlay" onClick={handleModalClose}>
          <div className="details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fa-solid fa-receipt"></i> Transaction Details
              </h3>
              <button className="close-btn" onClick={handleModalClose}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span>Amount:</span>
                <strong className={selectedTransaction.type === 'credit' || selectedTransaction.type === 'deposit' || selectedTransaction.type === 'bank-transfer' ? 'credit-text' : 'debit-text'}>
                  {formatMoney(selectedTransaction.amount)}
                </strong>
              </div>
              <div className="detail-row">
                <span>Type:</span>
                <span className="type-badge">{selectedTransaction.type === 'bank-transfer' ? 'Bank Transfer' : selectedTransaction.type}</span>
              </div>
              <div className="detail-row">
                <span>Status:</span>
                {(() => {
                  const config = getStatusConfig(selectedTransaction.status);
                  return (
                    <span className={`status-badge ${selectedTransaction.status}`} style={{ color: config.color, background: config.bg }}>
                      <i className={`fa-solid ${config.icon}`}></i> {config.label}
                    </span>
                  );
                })()}
              </div>
              <div className="detail-row">
                <span>Title:</span>
                <span>{getTransactionTitle(selectedTransaction)}</span>
              </div>
              {selectedTransaction.isEscrow && (
                <div className="detail-row">
                  <span>Note:</span>
                  <span style={{ color: '#f59e0b' }}>
                    <i className="fa-solid fa-lock"></i> এই টাকা escrow-তে জমা আছে, এখনো অন্যপক্ষকে পাঠানো হয়নি।
                  </span>
                </div>
              )}
              {selectedTransaction.description && (
                <div className="detail-row">
                  <span>Description:</span>
                  <span>{selectedTransaction.description}</span>
                </div>
              )}
              
              {/* ✅ Bank Transfer Details */}
              {selectedTransaction.bankDetails && (
                <>
                  <div className="detail-divider"></div>
                  <div className="bank-details-modal">
                    <h4><i className="fa-solid fa-building-columns" style={{ color: 'var(--accent-primary)' }}></i> Bank Transfer Details</h4>
                    <div className="detail-row">
                      <span>Account Holder:</span>
                      <span><strong>{selectedTransaction.bankDetails.accountName}</strong></span>
                    </div>
                    <div className="detail-row">
                      <span>Account Number:</span>
                      <span><strong>{selectedTransaction.bankDetails.accountNumber}</strong></span>
                    </div>
                    <div className="detail-row">
                      <span>Bank Name:</span>
                      <span>{selectedTransaction.bankDetails.bankName}</span>
                    </div>
                    <div className="detail-row">
                      <span>Branch:</span>
                      <span>{selectedTransaction.bankDetails.branch}</span>
                    </div>
                  </div>
                </>
              )}

              {/* ✅ Receipt Link */}
              {selectedTransaction.receiptUrl && (
                <div className="detail-row receipt-row">
                  <span>Receipt:</span>
                  <a 
                    href={selectedTransaction.receiptUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="receipt-link"
                    style={{
                      color: 'var(--accent-primary)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      background: 'var(--accent-glow)',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'all var(--transition-normal)'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'var(--accent-primary)';
                      e.target.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--accent-glow)';
                      e.target.style.color = 'var(--accent-primary)';
                    }}
                  >
                    <i className="fa-solid fa-image"></i> View Receipt
                  </a>
                </div>
              )}
              
              {selectedTransaction.paymentMethod && (
                <div className="detail-row">
                  <span>Payment Method:</span>
                  <span>{selectedTransaction.paymentMethod}</span>
                </div>
              )}
              {selectedTransaction.mobileNumber && (
                <div className="detail-row">
                  <span>Mobile Number:</span>
                  <span>{selectedTransaction.mobileNumber}</span>
                </div>
              )}
              {selectedTransaction.reference && (
                <div className="detail-row">
                  <span>Reference:</span>
                  <span className="tx-id">{selectedTransaction.reference}</span>
                </div>
              )}
              <div className="detail-row">
                <span>Date:</span>
                <span>
                  {selectedTransaction.date instanceof Date && !isNaN(selectedTransaction.date)
                    ? selectedTransaction.date.toLocaleDateString('bn-BD', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Invalid Date'}
                </span>
              </div>
              {selectedTransaction.adminRemark && (
                <div className="detail-row admin-remark">
                  <span>📝 Admin Remark:</span>
                  <span className="admin-remark-text">{selectedTransaction.adminRemark}</span>
                </div>
              )}
              {selectedTransaction.id && (
                <div className="detail-row">
                  <span>Transaction ID:</span>
                  <span className="tx-id">{selectedTransaction.id}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Wallet;