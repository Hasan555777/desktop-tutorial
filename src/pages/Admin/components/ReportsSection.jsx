// src/pages/Admin/components/ReportsSection.jsx

import React from 'react';
import { 
  formatDate, 
  getReportTypeLabel, 
  getReportStatusLabel,
  getReportBadgeClass,
  truncateText
} from '../utils/adminUtils';
import EmptyState from './EmptyState';
import styles from './ReportsSection.module.css';

// ============================================================
// 🎯 REPORTS SECTION COMPONENT
// ============================================================

const ReportsSection = ({ 
  reports, 
  onViewReport, 
  onResolve, 
  onCancel,
  onRefresh,
  formatDateFn = formatDate
}) => {
  const pendingReportsCount = reports.filter(r => r.status === 'pending').length;

  if (reports.length === 0) {
    return (
      <div className={`${styles.dataTable} ${styles.reportsTable}`}>
        <div className={styles.tableHeader}>
          <h3>
            <i className="fa-solid fa-flag"></i> 
            অভিযোগ ও পরামর্শ
            <span className={styles.tableCount}>0 টি</span>
          </h3>
          <button className={styles.refreshBtn} onClick={onRefresh}>
            <i className="fa-solid fa-sync"></i> রিফ্রেশ
          </button>
        </div>
        <EmptyState 
          icon="fa-solid fa-check-circle"
          iconColor="#10b981"
          iconSize="48px"
          title="কোন অভিযোগ বা পরামর্শ নেই"
          subtitle="সবকিছু ঠিকঠাক আছে! 🎉"
        />
      </div>
    );
  }

  return (
    <div className={`${styles.dataTable} ${styles.reportsTable}`}>
      <div className={styles.tableHeader}>
        <h3>
          <i className="fa-solid fa-flag"></i> 
          অভিযোগ ও পরামর্শ
          <span className={styles.tableCount}>{reports.length} টি</span>
          {pendingReportsCount > 0 && (
            <span className={styles.pendingBadge}>{pendingReportsCount} pending</span>
          )}
        </h3>
        <button className={styles.refreshBtn} onClick={onRefresh}>
          <i className="fa-solid fa-sync"></i> রিফ্রেশ
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>ইউজার</th>
            <th>ধরন</th>
            <th>বিষয়</th>
            <th>মেসেজ</th>
            <th>স্ট্যাটাস</th>
            <th>তারিখ</th>
            <th>অ্যাকশন</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report, index) => (
            <tr key={report.id} className={report.status === 'pending' ? styles.pendingRow : ''}>
              <td>{index + 1}</td>
              <td>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{report.userName || report.userEmail || 'Guest'}</span>
                  <small className={styles.userEmail}>{report.userEmail}</small>
                </div>
              </td>
              <td>
                <span className={`${styles.reportBadge} ${styles[report.type]}`}>
                  {getReportTypeLabel(report.type)}
                </span>
              </td>
              <td>
                <span className={styles.reportSubject}>{report.subject}</span>
              </td>
              <td>
                <span className={styles.reportMessagePreview}>
                  {truncateText(report.message, 40)}
                </span>
              </td>
              <td>
                <span className={`${styles.statusBadge} ${styles[getReportBadgeClass(report.status)]}`}>
                  {getReportStatusLabel(report.status)}
                </span>
              </td>
              <td>{formatDateFn(report.createdAt)}</td>
              <td>
                <div className={styles.actionButtons}>
                  <button 
                    className={`${styles.actionBtn} ${styles.view}`}
                    onClick={() => onViewReport(report)}
                    title="বিস্তারিত দেখুন"
                  >
                    👁️
                  </button>
                  {report.status === 'pending' && (
                    <>
                      <button 
                        className={`${styles.actionBtn} ${styles.approve}`}
                        onClick={() => onResolve(report.id)}
                        title="সমাধান করুন"
                      >
                        ✅
                      </button>
                      <button 
                        className={`${styles.actionBtn} ${styles.reject}`}
                        onClick={() => onCancel(report.id)}
                        title="বাতিল করুন"
                      >
                        ❌
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportsSection;