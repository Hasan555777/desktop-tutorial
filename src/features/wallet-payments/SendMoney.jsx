// src/pages/SendMoney.jsx

import React, { useState, useEffect } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc, runTransaction, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../shared/context/AuthContext';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { sendMoneyTransferNotification } from '../notifications/notificationHelper';
import styles from './SendMoney.module.css';
import useHideBottomNav from '../../shared/hooks/useHideBottomNav';
import { logError, logInfo } from '../../shared/utils/logger';

// ============================================================
// Constants
// ============================================================
const MINIMUM_AMOUNT = 10;
const MAX_AMOUNT = 50000;
const TRANSACTION_STATUS = {
  COMPLETED: 'completed',
  PENDING: 'pending',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const TRANSACTION_TYPE = {
  CREDIT: 'credit',
  DEBIT: 'debit',
};

// ============================================================
// Generate Unique Transfer ID
// ============================================================
const generateTransferId = () => {
  const date = new Date();
  const dateStr = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TRF-${dateStr}-${random}`;
};

// ============================================================
// Generate Unique Wallet ID
// ============================================================
const generateWalletId = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    let result = 'WL-';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    result += '-';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const q = query(collection(db, 'users'), where('walletId', '==', result));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return result;
    }
    attempts++;
  }

  return `WL-${Date.now().toString(36).toUpperCase()}`;
};

const SendMoney = () => {
  useHideBottomNav();
  const navigate = useNavigate();
  const user = auth.currentUser;
  const { userData } = useAuth();
  const feedback = useFeedback();

  const [amount, setAmount] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [receiverUid, setReceiverUid] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverWalletId, setReceiverWalletId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  usePageLoadingBar(loading);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const [balance, setBalance] = useState(0);
  const [lockedBalance, setLockedBalance] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);

  // ============================================================
  // Load Balance
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    const loadBalance = async () => {
      try {
        const walletRef = doc(db, 'wallets', user.uid);
        const walletSnap = await getDoc(walletRef);

        if (walletSnap.exists()) {
          const data = walletSnap.data();
          const rawBalance = data.balance || 0;
          const locked = data.lockedBalance || 0;
          const available = rawBalance - locked;

          setBalance(rawBalance);
          setLockedBalance(locked);
          setAvailableBalance(available);
        }
      } catch (error) {
        logError('Error loading balance', error);
      } finally {
        setWalletLoading(false);
      }
    };

    loadBalance();
  }, [user, navigate]);

  // ============================================================
  // Receiver ID Change হলে Reset
  // ============================================================
  useEffect(() => {
    setReceiverUid('');
    setReceiverWalletId('');
    setReceiverName('');
    setError('');
  }, [receiverId]);

  // ============================================================
  // Find Receiver
  // ============================================================
  const findReceiver = async () => {
    if (!receiverId.trim()) {
      setError('Please enter receiver ID, wallet ID, or phone number');
      return;
    }

    setSearching(true);
    setError('');
    setReceiverUid('');
    setReceiverWalletId('');

    try {
      const searchTerm = receiverId.trim();
      let foundUser = null;

      const walletIdQuery = query(collection(db, 'users'), where('walletId', '==', searchTerm.toUpperCase()));
      const walletIdSnap = await getDocs(walletIdQuery);
      if (!walletIdSnap.empty) {
        const d = walletIdSnap.docs[0];
        foundUser = { id: d.id, ...d.data() };
      }

      if (!foundUser) {
        const uniqueIdQuery = query(collection(db, 'users'), where('uniqueId', '==', searchTerm.toUpperCase()));
        const uniqueIdSnap = await getDocs(uniqueIdQuery);
        if (!uniqueIdSnap.empty) {
          const d = uniqueIdSnap.docs[0];
          foundUser = { id: d.id, ...d.data() };
        }
      }

      if (!foundUser) {
        const phoneQuery = query(collection(db, 'users'), where('phone', '==', searchTerm));
        const phoneSnap = await getDocs(phoneQuery);
        if (!phoneSnap.empty) {
          const d = phoneSnap.docs[0];
          foundUser = { id: d.id, ...d.data() };
        }
      }

      if (!foundUser) {
        const emailQuery = query(collection(db, 'users'), where('email', '==', searchTerm.toLowerCase()));
        const emailSnap = await getDocs(emailQuery);
        if (!emailSnap.empty) {
          const d = emailSnap.docs[0];
          foundUser = { id: d.id, ...d.data() };
        }
      }

      if (foundUser) {
        if (foundUser.id === user.uid) {
          setError('You cannot send money to yourself!');
          setReceiverName('');
          return;
        }

        setReceiverUid(foundUser.id);
        setReceiverWalletId(foundUser.walletId || '');
        setReceiverName(foundUser.displayName || foundUser.email || 'User');
        setError('');

        feedback.alert.success({ message: `✅ User found: ${foundUser.displayName || foundUser.email}` });
      } else {
        setError('User not found! Please check the ID, wallet ID, or phone number.');
        setReceiverName('');
        setReceiverUid('');
        setReceiverWalletId('');
      }
    } catch (error) {
      logError('Error finding receiver', error);
      setError('Failed to find user. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  // ============================================================
  // Send Money
  // ============================================================
  const handleSend = async () => {
    if (!receiverUid) {
      setError('Please find receiver first by clicking the search button');
      return;
    }

    if (!receiverName) {
      setError('Please find receiver first');
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (Number(amount) < MINIMUM_AMOUNT) {
      setError(`Minimum amount is ${MINIMUM_AMOUNT} BDT`);
      return;
    }

    if (Number(amount) > MAX_AMOUNT) {
      setError(`Maximum amount is ${MAX_AMOUNT} BDT`);
      return;
    }

    if (Number(amount) > availableBalance) {
      setError(`Insufficient available balance! \nAvailable: ৳${availableBalance.toFixed(2)} \n(Total: ৳${balance.toFixed(2)}, Locked in deals: ৳${lockedBalance.toFixed(2)})`);
      return;
    }

    const confirmed = await feedback.confirm({
      title: 'Confirm Transfer',
      message: `Are you sure you want to send ৳${amount} to ${receiverName}?`,
      variant: 'confirm',
      confirmText: 'Yes, Send',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    // 🔐 SECURITY (account-password confirmation): money can only leave the
    // wallet after the account owner re-proves their identity with their
    // account password — a confirmed "Send" click alone isn't enough for a
    // real money movement (e.g. an unattended/unlocked device). Uses the
    // same Firebase reauthenticateWithCredential() pattern Settings already
    // uses for password changes.
    const password = await feedback.prompt({
      title: '🔐 পাসওয়ার্ড কনফার্ম করুন',
      message: 'টাকা পাঠানো নিশ্চিত করতে আপনার অ্যাকাউন্টের পাসওয়ার্ড দিন।',
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
      logError('Send money password confirmation failed', authError);
      const wrongPassword = ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(authError.code);
      feedback.alert.error({
        message: wrongPassword
          ? '❌ পাসওয়ার্ড সঠিক নয়! লেনদেন বাতিল করা হয়েছে।'
          : '❌ পাসওয়ার্ড যাচাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
      });
      return;
    }

    setLoading(true);
    setError('');

    const transferId = generateTransferId();
    let generatedWalletId = null;
    let transactionId = null;

    try {
      const senderWalletRef = doc(db, 'wallets', user.uid);
      const receiverWalletRef = doc(db, 'wallets', receiverUid);
      const amountNum = Number(amount);
      const senderName = user.displayName || user.email?.split('@')[0] || 'User';

      let preparedWalletId = null;
      if (!receiverWalletId) {
        const receiverPrecheck = await getDoc(receiverWalletRef);
        if (!receiverPrecheck.exists()) {
          preparedWalletId = await generateWalletId();
        }
      }

      await runTransaction(db, async (transaction) => {
        const senderDoc = await transaction.get(senderWalletRef);
        if (!senderDoc.exists()) {
          throw new Error('Sender wallet not found!');
        }

        const senderData = senderDoc.data();
        const senderBalance = senderData.balance || 0;
        const senderLocked = senderData.lockedBalance || 0;
        const senderAvailable = senderBalance - senderLocked;

        if (senderAvailable < amountNum) {
          throw new Error(`Insufficient available balance! Available: ৳${senderAvailable.toFixed(2)}`);
        }

        const receiverDoc = await transaction.get(receiverWalletRef);
        let receiverBalance = 0;
        let finalWalletId = receiverWalletId;

        if (receiverDoc.exists()) {
          receiverBalance = receiverDoc.data().balance || 0;
          finalWalletId = receiverDoc.data().walletId || receiverWalletId;
        } else {
          generatedWalletId = preparedWalletId || `WL-${Date.now().toString(36).toUpperCase()}`;
          finalWalletId = generatedWalletId;
        }

        transaction.update(senderWalletRef, { balance: senderBalance - amountNum, updatedAt: serverTimestamp() });

        if (receiverDoc.exists()) {
          transaction.update(receiverWalletRef, {
            balance: receiverBalance + amountNum,
            totalEarned: (receiverDoc.data().totalEarned || 0) + amountNum,
            updatedAt: serverTimestamp(),
          });
        } else {
          transaction.set(receiverWalletRef, {
            balance: amountNum,
            totalEarned: amountNum,
            totalWithdrawn: 0,
            pendingWithdraw: 0,
            userId: receiverUid,
            walletId: generatedWalletId,
            currency: 'BDT',
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const senderTxRef = doc(collection(db, 'transactions'));
        transactionId = senderTxRef.id;

        transaction.set(senderTxRef, {
          userId: user.uid,
          userName: senderName,
          userWalletId: userData?.walletId || '',
          amount: amountNum,
          type: TRANSACTION_TYPE.DEBIT,
          status: TRANSACTION_STATUS.COMPLETED,
          title: 'Money Sent',
          description: `Sent to ${receiverName}`,
          receiverId: receiverUid,
          receiverName,
          receiverWalletId: finalWalletId,
          transferId,
          note: note.trim() || '',
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        });

        const receiverTxRef = doc(collection(db, 'transactions'));
        transaction.set(receiverTxRef, {
          userId: receiverUid,
          userName: receiverName,
          userWalletId: finalWalletId,
          amount: amountNum,
          type: TRANSACTION_TYPE.CREDIT,
          status: TRANSACTION_STATUS.COMPLETED,
          title: 'Money Received',
          description: `Received from ${senderName}`,
          senderId: user.uid,
          senderName,
          senderWalletId: userData?.walletId || '',
          transferId,
          note: note.trim() || '',
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        });
      });

      if (generatedWalletId) {
        setReceiverWalletId(generatedWalletId);
      }

      setBalance((prev) => prev - amountNum);
      setAvailableBalance((prev) => prev - amountNum);

      try {
        await sendMoneyTransferNotification({
          senderId: user.uid,
          senderName,
          receiverId: receiverUid,
          receiverName,
          amount: amountNum,
          transferId,
          transactionId,
          note: note.trim() || '',
        });
      } catch (notifError) {
        logError('Money transfer notification failed (transaction still succeeded)', notifError);
        feedback.toast({ title: 'Money Sent ✅', message: 'Transaction completed successfully', variant: 'success', duration: 3000 });
      }

      feedback.alert.success({ message: `✅ ৳${amount} sent successfully to ${receiverName}!` });

      setAmount('');
      setReceiverId('');
      setReceiverName('');
      setReceiverUid('');
      setReceiverWalletId('');
      setNote('');

      setTimeout(() => navigate('/wallet'), 1500);
    } catch (error) {
      logError('Send money transaction error', error);
      setError(error.message || 'Failed to send money. Please try again.');
      feedback.alert.error({ message: error.message || 'Failed to send money. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Format Money
  // ============================================================
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount || 0);
  };

  // ============================================================
  // Back Handler
  // ============================================================
  const handleBack = () => {
    navigate(-1);
  };

  // ============================================================
  // Loading State
  // ============================================================
  if (walletLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-wallet ${styles.loadingIcon}`} />
          <h2>Loading Wallet...</h2>
          <p>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your wallet information...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className={styles.sendmoneyContainer}>
      <div className={styles.sendmoneyCard}>
        <button className={styles.backBtnSimple} onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        <div className={styles.sendmoneyHeader}>
          <h2>
            <i className="fa-solid fa-paper-plane" style={{ color: '#3b82f6' }}></i> Send Money
          </h2>
        </div>

        <div className={styles.balanceDisplay}>
          <span className={styles.balanceLabel}>Available Balance</span>
          <span className={styles.balanceAmount}>{formatMoney(availableBalance)}</span>
          {lockedBalance > 0 && (
            <div className={styles.lockedHint}>
              <i className="fa-solid fa-lock"></i> {formatMoney(lockedBalance)} locked in active deals
              <span className={styles.lockedTotal}>(Total: {formatMoney(balance)})</span>
            </div>
          )}
        </div>

        {error && (
          <div className={styles.sendmoneyError}>
            <i className="fa-solid fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        <div className={styles.inputGroup}>
          <label>Receiver ID / Wallet ID / Phone</label>
          <div className={styles.receiverInputGroup}>
            <input
              type="text"
              value={receiverId}
              onChange={(e) => setReceiverId(e.target.value)}
              placeholder="e.g., WL-XXXXXX-XXXX or 017XXXXXXXX"
              disabled={searching || loading}
            />
            <button className={styles.findBtn} onClick={findReceiver} disabled={searching || loading || !receiverId.trim()}>
              {searching ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-search"></i>}
            </button>
          </div>
          {receiverName && (
            <div className={styles.receiverFound}>
              <i className="fa-solid fa-check-circle" style={{ color: '#10b981' }}></i>
              Sending to: <strong>{receiverName}</strong>
              {receiverWalletId && <span className={styles.receiverWalletId}>(Wallet: {receiverWalletId})</span>}
            </div>
          )}
        </div>

        <div className={styles.inputGroup}>
          <label>Amount (BDT)</label>
          <div className={styles.amountInputGroup}>
            <span className={styles.currencyIcon}>৳</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              min={MINIMUM_AMOUNT}
              max={Math.min(availableBalance, MAX_AMOUNT)}
              disabled={loading || !receiverName}
            />
          </div>
          <div className={styles.amountHint}>
            <span>Min: ৳{MINIMUM_AMOUNT}</span>
            <span>Max: {formatMoney(Math.min(availableBalance, MAX_AMOUNT))}</span>
          </div>
        </div>

        <div className={styles.presetAmounts}>
          {[100, 500, 1000, 2000].map((preset) => (
            <button 
              key={preset} 
              className={`${styles.presetBtn} ${Number(amount) === preset ? styles.active : ''}`} 
              onClick={() => setAmount(String(preset))} 
              disabled={loading || !receiverName || preset > availableBalance}
            >
              ৳{preset}
            </button>
          ))}
        </div>

        <div className={styles.inputGroup}>
          <label>Note (Optional)</label>
          <textarea 
            value={note} 
            onChange={(e) => setNote(e.target.value)} 
            placeholder="Add a note for the receiver..." 
            rows="2" 
            maxLength="100" 
            disabled={loading} 
          />
          <span className={styles.charCount}>{note.length}/100</span>
        </div>

        {receiverName && amount && (
          <div className={styles.sendSummary}>
            <div className={styles.summaryRow}>
              <span>Amount:</span>
              <strong>{formatMoney(Number(amount) || 0)}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Fee:</span>
              <strong style={{ color: '#10b981' }}>Free</strong>
            </div>
            <div className={`${styles.summaryRow} ${styles.total}`}>
              <span>Total:</span>
              <strong>{formatMoney(Number(amount) || 0)}</strong>
            </div>
          </div>
        )}

        <button 
          className={styles.sendBtn} 
          onClick={handleSend} 
          disabled={loading || !receiverName || !amount || Number(amount) > availableBalance || Number(amount) < MINIMUM_AMOUNT}
        >
          {loading ? (
            <>
              <i className="fa-solid fa-spinner fa-spin"></i> Sending...
            </>
          ) : (
            <>
              <i className="fa-solid fa-paper-plane"></i> Send Money
            </>
          )}
        </button>

        <div className={styles.sendmoneyFooter}>
          <p>
            <i className="fa-solid fa-shield-check"></i> Your transaction is secure and encrypted
          </p>
        </div>
      </div>
    </div>
  );
};

export default SendMoney;