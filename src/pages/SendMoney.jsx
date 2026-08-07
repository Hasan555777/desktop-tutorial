// src/pages/SendMoney.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
import { 
  doc, 
  getDoc, 
  runTransaction, 
  collection, 
  serverTimestamp,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { 
  sendMoneyTransferNotification,
  sendWalletBalanceNotification,
  NOTIFICATION_TYPES 
} from './notificationHelper';
import './SendMoney.css';
import useHideBottomNav from "@/hooks/useHideBottomNav";

// ============================================================
// ✅ Constants
// ============================================================
const MINIMUM_AMOUNT = 10;
const MAX_AMOUNT = 50000;
const TRANSACTION_STATUS = {
  COMPLETED: 'completed',
  PENDING: 'pending',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const TRANSACTION_TYPE = {
  CREDIT: 'credit',
  DEBIT: 'debit'
};

// ============================================================
// ✅ Generate Unique Transfer ID
// ============================================================
const generateTransferId = () => {
  const date = new Date();
  const dateStr = date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TRF-${dateStr}-${random}`;
};

// ============================================================
// ✅ Generate Unique Wallet ID (with collision check)
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
    
    // ✅ Check if wallet ID already exists
    const q = query(
      collection(db, 'users'),
      where('walletId', '==', result)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return result;
    }
    attempts++;
  }
  
  // Fallback: use timestamp based
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
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);

  // ============================================================
  // ✅ Load Balance
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const loadBalance = async () => {
      try {
        const walletRef = doc(db, 'wallets', user.uid);
        const walletSnap = await getDoc(walletRef);
        
        if (walletSnap.exists()) {
          setBalance(walletSnap.data().balance || 0);
        }
      } catch (error) {
        console.error("Error loading balance:", error);
      } finally {
        setWalletLoading(false);
      }
    };

    loadBalance();
  }, [user, navigate]);

  // ============================================================
  // ✅ Receiver ID Change হলে Reset
  // ============================================================
  useEffect(() => {
    setReceiverUid('');
    setReceiverWalletId('');
    setReceiverName('');
    setError('');
  }, [receiverId]);

  // ============================================================
  // ✅ Find Receiver
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

      // ১. Wallet ID দিয়ে খোঁজা
      const walletIdQuery = query(
        collection(db, 'users'),
        where('walletId', '==', searchTerm.toUpperCase())
      );
      const walletIdSnap = await getDocs(walletIdQuery);
      
      if (!walletIdSnap.empty) {
        const doc = walletIdSnap.docs[0];
        foundUser = { id: doc.id, ...doc.data() };
      }

      // ২. Unique ID দিয়ে খোঁজা
      if (!foundUser) {
        const uniqueIdQuery = query(
          collection(db, 'users'),
          where('uniqueId', '==', searchTerm.toUpperCase())
        );
        const uniqueIdSnap = await getDocs(uniqueIdQuery);
        
        if (!uniqueIdSnap.empty) {
          const doc = uniqueIdSnap.docs[0];
          foundUser = { id: doc.id, ...doc.data() };
        }
      }

      // ৩. Phone দিয়ে খোঁজা
      if (!foundUser) {
        const phoneQuery = query(
          collection(db, 'users'),
          where('phone', '==', searchTerm)
        );
        const phoneSnap = await getDocs(phoneQuery);
        
        if (!phoneSnap.empty) {
          const doc = phoneSnap.docs[0];
          foundUser = { id: doc.id, ...doc.data() };
        }
      }

      // ৪. Email দিয়ে খোঁজা
      if (!foundUser) {
        const emailQuery = query(
          collection(db, 'users'),
          where('email', '==', searchTerm.toLowerCase())
        );
        const emailSnap = await getDocs(emailQuery);
        
        if (!emailSnap.empty) {
          const doc = emailSnap.docs[0];
          foundUser = { id: doc.id, ...doc.data() };
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
        
        feedback.alert.success({ 
          message: `✅ User found: ${foundUser.displayName || foundUser.email}` 
        });
      } else {
        setError('User not found! Please check the ID, wallet ID, or phone number.');
        setReceiverName('');
        setReceiverUid('');
        setReceiverWalletId('');
      }
    } catch (error) {
      console.error("❌ Error finding receiver:", error);
      setError('Failed to find user. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  // ============================================================
  // ✅ Send Money (Production Ready)
  // ============================================================
  const handleSend = async () => {
    // Validation
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

    if (Number(amount) > balance) {
      setError(`Insufficient balance! Available: ৳${balance.toFixed(2)}`);
      return;
    }

    const confirmed = await feedback.confirm({
      title: 'Confirm Transfer',
      message: `Are you sure you want to send ৳${amount} to ${receiverName}?`,
      variant: 'confirm',
      confirmText: 'Yes, Send',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setLoading(true);
    setError('');

    // ✅ Generate transfer ID
    const transferId = generateTransferId();
    let generatedWalletId = null;
    let transactionId = null;

    try {
      const senderWalletRef = doc(db, 'wallets', user.uid);
      const receiverWalletRef = doc(db, 'wallets', receiverUid);
      const amountNum = Number(amount);
      const senderName = user.displayName || user.email?.split('@')[0] || 'User';

      console.log('📤 Sending money... Transfer ID:', transferId);

      // 🔥 Firestore Transaction
      await runTransaction(db, async (transaction) => {
        // ১. Sender Wallet Check
        const senderDoc = await transaction.get(senderWalletRef);
        if (!senderDoc.exists()) {
          throw new Error('Sender wallet not found!');
        }

        const senderBalance = senderDoc.data().balance || 0;
        if (senderBalance < amountNum) {
          throw new Error('Insufficient balance!');
        }

        // ২. Receiver Wallet Check
        const receiverDoc = await transaction.get(receiverWalletRef);
        let receiverBalance = 0;
        let finalWalletId = receiverWalletId;

        if (receiverDoc.exists()) {
          receiverBalance = receiverDoc.data().balance || 0;
          finalWalletId = receiverDoc.data().walletId || receiverWalletId;
        } else {
          // ✅ Generate new wallet ID (outside transaction)
          generatedWalletId = await generateWalletId();
          finalWalletId = generatedWalletId;
        }

        // ৩. Sender Balance Update
        transaction.update(senderWalletRef, {
          balance: senderBalance - amountNum,
          updatedAt: serverTimestamp()
        });

        // ৪. Receiver Balance Update
        if (receiverDoc.exists()) {
          transaction.update(receiverWalletRef, {
            balance: receiverBalance + amountNum,
            totalEarned: (receiverDoc.data().totalEarned || 0) + amountNum,
            updatedAt: serverTimestamp()
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
            updatedAt: serverTimestamp()
          });
        }

        // ৫. Sender Transaction Record
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
          receiverName: receiverName,
          receiverWalletId: finalWalletId,
          transferId: transferId,
          note: note.trim() || '',
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });

        // ৬. Receiver Transaction Record
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
          senderName: senderName,
          senderWalletId: userData?.walletId || '',
          transferId: transferId,
          note: note.trim() || '',
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
      });

      // ✅ State Update OUTSIDE transaction
      if (generatedWalletId) {
        setReceiverWalletId(generatedWalletId);
      }

      // ✅ Transaction Success
      setBalance(prev => prev - amountNum);

      // ✅ ✅ Send Notifications (Separate try-catch)
      try {
        // ✅ NEW: Use sendMoneyTransferNotification
        await sendMoneyTransferNotification({
          senderId: user.uid,
          senderName: senderName,
          receiverId: receiverUid,
          receiverName: receiverName,
          amount: amountNum,
          transferId: transferId,
          transactionId: transactionId,
          note: note.trim() || '',
        });

        console.log('✅ Notifications sent successfully');
} catch (notifError) {
  console.error('⚠️ Notification failed but transaction succeeded:', notifError);
  // ✅ Show subtle notification
  feedback.toast({
    title: 'Money Sent ✅',
    message: 'Transaction completed successfully',
    variant: 'success',
    duration: 3000
  });
}

      // ✅ Success Feedback
      feedback.alert.success({ 
        message: `✅ ৳${amount} sent successfully to ${receiverName}!` 
      });
      
      // Form Reset
      setAmount('');
      setReceiverId('');
      setReceiverName('');
      setReceiverUid('');
      setReceiverWalletId('');
      setNote('');
      
      // ✅ Navigate after a short delay (not waiting for notification)
      setTimeout(() => navigate('/wallet'), 1500);

    } catch (error) {
      console.error("❌ Transaction error:", error);
      setError(error.message || 'Failed to send money. Please try again.');
      
      feedback.alert.error({ 
        message: error.message || 'Failed to send money. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
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
  // ✅ Back Handler
  // ============================================================
  const handleBack = () => {
    navigate(-1);
  };

  // ============================================================
  // ✅ Loading State
  // ============================================================
if (walletLoading) {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      padding: '60px 20px',
      minHeight: '300px',
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
      </div>
    </div>
  );
}
  // ============================================================
  // ✅ Render
  // ============================================================
  return (
    <div className="sendmoney-container">
      <div className="sendmoney-card">
        
        {/* Back Button */}
        <button className="back-btn-simple" onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        {/* Header */}
        <div className="sendmoney-header">
          <h2>
            <i className="fa-solid fa-paper-plane" style={{ color: '#3b82f6' }}></i> 
            Send Money
          </h2>
        </div>

        {/* Balance Display */}
        <div className="balance-display">
          <span className="balance-label">Available Balance</span>
          <span className="balance-amount">{formatMoney(balance)}</span>
        </div>

        {/* Error */}
        {error && (
          <div className="sendmoney-error">
            <i className="fa-solid fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        {/* Receiver Input */}
        <div className="input-group">
          <label>Receiver ID / Wallet ID / Phone</label>
          <div className="receiver-input-group">
            <input 
              type="text" 
              value={receiverId}
              onChange={(e) => setReceiverId(e.target.value)}
              placeholder="e.g., WL-XXXXXX-XXXX or 017XXXXXXXX"
              disabled={searching || loading}
            />
            <button 
              className="find-btn"
              onClick={findReceiver}
              disabled={searching || loading || !receiverId.trim()}
            >
              {searching ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className="fa-solid fa-search"></i>
              )}
            </button>
          </div>
          {receiverName && (
            <div className="receiver-found">
              <i className="fa-solid fa-check-circle" style={{ color: '#10b981' }}></i>
              Sending to: <strong>{receiverName}</strong>
              {receiverWalletId && (
                <span className="receiver-wallet-id">(Wallet: {receiverWalletId})</span>
              )}
            </div>
          )}
        </div>

        {/* Amount Input */}
        <div className="input-group">
          <label>Amount (BDT)</label>
          <div className="amount-input-group">
            <span className="currency-icon">৳</span>
            <input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              min={MINIMUM_AMOUNT}
              max={Math.min(balance, MAX_AMOUNT)}
              disabled={loading || !receiverName}
            />
          </div>
          <div className="amount-hint">
            <span>Min: ৳{MINIMUM_AMOUNT}</span>
            <span>Max: {formatMoney(Math.min(balance, MAX_AMOUNT))}</span>
          </div>
        </div>

        {/* Preset Amounts */}
        <div className="preset-amounts">
          {[100, 500, 1000, 2000].map((preset) => (
            <button
              key={preset}
              className={`preset-btn ${Number(amount) === preset ? 'active' : ''}`}
              onClick={() => setAmount(String(preset))}
              disabled={loading || !receiverName || preset > balance}
            >
              ৳{preset}
            </button>
          ))}
        </div>

        {/* Note */}
        <div className="input-group">
          <label>Note (Optional)</label>
          <textarea 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note for the receiver..."
            rows="2"
            maxLength="100"
            disabled={loading}
          />
          <span className="char-count">{note.length}/100</span>
        </div>

        {/* Summary */}
        {receiverName && amount && (
          <div className="send-summary">
            <div className="summary-row">
              <span>Amount:</span>
              <strong>{formatMoney(Number(amount) || 0)}</strong>
            </div>
            <div className="summary-row">
              <span>Fee:</span>
              <strong style={{ color: '#10b981' }}>Free</strong>
            </div>
            <div className="summary-row total">
              <span>Total:</span>
              <strong>{formatMoney(Number(amount) || 0)}</strong>
            </div>
          </div>
        )}

        {/* Send Button */}
        <button 
          className="send-btn" 
          onClick={handleSend}
          disabled={loading || !receiverName || !amount || Number(amount) > balance || Number(amount) < MINIMUM_AMOUNT}
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

        {/* Footer */}
        <div className="sendmoney-footer">
          <p>
            <i className="fa-solid fa-shield-check"></i> 
            Your transaction is secure and encrypted
          </p>
        </div>

      </div>
    </div>
  );
};

export default SendMoney;