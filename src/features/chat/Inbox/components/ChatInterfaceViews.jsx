// ChatInterfaceViews.jsx
// Merged from: MessageList.jsx, ChatInput.jsx, BlockedView.jsx — the three
// main content-area pieces ChatInterface.jsx swaps between. Kept separate
// from ChatOverlays.jsx since these render the primary view, not popups.

import React, { useRef, useEffect } from 'react';
import { formatTime } from '../../chatHelpers';
import styles from './ChatInterfaceViews.module.css';

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
      <div className={styles.chatMessages}>
        <div className={styles.emptyMessages}>
          <i className="fa-solid fa-comment-dots"></i>
          <p>No messages yet</p>
        </div>
        <div ref={messagesEndRef} />
      </div>
    );
  }

  return (
    <div className={styles.chatMessages}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`${styles.message} ${msg.senderId === currentUserId ? styles.sent : msg.sender === 'system' ? styles.system : styles.received}`}
          onContextMenu={(e) => msg.senderId !== 'system' && onContextMenu(e, msg)}
        >
          <div className={styles.bubble}>
            {msg.senderId !== currentUserId && msg.senderId !== 'system' && (
              <div className={styles.messageSenderInfo}>
                {msg.senderPhoto ? (
                  <img src={msg.senderPhoto} alt={msg.senderName} className={styles.messageSenderAvatar} />
                ) : (
                  <div className={styles.messageSenderAvatarPlaceholder}>{msg.senderName?.charAt(0) || 'U'}</div>
                )}
                <span className={styles.messageSenderName}>{msg.senderName || 'Unknown'}</span>
              </div>
            )}

            {msg.imageUrl && (
              <div className={styles.messageImageContainer}>
                <img src={msg.imageUrl} alt="Shared" className={styles.chatImage} onClick={() => onImageClick(msg.imageUrl)} />
              </div>
            )}
            {msg.text && msg.text !== '📷 Shared an image' && <p className={styles.messageText}>{msg.text}</p>}
            <span className={styles.messageTime}>{formatTime(msg.createdAt)}</span>
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
    <div className={styles.chatInputArea}>
      <input type="file" ref={fileInputRef} id="fileInput" hidden accept="image/*" onChange={onFileUpload} />
      <label htmlFor="fileInput" className={styles.attachBtn}>
        {uploading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paperclip"></i>}
      </label>
      <input
        ref={inputRef}
        type="text"
        className={styles.chatInput}
        placeholder={isDisabled ? '🔒 Chat locked' : 'Type your message...'}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={isDisabled}
      />
      <button className={styles.sendBtn} onClick={() => onSend()} disabled={!message.trim() || isDisabled}>
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
        {!isBlocker && <p className={styles.blockedSubText}>You cannot send messages to this user.</p>}
      </div>
    </div>
  );
};