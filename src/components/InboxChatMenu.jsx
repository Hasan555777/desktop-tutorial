// src/components/InboxChatMenu.jsx

import React from 'react';

const InboxChatMenu = ({
  chat,
  isOpen,
  onClose,
  onDelete,
  onBlock,
  onUnblock,
  menuRef,
  dotBtnRef,
  hasActiveDeal,
  activeDealCount,
}) => {
  if (!isOpen) return null;

  const isBlocked = chat?.isBlocked || false;

  return (
    <div className="chat-menu-dropdown" ref={menuRef}>
      <button
        onClick={() => {
          onClose();
          // View Profile logic
        }}
      >
        <i className="fa-solid fa-user"></i> View Profile
      </button>

      {hasActiveDeal && (
        <button
          onClick={() => {
            onClose();
            // View Deal logic
          }}
        >
          <i className="fa-solid fa-bolt"></i> Active Deal ({activeDealCount})
        </button>
      )}

      <button
        onClick={() => {
          onClose();
          if (isBlocked) {
            onUnblock(chat.id);
          } else {
            onBlock(chat.id);
          }
        }}
      >
        <i className={`fa-solid ${isBlocked ? 'fa-unlock' : 'fa-ban'}`}></i>
        {isBlocked ? 'Unblock User' : 'Block User'}
      </button>

      <button
        onClick={() => {
          onClose();
          onDelete(chat.id);
        }}
        className="delete-btn"
      >
        <i className="fa-solid fa-trash"></i> Delete Chat
      </button>
    </div>
  );
};

// ✅ Default Export
export default InboxChatMenu;

