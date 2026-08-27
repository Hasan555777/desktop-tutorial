// src/pages/Withdraw.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import './Withdraw.css';
import useHideBottomNav from '@/hooks/useHideBottomNav';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { sendWalletWithdrawNotification } from './notificationHelper';
import { logError, logInfo } from '@/utils/logger';

// ============================================================
// Constants
// ============================================================
const WITHDRAW_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

const MIN_WITHDRAW = 100;
const MAX_WITHDRAW = 50000;

const PAYMENT_METHOD = {
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  ROCKET: 'Rocket',
  BANK: 'bank',
};

const Withdraw = () => {
  useHideBottomNav();

  const feedback = useFeedback();
  const { playEvent } = useSound();
  const navigate = useNavigate();

  const user = auth.currentUser;

  // ========== State ==========
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // NOTE: lockedBalance is now tracked here too — `balance` alone used to
  // be shown/validated against, which overstates what's actually
  // withdrawable when some of it is reserved for an active deal (see
  // Wallet.jsx's header comment: withdraw/send-money MUST validate against
  // balance - lockedBalance).
  const [walletData, setWalletData] = useState({
    balance: 0,
    lockedBalance: 0,
    totalEarned: 0,
    totalWithdrawn: 0,
    pendingWithdraw: 0,
  });
  const [withdrawals, setWithdrawals] = useState([]);
  const [showWithdrawForm, setShowWithdrawForm] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHOD.BKASH);
  const [mobileNumber, setMobileNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);

  const availableBalance = Math.max(0, walletData.balance - walletData.lockedBalance);

  // ============================================================
  // Back Handler
  // ============================================================
  const handleBack = () => {
    navigate(-1);
  };

  // ============================================================
  // Reset Form
  // ============================================================
  const resetForm = () => {
    setWithdrawAmount('');
    setMobileNumber('');
    setAccountHolder('');
    setBankName('');
    setAccountNumber('');
    setError('');
    setStatus('');
  };

  // ============================================================
  // Validation Functions
  //
  // Validated against `availableBalance` (balance - lockedBalance), not raw
  // `walletData.balance` — matches the atomic check inside the transaction
  // below, so the person doesn't see the form pass validation and then get
  // rejected a moment later with a confusing error.
  // ============================================================
  const validateAmount = () => {
    const amount = Number(withdrawAmount);
    if (!withdrawAmount || amount <= 0) {
      setError('Please enter an amount');
      return false;
    }
    if (amount < MIN_WITHDRAW) {
      setError(`Minimum withdrawal amount is ${MIN_WITHDRAW} BDT`);
      return false;
    }
    if (amount > MAX_WITHDRAW) {
      setError(`Maximum withdrawal amount is ${MAX_WITHDRAW} BDT`);
      return false;
    }
    if (amount > availableBalance) {
      setError(`Insufficient available balance! Available: ৳${availableBalance.toFixed(2)}`);
      return false;
    }
    return true;
  };

  const validatePhone = () => {
    const cleanNumber = mobileNumber.replace(/\D/g, '');
    if (cleanNumber.length !== 11) {
      setError('Please enter a valid 11-digit mobile number');
      return false;
    }
    if (!/^(017|018|019|016|013|015)\d{8}$/.test(cleanNumber)) {
      setError('Please enter a valid Bangladesh mobile number');
      return false;
    }
    return true;
  };

  const validateBankDetails = () => {
    if (paymentMethod === PAYMENT_METHOD.BANK) {
      if (!accountHolder.trim()) {
        setError('Please enter account holder name');
        return false;
      }
      if (!bankName.trim()) {
        setError('Please enter bank name');
        return false;
      }
      if (!accountNumber.trim() || accountNumber.length < 6) {
        setError('Please enter a valid account number');
        return false;
      }
    }
    return true;
  };

  const validateWithdraw = () => {
    return validateAmount() && validatePhone() && validateBankDetails();
  };

  // ============================================================
  // Load Wallet & Withdrawals
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const loadWallet = async () => {
      try {
        const walletRef = doc(db, 'wallets', user.uid);
        const walletSnap = await getDoc(walletRef);

        if (walletSnap.exists()) {
          const data = walletSnap.data();
          setWalletData({
            balance: data.balance || 0,
            lockedBalance: data.lockedBalance || 0,
            totalEarned: data.totalEarned || 0,
            totalWithdrawn: data.totalWithdrawn || 0,
            pendingWithdraw: data.pendingWithdraw || 0,
          });
        }
      } catch (error) {
        logError('Error loading wallet', error);
      }
    };

    const withdrawalsRef = collection(db, 'withdrawals');
    const q = query(withdrawalsRef, where('userId', '==', user.uid), orderBy('requestedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedWithdrawals = snapshot.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, formattedDate: data.requestedAt?.toDate?.() || new Date() };
        });

        setWithdrawals(fetchedWithdrawals);
        setLoading(false);
      },
      (error) => {
        logError('Withdrawals listener error', error);
        setLoading(false);
      }
    );

    loadWallet();
    return () => unsubscribe();
  }, [user, navigate]);

  // ============================================================
  // Handle Withdraw Submit
  //
  // CRITICAL FIX: the balance check and the balance/pendingWithdraw update
  // used to be a plain getDoc() followed later by a separate updateDoc() —
  // a classic read-modify-write race. Two withdrawal requests submitted
  // close together (two tabs, a retried request, etc.) could both read the
  // same stale balance, both pass the check, and both deduct — letting
  // someone withdraw more than their available balance. The whole
  // check-and-deduct step now runs inside a single runTransaction(), which
  // Firestore guarantees is atomic and will retry on conflicting writes.
  // ============================================================
  const handleSubmitWithdraw = async (e) => {
    e.preventDefault();

    if (loading || isSubmitting) return;

    if (!user) {
      setError('Please login first!');
      navigate('/login');
      return;
    }

    if (!validateWithdraw()) {
      playEvent?.(SOUND_EVENTS.ERROR);
      return;
    }

    setIsSubmitting(true);
    setLoading(true);
    setError('');
    setStatus('Submitting withdrawal request...');

    try {
      const amount = Number(withdrawAmount);
      const cleanNumber = mobileNumber.replace(/\D/g, '');
      const walletRef = doc(db, 'wallets', user.uid);

      let newPendingWithdraw = 0;

      await runTransaction(db, async (transaction) => {
        const walletSnap = await transaction.get(walletRef);

        if (!walletSnap.exists()) {
          throw new Error('Wallet not found!');
        }

        const walletDataLocal = walletSnap.data();
        const lockedBalance = walletDataLocal.lockedBalance || 0;
        const totalBalance = walletDataLocal.balance || 0;
        const currentAvailable = totalBalance - lockedBalance;

        if (amount > currentAvailable) {
          throw new Error(`Insufficient available balance! Available: ৳${currentAvailable.toFixed(2)}`);
        }

        newPendingWithdraw = (walletDataLocal.pendingWithdraw || 0) + amount;

        transaction.update(walletRef, {
          balance: totalBalance - amount,
          pendingWithdraw: newPendingWithdraw,
          updatedAt: serverTimestamp(),
        });
      });

      setStatus('Recording withdrawal request...');

      const withdrawData = {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || 'User',
        amount,
        status: WITHDRAW_STATUS.PENDING,
        paymentMethod,
        mobileNumber: cleanNumber,
        ...(paymentMethod === PAYMENT_METHOD.BANK && {
          accountHolder: accountHolder.trim(),
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
        }),
        adminRemark: '',
        approvedAt: null,
        rejectedAt: null,
        approvedBy: null,
        rejectedBy: null,
        source: 'manual',
        transactionId: null,
        requestedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'withdrawals'), withdrawData);

      await updateDoc(doc(db, 'withdrawals', docRef.id), { transactionId: docRef.id });

      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        amount,
        type: 'withdraw',
        status: WITHDRAW_STATUS.PENDING,
        title: 'Withdrawal Request',
        description: `Withdrawal request via ${paymentMethod}`,
        reference: docRef.id,
        transactionId: docRef.id,
        paymentMethod,
        mobileNumber: cleanNumber,
        adminRemark: '',
        source: 'manual',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setWalletData((prev) => ({
        ...prev,
        balance: prev.balance - amount,
        pendingWithdraw: newPendingWithdraw,
      }));

      setStatus('✅ Withdrawal request submitted! Waiting for admin approval...');
      playEvent?.(SOUND_EVENTS.SUCCESS);

      try {
        await sendWalletWithdrawNotification(user.uid, amount, paymentMethod, cleanNumber, WITHDRAW_STATUS.PENDING, docRef.id);
      } catch (notifError) {
        logError('Withdrawal notification failed (withdrawal still submitted)', notifError);
      }

      feedback.alert.success({
        message: `✅ Withdrawal Request Submitted\n\n💰 Amount: ৳${amount}\n🏦 ${paymentMethod}\n📱 ${cleanNumber}\n\n⏳ Waiting for admin approval`,
      });

      resetForm();
      setTimeout(() => navigate('/wallet'), 2000);
    } catch (error) {
      logError('Withdrawal error', error);

      const errorMessage = error.message || 'Failed to submit withdrawal. Please try again.';
      setError(errorMessage);
      setStatus('❌ Submission failed');

      playEvent?.(SOUND_EVENTS.ERROR);
      feedback.alert.error({ message: errorMessage });
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  // ============================================================
  // Helpers
  // ============================================================
  const showWithdrawDetails = (withdrawal) => {
    setSelectedWithdrawal(withdrawal);
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Bug fix: these switches used to compare against WITHDRAW_STATUS.COMPLETED,
  // which was never defined on the enum (only PENDING/PROCESSING/APPROVED/
  // REJECTED/CANCELLED exist) — so an "approved" withdrawal's status badge
  // and label silently fell through to nothing/default instead of showing
  // as completed. Fixed to use APPROVED.
  const getStatusClass = (status) => {
    switch (status) {
      case WITHDRAW_STATUS.APPROVED:
        return 'status-completed';
      case WITHDRAW_STATUS.PENDING:
        return 'status-pending';
      case WITHDRAW_STATUS.PROCESSING:
        return 'status-processing';
      case WITHDRAW_STATUS.REJECTED:
        return 'status-rejected';
      default:
        return 'status-pending';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case WITHDRAW_STATUS.APPROVED:
        return 'fa-solid fa-check-circle';
      case WITHDRAW_STATUS.PENDING:
        return 'fa-solid fa-clock';
      case WITHDRAW_STATUS.PROCESSING:
        return 'fa-solid fa-spinner fa-spin';
      case WITHDRAW_STATUS.REJECTED:
        return 'fa-solid fa-times-circle';
      default:
        return 'fa-solid fa-clock';
    }
  };

  // ============================================================
  // Loading State
  // ============================================================
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px 20px',
          minHeight: '400px',
          background: 'var(--bg-primary, #090d16)',
          color: 'var(--accent-primary, #14b8a6)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <i
            className="fa-solid fa-money-bill-transfer"
            style={{ fontSize: '48px', animation: 'spin 2s linear infinite', display: 'block', marginBottom: '16px', color: 'var(--accent-primary, #14b8a6)' }}
          />
          <h2 style={{ color: 'var(--text-primary, #f1f5f9)', fontSize: '20px', fontWeight: '600', margin: '0 0 8px 0' }}>Loading Withdrawal Info...</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your withdrawal information...
          </p>
          <div style={{ marginTop: '20px' }}>
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="withdraw-container">
      <div className="withdraw-wrapper">
        <button className="back-btn-simple" onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        <div className="withdraw-header">
          <h1>
            <i className="fa-solid fa-money-bill-transfer"></i> Withdraw Funds
          </h1>
        </div>

        {status && (
          <div className={`status-message ${loading ? 'processing' : 'success'}`}>
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-check-circle'}`}></i>
            {status}
          </div>
        )}

        {error && (
          <div className="error-message">
            <i className="fa-solid fa-exclamation-circle"></i> {error}
          </div>
        )}

        {/* Balance Summary — now shows the real withdrawable amount, plus
            the locked portion when relevant, instead of the raw total. */}
        <div className="balance-summary">
          <div className="balance-card">
            <div className="balance-icon">
              <i className="fa-solid fa-wallet"></i>
            </div>
            <div className="balance-info">
              <span className="balance-label">Available Balance</span>
              <span className="balance-amount">{formatMoney(availableBalance)}</span>
              {walletData.lockedBalance > 0 && (
                <small style={{ color: '#f59e0b', display: 'block', marginTop: '2px' }}>
                  🔒 {formatMoney(walletData.lockedBalance)} locked in active deals (Total: {formatMoney(walletData.balance)})
                </small>
              )}
            </div>
          </div>
          <div className="pending-card">
            <div className="pending-icon">
              <i className="fa-solid fa-clock"></i>
            </div>
            <div className="pending-info">
              <span className="pending-label">Pending Withdrawal</span>
              <span className="pending-amount">{formatMoney(walletData.pendingWithdraw)}</span>
            </div>
          </div>
        </div>

        {showWithdrawForm && (
          <div className="withdraw-form-card">
            <h3>
              <i className="fa-solid fa-plus-circle"></i> New Withdrawal Request
            </h3>

            <form onSubmit={handleSubmitWithdraw}>
              <div className="form-group">
                <label>Amount (BDT)</label>
                <div className="input-with-icon">
                  <i className="fa-solid fa-taka"></i>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Enter amount"
                    min={MIN_WITHDRAW}
                    max={Math.min(availableBalance, MAX_WITHDRAW)}
                    disabled={loading}
                    required
                  />
                </div>
                <small>
                  Min: ৳{MIN_WITHDRAW} • Max: {formatMoney(Math.min(availableBalance, MAX_WITHDRAW))}
                </small>
              </div>

              <div className="form-group">
                <label>Payment Method</label>
                <div className="method-options">
                  {Object.values(PAYMENT_METHOD).map((method) => (
                    <label key={method} className={`method-option ${paymentMethod === method ? 'active' : ''}`}>
                      <input type="radio" value={method} checked={paymentMethod === method} onChange={(e) => setPaymentMethod(e.target.value)} disabled={loading} />
                      {method === PAYMENT_METHOD.BKASH && <i className="fa-brands fa-btc"></i>}
                      {method === PAYMENT_METHOD.NAGAD && <i className="fa-solid fa-n"></i>}
                      {method === PAYMENT_METHOD.ROCKET && <i className="fa-solid fa-rocket"></i>}
                      {method === PAYMENT_METHOD.BANK && <i className="fa-solid fa-building-columns"></i>}
                      <span>{method}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Mobile Number</label>
                <div className="input-with-icon">
                  <i className="fa-solid fa-phone"></i>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    maxLength="11"
                    disabled={loading}
                    required
                  />
                </div>
                <small>Enter your {paymentMethod === PAYMENT_METHOD.BANK ? 'bank registered' : paymentMethod} mobile number</small>
              </div>

              {paymentMethod === PAYMENT_METHOD.BANK && (
                <>
                  <div className="form-group">
                    <label>Account Holder Name</label>
                    <div className="input-with-icon">
                      <i className="fa-solid fa-user"></i>
                      <input type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Full name as per bank account" disabled={loading} required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Bank Name</label>
                    <div className="input-with-icon">
                      <i className="fa-solid fa-building-columns"></i>
                      <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g., Dutch-Bangla Bank" disabled={loading} required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Account Number</label>
                    <div className="input-with-icon">
                      <i className="fa-solid fa-hashtag"></i>
                      <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Your bank account number" disabled={loading} required />
                    </div>
                  </div>
                </>
              )}

              <div className="fee-info">
                <i className="fa-solid fa-circle-info"></i>
                <div>
                  <strong>Withdrawal Fee: 0%</strong>
                  <p>No hidden charges. You'll receive the full amount.</p>
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={loading || isSubmitting || Number(withdrawAmount) > availableBalance || Number(withdrawAmount) < MIN_WITHDRAW}
              >
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i> Processing...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-paper-plane"></i> Submit Withdrawal Request
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        <div className="withdraw-history">
          <h3>
            <i className="fa-solid fa-clock-rotate-left"></i> Withdrawal History
          </h3>

          {withdrawals.length === 0 ? (
            <div className="no-history">
              <i className="fa-solid fa-receipt"></i>
              <p>No withdrawal requests yet</p>
              <small>Your withdrawal history will appear here</small>
            </div>
          ) : (
            <div className="history-list">
              {withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className={`history-item ${getStatusClass(withdrawal.status)}`} onClick={() => showWithdrawDetails(withdrawal)}>
                  <div className="history-icon">
                    <i className={getStatusIcon(withdrawal.status)}></i>
                  </div>
                  <div className="history-details">
                    <div className="history-header">
                      <span className="history-amount">{formatMoney(withdrawal.amount)}</span>
                      <span className={`history-status ${getStatusClass(withdrawal.status)}`}>
                        {withdrawal.status === WITHDRAW_STATUS.PENDING && '⏳ Pending'}
                        {withdrawal.status === WITHDRAW_STATUS.PROCESSING && '🔄 Processing'}
                        {withdrawal.status === WITHDRAW_STATUS.APPROVED && '✅ Approved'}
                        {withdrawal.status === WITHDRAW_STATUS.REJECTED && '❌ Rejected'}
                        {withdrawal.status === WITHDRAW_STATUS.CANCELLED && '🚫 Cancelled'}
                      </span>
                    </div>
                    <div className="history-meta">
                      <span>
                        <i className="fa-solid fa-credit-card"></i> {withdrawal.paymentMethod}
                      </span>
                      <span>
                        <i className="fa-solid fa-phone"></i> {withdrawal.mobileNumber}
                      </span>
                      <span>
                        <i className="fa-regular fa-calendar"></i> {formatDate(withdrawal.requestedAt?.toDate?.())}
                      </span>
                    </div>
                  </div>
                  <i className="fa-solid fa-chevron-right"></i>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedWithdrawal && (
          <div className="modal-overlay" onClick={() => setSelectedWithdrawal(null)}>
            <div className="details-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fa-solid fa-receipt"></i> Withdrawal Details
                </h3>
                <button className="close-btn" onClick={() => setSelectedWithdrawal(null)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="detail-row">
                  <span>Amount:</span>
                  <strong>{formatMoney(selectedWithdrawal.amount)}</strong>
                </div>
                <div className="detail-row">
                  <span>Status:</span>
                  <span className={`status-badge ${getStatusClass(selectedWithdrawal.status)}`}>{selectedWithdrawal.status}</span>
                </div>
                <div className="detail-row">
                  <span>Payment Method:</span>
                  <span>{selectedWithdrawal.paymentMethod}</span>
                </div>
                <div className="detail-row">
                  <span>Mobile Number:</span>
                  <span>{selectedWithdrawal.mobileNumber}</span>
                </div>
                {selectedWithdrawal.accountHolder && (
                  <div className="detail-row">
                    <span>Account Holder:</span>
                    <span>{selectedWithdrawal.accountHolder}</span>
                  </div>
                )}
                {selectedWithdrawal.bankName && (
                  <div className="detail-row">
                    <span>Bank Name:</span>
                    <span>{selectedWithdrawal.bankName}</span>
                  </div>
                )}
                {selectedWithdrawal.accountNumber && (
                  <div className="detail-row">
                    <span>Account Number:</span>
                    <span>{selectedWithdrawal.accountNumber}</span>
                  </div>
                )}
                <div className="detail-row">
                  <span>Requested:</span>
                  <span>{formatDate(selectedWithdrawal.requestedAt?.toDate?.())}</span>
                </div>
                {selectedWithdrawal.processedAt && (
                  <div className="detail-row">
                    <span>Processed:</span>
                    <span>{formatDate(selectedWithdrawal.processedAt?.toDate?.())}</span>
                  </div>
                )}
                {selectedWithdrawal.transactionId && (
                  <div className="detail-row">
                    <span>Transaction ID:</span>
                    <span className="tx-id">{selectedWithdrawal.transactionId}</span>
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

export default Withdraw;