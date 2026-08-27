// src/pages/Admin/components/DisputesTable.jsx
//
// ✅ NEW — lists every deal with an open dispute (deal.disputeStatus === 'open')
// and lets admin resolve it: release the escrowed money to the seller, or
// refund it to the buyer.

import React from 'react';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import styles from './DisputesTable.module.css';

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
    <div className={styles.dataTable}>
      <div className={styles.tableHeader}>
        <h3>⚖️ Open Disputes</h3>
        <span className={styles.tableCount}>{disputes.length} টি সক্রিয় ডিসপিউট</span>
        {onRefresh && (
          <button className={styles.refreshBtn} onClick={onRefresh}>
            <i className="fa-solid fa-sync"></i>
          </button>
        )}
      </div>

      {isLoading ? (
        <p className={styles.loadingText}>লোড হচ্ছে...</p>
      ) : disputes.length === 0 ? (
        <p className={styles.emptyText}>কোনো সক্রিয় ডিসপিউট নেই। 🎉</p>
      ) : (
        <div className={styles.disputesList}>
          {disputes.map((deal) => {
            const milestones = deal.milestones || [];
            const disputedTotal = milestones
              .filter(m => m.status === 'funded' || m.status === 'review')
              .reduce((sum, m) => sum + (m.amount || 0), 0);

            return (
              <div key={deal.id} className={styles.disputeCard}>
                <div className={styles.disputeHeader}>
                  <div>
                    <strong className={styles.dealTitle}>{deal.postTitle || 'Untitled Deal'}</strong>
                    <div className={styles.dealMeta}>
                      #{deal.dealIdNumber || deal.id?.slice(-8)} &nbsp;•&nbsp;
                      Raised by: {deal.disputeRaisedBy === deal.buyerId ? 'Buyer' : 'Seller'} &nbsp;•&nbsp;
                      {formatDateFn ? formatDateFn(deal.disputeRaisedAt) : ''}
                    </div>
                  </div>
                  <span className={styles.escrowAmount}>
                    🔒 {formatMoney(disputedTotal)} in escrow
                  </span>
                </div>

                <p className={styles.disputeReason}>
                  <strong>কারণ:</strong> {deal.disputeReason || 'No reason provided'}
                </p>

                <div className={styles.partyIds}>
                  <span>Buyer ID: <code>{deal.buyerId}</code></span>
                  <span>Seller ID: <code>{deal.sellerId}</code></span>
                </div>

                <div className={styles.actionButtons}>
                  <button 
                    className={`${styles.actionBtn} ${styles.approve}`} 
                    onClick={() => handleResolve(deal, 'release')}
                  >
                    ✅ সেলারকে রিলিজ করুন
                  </button>
                  <button 
                    className={`${styles.actionBtn} ${styles.reject}`} 
                    onClick={() => handleResolve(deal, 'refund')}
                  >
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