// src/pages/PaymentGateway.jsx
//
// এই ফাইলের কাজ এক লাইনে: বায়ার একটা মাইলস্টোন "ফান্ড" করলে —
//   1. buyer.balance -= amount        (টাকা ওয়ালেট থেকে বেরিয়ে escrow-তে যায়)
//   2. buyer.lockedBalance -= amount  (আগে যেটা শুধু "রিজার্ভ" ছিল, এখন সত্যিই খরচ
//      হয়ে গেছে, তাই লক থেকে সরিয়ে ফেলা হলো — DealManager.jsx-এর
//      activateDealWithEscrowLock যে lockedBalance += budget করেছিল, ফান্ড করার
//      সময় সেটা ধীরে ধীরে কমে আসে)
//   3. milestone.status: 'pending' -> 'funded' (+ fundedAt স্ট্যাম্প — সেলারের
//      কাছে এখন থেকে ৭ দিন সময় আছে কাজ জমা দেওয়ার জন্য, নাহলে DealManager.jsx
//      অটোমেটিক বায়ারকে টাকা ফেরত দেবে — দেখুন SUBMIT_DEADLINE_AFTER_FUND_MS)
// এই মুহূর্তে সেলারের ওয়ালেটে কোনো টাকা যায় না — সেটা হয় শুধুমাত্র
// DealManager.jsx-এর handleReleasePayment-এ, বায়ার রিভিউ করে Release করলে।
//
// ডিল কখনোই এখানে 'completed' মার্ক করা হয় না। সব মাইলস্টোন funded হলেও
// কাজ তখনো শেষ হয়নি এবং সেলার টাকা পায়নি — deal শুধু তখনই 'completed' হবে
// যখন সব মাইলস্টোন 'released' হয় (DealManager.jsx দেখুন)।

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
import { doc, getDoc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import './PaymentGateway.css';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { sendDealPaymentNotification } from './notificationHelper';
import { sendDealChatMessage } from '@/utils/dealManager.utils';
import { logError } from '@/utils/logger';

// ============================================================
// Constants
// ============================================================
const TRANSACTION_STATUS = {
  COMPLETED: 'completed',
  PENDING: 'pending',
  FAILED: 'failed',
};

const TRANSACTION_TYPE = {
  CREDIT: 'credit',
  DEBIT: 'debit',
};

// Mirrors DealManager's SUBMIT_DEADLINE_AFTER_FUND_MS — kept in sync
// manually since the two files don't share a constants module. Only used
// here for the human-readable "you have 7 days" chat message; the actual
// auto-refund enforcement lives in dealManager.hooks.js.
const SUBMIT_DEADLINE_DAYS = 7;

const generateTransferId = () => {
  const date = new Date();
  const dateStr = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PAY-${dateStr}-${random}`;
};

// Milestone id can be a Firestore-generated string ("m_abc123") or a
// number depending on how the deal was created — never assume it's
// numeric. URL params (useParams) are ALWAYS strings, so always compare as
// strings.
const findMilestone = (milestones, milestoneId) => (milestones || []).find((m) => String(m.id) === String(milestoneId));

const PaymentGateway = () => {
  const { dealId, milestoneId } = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;
  const feedback = useFeedback();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [dealData, setDealData] = useState(null);
  const [milestone, setMilestone] = useState(null);
  const [isBuyer, setIsBuyer] = useState(false);
  const [error, setError] = useState('');
  const [paymentStep, setPaymentStep] = useState(1);
  const [transactionId, setTransactionId] = useState('');
  const [senderBalance, setSenderBalance] = useState(0);
  const [senderLocked, setSenderLocked] = useState(0);

  // ============================================================
  // ডেটা লোড + রোল চেক
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const loadData = async () => {
      try {
        const dealRef = doc(db, 'deals', dealId);
        const dealSnap = await getDoc(dealRef);

        if (dealSnap.exists()) {
          const deal = dealSnap.data();
          setDealData(deal);

          const currentUserIsBuyer = deal.buyerId === user.uid;
          setIsBuyer(currentUserIsBuyer);

          if (!currentUserIsBuyer) {
            setError('❌ Only the Buyer can make payment for this milestone.');
            setPaymentStep(0);
          }

          // Deal must actually be payable (active/overdue). A cancelled,
          // completed, or still-pending (unconfirmed) deal should never
          // reach the funding screen.
          if (!['active', 'overdue'].includes(deal.status)) {
            setError(`❌ This deal is currently '${deal.status}' and cannot be funded.`);
            setPaymentStep(0);
          }

          const walletRef = doc(db, 'wallets', user.uid);
          const walletSnap = await getDoc(walletRef);
          if (walletSnap.exists()) {
            setSenderBalance(walletSnap.data().balance || 0);
            setSenderLocked(walletSnap.data().lockedBalance || 0);
          }

          const foundMilestone = findMilestone(deal.milestones, milestoneId);
          if (foundMilestone) {
            setMilestone(foundMilestone);

            if (foundMilestone.status !== 'pending') {
              setError(`❌ This milestone is already '${foundMilestone.status}' and cannot be funded again.`);
              setPaymentStep(0);
            }
          } else {
            feedback.alert.error({ message: 'Milestone not found!' });
            navigate(`/deal-manager?dealId=${dealId}`);
          }
        } else {
          feedback.alert.error({ message: 'Deal not found!' });
          navigate('/deal-manager');
        }
      } catch (error) {
        logError('Error loading payment details', error);
        setError('Failed to load payment details');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [dealId, milestoneId, user, navigate, feedback]);

  // ============================================================
  // Direct Send Money (Fund Milestone) — escrow-safe
  // ============================================================
  const handleSendMoneyPayment = async () => {
    if (!isBuyer) {
      setError('❌ You are not authorized to make this payment.');
      return;
    }

    if (!milestone) {
      setError('❌ Milestone not found!');
      return;
    }

    const amount = milestone.amount;

    if (senderBalance < amount) {
      setError(`❌ Insufficient balance! Available: ৳${senderBalance.toFixed(2)}`);
      return;
    }

    const confirmed = await feedback.confirm({
      title: 'Confirm Payment',
      message: `Are you sure you want to pay ৳${amount} for "${milestone.title}"?\n\nএই টাকা এখনই আপনার ওয়ালেট থেকে কেটে escrow-তে জমা হবে — সেলারকে সরাসরি যাবে না, কাজ রিভিউ করে আপনি Release করলেই সেলার পাবে।`,
      variant: 'confirm',
      confirmText: 'Yes, Pay',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    setProcessing(true);
    setError('');
    setPaymentStep(2);

    const transferId = generateTransferId();
    let newTransactionId = '';

    try {
      const sellerId = dealData.sellerId;
      const buyerId = user.uid;
      const buyerWalletRef = doc(db, 'wallets', buyerId);
      const sellerWalletRef = doc(db, 'wallets', sellerId);
      const dealRef = doc(db, 'deals', dealId);

      await runTransaction(db, async (transaction) => {
        // 0. Re-read the deal INSIDE the transaction — this is the guard
        // against double-funding / race conditions (e.g. two tabs open, or
        // the milestone was funded a second ago in another session). Never
        // trust the milestone snapshot loaded on mount for the actual
        // money-moving decision.
        const freshDealSnap = await transaction.get(dealRef);
        if (!freshDealSnap.exists()) {
          throw new Error('Deal not found!');
        }
        const freshDeal = freshDealSnap.data();

        if (!['active', 'overdue'].includes(freshDeal.status)) {
          throw new Error('এই ডিলটি বর্তমানে ফান্ড করার জন্য উপলব্ধ নয়।');
        }

        const freshMilestone = findMilestone(freshDeal.milestones, milestoneId);
        if (!freshMilestone) {
          throw new Error('Milestone not found!');
        }
        if (freshMilestone.status !== 'pending') {
          throw new Error('এই মাইলস্টোনটি ইতিমধ্যে ফান্ড করা হয়েছে অথবা এখন ফান্ড করার উপযুক্ত নয়।');
        }

        const buyerDoc = await transaction.get(buyerWalletRef);
        if (!buyerDoc.exists()) {
          throw new Error('Buyer wallet not found!');
        }

        const buyerBalance = buyerDoc.data().balance || 0;
        const buyerLocked = buyerDoc.data().lockedBalance || 0;
        if (buyerBalance < amount) {
          throw new Error('Insufficient balance!');
        }

        const sellerDoc = await transaction.get(sellerWalletRef);
        let sellerBalance = 0;
        if (sellerDoc.exists()) {
          sellerBalance = sellerDoc.data().balance || 0;
        }

        // Update Buyer wallet (DEBIT the real balance, and release this
        // amount from lockedBalance — it was "reserved" since the deal was
        // activated, and now it has actually left the wallet for escrow).
        transaction.update(buyerWalletRef, {
          balance: buyerBalance - amount,
          lockedBalance: Math.max(0, buyerLocked - amount),
          totalWithdrawn: (buyerDoc.data().totalWithdrawn || 0) + amount,
          updatedAt: serverTimestamp(),
        });

        // Seller wallet: NOT credited here. Money sits in escrow
        // (represented purely by milestone.status === 'funded') until the
        // buyer explicitly releases it in DealManager.jsx. We still ensure
        // the seller's wallet document exists so later steps don't fail.
        if (!sellerDoc.exists()) {
          transaction.set(sellerWalletRef, {
            balance: 0,
            totalEarned: 0,
            totalWithdrawn: 0,
            pendingWithdraw: 0,
            lockedBalance: 0,
            userId: sellerId,
            walletId: `WL-${Date.now().toString(36).toUpperCase()}`,
            currency: 'BDT',
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // Buyer transaction record (escrow debit — not a transfer to the
        // seller yet, so it's labeled clearly as "Escrow Funded").
        const buyerTxRef = doc(collection(db, 'transactions'));
        newTransactionId = buyerTxRef.id;
        transaction.set(buyerTxRef, {
          userId: buyerId,
          userName: user.displayName || user.email?.split('@')[0] || 'User',
          amount,
          type: TRANSACTION_TYPE.DEBIT,
          status: TRANSACTION_STATUS.COMPLETED,
          title: `Escrow Funded: ${milestone.title}`,
          description: `Funded milestone for deal: ${dealData.postTitle} (held in escrow, not yet paid to seller)`,
          dealId,
          milestoneId,
          receiverId: sellerId,
          receiverName: dealData.sellerName || 'Seller',
          transferId,
          isEscrow: true,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        });

        // Update Milestone status — using the FRESH milestones array (read
        // inside the transaction) and string-safe id comparison.
        const updatedMilestones = freshDeal.milestones.map((m) => {
          if (String(m.id) === String(milestoneId)) {
            return { ...m, status: 'funded', fundedAt: new Date().toISOString(), fundedBy: buyerId };
          }
          return m;
        });

        // The deal must NEVER be marked 'completed' here. "All milestones
        // funded" only means all the money is sitting in escrow — the
        // seller hasn't been paid and the work may not even be done yet.
        // 'completed' is set exclusively in DealManager.jsx's
        // handleReleasePayment, once every milestone reaches 'released'.
        transaction.update(dealRef, { milestones: updatedMilestones, updatedAt: serverTimestamp() });
      });

      setPaymentStep(3);
      setTransactionId(newTransactionId);
      setSenderBalance((prev) => prev - amount);
      setSenderLocked((prev) => Math.max(0, prev - amount));

      try {
        await sendDealPaymentNotification(user.uid, amount, dealData.postTitle || 'Deal Payment', dealId, 'funded');

        if (dealData.sellerId) {
          await sendDealPaymentNotification(dealData.sellerId, amount, dealData.postTitle || 'Deal Payment', dealId, 'funded');
        }
      } catch (notifError) {
        logError('Deal payment notification error', notifError);
      }

      // Post a chat message spelling out the submission deadline —
      // sendDealPaymentNotification's template may or may not mention
      // timing, so this guarantees the seller sees the "you have 7 days"
      // warning somewhere concrete.
      await sendDealChatMessage(
        dealData.chatId,
        `💰 **Milestone Funded**\n\n"${milestone.title}"-এর জন্য ৳${amount.toLocaleString()} escrow-তে জমা হয়েছে।\n\n⏳ সেলারকে অনুরোধ: এই মাইলস্টোনের কাজ **${SUBMIT_DEADLINE_DAYS} দিনের মধ্যে** জমা দিন (প্রুফ লিংক/স্ক্রিনশট + নোট সহ)। এই সময়ের মধ্যে জমা না দিলে টাকা স্বয়ংক্রিয়ভাবে Buyer-এর ওয়ালেটে ফেরত চলে যাবে।`
      );

      feedback.alert.success({ message: `✅ ${milestone.title}-এর জন্য ৳${amount} escrow-তে ফান্ড করা হয়েছে। সেলার এখন কাজ শুরু/জমা দিতে পারবে।` });

      setTimeout(() => navigate(`/deal-manager?dealId=${dealId}`), 2000);
    } catch (error) {
      logError('Payment transaction error', error);
      setError(error.message || 'Payment failed. Please try again.');
      setPaymentStep(1);
      feedback.alert.error({ message: error.message || 'Payment failed. Please try again.' });
    } finally {
      setProcessing(false);
    }
  };

  // ============================================================
  // Format Money
  // ============================================================
  const formatMoney = (amount) => new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount || 0);

  // ============================================================
  // Loading State
  // ============================================================
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary, #090d16)', color: 'var(--accent-primary, #14b8a6)' }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{ fontSize: '48px', animation: 'spin 2s linear infinite', display: 'block', marginBottom: '16px' }} />
          <h2>Loading Payment Details...</h2>
          <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px', fontSize: '14px' }}>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your payment...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Error / blocked state (unauthorized, deal not payable, milestone
  // already funded, etc. — anything that sets paymentStep(0))
  // ============================================================
  if (paymentStep === 0) {
    return (
      <div className="payment-container">
        <div className="payment-card">
          <div className="payment-error-state">
            <i className="fa-solid fa-lock" style={{ fontSize: '48px', color: '#ef4444' }}></i>
            <h3>Payment Not Available</h3>
            <p>{error}</p>
            <button className="back-btn" onClick={() => navigate(`/deal-manager?dealId=${dealId}`)} style={{ marginTop: '20px' }}>
              <i className="fa-solid fa-arrow-left"></i> Back to Deal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="payment-container">
      <div className="payment-card">
        <div className="payment-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <i className="fa-solid fa-arrow-left"></i> Back
          </button>
          <h2>
            <i className="fa-solid fa-credit-card"></i> Fund Milestone
          </h2>
          {isBuyer ? <span className="role-badge buyer">👑 Buyer</span> : <span className="role-badge seller">🛠️ Seller</span>}
        </div>

        {error && (
          <div className="payment-error">
            <i className="fa-solid fa-exclamation-circle"></i>
            {error}
            <button onClick={() => setError('')} className="error-close">
              <i className="fa-solid fa-times"></i>
            </button>
          </div>
        )}

        <div className="payment-steps">
          <div className={`step ${paymentStep >= 1 ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Details</div>
          </div>
          <div className={`step-line ${paymentStep >= 2 ? 'active' : ''}`}></div>
          <div className={`step ${paymentStep >= 2 ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Payment</div>
          </div>
          <div className={`step-line ${paymentStep >= 3 ? 'active' : ''}`}></div>
          <div className={`step ${paymentStep >= 3 ? 'active' : ''}`}>
            <div className="step-number">3</div>
            <div className="step-label">Complete</div>
          </div>
        </div>

        <div className="payment-details">
          <h3>Payment Details</h3>
          <div className="detail-row">
            <span>Project:</span>
            <strong>{dealData?.postTitle || 'N/A'}</strong>
          </div>
          <div className="detail-row">
            <span>Milestone:</span>
            <strong>{milestone?.title || 'N/A'}</strong>
          </div>
          <div className="detail-row highlight">
            <span>Amount:</span>
            <strong>{formatMoney(milestone?.amount)}</strong>
          </div>
          <div className="detail-row">
            <span>Payer:</span>
            <strong>{isBuyer ? 'You (Buyer)' : 'Buyer'}</strong>
          </div>
          <div className="detail-row">
            <span>Receiver (after release):</span>
            <strong>{dealData?.sellerName || 'Seller'}</strong>
          </div>
          <div className="detail-row">
            <span>Wallet Balance:</span>
            <strong style={{ color: senderBalance >= (milestone?.amount || 0) ? '#10b981' : '#ef4444' }}>
              {formatMoney(senderBalance)}
              {senderBalance < (milestone?.amount || 0) && <span style={{ color: '#ef4444', fontSize: '12px', marginLeft: '8px' }}>❌ Insufficient</span>}
            </strong>
          </div>
          {senderLocked > 0 && (
            <div className="detail-row">
              <span>এই টাকার মধ্যে অন্য ডিলের জন্য লক করা:</span>
              <strong style={{ color: '#f59e0b' }}>{formatMoney(senderLocked)}</strong>
            </div>
          )}
          <div className="detail-row" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>
              <i className="fa-solid fa-shield-halved"></i> এই টাকা এখনই সেলারকে যাবে না — escrow-তে জমা থাকবে, আপনি কাজ রিভিউ করে Release না করা পর্যন্ত।
            </span>
          </div>
          <div className="detail-row" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>
              <i className="fa-solid fa-hourglass-half"></i> ফান্ড করার পর সেলারের কাছে কাজ জমা দেওয়ার জন্য {SUBMIT_DEADLINE_DAYS} দিন সময় থাকবে — নাহলে এই টাকা স্বয়ংক্রিয়ভাবে আপনার কাছে ফেরত আসবে।
            </span>
          </div>
        </div>

        {paymentStep === 1 && isBuyer && (
          <div className="payment-options">
            <button className="pay-option-btn send-money" onClick={handleSendMoneyPayment} disabled={processing || senderBalance < (milestone?.amount || 0)}>
              <i className="fa-solid fa-paper-plane"></i>
              <span>Fund from Wallet (Escrow)</span>
              {senderBalance < (milestone?.amount || 0) && <span style={{ fontSize: '11px', color: '#ef4444' }}>Insufficient Balance</span>}
            </button>

            <button className="pay-option-btn deposit" onClick={() => navigate('/deposit')} disabled={processing}>
              <i className="fa-solid fa-circle-dollar"></i>
              <span>Deposit First</span>
            </button>

            <div className="secure-note">
              <i className="fa-solid fa-shield-heart"></i>
              <p>Your payment is secured and held in escrow until you approve the work</p>
            </div>
          </div>
        )}

        {paymentStep === 1 && !isBuyer && (
          <div className="payment-not-authorized">
            <i className="fa-solid fa-info-circle"></i>
            <p>
              You are the <strong>Seller</strong>. Only the <strong>Buyer</strong> can fund this milestone.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Please wait for the Buyer to complete the payment before you start work.</p>
          </div>
        )}

        {paymentStep === 2 && (
          <div className="processing-section">
            <div className="spinner"></div>
            <h3>Processing Payment</h3>
            <p>Please wait while we securely fund the escrow...</p>
            <small>Do not close this window</small>
          </div>
        )}

        {paymentStep === 3 && (
          <div className="confirmation-section">
            <i className="fa-solid fa-circle-check success-icon"></i>
            <h3>Milestone Funded!</h3>
            <p>Your payment is now held in escrow. The seller can begin/submit work.</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-hourglass-half"></i> Seller has {SUBMIT_DEADLINE_DAYS} days to submit work, or the funds will be automatically refunded to you.
            </p>

            <div className="transaction-details">
              <div className="tx-row">
                <span>Transaction ID:</span>
                <strong className="tx-id">{transactionId}</strong>
              </div>
              <div className="tx-row">
                <span>Amount:</span>
                <strong>{formatMoney(milestone?.amount)}</strong>
              </div>
              <div className="tx-row">
                <span>Status:</span>
                <span className="status-success">
                  <i className="fa-solid fa-check-circle"></i> Funded (Escrow)
                </span>
              </div>
            </div>

            <div className="action-buttons">
              <button className="view-deal-btn" onClick={() => navigate(`/deal-manager?dealId=${dealId}`)}>
                <i className="fa-solid fa-briefcase"></i> View Deal
              </button>
              <button className="go-home-btn" onClick={() => navigate('/')}>
                <i className="fa-solid fa-home"></i> Go Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentGateway;