// src/pages/Wallet.jsx
//
// wallets/{uid}.lockedBalance represents money the user (as a BUYER) has
// committed to active deals — set/released exclusively by DealManager.jsx
// (activateDealWithEscrowLock / releaseEscrowLock) and PaymentGateway.jsx
// (funding a milestone moves money from locked -> gone). This page reads
// and displays it so the person always sees what's actually theirs to
// withdraw or send, vs. what's tied up in a deal.
//
// IMPORTANT FOR /withdraw AND /send-money: both flows validate the
// requested amount against `balance - lockedBalance` (see Withdraw.jsx and
// SendMoney.jsx), not raw `balance`.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../shared/ui/Sound/SoundEvents';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import styles from './Wallet.module.css';

import WalletActions from './WalletActions';
import { useAuth } from '../../shared/context/AuthContext';
import { sendWalletBalanceNotification } from '../notifications/notificationHelper';
import GuideModal from './components/GuideModal';
import { logError } from '../../shared/utils/logger';

// ============================================================
// Constants — shared with Transactions/PaymentHistory
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

  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading); // 🔧 ADD (#25 loading consistency)
  const [walletData, setWalletData] = useState({
    balance: 0,
    totalEarned: 0,
    totalWithdrawn: 0,
    pendingWithdraw: 0,
    lockedBalance: 0,
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
    pendingCount: 0,
  });

  const previousBalanceRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const lastNotificationTimeRef = useRef(0);
  const previousStatusMap = useRef({});
  const previousIdsRef = useRef(new Set());
  const pendingAlertRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const autoSubmit = params.get('autoSubmitProposal');
    const chatId = params.get('chatId');

    if (autoSubmit === 'true' && chatId) {
      const pendingOffer = sessionStorage.getItem('pendingProposal');
      if (pendingOffer) {
        sessionStorage.removeItem('pendingProposal');
        const parsed = JSON.parse(pendingOffer);

        const submitData = { chatId: parsed.chatId, amount: parsed.amount, description: parsed.description, fromDeposit: true };

        setTimeout(() => {
          navigate(`/chat/${chatId}?autoSubmit=true`, { state: { pendingProposal: submitData } });
        }, 500);
      }
    }
  }, [location, navigate]);

  // ============================================================
  // Load Wallet & Transactions
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    feedback.toast({ title: 'Loading', message: 'Loading wallet...', duration: 2000 });

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
            updatedAt: serverTimestamp(),
          };
          await setDoc(walletRef, newWallet);
        }
      } catch (error) {
        logError('Error initializing wallet', error);
      }
    };
    initWallet();

    const walletRef = doc(db, 'wallets', user.uid);
    const unsubscribeWallet = onSnapshot(
      walletRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const newBalance = data.balance || 0;
          const oldBalance = previousBalanceRef.current;

          setWalletData({
            balance: newBalance,
            totalEarned: data.totalEarned || 0,
            totalWithdrawn: data.totalWithdrawn || 0,
            pendingWithdraw: data.pendingWithdraw || 0,
            lockedBalance: data.lockedBalance || 0,
          });

          const now = Date.now();
          if (!isInitialLoadRef.current && oldBalance !== newBalance) {
            const difference = newBalance - oldBalance;

            if (difference > 0 && now - lastNotificationTimeRef.current > 3000) {
              lastNotificationTimeRef.current = now;
              playEvent?.(SOUND_EVENTS.WALLET);
              if (user?.uid) {
                sendWalletBalanceNotification(user.uid, difference, 'credit', 'Wallet Balance Updated');
              }
            }

            if (difference < 0 && now - lastNotificationTimeRef.current > 3000) {
              lastNotificationTimeRef.current = now;
              playEvent?.(SOUND_EVENTS.WALLET);
              sendWalletBalanceNotification(user.uid, Math.abs(difference), 'debit', 'Wallet Balance Decreased');
            }
          }

          previousBalanceRef.current = newBalance;
          if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
          }
        }
        setLoading(false);
      },
      (error) => {
        logError('Wallet listener error', error);
        setLoading(false);
      }
    );

    const transactionsRef = collection(db, 'transactions');
    const q = query(transactionsRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribeTransactions = onSnapshot(
      q,
      (snapshot) => {
        const fetchedTransactions = snapshot.docs.map((d) => {
          const data = d.data();
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

          const docId = d.id || `tx-${Date.now()}`;

          return {
            id: docId,
            ...data,
            date,
            formattedDate,
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
            isEscrow: data.isEscrow || false,
          };
        });

        const newPendingCount = fetchedTransactions.filter((t) => t.status === TRANSACTION_STATUS.PENDING).length;

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

        if (!isInitialLoadRef.current) {
          const currentIds = new Set(fetchedTransactions.map((p) => p.id));
          const newIds = new Set([...currentIds].filter((id) => !previousIdsRef.current.has(id)));

          if (newIds.size > 0) {
            const newTx = fetchedTransactions.find((p) => newIds.has(p.id));
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

        if (newPendingCount > 0 && !pendingAlertRef.current) {
          pendingAlertRef.current = true;
          feedback.alert.info({ message: `⏳ You have ${newPendingCount} pending transaction${newPendingCount > 1 ? 's' : ''}.` });
        }

        if (newPendingCount === 0) {
          pendingAlertRef.current = false;
        }
      },
      (error) => {
        logError('Transactions listener error', error);
      }
    );

    return () => {
      unsubscribeWallet();
      unsubscribeTransactions();
      previousStatusMap.current = {};
      previousIdsRef.current = new Set();
      pendingAlertRef.current = false;
    };
  }, [user, navigate, userData?.walletId]);

  // Available (withdrawable) balance = total balance minus whatever is
  // locked/reserved for active deals as a buyer.
  const availableBalance = Math.max(0, walletData.balance - walletData.lockedBalance);

  const calculateStats = (txns) => {
    const totalCredit = txns.filter((t) => t.type === 'credit' || t.type === 'deposit' || t.type === 'earning' || t.type === 'bank-transfer').reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalDebit = txns.filter((t) => t.type === 'debit').reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalWithdraw = txns.filter((t) => t.type === 'withdraw').reduce((sum, t) => sum + (t.amount || 0), 0);
    const pendingCount = txns.filter((t) => t.status === TRANSACTION_STATUS.PENDING).length;

    setStats({ totalCredit, totalDebit, totalWithdraw, totalTransactions: txns.length, pendingCount });
  };

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (filterType !== 'all') {
      filtered = filtered.filter((t) => t.type === filterType);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.reference?.toLowerCase().includes(q) ||
          t.id?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.paymentMethod?.toLowerCase().includes(q) ||
          t.bankDetails?.accountName?.toLowerCase().includes(q) ||
          t.bankDetails?.bankName?.toLowerCase().includes(q) ||
          t.bankDetails?.accountNumber?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [transactions, filterType, searchQuery]);

  const formatDate = (date) => {
    if (!date) return 'Just now';
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getDefaultTitle = (type) => {
    const titles = {
      credit: 'Payment Received',
      debit: 'Payment Sent',
      withdraw: 'Withdrawal Request',
      deposit: 'Deposit',
      'bank-transfer': 'Bank Transfer Deposit',
      earning: 'Earning',
      bonus: 'Bonus Received',
    };
    return titles[type] || 'Transaction';
  };

  const getTransactionTitle = (tx) => tx.title || getDefaultTitle(tx.type);

  const formatMoney = (amount) => new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount || 0);

  const clearFilters = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setFilterType('all');
    setSearchQuery('');
  };

  const handleRefresh = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    feedback.toast({ title: 'Refreshed', message: 'Wallet is up to date!', duration: 2000 });
  };

  const handleTransactionClick = (tx) => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setSelectedTransaction(tx);
  };

  const handleModalClose = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setSelectedTransaction(null);
  };

 const getStatusConfig = (status) => STATUS_CONFIG[status] || STATUS_CONFIG[TRANSACTION_STATUS.PENDING];
  const getTypeConfig = (type) => TYPE_CONFIG[type] || TYPE_CONFIG['deposit'];

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-wallet ${styles.loadingIcon}`} />
          <h2>Loading Wallet...</h2>
          <p>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your wallet information...
          </p>
          <div className={styles.loadingDots}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    );
  }

  const showPendingBanner = pendingCount > 0;
  const showLockedBanner = walletData.lockedBalance > 0;

  return (
    <div className={styles.walletContainerModern}>
      <GuideModal guideKey="wallet" />

      {showPendingBanner && (
        <div className={styles.pendingBanner}>
          <i className="fa-solid fa-clock"></i>
          <span>
            ⏳ You have <strong>{pendingCount}</strong> pending transaction{pendingCount > 1 ? 's' : ''}. Please wait for admin approval.
          </span>
        </div>
      )}

      {showLockedBanner && (
        <div className={`${styles.pendingBanner} ${styles.lockedBanner}`}>
          <span>
            🔒 <strong>{formatMoney(walletData.lockedBalance)}</strong> আপনার একটিভ ডিলে reserved আছে — এই টাকা withdraw বা send করা যাবে না যতক্ষণ না ডিল শেষ/বাতিল হয়। Available to withdraw:{' '}
            <strong>{formatMoney(availableBalance)}</strong>
          </span>
        </div>
      )}

      <div className={styles.walletIdDisplay}>
        <span className={styles.walletIdLabel}>
          <i className="fa-regular fa-credit-card"></i> Wallet ID:
        </span>
        <strong className={styles.walletIdValue}>{userData?.walletId || 'Loading...'}</strong>
        <button
          className={styles.copyWalletIdBtn}
          onClick={() => {
            playEvent?.(SOUND_EVENTS.CLICK);
            navigator.clipboard.writeText(userData?.walletId || '');
            feedback.alert.success({ message: 'Wallet ID copied!' });
          }}
        >
          <i className="fa-solid fa-copy"></i> Copy
        </button>
      </div>

      <WalletActions 
        walletBalance={walletData.balance} 
        availableBalance={availableBalance} 
        lockedBalance={walletData.lockedBalance} 
        onRefresh={handleRefresh} 
      />

      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Received</span>
          <span className={`${styles.statValue} ${styles.positive}`}>{formatMoney(stats.totalCredit)}</span>
        </div>
        <div className={styles.statDivider}></div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Sent</span>
          <span className={`${styles.statValue} ${styles.negative}`}>{formatMoney(stats.totalDebit)}</span>
        </div>
        <div className={styles.statDivider}></div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Withdrawn</span>
          <span className={styles.statValue}>{formatMoney(stats.totalWithdraw)}</span>
        </div>
        <div className={styles.statDivider}></div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Locked (Active Deals)</span>
          <span className={`${styles.statValue} ${walletData.lockedBalance > 0 ? styles.locked : ''}`}>
            {formatMoney(walletData.lockedBalance)}
          </span>
        </div>
        <div className={styles.statDivider}></div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Pending</span>
          <span className={`${styles.statValue} ${styles.pendingCount}`}>{stats.pendingCount}</span>
        </div>
      </div>

      <div className={styles.walletSectionHeader}>
        <h3>
          <i className="fa-solid fa-clock-rotate-left"></i> Recent Transactions
          {pendingCount > 0 && <span className={styles.pendingBadge}>{pendingCount}</span>}
        </h3>
        <button
          className={styles.viewAllBtn}
          onClick={() => {
            playEvent?.(SOUND_EVENTS.CLICK);
            navigate('/transactions');
          }}
        >
          View All <i className="fa-solid fa-arrow-right"></i>
        </button>
      </div>

      <div className={styles.searchBar}>
        <i className="fa-solid fa-search"></i>
        <input type="text" placeholder="Search transactions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        {searchQuery && (
          <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      <div className={styles.filterSection}>
        {FILTER_TYPES.map((type) => (
          <button
            key={type.key}
            className={`${styles.filterBtn} ${filterType === type.key ? styles.active : ''}`}
            onClick={() => {
              playEvent?.(SOUND_EVENTS.CLICK);
              setFilterType(type.key);
            }}
          >
            {type.label}
            {type.key === 'all' && transactions.length > 0 && <span className={styles.filterCount}>{transactions.length}</span>}
          </button>
        ))}
        {(filterType !== 'all' || searchQuery) && (
          <button className={styles.clearFiltersBtn} onClick={clearFilters}>
            <i className="fa-solid fa-eraser"></i> Clear
          </button>
        )}
      </div>

      <div className={styles.resultCount}>
        <span>
          Showing <strong>{filteredTransactions.length}</strong> of <strong>{transactions.length}</strong> transactions
        </span>
      </div>

      <div className={styles.transactionsListModern}>
        {filteredTransactions.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fa-solid fa-receipt"></i>
            <h3>No Transactions Found</h3>
            <p>{searchQuery || filterType !== 'all' ? 'No transactions match your filters. Try adjusting your search criteria.' : "You don't have any transactions yet."}</p>
            {(searchQuery || filterType !== 'all') && (
              <button className={styles.clearFiltersBtn} onClick={clearFilters}>
                <i className="fa-solid fa-eraser"></i> Clear Filters
              </button>
            )}
            {!searchQuery && filterType === 'all' && (
              <div className={styles.emptyActions}>
                <button
                  className={styles.browseBtn}
                  onClick={() => {
                    playEvent?.(SOUND_EVENTS.CLICK);
                    navigate('/deposit');
                  }}
                >
                  <i className="fa-solid fa-circle-dollar"></i> Deposit
                </button>
                <button
                  className={`${styles.browseBtn} ${styles.secondary}`}
                  onClick={() => {
                    playEvent?.(SOUND_EVENTS.CLICK);
                    navigate('/send-money');
                  }}
                >
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
              <div key={tx.id} className={`${styles.transactionItemModern} ${styles[tx.status]}`} onClick={() => handleTransactionClick(tx)}>
                <div className={styles.txIcon} style={{ background: typeConfig.bg, color: typeConfig.color }}>
                  <i className={typeConfig.icon}></i>
                </div>

                <div className={styles.txDetails}>
                  <h4>
                    {getTransactionTitle(tx)}
                    {tx.isEscrow && (
                      <span className={styles.escrowBadge}>ESCROW</span>
                    )}
                  </h4>
                  <p className={styles.txDate}>{tx.formattedDate}</p>
                  {tx.reference && <small className={styles.txReference}>Ref: {tx.reference}</small>}
                  {tx.description && <small className={styles.txDescription}>{tx.description}</small>}
                  {tx.bankDetails && (
                    <small className={styles.txBankDetails}>
                      <i className="fa-solid fa-building-columns"></i> {tx.bankDetails.bankName}
                    </small>
                  )}
                </div>

                <div className={styles.txRight}>
                  <div className={`${styles.txAmount} ${isCredit ? styles.credit : styles.debit}`}>
                    {isCredit ? '+' : '-'} {formatMoney(tx.amount)}
                  </div>

                  <div className={`${styles.txStatus} ${styles[tx.status]}`} style={{ color: statusConfig.color, background: statusConfig.bg }}>
                    <i className={`fa-solid ${statusConfig.icon}`}></i>
                    <span>{statusConfig.label}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {transactions.length > 0 && (
        <div className={styles.walletFooter}>
          <span>
            Showing {Math.min(filteredTransactions.length, 10)} of {transactions.length} transactions
          </span>
          {transactions.length > 10 && (
            <button
              className={styles.viewAllBtn}
              onClick={() => {
                playEvent?.(SOUND_EVENTS.CLICK);
                navigate('/transactions');
              }}
            >
              View All <i className="fa-solid fa-arrow-right"></i>
            </button>
          )}
        </div>
      )}

      {selectedTransaction && (
        <div className={styles.modalOverlay} onClick={handleModalClose}>
          <div className={styles.detailsModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>
                <i className="fa-solid fa-receipt"></i> Transaction Details
              </h3>
              <button className={styles.closeBtn} onClick={handleModalClose}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.detailRow}>
                <span>Amount:</span>
                <strong className={selectedTransaction.type === 'credit' || selectedTransaction.type === 'deposit' || selectedTransaction.type === 'bank-transfer' ? styles.creditText : styles.debitText}>
                  {formatMoney(selectedTransaction.amount)}
                </strong>
              </div>
              <div className={styles.detailRow}>
                <span>Type:</span>
                <span className={styles.typeBadge}>{selectedTransaction.type === 'bank-transfer' ? 'Bank Transfer' : selectedTransaction.type}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Status:</span>
                {(() => {
                  const config = getStatusConfig(selectedTransaction.status);
                  return (
                    <span className={`${styles.statusBadge} ${styles[selectedTransaction.status]}`} style={{ color: config.color, background: config.bg }}>
                      <i className={`fa-solid ${config.icon}`}></i> {config.label}
                    </span>
                  );
                })()}
              </div>
              <div className={styles.detailRow}>
                <span>Title:</span>
                <span>{getTransactionTitle(selectedTransaction)}</span>
              </div>
              {selectedTransaction.isEscrow && (
                <div className={styles.detailRow}>
                  <span>Note:</span>
                  <span className={styles.escrowNote}>
                    <i className="fa-solid fa-lock"></i> এই টাকা escrow-তে জমা আছে, এখনো অন্যপক্ষকে পাঠানো হয়নি।
                  </span>
                </div>
              )}
              {selectedTransaction.description && (
                <div className={styles.detailRow}>
                  <span>Description:</span>
                  <span>{selectedTransaction.description}</span>
                </div>
              )}

              {selectedTransaction.bankDetails && (
                <>
                  <div className={styles.detailDivider}></div>
                  <div className={styles.bankDetailsModal}>
                    <h4>
                      <i className="fa-solid fa-building-columns" style={{ color: 'var(--accent-primary)' }}></i> Bank Transfer Details
                    </h4>
                    <div className={styles.detailRow}>
                      <span>Account Holder:</span>
                      <span>
                        <strong>{selectedTransaction.bankDetails.accountName}</strong>
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Account Number:</span>
                      <span>
                        <strong>{selectedTransaction.bankDetails.accountNumber}</strong>
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Bank Name:</span>
                      <span>{selectedTransaction.bankDetails.bankName}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Branch:</span>
                      <span>{selectedTransaction.bankDetails.branch}</span>
                    </div>
                  </div>
                </>
              )}

              {selectedTransaction.receiptUrl && (
                <div className={`${styles.detailRow} ${styles.receiptRow}`}>
                  <span>Receipt:</span>
                  <a
                    href={selectedTransaction.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.receiptLink}
                  >
                    <i className="fa-solid fa-image"></i> View Receipt
                  </a>
                </div>
              )}

              {selectedTransaction.paymentMethod && (
                <div className={styles.detailRow}>
                  <span>Payment Method:</span>
                  <span>{selectedTransaction.paymentMethod}</span>
                </div>
              )}
              {selectedTransaction.mobileNumber && (
                <div className={styles.detailRow}>
                  <span>Mobile Number:</span>
                  <span>{selectedTransaction.mobileNumber}</span>
                </div>
              )}
              {selectedTransaction.reference && (
                <div className={styles.detailRow}>
                  <span>Reference:</span>
                  <span className={styles.txId}>{selectedTransaction.reference}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span>Date:</span>
                <span>
                  {selectedTransaction.date instanceof Date && !isNaN(selectedTransaction.date)
                    ? selectedTransaction.date.toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'Invalid Date'}
                </span>
              </div>
              {selectedTransaction.adminRemark && (
                <div className={`${styles.detailRow} ${styles.adminRemark}`}>
                  <span>📝 Admin Remark:</span>
                  <span className={styles.adminRemarkText}>{selectedTransaction.adminRemark}</span>
                </div>
              )}
              {selectedTransaction.id && (
                <div className={styles.detailRow}>
                  <span>Transaction ID:</span>
                  <span className={styles.txId}>{selectedTransaction.id}</span>
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