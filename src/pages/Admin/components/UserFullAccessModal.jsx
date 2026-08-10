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
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';

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
  const [activeTab, setActiveTab] = useState('wallet'); // 'wallet' | 'deals' | 'posts'

  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const [deals, setDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(false);

  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // ── Adjust balance form ──
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

  // ✅ Lazy-load each tab's data only the first time it's opened.
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

  // ============================================================
  // ✅ Adjust wallet balance
  // ============================================================
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

  // ============================================================
  // ✅ Cancel a deal
  // ============================================================
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

  // ============================================================
  // ✅ Resolve a dispute
  // ============================================================
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
    if (note === null) return; // cancelled

    const ok = await adminResolveDispute(deal, resolution, note || '');
    if (ok) await reloadDeals();
  };

  const handleDeletePostClick = async (postId) => {
    await onDeletePost(postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const availableBalance = wallet ? Math.max(0, (wallet.balance || 0) - (wallet.lockedBalance || 0)) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content user-detail-modal"
        style={{ maxWidth: 900 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-icon">💰</span>
            <h3>Full Access — {getUserDisplayName(user)}</h3>
            <span className="user-status-badge pending">{getUserShortId(user)}</span>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 8, padding: '0 20px', borderBottom: '1px solid var(--border-color, #2a2f3a)' }}>
          {[
            { key: 'wallet', label: '💳 Wallet' },
            { key: 'deals', label: `🤝 Deals${deals.length ? ` (${deals.length})` : ''}` },
            { key: 'posts', label: `📄 Posts${posts.length ? ` (${posts.length})` : ''}` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent-primary, #14b8a6)' : '2px solid transparent',
                color: activeTab === tab.key ? 'var(--accent-primary, #14b8a6)' : 'var(--text-secondary, #94a3b8)',
                fontWeight: activeTab === tab.key ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="modal-body">

          {/* ============================================================
              WALLET TAB
          ============================================================ */}
          {activeTab === 'wallet' && (
            <div>
              {walletLoading ? (
                <p>লোড হচ্ছে...</p>
              ) : !wallet ? (
                <p>এই ইউজারের কোনো ওয়ালেট পাওয়া যায়নি।</p>
              ) : (
                <>
                  <div className="user-info-grid">
                    <div className="user-info-item">
                      <span className="label">Total Balance</span>
                      <span className="value">{formatMoney(wallet.balance)}</span>
                    </div>
                    <div className="user-info-item">
                      <span className="label">Locked (Active Deals)</span>
                      <span className="value" style={{ color: '#f59e0b' }}>{formatMoney(wallet.lockedBalance)}</span>
                    </div>
                    <div className="user-info-item">
                      <span className="label">Available</span>
                      <span className="value" style={{ color: '#10b981' }}>{formatMoney(availableBalance)}</span>
                    </div>
                    <div className="user-info-item">
                      <span className="label">Total Earned</span>
                      <span className="value">{formatMoney(wallet.totalEarned)}</span>
                    </div>
                    <div className="user-info-item">
                      <span className="label">Total Withdrawn</span>
                      <span className="value">{formatMoney(wallet.totalWithdrawn)}</span>
                    </div>
                    <div className="user-info-item">
                      <span className="label">Wallet ID</span>
                      <span className="value">{wallet.walletId || wallet.id}</span>
                    </div>
                  </div>

                  <div className="review-sections" style={{ marginTop: 20 }}>
                    <h4 className="review-sections-title">⚙️ Adjust Balance (Admin)</h4>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: '1 1 140px' }}>
                        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Amount (BDT)</label>
                        <input
                          type="number"
                          min="1"
                          value={adjustAmount}
                          onChange={(e) => setAdjustAmount(e.target.value)}
                          placeholder="0"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color, #2a2f3a)', background: 'transparent', color: 'inherit' }}
                        />
                      </div>
                      <div style={{ flex: '2 1 240px' }}>
                        <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Reason <span className="required">*</span></label>
                        <input
                          type="text"
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          placeholder="যেমন: Refund for dispute #123, compensation, correction..."
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color, #2a2f3a)', background: 'transparent', color: 'inherit' }}
                        />
                      </div>
                      <button
                        className="review-btn approve"
                        disabled={adjustSubmitting}
                        onClick={() => handleAdjust('credit')}
                      >
                        ➕ Credit
                      </button>
                      <button
                        className="review-btn reject"
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
                <p>লোড হচ্ছে...</p>
              ) : deals.length === 0 ? (
                <p>এই ইউজারের কোনো ডিল নেই।</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                        style={{
                          border: '1px solid var(--border-color, #2a2f3a)',
                          borderRadius: 10,
                          padding: 14,
                          background: deal.disputeStatus === 'open' ? '#f59e0b10' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <strong>{deal.postTitle || 'Untitled Deal'}</strong>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                              #{deal.dealIdNumber || deal.id?.slice(-8)} &nbsp;•&nbsp;
                              {user.id && (isBuyer ? 'Buyer' : 'Seller')} in this deal &nbsp;•&nbsp;
                              Counterparty: <strong>{counterpartyName}</strong>
                            </div>
                          </div>
                          <span className="status-badge" style={{ height: 'fit-content' }}>
                            {DEAL_STATUS_LABELS[deal.status] || deal.status}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
                          <span>💰 বাজেট: <strong>{formatMoney(deal.budget)}</strong></span>
                          <span>🔒 Escrow (funded): <strong>{formatMoney(fundedTotal)}</strong></span>
                          <span>✅ Released: <strong>{formatMoney(releasedTotal)}</strong></span>
                        </div>

                        {deal.disputeStatus === 'open' && (
                          <div style={{ marginTop: 10, padding: 10, background: '#f59e0b15', borderRadius: 8, fontSize: 13 }}>
                            <strong>⚖️ Dispute Open</strong> — {deal.disputeReason || 'No reason given'}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          {deal.disputeStatus === 'open' && (
                            <>
                              <button className="review-btn approve" onClick={() => handleResolveDispute(deal, 'release')}>
                                ✅ সেলারকে রিলিজ করুন
                              </button>
                              <button className="review-btn reject" onClick={() => handleResolveDispute(deal, 'refund')}>
                                ↩️ বায়ারকে রিফান্ড
                              </button>
                            </>
                          )}
                          {deal.status !== 'completed' && deal.status !== 'cancelled' && (
                            <button className="action-btn delete" onClick={() => handleCancelDeal(deal)}>
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
                <p>লোড হচ্ছে...</p>
              ) : posts.length === 0 ? (
                <p>এই ইউজারের কোনো পোস্ট নেই।</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid var(--border-color, #2a2f3a)',
                        borderRadius: 10,
                        padding: 12,
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <div>
                        <strong>{post.title || 'Untitled Post'}</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                          {post.type === 'hire' ? 'Job' : 'Service'} &nbsp;•&nbsp;
                          Status: {post.status} &nbsp;•&nbsp;
                          {formatDate(post.createdAt)}
                        </div>
                      </div>
                      <button className="action-btn delete" onClick={() => handleDeletePostClick(post.id)}>
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
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default UserFullAccessModal;