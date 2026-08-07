// src/pages/Admin/components/ReportDetailModal.jsx

import React from 'react';
import { formatDate, getReportStatusLabel, getReportTypeLabel } from '../utils/adminUtils';
import './ReportDetailModal.css';
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content report-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><i className="fa-solid fa-flag"></i> রিপোর্ট বিস্তারিত</h3>
          <button className="close-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div className="modal-body">
          <div className="detail-row">
            <span>👤 ইউজার:</span>
            <span>{report.userName || report.userEmail || 'Guest'}</span>
          </div>
          <div className="detail-row">
            <span>📧 ইমেইল:</span>
            <span>{report.userEmail || 'N/A'}</span>
          </div>
          <div className="detail-row">
            <span>📌 ধরন:</span>
            <span className={`report-type-badge ${report.type}`}>
              {getReportTypeLabel(report.type)}
            </span>
          </div>
          <div className="detail-row">
            <span>📝 বিষয়:</span>
            <span className="report-subject">{report.subject}</span>
          </div>
          <div className="detail-row">
            <span>💬 মেসেজ:</span>
            <span className="report-message">{report.message}</span>
          </div>
          <div className="detail-row">
            <span>📅 তারিখ:</span>
            <span>{formatDateFn(report.createdAt)}</span>
          </div>
          <div className="detail-row">
            <span>🔖 স্ট্যাটাস:</span>
            <span className={`status-badge ${report.status}`}>
              {getReportStatusLabel(report.status)}
            </span>
          </div>
          {report.screenshot && (
            <div className="detail-row screenshot-row">
              <span>🖼️ স্ক্রিনশট:</span>
              <img 
                src={report.screenshot} 
                alt="Screenshot" 
                className="report-screenshot" 
                onClick={() => window.open(report.screenshot, '_blank')} 
              />
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          {report.status === 'pending' && (
            <>
              <button className="btn btn-success" onClick={handleResolve}>
                ✅ সমাধান করুন
              </button>
              <button className="btn btn-danger" onClick={handleCancel}>
                ❌ বাতিল করুন
              </button>
            </>
          )}
          <button className="btn btn-secondary" onClick={onClose}>বন্ধ করুন</button>
        </div>
      </div>
    </div>
  );
};

export default ReportDetailModal;