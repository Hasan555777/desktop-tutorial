// src/components/InboxChatMenu.jsx

import React, { useEffect, useMemo } from 'react';
import './inboxchatmenu.css';

const InboxChatMenu = ({
  chat,
  isOpen,
  onClose,
  onDelete,
  onBlock,
  onUnblock,
  menuRef,
  dotBtnRef,
  hasActiveDeal = false,
  activeDealCount = 0,
}) => {
  // ============================================================
  // ✅ সব Hooks কন্ডিশনের আগে কল করুন
  // ============================================================

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef?.current &&
        !menuRef.current.contains(event.target) &&
        dotBtnRef?.current &&
        !dotBtnRef.current.contains(event.target)
      ) {
        onClose?.();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose, menuRef, dotBtnRef]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  const isActiveDeal = useMemo(() => {
    return hasActiveDeal || false;
  }, [hasActiveDeal]);

  const isBlocked = useMemo(() => {
    return chat?.isBlocked || false;
  }, [chat?.isBlocked]);

  const displayName = useMemo(() => {
    return chat?.userName || chat?.otherPartyName || 'this user';
  }, [chat?.userName, chat?.otherPartyName]);

  // ============================================================
  // ✅ কন্ডিশনাল রিটার্ন (Hooks এর পরে)
  // ============================================================
  if (!isOpen) return null;

  // ============================================================
  // ✅ হ্যান্ডলার
  //
  // 🐛 FIX: these used to call onDelete(chat.id) / onBlock(chat.id) /
  // onUnblock(chat.id) — passing just the string ID. But the functions
  // wired up as onDelete/onBlock/onUnblock (handleDeleteChat,
  // handleBlockUser, handleUnblockUser in useInboxChats.js) expect the
  // FULL chat object — they read chat.otherPartyId, chat.buyerId,
  // chat.sellerId, chat.participants, chat.id, etc. to figure out who the
  // other party is. With just a string, all of those reads returned
  // undefined, so the target user could never be identified and the
  // handler aborted with an error before it ever got to the active-deal
  // check. Now the full `chat` object is passed through.
  // ============================================================

  const handleDelete = () => {
    if (isActiveDeal) {
      alert('⚠️ Active Deal থাকায় ডিলিট করা যাচ্ছে না!');
      return;
    }

    if (window.confirm(`Are you sure you want to delete conversation with ${displayName}?`)) {
      onDelete(chat);
      onClose();
    }
  };

  const handleBlock = () => {
    if (isActiveDeal) {
      alert('⚠️ Active Deal থাকায় ব্লক করা যাচ্ছে না!');
      return;
    }

    if (window.confirm(`Are you sure you want to block ${displayName}? They won't be able to contact you.`)) {
      onBlock(chat);
      onClose();
    }
  };

  const handleUnblock = () => {
    if (window.confirm(`Are you sure you want to unblock ${displayName}?`)) {
      onUnblock(chat);
      onClose();
    }
  };

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className="chat-menu-dropdown" ref={menuRef}>
      {/* ✅ View Profile */}
      <button
        onClick={() => {
          onClose();
          // View Profile logic
        }}
      >
        <i className="fa-solid fa-user"></i> View Profile
      </button>

      {/* ✅ Active Deal - শুধু তখনই দেখাবে যখন সত্যিই Active Deal আছে */}
      {isActiveDeal && (
        <button
          onClick={() => {
            onClose();
            // View Deal logic
          }}
        >
          <i className="fa-solid fa-bolt"></i> Active Deal ({activeDealCount || 1})
        </button>
      )}

      {/* ✅ Block / Unblock */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (isActiveDeal) {
            return;
          }
          if (isBlocked) {
            handleUnblock();
          } else {
            handleBlock();
          }
        }}
        disabled={isActiveDeal}
        className={`${isActiveDeal ? 'disabled' : ''}`}
        title={isActiveDeal ? 'Cannot block while active deal exists' : ''}
      >
        <i className={`fa-solid ${isBlocked ? 'fa-unlock' : 'fa-ban'}`}></i>
        {isBlocked ? 'Unblock User' : isActiveDeal ? '🔒 Cannot Block' : 'Block User'}
      </button>

      {/* ✅ Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (isActiveDeal) {
            return;
          }
          handleDelete();
        }}
        disabled={isActiveDeal}
        className={`deletes-btn ${isActiveDeal ? 'disabled' : ''}`}
        title={isActiveDeal ? 'Cannot delete while active deal exists' : ''}
      >
        <i className="fa-solid fa-trash"></i>
        {isActiveDeal ? '🔒 Cannot Delete' : 'Delete Chat'}
      </button>
    </div>
  );
};

export default InboxChatMenu;