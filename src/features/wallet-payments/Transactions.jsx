// src/pages/Transactions.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import useHideBottomNav from '../../shared/hooks/useHideBottomNav';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../shared/ui/Sound/SoundEvents';
import { logError } from '../../shared/utils/logger';

import styles from './Transactions.module.css';


// ============================================================
// Constants
// ============================================================
const TRANSACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
};

const STATUS_CONFIG = {
  [TRANSACTION_STATUS.PENDING]: { color: '#f59e0b', icon: 'fa-clock', bg: '#f59e0b15', label: 'Pending' },
  [TRANSACTION_STATUS.PROCESSING]: { color: '#3b82f6', icon: 'fa-spinner fa-spin', bg: '#3b82f615', label: 'Processing' },
  [TRANSACTION_STATUS.COMPLETED]: { color: '#10b981', icon: 'fa-check-circle', bg: '#10b98115', label: 'Completed' },
  [TRANSACTION_STATUS.REJECTED]: { color: '#ef4444', icon: 'fa-times-circle', bg: '#ef444415', label: 'Rejected' },
  [TRANSACTION_STATUS.CANCELLED]: { color: '#6b7280', icon: 'fa-ban', bg: '#6b728015', label: 'Cancelled' },
  [TRANSACTION_STATUS.FAILED]: { color: '#ef4444', icon: 'fa-circle-exclamation', bg: '#ef444415', label: 'Failed' },
};

const TRANSACTION_TYPE = {
  CREDIT: 'credit',
  DEBIT: 'debit',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  EARNING: 'earning',
  BONUS: 'bonus',
  PAYMENT: 'payment',
};

const TYPE_ICONS = {
  [TRANSACTION_TYPE.CREDIT]: 'fa-solid fa-arrow-down',
  [TRANSACTION_TYPE.DEPOSIT]: 'fa-solid fa-circle-dollar',
  [TRANSACTION_TYPE.EARNING]: 'fa-solid fa-chart-simple',
  [TRANSACTION_TYPE.BONUS]: 'fa-solid fa-gift',
  [TRANSACTION_TYPE.DEBIT]: 'fa-solid fa-arrow-up',
  [TRANSACTION_TYPE.WITHDRAW]: 'fa-solid fa-money-bill-transfer',
  [TRANSACTION_TYPE.PAYMENT]: 'fa-solid fa-credit-card',
};

const TYPE_COLORS = {
  [TRANSACTION_TYPE.CREDIT]: '#10b981',
  [TRANSACTION_TYPE.DEPOSIT]: '#14b8a6',
  [TRANSACTION_TYPE.EARNING]: '#8b5cf6',
  [TRANSACTION_TYPE.BONUS]: '#ec4899',
  [TRANSACTION_TYPE.DEBIT]: '#ef4444',
  [TRANSACTION_TYPE.WITHDRAW]: '#f59e0b',
  [TRANSACTION_TYPE.PAYMENT]: '#3b82f6',
};

// ============================================================
// Escape a field for safe CSV output — wraps in quotes and doubles any
// internal quotes whenever the value contains a comma, quote, or newline
// (e.g. an admin remark like "Approved, thanks" used to silently break the
// exported CSV's column alignment).
// ============================================================
const csvEscape = (value) => {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const Transactions = () => {
  useHideBottomNav();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const { playEvent } = useSound();
  const user = auth.currentUser;

  // ========== State ==========
  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading); // 🔧 ADD (#25 loading consistency)
  const [transactions, setTransactions] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [stats, setStats] = useState({
    totalCredit: 0,
    totalDebit: 0,
    totalWithdraw: 0,
    totalTransactions: 0,
    pendingCount: 0,
    completedCount: 0,
  });

  // ✅ These now all live in refs scoped to this component instance, fixing
  // two bugs the previous version had:
  //  1. `previousTxStatus` used to be a module-level plain object — shared
  //     across every mount of this component for the lifetime of the tab,
  //     never cleared, growing without bound (memory leak) and persisting
  //     stale data across logout/login.
  //  2. The "is this a genuinely new transaction" check compared against
  //     the `transactions` state variable from inside a useEffect with
  //     `[user, navigate]` deps — a stale closure that only ever saw the
  //     initial (empty) value of `transactions`, making the check
  //     unreliable. previousIdsRef (mirroring the correct pattern already
  //     used in Wallet.jsx) fixes this.
  const previousLengthRef = useRef(0);
  const previousTxStatusRef = useRef({});
  const previousIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);
  const pendingAlertRef = useRef(false);

  // ============================================================
  // Back Handler
  // ============================================================
  const handleBack = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate(-1);
  };

  // ============================================================
  // Load Transactions
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    const transactionsRef = collection(db, 'transactions');
    const q = query(transactionsRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
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
          };
        });

        const newPendingCount = fetchedTransactions.filter((t) => t.status === TRANSACTION_STATUS.PENDING).length;

        // Sound on status change
        if (!isFirstLoadRef.current) {
          fetchedTransactions.forEach((tx) => {
            const prevStatus = previousTxStatusRef.current[tx.id];
            if (prevStatus && prevStatus !== tx.status) {
              if (tx.status === TRANSACTION_STATUS.COMPLETED) {
                playEvent?.(SOUND_EVENTS.SUCCESS);
              } else if (tx.status === TRANSACTION_STATUS.PENDING) {
                playEvent?.(SOUND_EVENTS.NOTIFICATION);
              } else if (tx.status === TRANSACTION_STATUS.REJECTED || tx.status === TRANSACTION_STATUS.FAILED) {
                playEvent?.(SOUND_EVENTS.ERROR);
              }
            }
            previousTxStatusRef.current[tx.id] = tx.status;
          });
        }

        // New transaction sound — compares against the ref-tracked id set
        // (always current), not the stale `transactions` state closure.
        if (!isFirstLoadRef.current) {
          const currentIds = new Set(fetchedTransactions.map((t) => t.id));
          const newIds = [...currentIds].filter((id) => !previousIdsRef.current.has(id));

          if (newIds.length > 0) {
            const newTx = fetchedTransactions.find((t) => newIds.includes(t.id));
            if (newTx) {
              if (newTx.status === TRANSACTION_STATUS.COMPLETED) {
                playEvent?.(SOUND_EVENTS.SUCCESS);
              } else if (newTx.status === TRANSACTION_STATUS.PENDING) {
                playEvent?.(SOUND_EVENTS.NOTIFICATION);
              }
            }
          }
          previousIdsRef.current = currentIds;
        } else {
          previousIdsRef.current = new Set(fetchedTransactions.map((t) => t.id));
        }

        previousLengthRef.current = fetchedTransactions.length;
        isFirstLoadRef.current = false;

        setPendingCount(newPendingCount);
        setTransactions(fetchedTransactions);
        calculateStats(fetchedTransactions);
        setLoading(false);

        if (newPendingCount > 0 && !pendingAlertRef.current) {
          pendingAlertRef.current = true;
          feedback.alert.info({ message: `⏳ You have ${newPendingCount} pending transaction${newPendingCount > 1 ? 's' : ''}.` });
        }

        if (newPendingCount === 0) {
          pendingAlertRef.current = false;
        }
      },
      (error) => {
        logError('Error loading transactions', error);
        feedback.alert.error({ message: 'Failed to load transactions. Please refresh.' });
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      // Reset per-mount tracking so a fresh mount (e.g. after switching
      // accounts) doesn't inherit stale ids/statuses.
      previousTxStatusRef.current = {};
      previousIdsRef.current = new Set();
      isFirstLoadRef.current = true;
      pendingAlertRef.current = false;
    };
  }, [user, navigate]);

  // ========== Stats Calculation ==========
  const calculateStats = (txns) => {
    const totalCredit = txns
      .filter((t) => t.type === TRANSACTION_TYPE.CREDIT || t.type === TRANSACTION_TYPE.DEPOSIT || t.type === TRANSACTION_TYPE.EARNING)
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalDebit = txns.filter((t) => t.type === TRANSACTION_TYPE.DEBIT).reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalWithdraw = txns.filter((t) => t.type === TRANSACTION_TYPE.WITHDRAW).reduce((sum, t) => sum + (t.amount || 0), 0);

    const pendingCount = txns.filter((t) => t.status === TRANSACTION_STATUS.PENDING).length;
    const completedCount = txns.filter((t) => t.status === TRANSACTION_STATUS.COMPLETED).length;

    setStats({ totalCredit, totalDebit, totalWithdraw, totalTransactions: txns.length, pendingCount, completedCount });
  };

  // ========== Filtered Transactions ==========
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (filterType !== 'all') {
      if (filterType === TRANSACTION_TYPE.CREDIT) {
        filtered = filtered.filter((t) => t.type === TRANSACTION_TYPE.CREDIT || t.type === TRANSACTION_TYPE.DEPOSIT || t.type === TRANSACTION_TYPE.EARNING);
      } else {
        filtered = filtered.filter((t) => t.type === filterType);
      }
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((t) => t.status === filterStatus);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) => t.title?.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q) || t.id?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
      );
    }

    if (dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);

      filtered = filtered.filter((t) => {
        const txDate = new Date(t.date);
        return txDate >= start && txDate <= end;
      });
    }

    return filtered;
  }, [transactions, filterType, filterStatus, searchQuery, dateRange]);

  // ========== Date Format ==========
  const formatDate = (date) => {
    if (!date) return 'Just now';
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString('en-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ========== Default Title ==========
  const getDefaultTitle = (type) => {
    const titles = {
      [TRANSACTION_TYPE.CREDIT]: 'Payment Received',
      [TRANSACTION_TYPE.DEBIT]: 'Payment Sent',
      [TRANSACTION_TYPE.WITHDRAW]: 'Withdrawal Request',
      [TRANSACTION_TYPE.DEPOSIT]: 'Deposit',
      [TRANSACTION_TYPE.EARNING]: 'Earning',
      [TRANSACTION_TYPE.BONUS]: 'Bonus Received',
    };
    return titles[type] || 'Transaction';
  };

  const getTransactionIcon = (type) => TYPE_ICONS[type] || 'fa-solid fa-circle-dollar';
  const getTransactionColor = (type) => TYPE_COLORS[type] || '#14b8a6';
  const getTransactionBgColor = (type) => `${getTransactionColor(type)}15`;
  const getStatusConfig = (status) => STATUS_CONFIG[status] || STATUS_CONFIG[TRANSACTION_STATUS.PENDING];

  const formatMoney = (amount) => new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount || 0);

  const clearFilters = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setFilterType('all');
    setFilterStatus('all');
    setSearchQuery('');
    setDateRange({ start: '', end: '' });
  };

  // ========== Export CSV ==========
  const exportCSV = () => {
    try {
      playEvent?.(SOUND_EVENTS.CLICK);

      const headers = ['Date', 'Title', 'Type', 'Amount', 'Status', 'Reference'];
      const rows = filteredTransactions.map((t) => [t.formattedDate, getTransactionTitle(t), t.type, t.amount, t.status, t.reference || '']);

      const csvContent = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      playEvent?.(SOUND_EVENTS.SUCCESS);
      feedback.alert.success({ message: '✅ CSV exported successfully!' });
    } catch (error) {
      logError('Export error', error);
      playEvent?.(SOUND_EVENTS.ERROR);
      feedback.alert.error({ message: 'Failed to export CSV.' });
    }
  };

  const getTransactionTitle = (tx) => tx.title || getDefaultTitle(tx.type);

  const getTransactionDescription = (tx) => {
    if (tx.description) return tx.description;

    const details = [];
    if (tx.reference) details.push(`Ref: ${tx.reference}`);
    if (tx.paymentMethod) details.push(`Via: ${tx.paymentMethod}`);
    if (tx.dealId) details.push(`Deal: #${tx.dealId.slice(-8)}`);
    if (tx.mobileNumber) details.push(`Mobile: ${tx.mobileNumber}`);
    if (tx.adminRemark) details.push(`📝 ${tx.adminRemark}`);

    return details.join(' • ') || '—';
  };

  const handleRefresh = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    feedback.alert.success({ message: '✅ Transactions refreshed!' });
  };

  const handleTransactionClick = (tx) => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setSelectedTransaction(tx);
  };

  const handleModalClose = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setSelectedTransaction(null);
  };

 if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-clock-rotate-left ${styles.loadingIcon}`} />
          <h2>Loading Transactions...</h2>
          <p>
            <i className="fa-solid fa-spinner fa-spin"></i> Fetching your transaction history...
          </p>
        </div>
      </div>
    );
  }

  const showPendingBanner = pendingCount > 0;

  return (
    <div className={styles.transactionsContainer}>
      <div className={styles.transactionsWrapper}>
        {showPendingBanner && (
          <div className={styles.pendingBanner}>
            <i className="fa-solid fa-clock"></i>
            <span>
              ⏳ You have <strong>{pendingCount}</strong> pending transaction{pendingCount > 1 ? 's' : ''}. Please wait for admin approval.
            </span>
          </div>
        )}

        <div className={styles.transactionsHeader}>
          <button className={styles.backBtnSimple} onClick={handleBack}>
            <i className="fa-solid fa-arrow-left"></i> Back
          </button>

          <h1>
            <i className="fa-solid fa-clock-rotate-left"></i> Transactions
            {pendingCount > 0 && <span className={styles.pendingBadge}>{pendingCount}</span>}
          </h1>

          <div className={styles.headerActions}>
            <button className={styles.refreshBtn} onClick={handleRefresh}>
              <i className="fa-solid fa-sync"></i>
            </button>
            <button className={styles.exportBtn} onClick={exportCSV}>
              <i className="fa-solid fa-file-export"></i> Export
            </button>
          </div>
        </div>

        <div className={styles.searchBar}>
          <i className="fa-solid fa-search"></i>
          <input type="text" placeholder="Search by title, reference, or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.credit}`}>
            <div className={styles.statIcon}>
              <i className="fa-solid fa-arrow-down"></i>
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Received</span>
              <span className={styles.statValue}>{formatMoney(stats.totalCredit)}</span>
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.debit}`}>
            <div className={styles.statIcon}>
              <i className="fa-solid fa-arrow-up"></i>
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Paid</span>
              <span className={styles.statValue}>{formatMoney(stats.totalDebit)}</span>
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.withdraw}`}>
            <div className={styles.statIcon}>
              <i className="fa-solid fa-money-bill-transfer"></i>
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Withdrawn</span>
              <span className={styles.statValue}>{formatMoney(stats.totalWithdraw)}</span>
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.pending}`}>
            <div className={styles.statIcon}>
              <i className="fa-solid fa-clock"></i>
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Pending</span>
              <span className={styles.statValue}>{stats.pendingCount}</span>
            </div>
          </div>
        </div>

        <div className={styles.filterSection}>
          <div className={styles.filterGroup}>
            <label>Type</label>
            <div className={styles.filterButtons}>
              <button className={`${styles.filterBtn} ${filterType === 'all' ? styles.active : ''}`} onClick={() => setFilterType('all')}>
                All <span className={styles.filterCount}>{transactions.length}</span>
              </button>
              <button className={`${styles.filterBtn} ${filterType === TRANSACTION_TYPE.CREDIT ? styles.active : ''}`} onClick={() => setFilterType(TRANSACTION_TYPE.CREDIT)}>
                <i className="fa-solid fa-arrow-down"></i> Received
                <span className={styles.filterCount}>{transactions.filter((t) => t.type === TRANSACTION_TYPE.CREDIT || t.type === TRANSACTION_TYPE.DEPOSIT || t.type === TRANSACTION_TYPE.EARNING).length}</span>
              </button>
              <button className={`${styles.filterBtn} ${filterType === TRANSACTION_TYPE.DEBIT ? styles.active : ''}`} onClick={() => setFilterType(TRANSACTION_TYPE.DEBIT)}>
                <i className="fa-solid fa-arrow-up"></i> Paid
                <span className={styles.filterCount}>{transactions.filter((t) => t.type === TRANSACTION_TYPE.DEBIT).length}</span>
              </button>
              <button className={`${styles.filterBtn} ${filterType === TRANSACTION_TYPE.WITHDRAW ? styles.active : ''}`} onClick={() => setFilterType(TRANSACTION_TYPE.WITHDRAW)}>
                <i className="fa-solid fa-money-bill-transfer"></i> Withdrawn
                <span className={styles.filterCount}>{transactions.filter((t) => t.type === TRANSACTION_TYPE.WITHDRAW).length}</span>
              </button>
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label>Status</label>
            <div className={`${styles.filterButtons} ${styles.statusFilters}`}>
              <button className={`${styles.filterBtn} ${filterStatus === 'all' ? styles.active : ''}`} onClick={() => setFilterStatus('all')}>
                All
              </button>
              <button className={`${styles.filterBtn} ${filterStatus === TRANSACTION_STATUS.COMPLETED ? styles.active : ''}`} onClick={() => setFilterStatus(TRANSACTION_STATUS.COMPLETED)}>
                <i className="fa-solid fa-check-circle" style={{ color: '#10b981' }}></i> Completed
              </button>
              <button className={`${styles.filterBtn} ${filterStatus === TRANSACTION_STATUS.PENDING ? styles.active : ''}`} onClick={() => setFilterStatus(TRANSACTION_STATUS.PENDING)}>
                <i className="fa-solid fa-clock" style={{ color: '#f59e0b' }}></i> Pending
              </button>
              <button className={`${styles.filterBtn} ${filterStatus === TRANSACTION_STATUS.FAILED ? styles.active : ''}`} onClick={() => setFilterStatus(TRANSACTION_STATUS.FAILED)}>
                <i className="fa-solid fa-times-circle" style={{ color: '#ef4444' }}></i> Failed
              </button>
            </div>
          </div>

          <div className={`${styles.filterGroup} ${styles.dateFilter}`}>
            <label>Date Range</label>
            <div className={styles.dateInputs}>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} />
              <span>to</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} />
            </div>
          </div>

          {(filterType !== 'all' || filterStatus !== 'all' || searchQuery || dateRange.start || dateRange.end) && (
            <button className={styles.clearFiltersBtn} onClick={clearFilters}>
              <i className="fa-solid fa-eraser"></i> Clear Filters
            </button>
          )}
        </div>

        <div className={styles.resultCount}>
          <span>
            Showing <strong>{filteredTransactions.length}</strong> of <strong>{transactions.length}</strong> transactions
          </span>
          {filteredTransactions.length !== transactions.length && <span className={styles.filteredInfo}>(filtered)</span>}
        </div>

        <div className={styles.transactionsList}>
          {filteredTransactions.length === 0 ? (
            <div className={styles.noTransactions}>
              <i className="fa-solid fa-receipt"></i>
              <h3>No Transactions Found</h3>
              <p>
                {searchQuery || filterType !== 'all' || filterStatus !== 'all' || dateRange.start || dateRange.end
                  ? 'No transactions match your filters. Try adjusting your search criteria.'
                  : "You don't have any transactions yet."}
              </p>
              {(searchQuery || filterType !== 'all' || filterStatus !== 'all' || dateRange.start || dateRange.end) && (
                <button className={styles.clearFiltersBtn} onClick={clearFilters}>
                  <i className="fa-solid fa-eraser"></i> Clear Filters
                </button>
              )}
              {!searchQuery && filterType === 'all' && filterStatus === 'all' && !dateRange.start && !dateRange.end && (
                <button className={styles.browseBtn} onClick={() => navigate('/')}>
                  <i className="fa-solid fa-search"></i> Browse Jobs
                </button>
              )}
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const statusConfig = getStatusConfig(tx.status);
              const color = getTransactionColor(tx.type);
              const icon = getTransactionIcon(tx.type);
              const isCredit = tx.type === TRANSACTION_TYPE.CREDIT || tx.type === TRANSACTION_TYPE.DEPOSIT || tx.type === TRANSACTION_TYPE.EARNING;

              return (
                <div key={tx.id} className={styles.transactionCard} onClick={() => handleTransactionClick(tx)}>
                  <div className={styles.txIcon} style={{ background: getTransactionBgColor(tx.type) }}>
                    <i className={icon} style={{ color }}></i>
                  </div>

                  <div className={styles.txContent}>
                    <div className={styles.txHeader}>
                      <h4>{getTransactionTitle(tx)}</h4>
                      <span className={styles.txTime}>{tx.formattedDate}</span>
                    </div>

                    <p className={styles.txDescription}>{getTransactionDescription(tx)}</p>

                    <div className={styles.txFooter}>
                      <div className={styles.txMeta}>
                        {tx.paymentMethod && (
                          <span className={styles.txMethod}>
                            <i className="fa-solid fa-credit-card"></i> {tx.paymentMethod}
                          </span>
                        )}
                        {tx.reference && (
                          <span className={styles.txRef}>
                            <i className="fa-solid fa-hashtag"></i> {tx.reference}
                          </span>
                        )}
                        <span className={`${styles.txStatus} ${styles[tx.status]}`} style={{ color: statusConfig.color, background: statusConfig.bg }}>
                          <i className={`fa-solid ${statusConfig.icon}`}></i>
                          {statusConfig.label}
                        </span>
                      </div>

                      <div className={`${styles.txAmount} ${isCredit ? styles.credit : styles.debit}`}>
                        {isCredit ? '+' : '-'}
                        {formatMoney(tx.amount)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

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
                  <strong className={selectedTransaction.type === TRANSACTION_TYPE.CREDIT || selectedTransaction.type === TRANSACTION_TYPE.DEPOSIT ? styles.creditText : styles.debitText}>
                    {formatMoney(selectedTransaction.amount)}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Type:</span>
                  <span className={styles.typeBadge}>{selectedTransaction.type}</span>
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
                <div className={styles.detailRow}>
                  <span>Description:</span>
                  <span>{selectedTransaction.description || '—'}</span>
                </div>
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
                    {selectedTransaction.date?.toLocaleDateString('en-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
    </div>
  );
};

export default Transactions;