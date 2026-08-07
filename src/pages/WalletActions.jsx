// src/pages/WalletActions.jsx
//
// ⚠️ IMPORTANT: `walletBalance` is the person's TOTAL balance. `availableBalance`
// (passed from Wallet.jsx as `balance - lockedBalance`) is what they can
// actually withdraw or send right now — some of the total may be reserved
// for active deals. The balance card below shows both when they differ.
// The /withdraw and /send-money pages themselves (not included here) MUST
// enforce the requested amount against `availableBalance`, not `walletBalance`.

import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import './WalletActions.css';

const WalletActions = ({ 
  walletBalance, 
  availableBalance,   // ✅ NEW — balance - lockedBalance
  lockedBalance,       // ✅ NEW
  walletId,
  onRefresh,
  onDeposit,
  onWithdraw,
  onViewTransactions 
}) => {
  const navigate = useNavigate();
  const { playEvent } = useSound();
  const feedback = useFeedback();

  // Fall back gracefully if the caller hasn't been updated to pass these yet.
  const safeAvailable = availableBalance !== undefined ? availableBalance : walletBalance;
  const safeLocked = lockedBalance || 0;

  // ============================================================
  // ✅ Action Handlers (useCallback)
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

  // ✅ Bank Transfer Deposit Handler
  const handleBankTransferDeposit = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate('/deposit', { state: { preferredMethod: 'Bank Transfer' } });
  }, [navigate, playEvent]);

  const handleDeposit = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    if (onDeposit) {
      onDeposit();
    } else {
      navigate('/deposit');
    }
  }, [navigate, onDeposit, playEvent]);

  // ✅ Withdraw now warns first if some of the balance is locked, so the
  // person isn't surprised on the withdraw page when their "available"
  // number is lower than the total they saw here.
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
  // ✅ Copy Wallet ID (with Feedback)
  // ============================================================
  const handleCopyWalletId = useCallback(() => {
    playEvent?.(SOUND_EVENTS.CLICK);
    if (walletId) {
      navigator.clipboard.writeText(walletId).then(() => {
        feedback.alert.success({ message: '✅ Wallet ID copied!' });
      }).catch(() => {
        feedback.alert.error({ message: 'Failed to copy Wallet ID.' });
      });
    }
  }, [walletId, playEvent, feedback]);

  // ============================================================
  // ✅ Format Money (consistent with Wallet page)
  // ============================================================
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('bn-BD', {
      style: 'currency',
      currency: 'BDT',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  // ============================================================
  // ✅ Main Actions (Top Grid)
  // ============================================================
  const mainActions = useMemo(() => [
    {
      id: 'deposit',
      name: 'Deposit Money',
      icon: 'fa-solid fa-circle-dollar-to-slot',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.1)',
      description: 'Add money to your wallet',
      action: handleDeposit
    },

    {
      id: 'withdraw',
      name: 'Withdraw',
      icon: 'fa-solid fa-money-bill-wave',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.1)',
      description: safeLocked > 0
        ? `Available: ${formatMoney(safeAvailable)}`
        : 'Withdraw funds to your account',
      action: handleWithdraw
    },
    {
      id: 'send-money',
      name: 'Send Money',
      icon: 'fa-solid fa-paper-plane',
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.1)',
      description: 'Send money to others',
      action: handleSendMoney
    },
    {
      id: 'payment-history',
      name: 'Payment History',
      icon: 'fa-solid fa-clock-rotate-left',
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.1)',
      description: 'View all transactions',
      action: handleTransactions
    },
  ], [handleDeposit, handleBankTransferDeposit, handleWithdraw, handleSendMoney, handleTransactions, safeLocked, safeAvailable]);

  // ============================================================
  // ✅ More Actions (Bottom Grid)
  // ============================================================
  const moreActions = useMemo(() => [
    {
      id: 'bank-account',
      name: 'Bank Account',
      icon: 'fa-solid fa-building-columns',
      color: '#14b8a6',
      bg: 'rgba(20, 184, 166, 0.1)',
      description: 'Manage bank accounts',
      action: handleBankAccount
    },
    {
      id: 'profile-card',
      name: 'My Profile Card',
      icon: 'fa-solid fa-id-card',
      color: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.1)',
      description: 'View your trust card',
      action: handleProfileCard
    },
    {
      id: 'referral',
      name: 'Referral',
      icon: 'fa-solid fa-user-plus',
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.1)',
      description: 'Invite friends & earn',
      action: handleReferral
    }
  ], [handleBankAccount, handleProfileCard, handleReferral]);

  const handleAction = (action) => {
    if (action.action) {
      action.action();
    }
  };

  return (
    <div className="wallet-actions-module">
      
      {/* ========== Balance Card ========== */}
      <div className="balance-card">
        <div className="balance-header">
          <span className="balance-label">Available Balance</span>
          <button 
            className="refresh-btn-small" 
            onClick={handleRefresh} 
            title="Refresh"
            aria-label="Refresh balance"
          >
            <i className="fa-solid fa-rotate-right"></i>
          </button>
        </div>
        <div className="balance-value">
          <i className="fa-solid fa-wallet"></i>
          <span>{formatMoney(safeAvailable)}</span>
        </div>

        {/* ✅ Show the split only when something is actually locked, to avoid
            cluttering the UI for people with no active deals. */}
        {safeLocked > 0 && (
          <div className="wallet-id-row" style={{ marginTop: '4px' }}>
            <span className="wallet-id-label">
              <i className="fa-solid fa-lock" style={{ color: '#f59e0b' }}></i>
              {' '}Total: {formatMoney(walletBalance)} &nbsp;•&nbsp; Locked: {formatMoney(safeLocked)}
            </span>
          </div>
        )}
        
        {/* ✅ Wallet ID with Copy */}
        {walletId && (
          <div className="wallet-id-row">
            <span className="wallet-id-label">
              <i className="fa-regular fa-credit-card"></i> ID: {walletId}
            </span>
            <button 
              className="copy-id-btn" 
              onClick={handleCopyWalletId}
              aria-label="Copy Wallet ID"
            >
              <i className="fa-regular fa-copy"></i>
            </button>
          </div>
        )}
      </div>

      {/* ========== Quick Actions ========== */}
      <div className="actions-grid">
        {mainActions.map((action) => (
          <button
            key={action.id}
            className="action-card"
            onClick={() => handleAction(action)}
            style={{ '--action-color': action.color, '--action-bg': action.bg }}
            aria-label={action.name}
          >
            <div className="action-icon" style={{ background: action.bg, color: action.color }}>
              <i className={action.icon}></i>
            </div>
            <div className="action-info">
              <h4>{action.name}</h4>
              <p>{action.description}</p>
            </div>
            <div className="action-arrow">
              <i className="fa-solid fa-chevron-right"></i>
            </div>
          </button>
        ))}
      </div>

      {/* ========== More Actions ========== */}
      <div className="more-actions-section">
        <div className="more-actions-header">
          <span>Other Services</span>
          <i className="fa-solid fa-ellipsis"></i>
        </div>
        <div className="more-actions-grid">
          {moreActions.map((action) => (
            <button
              key={action.id}
              className="more-action-item"
              onClick={() => handleAction(action)}
              aria-label={action.name}
            >
              <div className="more-action-icon" style={{ background: action.bg, color: action.color }}>
                <i className={action.icon}></i>
              </div>
              <div className="more-action-info">
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