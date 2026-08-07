// src/pages/components/InboxChatItem.jsx

import React, { useState, useEffect } from 'react';

export const InboxChatItem = ({ 
  chat, 
  isSelected, 
  onSelect, 
  onMenuToggle, 
  isMenuOpen,
  menuRef,
  dotBtnRef,
  getDisplayName,
  getPhotoURL,
  getIsOnline,
  getOnlineStatusText,
  currentUser,
  userProfiles // ✅ প্রোফাইল ডেটা যোগ করুন
}) => {
  // ✅ সরাসরি প্রোফাইল থেকে ডেটা নিন
  const otherId = chat.otherPartyId || chat.participants?.find(p => p !== currentUser?.uid);
  
  // ✅ প্রোফাইল থেকে ডেটা
  const profile = userProfiles?.[otherId] || {};
  const displayName = profile.displayName || chat.otherPartyName || chat.sellerName || chat.buyerName || 'User';
  const photoURL = profile.photoURL || chat.otherPartyPhoto || chat.sellerPhoto || chat.buyerPhoto || null;
  const isOnline = profile.isOnline || false;
  const statusText = isOnline ? 'Online' : (profile.lastSeenFormatted || 'Offline');

  // ✅ চ্যাট টাইম ফরম্যাট
  const chatTime = chat.time || 'Just now';

  // ✅ মেনু টগল হ্যান্ডলার
  const handleMenuToggle = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onMenuToggle(chat.id, e);
  };

  // ✅ চ্যাট সিলেক্ট হ্যান্ডলার
  const handleSelect = () => {
    onSelect(chat);
  };

  return (
    <div 
      className={`workspace-card-item ${isSelected ? 'active' : ''}`}
      onClick={handleSelect}
    >
      <div className="avatar-wrapper">
        <div className="avatar-square" style={{ 
          background: chat.gradient || 'linear-gradient(135deg, #f59e0b, #d97706)', 
          position: 'relative' 
        }}>
          {photoURL ? (
            <img 
              src={photoURL} 
              alt={displayName}
              className="avatar-img"
              style={{ width: '100%', height: '100%', borderRadius: '14px', objectFit: 'cover' }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.textContent = displayName.charAt(0).toUpperCase();
              }}
            />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
          <span className={`online-status-dot ${isOnline ? 'online' : 'offline'}`}></span>
        </div>
      </div>

      <div className="card-content-block">
        <div className="card-top-line">
          <h4>
            {displayName}
            {chat.isBlocked && (
              <span className="blocked-badge">
                <i className="fa-solid fa-lock"></i> Blocked
              </span>
            )}
          </h4>
          <span className="card-time-badge">{chatTime}</span>
        </div>
        <span className="project-context-tag">{chat.tag || 'Chat'}</span>
        <p className="card-msg-preview">
          {chat.isBlocked ? '🔒 You have blocked this user' : (chat.preview || 'Start conversation')}
        </p>
        <div className="user-status-text">
          {/* <span className={`status-text ${isOnline ? 'online' : 'offline'}`}>
            <i className={`fa-solid fa-circle ${isOnline ? 'online-dot' : 'offline-dot'}`}></i>
            {statusText}
          </span> */}
        </div>
      </div>

      <div className="card-status-right">
        {chat.unreadCount?.[currentUser?.uid] > 0 ? (
          <div className="unread-badge">{chat.unreadCount[currentUser.uid]}</div>
        ) : (
          chat.isUnread && <div className="unread-dot"></div>
        )}
      </div>

      {/* ✅ Menu Button with proper ref and handler */}
      <button 
        className="menu-dots-btn"
        ref={dotBtnRef}
        onClick={handleMenuToggle}
        aria-label="Chat menu"
        title="Chat options"
      >
        <i className="fa-solid fa-ellipsis-vertical"></i>
      </button>
    </div>
  );
};