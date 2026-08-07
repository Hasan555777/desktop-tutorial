import React from 'react';

export const ChatHeader = ({ targetUserInfo, otherPartyInfo, onBack, isActiveDeal }) => {
  return (
    <div className="chat-header">
      <button className="back-btn" onClick={onBack}>
        <i className="fa-solid fa-arrow-left"></i>
      </button>
      
      <div className="chat-user-info">
        <div className="user-avatar-wrapper">
          {targetUserInfo.photoURL ? (
            <img 
              src={targetUserInfo.photoURL} 
              alt={targetUserInfo.displayName} 
              className="user-avatar" 
              onError={(e) => {
                e.target.style.display = 'none';
                const parent = e.target.parentElement;
                if (parent) {
                  const placeholder = parent.querySelector('.user-avatar-placeholder');
                  if (placeholder) placeholder.style.display = 'flex';
                }
              }}
            />
          ) : (
            <div className="user-avatar-placeholder">
              {targetUserInfo.displayName?.charAt(0)?.toUpperCase() || 
               otherPartyInfo.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          )}
          <span className={`online-status-dot ${targetUserInfo.isOnline ? 'online' : 'offline'}`}></span>
        </div>
        
        <div className="user-details">
          <h3>{targetUserInfo.displayName || otherPartyInfo.name || 'Unknown User'}</h3>
          <div className="user-status-text">
            {targetUserInfo.isOnline ? (
              <span className="status-text online"><i className="fa-solid fa-circle"></i> Online</span>
            ) : (
              <span className="status-text offline">
                <i className="fa-regular fa-circle"></i> {targetUserInfo.lastSeenFormatted || 'Offline'}
              </span>
            )}
            {isActiveDeal && <span className="deal-status-badge">⚡ Active Deal</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;  // ✅ default export
