// src/pages/Deposit.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { auth, db } from '@/firebase';
import { doc, addDoc, collection, serverTimestamp, query, where, getDocs, updateDoc } from 'firebase/firestore';

import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { sendWalletDepositNotification } from './notificationHelper';
import './Deposit.css';
import useHideBottomNav from '../hooks/useHideBottomNav';
import { logError } from '@/utils/logger';

// ============================================================
// Cloudinary upload
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
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'workhub_preset');

  try {
    const response = await fetch('https://api.cloudinary.com/v1_1/drwex6tmf/image/upload', { method: 'POST', body: formData });
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    logError('Cloudinary upload error', error);
    return null;
  }
};

// ============================================================
// Constants
// ============================================================
const MINIMUM_DEPOSIT = 100;
const MAXIMUM_DEPOSIT = 50000;

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

const PAYMENT_METHODS = {
  [PAYMENT_METHOD.BKASH]: {
    number: '01891696262',
    icon: 'fa-brands fa-btc',
    color: '#E2136E',
    regex: /^(017|018|019)\d{8}$/,
    requiresTrxId: true,
    requiresSenderNumber: true,
    requiresReceipt: false,
  },
  [PAYMENT_METHOD.NAGAD]: {
    number: '017XXXXXXXX',
    icon: 'fa-solid fa-n',
    color: '#F58A1E',
    regex: /^(017|018|019)\d{8}$/,
    requiresTrxId: true,
    requiresSenderNumber: true,
    requiresReceipt: false,
  },
  [PAYMENT_METHOD.ROCKET]: {
    number: '016XXXXXXXX',
    icon: 'fa-solid fa-rocket',
    color: '#E2136E',
    regex: /^(016)\d{8}$/,
    requiresTrxId: true,
    requiresSenderNumber: true,
    requiresReceipt: false,
  },
  [PAYMENT_METHOD.BANK_TRANSFER]: {
    number: 'Bank Account Details',
    icon: 'fa-solid fa-building-columns',
    color: '#438e82',
    regex: null,
    requiresTrxId: false,
    requiresSenderNumber: false,
    requiresReceipt: true,
    bankDetails: {
      bankName: 'City Bank Limited',
      accountName: 'M/S Trust Media',
      accountNumber: '1234567890',
      branch: 'Motijheel Branch',
      routingNumber: 'ABCD1234',
    },
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
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const preferredMethod = location.state?.preferredMethod || null;

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
    if (numAmount < MINIMUM_DEPOSIT) {
      setError(`Minimum deposit amount is ${MINIMUM_DEPOSIT} BDT`);
      return false;
    }
    if (numAmount > MAXIMUM_DEPOSIT) {
      setError(`Maximum deposit amount is ${MAXIMUM_DEPOSIT} BDT`);
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
  const handleDeposit = async () => {
    if (loading || isSubmitting) return;

    if (!user) {
      setError('Please login first!');
      navigate('/login');
      return;
    }

    if (!validateDeposit()) {
      playEvent?.(SOUND_EVENTS.ERROR);
      return;
    }

    setIsSubmitting(true);
    setLoading(true);
    setError('');
    setStatus('Submitting deposit request...');

    try {
      const userId = user.uid;
      const amountNum = Number(amount);
      const methodConfig = PAYMENT_METHODS[method];
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
        methodNumber: isBankTransfer ? 'Bank Transfer' : methodConfig?.number || '',
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

  return (
    <div className="deposit-container">
      <div className="deposit-card">
        <button className="back-btn-simple" onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        <div className="deposit-header">
          <h2>
            <i className="fa-solid fa-circle-dollar" style={{ color: '#3b82f6' }}></i> Deposit Money
          </h2>
          <p>Add funds to your wallet</p>
        </div>

        {status && (
          <div
            className={`status-message ${loading ? 'processing' : 'success'}`}
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md, 12px)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: loading ? 'var(--status-info-bg, #3b82f615)' : 'var(--status-success-bg, #10b98115)',
              color: loading ? 'var(--status-info, #3b82f6)' : 'var(--status-success, #10b981)',
            }}
          >
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-check-circle'}`}></i>
            {status}
          </div>
        )}

        {error && (
          <div className="error-message">
            <i className="fa-solid fa-exclamation-circle"></i> {error}
          </div>
        )}

        <div className="amount-presets">
          <label>Quick Amount</label>
          <div className="preset-buttons">
            {presetAmounts.map((preset) => (
              <button key={preset} className={`preset-btn ${Number(amount) === preset ? 'active' : ''}`} onClick={() => setAmount(String(preset))} disabled={loading}>
                ৳{preset}
              </button>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label>
            <i className="fa-solid fa-wallet"></i> Amount (BDT)
          </label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount (min: 100 BDT)" min={MINIMUM_DEPOSIT} max={MAXIMUM_DEPOSIT} disabled={loading} />
          <span className="input-hint">
            Min: ৳{MINIMUM_DEPOSIT} • Max: ৳{MAXIMUM_DEPOSIT}
          </span>
        </div>

        <div className="input-group">
          <label>
            <i className="fa-solid fa-credit-card"></i> Payment Method
          </label>
          <div className="method-options">
            {Object.values(PAYMENT_METHOD).map((m) => (
              <label key={m} className={`method-label ${method === m ? 'active' : ''}`}>
                <input type="radio" value={m} checked={method === m} onChange={(e) => handleMethodChange(e.target.value)} disabled={loading} />
                {PAYMENT_METHODS[m]?.icon && <i className={PAYMENT_METHODS[m].icon}></i>}
                {m}
              </label>
            ))}
          </div>
        </div>

        {isBankTransfer && (
          <>
            <div className="bank-details-section">
              <h4>
                <i className="fa-solid fa-building-columns"></i> Bank Account Details
              </h4>
              <div className="bank-info-card">
                <div className="bank-info-row">
                  <span>Bank Name:</span>
                  <strong>{methodConfig?.bankDetails?.bankName}</strong>
                </div>
                <div className="bank-info-row">
                  <span>Account Name:</span>
                  <strong>{methodConfig?.bankDetails?.accountName}</strong>
                </div>
                <div className="bank-info-row">
                  <span>Account Number:</span>
                  <strong>{methodConfig?.bankDetails?.accountNumber}</strong>
                </div>
                <div className="bank-info-row">
                  <span>Branch:</span>
                  <strong>{methodConfig?.bankDetails?.branch}</strong>
                </div>
                <div className="bank-info-row">
                  <span>Routing Number:</span>
                  <strong>{methodConfig?.bankDetails?.routingNumber}</strong>
                </div>
              </div>
            </div>

            <div className="input-group">
              <label>
                <i className="fa-solid fa-user"></i> Your Account Holder Name
              </label>
              <input type="text" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Enter your bank account holder name" disabled={loading} />
            </div>

            <div className="input-group">
              <label>
                <i className="fa-solid fa-hashtag"></i> Your Account Number
              </label>
              <input type="text" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="Enter your bank account number" disabled={loading} />
            </div>

            <div className="input-group">
              <label>
                <i className="fa-solid fa-university"></i> Your Bank Name
              </label>
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Enter your bank name" disabled={loading} />
            </div>

            <div className="input-group">
              <label>
                <i className="fa-solid fa-location-dot"></i> Your Bank Branch
              </label>
              <input type="text" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="Enter your bank branch" disabled={loading} />
            </div>

            <div className="input-group">
              <label>
                <i className="fa-solid fa-image"></i> Upload Receipt/Screenshot
              </label>
              <div className="file-upload-area">
                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileChange} disabled={loading} className="file-input" />
                {!receiptPreview && !receiptFileName && (
                  <div className="file-upload-placeholder">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <p>Click to upload receipt</p>
                    <small>JPEG, PNG, WebP or PDF (max 5MB)</small>
                  </div>
                )}
                {(receiptPreview || receiptFileName) && (
                  <div className="file-upload-preview">
                    {receiptPreview && <img src={receiptPreview} alt="Receipt preview" className="receipt-preview" />}
                    {!receiptPreview && receiptFileName && (
                      <div className="file-name-display">
                        <i className="fa-solid fa-file-pdf"></i>
                        <span>{receiptFileName}</span>
                      </div>
                    )}
                    <button type="button" className="remove-file-btn" onClick={removeReceipt} disabled={loading}>
                      <i className="fa-solid fa-times"></i>
                    </button>
                  </div>
                )}
              </div>
              {receiptFileName && (
                <span className="input-hint">
                  <i className="fa-solid fa-check-circle" style={{ color: 'var(--status-success)' }}></i>
                  {receiptFileName} uploaded successfully
                </span>
              )}
            </div>
          </>
        )}

        {!isBankTransfer && (
          <>
            <div className="input-group">
              <label>
                <i className="fa-solid fa-phone"></i> Sender Number
              </label>
              <input type="tel" value={senderNumber} onChange={(e) => handleNumberInput(e, setSenderNumber)} placeholder="Enter 11-digit bKash/Nagad/Rocket number" maxLength="11" disabled={loading} />
              <span className="input-hint">
                <i className="fa-solid fa-info-circle"></i> The 11-digit number you sent money from
              </span>
            </div>

            <div className="input-group">
              <label>
                <i className="fa-solid fa-receipt"></i> Transaction ID (TrxID)
              </label>
              <input type="text" value={trxId} onChange={handleTrxIdInput} placeholder="Enter transaction ID from your mobile banking app" disabled={loading} />
              <span className="input-hint">
                <i className="fa-solid fa-info-circle"></i> Find TrxID in your {method} app transaction history
              </span>
            </div>
          </>
        )}

        <div className="input-group">
          <label>
            <i className="fa-solid fa-pen"></i> Note (Optional)
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for admin (optional)" rows="2" maxLength="200" disabled={loading} />
          <span className="char-count">{note.length}/200</span>
        </div>

        <div className="payment-instructions">
          <h4>
            <i className="fa-solid fa-info-circle"></i> How to deposit:
          </h4>
          <ol>
            {isBankTransfer ? (
              <>
                <li>
                  Transfer money to our bank account: <strong>{methodConfig?.bankDetails?.bankName}</strong>
                </li>
                <li>
                  Account Name: <strong>{methodConfig?.bankDetails?.accountName}</strong>
                </li>
                <li>
                  Account Number: <strong>{methodConfig?.bankDetails?.accountNumber}</strong>
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
                  Send money to this number: <strong>{methodConfig?.number}</strong>
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
          className={`deposit-btn ${loading ? 'loading' : ''}`}
          onClick={handleDeposit}
          disabled={loading || isSubmitting}
          style={{ background: loading ? 'var(--bg-tertiary, #1a2030)' : 'var(--gradient-primary)', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--accent-primary, #14b8a6)' }}></i>
              Submitting...
            </span>
          ) : (
            <>
              <i className="fa-solid fa-paper-plane"></i> Submit Deposit Request
            </>
          )}
        </button>

        <div className="deposit-footer">
          <p>
            <i className="fa-solid fa-shield-check"></i> Your transaction is secure and encrypted
          </p>
          <p className="footer-note">
            <i className="fa-regular fa-clock"></i> Deposits are processed within 24 hours
          </p>
        </div>
      </div>
    </div>
  );
};

export default Deposit;