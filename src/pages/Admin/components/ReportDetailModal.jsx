// src/pages/Admin/components/ReportDetailModal.jsx

import React from 'react';
import { formatDate, getReportStatusLabel, getReportTypeLabel } from '../utils/adminUtils';
import styles from './ReportDetailModal.module.css';

// ============================================================
// 🎯 REPORT DETAIL MODAL COMPONENT
// ============================================================

const ReportDetailModal = ({ 
  report, 
  onClose, 
  onUpdateStatus,
  formatDate: formatDateFn = formatDate 
}) => {
  if (!report) return null;

  const handleResolve = () => {
    onUpdateStatus(report.id, 'resolved');
    onClose();
  };

  const handleCancel = () => {
    onUpdateStatus(report.id, 'cancelled');
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalContent} ${styles.reportDetailsModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3><i className="fa-solid fa-flag"></i> রিপোর্ট বিস্তারিত</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div className={styles.modalBody}>
          <div className={styles.detailRow}>
            <span>👤 ইউজার:</span>
            <span>{report.userName || report.userEmail || 'Guest'}</span>
          </div>
          <div className={styles.detailRow}>
            <span>📧 ইমেইল:</span>
            <span>{report.userEmail || 'N/A'}</span>
          </div>
          <div className={styles.detailRow}>
            <span>📌 ধরন:</span>
            <span className={`${styles.reportTypeBadge} ${styles[report.type]}`}>
              {getReportTypeLabel(report.type)}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span>📝 বিষয়:</span>
            <span className={styles.reportSubject}>{report.subject}</span>
          </div>
          <div className={styles.detailRow}>
            <span>💬 মেসেজ:</span>
            <span className={styles.reportMessage}>{report.message}</span>
          </div>
          <div className={styles.detailRow}>
            <span>📅 তারিখ:</span>
            <span>{formatDateFn(report.createdAt)}</span>
          </div>
          <div className={styles.detailRow}>
            <span>🔖 স্ট্যাটাস:</span>
            <span className={`${styles.statusBadge} ${styles[report.status]}`}>
              {getReportStatusLabel(report.status)}
            </span>
          </div>
          {report.screenshot && (
            <div className={`${styles.detailRow} ${styles.screenshotRow}`}>
              <span>🖼️ স্ক্রিনশট:</span>
              <img 
                src={report.screenshot} 
                alt="Screenshot" 
                className={styles.reportScreenshot} 
                onClick={() => window.open(report.screenshot, '_blank')} 
              />
            </div>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          {report.status === 'pending' && (
            <>
              <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={handleResolve}>
                ✅ সমাধান করুন
              </button>
              <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleCancel}>
                ❌ বাতিল করুন
              </button>
            </>
          )}
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>বন্ধ করুন</button>
        </div>
      </div>
    </div>
  );
};

export default ReportDetailModal;