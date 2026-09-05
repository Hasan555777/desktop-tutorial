// src/pages/components/BlockedView.jsx

import React from 'react';
import styles from './BlockedView.module.css';

export const BlockedView = ({ isBlocked, blockedBy, currentUser, targetUserInfo, onBack, onUnblock, isActiveDeal }) => {
  const isBlocker = blockedBy === currentUser?.uid;

  return (
    <div className={`${styles.chatContainer} ${styles.chatInterfaceBlocked}`}>
      <div className={styles.chatHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        {targetUserInfo.photoURL ? (
          <img src={targetUserInfo.photoURL} alt={targetUserInfo.displayName} className={styles.userAvatar} />
        ) : (
          <div className={styles.userAvatarPlaceholder}>{targetUserInfo.displayName?.charAt(0) || 'U'}</div>
        )}
        <div className={styles.userInfo}>
          <h3>{targetUserInfo.displayName || 'Unknown User'}</h3>
          <span className={styles.blockedStatus}>
            <i className="fa-solid fa-lock"></i> {isBlocker ? 'Blocked' : 'Blocked You'}
          </span>
        </div>
      </div>
      <div className={styles.blockedMessageArea}>
        <i className="fa-solid fa-ban"></i>
        <p>{isBlocker ? 'You have blocked this user.' : 'You have been blocked by this user.'}</p>
        {isBlocker && (
          <>
            {isActiveDeal ? (
              <p className={styles.dealWarning}>⚠️ Cannot unblock while active deal exists.</p>
            ) : (
              <button className={styles.unblockBtn} onClick={onUnblock}>
                <i className="fa-solid fa-unlock"></i> Unblock User
              </button>
            )}
          </>
        )}
        {!isBlocker && (
          <p className={styles.blockedSubText}>You cannot send messages to this user.</p>
        )}
      </div>
    </div>
  );
};

export default BlockedView;