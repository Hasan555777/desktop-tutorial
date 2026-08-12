// ChatInterfaceViews.jsx
// Merged from: MessageList.jsx, ChatInput.jsx, BlockedView.jsx — the three
// main content-area pieces ChatInterface.jsx swaps between. Kept separate
// from ChatOverlays.jsx since these render the primary view, not popups.

import React, { useRef, useEffect } from 'react';
import { formatTime } from '../chatHelpers';

// ============================================================
// MessageList
// ============================================================
export const MessageList = ({ messages, currentUserId, loading, onContextMenu, onImageClick }) => {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!loading && messagesEndRef.current) {
      setTimeout(() => messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
    }
  }, [messages, loading]);

  if (messages.length === 0) {
    return (
      <div className="chat-messages">
        <div className="empty-messages">
          <i className="fa-solid fa-comment-dots"></i>
          <p>No messages yet</p>
        </div>
        <div ref={messagesEndRef} />
      </div>
    );
  }

  return (
    <div className="chat-messages">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`message ${msg.senderId === currentUserId ? 'sent' : msg.sender === 'system' ? 'system' : 'received'}`}
          onContextMenu={(e) => msg.senderId !== 'system' && onContextMenu(e, msg)}
        >
          <div className="bubble">
            {msg.senderId !== currentUserId && msg.senderId !== 'system' && (
              <div className="message-sender-info">
                {msg.senderPhoto ? (
                  <img src={msg.senderPhoto} alt={msg.senderName} className="message-sender-avatar" />
                ) : (
                  <div className="message-sender-avatar-placeholder">{msg.senderName?.charAt(0) || 'U'}</div>
                )}
                <span className="message-sender-name">{msg.senderName || 'Unknown'}</span>
              </div>
            )}

            {msg.imageUrl && (
              <div className="message-image-container">
                <img src={msg.imageUrl} alt="Shared" className="chat-image" onClick={() => onImageClick(msg.imageUrl)} />
              </div>
            )}
            {msg.text && msg.text !== '📷 Shared an image' && <p className="message-text">{msg.text}</p>}
            <span className="message-time">{formatTime(msg.createdAt)}</span>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

// ============================================================
// ChatInput
// ============================================================
export const ChatInput = ({
  message,
  setMessage,
  onSend,
  onKeyDown,
  onFileUpload,
  fileInputRef,
  isBlocked,
  blockedBy,
  uploading,
  inputRef,
}) => {
  const isDisabled = isBlocked || blockedBy || uploading;

  return (
    <div className="chat-input-area">
      <input type="file" ref={fileInputRef} id="fileInput" hidden accept="image/*" onChange={onFileUpload} />
      <label htmlFor="fileInput" className="attach-btn">
        {uploading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paperclip"></i>}
      </label>
      <input
        ref={inputRef}
        type="text"
        className="chat-input"
        placeholder={isDisabled ? '🔒 Chat locked' : 'Type your message...'}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={isDisabled}
      />
      <button className="sendd-btn" onClick={() => onSend()} disabled={!message.trim() || isDisabled}>
        <i className="fa-solid fa-paper-plane"></i>
      </button>
    </div>
  );
};

// ============================================================
// BlockedView
// ============================================================
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
        {!isBlocker && <p className="blocked-sub-text">You cannot send messages to this user.</p>}
      </div>
    </div>
  );
};
