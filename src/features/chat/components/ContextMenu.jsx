// src/pages/components/ContextMenu.jsx

import React from 'react';
import styles from './ContextMenu.module.css';

export const ContextMenu = ({ contextMenu, contextMenuRef, onCopy, onReply, onForward, onEdit, onDelete, onClose, isOwnMessage, canEdit }) => {
  if (!contextMenu.visible) return null;

  return (
    <div ref={contextMenuRef} className={styles.contextMenu} style={{ top: contextMenu.y, left: contextMenu.x }}>
      {/* 🔧 FIX (#8): explicit X close button so the menu can always
          be dismissed without relying on an action item. Outside
          click / Escape / mobile-touch handling lives in
          ChatInterface.jsx (uses this same contextMenuRef). */}
      <button
        type="button"
        className={styles.closeBtn}
        onClick={onClose}
        aria-label="Close menu"
      >
        <i className="fa-solid fa-xmark"></i>
      </button>
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
          {/* 🔧 FIX (edit-scope): Edit used to show for every message
              type (image/voice/document) but only ever changed the
              `text` field — for voice/document messages that field is
              never rendered at all, so the edit silently did nothing.
              Per the actual requirement, Edit is now only offered for
              text and image messages; canEdit is computed by the
              caller (ChatInterface.jsx) from the message's fields. */}
          {canEdit && (
            <div className={styles.contextMenuItem} onClick={onEdit}>
              <i className="fa-regular fa-pen-to-square"></i> Edit
            </div>
          )}
          <div className={`${styles.contextMenuItem} ${styles.delete}`} onClick={onDelete}>
            <i className="fa-regular fa-trash-can"></i> Delete
          </div>
        </>
      )}
    </div>
  );
};

export default ContextMenu;