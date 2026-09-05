// src/pages/PaymentGateway.jsx

import React, { useState, useEffect } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '../../shared/firebase/index';
import { doc, getDoc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import styles from './PaymentGateway.module.css';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { sendDealPaymentNotification } from '../notifications/notificationHelper';
import { sendDealChatMessage } from '../deal-manager/utils/dealManager.utils';
import { logError } from '../../shared/utils/logger';

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

const SUBMIT_DEADLINE_DAYS = 7;

const generateTransferId = () => {
  const date = new Date();
  const dateStr = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PAY-${dateStr}-${random}`;
};

const findMilestone = (milestones, milestoneId) => (milestones || []).find((m) => String(m.id) === String(milestoneId));

const PaymentGateway = () => {
  const { dealId, milestoneId } = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;
  const feedback = useFeedback();

  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading);
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
      navigate('/login', { replace: true });
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

        transaction.update(buyerWalletRef, {
          balance: buyerBalance - amount,
          lockedBalance: Math.max(0, buyerLocked - amount),
          totalWithdrawn: (buyerDoc.data().totalWithdrawn || 0) + amount,
          updatedAt: serverTimestamp(),
        });

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

        const updatedMilestones = freshDeal.milestones.map((m) => {
          if (String(m.id) === String(milestoneId)) {
            return { ...m, status: 'funded', fundedAt: new Date().toISOString(), fundedBy: buyerId };
          }
          return m;
        });

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
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-cube ${styles.loadingIcon}`} />
          <h2>Loading Payment Details...</h2>
          <p>
            <i className="fa-solid fa-spinner fa-spin"></i> Preparing your payment...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Error / blocked state
  // ============================================================
  if (paymentStep === 0) {
    return (
      <div className={styles.paymentContainer}>
        <div className={styles.paymentCard}>
          <div className={styles.paymentErrorState}>
            <i className="fa-solid fa-lock" style={{ fontSize: '48px', color: '#ef4444' }}></i>
            <h3>Payment Not Available</h3>
            <p>{error}</p>
            <button className={styles.backBtn} onClick={() => navigate(`/deal-manager?dealId=${dealId}`)} style={{ marginTop: '20px' }}>
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
    <div className={styles.paymentContainer}>
      <div className={styles.paymentCard}>
        <div className={styles.paymentHeader}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <i className="fa-solid fa-arrow-left"></i> Back
          </button>
          <h2>
            <i className="fa-solid fa-credit-card"></i> Fund Milestone
          </h2>
          {isBuyer ? <span className={`${styles.roleBadge} ${styles.buyer}`}>👑 Buyer</span> : <span className={`${styles.roleBadge} ${styles.seller}`}>🛠️ Seller</span>}
        </div>

        {error && (
          <div className={styles.paymentError}>
            <i className="fa-solid fa-exclamation-circle"></i>
            {error}
            <button onClick={() => setError('')} className={styles.errorClose}>
              <i className="fa-solid fa-times"></i>
            </button>
          </div>
        )}

        <div className={styles.paymentSteps}>
          <div className={`${styles.step} ${paymentStep >= 1 ? styles.active : ''}`}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepLabel}>Details</div>
          </div>
          <div className={`${styles.stepLine} ${paymentStep >= 2 ? styles.active : ''}`}></div>
          <div className={`${styles.step} ${paymentStep >= 2 ? styles.active : ''}`}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepLabel}>Payment</div>
          </div>
          <div className={`${styles.stepLine} ${paymentStep >= 3 ? styles.active : ''}`}></div>
          <div className={`${styles.step} ${paymentStep >= 3 ? styles.active : ''}`}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepLabel}>Complete</div>
          </div>
        </div>

        <div className={styles.paymentDetails}>
          <h3>Payment Details</h3>
          <div className={styles.detailRow}>
            <span>Project:</span>
            <strong>{dealData?.postTitle || 'N/A'}</strong>
          </div>
          <div className={styles.detailRow}>
            <span>Milestone:</span>
            <strong>{milestone?.title || 'N/A'}</strong>
          </div>
          <div className={`${styles.detailRow} ${styles.highlight}`}>
            <span>Amount:</span>
            <strong>{formatMoney(milestone?.amount)}</strong>
          </div>
          <div className={styles.detailRow}>
            <span>Payer:</span>
            <strong>{isBuyer ? 'You (Buyer)' : 'Buyer'}</strong>
          </div>
          <div className={styles.detailRow}>
            <span>Receiver (after release):</span>
            <strong>{dealData?.sellerName || 'Seller'}</strong>
          </div>
          <div className={styles.detailRow}>
            <span>Wallet Balance:</span>
            <strong style={{ color: senderBalance >= (milestone?.amount || 0) ? '#10b981' : '#ef4444' }}>
              {formatMoney(senderBalance)}
              {senderBalance < (milestone?.amount || 0) && <span className={styles.insufficient}>❌ Insufficient</span>}
            </strong>
          </div>
          {senderLocked > 0 && (
            <div className={styles.detailRow}>
              <span>এই টাকার মধ্যে অন্য ডিলের জন্য লক করা:</span>
              <strong style={{ color: '#f59e0b' }}>{formatMoney(senderLocked)}</strong>
            </div>
          )}
          <div className={`${styles.detailRow} ${styles.escrowInfo}`}>
            <span>
              <i className="fa-solid fa-shield-halved"></i> এই টাকা এখনই সেলারকে যাবে না — escrow-তে জমা থাকবে, আপনি কাজ রিভিউ করে Release না করা পর্যন্ত।
            </span>
          </div>
          <div className={`${styles.detailRow} ${styles.escrowInfo}`}>
            <span>
              <i className="fa-solid fa-hourglass-half"></i> ফান্ড করার পর সেলারের কাছে কাজ জমা দেওয়ার জন্য {SUBMIT_DEADLINE_DAYS} দিন সময় থাকবে — নাহলে এই টাকা স্বয়ংক্রিয়ভাবে আপনার কাছে ফেরত আসবে।
            </span>
          </div>
        </div>

        {paymentStep === 1 && isBuyer && (
          <div className={styles.paymentOptions}>
            <button className={`${styles.payOptionBtn} ${styles.sendMoney}`} onClick={handleSendMoneyPayment} disabled={processing || senderBalance < (milestone?.amount || 0)}>
              <i className="fa-solid fa-paper-plane"></i>
              <span>Fund from Wallet (Escrow)</span>
              {senderBalance < (milestone?.amount || 0) && <span className={styles.insufficientLabel}>Insufficient Balance</span>}
            </button>

            <button className={`${styles.payOptionBtn} ${styles.deposit}`} onClick={() => navigate('/deposit')} disabled={processing}>
              <i className="fa-solid fa-circle-dollar"></i>
              <span>Deposit First</span>
            </button>

            <div className={styles.secureNote}>
              <i className="fa-solid fa-shield-heart"></i>
              <p>Your payment is secured and held in escrow until you approve the work</p>
            </div>
          </div>
        )}

        {paymentStep === 1 && !isBuyer && (
          <div className={styles.paymentNotAuthorized}>
            <i className="fa-solid fa-info-circle"></i>
            <p>
              You are the <strong>Seller</strong>. Only the <strong>Buyer</strong> can fund this milestone.
            </p>
            <p className={styles.notAuthorizedSub}>Please wait for the Buyer to complete the payment before you start work.</p>
          </div>
        )}

        {paymentStep === 2 && (
          <div className={styles.processingSection}>
            <div className={styles.spinner}></div>
            <h3>Processing Payment</h3>
            <p>Please wait while we securely fund the escrow...</p>
            <small>Do not close this window</small>
          </div>
        )}

        {paymentStep === 3 && (
          <div className={styles.confirmationSection}>
            <i className={`fa-solid fa-circle-check ${styles.successIcon}`}></i>
            <h3>Milestone Funded!</h3>
            <p>Your payment is now held in escrow. The seller can begin/submit work.</p>
            <p className={styles.confirmationSub}>
              <i className="fa-solid fa-hourglass-half"></i> Seller has {SUBMIT_DEADLINE_DAYS} days to submit work, or the funds will be automatically refunded to you.
            </p>

            <div className={styles.transactionDetails}>
              <div className={styles.txRow}>
                <span>Transaction ID:</span>
                <strong className={styles.txId}>{transactionId}</strong>
              </div>
              <div className={styles.txRow}>
                <span>Amount:</span>
                <strong>{formatMoney(milestone?.amount)}</strong>
              </div>
              <div className={styles.txRow}>
                <span>Status:</span>
                <span className={styles.statusSuccess}>
                  <i className="fa-solid fa-check-circle"></i> Funded (Escrow)
                </span>
              </div>
            </div>

            <div className={styles.actionButtons}>
              <button className={styles.viewDealBtn} onClick={() => navigate(`/deal-manager?dealId=${dealId}`)}>
                <i className="fa-solid fa-briefcase"></i> View Deal
              </button>
              <button className={styles.goHomeBtn} onClick={() => navigate('/')}>
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