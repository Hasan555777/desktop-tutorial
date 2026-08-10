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
import './UsersTable.css';
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
  onFullAccess, // ✅ NEW — opens UserFullAccessModal (wallet/deals/posts)
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
    <div className="users-table">
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
              <tr key={user.id} className={isBlocked ? 'banned' : ''}>
                <td>
                  <span className="user-id">{getUserShortId(user)}</span>
                </td>
                <td>
                  <div className="user-name">
                    {user.photoURL && <img src={user.photoURL} alt="" className="user-avatar" />}
                    <span>{getUserDisplayName(user)}</span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {getUserRoleLabel(user.role)}
                  </span>
                </td>
                <td>
                  <div className="doc-status">
                    {documentIcons.length > 0 ? (
                      documentIcons.map((icon, index) => (
                        <span key={index} className="doc-check">{icon}</span>
                      ))
                    ) : (
                      <span className="doc-missing">❌</span>
                    )}
                  </div>
                </td>
                <td>
                  {hasFace ? '✅' : '❌'}
                </td>
                <td>
                  {/* ✅ Status with Needs Review Badge */}
                  <div className="status-badges">
                    <span className={`status-badge ${status.className}`}>
                      {status.label}
                    </span>
                    {user.needsReview && (
                      <span className="status-badge needs-review">
                        🔄 Re-review
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="action-buttons">
                    {/* 👁️ View Button */}
                    <button 
                      className="action-btn view" 
                      onClick={() => onViewUser(user)}
                      title="বিস্তারিত দেখুন"
                    >
                      👁️
                    </button>

                    {/* 💰 Full Access Button — wallet + deals + posts */}
                    {onFullAccess && (
                      <button
                        className="action-btn full-access"
                        onClick={() => onFullAccess(user)}
                        title="সম্পূর্ণ এক্সেস (ওয়ালেট, ডিল, পোস্ট)"
                      >
                        💰
                      </button>
                    )}
                    
                    {/* 🛂 Review KYC Button */}
                    {isPendingVerification && !isBlocked && (
                      <button 
                        className="action-btn review" 
                        onClick={() => onReviewVerification(user)}
                        title="KYC Review"
                      >
                        🛂
                      </button>
                    )}
                    
                    {/* ✅ Verify Button */}
                    {isPendingVerification && !isBlocked && (
                      <button 
                        className="action-btn verify" 
                        onClick={() => onVerifyUser(user.id, true)}
                        title="যাচাই করুন"
                      >
                        ✅
                      </button>
                    )}
                    
                    {/* ❌ Unverify Button */}
                    {status.className === 'verified' && !isBlocked && (
                      <button 
                        className="action-btn unverify" 
                        onClick={() => onUnverifyUser(user.id, false)}
                        title="যাচাই বাতিল করুন"
                      >
                        ❌
                      </button>
                    )}
                    
                    {/* 🔒/🔓 Block/Unblock Button */}
                    <button 
                      className={`action-btn ${isBlocked ? 'unblock' : 'block'}`} 
                      onClick={() => onToggleBlock(user.id, !isBlocked)}
                      title={isBlocked ? 'আনব্লক করুন' : 'ব্লক করুন'}
                    >
                      {isBlocked ? '🔓' : '🔒'}
                    </button>
                    
                    {/* 🗑️ Delete Button */}
                    <button 
                      className="action-btn delete" 
                      onClick={() => onDeleteUser(user.id)}
                      title="ডিলিট করুন"
                    >
                      🗑️
                    </button>

                    {/* 🔑 Emergency Unlock Button */}
                    <button 
                      className="action-btn emergency-unlock" 
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