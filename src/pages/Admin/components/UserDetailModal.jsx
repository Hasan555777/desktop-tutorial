// src/pages/Admin/components/UserDetailModal.jsx

import React, { useState, useEffect } from 'react';
import { formatDate, getUserDisplayName, getUserShortId, getUserRoleLabel } from '../utils/adminUtils';
import styles from './UserDetailModal.module.css';

// ============================================================
// 🎯 USER DETAIL MODAL COMPONENT
// ============================================================

const UserDetailModal = ({ 
  user, 
  onClose, 
  onVerify, 
  onToggleBlock,
  onSaveReview,
  formatDate: formatDateFn = formatDate 
}) => {
  // ── State ──
  const [faceReview, setFaceReview] = useState({
    status: 'pending',
    reason: ''
  });

  const [documentReview, setDocumentReview] = useState({
    nidFront: {
      status: 'pending',
      reason: ''
    },
    nidBack: {
      status: 'pending',
      reason: ''
    },
    birthCert: {
      status: 'pending',
      reason: ''
    }
  });

  // ── Load user data when user changes ──
  useEffect(() => {
    if (!user) return;

    setFaceReview({
      status: user.faceStatus || 'pending',
      reason: user.faceRejectReason || ''
    });

    setDocumentReview({
      nidFront: {
        status: user.documents?.nidFront?.status || 'pending',
        reason: user.documents?.nidFront?.rejectReason || ''
      },
      nidBack: {
        status: user.documents?.nidBack?.status || 'pending',
        reason: user.documents?.nidBack?.rejectReason || ''
      },
      birthCert: {
        status: user.documents?.birthCert?.status || 'pending',
        reason: user.documents?.birthCert?.rejectReason || ''
      }
    });
  }, [user]);

  // ── Handle Save Review ──
  const handleSaveReview = () => {
    const hasInvalidReject = 
      (faceReview.status === 'rejected' && !faceReview.reason.trim()) ||
      (documentReview.nidFront.status === 'rejected' && !documentReview.nidFront.reason.trim()) ||
      (documentReview.nidBack.status === 'rejected' && !documentReview.nidBack.reason.trim()) ||
      (documentReview.birthCert.status === 'rejected' && !documentReview.birthCert.reason.trim());

    if (hasInvalidReject) {
      alert('Please provide a reason for all rejected items.');
      return;
    }

    if (onSaveReview) {
      onSaveReview(
        user.id,
        faceReview,
        documentReview
      );
    }
  };

  if (!user) return null;

  // ── Helper: Render Review Section ──
  const renderReviewSection = (title, icon, imageUrl, status, reason, onStatusChange, onReasonChange, type) => {
    const statusLabels = {
      pending: '⏳ Pending',
      approved: '✅ Approved',
      rejected: '❌ Rejected'
    };

    return (
      <div className={styles.reviewSection}>
        <div className={styles.reviewSectionHeader}>
          <span className={styles.sectionIcon}>{icon}</span>
          <h4>{title}</h4>
          <span className={`${styles.sectionStatus} ${styles[status]}`}>
            {statusLabels[status] || status}
          </span>
        </div>

        <div className={styles.reviewSectionBody}>
          {imageUrl ? (
            <div className={styles.reviewImageContainer}>
              <img 
                src={imageUrl} 
                alt={title} 
                className={styles.reviewImage}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/300x200?text=No+Image';
                }}
              />
            </div>
          ) : (
            <div className={styles.reviewImagePlaceholder}>
              <span>📷</span>
              <p>No {title} uploaded</p>
            </div>
          )}

          <div className={styles.reviewActions}>
            <button
              className={`${styles.reviewBtn} ${styles.approve} ${status === 'approved' ? styles.active : ''}`}
              onClick={() => onStatusChange('approved', '')}
            >
              ✅ Approve
            </button>
            <button
              className={`${styles.reviewBtn} ${styles.reject} ${status === 'rejected' ? styles.active : ''}`}
              onClick={() => onStatusChange('rejected', '')}
            >
              ❌ Reject
            </button>
          </div>

          {status === 'rejected' && (
            <div className={styles.rejectReasonBox}>
              <label htmlFor={`reason-${type}`}>Reject Reason <span className={styles.required}>*</span></label>
              <textarea
                id={`reason-${type}`}
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Why did you reject this item?"
                rows={3}
                className={styles.rejectReasonInput}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Handle status change ──
  const handleFaceStatusChange = (status, reason) => {
    setFaceReview({ status, reason: reason || '' });
  };

  const handleDocumentStatusChange = (docType, status, reason) => {
    setDocumentReview(prev => ({
      ...prev,
      [docType]: {
        ...prev[docType],
        status,
        reason: reason || ''
      }
    }));
  };

  // ── Render ──
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modalContent} ${styles.userDetailModal}`} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderLeft}>
            <span className={styles.modalIcon}>👤</span>
            <h3>User Details & Review</h3>
            <span className={`${styles.userStatusBadge} ${user.isVerified ? styles.verified : styles.pending}`}>
              {user.isVerified ? '✅ Verified' : '⏳ Pending'}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className={styles.modalBody}>
          {/* User Info */}
          <div className={styles.userInfoGrid}>
            <div className={styles.userInfoItem}>
              <span className={styles.label}>ID</span>
              <span className={styles.value}>{getUserShortId(user)}</span>
            </div>
            <div className={styles.userInfoItem}>
              <span className={styles.label}>Name</span>
              <span className={styles.value}>{getUserDisplayName(user)}</span>
            </div>
            <div className={styles.userInfoItem}>
              <span className={styles.label}>Email</span>
              <span className={styles.value}>{user.email}</span>
            </div>
            <div className={styles.userInfoItem}>
              <span className={styles.label}>Phone</span>
              <span className={styles.value}>{user.phone || 'N/A'}</span>
            </div>
            <div className={styles.userInfoItem}>
              <span className={styles.label}>Role</span>
              <span className={`${styles.roleBadge} ${styles[user.role]}`}>
                {getUserRoleLabel(user.role)}
              </span>
            </div>
            <div className={styles.userInfoItem}>
              <span className={styles.label}>Joined</span>
              <span className={styles.value}>{formatDateFn(user.createdAt)}</span>
            </div>
          </div>

          {/* ── Review Sections ── */}
          <div className={styles.reviewSections}>
            <h4 className={styles.reviewSectionsTitle}>📋 Verification Review</h4>

            {/* Face */}
            {renderReviewSection(
              'Face Verification',
              '📸',
              user.facePhotoUrl,
              faceReview.status,
              faceReview.reason,
              (status, reason) => handleFaceStatusChange(status, reason),
              (reason) => setFaceReview(prev => ({ ...prev, reason })),
              'face'
            )}

            {/* NID Front */}
            {renderReviewSection(
              'NID Front',
              '🪪',
              user.documents?.nidFront?.url,
              documentReview.nidFront.status,
              documentReview.nidFront.reason,
              (status, reason) => handleDocumentStatusChange('nidFront', status, reason),
              (reason) => setDocumentReview(prev => ({
                ...prev,
                nidFront: { ...prev.nidFront, reason }
              })),
              'nidFront'
            )}

            {/* NID Back */}
            {renderReviewSection(
              'NID Back',
              '🔄',
              user.documents?.nidBack?.url,
              documentReview.nidBack.status,
              documentReview.nidBack.reason,
              (status, reason) => handleDocumentStatusChange('nidBack', status, reason),
              (reason) => setDocumentReview(prev => ({
                ...prev,
                nidBack: { ...prev.nidBack, reason }
              })),
              'nidBack'
            )}

            {/* Birth Certificate */}
            {renderReviewSection(
              'Birth Certificate',
              '📄',
              user.documents?.birthCert?.url,
              documentReview.birthCert.status,
              documentReview.birthCert.reason,
              (status, reason) => handleDocumentStatusChange('birthCert', status, reason),
              (reason) => setDocumentReview(prev => ({
                ...prev,
                birthCert: { ...prev.birthCert, reason }
              })),
              'birthCert'
            )}
          </div>

          {/* ── Status Summary ── */}
          <div className={styles.reviewSummary}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Face</span>
              <span className={`${styles.summaryStatus} ${styles[faceReview.status]}`}>
                {faceReview.status === 'approved' ? '✅' : faceReview.status === 'rejected' ? '❌' : '⏳'}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>NID Front</span>
              <span className={`${styles.summaryStatus} ${styles[documentReview.nidFront.status]}`}>
                {documentReview.nidFront.status === 'approved' ? '✅' : documentReview.nidFront.status === 'rejected' ? '❌' : '⏳'}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>NID Back</span>
              <span className={`${styles.summaryStatus} ${styles[documentReview.nidBack.status]}`}>
                {documentReview.nidBack.status === 'approved' ? '✅' : documentReview.nidBack.status === 'rejected' ? '❌' : '⏳'}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Birth Cert</span>
              <span className={`${styles.summaryStatus} ${styles[documentReview.birthCert.status]}`}>
                {documentReview.birthCert.status === 'approved' ? '✅' : documentReview.birthCert.status === 'rejected' ? '❌' : '⏳'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className={styles.modalFooter}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>
            Close
          </button>
          <button 
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSaveReview}`}
            onClick={handleSaveReview}
          >
            💾 Save Review
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserDetailModal;