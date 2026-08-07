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
import './ReportsSection.css';

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
      <div className="data-table reports-table">
        <div className="table-header">
          <h3>
            <i className="fa-solid fa-flag"></i> 
            অভিযোগ ও পরামর্শ
            <span className="table-count">0 টি</span>
          </h3>
          <button className="refresh-btn" onClick={onRefresh}>
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
    <div className="data-table reports-table">
      <div className="table-header">
        <h3>
          <i className="fa-solid fa-flag"></i> 
          অভিযোগ ও পরামর্শ
          <span className="table-count">{reports.length} টি</span>
          {pendingReportsCount > 0 && (
            <span className="pending-badge">{pendingReportsCount} pending</span>
          )}
        </h3>
        <button className="refresh-btn" onClick={onRefresh}>
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
            <tr key={report.id} className={report.status === 'pending' ? 'pending-row' : ''}>
              <td>{index + 1}</td>
              <td>
                <div className="user-info">
                  <span className="user-name">{report.userName || report.userEmail || 'Guest'}</span>
                  <small className="user-email">{report.userEmail}</small>
                </div>
              </td>
              <td>
                <span className={`report-badge ${report.type}`}>
                  {getReportTypeLabel(report.type)}
                </span>
              </td>
              <td>
                <span className="report-subject">{report.subject}</span>
              </td>
              <td>
                <span className="report-message-preview">
                  {truncateText(report.message, 40)}
                </span>
              </td>
              <td>
                <span className={`status-badge ${getReportBadgeClass(report.status)}`}>
                  {getReportStatusLabel(report.status)}
                </span>
              </td>
              <td>{formatDateFn(report.createdAt)}</td>
              <td>
                <div className="action-buttons">
                  <button 
                    className="action-btn view"
                    onClick={() => onViewReport(report)}
                    title="বিস্তারিত দেখুন"
                  >
                    👁️
                  </button>
                  {report.status === 'pending' && (
                    <>
                      <button 
                        className="action-btn approve"
                        onClick={() => onResolve(report.id)}
                        title="সমাধান করুন"
                      >
                        ✅
                      </button>
                      <button 
                        className="action-btn reject"
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