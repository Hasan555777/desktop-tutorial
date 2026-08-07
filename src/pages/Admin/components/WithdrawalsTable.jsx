// src/pages/Admin/components/WithdrawalsTable.jsx

import React from 'react';
import { formatDate, formatMoney, getWithdrawalStatusLabel, getWithdrawalBadgeClass } from '../utils/adminUtils';
import './WithdrawalsTable.css';
// ============================================================
// 🎯 WITHDRAWALS TABLE COMPONENT
// ============================================================

const WithdrawalsTable = ({ 
  withdrawals, 
  onApprove, 
  onReject, 
  onComplete 
}) => {
  return (
    <div className="data-table">
      <div className="table-header">
        <h3>💳 উইথড্র রিকোয়েস্ট</h3>
        <span className="table-count">{withdrawals.length} টি রিকোয়েস্ট</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>আইডি</th>
            <th>পরিমাণ</th>
            <th>পদ্ধতি</th>
            <th>মোবাইল</th>
            <th>স্ট্যাটাস</th>
            <th>অ্যাকশন</th>
          </tr>
        </thead>
        <tbody>
          {withdrawals.map(withdrawal => (
            <tr key={withdrawal.id}>
              <td>{withdrawal.id?.slice(-8)}</td>
              <td>{formatMoney(withdrawal.amount)}</td>
              <td>{withdrawal.paymentMethod || 'ব্যাংক'}</td>
              <td>{withdrawal.mobileNumber || withdrawal.bankAccount}</td>
              <td>
                <span className={`status-badge ${getWithdrawalBadgeClass(withdrawal.status)}`}>
                  {getWithdrawalStatusLabel(withdrawal.status)}
                </span>
              </td>
              <td>
                {withdrawal.status === 'pending' && (
                  <>
                    <button 
                      className="action-btn approve"
                      onClick={() => onApprove(withdrawal.id, withdrawal.userId, withdrawal.amount)}
                    >
                      ✅ অ্যাপ্রুভ
                    </button>
                    <button 
                      className="action-btn reject"
                      onClick={() => onReject(withdrawal.id, withdrawal.userId, withdrawal.amount)}
                    >
                      ❌ রিজেক্ট
                    </button>
                  </>
                )}
                {withdrawal.status === 'processing' && (
                  <button 
                    className="action-btn complete"
                    onClick={() => onComplete(withdrawal.id, withdrawal.userId, withdrawal.amount)}
                  >
                    ✅ সম্পন্ন
                  </button>
                )}
                {withdrawal.status === 'completed' && (
                  <span className="badge-success">✅ সম্পন্ন</span>
                )}
                {withdrawal.status === 'rejected' && (
                  <span className="badge-danger">❌ প্রত্যাখ্যাত</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WithdrawalsTable;