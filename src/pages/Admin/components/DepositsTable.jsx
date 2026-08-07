// src/pages/Admin/components/DepositsTable.jsx

import React, { useState } from 'react';
import { formatDate } from '../utils/adminUtils';
import './DepositsTable.css';

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
        <div className="no-data">
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
      <div className="table-responsive">
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
                  <tr className={`deposit-row ${isBT ? 'bank-transfer-row' : ''}`}>
                    <td>
                      <div className="user-info">
                        <span className="user-name">{deposit.userName || deposit.userEmail}</span>
                        <small className="user-id">{deposit.userId?.slice(-8)}</small>
                      </div>
                    </td>
                    <td>
                      <strong className="amount">৳{deposit.amount}</strong>
                    </td>
                    <td>
                      <span className={`method-badge ${isBT ? 'bank-transfer' : 'mobile'}`}>
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
                        <span className="trx-id bank-ref">
                          <i className="fa-solid fa-receipt"></i> 
                          {deposit.receiptFileName || 'Receipt Uploaded'}
                        </span>
                      ) : (
                        <span className="trx-id">{deposit.trxId}</span>
                      )}
                    </td>
                    <td>
                      {isBT ? (
                        <div className="bank-info-mini">
                          <span className="bank-name">{deposit.bankDetails?.bankName || 'N/A'}</span>
                          <small className="account-number">{deposit.bankDetails?.accountNumber || ''}</small>
                        </div>
                      ) : (
                        <span>{deposit.senderNumber}</span>
                      )}
                    </td>
                    <td>
                      <span className="date-time">{formatDate(deposit.createdAt)}</span>
                    </td>
                    
                    {!isHistory ? (
                      // ── Pending Actions ──
                      <td>
                        <div className="action-buttons">
                          {isBT && (
                            <button
                              className="action-btn view"
                              onClick={() => toggleExpand(deposit.id)}
                              title="View Details"
                              disabled={isLoading}
                            >
                              <i className="fa-solid fa-eye"></i>
                            </button>
                          )}
                          <button
                            className="action-btn approve"
                            onClick={() => onApprove(deposit.id, deposit.userId, deposit.amount)}
                            title="Approve"
                            disabled={isLoading}
                          >
                            <i className="fa-solid fa-check"></i>
                          </button>
                          <button
                            className="action-btn reject"
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
                        <span className={`status-badge ${deposit.status === 'approved' ? 'approved' : 'rejected'}`}>
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
                    <tr className="expanded-row">
                      <td colSpan="7">
                        <div className="expanded-details">
                          <div className="details-grid">
                            <div className="details-section">
                              <h4>
                                <i className="fa-solid fa-building-columns" style={{ color: '#438e82' }}></i>
                                Bank Transfer Details
                              </h4>
                              <div className="detail-item">
                                <span className="detail-label">Account Holder:</span>
                                <span className="detail-value">
                                  <strong>{deposit.bankDetails?.accountName || 'N/A'}</strong>
                                </span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Account Number:</span>
                                <span className="detail-value">{deposit.bankDetails?.accountNumber || 'N/A'}</span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Bank Name:</span>
                                <span className="detail-value">{deposit.bankDetails?.bankName || 'N/A'}</span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Branch:</span>
                                <span className="detail-value">{deposit.bankDetails?.branch || 'N/A'}</span>
                              </div>
                            </div>

                            <div className="details-section">
                              <h4>
                                <i className="fa-solid fa-image" style={{ color: '#8b5cf6' }}></i>
                                Receipt
                              </h4>
                              {deposit.receiptUrl ? (
                                <div className="receipt-actions">
                                  <a 
                                    href={deposit.receiptUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="receipt-link"
                                  >
                                    <i className="fa-solid fa-external-link-alt"></i>
                                    View Receipt
                                  </a>
                                  <a 
                                    href={deposit.receiptUrl} 
                                    download
                                    className="receipt-link download"
                                  >
                                    <i className="fa-solid fa-download"></i>
                                    Download
                                  </a>
                                </div>
                              ) : (
                                <p className="no-receipt">No receipt uploaded</p>
                              )}
                              {deposit.receiptFileName && (
                                <div className="receipt-filename">
                                  <i className="fa-regular fa-file"></i>
                                  {deposit.receiptFileName}
                                </div>
                              )}
                            </div>

                            {deposit.note && (
                              <div className="details-section">
                                <h4>
                                  <i className="fa-solid fa-pen" style={{ color: '#f59e0b' }}></i>
                                  Note
                                </h4>
                                <p className="note-text">{deposit.note}</p>
                              </div>
                            )}
                          </div>

                          <button 
                            className="close-expanded"
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
    <div className="data-table deposits-table">
      {/* ── ট্যাব হেডার ── */}
      <div className="table-header deposits-header">
        <div className="header-left">
          <h3>💳 ডিপোজিট</h3>
          <div className="tab-buttons">
            <button 
              className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => handleTabChange('pending')}
            >
              <i className="fa-solid fa-clock"></i>
              পেন্ডিং ({deposits.length})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => handleTabChange('history')}
            >
              <i className="fa-solid fa-history"></i>
              হিস্ট্রি ({history.length})
            </button>
          </div>
        </div>
        <button className="refresh-btn" onClick={() => {}}>
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