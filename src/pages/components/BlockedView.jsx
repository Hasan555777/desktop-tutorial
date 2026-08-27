// src/pages/components/BlockedView.jsx
import React from 'react';

export const BlockedView = ({ isBlocked, blockedBy, currentUser, targetUserInfo, onBack, onUnblock, isActiveDeal }) => {
  const isBlocker = blockedBy === currentUser?.uid;

  return (
    <div className="chat-container chat-interface-blocked">
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        {targetUserInfo.photoURL ? (
          <img src={targetUserInfo.photoURL} alt={targetUserInfo.displayName} className="user-avatar" />
        ) : (
          <div className="user-avatar-placeholder">{targetUserInfo.displayName?.charAt(0) || 'U'}</div>
        )}
        <div className="user-info">
          <h3>{targetUserInfo.displayName || 'Unknown User'}</h3>
          <span className="blocked-status">
            <i className="fa-solid fa-lock"></i> {isBlocker ? 'Blocked' : 'Blocked You'}
          </span>
        </div>
      </div>
      <div className="blocked-message-area">
        <i className="fa-solid fa-ban"></i>
        <p>{isBlocker ? 'You have blocked this user.' : 'You have been blocked by this user.'}</p>
        {isBlocker && (
          <>
            {isActiveDeal ? (
              <p className="deal-warning">⚠️ Cannot unblock while active deal exists.</p>
            ) : (
              <button className="unblock-btn" onClick={onUnblock}>
                <i className="fa-solid fa-unlock"></i> Unblock User
              </button>
            )}
          </>
        )}
        {!isBlocker && (
          <p className="blocked-sub-text">You cannot send messages to this user.</p>
        )}
      </div>
    </div>
  );
};

export default BlockedView;
