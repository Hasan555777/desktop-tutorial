import React from 'react';
import styles from './MessageBubble.module.css';

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
    <div className={`${styles.msgRow} ${styles[type]}`}>
      <div className={`${styles.bubble} ${styles[type]}`}>
        
        {/* সেন্ডারের নাম (received হলে) */}
        {type === 'received' && senderName && (
          <div className={styles.senderName}>{senderName}</div>
        )}
        
        {/* ইমেজ (যদি থাকে) */}
        {image && (
          <div className={styles.messageImage} onClick={() => onImageClick && onImageClick(image)}>
            <img 
              src={image} 
              alt="Shared" 
              className={styles.chatImage}
              loading="lazy"
            />
          </div>
        )}
        
        {/* মেসেজ টেক্সট */}
        {message && (
          <div className={styles.messageText}>{message}</div>
        )}
        
        {/* সময় + স্ট্যাটাস */}
        <div className={styles.messageFooter}>
          <span className={styles.messageTime}>{formatTime(time)}</span>
          
          {/* এডিট ইন্ডিকেটর */}
          {isEdited && (
            <span className={styles.editedBadge}>
              <i className="fa-solid fa-pen"></i> edited
            </span>
          )}
          
          {/* রিড স্ট্যাটাস (sent হলে) */}
          {type === 'sent' && (
            <span className={styles.readStatus}>
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