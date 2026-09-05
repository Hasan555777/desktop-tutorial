// src/pages/Admin/components/VerificationReviewModal.jsx

import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../shared/firebase/index';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import styles from './VerificationReviewModal.module.css';

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

    const feedback = useFeedback();

    // 🔧 FIX (identity DB check - stale review data): AdminDashboard's
    // user list (useAdminData.js's loadUsers) is a one-time getDocs()
    // fetch, not a live onSnapshot listener — so if a user resubmitted
    // documents any time after the admin's dashboard was last loaded/
    // refreshed, this modal would show their OLD document images/
    // status, and the admin's approve/reject decision would be made
    // looking at outdated documents. saveVerificationReview() itself
    // does re-fetch fresh data before writing, but that only protects
    // the SAVE step — the admin's actual judgment call happens here,
    // looking at whatever's rendered. Re-fetching this specific user
    // fresh every time the modal opens closes that gap.
    const [freshUser, setFreshUser] = useState(user);

    useEffect(() => {
        if (!user?.id) {
            setFreshUser(user);
            return;
        }
        let cancelled = false;
        setFreshUser(user); // show what we have immediately, don't block on network
        getDoc(doc(db, 'users', user.id)).then(snap => {
            if (!cancelled && snap.exists()) {
                setFreshUser({ id: snap.id, ...snap.data() });
            }
        }).catch(err => console.error('Failed to fetch fresh user data for review:', err));
        return () => { cancelled = true; };
    }, [user?.id]);

    // ── Load user data when user changes ──
    useEffect(() => {
        if (!freshUser) return;

        setFaceReview({
            status: freshUser.faceStatus || 'pending',
            reason: freshUser.faceRejectReason || ''
        });

        setDocumentReview({
            nidFront: {
                status: freshUser.documents?.nidFront?.status || 'pending',
                reason: freshUser.documents?.nidFront?.rejectReason || ''
            },
            nidBack: {
                status: freshUser.documents?.nidBack?.status || 'pending',
                reason: freshUser.documents?.nidBack?.rejectReason || ''
            },
            birthCert: {
                status: freshUser.documents?.birthCert?.status || 'pending',
                reason: freshUser.documents?.birthCert?.rejectReason || ''
            }
        });
    }, [freshUser]);

    // ── Handle Save Review ──
    // 🔧 FIX: same issue as UserDetailModal — `onSave(...)` was called
    // without awaiting anything, so the modal never learned whether the
    // save actually finished, and never closed itself. Now it awaits the
    // result and only closes on a confirmed `true`.
    const [savingReview, setSavingReview] = useState(false);

    const handleSaveReview = async () => {
        const hasInvalidReject = 
            (faceReview.status === 'rejected' && !faceReview.reason.trim()) ||
            (documentReview.nidFront.status === 'rejected' && !documentReview.nidFront.reason.trim()) ||
            (documentReview.nidBack.status === 'rejected' && !documentReview.nidBack.reason.trim()) ||
            (documentReview.birthCert.status === 'rejected' && !documentReview.birthCert.reason.trim());

        if (hasInvalidReject) {
            feedback?.alert.warning({ title: 'Please provide a reason for all rejected items.' });
            return;
        }

        if (!onSave) return;

        setSavingReview(true);
        try {
            const success = await onSave(freshUser.id, faceReview, documentReview);
            if (success) onClose();
        } finally {
            setSavingReview(false);
        }
    };

    if (!freshUser) return null;

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
        <div className={styles.verificationReviewOverlay} onClick={onClose}>
            <div className={styles.verificationReviewModal} onClick={(e) => e.stopPropagation()}>
                {/* ── Header ── */}
                <div className={styles.verificationReviewHeader}>
                    <div className={styles.headerLeft}>
                        <span className={styles.headerIcon}>🛂</span>
                        <h2>Verification Review</h2>
                        <span className={`${styles.headerStatus} ${styles[freshUser.verificationStatus || 'pending']}`}>
                            {freshUser.verificationStatus === 'verified' ? '✅ Verified' : 
                             freshUser.verificationStatus === 'rejected' ? '❌ Rejected' : 
                             freshUser.verificationStatus === 'pending' ? '⏳ Pending' : '📋 Incomplete'}
                        </span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                {/* ── Body ── */}
                <div className={styles.verificationReviewBody}>
                    {/* User Info */}
                    <div className={styles.userInfoSection}>
                        <div className={styles.userAvatarLarge}>
                            {freshUser.photoURL ? (
                                <img src={freshUser.photoURL} alt={freshUser.displayName} />
                            ) : (
                                <span className={styles.avatarPlaceholder}>
                                    {(freshUser.displayName || freshUser.email || 'U').charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div className={styles.userDetails}>
                            <h3>{freshUser.displayName || freshUser.email || 'Unknown User'}</h3>
                            <p className={styles.userEmail}>{freshUser.email || 'No email'}</p>
                            <span className={`${styles.roleBadge} ${styles[freshUser.role || 'client']}`}>
                                {(freshUser.role || 'client').charAt(0).toUpperCase() + (freshUser.role || 'client').slice(1)}
                            </span>
                        </div>
                    </div>

                    {/* ── Review Sections ── */}
                    <div className={styles.reviewSections}>
                        <h4 className={styles.reviewSectionsTitle}>📋 Verification Review</h4>

                        {/* Face */}
                        {renderReviewSection(
                            'Face Verification',
                            '📸',
                            freshUser.facePhotoUrl,
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
                            freshUser.documents?.nidFront?.url,
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
                            freshUser.documents?.nidBack?.url,
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
                            freshUser.documents?.birthCert?.url,
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
                <div className={styles.verificationReviewFooter}>
                    <button className={styles.btnClose} onClick={onClose}>
                        Close
                    </button>
                    <button 
                        className={styles.btnSaveReview}
                        onClick={handleSaveReview}
                        disabled={savingReview}
                    >
                        {savingReview ? '⏳ সংরক্ষণ হচ্ছে...' : '💾 Save Review'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VerificationReviewModal;