// src/pages/Inbox/components/ChatOverlays.jsx
// Merged from: ImageZoom.jsx, ReplyIndicator.jsx, ContextMenu.jsx,
// EditMessageModal.jsx — four small overlay/popup widgets (10-40 lines
// each) all consumed by ChatInterface.jsx and nowhere else.

import React from 'react';
import styles from './ChatOverlays.module.css';

// ============================================================
// ImageZoom — fullscreen lightbox for a tapped chat image
// ============================================================
export const ImageZoom = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div className={styles.zoomLightboxOverlay} onClick={onClose}>
      <button className={styles.lightboxCloseBtn} onClick={onClose}>
        <i className="fa-solid fa-xmark"></i>
      </button>
      <div className={styles.lightboxContentBox} onClick={(e) => e.stopPropagation()}>
        <img src={imageUrl} alt="Zoomed" className={styles.lightboxZoomedImg} />
      </div>
    </div>
  );
};

// ============================================================
// ReplyIndicator — shows what message the composer is replying to
// ============================================================
export const ReplyIndicator = ({ replyTo, onCancel }) => {
  if (!replyTo) return null;

  return (
    <div className={styles.replyIndicator}>
      <div className={styles.replyContent}>
        <i className="fa-solid fa-reply"></i>
        <span>
          Replying to <strong>{replyTo.senderName}</strong>: {replyTo.text.substring(0, 60)}...
        </span>
      </div>
      <button className={styles.cancelReply} onClick={onCancel}>
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
};

// ============================================================
// ContextMenu — right-click / long-press menu on a message bubble
// ============================================================
export const ContextMenu = ({ contextMenu, contextMenuRef, onCopy, onReply, onForward, onEdit, onDelete, isOwnMessage }) => {
  if (!contextMenu.visible) return null;

  return (
    <div 
      ref={contextMenuRef} 
      className={styles.contextMenu} 
      style={{ top: contextMenu.y, left: contextMenu.x }}
    >
      <div className={styles.contextMenuItem} onClick={onCopy}>
        <i className="fa-regular fa-copy"></i> Copy
      </div>
      <div className={styles.contextMenuItem} onClick={onReply}>
        <i className="fa-solid fa-reply"></i> Reply
      </div>
      <div className={styles.contextMenuItem} onClick={onForward}>
        <i className="fa-solid fa-share"></i> Forward
      </div>
      {isOwnMessage && (
        <>
          <div className={styles.contextMenuItem} onClick={onEdit}>
            <i className="fa-regular fa-pen-to-square"></i> Edit
          </div>
          <div className={`${styles.contextMenuItem} ${styles.delete}`} onClick={onDelete}>
            <i className="fa-regular fa-trash-can"></i> Delete
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// EditMessageModal — edit-in-place modal for an own message
// ============================================================
export const EditMessageModal = ({ editMessage, setEditMessage, onSave }) => {
  if (!editMessage) return null;

  return (
    <div className={styles.modalOverlay} onClick={() => setEditMessage(null)}>
      <div className={styles.editMessageModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>
            <i className="fa-regular fa-pen-to-square"></i> Edit Message
          </h3>
          <button className={styles.modalClose} onClick={() => setEditMessage(null)}>
            ✕
          </button>
        </div>
        <div className={styles.modalBody}>
          <textarea
            value={editMessage.text}
            onChange={(e) => setEditMessage({ ...editMessage, text: e.target.value })}
            rows="4"
            autoFocus
          />
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnCancel} onClick={() => setEditMessage(null)}>
            Cancel
          </button>
          <button className={styles.btnSave} onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};