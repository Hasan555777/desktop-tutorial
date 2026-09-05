// src/pages/Deposit.jsx

import React, { useState, useEffect, useRef } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate, useLocation } from 'react-router-dom';

import { auth, db } from '../../shared/firebase/index';
import { doc, addDoc, collection, serverTimestamp, query, where, getDocs, updateDoc, onSnapshot } from 'firebase/firestore';

import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { useSound } from '../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../shared/ui/Sound/SoundEvents';
import { sendWalletDepositNotification } from '../notifications/notificationHelper';
import styles from './Deposit.module.css';

import useHideBottomNav from '../../shared/hooks/useHideBottomNav';
import { logError } from '../../shared/utils/logger';

import { uploadToCloudinary as uploadReceiptFile } from '../register/hooks/registerHelpers';

// ============================================================
// Cloudinary upload
// 🔧 FIX (item #5/#10): this used to be its own uncompressed, unvalidated
// inline copy — deposit receipt photos went to Cloudinary at full camera
// resolution. Now uses the shared, auto-compressing implementation from
// registerHelpers.js (same one Register/Profile use), which returns
// { url, publicId } instead of a bare string — see the call site below.
//
// NOTE: this uses an unsigned upload preset ("workhub_preset"), which is
// the standard way to do client-side Cloudinary uploads, but it does mean
// anyone who inspects this request could technically upload arbitrary
// files to that preset. If that becomes a concern, configure upload
// restrictions (file type/size limits, moderation) on the preset itself in
// the Cloudinary console — that's a dashboard setting, not something fixed
// in this file.
// ============================================================
const uploadToCloudinary = async (file) => {
  try {
    const result = await uploadReceiptFile(file, 'deposit_receipts');
    return result.url;
  } catch (error) {
    logError('Cloudinary upload error', error);
    return null;
  }
};

// ============================================================
// Constants
// ============================================================
// 🔧 FIX (admin should control Deposit amount limits too, matching
// Withdraw): these are now just fallback DEFAULTS until the live
// config loads (or if the admin hasn't set them) — the real values
// come from settings/depositConfig (minAmount/maxAmount), editable
// from DepositAmountSettings.jsx in the Admin Dashboard.
const DEFAULT_MINIMUM_DEPOSIT = 100;
const DEFAULT_MAXIMUM_DEPOSIT = 50000;

const DEPOSIT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

const PAYMENT_METHOD = {
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  ROCKET: 'Rocket',
  BANK_TRANSFER: 'Bank Transfer',
};

// 🔧 FIX (#4 admin should manage deposit/withdraw payment methods):
// this object used to also hold the actual receiving number
// (e.g. '01891696262') and bank account details hardcoded directly
// in frontend source — anyone could view-source them, and the admin
// had no way to change a number without a code deploy. Those live
// values (number / accountType / bankDetails, and whether a method
// is enabled at all) now come from Firestore (settings/paymentMethods,
// admin-editable via PaymentMethodsSettings.jsx in the Admin
// Dashboard) — see `methodsConfig` state + `getLiveMethodConfig()`
// below. What's left here is only static UI/validation metadata
// (icon, color, phone-number regex, which fields the form needs) —
// never anything sensitive or admin-configurable.
const CONFIG_KEY = {
  [PAYMENT_METHOD.BKASH]: 'bKash',
  [PAYMENT_METHOD.NAGAD]: 'Nagad',
  [PAYMENT_METHOD.ROCKET]: 'Rocket',
  [PAYMENT_METHOD.BANK_TRANSFER]: 'Bank',
};

const PAYMENT_METHODS = {
  [PAYMENT_METHOD.BKASH]: {
    icon: 'fa-brands fa-btc',
    color: '#E2136E',
    regex: /^(017|018|019)\d{8}$/,
    requiresTrxId: true,
    requiresSenderNumber: true,
    requiresReceipt: false,
  },
  [PAYMENT_METHOD.NAGAD]: {
    icon: 'fa-solid fa-n',
    color: '#F58A1E',
    regex: /^(017|018|019)\d{8}$/,
    requiresTrxId: true,
    requiresSenderNumber: true,
    requiresReceipt: false,
  },
  [PAYMENT_METHOD.ROCKET]: {
    icon: 'fa-solid fa-rocket',
    color: '#E2136E',
    regex: /^(016)\d{8}$/,
    requiresTrxId: true,
    requiresSenderNumber: true,
    requiresReceipt: false,
  },
  [PAYMENT_METHOD.BANK_TRANSFER]: {
    icon: 'fa-solid fa-building-columns',
    color: '#438e82',
    regex: null,
    requiresTrxId: false,
    requiresSenderNumber: false,
    requiresReceipt: true,
  },
};

const Deposit = () => {
  useHideBottomNav();
  const navigate = useNavigate();
  const location = useLocation();

  const feedback = useFeedback();
  const { playEvent } = useSound();
  const user = auth.currentUser;
  const fileInputRef = useRef(null);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHOD.BKASH);
  const [trxId, setTrxId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [note, setNote] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');

  const [loading, setLoading] = useState(false);
  usePageLoadingBar(loading); // 🔧 ADD (#25 loading consistency)
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const preferredMethod = location.state?.preferredMethod || null;

  // 🔧 ADD (#4 admin should manage deposit/withdraw payment methods):
  // live-listen to the admin-configured payment methods doc so the
  // receiving number/bank details and enabled/disabled state always
  // reflect what the admin has set — no hardcoded numbers, no stale
  // config if the admin changes something while this page is open.
  const [methodsConfig, setMethodsConfig] = useState(null);
  const [methodsConfigLoading, setMethodsConfigLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
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
    return () => unsubscribe();
  }, []);

  // 🔧 ADD (admin should control Deposit amount limits too, matching
  // Withdraw): live-listen to settings/depositConfig for min/max —
  // same pattern as Withdraw.jsx's minWithdraw/maxWithdraw.
  const [minDeposit, setMinDeposit] = useState(DEFAULT_MINIMUM_DEPOSIT);
  const [maxDeposit, setMaxDeposit] = useState(DEFAULT_MAXIMUM_DEPOSIT);

  useEffect(() => {
    const unsubscribeAmounts = onSnapshot(
      doc(db, 'settings', 'depositConfig'),
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setMinDeposit(Number(data.minAmount) || DEFAULT_MINIMUM_DEPOSIT);
        setMaxDeposit(Number(data.maxAmount) || DEFAULT_MAXIMUM_DEPOSIT);
      },
      (error) => {
        logError('Failed to load deposit amount config:', error);
      }
    );
    return () => unsubscribeAmounts();
  }, []);

  // Live config for the currently selected method (merges the static
  // UI metadata above with the admin-configured number/bank details).
  const getLiveMethodConfig = (m) => methodsConfig?.[CONFIG_KEY[m]] || null;

  const isMethodEnabled = (m) => {
    const cfg = getLiveMethodConfig(m);
    return cfg ? cfg.enabled !== false : false;
  };

  // ✅ Only show methods the admin currently has enabled.
  const enabledMethods = methodsConfigLoading ? [] : Object.values(PAYMENT_METHOD).filter(isMethodEnabled);

  // If the currently-selected method becomes unavailable (disabled by
  // admin, or config just finished loading), fall back to the first
  // enabled method instead of silently submitting against a disabled
  // / stale one.
  useEffect(() => {
    if (methodsConfigLoading) return;
    if (!isMethodEnabled(method) && enabledMethods.length > 0) {
      setMethod(enabledMethods[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodsConfigLoading, methodsConfig]);

  useEffect(() => {
    if (preferredMethod === 'Bank Transfer') {
      setMethod(PAYMENT_METHOD.BANK_TRANSFER);
      setTrxId('');
      setSenderNumber('');
      setError('');
    }
  }, [preferredMethod]);

  const resetForm = () => {
    setAmount('');
    setTrxId('');
    setSenderNumber('');
    setNote('');
    setReceiptFile(null);
    setReceiptPreview('');
    setReceiptFileName('');
    setBankAccountName('');
    setBankAccountNumber('');
    setBankName('');
    setBankBranch('');
    setError('');
    setStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ============================================================
  // Validation Helpers
  // ============================================================
  const validateAmount = () => {
    const numAmount = Number(amount);
    if (!amount || numAmount <= 0) {
      setError('Please enter an amount');
      return false;
    }
    if (numAmount < minDeposit) {
      setError(`Minimum deposit amount is ${minDeposit} BDT`);
      return false;
    }
    if (numAmount > maxDeposit) {
      setError(`Maximum deposit amount is ${maxDeposit} BDT`);
      return false;
    }
    return true;
  };

  const validatePhone = () => {
    if (method === PAYMENT_METHOD.BANK_TRANSFER) return true;

    const cleanNumber = senderNumber.replace(/\D/g, '');
    const methodConfig = PAYMENT_METHODS[method];

    if (cleanNumber.length !== 11) {
      setError('Please enter a valid 11-digit sender number');
      return false;
    }

    if (methodConfig?.regex && !methodConfig.regex.test(cleanNumber)) {
      setError(`Please enter a valid ${method} number (${method} number format is incorrect)`);
      return false;
    }

    return true;
  };

  const validateTrxId = () => {
    if (method === PAYMENT_METHOD.BANK_TRANSFER) return true;

    const cleanTrxId = trxId.trim().replace(/\s/g, '');
    if (!cleanTrxId || cleanTrxId.length < 6) {
      setError('Please enter a valid Transaction ID (minimum 6 characters)');
      return false;
    }
    if (!/^[a-zA-Z0-9]+$/.test(cleanTrxId)) {
      setError('Transaction ID can only contain letters and numbers');
      return false;
    }
    return true;
  };

  const validateReceipt = () => {
    if (method !== PAYMENT_METHOD.BANK_TRANSFER) return true;

    if (!receiptFile) {
      setError('Please upload a receipt/screenshot of your bank transfer');
      return false;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(receiptFile.type)) {
      setError('Please upload a valid image (JPEG, PNG, WebP) or PDF file');
      return false;
    }

    if (receiptFile.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return false;
    }

    return true;
  };

  const validateBankDetails = () => {
    if (method !== PAYMENT_METHOD.BANK_TRANSFER) return true;

    if (!bankAccountName.trim()) {
      setError('Please enter the account holder name');
      return false;
    }
    if (!bankAccountNumber.trim()) {
      setError('Please enter the account number');
      return false;
    }
    if (!bankName.trim()) {
      setError('Please enter the bank name');
      return false;
    }
    if (!bankBranch.trim()) {
      setError('Please enter the bank branch');
      return false;
    }
    return true;
  };

  const validateDeposit = () => {
    return validateAmount() && validatePhone() && validateTrxId() && validateReceipt() && validateBankDetails();
  };

  // ============================================================
  // Duplicate TrxID Check (only for mobile banking)
  //
  // NOTE: there's a small window between this check and the addDoc() call
  // below where two near-simultaneous submissions with the same TrxID
  // could both pass this check (a classic check-then-act race). Since
  // deposits require admin approval before any wallet balance moves, the
  // financial risk is low — an admin would see both pending requests with
  // the same TrxID before approving either. If that ever becomes a real
  // problem, the reliable fix is a Cloud Function that uses the TrxID as a
  // document ID (or a uniqueness-enforcing transaction) instead of a
  // client-side query.
  // ============================================================
  const checkDuplicateTrxId = async (cleanTrxId) => {
    if (method === PAYMENT_METHOD.BANK_TRANSFER) return true;

    try {
      const q = query(collection(db, 'transactions'), where('trxId', '==', cleanTrxId));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const existing = snapshot.docs.some((d) => {
          const data = d.data();
          return data.status === DEPOSIT_STATUS.PENDING || data.status === DEPOSIT_STATUS.APPROVED;
        });

        if (existing) {
          setError('This Transaction ID already exists. Please check your transaction history.');
          return false;
        }
      }
      return true;
    } catch (error) {
      logError('Error checking duplicate TrxID', error);
      return true;
    }
  };

  // ============================================================
  // Upload Receipt to Cloudinary
  // ============================================================
  const uploadReceiptToCloudinary = async () => {
    if (!receiptFile || method !== PAYMENT_METHOD.BANK_TRANSFER) return null;

    try {
      setStatus('Uploading receipt to Cloudinary...');
      const imageUrl = await uploadToCloudinary(receiptFile);

      if (!imageUrl) {
        throw new Error('Failed to upload to Cloudinary');
      }

      return imageUrl;
    } catch (error) {
      logError('Error uploading receipt', error);
      throw new Error('Failed to upload receipt. Please try again.');
    }
  };

  // ============================================================
  // Deposit Handler
  // ============================================================
  // 🔧 ADD (deposit/withdraw lock security requirement): block a new
  // deposit while the user already has one pending review — prevents
  // spam/repeated requests from the same account before admin
  // resolves the first one. This is a client-side check for
  // immediate feedback; the real enforcement is in the Firestore
  // rules (see hasPendingDeposit-equivalent check there), since a
  // client-only check can be bypassed by calling Firestore directly.
  const checkExistingPendingDeposit = async (userId) => {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      where('status', '==', DEPOSIT_STATUS.PENDING)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  };

  const handleDeposit = async () => {
    if (loading || isSubmitting) return;

    if (!user) {
      setError('Please login first!');
      navigate('/login', { replace: true });
      return;
    }

    if (!validateDeposit()) {
      playEvent?.(SOUND_EVENTS.ERROR);
      return;
    }

    // 🔧 ADD (#4): re-check enabled status right before submit — the
    // admin could have disabled this method in the seconds since the
    // page loaded / auto-fallback ran.
    if (!isMethodEnabled(method)) {
      setError('This payment method is currently unavailable. Please choose another.');
      playEvent?.(SOUND_EVENTS.ERROR);
      return;
    }

    setIsSubmitting(true);
    setLoading(true);
    setError('');
    setStatus('Submitting deposit request...');

    try {
      const userId = user.uid;

      const hasPending = await checkExistingPendingDeposit(userId);
      if (hasPending) {
        setError('আপনার একটি ডিপোজিট রিকোয়েস্ট ইতিমধ্যে পেন্ডিং আছে। এটি এডমিন কনফার্ম করার আগে নতুন রিকোয়েস্ট পাঠানো যাবে না।');
        playEvent?.(SOUND_EVENTS.WARNING);
        setIsSubmitting(false);
        setLoading(false);
        return;
      }

      const amountNum = Number(amount);
      const liveMethodConfig = getLiveMethodConfig(method);
      const isBankTransfer = method === PAYMENT_METHOD.BANK_TRANSFER;
      let cleanTrxId = null;

      if (!isBankTransfer) {
        cleanTrxId = trxId.trim().replace(/\s/g, '').toUpperCase();
        const isUnique = await checkDuplicateTrxId(cleanTrxId);
        if (!isUnique) {
          playEvent?.(SOUND_EVENTS.WARNING);
          setIsSubmitting(false);
          setLoading(false);
          return;
        }
      }

      setStatus('Processing your request...');

      const transactionData = {
        userId,
        userEmail: user.email,
        userName: user.displayName || 'User',
        amount: amountNum,
        method,
        methodNumber: isBankTransfer ? 'Bank Transfer' : liveMethodConfig?.number || '',
        status: DEPOSIT_STATUS.PENDING,
        type: isBankTransfer ? 'bank-transfer' : 'deposit',
        source: isBankTransfer ? 'bank_transfer' : 'manual',
        note: note.trim() || '',
        adminRemark: '',
        transactionId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        approvedAt: null,
        rejectedAt: null,
        walletBalanceBefore: 0,
        walletBalanceAfter: 0,
        receiptNumber: null,
        approvedBy: null,
        rejectedBy: null,
      };

      if (isBankTransfer) {
        transactionData.trxId = null;
        transactionData.senderNumber = null;
        transactionData.bankDetails = {
          accountName: bankAccountName.trim(),
          accountNumber: bankAccountNumber.trim(),
          bankName: bankName.trim(),
          branch: bankBranch.trim(),
        };
        transactionData.receiptUrl = null;
        transactionData.receiptFileName = receiptFileName || null;
      } else {
        const cleanTrxIdMobile = trxId.trim().replace(/\s/g, '').toUpperCase();
        const cleanNumber = senderNumber.replace(/\D/g, '');
        transactionData.trxId = cleanTrxIdMobile;
        transactionData.senderNumber = cleanNumber;
        transactionData.bankDetails = null;
        transactionData.receiptUrl = null;
        transactionData.receiptFileName = null;
      }

      const docRef = await addDoc(collection(db, 'transactions'), transactionData);

      await updateDoc(doc(db, 'transactions', docRef.id), { transactionId: docRef.id });

      let receiptUrl = null;
      if (isBankTransfer && receiptFile) {
        try {
          receiptUrl = await uploadReceiptToCloudinary();
          if (receiptUrl) {
            await updateDoc(doc(db, 'transactions', docRef.id), { receiptUrl });
          }
        } catch (uploadError) {
          logError('Receipt upload failed (deposit still saved)', uploadError);
        }
      }

      setStatus('✅ Deposit request submitted! Waiting for admin approval...');
      playEvent?.(SOUND_EVENTS.SUCCESS);

      try {
        const displayTrxId = isBankTransfer ? 'Bank Transfer' : cleanTrxId || trxId;
        await sendWalletDepositNotification(userId, amountNum, displayTrxId, method, DEPOSIT_STATUS.PENDING, docRef.id);
      } catch (notifError) {
        logError('Deposit notification failed', notifError);
      }

      const successMessage = isBankTransfer
        ? `✅ Bank Transfer request submitted!\n\n💰 Amount: ৳${amountNum}\n🏦 Method: ${method}\n📄 Receipt: ${receiptFileName || 'Uploaded'}\n\n⏳ Please wait for admin approval.`
        : `✅ Deposit request submitted!\n\n💰 Amount: ৳${amountNum}\n🏦 Method: ${method}\n📱 TrxID: ${trxId}\n\n⏳ Please wait for admin approval.`;

      feedback.alert.success({ message: successMessage });

      resetForm();
      setTimeout(() => navigate('/wallet'), 2000);
    } catch (error) {
      logError('Deposit error', error);

      let errorMessage = 'Failed to submit deposit. Please try again.';
      if (error.code === 'permission-denied') {
        errorMessage = 'You do not have permission to perform this action. Please login again.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

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
  // Input Handlers
  // ============================================================
  const handleNumberInput = (e, setter) => {
    const value = e.target.value.replace(/\D/g, '');
    setter(value);
  };

  const handleTrxIdInput = (e) => {
    const value = e.target.value.replace(/\s/g, '').toUpperCase();
    setTrxId(value);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setReceiptFile(null);
      setReceiptPreview('');
      setReceiptFileName('');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a valid image (JPEG, PNG, WebP) or PDF file');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      e.target.value = '';
      return;
    }

    setReceiptFile(file);
    setReceiptFileName(file.name);
    setError('');

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReceiptPreview(event.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview('');
    }
  };

  const removeReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview('');
    setReceiptFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const presetAmounts = [100, 200, 500, 1000, 2000, 5000];

  const handleBack = () => {
    navigate(-1);
  };

  const handleMethodChange = (newMethod) => {
    setMethod(newMethod);
    setError('');
    if (newMethod === PAYMENT_METHOD.BANK_TRANSFER) {
      setTrxId('');
      setSenderNumber('');
    } else {
      setReceiptFile(null);
      setReceiptPreview('');
      setReceiptFileName('');
      setBankAccountName('');
      setBankAccountNumber('');
      setBankName('');
      setBankBranch('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

 const isBankTransfer = method === PAYMENT_METHOD.BANK_TRANSFER;
  const methodConfig = PAYMENT_METHODS[method];
  const liveMethodConfig = getLiveMethodConfig(method);

  return (
    <div className={styles.depositContainer}>
      <div className={styles.depositCard}>
        <button className={styles.backBtnSimple} onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        <div className={styles.depositHeader}>
          <h2>
            <i className="fa-solid fa-circle-dollar" style={{ color: '#3b82f6' }}></i> Deposit Money
          </h2>
          <p>Add funds to your wallet</p>
        </div>

        {status && (
          <div
            className={`${styles.statusMessage} ${loading ? styles.processing : styles.success}`}
          >
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-check-circle'}`}></i>
            {status}
          </div>
        )}

        {error && (
          <div className={styles.errorMessage}>
            <i className="fa-solid fa-exclamation-circle"></i> {error}
          </div>
        )}

        <div className={styles.amountPresets}>
          <label>Quick Amount</label>
          <div className={styles.presetButtons}>
            {presetAmounts.map((preset) => (
              <button key={preset} className={`${styles.presetBtn} ${Number(amount) === preset ? styles.active : ''}`} onClick={() => setAmount(String(preset))} disabled={loading}>
                ৳{preset}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>
            <i className="fa-solid fa-wallet"></i> Amount (BDT)
          </label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount (min: 100 BDT)" min={minDeposit} max={maxDeposit} disabled={loading} />
          <span className={styles.inputHint}>
            Min: ৳{minDeposit} • Max: ৳{maxDeposit}
          </span>
        </div>

        <div className={styles.inputGroup}>
          <label>
            <i className="fa-solid fa-credit-card"></i> Payment Method
          </label>
          {methodsConfigLoading ? (
            <div className={styles.inputHint}>
              <i className="fa-solid fa-spinner fa-spin"></i> Loading available payment methods...
            </div>
          ) : enabledMethods.length === 0 ? (
            <div className={styles.errorMessage}>
              <i className="fa-solid fa-exclamation-circle"></i> No deposit methods are currently available. Please try again later.
            </div>
          ) : (
            <div className={styles.methodOptions}>
              {enabledMethods.map((m) => (
                <label key={m} className={`${styles.methodLabel} ${method === m ? styles.active : ''}`}>
                  <input type="radio" value={m} checked={method === m} onChange={(e) => handleMethodChange(e.target.value)} disabled={loading} />
                  {PAYMENT_METHODS[m]?.icon && <i className={PAYMENT_METHODS[m].icon}></i>}
                  {m}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 🔧 ADD (#4): the number to actually send money to — this used
            to be missing from the UI entirely for mobile methods (only
            the bank card existed), and both cards now read live,
            admin-configured values instead of hardcoded ones. */}
        {!isBankTransfer && liveMethodConfig && (
          <div className={styles.bankDetailsSection}>
            <h4>
              {methodConfig?.icon && <i className={methodConfig.icon}></i>} Send Money To
            </h4>
            <div className={styles.bankInfoCard}>
              <div className={styles.bankInfoRow}>
                <span>{method} Number:</span>
                <strong>{liveMethodConfig.number || 'N/A'}</strong>
              </div>
              <div className={styles.bankInfoRow}>
                <span>Account Type:</span>
                <strong>{liveMethodConfig.accountType || 'Personal'}</strong>
              </div>
            </div>
          </div>
        )}

        {isBankTransfer && (
          <>
            <div className={styles.bankDetailsSection}>
              <h4>
                <i className="fa-solid fa-building-columns"></i> Bank Account Details
              </h4>
              <div className={styles.bankInfoCard}>
                <div className={styles.bankInfoRow}>
                  <span>Bank Name:</span>
                  <strong>{liveMethodConfig?.bankName || 'N/A'}</strong>
                </div>
                <div className={styles.bankInfoRow}>
                  <span>Account Name:</span>
                  <strong>{liveMethodConfig?.accountName || 'N/A'}</strong>
                </div>
                <div className={styles.bankInfoRow}>
                  <span>Account Number:</span>
                  <strong>{liveMethodConfig?.accountNumber || 'N/A'}</strong>
                </div>
                <div className={styles.bankInfoRow}>
                  <span>Branch:</span>
                  <strong>{liveMethodConfig?.branch || 'N/A'}</strong>
                </div>
                <div className={styles.bankInfoRow}>
                  <span>Routing Number:</span>
                  <strong>{liveMethodConfig?.routingNumber || 'N/A'}</strong>
                </div>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label>
                <i className="fa-solid fa-user"></i> Your Account Holder Name
              </label>
              <input type="text" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Enter your bank account holder name" disabled={loading} />
            </div>

            <div className={styles.inputGroup}>
              <label>
                <i className="fa-solid fa-hashtag"></i> Your Account Number
              </label>
              <input type="text" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="Enter your bank account number" disabled={loading} />
            </div>

            <div className={styles.inputGroup}>
              <label>
                <i className="fa-solid fa-university"></i> Your Bank Name
              </label>
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Enter your bank name" disabled={loading} />
            </div>

            <div className={styles.inputGroup}>
              <label>
                <i className="fa-solid fa-location-dot"></i> Your Bank Branch
              </label>
              <input type="text" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="Enter your bank branch" disabled={loading} />
            </div>

            <div className={styles.inputGroup}>
              <label>
                <i className="fa-solid fa-image"></i> Upload Receipt/Screenshot
              </label>
              <div className={styles.fileUploadArea}>
                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileChange} disabled={loading} className={styles.fileInput} />
                {!receiptPreview && !receiptFileName && (
                  <div className={styles.fileUploadPlaceholder}>
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <p>Click to upload receipt</p>
                    <small>JPEG, PNG, WebP or PDF (max 5MB)</small>
                  </div>
                )}
                {(receiptPreview || receiptFileName) && (
                  <div className={styles.fileUploadPreview}>
                    {receiptPreview && <img src={receiptPreview} alt="Receipt preview" className={styles.receiptPreview} />}
                    {!receiptPreview && receiptFileName && (
                      <div className={styles.fileNameDisplay}>
                        <i className="fa-solid fa-file-pdf"></i>
                        <span>{receiptFileName}</span>
                      </div>
                    )}
                    <button type="button" className={styles.removeFileBtn} onClick={removeReceipt} disabled={loading}>
                      <i className="fa-solid fa-times"></i>
                    </button>
                  </div>
                )}
              </div>
              {receiptFileName && (
                <span className={styles.inputHint}>
                  <i className="fa-solid fa-check-circle" style={{ color: 'var(--status-success)' }}></i>
                  {receiptFileName} uploaded successfully
                </span>
              )}
            </div>
          </>
        )}

        {!isBankTransfer && (
          <>
            <div className={styles.inputGroup}>
              <label>
                <i className="fa-solid fa-phone"></i> Sender Number
              </label>
              <input type="tel" value={senderNumber} onChange={(e) => handleNumberInput(e, setSenderNumber)} placeholder="Enter 11-digit bKash/Nagad/Rocket number" maxLength="11" disabled={loading} />
              <span className={styles.inputHint}>
                <i className="fa-solid fa-info-circle"></i> The 11-digit number you sent money from
              </span>
            </div>

            <div className={styles.inputGroup}>
              <label>
                <i className="fa-solid fa-receipt"></i> Transaction ID (TrxID)
              </label>
              <input type="text" value={trxId} onChange={handleTrxIdInput} placeholder="Enter transaction ID from your mobile banking app" disabled={loading} />
              <span className={styles.inputHint}>
                <i className="fa-solid fa-info-circle"></i> Find TrxID in your {method} app transaction history
              </span>
            </div>
          </>
        )}

        <div className={styles.inputGroup}>
          <label>
            <i className="fa-solid fa-pen"></i> Note (Optional)
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for admin (optional)" rows="2" maxLength="200" disabled={loading} />
          <span className={styles.charCount}>{note.length}/200</span>
        </div>

        <div className={styles.paymentInstructions}>
          <h4>
            <i className="fa-solid fa-info-circle"></i> How to deposit:
          </h4>
          <ol>
            {isBankTransfer ? (
              <>
                <li>
                  Transfer money to our bank account: <strong>{liveMethodConfig?.bankName || 'N/A'}</strong>
                </li>
                <li>
                  Account Name: <strong>{liveMethodConfig?.accountName || 'N/A'}</strong>
                </li>
                <li>
                  Account Number: <strong>{liveMethodConfig?.accountNumber || 'N/A'}</strong>
                </li>
                <li>
                  Take a <strong>screenshot</strong> of your transfer confirmation
                </li>
                <li>Upload the receipt and fill in your bank details</li>
                <li>
                  Click <strong>"Submit Deposit Request"</strong>
                </li>
                <li>Wait for admin approval (usually within 24 hours)</li>
              </>
            ) : (
              <>
                <li>
                  Send money to this number: <strong>{liveMethodConfig?.number || 'N/A'}</strong>
                </li>
                <li>
                  Copy the <strong>Transaction ID (TrxID)</strong> from your app
                </li>
                <li>Paste the TrxID in the field above</li>
                <li>
                  Click <strong>"Submit Deposit Request"</strong>
                </li>
                <li>Wait for admin approval (usually within 24 hours)</li>
              </>
            )}
          </ol>
        </div>

        <button
          className={`${styles.depositBtn} ${loading ? styles.loading : ''}`}
          onClick={handleDeposit}
          disabled={loading || isSubmitting || methodsConfigLoading || enabledMethods.length === 0}
        >
          {loading ? (
            <span className={styles.loadingContent}>
              <i className="fa-solid fa-spinner fa-spin"></i>
              Submitting...
            </span>
          ) : (
            <>
              <i className="fa-solid fa-paper-plane"></i> Submit Deposit Request
            </>
          )}
        </button>

        <div className={styles.depositFooter}>
          <p>
            <i className="fa-solid fa-shield-check"></i> Your transaction is secure and encrypted
          </p>
          <p className={styles.footerNote}>
            <i className="fa-regular fa-clock"></i> Deposits are processed within 24 hours
          </p>
        </div>
      </div>
    </div>
  );
};

export default Deposit;