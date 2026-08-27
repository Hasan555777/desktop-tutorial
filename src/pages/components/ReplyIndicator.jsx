// src/pages/components/ReplyIndicator.jsx
import React from 'react';

export const ReplyIndicator = ({ replyTo, onCancel }) => {
  if (!replyTo) return null;

  return (
    <div className="reply-indicator">
      <div className="reply-content">
        <i className="fa-solid fa-reply"></i>
        <span>Replying to <strong>{replyTo.senderName}</strong>: {replyTo.text.substring(0, 60)}...</span>
      </div>
      <button className="cancel-reply" onClick={onCancel}>
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
};

export default ReplyIndicator;
