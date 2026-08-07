import React, { useRef, useEffect } from 'react';
import { formatTime } from '../chatHelpers';

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
                  <div className="message-sender-avatar-placeholder">
                    {msg.senderName?.charAt(0) || 'U'}
                  </div>
                )}
                <span className="message-sender-name">{msg.senderName || 'Unknown'}</span>
              </div>
            )}
            
            {msg.imageUrl && (
              <div className="message-image-container">
                <img src={msg.imageUrl} alt="Shared" className="chat-image" onClick={() => onImageClick(msg.imageUrl)} />
              </div>
            )}
            {msg.text && msg.text !== "📷 Shared an image" && (
              <p className="message-text">{msg.text}</p>
            )}
            <span className="message-time">{formatTime(msg.createdAt)}</span>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList; 
