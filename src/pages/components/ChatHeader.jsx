// src/pages/components/ChatHeader.jsx

import React, { useState, useRef, useEffect } from 'react';
import styles from './ChatHeader.module.css';

export const ChatHeader = ({
  targetUserInfo,
  otherPartyInfo,
  onBack,
  isActiveDeal,
  hasActiveDealWithChatUser,
  activeDealCount,
  onBlockUser,
  onDeleteChat
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const dotBtnRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current && !menuRef.current.contains(event.target) &&
        dotBtnRef.current && !dotBtnRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  return (
    <div className={styles.chatHeader}>
      <button className={styles.backBtn} onClick={onBack}>
        <i className="fa-solid fa-arrow-left"></i>
      </button>

      <div className={styles.chatUserInfo}>
        <div className={styles.userAvatarWrapper}>
          {targetUserInfo.photoURL ? (
            <img
              src={targetUserInfo.photoURL}
              alt={targetUserInfo.displayName}
              className={styles.userAvatar}
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.nextElementSibling) {
                  e.target.nextElementSibling.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div
            className={styles.userAvatarPlaceholder}
            style={{ display: targetUserInfo.photoURL ? 'none' : 'flex' }}
          >
            {targetUserInfo.displayName?.charAt(0)?.toUpperCase() ||
              otherPartyInfo.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span className={`${styles.onlineStatusDot} ${targetUserInfo.isOnline ? styles.online : styles.offline}`}></span>
        </div>

        <div className={styles.userDetails}>
          <h3>{targetUserInfo.displayName || otherPartyInfo.name || 'Unknown User'}</h3>
          <div className={styles.userStatusText}>
            {targetUserInfo.isOnline ? (
              <span className={`${styles.statusText} ${styles.online}`}>
                <i className="fa-solid fa-circle"></i> Online
              </span>
            ) : (
              <span className={`${styles.statusText} ${styles.offline}`}>
                <i className="fa-regular fa-circle"></i> {targetUserInfo.lastSeenFormatted || 'Offline'}
              </span>
            )}
            {isActiveDeal && <span className={styles.dealStatusBadge}>⚡ Active Deal</span>}
          </div>
        </div>
      </div>

      {(onBlockUser || onDeleteChat) && (
        <div className={styles.chatHeaderMenuWrapper}>
          <button
            className={styles.headerMenuBtn}
            ref={dotBtnRef}
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Chat options"
          >
            <i className="fa-solid fa-ellipsis-vertical"></i>
          </button>

          {menuOpen && (
            <div className={styles.headerMenuDropdown} ref={menuRef}>
              {hasActiveDealWithChatUser && (
                <div className={styles.headerMenuNote}>
                  ⚡ Active Deal ({activeDealCount || 1}) — ব্লক/ডিলিট এখন করা যাবে না
                </div>
              )}
              {onBlockUser && (
                <button
                  disabled={hasActiveDealWithChatUser}
                  onClick={() => { setMenuOpen(false); onBlockUser(); }}
                >
                  <i className="fa-solid fa-ban"></i> Block User
                </button>
              )}
              {onDeleteChat && (
                <button
                  disabled={hasActiveDealWithChatUser}
                  className={styles.deletesBtn}
                  onClick={() => { setMenuOpen(false); onDeleteChat(); }}
                >
                  <i className="fa-solid fa-trash"></i> Delete Chat
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatHeader;