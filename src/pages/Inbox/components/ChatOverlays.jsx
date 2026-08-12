// ChatOverlays.jsx
// Merged from: ImageZoom.jsx, ReplyIndicator.jsx, ContextMenu.jsx,
// EditMessageModal.jsx — four small overlay/popup widgets (10-40 lines
// each) all consumed by ChatInterface.jsx and nowhere else.

import React from 'react';

// ============================================================
// ImageZoom — fullscreen lightbox for a tapped chat image
// ============================================================
export const ImageZoom = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div className="zoom-lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close-btn" onClick={onClose}>
        <i className="fa-solid fa-xmark"></i>
      </button>
      <div className="lightbox-content-box" onClick={(e) => e.stopPropagation()}>
        <img src={imageUrl} alt="Zoomed" className="lightbox-zoomed-img" />
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
    <div className="reply-indicator">
      <div className="reply-content">
        <i className="fa-solid fa-reply"></i>
        <span>
          Replying to <strong>{replyTo.senderName}</strong>: {replyTo.text.substring(0, 60)}...
        </span>
      </div>
      <button className="cancel-reply" onClick={onCancel}>
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
    <div ref={contextMenuRef} className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
      <div className="context-menu-item" onClick={onCopy}>
        <i className="fa-regular fa-copy"></i> Copy
      </div>
      <div className="context-menu-item" onClick={onReply}>
        <i className="fa-solid fa-reply"></i> Reply
      </div>
      <div className="context-menu-item" onClick={onForward}>
        <i className="fa-solid fa-share"></i> Forward
      </div>
      {isOwnMessage && (
        <>
          <div className="context-menu-item" onClick={onEdit}>
            <i className="fa-regular fa-pen-to-square"></i> Edit
          </div>
          <div className="context-menu-item delete" onClick={onDelete}>
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
    <div className="modal-overlay" onClick={() => setEditMessage(null)}>
      <div className="edit-message-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fa-regular fa-pen-to-square"></i> Edit Message
          </h3>
          <button className="modal-close" onClick={() => setEditMessage(null)}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <textarea
            value={editMessage.text}
            onChange={(e) => setEditMessage({ ...editMessage, text: e.target.value })}
            rows="4"
            autoFocus
          />
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={() => setEditMessage(null)}>
            Cancel
          </button>
          <button className="btn-save" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
