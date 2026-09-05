// src/pages/Inbox/components/InboxChatMenu.jsx
//
// NOTE: onDelete/onBlock/onUnblock এখন useInboxChats.js (যা ভেতরে
// useChatActions.js শেয়ারড হুক ব্যবহার করে) থেকে আসা হ্যান্ডলার —
// এই হ্যান্ডলারগুলো নিজেরাই active-deal চেক ও confirm ডায়ালগ দেখায়।
// তাই এখানে আলাদা window.confirm/alert রাখা হয়নি — সেটা করলে ইউজারকে
// দুইবার কনফার্ম করতে হতো এবং native popup বাকি অ্যাপের ডিজাইনের সাথে
// যেত না।

import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './InboxChatMenu.module.css';

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
  otherUserId,
}) => {
  const navigate = useNavigate();
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
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose, menuRef, dotBtnRef]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const isActiveDeal = useMemo(() => hasActiveDeal || false, [hasActiveDeal]);
  const isBlocked = useMemo(() => chat?.isBlocked || false, [chat?.isBlocked]);

  if (!isOpen) return null;

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (isActiveDeal) return;
    onClose();
    await onDelete(chat);
  };

  const handleBlock = async (e) => {
    e.stopPropagation();
    if (isActiveDeal) return;
    onClose();
    await onBlock(chat);
  };

  const handleUnblock = async (e) => {
    e.stopPropagation();
    onClose();
    await onUnblock(chat);
  };

  return (
    <div className={styles.chatMenuDropdown} ref={menuRef}>
      <button
        onClick={() => {
          onClose();
          // 🔧 FIX (Inbox #9): this used to just close the menu and do
          // nothing — the actual navigation was never implemented. Now
          // routes to the profile-viewing page via the disambiguated
          // /profile/user/:userId path (see the routing conversion
          // done earlier this audit for why it's not just /profile/:id).
          if (otherUserId) navigate(`/profile/user/${otherUserId}`);
        }}
        disabled={!otherUserId}
      >
        <i className="fa-solid fa-user"></i> View Profile
      </button>

      {isActiveDeal && (
        <button
          onClick={() => {
            onClose();
            // View Deal logic — future feature
          }}
        >
          <i className="fa-solid fa-bolt"></i> Active Deal ({activeDealCount || 1})
        </button>
      )}

      <button
        onClick={isBlocked ? handleUnblock : handleBlock}
        disabled={isActiveDeal && !isBlocked}
        className={isActiveDeal && !isBlocked ? styles.disabled : ''}
        title={isActiveDeal && !isBlocked ? 'Cannot block while active deal exists' : ''}
      >
        <i className={`fa-solid ${isBlocked ? 'fa-unlock' : 'fa-ban'}`}></i>
        {isBlocked ? 'Unblock User' : isActiveDeal ? '🔒 Cannot Block' : 'Block User'}
      </button>

      <button
        onClick={handleDelete}
        disabled={isActiveDeal}
        className={`${styles.deletesBtn} ${isActiveDeal ? styles.disabled : ''}`}
        title={isActiveDeal ? 'Cannot delete while active deal exists' : ''}
      >
        <i className="fa-solid fa-trash"></i>
        {isActiveDeal ? '🔒 Cannot Delete' : 'Delete Chat'}
      </button>
    </div>
  );
};

export default InboxChatMenu;