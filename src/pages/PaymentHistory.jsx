// src/pages/PaymentHistory.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import useHideBottomNav from "@/hooks/useHideBottomNav";
import './PaymentHistory.css';

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
      navigate('/login');
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
    <div className="paymenthistory-container">
      <div className="paymenthistory-card">
        
        {/* ✅ Pending Banner */}
        {showPendingBanner && (
          <div className="pending-banner">
            <i className="fa-solid fa-clock"></i>
            <span>
              ⏳ You have <strong>{pendingCount}</strong> pending payment{pendingCount > 1 ? 's' : ''}. 
              Please wait for admin approval.
            </span>
          </div>
        )}

        {/* ✅ Back Button */}
        <button className="back-btn-simple" onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        {/* Header */}
        <div className="paymenthistory-header">
          <h2>
            <i className="fa-solid fa-receipt"></i> Payment History
            {pendingCount > 0 && (
              <span className="pending-badge">{pendingCount}</span>
            )}
          </h2>
          <div className="header-actions">
            <button className="refresh-btn" onClick={handleRefresh}>
              <i className="fa-solid fa-sync"></i>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="search-bar">
          <i className="fa-solid fa-search"></i>
          <input
            type="text"
            placeholder="Search by title, reference, ID, or method..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        {/* Stats Bar */}
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-label">Total Deposits</span>
            <span className="stat-value positive">{formatMoney(stats.totalDeposit)}</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-label">Total Withdrawals</span>
            <span className="stat-value negative">{formatMoney(stats.totalWithdraw)}</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-label">Total Sent</span>
            <span className="stat-value">{formatMoney(stats.totalSend)}</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-label">Pending</span>
            <span className="stat-value pending-count">{stats.pendingCount}</span>
          </div>
        </div>

        {/* Filter Section - With all types */}
        <div className="filter-section">
          {FILTER_TYPES.map((type) => (
            <button 
              key={type.key}
              className={`filter-btn ${filterType === type.key ? 'active' : ''}`}
              onClick={() => setFilterType(type.key)}
            >
              {type.icon && <i className={type.icon}></i>}
              {type.label}
              {type.key === 'all' && payments.length > 0 && (
                <span className="filter-count">{payments.length}</span>
              )}
            </button>
          ))}
          {(filterType !== 'all' || searchQuery) && (
            <button className="clear-filters-btn" onClick={clearFilters}>
              <i className="fa-solid fa-eraser"></i> Clear
            </button>
          )}
        </div>

        {/* Result Count */}
        <div className="result-count">
          <span>
            Showing <strong>{filteredPayments.length}</strong> of <strong>{payments.length}</strong> transactions
          </span>
        </div>

        {/* Payment List */}
        <div className="history-list">
          {filteredPayments.length === 0 ? (
            <div className="empty-history">
              <i className="fa-solid fa-receipt"></i>
              <h3>No Payment History</h3>
              <p>
                {searchQuery || filterType !== 'all'
                  ? 'No payments match your filters. Try adjusting your search criteria.'
                  : 'You have no transactions yet.'}
              </p>
              {(searchQuery || filterType !== 'all') && (
                <button className="clear-filters-btn" onClick={clearFilters}>
                  <i className="fa-solid fa-eraser"></i> Clear Filters
                </button>
              )}
              {!searchQuery && filterType === 'all' && (
                <button className="browse-btn" onClick={() => navigate('/wallet')}>
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
                  className={`history-item ${payment.status}`}
                  onClick={() => handlePaymentClick(payment)}
                >
                  <div className="history-icon" style={{ background: typeConfig.bg, color: typeConfig.color }}>
                    <i className={typeConfig.icon}></i>
                  </div>
                  
                  <div className="history-details">
                    <h4>{getPaymentTitle(payment)}</h4>
                    <p>{payment.formattedDate}</p>
                    {payment.reference && (
                      <small className="reference">Ref: {payment.reference}</small>
                    )}
                    {payment.note && (
                      <small className="note">📝 {payment.note}</small>
                    )}
                  </div>
                  
                  <div className="history-right">
                    <div className={`history-amount ${isCredit ? 'credit' : 'debit'}`}>
                      {isCredit ? '+' : '-'} {formatMoney(payment.amount)}
                    </div>
                    
                    <div className={`history-status ${payment.status}`} style={{ 
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
          <div className="history-footer">
            <span>Showing {filteredPayments.length} of {payments.length} transactions</span>
          </div>
        )}

        {/* ✅ Transaction Details Modal */}
        {selectedPayment && (
          <div className="modal-overlay" onClick={handleModalClose}>
            <div className="details-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fa-solid fa-receipt"></i> Payment Details
                </h3>
                <button className="close-btn" onClick={handleModalClose}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="detail-row">
                  <span>Amount:</span>
                  <strong className={selectedPayment.type === PAYMENT_TYPE.DEPOSIT || selectedPayment.type === PAYMENT_TYPE.CREDIT ? 'credit-text' : 'debit-text'}>
                    {formatMoney(selectedPayment.amount)}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Type:</span>
                  <span className="type-badge">{selectedPayment.type}</span>
                </div>
                <div className="detail-row">
                  <span>Status:</span>
                  {(() => {
                    const config = STATUS_CONFIG[selectedPayment.status] || STATUS_CONFIG[PAYMENT_STATUS.PENDING];
                    return (
                      <span className={`status-badge ${selectedPayment.status}`} style={{ color: config.color, background: config.bg }}>
                        <i className={`fa-solid ${config.icon}`}></i> {config.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="detail-row">
                  <span>Title:</span>
                  <span>{getPaymentTitle(selectedPayment)}</span>
                </div>
                <div className="detail-row">
                  <span>Description:</span>
                  <span>{selectedPayment.description || '—'}</span>
                </div>
                {selectedPayment.paymentMethod && (
                  <div className="detail-row">
                    <span>Payment Method:</span>
                    <span>{selectedPayment.paymentMethod}</span>
                  </div>
                )}
                {selectedPayment.mobileNumber && (
                  <div className="detail-row">
                    <span>Mobile Number:</span>
                    <span>{selectedPayment.mobileNumber}</span>
                  </div>
                )}
                {selectedPayment.reference && (
                  <div className="detail-row">
                    <span>Reference:</span>
                    <span className="tx-id">{selectedPayment.reference}</span>
                  </div>
                )}
                <div className="detail-row">
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
                  <div className="detail-row admin-remark">
                    <span>📝 Admin Remark:</span>
                    <span className="admin-remark-text">{selectedPayment.adminRemark}</span>
                  </div>
                )}
                {selectedPayment.id && (
                  <div className="detail-row">
                    <span>Transaction ID:</span>
                    <span className="tx-id">{selectedPayment.id}</span>
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