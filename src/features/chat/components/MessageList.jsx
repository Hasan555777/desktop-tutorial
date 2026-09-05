// src/pages/components/MessageList.jsx

import React, { useRef, useEffect } from 'react';
import { formatTime, AUTO_IMAGE_CAPTION } from '../chatHelpers';
import { getChatDocumentOpenUrl } from '../services/chatAttachments';
import VoiceMessageBubble from './VoiceMessageBubble';
import styles from './MessageList.module.css';

// 🔧 ADD (read-receipt tracking): a message I sent counts as "read"
// once the other participant's lastRead timestamp (see
// useChatMessages.js's markChatAsRead) is at or after this message's
// createdAt time.
const isMessageReadByOther = (msg, otherPartyLastReadMs) => {
  if (!otherPartyLastReadMs) return false;
  const createdMs = msg.createdAt?.toMillis?.() ?? (msg.createdAt?.seconds ? msg.createdAt.seconds * 1000 : null);
  if (!createdMs) return false;
  return otherPartyLastReadMs >= createdMs;
};

export const MessageList = ({ messages, currentUserId, loading, onContextMenu, onImageClick, otherPartyLastRead }) => {
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
          onContextMenu={(e) => msg.senderId !== 'system' && !msg.deleted && onContextMenu(e, msg)}
        >
          <div className={styles.bubble}>
            {msg.senderId !== currentUserId && msg.senderId !== 'system' && (
              <div className={styles.messageSenderInfo}>
                {msg.senderPhoto ? (
                  <img src={msg.senderPhoto} alt={msg.senderName} className={styles.messageSenderAvatar} />
                ) : (
                  <div className={styles.messageSenderAvatarPlaceholder}>
                    {msg.senderName?.charAt(0) || 'U'}
                  </div>
                )}
                <span className={styles.messageSenderName}>{msg.senderName || 'Unknown'}</span>
              </div>
            )}

            {/* 🔧 FIX (#14 soft-delete UI): show a placeholder instead
                of the real content once deleted */}
            {msg.deleted ? (
              <p className={`${styles.messageText} ${styles.messageDeleted}`}>
                <i className="fa-solid fa-ban"></i> Message deleted
              </p>
            ) : (
              <>
                {/* 🔧 FIX (#15 reply UI): show the referenced message
                    above this one when replyTo is present. */}
                {msg.replyTo && (
                  <div className={styles.messageReplyPreview}>
                    <span className={styles.messageReplySender}>{msg.replyTo.senderName}</span>
                    <span className={styles.messageReplyText}>{msg.replyTo.text}</span>
                  </div>
                )}

                {msg.imageUrl && (
                  <div className={styles.messageImageContainer}>
                    <img src={msg.imageUrl} alt="Shared" className={styles.chatImage} onClick={() => onImageClick(msg.imageUrl)} />
                  </div>
                )}

                {/* 🔧 ADD (#17 documents) / 🔧 FIX (#10 can't open):
                    see getChatDocumentOpenUrl in chatAttachments.js —
                    forces Cloudinary to send the file back as a real
                    attachment with its original name instead of
                    leaving the browser to guess. */}
                {msg.documentUrl && (
                  <a
                    href={getChatDocumentOpenUrl(msg.documentUrl, msg.documentName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.messageDocument}
                  >
                    <i className="fa-solid fa-file-lines"></i>
                    <span className={styles.messageDocumentName}>{msg.documentName || 'Document'}</span>
                    <i className={`fa-solid fa-arrow-down-to-line ${styles.messageDocumentDownload}`}></i>
                  </a>
                )}

                {/* 🔧 ADD (#16 voice messages) */}
                {msg.audioUrl && (
                  <VoiceMessageBubble url={msg.audioUrl} duration={msg.audioDuration} />
                )}

                {msg.text && msg.text !== AUTO_IMAGE_CAPTION && !msg.documentUrl && !msg.audioUrl && (
                  <p className={styles.messageText}>{msg.text}</p>
                )}
              </>
            )}
            <span className={styles.messageTime}>
              {formatTime(msg.createdAt)}
              {/* 🔧 FIX (#11 edit UI): edited messages should be
                  visibly identifiable. */}
              {msg.edited && !msg.deleted && <span className={styles.messageEditedTag}> · Edited</span>}
              {/* 🔧 ADD (read-receipt tracking): single check = sent,
                  double blue check = the other participant has opened
                  this chat since this message was sent. */}
              {msg.senderId === currentUserId && msg.senderId !== 'system' && !msg.deleted && (
                <span className={styles.messageReadStatus}>
                  {isMessageReadByOther(msg, otherPartyLastRead) ? (
                    <i className={`fa-solid fa-check-double ${styles.messageReadStatusRead}`}></i>
                  ) : (
                    <i className="fa-solid fa-check"></i>
                  )}
                </span>
              )}
            </span>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;