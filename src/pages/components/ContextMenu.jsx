// src/pages/components/ContextMenu.jsx
import React from 'react';

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

export default ContextMenu;
