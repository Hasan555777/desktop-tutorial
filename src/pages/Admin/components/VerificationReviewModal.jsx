// src/pages/Admin/components/VerificationReviewModal.jsx

import React, { useState, useEffect } from 'react';
import './VerificationReviewModal.css';

const VerificationReviewModal = ({
    user,
    onClose,
    onSave,
    formatDate
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
        // Validation: Rejected items must have reason
        const hasInvalidReject = 
            (faceReview.status === 'rejected' && !faceReview.reason.trim()) ||
            (documentReview.nidFront.status === 'rejected' && !documentReview.nidFront.reason.trim()) ||
            (documentReview.nidBack.status === 'rejected' && !documentReview.nidBack.reason.trim()) ||
            (documentReview.birthCert.status === 'rejected' && !documentReview.birthCert.reason.trim());

        if (hasInvalidReject) {
            alert('Please provide a reason for all rejected items.');
            return;
        }

        if (onSave) {
            onSave(user.id, faceReview, documentReview);
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
            <div className="review-section">
                <div className="review-section-header">
                    <span className="section-icon">{icon}</span>
                    <h4>{title}</h4>
                    <span className={`section-status ${status}`}>
                        {statusLabels[status] || status}
                    </span>
                </div>

                <div className="review-section-body">
                    {imageUrl ? (
                        <div className="review-image-container">
                            <img 
                                src={imageUrl} 
                                alt={title} 
                                className="review-image"
                                onError={(e) => {
                                    e.target.src = 'https://via.placeholder.com/300x200?text=No+Image';
                                }}
                            />
                        </div>
                    ) : (
                        <div className="review-image-placeholder">
                            <span>📷</span>
                            <p>No {title} uploaded</p>
                        </div>
                    )}

                    <div className="review-actions">
                        <button
                            className={`review-btn approve ${status === 'approved' ? 'active' : ''}`}
                            onClick={() => onStatusChange('approved', '')}
                        >
                            ✅ Approve
                        </button>
                        <button
                            className={`review-btn reject ${status === 'rejected' ? 'active' : ''}`}
                            onClick={() => onStatusChange('rejected', '')}
                        >
                            ❌ Reject
                        </button>
                    </div>

                    {status === 'rejected' && (
                        <div className="reject-reason-box">
                            <label htmlFor={`reason-${type}`}>Reject Reason <span className="required">*</span></label>
                            <textarea
                                id={`reason-${type}`}
                                value={reason}
                                onChange={(e) => onReasonChange(e.target.value)}
                                placeholder="Why did you reject this item?"
                                rows={3}
                                className="reject-reason-input"
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
        <div className="verification-review-overlay" onClick={onClose}>
            <div className="verification-review-modal" onClick={(e) => e.stopPropagation()}>
                {/* ── Header ── */}
                <div className="verification-review-header">
                    <div className="header-left">
                        <span className="header-icon">🛂</span>
                        <h2>Verification Review</h2>
                        <span className={`header-status ${user.verificationStatus || 'pending'}`}>
                            {user.verificationStatus === 'verified' ? '✅ Verified' : 
                             user.verificationStatus === 'rejected' ? '❌ Rejected' : 
                             user.verificationStatus === 'pending' ? '⏳ Pending' : '📋 Incomplete'}
                        </span>
                    </div>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                {/* ── Body ── */}
                <div className="verification-review-body">
                    {/* User Info */}
                    <div className="user-info-section">
                        <div className="user-avatar-large">
                            {user.photoURL ? (
                                <img src={user.photoURL} alt={user.displayName} />
                            ) : (
                                <span className="avatar-placeholder">
                                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className="user-details">
                            <h3>{user.displayName || user.email || 'Unknown User'}</h3>
                            <p className="user-email">{user.email || 'No email'}</p>
                            <span className={`role-badge ${user.role || 'client'}`}>
                                {(user.role || 'client').charAt(0).toUpperCase() + (user.role || 'client').slice(1)}
                            </span>
                        </div>
                    </div>

                    {/* ── Review Sections ── */}
                    <div className="review-sections">
                        <h4 className="review-sections-title">📋 Verification Review</h4>

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
                    <div className="review-summary">
                        <div className="summary-item">
                            <span className="summary-label">Face</span>
                            <span className={`summary-status ${faceReview.status}`}>
                                {faceReview.status === 'approved' ? '✅' : faceReview.status === 'rejected' ? '❌' : '⏳'}
                            </span>
                        </div>
                        <div className="summary-item">
                            <span className="summary-label">NID Front</span>
                            <span className={`summary-status ${documentReview.nidFront.status}`}>
                                {documentReview.nidFront.status === 'approved' ? '✅' : documentReview.nidFront.status === 'rejected' ? '❌' : '⏳'}
                            </span>
                        </div>
                        <div className="summary-item">
                            <span className="summary-label">NID Back</span>
                            <span className={`summary-status ${documentReview.nidBack.status}`}>
                                {documentReview.nidBack.status === 'approved' ? '✅' : documentReview.nidBack.status === 'rejected' ? '❌' : '⏳'}
                            </span>
                        </div>
                        <div className="summary-item">
                            <span className="summary-label">Birth Cert</span>
                            <span className={`summary-status ${documentReview.birthCert.status}`}>
                                {documentReview.birthCert.status === 'approved' ? '✅' : documentReview.birthCert.status === 'rejected' ? '❌' : '⏳'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="verification-review-footer">
                    <button className="btn-close" onClick={onClose}>
                        Close
                    </button>
                    <button 
                        className="btn-save-review"
                        onClick={handleSaveReview}
                    >
                        💾 Save Review
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VerificationReviewModal;