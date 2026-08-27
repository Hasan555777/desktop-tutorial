// src/pages/Admin/components/DealsTable.jsx

import React from 'react';
import { formatDate, formatMoney, getStatusBadge, truncateText } from '../utils/adminUtils';
import styles from './DealsTable.module.css';

// ============================================================
// 🎯 DEALS TABLE COMPONENT
// ============================================================

const DealsTable = ({ deals }) => {
  return (
    <div className={styles.dataTable}>
      <div className={styles.tableHeader}>
        <h3>🤝 ডিল সমূহ</h3>
        <span className={styles.tableCount}>{deals.length} টি ডিল</span>
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
                <span className={styles.dealIdTag}>
                  #{deal.dealIdNumber || deal.id?.slice(-8)}
                </span>
              </td>
              <td>{truncateText(deal.postTitle, 40)}</td>
              <td>{formatMoney(deal.budget)}</td>
              <td>
                <span className={`${styles.statusBadge} ${styles[getStatusBadge(deal.status)]}`}>
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