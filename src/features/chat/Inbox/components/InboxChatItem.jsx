// src/pages/Inbox/components/InboxChatItem.jsx

import React from 'react';
import styles from './InboxChatItem.module.css';

export const InboxChatItem = ({
  chat,
  isSelected,
  onSelect,
  onMenuToggle,
  isMenuOpen,
  dotBtnRef,
  currentUser,
  userProfiles
}) => {
  const otherId = chat.otherPartyId || chat.participants?.find(p => p !== currentUser?.uid);
  const profile = userProfiles?.[otherId] || {};
  const displayName = profile.displayName || chat.otherPartyName || chat.sellerName || chat.buyerName || 'User';
  const photoURL = profile.photoURL || chat.otherPartyPhoto || chat.sellerPhoto || chat.buyerPhoto || null;
  const isOnline = profile.isOnline || false;
  const statusText = isOnline ? 'Online' : (profile.lastSeenFormatted || 'Offline');
  const chatTime = chat.time || 'Just now';

  // 🔘 থ্রি-ডট / ক্রস (X) বাটনের সম্পূর্ণ ফিক্সড হ্যান্ডলার
  const handleDotOrCrossClick = (e) => {
    // ইভেন্ট যাতে প্যারেন্ট কার্ডের (onSelect) দিকে বা বাইরের ইভেন্টে না ছড়ায়
    e.stopPropagation();
    if (e.nativeEvent) {
      e.nativeEvent.stopImmediatePropagation();
    }

    if (typeof onMenuToggle === 'function') {
      if (isMenuOpen) {
        // মেনু খোলা থাকলে সরাসরি বন্ধ (null) করার নির্দেশ
        onMenuToggle(null, e);
      } else {
        // মেনু বন্ধ থাকলে এই চ্যাট আইডি খুলে দেওয়ার নির্দেশ
        onMenuToggle(chat.id, e);
      }
    }
  };

  return (
    <div
      className={`${styles.workspaceCardItem} ${isSelected ? styles.active : ''}`}
      onClick={() => onSelect(chat)}
    >
      {/* অ্যাভাটার সেকশন */}
      <div className={styles.avatarWrapper}>
        <div 
          className={styles.avatarSquare}
          style={{ background: chat.gradient || 'linear-gradient(135deg, #f59e0b, #d97706)' }}
        >
          {photoURL ? (
            <img
              src={photoURL}
              alt={displayName}
              className={styles.avatarImg}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.textContent = displayName.charAt(0).toUpperCase();
              }}
            />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
          {/* 🔧 FIX (Inbox duplicate online status): removed the
              onlineStatusDot badge that used to sit here — it showed
              the exact same online/offline state as the statusText
              row below, which also has its own dot icon and (unlike
              this one) shows the actual last-seen time. Two
              indicators for one piece of information on the same
              card; kept the more informative one. */}
        </div>
      </div>

      {/* কন্টেন্ট ব্লক */}
      <div className={styles.cardContentBlock}>
        <div className={styles.cardTopLine}>
          <h4>
            {displayName}
            {(chat.isBlocked || chat.isBlockedByOther) && (
              <span className={styles.blockedBadge}>
                <i className="fa-solid fa-lock"></i> {chat.isBlocked ? 'Blocked' : 'Blocked You'}
              </span>
            )}
          </h4>
          <span className={styles.cardTimeBadge}>{chatTime}</span>
        </div>
        <span className={styles.projectContextTag}>{chat.tag || 'Chat'}</span>
        <p className={styles.cardMsgPreview}>
          {chat.isBlocked
            ? '🔒 You have blocked this user'
            : chat.isBlockedByOther
              ? '🔒 You have been blocked'
              : (chat.preview || 'Start conversation')}
        </p>
        <div className={styles.userStatusText}>
          <span className={`${styles.statusText} ${isOnline ? styles.online : styles.offline}`}>
            <i className={`fa-solid fa-circle ${isOnline ? styles.onlineDot : styles.offlineDot}`}></i>
            {statusText}
          </span>
        </div>
      </div>

      {/* আনরিড স্ট্যাটাস */}
      <div className={styles.cardStatusRight}>
        {chat.unreadCount?.[currentUser?.uid] > 0 ? (
          <div className={styles.unreadBadge}>{chat.unreadCount[currentUser.uid]}</div>
        ) : (
          chat.isUnread && <div className={styles.unreadDot}></div>
        )}
      </div>

      {/* 🔘 টগল / ক্লোজ (X) বাটন */}
      <button
        type="button"
        className={`${styles.menuDotsBtn} ${isMenuOpen ? styles.closeMenuBtn : ''}`}
        ref={isMenuOpen ? dotBtnRef : null}
        onClick={handleDotOrCrossClick}
        aria-label={isMenuOpen ? "Close menu" : "Open menu"}
        title={isMenuOpen ? "Close options" : "Chat options"}
      >
        <i 
          className={isMenuOpen ? "fa-solid fa-xmark" : "fa-solid fa-ellipsis-vertical"}
          style={{ pointerEvents: 'none' }} /* 👈 আইকনের উপর ক্লিক পড়লেও যাতে বাটনে ট্রিগার হয় */
        ></i>
      </button>
    </div>
  );
};

export default InboxChatItem;