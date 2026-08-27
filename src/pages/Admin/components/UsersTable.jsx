// src/pages/Admin/components/UsersTable.jsx
//
// ✅ ADDED: "Full Access" button (💰) — opens UserFullAccessModal via the new
// `onFullAccess` prop, giving admin full control over this user's wallet,
// deals, and posts. Everything else in this file is unchanged.

import React from 'react';
import { 
  getUserStatus, 
  getUserShortId, 
  getUserDisplayName, 
  getUserRoleLabel,
  hasUserDocuments,
  hasFacePhoto,
  getUserDocumentIcons
} from '../utils/adminUtils';
import { emergencyUnlockUser } from '@/firebase/adminFunctions';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import styles from './UsersTable.module.css';

// ============================================================
// 🎯 USERS TABLE COMPONENT
// ============================================================

const UsersTable = ({ 
  users, 
  onViewUser, 
  onVerifyUser, 
  onUnverifyUser,
  onToggleBlock, 
  onDeleteUser,
  onReviewVerification,
  onFullAccess,
}) => {
  const feedback = useFeedback();

  // ============================================================
  // ✅ Emergency Unlock Handler
  // ============================================================
  const handleEmergencyUnlock = async (userId, userEmail) => {
    const confirmed = await feedback.confirm({
      title: '🔑 ইমার্জেন্সি আনলক',
      message: `এই ইউজারের (${userEmail || userId}) App Lock ইমার্জেন্সি আনলক করবেন? এটি ১০ মিনিটের জন্য সক্রিয় থাকবে।`,
      variant: 'warning',
      confirmText: 'হ্যাঁ, আনলক করুন',
      cancelText: 'বাতিল করুন'
    });

    if (!confirmed) return;

    try {
      const result = await emergencyUnlockUser(userId);
      if (result.success) {
        feedback.showSuccess('✅ সফল', `ইমার্জেন্সি আনলক সক্রিয় করা হয়েছে! ${result.remainingMinutes} মিনিট সময় আছে।`);
      } else {
        feedback.showError('❌ ব্যর্থ', result.error);
      }
    } catch (error) {
      console.error('Emergency unlock error:', error);
      feedback.showError('❌ ব্যর্থ', 'ইমার্জেন্সি আনলক করতে সমস্যা হয়েছে');
    }
  };

  return (
    <div className={styles.usersTable}>
      <table>
        <thead>
          <tr>
            <th>আইডি</th>
            <th>নাম</th>
            <th>ইমেইল</th>
            <th>রোল</th>
            <th>ডকুমেন্ট</th>
            <th>ফেস</th>
            <th>স্ট্যাটাস</th>
            <th>অ্যাকশন</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const status = getUserStatus(user);
            const isBlocked = user.isBanned || user.isBlocked;
            const documentIcons = getUserDocumentIcons(user);
            const hasFace = hasFacePhoto(user);
            const isPendingVerification = status.className === 'pending_verification' || 
                                          status.className === 'pending' || 
                                          status.className === 'incomplete';
            
            return (
              <tr key={user.id} className={isBlocked ? styles.banned : ''}>
                <td>
                  <span className={styles.userId}>{getUserShortId(user)}</span>
                </td>
                <td>
                  <div className={styles.userName}>
                    {user.photoURL && <img src={user.photoURL} alt="" className={styles.userAvatar} />}
                    <span>{getUserDisplayName(user)}</span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`${styles.roleBadge} ${styles[user.role]}`}>
                    {getUserRoleLabel(user.role)}
                  </span>
                </td>
                <td>
                  <div className={styles.docStatus}>
                    {documentIcons.length > 0 ? (
                      documentIcons.map((icon, index) => (
                        <span key={index} className={styles.docCheck}>{icon}</span>
                      ))
                    ) : (
                      <span className={styles.docMissing}>❌</span>
                    )}
                  </div>
                </td>
                <td>
                  {hasFace ? '✅' : '❌'}
                </td>
                <td>
                  <div className={styles.statusBadges}>
                    <span className={`${styles.statusBadge} ${styles[status.className]}`}>
                      {status.label}
                    </span>
                    {user.needsReview && (
                      <span className={`${styles.statusBadge} ${styles.needsReview}`}>
                        🔄 Re-review
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div className={styles.actionButtons}>
                    {/* 👁️ View Button */}
                    <button 
                      className={`${styles.actionBtn} ${styles.view}`} 
                      onClick={() => onViewUser(user)}
                      title="বিস্তারিত দেখুন"
                    >
                      👁️
                    </button>

                    {/* 💰 Full Access Button */}
                    {onFullAccess && (
                      <button
                        className={`${styles.actionBtn} ${styles.fullAccess}`}
                        onClick={() => onFullAccess(user)}
                        title="সম্পূর্ণ এক্সেস (ওয়ালেট, ডিল, পোস্ট)"
                      >
                        💰
                      </button>
                    )}
                    
                    {/* 🛂 Review KYC Button */}
                    {isPendingVerification && !isBlocked && (
                      <button 
                        className={`${styles.actionBtn} ${styles.review}`} 
                        onClick={() => onReviewVerification(user)}
                        title="KYC Review"
                      >
                        🛂
                      </button>
                    )}
                    
                    {/* ✅ Verify Button */}
                    {isPendingVerification && !isBlocked && (
                      <button 
                        className={`${styles.actionBtn} ${styles.verify}`} 
                        onClick={() => onVerifyUser(user.id, true)}
                        title="যাচাই করুন"
                      >
                        ✅
                      </button>
                    )}
                    
                    {/* ❌ Unverify Button */}
                    {status.className === 'verified' && !isBlocked && (
                      <button 
                        className={`${styles.actionBtn} ${styles.unverify}`} 
                        onClick={() => onUnverifyUser(user.id, false)}
                        title="যাচাই বাতিল করুন"
                      >
                        ❌
                      </button>
                    )}
                    
                    {/* 🔒/🔓 Block/Unblock Button */}
                    <button 
                      className={`${styles.actionBtn} ${isBlocked ? styles.unblock : styles.block}`} 
                      onClick={() => onToggleBlock(user.id, !isBlocked)}
                      title={isBlocked ? 'আনব্লক করুন' : 'ব্লক করুন'}
                    >
                      {isBlocked ? '🔓' : '🔒'}
                    </button>
                    
                    {/* 🗑️ Delete Button */}
                    <button 
                      className={`${styles.actionBtn} ${styles.delete}`} 
                      onClick={() => onDeleteUser(user.id)}
                      title="ডিলিট করুন"
                    >
                      🗑️
                    </button>

                    {/* 🔑 Emergency Unlock Button */}
                    <button 
                      className={`${styles.actionBtn} ${styles.emergencyUnlock}`} 
                      onClick={() => handleEmergencyUnlock(user.id, user.email)}
                      title="ইমার্জেন্সি আনলক (১০ মিনিট)"
                    >
                      🔑
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default UsersTable;