// src/pages/Admin/components/WithdrawalsTable.jsx

import React, { useState } from 'react';
import { formatDate, formatMoney, getWithdrawalStatusLabel, getWithdrawalBadgeClass } from '../utils/adminUtils';
import styles from './WithdrawalsTable.module.css';

// ============================================================
// 🎯 WITHDRAWALS TABLE COMPONENT
// ============================================================

// 🔧 FIX (#3 bank withdrawal info not reaching admin): the bank fields
// (accountHolder, bankName, accountNumber) were always being saved to the
// withdrawal Firestore document by Withdraw.jsx, but this table never read
// or rendered them — admin only ever saw `mobileNumber` (and a dead
// `withdrawal.bankAccount` field that no writer ever sets). So for
// bank-method withdrawals the admin had no way to see where to actually
// send the money. Added an expandable "bank details" row (same pattern as
// DepositsTable.jsx) that shows Account Holder / Bank Name / Account
// Number straight from the persisted document — not from any temporary
// frontend state.
const isBankWithdrawal = (withdrawal) => (withdrawal.paymentMethod || '').toLowerCase() === 'bank';

const WithdrawalsTable = ({ 
  withdrawals, 
  onApprove, 
  onReject, 
  onComplete 
}) => {
  const [expandedRow, setExpandedRow] = useState(null);

  const toggleExpand = (id) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  return (
    <div className={styles.dataTable}>
      <div className={styles.tableHeader}>
        <h3>💳 উইথড্র রিকোয়েস্ট</h3>
        <span className={styles.tableCount}>{withdrawals.length} টি রিকোয়েস্ট</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>আইডি</th>
            <th>পরিমাণ</th>
            <th>ফি</th>
            <th>পেআউট</th>
            <th>পদ্ধতি</th>
            <th>মোবাইল</th>
            <th>স্ট্যাটাস</th>
            <th>অ্যাকশন</th>
          </tr>
        </thead>
        <tbody>
          {withdrawals.map(withdrawal => {
            // 🔧 FIX (fee not clearly displayed to admin): feePercent/
            // feeAmount/netPayout were already stored on the withdrawal
            // doc but never shown here — admin only saw the raw
            // requested amount, with no visibility into what to
            // actually pay out. `feePercent` may be undefined on
            // withdrawals made before this fee system existed;
            // treated as 0 so old rows still render correctly.
            const feePercent = withdrawal.feePercent || 0;
            const feeAmount = withdrawal.feeAmount || 0;
            const netPayout = withdrawal.netPayout ?? withdrawal.amount;
            const isBank = isBankWithdrawal(withdrawal);
            const isExpanded = expandedRow === withdrawal.id;

            return (
            <React.Fragment key={withdrawal.id}>
            <tr>
              <td>{withdrawal.id?.slice(-8)}</td>
              <td>{formatMoney(withdrawal.amount)}</td>
              <td>{feePercent > 0 ? `${formatMoney(feeAmount)} (${feePercent}%)` : '—'}</td>
              <td><strong>{formatMoney(netPayout)}</strong></td>
              <td>{withdrawal.paymentMethod || 'ব্যাংক'}</td>
              <td>{withdrawal.mobileNumber || '—'}</td>
              <td>
                <span className={`${styles.statusBadge} ${styles[getWithdrawalBadgeClass(withdrawal.status)]}`}>
                  {getWithdrawalStatusLabel(withdrawal.status)}
                </span>
              </td>
              <td>
                <div className={styles.actionButtons}>
                  {/* 🔧 ADD: bank-method withdrawals get a "view details"
                      toggle so admin can see the full persisted bank
                      info before approving/paying out. */}
                  {isBank && (
                    <button
                      className={`${styles.actionBtn} ${styles.view}`}
                      onClick={() => toggleExpand(withdrawal.id)}
                      title="ব্যাংক ডিটেইলস দেখুন"
                    >
                      <i className="fa-solid fa-eye"></i>
                    </button>
                  )}
                  {withdrawal.status === 'pending' && (
                    <>
                      <button 
                        className={`${styles.actionBtn} ${styles.approve}`}
                        onClick={() => onApprove(withdrawal.id, withdrawal.userId, withdrawal.amount)}
                      >
                        ✅ অ্যাপ্রুভ
                      </button>
                      <button 
                        className={`${styles.actionBtn} ${styles.reject}`}
                        onClick={() => onReject(withdrawal.id, withdrawal.userId, withdrawal.amount)}
                      >
                        ❌ রিজেক্ট
                      </button>
                    </>
                  )}
                  {withdrawal.status === 'processing' && (
                    <button 
                      className={`${styles.actionBtn} ${styles.complete}`}
                      onClick={() => onComplete(withdrawal.id, withdrawal.userId, withdrawal.amount)}
                    >
                      ✅ সম্পন্ন
                    </button>
                  )}
                  {withdrawal.status === 'completed' && (
                    <span className={styles.badgeSuccess}>✅ সম্পন্ন</span>
                  )}
                  {withdrawal.status === 'rejected' && (
                    <span className={styles.badgeDanger}>❌ প্রত্যাখ্যাত</span>
                  )}
                </div>
              </td>
            </tr>

            {/* ── Expanded Row: Bank Details (read from the persisted
                 Firestore document, same fields Withdraw.jsx writes) ── */}
            {isBank && isExpanded && (
              <tr className={styles.expandedRow}>
                <td colSpan="8">
                  <div className={styles.expandedDetails}>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailsSection}>
                        <h4>
                          <i className="fa-solid fa-building-columns" style={{ color: '#438e82' }}></i>
                          ব্যাংক তথ্য
                        </h4>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Account Holder:</span>
                          <span className={styles.detailValue}>
                            <strong>{withdrawal.accountHolder || 'N/A'}</strong>
                          </span>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Bank Name:</span>
                          <span className={styles.detailValue}>{withdrawal.bankName || 'N/A'}</span>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Account Number:</span>
                          <span className={styles.detailValue}>{withdrawal.accountNumber || 'N/A'}</span>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Mobile Number:</span>
                          <span className={styles.detailValue}>{withdrawal.mobileNumber || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      className={styles.closeExpanded}
                      onClick={() => toggleExpand(withdrawal.id)}
                    >
                      <i className="fa-solid fa-chevron-up"></i> বন্ধ করুন
                    </button>
                  </div>
                </td>
              </tr>
            )}
            </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default WithdrawalsTable;
