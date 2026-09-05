// src/pages/components/ChatInput.jsx

import React from 'react';
import styles from './ChatInput.module.css';

export const ChatInput = ({
  message, setMessage, onSend, onKeyDown, onFileUpload, onDocumentUpload,
  fileInputRef, docInputRef, isBlocked, blockedBy, uploading, inputRef,
  onTyping, onVoiceClick,
}) => {
  const isDisabled = isBlocked || blockedBy || uploading;

  return (
    <div className={styles.chatInputArea}>
      <input type="file" ref={fileInputRef} id="fileInput" hidden accept="image/*" onChange={onFileUpload} />
      <label htmlFor="fileInput" className={styles.attachBtn}>
        {uploading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paperclip"></i>}
      </label>

      {/* 🔧 ADD (#17 documents) */}
      <input
        type="file"
        ref={docInputRef}
        id="docInput"
        hidden
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
        onChange={onDocumentUpload}
      />
      <label htmlFor="docInput" className={styles.attachBtn} title="Send document">
        <i className="fa-solid fa-file-arrow-up"></i>
      </label>

      {/* 🔧 ADD (#16 voice messages) */}
      {onVoiceClick && (
        <button type="button" className={styles.attachBtn} onClick={onVoiceClick} disabled={isDisabled} title="Record voice message">
          <i className="fa-solid fa-microphone"></i>
        </button>
      )}

      <input
        ref={inputRef}
        type="text"
        className={styles.chatInput}
        placeholder={isDisabled ? "🔒 Chat locked" : "Type your message..."}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          // 🔧 ADD (#20 typing indicator): fires on every keystroke,
          // but the hook itself only writes to Firestore on the first
          // one of a typing burst — see useTypingIndicator.js.
          if (e.target.value && onTyping) onTyping();
        }}
        onKeyDown={onKeyDown}
        disabled={isDisabled}
      />
      <button
        className={styles.sendBtn}
        onClick={() => onSend()}
        disabled={!message.trim() || isDisabled}
      >
        <i className="fa-solid fa-paper-plane"></i>
      </button>
    </div>
  );
};

export default ChatInput;