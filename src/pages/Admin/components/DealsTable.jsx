// src/pages/Admin/components/DealsTable.jsx

import React from 'react';
import { formatDate, formatMoney, getStatusBadge, truncateText } from '../utils/adminUtils';
import './DealsTable.css';
// ============================================================
// 🎯 DEALS TABLE COMPONENT
// ============================================================

const DealsTable = ({ deals }) => {
  return (
    <div className="data-table">
      <div className="table-header">
        <h3>🤝 ডিল সমূহ</h3>
        <span className="table-count">{deals.length} টি ডিল</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>ডিল আইডি</th>
            <th>প্রজেক্ট</th>
            <th>বাজেট</th>
            <th>স্ট্যাটাস</th>
            <th>তারিখ</th>
          </tr>
        </thead>
        <tbody>
          {deals.map(deal => (
            <tr key={deal.id}>
              <td>
                <span className="deal-id-tag">
                  #{deal.dealIdNumber || deal.id?.slice(-8)}
                </span>
              </td>
              <td>{truncateText(deal.postTitle, 40)}</td>
              <td>{formatMoney(deal.budget)}</td>
              <td>
                <span className={`status-badge ${getStatusBadge(deal.status)}`}>
                  {deal.status || 'প্রক্রিয়াধীন'}
                </span>
              </td>
              <td>{formatDate(deal.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DealsTable;