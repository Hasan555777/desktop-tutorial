import React from 'react';
import './MessageBubble.css';

const MessageBubble = ({ 
  message, 
  type = 'sent', // 'sent' or 'received'
  time, 
  image,
  senderName,
  isRead,
  isEdited,
  onImageClick 
}) => {
  
  // ============================================================
  // ✅ সময় ফরম্যাট
  // ============================================================
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Just now';
    }
  };

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className={`msg-row ${type}`}>
      <div className={`bubble ${type}`}>
        
        {/* সেন্ডারের নাম (received হলে) */}
        {type === 'received' && senderName && (
          <div className="sender-name">{senderName}</div>
        )}
        
        {/* ইমেজ (যদি থাকে) */}
        {image && (
          <div className="message-image" onClick={() => onImageClick && onImageClick(image)}>
            <img 
              src={image} 
              alt="Shared" 
              className="chat-image"
              loading="lazy"
            />
          </div>
        )}
        
        {/* মেসেজ টেক্সট */}
        {message && (
          <div className="message-text">{message}</div>
        )}
        
        {/* সময় + স্ট্যাটাস */}
        <div className="message-footer">
          <span className="message-time">{formatTime(time)}</span>
          
          {/* এডিট ইন্ডিকেটর */}
          {isEdited && (
            <span className="edited-badge">
              <i className="fa-solid fa-pen"></i> edited
            </span>
          )}
          
          {/* রিড স্ট্যাটাস (sent হলে) */}
          {type === 'sent' && (
            <span className="read-status">
              {isRead ? (
                <i className="fa-solid fa-check-double" style={{ color: '#34b7f1' }}></i>
              ) : (
                <i className="fa-solid fa-check"></i>
              )}
            </span>
          )}
        </div>
        
      </div>
    </div>
  );
};

export default MessageBubble;