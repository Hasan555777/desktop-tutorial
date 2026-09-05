// src/pages/WalletActions.jsx
//
// `walletBalance` is the person's TOTAL balance. `availableBalance` (passed
// from Wallet.jsx as `balance - lockedBalance`) is what they can actually
// withdraw or send right now — some of the total may be reserved for
// active deals. The balance card below shows both when they differ.
// The /withdraw and /send-money pages themselves enforce the requested
// amount against `availableBalance`, not `walletBalance`.

import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSound } from '../../shared/ui/Sound';
import { SOUND_EVENTS } from '../../shared/ui/Sound/SoundEvents';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import styles from './WalletActions.module.css';


const WalletActions = ({
  walletBalance,
  availableBalance,
  lockedBalance,
  walletId,
  onRefresh,
  onDeposit,
  onWithdraw,
  onViewTransactions,
}) => {
  const navigate = useNavigate();
  const { playEvent } = useSound();
  const feedback = useFeedback();

  const safeAvailable = availableBalance !== undefined ? availableBalance : walletBalance;
  const safeLocked = lockedBalance || 0;

  // ============================================================
  // Action Handlers
  // ============================================================
  const handleSendMoney = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate('/send-money');
  }, [navigate, playEvent]);

  const handleReferral = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate('/referral');
  }, [navigate, playEvent]);

  const handleBankAccount = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate('/bank-account');
  }, [navigate, playEvent]);

  const handlePaymentHistory = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate('/payment-history');
  }, [navigate, playEvent]);

  const handleProfileCard = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate('/profile-card');
  }, [navigate, playEvent]);

  const handleDeposit = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    if (onDeposit) {
      onDeposit();
    } else {
      navigate('/deposit');
    }
  }, [navigate, onDeposit, playEvent]);

  // Withdraw warns first if some of the balance is locked, so the person
  // isn't surprised on the withdraw page when their "available" number is
  // lower than the total they saw here.
  const handleWithdraw = useCallback(async () => {
    playEvent?.(SOUND_EVENTS.CLICK);

    if (safeLocked > 0) {
      const proceed = await feedback.confirm({
        title: '🔒 কিছু টাকা লক করা আছে',
        message: `আপনার মোট ব্যালেন্স থেকে ${safeLocked.toLocaleString()} BDT একটিভ ডিলের জন্য reserved। উইথড্র করা যাবে সর্বোচ্চ ${safeAvailable.toLocaleString()} BDT পর্যন্ত।\n\nচালিয়ে যাবেন?`,
        confirmText: 'হ্যাঁ, চালিয়ে যান',
        cancelText: 'বাতিল',
        variant: 'info',
      });
      if (!proceed) return;
    }

    if (onWithdraw) {
      onWithdraw();
    } else {
      navigate('/withdraw');
    }
  }, [navigate, onWithdraw, playEvent, safeLocked, safeAvailable, feedback]);

  const handleTransactions = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    if (onViewTransactions) {
      onViewTransactions();
    } else {
      navigate('/payment-history');
    }
  }, [navigate, onViewTransactions, playEvent]);

  const handleRefresh = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    if (onRefresh) {
      onRefresh();
    }
  }, [onRefresh, playEvent]);

  // ============================================================
  // Copy Wallet ID
  // ============================================================
  const handleCopyWalletId = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    if (walletId) {
      navigator.clipboard
        .writeText(walletId)
        .then(() => {
          feedback.alert.success({ message: '✅ Wallet ID copied!' });
        })
        .catch(() => {
          feedback.alert.error({ message: 'Failed to copy Wallet ID.' });
        });
    }
  }, [walletId, playEvent, feedback]);

  // ============================================================
  // Format Money
  // ============================================================
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount || 0);
  };

  // ============================================================
  // Main Actions (Top Grid)
  //
  // Removed `handleBankTransferDeposit` (and its old presence in this
  // memo's dependency list) — it was defined but never referenced by any
  // action card or button, pure dead code.
  // ============================================================
  const mainActions = useMemo(
    () => [
      {
        id: 'deposit',
        name: 'Deposit Money',
        icon: 'fa-solid fa-circle-dollar-to-slot',
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.1)',
        description: 'Add money to your wallet',
        action: handleDeposit,
      },
      {
        id: 'withdraw',
        name: 'Withdraw',
        icon: 'fa-solid fa-money-bill-wave',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.1)',
        description: safeLocked > 0 ? `Available: ${formatMoney(safeAvailable)}` : 'Withdraw funds to your account',
        action: handleWithdraw,
      },
      {
        id: 'send-money',
        name: 'Send Money',
        icon: 'fa-solid fa-paper-plane',
        color: '#ec4899',
        bg: 'rgba(236, 72, 153, 0.1)',
        description: 'Send money to others',
        action: handleSendMoney,
      },
      {
        id: 'payment-history',
        name: 'Payment History',
        icon: 'fa-solid fa-clock-rotate-left',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.1)',
        description: 'View all transactions',
        action: handleTransactions,
      },
    ],
    [handleDeposit, handleWithdraw, handleSendMoney, handleTransactions, safeLocked, safeAvailable]
  );

  // ============================================================
  // More Actions (Bottom Grid)
  // ============================================================
  const moreActions = useMemo(
    () => [
      {
        id: 'bank-account',
        name: 'Bank Account',
        icon: 'fa-solid fa-building-columns',
        color: '#14b8a6',
        bg: 'rgba(20, 184, 166, 0.1)',
        description: 'Manage bank accounts',
        action: handleBankAccount,
      },
      {
        id: 'profile-card',
        name: 'My Profile Card',
        icon: 'fa-solid fa-id-card',
        color: '#a855f7',
        bg: 'rgba(168, 85, 247, 0.1)',
        description: 'View your trust card',
        action: handleProfileCard,
      },
      {
        id: 'referral',
        name: 'Referral',
        icon: 'fa-solid fa-user-plus',
        color: '#06b6d4',
        bg: 'rgba(6, 182, 212, 0.1)',
        description: 'Invite friends & earn',
        action: handleReferral,
      },
    ],
    [handleBankAccount, handleProfileCard, handleReferral]
  );

  const handleAction = (action) => {
    if (action.action) {
      action.action();
    }
  };
return (
    <div className={styles.walletActionsModule}>
      {/* ========== Balance Card ========== */}
      <div className={styles.balanceCard}>
        <div className={styles.balanceHeader}>
          <span className={styles.balanceLabel}>Available Balance</span>
          <button className={styles.refreshBtnSmall} onClick={handleRefresh} title="Refresh" aria-label="Refresh balance">
            <i className="fa-solid fa-rotate-right"></i>
          </button>
        </div>
        <div className={styles.balanceValue}>
          <i className="fa-solid fa-wallet"></i>
          <span>{formatMoney(safeAvailable)}</span>
        </div>

        {safeLocked > 0 && (
          <div className={styles.walletIdRow} style={{ marginTop: '4px' }}>
            <span className={styles.walletIdLabel}>
              <i className="fa-solid fa-lock" style={{ color: '#f59e0b' }}></i> Total: {formatMoney(walletBalance)} &nbsp;•&nbsp; Locked: {formatMoney(safeLocked)}
            </span>
          </div>
        )}

        {walletId && (
          <div className={styles.walletIdRow}>
            <span className={styles.walletIdLabel}>
              <i className="fa-regular fa-credit-card"></i> ID: {walletId}
            </span>
            <button className={styles.copyIdBtn} onClick={handleCopyWalletId} aria-label="Copy Wallet ID">
              <i className="fa-regular fa-copy"></i>
            </button>
          </div>
        )}
      </div>

      {/* ========== Quick Actions ========== */}
      <div className={styles.actionsGrid}>
        {mainActions.map((action) => (
          <button 
            key={action.id} 
            className={styles.actionCard} 
            onClick={() => handleAction(action)} 
            style={{ '--action-color': action.color, '--action-bg': action.bg }} 
            aria-label={action.name}
          >
            <div className={styles.actionIcon} style={{ background: action.bg, color: action.color }}>
              <i className={action.icon}></i>
            </div>
            <div className={styles.actionInfo}>
              <h4>{action.name}</h4>
              <p>{action.description}</p>
            </div>
            <div className={styles.actionArrow}>
              <i className="fa-solid fa-chevron-right"></i>
            </div>
          </button>
        ))}
      </div>

      {/* ========== More Actions ========== */}
      <div className={styles.moreActionsSection}>
        <div className={styles.moreActionsHeader}>
          <span>Other Services</span>
          <i className="fa-solid fa-ellipsis"></i>
        </div>
        <div className={styles.moreActionsGrid}>
          {moreActions.map((action) => (
            <button key={action.id} className={styles.moreActionItem} onClick={() => handleAction(action)} aria-label={action.name}>
              <div className={styles.moreActionIcon} style={{ background: action.bg, color: action.color }}>
                <i className={action.icon}></i>
              </div>
              <div className={styles.moreActionInfo}>
                <h4>{action.name}</h4>
                <p>{action.description}</p>
              </div>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WalletActions;