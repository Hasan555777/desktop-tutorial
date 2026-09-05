// src/pages/Admin/components/DepositsTable.jsx

import React, { useState } from 'react';
import { formatDate } from '../utils/adminUtils';
import styles from './DepositsTable.module.css';

// ============================================================
// 🎯 DEPOSITS TABLE COMPONENT
// ============================================================

const DepositsTable = ({ 
  deposits = [],        // ✅ পেন্ডিং ডিপোজিট
  history = [],         // ✅ হিস্ট্রি ডিপোজিট
  onApprove, 
  onReject,
  isLoading = false,
  onTabChange = null
}) => {
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');

  // ✅ Bank Transfer চেক করুন
  const isBankTransfer = (deposit) => {
    return deposit.method === 'Bank Transfer' || deposit.type === 'bank-transfer';
  };

  // ✅ টগল ফাংশন
  const toggleExpand = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  // ✅ ট্যাব চেঞ্জ
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  // ── রেন্ডার টেবল ──
  const renderTable = (data, isHistory = false) => {
    if (data.length === 0) {
      return (
        <div className={styles.noData}>
          <i className="fa-solid fa-check-circle" style={{ color: '#10b981' }}></i>
          <p>
            {isHistory 
              ? 'কোন ডিপোজিট হিস্ট্রি নেই' 
              : 'কোন পেন্ডিং ডিপোজিট নেই'
            }
          </p>
        </div>
      );
    }

    return (
      <div className={styles.tableResponsive}>
        <table>
          <thead>
            <tr>
              <th>ইউজার</th>
              <th>পরিমাণ</th>
              <th>পদ্ধতি</th>
              <th>TrxID / রেফারেন্স</th>
              <th>সেন্ডার / ব্যাংক</th>
              <th>তারিখ</th>
              {!isHistory && <th>অ্যাকশন</th>}
              {isHistory && <th>স্ট্যাটাস</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((deposit) => {
              const isBT = isBankTransfer(deposit);
              const isExpanded = expandedRow === deposit.id;

              return (
                <React.Fragment key={deposit.id}>
                  <tr className={`${styles.depositRow} ${isBT ? styles.bankTransferRow : ''}`}>
                    <td>
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{deposit.userName || deposit.userEmail}</span>
                        <small className={styles.userId}>{deposit.userId?.slice(-8)}</small>
                      </div>
                    </td>
                    <td>
                      <strong className={styles.amount}>৳{deposit.amount}</strong>
                    </td>
                    <td>
                      <span className={`${styles.methodBadge} ${isBT ? styles.bankTransfer : styles.mobile}`}>
                        {isBT ? (
                          <>
                            <i className="fa-solid fa-building-columns"></i> Bank Transfer
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-mobile-screen-button"></i> {deposit.method}
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      {isBT ? (
                        <span className={`${styles.trxId} ${styles.bankRef}`}>
                          <i className="fa-solid fa-receipt"></i> 
                          {deposit.receiptFileName || 'Receipt Uploaded'}
                        </span>
                      ) : (
                        <span className={styles.trxId}>{deposit.trxId}</span>
                      )}
                    </td>
                    <td>
                      {isBT ? (
                        <div className={styles.bankInfoMini}>
                          <span className={styles.bankName}>{deposit.bankDetails?.bankName || 'N/A'}</span>
                          <small className={styles.accountNumber}>{deposit.bankDetails?.accountNumber || ''}</small>
                        </div>
                      ) : (
                        <span>{deposit.senderNumber}</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.dateTime}>{formatDate(deposit.createdAt)}</span>
                    </td>
                    
                    {!isHistory ? (
                      // ── Pending Actions ──
                      <td>
                        <div className={styles.actionButtons}>
                          {isBT && (
                            <button
                              className={`${styles.actionBtn} ${styles.view}`}
                              onClick={() => toggleExpand(deposit.id)}
                              title="View Details"
                              disabled={isLoading}
                            >
                              <i className="fa-solid fa-eye"></i>
                            </button>
                          )}
                          <button
                            className={`${styles.actionBtn} ${styles.approve}`}
                            onClick={() => onApprove(deposit.id, deposit.userId, deposit.amount)}
                            title="Approve"
                            disabled={isLoading}
                          >
                            <i className="fa-solid fa-check"></i>
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.reject}`}
                            onClick={() => onReject(deposit.id, deposit.userId, deposit.amount)}
                            title="Reject"
                            disabled={isLoading}
                          >
                            <i className="fa-solid fa-times"></i>
                          </button>
                        </div>
                      </td>
                    ) : (
                      // ── History Status ──
                      <td>
                        <span className={`${styles.statusBadge} ${deposit.status === 'approved' ? styles.approved : styles.rejected}`}>
                          {deposit.status === 'approved' ? (
                            <><i className="fa-solid fa-check-circle"></i> Approved</>
                          ) : deposit.status === 'rejected' ? (
                            <><i className="fa-solid fa-times-circle"></i> Rejected</>
                          ) : (
                            <><i className="fa-solid fa-clock"></i> {deposit.status || 'Pending'}</>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>

                  {/* ✅ Expanded Row - Bank Transfer Details */}
                  {isBT && isExpanded && (
                    <tr className={styles.expandedRow}>
                      <td colSpan="7">
                        <div className={styles.expandedDetails}>
                          <div className={styles.detailsGrid}>
                            <div className={styles.detailsSection}>
                              <h4>
                                <i className="fa-solid fa-building-columns" style={{ color: '#438e82' }}></i>
                                Bank Transfer Details
                              </h4>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Account Holder:</span>
                                <span className={styles.detailValue}>
                                  <strong>{deposit.bankDetails?.accountName || 'N/A'}</strong>
                                </span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Account Number:</span>
                                <span className={styles.detailValue}>{deposit.bankDetails?.accountNumber || 'N/A'}</span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Bank Name:</span>
                                <span className={styles.detailValue}>{deposit.bankDetails?.bankName || 'N/A'}</span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Branch:</span>
                                <span className={styles.detailValue}>{deposit.bankDetails?.branch || 'N/A'}</span>
                              </div>
                            </div>

                            <div className={styles.detailsSection}>
                              <h4>
                                <i className="fa-solid fa-image" style={{ color: '#8b5cf6' }}></i>
                                Receipt
                              </h4>
                              {deposit.receiptUrl ? (
                                <div className={styles.receiptActions}>
                                  <a 
                                    href={deposit.receiptUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className={styles.receiptLink}
                                  >
                                    <i className="fa-solid fa-external-link-alt"></i>
                                    View Receipt
                                  </a>
                                  <a 
                                    href={deposit.receiptUrl} 
                                    download
                                    className={`${styles.receiptLink} ${styles.download}`}
                                  >
                                    <i className="fa-solid fa-download"></i>
                                    Download
                                  </a>
                                </div>
                              ) : (
                                <p className={styles.noReceipt}>No receipt uploaded</p>
                              )}
                              {deposit.receiptFileName && (
                                <div className={styles.receiptFilename}>
                                  <i className="fa-regular fa-file"></i>
                                  {deposit.receiptFileName}
                                </div>
                              )}
                            </div>

                            {deposit.note && (
                              <div className={styles.detailsSection}>
                                <h4>
                                  <i className="fa-solid fa-pen" style={{ color: '#f59e0b' }}></i>
                                  Note
                                </h4>
                                <p className={styles.noteText}>{deposit.note}</p>
                              </div>
                            )}
                          </div>

                          <button 
                            className={styles.closeExpanded}
                            onClick={() => toggleExpand(deposit.id)}
                          >
                            <i className="fa-solid fa-chevron-up"></i> Close Details
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

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className={`${styles.dataTable} ${styles.depositsTable}`}>
      {/* ── ট্যাব হেডার ── */}
      <div className={`${styles.tableHeader} ${styles.depositsHeader}`}>
        <div className={styles.headerLeft}>
          <h3>💳 ডিপোজিট</h3>
          <div className={styles.tabButtons}>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'pending' ? styles.active : ''}`}
              onClick={() => handleTabChange('pending')}
            >
              <i className="fa-solid fa-clock"></i>
              পেন্ডিং ({deposits.length})
            </button>
            <button 
              className={`${styles.tabBtn} ${activeTab === 'history' ? styles.active : ''}`}
              onClick={() => handleTabChange('history')}
            >
              <i className="fa-solid fa-history"></i>
              হিস্ট্রি ({history.length})
            </button>
          </div>
        </div>
        <button className={styles.refreshBtn} onClick={() => {}}>
          <i className="fa-solid fa-sync"></i>
        </button>
      </div>

      {/* ── কন্টেন্ট ── */}
      {activeTab === 'pending' ? (
        renderTable(deposits, false)
      ) : (
        renderTable(history, true)
      )}
    </div>
  );
};

export default DepositsTable;