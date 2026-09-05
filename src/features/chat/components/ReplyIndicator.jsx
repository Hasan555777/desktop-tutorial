// src/pages/components/ReplyIndicator.jsx

import React from 'react';
import styles from './ReplyIndicator.module.css';

export const ReplyIndicator = ({ replyTo, onCancel }) => {
  if (!replyTo) return null;

  return (
    <div className={styles.replyIndicator}>
      <div className={styles.replyContent}>
        <i className="fa-solid fa-reply"></i>
        <span>Replying to <strong>{replyTo.senderName}</strong>: {replyTo.text.substring(0, 60)}...</span>
      </div>
      <button className={styles.cancelReply} onClick={onCancel}>
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
};

export default ReplyIndicator;