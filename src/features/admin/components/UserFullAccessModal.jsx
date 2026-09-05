// src/pages/Admin/components/UserFullAccessModal.jsx
//
// ✅ NEW — gives admin complete visibility + control over one user:
//   - Wallet tab: balance, locked balance, totals + Adjust Balance (credit/debit)
//   - Deals tab: every deal (buyer or seller role), counterparty, amount,
//     status, milestone summary + Cancel Deal / Resolve Dispute actions
//   - Posts tab: every post by this user + delete
//
// Opened alongside the existing UserDetailModal (KYC review) — triggered by
// the new 💰 button in UsersTable.jsx, using the SAME `user` object that
// was already being passed to onViewUser, so no other file had to change.

import React, { useState, useEffect, useCallback } from 'react';
import { formatDate, getUserDisplayName, getUserShortId } from '../utils/adminUtils';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import styles from './UserFullAccessModal.module.css';

const formatMoney = (amount) =>
  new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 })
    .format(amount || 0);

const DEAL_STATUS_LABELS = {
  pending: '⏳ Pending',
  active: '⚡ Active',
  overdue: '🔴 Overdue',
  completed: '✅ Completed',
  cancelled: '❌ Cancelled',
};

const UserFullAccessModal = ({
  user,
  onClose,
  fetchUserWallet,
  fetchUserDeals,
  fetchUserPosts,
  adminAdjustWallet,
  adminCancelDeal,
  adminResolveDispute,
  onDeletePost,
}) => {
  const feedback = useFeedback();
  const [activeTab, setActiveTab] = useState('wallet');

  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const [deals, setDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(false);

  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  const reloadWallet = useCallback(async () => {
    if (!user?.id) return;
    setWalletLoading(true);
    const w = await fetchUserWallet(user.id);
    setWallet(w);
    setWalletLoading(false);
  }, [user?.id, fetchUserWallet]);

  const reloadDeals = useCallback(async () => {
    if (!user?.id) return;
    setDealsLoading(true);
    const d = await fetchUserDeals(user.id);
    setDeals(d);
    setDealsLoading(false);
  }, [user?.id, fetchUserDeals]);

  const reloadPosts = useCallback(async () => {
    if (!user?.id) return;
    setPostsLoading(true);
    const p = await fetchUserPosts(user.id);
    setPosts(p);
    setPostsLoading(false);
  }, [user?.id, fetchUserPosts]);

  useEffect(() => {
    if (!user?.id) return;
    setWallet(null);
    setDeals([]);
    setPosts([]);
    setActiveTab('wallet');
    reloadWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'deals' && deals.length === 0 && !dealsLoading) {
      reloadDeals();
    }
    if (activeTab === 'posts' && posts.length === 0 && !postsLoading) {
      reloadPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  if (!user) return null;

  const handleAdjust = async (type) => {
    setAdjustSubmitting(true);
    const ok = await adminAdjustWallet(user.id, adjustAmount, type, adjustReason);
    setAdjustSubmitting(false);
    if (ok) {
      setAdjustAmount('');
      setAdjustReason('');
      await reloadWallet();
    }
  };

  const handleCancelDeal = async (deal) => {
    const reason = await feedback.prompt({
      title: '⚠️ ডিল বাতিলের কারণ',
      message: `"${deal.postTitle || 'Untitled Deal'}" — কেন বাতিল করছেন?`,
      placeholder: 'কারণ লিখুন...',
      confirmText: 'পরবর্তী',
      cancelText: 'বাতিল',
      inputType: 'text',
    });
    if (!reason || !reason.trim()) return;

    const ok = await adminCancelDeal(deal, reason.trim());
    if (ok) await reloadDeals();
  };

  const handleResolveDispute = async (deal, resolution) => {
    const note = await feedback.prompt({
      title: resolution === 'release' ? '✅ সেলারকে রিলিজ' : '↩️ বায়ারকে রিফান্ড',
      message: 'সিদ্ধান্তের সংক্ষিপ্ত নোট (ঐচ্ছিক):',
      placeholder: 'নোট লিখুন...',
      confirmText: 'নিশ্চিত করুন',
      cancelText: 'বাতিল',
      inputType: 'text',
      required: false,
    });
    if (note === null) return;

    const ok = await adminResolveDispute(deal, resolution, note || '');
    if (ok) await reloadDeals();
  };

  const handleDeletePostClick = async (postId) => {
    await onDeletePost(postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const availableBalance = wallet ? Math.max(0, (wallet.balance || 0) - (wallet.lockedBalance || 0)) : 0;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalContent} ${styles.userDetailModal}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <span className={styles.modalIcon}>💰</span>
            <h3>Full Access — {getUserDisplayName(user)}</h3>
            <span className={`${styles.userStatusBadge} ${styles.pending}`}>{getUserShortId(user)}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── Tabs ── */}
        <div className={styles.tabsContainer}>
          {[
            { key: 'wallet', label: '💳 Wallet' },
            { key: 'deals', label: `🤝 Deals${deals.length ? ` (${deals.length})` : ''}` },
            { key: 'posts', label: `📄 Posts${posts.length ? ` (${posts.length})` : ''}` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`${styles.tabBtn} ${activeTab === tab.key ? styles.active : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className={styles.modalBody}>

          {/* ============================================================
              WALLET TAB
          ============================================================ */}
          {activeTab === 'wallet' && (
            <div>
              {walletLoading ? (
                <p className={styles.loadingText}>লোড হচ্ছে...</p>
              ) : !wallet ? (
                <p className={styles.emptyText}>এই ইউজারের কোনো ওয়ালেট পাওয়া যায়নি।</p>
              ) : (
                <>
                  <div className={styles.userInfoGrid}>
                    <div className={styles.userInfoItem}>
                      <span className={styles.label}>Total Balance</span>
                      <span className={styles.value}>{formatMoney(wallet.balance)}</span>
                    </div>
                    <div className={styles.userInfoItem}>
                      <span className={styles.label}>Locked (Active Deals)</span>
                      <span className={`${styles.value} ${styles.locked}`}>{formatMoney(wallet.lockedBalance)}</span>
                    </div>
                    <div className={styles.userInfoItem}>
                      <span className={styles.label}>Available</span>
                      <span className={`${styles.value} ${styles.available}`}>{formatMoney(availableBalance)}</span>
                    </div>
                    <div className={styles.userInfoItem}>
                      <span className={styles.label}>Total Earned</span>
                      <span className={styles.value}>{formatMoney(wallet.totalEarned)}</span>
                    </div>
                    <div className={styles.userInfoItem}>
                      <span className={styles.label}>Total Withdrawn</span>
                      <span className={styles.value}>{formatMoney(wallet.totalWithdrawn)}</span>
                    </div>
                    <div className={styles.userInfoItem}>
                      <span className={styles.label}>Wallet ID</span>
                      <span className={styles.value}>{wallet.walletId || wallet.id}</span>
                    </div>
                  </div>

                  <div className={styles.reviewSections}>
                    <h4 className={styles.reviewSectionsTitle}>⚙️ Adjust Balance (Admin)</h4>
                    <div className={styles.adjustBalanceRow}>
                      <div className={styles.adjustField}>
                        <label>Amount (BDT)</label>
                        <input
                          type="number"
                          min="1"
                          value={adjustAmount}
                          onChange={(e) => setAdjustAmount(e.target.value)}
                          placeholder="0"
                          className={styles.adjustInput}
                        />
                      </div>
                      <div className={`${styles.adjustField} ${styles.adjustFieldLarge}`}>
                        <label>Reason <span className={styles.required}>*</span></label>
                        <input
                          type="text"
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          placeholder="যেমন: Refund for dispute #123, compensation, correction..."
                          className={styles.adjustInput}
                        />
                      </div>
                      <button
                        className={`${styles.reviewBtn} ${styles.approve}`}
                        disabled={adjustSubmitting}
                        onClick={() => handleAdjust('credit')}
                      >
                        ➕ Credit
                      </button>
                      <button
                        className={`${styles.reviewBtn} ${styles.reject}`}
                        disabled={adjustSubmitting}
                        onClick={() => handleAdjust('debit')}
                      >
                        ➖ Debit
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ============================================================
              DEALS TAB
          ============================================================ */}
          {activeTab === 'deals' && (
            <div>
              {dealsLoading ? (
                <p className={styles.loadingText}>লোড হচ্ছে...</p>
              ) : deals.length === 0 ? (
                <p className={styles.emptyText}>এই ইউজারের কোনো ডিল নেই।</p>
              ) : (
                <div className={styles.dealsList}>
                  {deals.map((deal) => {
                    const isBuyer = deal.buyerId === user.id;
                    const counterpartyName = isBuyer
                      ? (deal.sellerName || deal.sellerDisplayName || 'Unknown Seller')
                      : (deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer');
                    const milestones = deal.milestones || [];
                    const fundedTotal = milestones.filter(m => m.status === 'funded' || m.status === 'review').reduce((s, m) => s + (m.amount || 0), 0);
                    const releasedTotal = milestones.filter(m => m.status === 'released').reduce((s, m) => s + (m.amount || 0), 0);

                    return (
                      <div
                        key={deal.id}
                        className={`${styles.dealCard} ${deal.disputeStatus === 'open' ? styles.hasDispute : ''}`}
                      >
                        <div className={styles.dealHeader}>
                          <div>
                            <strong>{deal.postTitle || 'Untitled Deal'}</strong>
                            <div className={styles.dealMeta}>
                              #{deal.dealIdNumber || deal.id?.slice(-8)} &nbsp;•&nbsp;
                              {user.id && (isBuyer ? 'Buyer' : 'Seller')} in this deal &nbsp;•&nbsp;
                              Counterparty: <strong>{counterpartyName}</strong>
                            </div>
                          </div>
                          <span className={`${styles.statusBadge} ${styles[deal.status]}`}>
                            {DEAL_STATUS_LABELS[deal.status] || deal.status}
                          </span>
                        </div>

                        <div className={styles.dealStats}>
                          <span>💰 বাজেট: <strong>{formatMoney(deal.budget)}</strong></span>
                          <span>🔒 Escrow (funded): <strong>{formatMoney(fundedTotal)}</strong></span>
                          <span>✅ Released: <strong>{formatMoney(releasedTotal)}</strong></span>
                        </div>

                        {deal.disputeStatus === 'open' && (
                          <div className={styles.disputeNotice}>
                            <strong>⚖️ Dispute Open</strong> — {deal.disputeReason || 'No reason given'}
                          </div>
                        )}

                        <div className={styles.dealActions}>
                          {deal.disputeStatus === 'open' && (
                            <>
                              <button 
                                className={`${styles.reviewBtn} ${styles.approve}`} 
                                onClick={() => handleResolveDispute(deal, 'release')}
                              >
                                ✅ সেলারকে রিলিজ করুন
                              </button>
                              <button 
                                className={`${styles.reviewBtn} ${styles.reject}`} 
                                onClick={() => handleResolveDispute(deal, 'refund')}
                              >
                                ↩️ বায়ারকে রিফান্ড
                              </button>
                            </>
                          )}
                          {deal.status !== 'completed' && deal.status !== 'cancelled' && (
                            <button 
                              className={`${styles.actionBtn} ${styles.delete}`} 
                              onClick={() => handleCancelDeal(deal)}
                            >
                              ❌ Cancel Deal (Admin)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              POSTS TAB
          ============================================================ */}
          {activeTab === 'posts' && (
            <div>
              {postsLoading ? (
                <p className={styles.loadingText}>লোড হচ্ছে...</p>
              ) : posts.length === 0 ? (
                <p className={styles.emptyText}>এই ইউজারের কোনো পোস্ট নেই।</p>
              ) : (
                <div className={styles.postsList}>
                  {posts.map((post) => (
                    <div key={post.id} className={styles.postItem}>
                      <div>
                        <strong>{post.title || 'Untitled Post'}</strong>
                        <div className={styles.postMeta}>
                          {post.type === 'hire' ? 'Job' : 'Service'} &nbsp;•&nbsp;
                          Status: {post.status} &nbsp;•&nbsp;
                          {formatDate(post.createdAt)}
                        </div>
                      </div>
                      <button 
                        className={`${styles.actionBtn} ${styles.delete}`} 
                        onClick={() => handleDeletePostClick(post.id)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className={styles.modalFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default UserFullAccessModal;