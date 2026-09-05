// src/pages/PaymentHistory.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../shared/ui/Sound/SoundEvents';
import useHideBottomNav from "../../shared/hooks/useHideBottomNav";
import styles from './PaymentHistory.module.css';


// ============================================================
// ✅ Constants - Shared with Transactions
// ============================================================
const PAYMENT_TYPE = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  SEND: 'send',
  CREDIT: 'credit',
  DEBIT: 'debit',
  PAYMENT: 'payment',
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const STATUS_CONFIG = {
  [PAYMENT_STATUS.PENDING]: { color: '#f59e0b', icon: 'fa-clock', bg: '#f59e0b15', label: 'Pending' },
  [PAYMENT_STATUS.PROCESSING]: { color: '#3b82f6', icon: 'fa-spinner fa-spin', bg: '#3b82f615', label: 'Processing' },
  [PAYMENT_STATUS.COMPLETED]: { color: '#10b981', icon: 'fa-check-circle', bg: '#10b98115', label: 'Completed' },
  [PAYMENT_STATUS.REJECTED]: { color: '#ef4444', icon: 'fa-times-circle', bg: '#ef444415', label: 'Rejected' },
  [PAYMENT_STATUS.FAILED]: { color: '#ef4444', icon: 'fa-circle-exclamation', bg: '#ef444415', label: 'Failed' },
  [PAYMENT_STATUS.CANCELLED]: { color: '#6b7280', icon: 'fa-ban', bg: '#6b728015', label: 'Cancelled' },
};

const TYPE_CONFIG = {
  [PAYMENT_TYPE.DEPOSIT]: { icon: 'fa-solid fa-arrow-down', color: '#10b981', bg: '#10b98115', label: 'Deposit' },
  [PAYMENT_TYPE.WITHDRAW]: { icon: 'fa-solid fa-arrow-up', color: '#f59e0b', bg: '#f59e0b15', label: 'Withdraw' },
  [PAYMENT_TYPE.SEND]: { icon: 'fa-solid fa-paper-plane', color: '#3b82f6', bg: '#3b82f615', label: 'Send Money' },
  [PAYMENT_TYPE.CREDIT]: { icon: 'fa-solid fa-circle-dollar', color: '#10b981', bg: '#10b98115', label: 'Received' },
  [PAYMENT_TYPE.DEBIT]: { icon: 'fa-solid fa-circle-dollar', color: '#ef4444', bg: '#ef444415', label: 'Paid' },
  [PAYMENT_TYPE.PAYMENT]: { icon: 'fa-solid fa-credit-card', color: '#8b5cf6', bg: '#8b5cf615', label: 'Payment' },
};

// ✅ Array of all filterable types
const FILTER_TYPES = [
  { key: 'all', label: 'All', icon: null },
  { key: PAYMENT_TYPE.DEPOSIT, label: 'Deposits', icon: 'fa-solid fa-arrow-down' },
  { key: PAYMENT_TYPE.WITHDRAW, label: 'Withdrawals', icon: 'fa-solid fa-arrow-up' },
  { key: PAYMENT_TYPE.SEND, label: 'Sent', icon: 'fa-solid fa-paper-plane' },
  { key: PAYMENT_TYPE.CREDIT, label: 'Received', icon: 'fa-solid fa-circle-dollar' },
  { key: PAYMENT_TYPE.DEBIT, label: 'Paid', icon: 'fa-solid fa-circle-dollar' },
  { key: PAYMENT_TYPE.PAYMENT, label: 'Payment', icon: 'fa-solid fa-credit-card' },
];

const PaymentHistory = () => {
  useHideBottomNav();
  
  const navigate = useNavigate();
  const user = auth.currentUser;
  const feedback = useFeedback();
  const { playEvent } = useSound();
  
  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading); // 🔧 ADD (#25 loading consistency)
  const [payments, setPayments] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [stats, setStats] = useState({
    totalDeposit: 0,
    totalWithdraw: 0,
    totalSend: 0,
    totalTransactions: 0,
    pendingCount: 0
  });

  // ✅ Refs for tracking (FIXED)
  const previousLengthRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  const previousStatusMap = useRef({});
  const previousIdsRef = useRef(new Set());
  const pendingAlertRef = useRef(false);

  // ============================================================
  // ✅ Back Handler
  // ============================================================
  const handleBack = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate(-1);
  };

  // ============================================================
  // ✅ Load Payment History (FIXED)
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    // ✅ Use toast instead of alert (FIXED)
    feedback.toast({
      title: 'Loading',
      message: 'Loading payment history...',
      duration: 2000
    });

    const transactionsRef = collection(db, 'transactions');
    const q = query(
      transactionsRef,
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPayments = snapshot.docs.map(doc => {
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
        
        const docId = doc.id || `pmt-${Date.now()}`;
        
        return {
          id: docId,
          ...data,
          date: date,
          formattedDate: formattedDate,
          amount: data.amount || 0,
          type: data.type || PAYMENT_TYPE.DEPOSIT,
          status: data.status || PAYMENT_STATUS.PENDING,
          title: data.title || getDefaultTitle(data.type),
          reference: data.reference || data.transactionId || data.id || docId.slice(-8) || 'N/A',
          adminRemark: data.adminRemark || null,
          paymentMethod: data.paymentMethod || null,
          mobileNumber: data.mobileNumber || null,
          note: data.note || null,
          description: data.description || null,
        };
      });
      
      // ✅ New pending count
      const newPendingCount = fetchedPayments.filter(t => t.status === PAYMENT_STATUS.PENDING).length;
      
      // ✅ Status change sound detection (FIXED - with cleanup)
      if (!isFirstLoadRef.current) {
        fetchedPayments.forEach((pmt) => {
          const prevStatus = previousStatusMap.current[pmt.id];
          if (prevStatus && prevStatus !== pmt.status) {
            if (pmt.status === PAYMENT_STATUS.COMPLETED) {
              playEvent?.(SOUND_EVENTS.SUCCESS);
            } else if (pmt.status === PAYMENT_STATUS.PENDING) {
              playEvent?.(SOUND_EVENTS.NOTIFICATION);
            } else if (pmt.status === PAYMENT_STATUS.REJECTED || pmt.status === PAYMENT_STATUS.FAILED) {
              playEvent?.(SOUND_EVENTS.ERROR);
            }
          }
          previousStatusMap.current[pmt.id] = pmt.status;
        });
      }
      
      // ✅ New transaction detection (FIXED - using refs)
      if (!isFirstLoadRef.current) {
        const currentIds = new Set(fetchedPayments.map(p => p.id));
        const newIds = new Set([...currentIds].filter(id => !previousIdsRef.current.has(id)));
        
        if (newIds.size > 0) {
          const newPmt = fetchedPayments.find(p => newIds.has(p.id));
          if (newPmt) {
            if (newPmt.status === PAYMENT_STATUS.COMPLETED) {
              playEvent?.(SOUND_EVENTS.SUCCESS);
            } else if (newPmt.status === PAYMENT_STATUS.PENDING) {
              playEvent?.(SOUND_EVENTS.NOTIFICATION);
            }
          }
        }
        previousIdsRef.current = currentIds;
      }
      
      previousLengthRef.current = fetchedPayments.length;
      isFirstLoadRef.current = false;
      
      setPendingCount(newPendingCount);
      setPayments(fetchedPayments);
      calculateStats(fetchedPayments);
      setLoading(false);
      
      // ✅ Pending notification (FIXED - using ref)
      if (newPendingCount > 0 && !pendingAlertRef.current) {
        pendingAlertRef.current = true;
        feedback.alert.info({
          message: `⏳ You have ${newPendingCount} pending payment${newPendingCount > 1 ? 's' : ''}.`
        });
      }

      if (newPendingCount === 0) {
        pendingAlertRef.current = false;
      }

    }, (error) => {
      console.error("❌ Error loading payment history:", error);
      feedback.alert.error({
        message: "Failed to load payment history. Please refresh."
      });
      setLoading(false);
    });

    // ✅ Cleanup (FIXED)
    return () => {
      unsubscribe();
      previousStatusMap.current = {};
      previousIdsRef.current = new Set();
      pendingAlertRef.current = false;
    };
  }, [user, navigate]);

  // ============================================================
  // ✅ Stats Calculation
  // ============================================================
  const calculateStats = (txns) => {
    const totalDeposit = txns
      .filter(t => t.type === PAYMENT_TYPE.DEPOSIT && t.status === PAYMENT_STATUS.COMPLETED)
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const totalWithdraw = txns
      .filter(t => t.type === PAYMENT_TYPE.WITHDRAW && t.status === PAYMENT_STATUS.COMPLETED)
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const totalSend = txns
      .filter(t => (t.type === PAYMENT_TYPE.SEND || t.type === PAYMENT_TYPE.DEBIT) && t.status === PAYMENT_STATUS.COMPLETED)
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const pendingCount = txns.filter(t => t.status === PAYMENT_STATUS.PENDING).length;
    
    setStats({
      totalDeposit,
      totalWithdraw,
      totalSend,
      totalTransactions: txns.length,
      pendingCount
    });
  };

  // ============================================================
  // ✅ Filtered Payments (useMemo)
  // ============================================================
  const filteredPayments = useMemo(() => {
    let filtered = payments;

    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.type === filterType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => 
        p.title?.toLowerCase().includes(query) ||
        p.reference?.toLowerCase().includes(query) ||
        p.id?.toLowerCase().includes(query) ||
        p.note?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.paymentMethod?.toLowerCase().includes(query) ||
        p.mobileNumber?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [payments, filterType, searchQuery]);

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
      [PAYMENT_TYPE.DEPOSIT]: 'Deposit',
      [PAYMENT_TYPE.WITHDRAW]: 'Withdrawal',
      [PAYMENT_TYPE.SEND]: 'Money Sent',
      [PAYMENT_TYPE.CREDIT]: 'Payment Received',
      [PAYMENT_TYPE.DEBIT]: 'Payment Sent',
      [PAYMENT_TYPE.PAYMENT]: 'Payment',
    };
    return titles[type] || 'Transaction';
  };

  // ============================================================
  // ✅ Get Payment Title
  // ============================================================
  const getPaymentTitle = (pmt) => {
    if (pmt.title) return pmt.title;
    return getDefaultTitle(pmt.type);
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
  // ✅ Refresh (FIXED)
  // ============================================================
  const handleRefresh = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    // ✅ Firestore is real-time, just show feedback
    feedback.toast({
      title: 'Refreshed',
      message: 'Payment history is up to date!',
      duration: 2000
    });
  };

  // ============================================================
  // ✅ Payment Click
  // ============================================================
  const handlePaymentClick = (pmt) => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setSelectedPayment(pmt);
  };

  // ============================================================
  // ✅ Modal Close
  // ============================================================
  const handleModalClose = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setSelectedPayment(null);
  };

  // ============================================================
  // ✅ Loading State
  // ============================================================
// src/pages/PaymentHistory.jsx - Loading State

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
        <h2>Loading Payment History...</h2>
        <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
          <i className="fa-solid fa-spinner fa-spin"></i> Loading your transactions...
        </p>
      </div>
    </div>
  );
}

 // ============================================================
  // ✅ Render
  // ============================================================
  const showPendingBanner = pendingCount > 0;

  return (
    <div className={styles.paymenthistoryContainer}>
      <div className={styles.paymenthistoryCard}>
        
        {/* ✅ Pending Banner */}
        {showPendingBanner && (
          <div className={styles.pendingBanner}>
            <i className="fa-solid fa-clock"></i>
            <span>
              ⏳ You have <strong>{pendingCount}</strong> pending payment{pendingCount > 1 ? 's' : ''}. 
              Please wait for admin approval.
            </span>
          </div>
        )}

        {/* ✅ Back Button */}
        <button className={styles.backBtnSimple} onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        {/* Header */}
        <div className={styles.paymenthistoryHeader}>
          <h2>
            <i className="fa-solid fa-receipt"></i> Payment History
            {pendingCount > 0 && (
              <span className={styles.pendingBadge}>{pendingCount}</span>
            )}
          </h2>
          <div className={styles.headerActions}>
            <button className={styles.refreshBtn} onClick={handleRefresh}>
              <i className="fa-solid fa-sync"></i>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className={styles.searchBar}>
          <i className="fa-solid fa-search"></i>
          <input
            type="text"
            placeholder="Search by title, reference, ID, or method..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        {/* Stats Bar */}
        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Deposits</span>
            <span className={`${styles.statValue} ${styles.positive}`}>{formatMoney(stats.totalDeposit)}</span>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Withdrawals</span>
            <span className={`${styles.statValue} ${styles.negative}`}>{formatMoney(stats.totalWithdraw)}</span>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Sent</span>
            <span className={styles.statValue}>{formatMoney(stats.totalSend)}</span>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Pending</span>
            <span className={`${styles.statValue} ${styles.pendingCount}`}>{stats.pendingCount}</span>
          </div>
        </div>

        {/* Filter Section - With all types */}
        <div className={styles.filterSection}>
          {FILTER_TYPES.map((type) => (
            <button 
              key={type.key}
              className={`${styles.filterBtn} ${filterType === type.key ? styles.active : ''}`}
              onClick={() => setFilterType(type.key)}
            >
              {type.icon && <i className={type.icon}></i>}
              {type.label}
              {type.key === 'all' && payments.length > 0 && (
                <span className={styles.filterCount}>{payments.length}</span>
              )}
            </button>
          ))}
          {(filterType !== 'all' || searchQuery) && (
            <button className={styles.clearFiltersBtn} onClick={clearFilters}>
              <i className="fa-solid fa-eraser"></i> Clear
            </button>
          )}
        </div>

        {/* Result Count */}
        <div className={styles.resultCount}>
          <span>
            Showing <strong>{filteredPayments.length}</strong> of <strong>{payments.length}</strong> transactions
          </span>
        </div>

        {/* Payment List */}
        <div className={styles.historyList}>
          {filteredPayments.length === 0 ? (
            <div className={styles.emptyHistory}>
              <i className="fa-solid fa-receipt"></i>
              <h3>No Payment History</h3>
              <p>
                {searchQuery || filterType !== 'all'
                  ? 'No payments match your filters. Try adjusting your search criteria.'
                  : 'You have no transactions yet.'}
              </p>
              {(searchQuery || filterType !== 'all') && (
                <button className={styles.clearFiltersBtn} onClick={clearFilters}>
                  <i className="fa-solid fa-eraser"></i> Clear Filters
                </button>
              )}
              {!searchQuery && filterType === 'all' && (
                <button className={styles.browseBtn} onClick={() => navigate('/wallet')}>
                  <i className="fa-solid fa-wallet"></i> Go to Wallet
                </button>
              )}
            </div>
          ) : (
            filteredPayments.map((payment) => {
              const typeConfig = TYPE_CONFIG[payment.type] || TYPE_CONFIG[PAYMENT_TYPE.DEPOSIT];
              const statusConfig = STATUS_CONFIG[payment.status] || STATUS_CONFIG[PAYMENT_STATUS.PENDING];
              const isCredit = payment.type === PAYMENT_TYPE.DEPOSIT || payment.type === PAYMENT_TYPE.CREDIT;
              
              return (
                <div 
                  key={payment.id} 
                  className={`${styles.historyItem} ${styles[payment.status]}`}
                  onClick={() => handlePaymentClick(payment)}
                >
                  <div className={styles.historyIcon} style={{ background: typeConfig.bg, color: typeConfig.color }}>
                    <i className={typeConfig.icon}></i>
                  </div>
                  
                  <div className={styles.historyDetails}>
                    <h4>{getPaymentTitle(payment)}</h4>
                    <p>{payment.formattedDate}</p>
                    {payment.reference && (
                      <small className={styles.reference}>Ref: {payment.reference}</small>
                    )}
                    {payment.note && (
                      <small className={styles.note}>📝 {payment.note}</small>
                    )}
                  </div>
                  
                  <div className={styles.historyRight}>
                    <div className={`${styles.historyAmount} ${isCredit ? styles.credit : styles.debit}`}>
                      {isCredit ? '+' : '-'} {formatMoney(payment.amount)}
                    </div>
                    
                    <div className={`${styles.historyStatus} ${styles[payment.status]}`} style={{ 
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

        {/* Footer */}
        {payments.length > 0 && (
          <div className={styles.historyFooter}>
            <span>Showing {filteredPayments.length} of {payments.length} transactions</span>
          </div>
        )}

        {/* ✅ Transaction Details Modal */}
        {selectedPayment && (
          <div className={styles.modalOverlay} onClick={handleModalClose}>
            <div className={styles.detailsModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>
                  <i className="fa-solid fa-receipt"></i> Payment Details
                </h3>
                <button className={styles.closeBtn} onClick={handleModalClose}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.detailRow}>
                  <span>Amount:</span>
                  <strong className={selectedPayment.type === PAYMENT_TYPE.DEPOSIT || selectedPayment.type === PAYMENT_TYPE.CREDIT ? styles.creditText : styles.debitText}>
                    {formatMoney(selectedPayment.amount)}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Type:</span>
                  <span className={styles.typeBadge}>{selectedPayment.type}</span>
                </div>
                <div className={styles.detailRow}>
                  <span>Status:</span>
                  {(() => {
                    const config = STATUS_CONFIG[selectedPayment.status] || STATUS_CONFIG[PAYMENT_STATUS.PENDING];
                    return (
                      <span className={`${styles.statusBadge} ${styles[selectedPayment.status]}`} style={{ color: config.color, background: config.bg }}>
                        <i className={`fa-solid ${config.icon}`}></i> {config.label}
                      </span>
                    );
                  })()}
                </div>
                <div className={styles.detailRow}>
                  <span>Title:</span>
                  <span>{getPaymentTitle(selectedPayment)}</span>
                </div>
                <div className={styles.detailRow}>
                  <span>Description:</span>
                  <span>{selectedPayment.description || '—'}</span>
                </div>
                {selectedPayment.paymentMethod && (
                  <div className={styles.detailRow}>
                    <span>Payment Method:</span>
                    <span>{selectedPayment.paymentMethod}</span>
                  </div>
                )}
                {selectedPayment.mobileNumber && (
                  <div className={styles.detailRow}>
                    <span>Mobile Number:</span>
                    <span>{selectedPayment.mobileNumber}</span>
                  </div>
                )}
                {selectedPayment.reference && (
                  <div className={styles.detailRow}>
                    <span>Reference:</span>
                    <span className={styles.txId}>{selectedPayment.reference}</span>
                  </div>
                )}
                <div className={styles.detailRow}>
                  <span>Date:</span>
                  <span>
                    {selectedPayment.date instanceof Date && !isNaN(selectedPayment.date)
                      ? selectedPayment.date.toLocaleDateString('bn-BD', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'Invalid Date'}
                  </span>
                </div>
                {selectedPayment.adminRemark && (
                  <div className={`${styles.detailRow} ${styles.adminRemark}`}>
                    <span>📝 Admin Remark:</span>
                    <span className={styles.adminRemarkText}>{selectedPayment.adminRemark}</span>
                  </div>
                )}
                {selectedPayment.id && (
                  <div className={styles.detailRow}>
                    <span>Transaction ID:</span>
                    <span className={styles.txId}>{selectedPayment.id}</span>
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

export default PaymentHistory;