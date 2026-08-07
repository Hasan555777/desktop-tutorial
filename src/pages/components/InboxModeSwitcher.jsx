// src/pages/Inbox/components/InboxModeSwitcher.jsx

import React from 'react';

export const InboxModeSwitcher = React.memo(({ 
  currentMode, 
  handleModeChange, 
  getUnreadCount, 
  filteredChats,
  setSelectedChat = null,
  setIsChatReady = null,
  setHideBottomNav = null
}) => {
  const getModeCount = (mode) => {
    if (mode === 'all') return getUnreadCount();
    return filteredChats.filter(c => c.isUnread).length;
  };

  // ── Mode Change Handler ──
  const onModeChange = (mode) => {
    // ✅ Mode পরিবর্তন করলে Chat বন্ধ করুন
    if (setSelectedChat) {
      setSelectedChat(null);
    }
    if (setIsChatReady) {
      setIsChatReady(false);
    }
    if (setHideBottomNav) {
      setHideBottomNav(false);
    }
    
    // ✅ Active Chat localStorage clear করুন
    localStorage.removeItem('activeChat');
    
    // ✅ Mode পরিবর্তন করুন
    handleModeChange(mode);
  };

  return (
    <div className="inbox-mode-switcher">
      <button 
        className={`mode-switch-btn ${currentMode === 'all' ? 'active' : ''}`}
        onClick={() => onModeChange('all')}
      >
        <i className="fa-solid fa-list"></i> All
        {currentMode === 'all' && getModeCount('all') > 0 && (
          <span className="mode-badge-count">{getModeCount('all')}</span>
        )}
      </button>
      
      <button 
        className={`mode-switch-btn ${currentMode === 'buyer' ? 'active' : ''}`}
        onClick={() => onModeChange('buyer')}
      >
        <i className="fa-solid fa-briefcase"></i> Buyer
        {currentMode === 'buyer' && getModeCount('buyer') > 0 && (
          <span className="mode-badge-count">{getModeCount('buyer')}</span>
        )}
      </button>
      
      <button 
        className={`mode-switch-btn ${currentMode === 'seller' ? 'active' : ''}`}
        onClick={() => onModeChange('seller')}
      >
        <i className="fa-solid fa-laptop-code"></i> Seller
        {currentMode === 'seller' && getModeCount('seller') > 0 && (
          <span className="mode-badge-count">{getModeCount('seller')}</span>
        )}
      </button>
    </div>
  );
});

InboxModeSwitcher.displayName = 'InboxModeSwitcher';