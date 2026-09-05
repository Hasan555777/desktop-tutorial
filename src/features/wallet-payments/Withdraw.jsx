// src/pages/Withdraw.jsx

import React, { useState, useEffect } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
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

import styles from './Withdraw.module.css';

import useHideBottomNav from '../../shared/hooks/useHideBottomNav';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../shared/ui/Sound/SoundEvents';
import { sendWalletWithdrawNotification } from '../notifications/notificationHelper';
import { logError, logInfo } from '../../shared/utils/logger';

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

// 🔧 FIX (admin should control Withdraw the same way as Deposit):
// these are now just fallback DEFAULTS used until the live config
// loads (or if the admin hasn't set them yet) — the actual values
// come from settings/withdrawalConfig (minAmount/maxAmount), same
// doc the fee percent already lives in, editable from
// WithdrawalFeeSettings.jsx in the Admin Dashboard.
const DEFAULT_MIN_WITHDRAW = 100;
const DEFAULT_MAX_WITHDRAW = 50000;

const PAYMENT_METHOD = {
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  ROCKET: 'Rocket',
  BANK: 'bank',
};

// 🔧 ADD (#4 admin should manage deposit/withdraw payment methods):
// maps this page's payment-method values to the keys used in the
// shared admin-configured doc settings/paymentMethods (same doc
// Deposit.jsx reads / PaymentMethodsSettings.jsx in Admin Dashboard
// writes), so a method the admin disables disappears from the
// withdraw form too — not just the deposit page.
const CONFIG_KEY = {
  [PAYMENT_METHOD.BKASH]: 'bKash',
  [PAYMENT_METHOD.NAGAD]: 'Nagad',
  [PAYMENT_METHOD.ROCKET]: 'Rocket',
  [PAYMENT_METHOD.BANK]: 'Bank',
};

const Withdraw = () => {
  useHideBottomNav();

  const feedback = useFeedback();
  const { playEvent } = useSound();
  const navigate = useNavigate();

  const user = auth.currentUser;

  // ========== State ==========
  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading); // 🔧 ADD (#25 loading consistency)
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

  // 🔧 FIX (withdrawal fee not shown/applied): this used to only be
  // read inside handleSubmitWithdraw at submit time, so the form UI
  // had no idea what the real fee was and showed a hardcoded
  // "Withdrawal Fee: 0%" regardless of what the admin had set.
  // Loaded here (live, via onSnapshot) so the form can show the
  // real percent/fee/net-payout as the user types, and reused at
  // submit time so what's displayed always matches what's charged.
  const [feePercent, setFeePercent] = useState(0);

  // 🔧 ADD (admin should control Withdraw the same way as Deposit):
  // min/max withdrawal amount, live from the same settings/
  // withdrawalConfig doc as feePercent — admin-editable, no more
  // hardcoded limits baked into the frontend.
  const [minWithdraw, setMinWithdraw] = useState(DEFAULT_MIN_WITHDRAW);
  const [maxWithdraw, setMaxWithdraw] = useState(DEFAULT_MAX_WITHDRAW);

  const availableBalance = Math.max(0, walletData.balance - walletData.lockedBalance);
  const withdrawAmountNumber = Number(withdrawAmount) || 0;
  const feeAmountPreview = Math.round(withdrawAmountNumber * (feePercent / 100) * 100) / 100;
  const netPayoutPreview = withdrawAmountNumber - feeAmountPreview;

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
    if (amount < minWithdraw) {
      setError(`Minimum withdrawal amount is ${minWithdraw} BDT`);
      return false;
    }
    if (amount > maxWithdraw) {
      setError(`Maximum withdrawal amount is ${maxWithdraw} BDT`);
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
      navigate('/login', { replace: true });
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

  // 🔧 FIX (withdrawal fee not shown/applied): live-listen to the
  // admin-configured fee so the form always reflects the current
  // value (falls back to 0% if the admin hasn't set one, same as
  // the submit-time fallback below).
  // 🔧 ADD (admin should control Withdraw the same way as Deposit):
  // same doc/listener now also carries minAmount/maxAmount — falls
  // back to the DEFAULT_MIN_WITHDRAW/DEFAULT_MAX_WITHDRAW constants
  // if the admin hasn't set them yet.
  useEffect(() => {
    const configRef = doc(db, 'settings', 'withdrawalConfig');
    const unsubscribeFee = onSnapshot(
      configRef,
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setFeePercent(Number(data.feePercent) || 0);
        setMinWithdraw(Number(data.minAmount) || DEFAULT_MIN_WITHDRAW);
        setMaxWithdraw(Number(data.maxAmount) || DEFAULT_MAX_WITHDRAW);
      },
      (error) => {
        logError('Failed to load withdrawal fee config:', error);
      }
    );
    return () => unsubscribeFee();
  }, []);

  // 🔧 ADD (#4 admin should manage deposit/withdraw payment methods):
  // live-listen to the same settings/paymentMethods doc Deposit.jsx
  // reads, so a method the admin disables no longer shows up as a
  // withdraw destination option either.
  const [methodsConfig, setMethodsConfig] = useState(null);
  const [methodsConfigLoading, setMethodsConfigLoading] = useState(true);

  useEffect(() => {
    const unsubscribeMethods = onSnapshot(
      doc(db, 'settings', 'paymentMethods'),
      (snap) => {
        setMethodsConfig(snap.exists() ? snap.data() : {});
        setMethodsConfigLoading(false);
      },
      (error) => {
        logError('Failed to load payment methods config:', error);
        setMethodsConfig({});
        setMethodsConfigLoading(false);
      }
    );
    return () => unsubscribeMethods();
  }, []);

  const isMethodEnabled = (m) => {
    const cfg = methodsConfig?.[CONFIG_KEY[m]];
    return cfg ? cfg.enabled !== false : false;
  };

  const enabledPaymentMethods = methodsConfigLoading ? [] : Object.values(PAYMENT_METHOD).filter(isMethodEnabled);

  // Fall back to the first enabled method if the currently-selected
  // one becomes unavailable.
  useEffect(() => {
    if (methodsConfigLoading) return;
    if (!isMethodEnabled(paymentMethod) && enabledPaymentMethods.length > 0) {
      setPaymentMethod(enabledPaymentMethods[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodsConfigLoading, methodsConfig]);

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
  // 🔧 ADD (deposit/withdraw lock security requirement): same
  // pending-request lock as Deposit.jsx - see that file's comment
  // for the full rationale.
  const checkExistingPendingWithdrawal = async (userId) => {
    const q = query(
      collection(db, 'withdrawals'),
      where('userId', '==', userId),
      where('status', '==', WITHDRAW_STATUS.PENDING)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  };

  const handleSubmitWithdraw = async (e) => {
    e.preventDefault();

    if (loading || isSubmitting) return;

    if (!user) {
      setError('Please login first!');
      navigate('/login', { replace: true });
      return;
    }

    if (!validateWithdraw()) {
      playEvent?.(SOUND_EVENTS.ERROR);
      return;
    }

    // 🔧 ADD (#4 admin should manage deposit/withdraw payment methods):
    // re-check enabled status right before submit — the admin could
    // have disabled this method in the seconds since the page loaded
    // / the auto-fallback effect ran.
    if (!isMethodEnabled(paymentMethod)) {
      setError('This payment method is currently unavailable. Please choose another.');
      playEvent?.(SOUND_EVENTS.ERROR);
      return;
    }

    // 🔐 SECURITY (account-password confirmation): a withdrawal moves real
    // money out of the wallet, so — same as Send Money — the account owner
    // must re-confirm their identity with their account password right
    // before the request is submitted. Uses the same Firebase
    // reauthenticateWithCredential() pattern Settings already uses for
    // password changes.
    const password = await feedback.prompt({
      title: '🔐 পাসওয়ার্ড কনফার্ম করুন',
      message: 'উইথড্র রিকোয়েস্ট নিশ্চিত করতে আপনার অ্যাকাউন্টের পাসওয়ার্ড দিন।',
      type: 'password',
      placeholder: 'আপনার পাসওয়ার্ড',
      minLength: 1,
      required: true,
    });

    if (!password) return;

    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    } catch (authError) {
      logError('Withdraw password confirmation failed', authError);
      const wrongPassword = ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(authError.code);
      setError(wrongPassword ? 'পাসওয়ার্ড সঠিক নয়! রিকোয়েস্ট বাতিল করা হয়েছে।' : 'পাসওয়ার্ড যাচাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
      playEvent?.(SOUND_EVENTS.ERROR);
      return;
    }

    setIsSubmitting(true);
    setLoading(true);
    setError('');
    setStatus('Submitting withdrawal request...');

    try {
      const hasPending = await checkExistingPendingWithdrawal(user.uid);
      if (hasPending) {
        setError('আপনার একটি উইথড্র রিকোয়েস্ট ইতিমধ্যে পেন্ডিং আছে। এটি এডমিন কনফার্ম করার আগে নতুন রিকোয়েস্ট পাঠানো যাবে না।');
        playEvent?.(SOUND_EVENTS.WARNING);
        setIsSubmitting(false);
        setLoading(false);
        return;
      }

      // 🔧 FIX (withdrawal fee not shown/applied): re-fetch fresh
      // (not just reuse the live-listened `feePercent` state) so a
      // fee change the admin makes in the seconds before this
      // specific submit still applies correctly — but fall back to
      // the already-loaded `feePercent` state (what the user was
      // actually shown on screen) instead of silently 0, so a
      // transient read failure never charges less than what was
      // displayed.
      let currentFeePercent = feePercent;
      let currentMinWithdraw = minWithdraw;
      let currentMaxWithdraw = maxWithdraw;
      try {
        const configSnap = await getDoc(doc(db, 'settings', 'withdrawalConfig'));
        if (configSnap.exists()) {
          const cfg = configSnap.data();
          currentFeePercent = Number(cfg.feePercent) || 0;
          currentMinWithdraw = Number(cfg.minAmount) || DEFAULT_MIN_WITHDRAW;
          currentMaxWithdraw = Number(cfg.maxAmount) || DEFAULT_MAX_WITHDRAW;
        }
      } catch (err) {
        logError('Failed to load withdrawal fee config:', err);
      }

      // 🔧 ADD (admin should control Withdraw the same way as
      // Deposit): re-validate against the freshest min/max in case
      // the admin changed the limits in the seconds before submit.
      const amountToCheck = Number(withdrawAmount);
      if (amountToCheck < currentMinWithdraw || amountToCheck > currentMaxWithdraw) {
        setError(`Withdrawal amount must be between ৳${currentMinWithdraw} and ৳${currentMaxWithdraw}`);
        playEvent?.(SOUND_EVENTS.ERROR);
        setIsSubmitting(false);
        setLoading(false);
        return;
      }

      const amount = Number(withdrawAmount);
      const feeAmount = Math.round(amount * (currentFeePercent / 100) * 100) / 100;
      const netPayout = amount - feeAmount;

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
        // 🔧 ADD (withdrawal fee): requested amount stays the same
        // (what's deducted from the user's balance), fee/net payout
        // recorded separately so admin sees exactly what to pay out.
        feePercent: currentFeePercent,
        feeAmount,
        netPayout,
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
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-money-bill-transfer ${styles.loadingIcon}`} />
          <h2>Loading Withdrawal Info...</h2>
          <p>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your withdrawal information...
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

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className={styles.withdrawContainer}>
      <div className={styles.withdrawWrapper}>
        <button className={styles.backBtnSimple} onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        <div className={styles.withdrawHeader}>
          <h1>
            <i className="fa-solid fa-money-bill-transfer"></i> Withdraw Funds
          </h1>
        </div>

        {status && (
          <div className={`${styles.statusMessage} ${loading ? styles.processing : styles.success}`}>
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-check-circle'}`}></i>
            {status}
          </div>
        )}

        {error && (
          <div className={styles.errorMessage}>
            <i className="fa-solid fa-exclamation-circle"></i> {error}
          </div>
        )}

        {/* Balance Summary */}
        <div className={styles.balanceSummary}>
          <div className={styles.balanceCard}>
            <div className={styles.balanceIcon}>
              <i className="fa-solid fa-wallet"></i>
            </div>
            <div className={styles.balanceInfo}>
              <span className={styles.balanceLabel}>Available Balance</span>
              <span className={styles.balanceAmount}>{formatMoney(availableBalance)}</span>
              {walletData.lockedBalance > 0 && (
                <small className={styles.lockedBalanceInfo}>
                   {formatMoney(walletData.lockedBalance)} locked in active deals (Total: {formatMoney(walletData.balance)})
                </small>
              )}
            </div>
          </div>
          <div className={styles.pendingCard}>
            <div className={styles.pendingIcon}>
              <i className="fa-solid fa-clock"></i>
            </div>
            <div className={styles.pendingInfo}>
              <span className={styles.pendingLabel}>Pending Withdrawal</span>
              <span className={styles.pendingAmount}>{formatMoney(walletData.pendingWithdraw)}</span>
            </div>
          </div>
        </div>

        {showWithdrawForm && (
          <div className={styles.withdrawFormCard}>
            <h3>
              <i className="fa-solid fa-plus-circle"></i> New Withdrawal Request
            </h3>

            <form onSubmit={handleSubmitWithdraw}>
              <div className={styles.formGroup}>
                <label>Amount (BDT)</label>
                <div className={styles.inputWithIcon}>
                  <i className="fa-solid fa-taka"></i>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Enter amount"
                    min={minWithdraw}
                    max={Math.min(availableBalance, maxWithdraw)}
                    disabled={loading}
                    required
                  />
                </div>
                <small className={styles.fieldHint}>
                  Min: ৳{minWithdraw} • Max: {formatMoney(Math.min(availableBalance, maxWithdraw))}
                </small>
              </div>

              <div className={styles.formGroup}>
                <label>Payment Method</label>
                {methodsConfigLoading ? (
                  <small className={styles.fieldHint}>
                    <i className="fa-solid fa-spinner fa-spin"></i> Loading available methods...
                  </small>
                ) : enabledPaymentMethods.length === 0 ? (
                  <small className={styles.fieldHint}>No withdrawal methods are currently available.</small>
                ) : (
                  <div className={styles.methodOptions}>
                    {enabledPaymentMethods.map((method) => (
                      <label key={method} className={`${styles.methodOption} ${paymentMethod === method ? styles.active : ''}`}>
                        <input type="radio" value={method} checked={paymentMethod === method} onChange={(e) => setPaymentMethod(e.target.value)} disabled={loading} />
                        {method === PAYMENT_METHOD.BKASH && <i className="fa-brands fa-btc"></i>}
                        {method === PAYMENT_METHOD.NAGAD && <i className="fa-solid fa-n"></i>}
                        {method === PAYMENT_METHOD.ROCKET && <i className="fa-solid fa-rocket"></i>}
                        {method === PAYMENT_METHOD.BANK && <i className="fa-solid fa-building-columns"></i>}
                        <span>{method}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Mobile Number</label>
                <div className={styles.inputWithIcon}>
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
                <small className={styles.fieldHint}>Enter your {paymentMethod === PAYMENT_METHOD.BANK ? 'bank registered' : paymentMethod} mobile number</small>
              </div>

              {paymentMethod === PAYMENT_METHOD.BANK && (
                <>
                  <div className={styles.formGroup}>
                    <label>Account Holder Name</label>
                    <div className={styles.inputWithIcon}>
                      <i className="fa-solid fa-user"></i>
                      <input type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Full name as per bank account" disabled={loading} required />
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Bank Name</label>
                    <div className={styles.inputWithIcon}>
                      <i className="fa-solid fa-building-columns"></i>
                      <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g., Dutch-Bangla Bank" disabled={loading} required />
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Account Number</label>
                    <div className={styles.inputWithIcon}>
                      <i className="fa-solid fa-hashtag"></i>
                      <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Your bank account number" disabled={loading} required />
                    </div>
                  </div>
                </>
              )}

              <div className={styles.feeInfo}>
                <i className="fa-solid fa-circle-info"></i>
                <div>
                  <strong>Withdrawal Fee: {feePercent}%</strong>
                  {feePercent > 0 && withdrawAmountNumber > 0 ? (
                    <p>
                      Fee: {formatMoney(feeAmountPreview)} • You'll receive: <strong>{formatMoney(netPayoutPreview)}</strong>
                    </p>
                  ) : (
                    <p>No hidden charges. You'll receive the full amount.</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading || isSubmitting || methodsConfigLoading || enabledPaymentMethods.length === 0 || Number(withdrawAmount) > availableBalance || Number(withdrawAmount) < minWithdraw}
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

        <div className={styles.withdrawHistory}>
          <h3>
            <i className="fa-solid fa-clock-rotate-left"></i> Withdrawal History
          </h3>

          {withdrawals.length === 0 ? (
            <div className={styles.noHistory}>
              <i className="fa-solid fa-receipt"></i>
              <p>No withdrawal requests yet</p>
              <small>Your withdrawal history will appear here</small>
            </div>
          ) : (
            <div className={styles.historyList}>
              {withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className={`${styles.historyItem} ${styles[getStatusClass(withdrawal.status)]}`} onClick={() => showWithdrawDetails(withdrawal)}>
                  <div className={styles.historyIcon}>
                    <i className={getStatusIcon(withdrawal.status)}></i>
                  </div>
                  <div className={styles.historyDetails}>
                    <div className={styles.historyHeader}>
                      <span className={styles.historyAmount}>{formatMoney(withdrawal.amount)}</span>
                      <span className={`${styles.historyStatus} ${styles[getStatusClass(withdrawal.status)]}`}>
                        {withdrawal.status === WITHDRAW_STATUS.PENDING && '⏳ Pending'}
                        {withdrawal.status === WITHDRAW_STATUS.PROCESSING && '🔄 Processing'}
                        {withdrawal.status === WITHDRAW_STATUS.APPROVED && '✅ Approved'}
                        {withdrawal.status === WITHDRAW_STATUS.REJECTED && '❌ Rejected'}
                        {withdrawal.status === WITHDRAW_STATUS.CANCELLED && '🚫 Cancelled'}
                      </span>
                    </div>
                    <div className={styles.historyMeta}>
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
          <div className={styles.modalOverlay} onClick={() => setSelectedWithdrawal(null)}>
            <div className={styles.detailsModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>
                  <i className="fa-solid fa-receipt"></i> Withdrawal Details
                </h3>
                <button className={styles.closeBtn} onClick={() => setSelectedWithdrawal(null)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.detailRow}>
                  <span>Amount:</span>
                  <strong>{formatMoney(selectedWithdrawal.amount)}</strong>
                </div>
                {(selectedWithdrawal.feePercent || 0) > 0 && (
                  <>
                    <div className={styles.detailRow}>
                      <span>Fee ({selectedWithdrawal.feePercent}%):</span>
                      <span>{formatMoney(selectedWithdrawal.feeAmount || 0)}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span>You Receive:</span>
                      <strong>{formatMoney(selectedWithdrawal.netPayout ?? selectedWithdrawal.amount)}</strong>
                    </div>
                  </>
                )}
                <div className={styles.detailRow}>
                  <span>Status:</span>
                  <span className={`${styles.statusBadge} ${styles[getStatusClass(selectedWithdrawal.status)]}`}>{selectedWithdrawal.status}</span>
                </div>
                <div className={styles.detailRow}>
                  <span>Payment Method:</span>
                  <span>{selectedWithdrawal.paymentMethod}</span>
                </div>
                <div className={styles.detailRow}>
                  <span>Mobile Number:</span>
                  <span>{selectedWithdrawal.mobileNumber}</span>
                </div>
                {selectedWithdrawal.accountHolder && (
                  <div className={styles.detailRow}>
                    <span>Account Holder:</span>
                    <span>{selectedWithdrawal.accountHolder}</span>
                  </div>
                )}
                {selectedWithdrawal.bankName && (
                  <div className={styles.detailRow}>
                    <span>Bank Name:</span>
                    <span>{selectedWithdrawal.bankName}</span>
                  </div>
                )}
                {selectedWithdrawal.accountNumber && (
                  <div className={styles.detailRow}>
                    <span>Account Number:</span>
                    <span>{selectedWithdrawal.accountNumber}</span>
                  </div>
                )}
                <div className={styles.detailRow}>
                  <span>Requested:</span>
                  <span>{formatDate(selectedWithdrawal.requestedAt?.toDate?.())}</span>
                </div>
                {selectedWithdrawal.processedAt && (
                  <div className={styles.detailRow}>
                    <span>Processed:</span>
                    <span>{formatDate(selectedWithdrawal.processedAt?.toDate?.())}</span>
                  </div>
                )}
                {selectedWithdrawal.transactionId && (
                  <div className={styles.detailRow}>
                    <span>Transaction ID:</span>
                    <span className={styles.txId}>{selectedWithdrawal.transactionId}</span>
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