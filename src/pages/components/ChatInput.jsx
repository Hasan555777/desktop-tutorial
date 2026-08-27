// src/pages/components/ChatInput.jsx
import React from 'react';

export const ChatInput = ({
  message, setMessage, onSend, onKeyDown, onFileUpload,
  fileInputRef, isBlocked, blockedBy, uploading, inputRef
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
        placeholder={isDisabled ? "🔒 Chat locked" : "Type your message..."}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={isDisabled}
      />
      <button
        className="sendd-btn"
        onClick={() => onSend()}
        disabled={!message.trim() || isDisabled}
      >
        <i className="fa-solid fa-paper-plane"></i>
      </button>
    </div>
  );
};

export default ChatInput;
