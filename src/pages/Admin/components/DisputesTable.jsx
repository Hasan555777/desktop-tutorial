// src/pages/Admin/components/DisputesTable.jsx
//
// ✅ NEW — lists every deal with an open dispute (deal.disputeStatus === 'open')
// and lets admin resolve it: release the escrowed money to the seller, or
// refund it to the buyer.

import React from 'react';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';

const formatMoney = (amount) =>
  new Intl.NumberFormat('bn-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 })
    .format(amount || 0);

const DisputesTable = ({ disputes, isLoading, onResolve, onRefresh, formatDateFn }) => {
  const feedback = useFeedback();

  const handleResolve = async (deal, resolution) => {
    const note = await feedback.prompt({
      title: resolution === 'release' ? '✅ সেলারকে রিলিজ করুন' : '↩️ বায়ারকে রিফান্ড করুন',
      message: `"${deal.postTitle || 'Untitled Deal'}" — সিদ্ধান্তের সংক্ষিপ্ত নোট (ঐচ্ছিক):`,
      placeholder: 'নোট লিখুন...',
      confirmText: 'নিশ্চিত করুন',
      cancelText: 'বাতিল',
      inputType: 'text',
      required: false,
    });
    if (note === null) return;
    await onResolve(deal, resolution, note || '');
  };

  return (
    <div className="data-table">
      <div className="table-header">
        <h3>⚖️ Open Disputes</h3>
        <span className="table-count">{disputes.length} টি সক্রিয় ডিসপিউট</span>
        {onRefresh && (
          <button className="refresh-btn" onClick={onRefresh} style={{ marginLeft: 'auto' }}>
            <i className="fa-solid fa-sync"></i>
          </button>
        )}
      </div>

      {isLoading ? (
        <p style={{ padding: 20 }}>লোড হচ্ছে...</p>
      ) : disputes.length === 0 ? (
        <p style={{ padding: 20 }}>কোনো সক্রিয় ডিসপিউট নেই। 🎉</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
          {disputes.map((deal) => {
            const milestones = deal.milestones || [];
            const disputedTotal = milestones
              .filter(m => m.status === 'funded' || m.status === 'review')
              .reduce((sum, m) => sum + (m.amount || 0), 0);

            return (
              <div
                key={deal.id}
                style={{
                  border: '1px solid #f59e0b40',
                  background: '#f59e0b10',
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{deal.postTitle || 'Untitled Deal'}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 4 }}>
                      #{deal.dealIdNumber || deal.id?.slice(-8)} &nbsp;•&nbsp;
                      Raised by: {deal.disputeRaisedBy === deal.buyerId ? 'Buyer' : 'Seller'} &nbsp;•&nbsp;
                      {formatDateFn ? formatDateFn(deal.disputeRaisedAt) : ''}
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                    🔒 {formatMoney(disputedTotal)} in escrow
                  </span>
                </div>

                <p style={{ marginTop: 10, fontSize: 13, background: 'var(--bg-tertiary, #11151d)', padding: 10, borderRadius: 8 }}>
                  <strong>কারণ:</strong> {deal.disputeReason || 'No reason provided'}
                </p>

                <div style={{ display: 'flex', gap: 16, fontSize: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  <span>Buyer ID: <code>{deal.buyerId}</code></span>
                  <span>Seller ID: <code>{deal.sellerId}</code></span>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="action-btn approve" onClick={() => handleResolve(deal, 'release')}>
                    ✅ সেলারকে রিলিজ করুন
                  </button>
                  <button className="action-btn reject" onClick={() => handleResolve(deal, 'refund')}>
                    ↩️ বায়ারকে রিফান্ড
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DisputesTable;