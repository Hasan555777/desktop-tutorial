// InboxListControls.jsx
// Merged from: InboxSearch.jsx, InboxModeSwitcher.jsx, InboxFilterTabs.jsx,
// InboxEmptyState.jsx — these were 4 separate files, each under 40 lines,
// always imported together by Inbox.jsx and never used anywhere else.

import React from 'react';

// ============================================================
// InboxSearch
// ============================================================
export const InboxSearch = ({ searchQuery, setSearchQuery }) => {
  return (
    <div className="search-box">
      <i className="fa-solid fa-magnifying-glass"></i>
      <input
        type="text"
        placeholder="Search conversations..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>
  );
};

// ============================================================
// InboxModeSwitcher
//
// FIX: getModeCount used to read `filteredChats` (mode + active tab +
// search all applied) for buyer/seller but `getUnreadCount()` — which
// itself reads `modeFilteredChats` (mode only) — for "all". That meant
// the same badge counted differently depending on which mode was active:
// switch to "Unread" tab or type a search query, and the "All" badge
// wouldn't move but the "Buyer"/"Seller" badge would. A badge that's
// supposed to mean "how many unread chats in this mode" shouldn't change
// because of an unrelated search filter, so this now always calls
// getUnreadCount() — which useInboxFilters.js was also fixed to always
// use modeFilteredChats for, regardless of which mode is active.
// ============================================================
export const InboxModeSwitcher = React.memo(
  ({
    currentMode,
    handleModeChange,
    getUnreadCount,
    setSelectedChat = null,
    setIsChatReady = null,
    setHideBottomNav = null,
  }) => {
    const onModeChange = (mode) => {
      if (setSelectedChat) setSelectedChat(null);
      if (setIsChatReady) setIsChatReady(false);
      if (setHideBottomNav) setHideBottomNav(false);
      localStorage.removeItem('activeChat');
      handleModeChange(mode);
    };

    const count = getUnreadCount();

    return (
      <div className="inbox-mode-switcher">
        <button className={`mode-switch-btn ${currentMode === 'all' ? 'active' : ''}`} onClick={() => onModeChange('all')}>
          <i className="fa-solid fa-list"></i> All
          {currentMode === 'all' && count > 0 && <span className="mode-badge-count">{count}</span>}
        </button>

        <button className={`mode-switch-btn ${currentMode === 'buyer' ? 'active' : ''}`} onClick={() => onModeChange('buyer')}>
          <i className="fa-solid fa-briefcase"></i> Buyer
          {currentMode === 'buyer' && count > 0 && <span className="mode-badge-count">{count}</span>}
        </button>

        <button className={`mode-switch-btn ${currentMode === 'seller' ? 'active' : ''}`} onClick={() => onModeChange('seller')}>
          <i className="fa-solid fa-laptop-code"></i> Seller
          {currentMode === 'seller' && count > 0 && <span className="mode-badge-count">{count}</span>}
        </button>
      </div>
    );
  }
);

InboxModeSwitcher.displayName = 'InboxModeSwitcher';

// ============================================================
// InboxFilterTabs
// ============================================================
export const InboxFilterTabs = ({ activeFilter, setActiveFilter }) => {
  const tabs = ['All Chats', 'Active Deals', 'Unread'];

  return (
    <div className="filter-tabs">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          className={`tab-chip ${activeFilter === tab ? 'active' : ''}`}
          onClick={() => setActiveFilter(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

// ============================================================
// InboxEmptyState
// ============================================================
export const InboxEmptyState = ({ loading, searchQuery, currentMode, filteredChats }) => {
  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <p>Loading chats...</p>
      </div>
    );
  }

  if (filteredChats.length === 0) {
    return (
      <div className="no-chats-message">
        <i className="fa-solid fa-inbox"></i>
        <p>
          {searchQuery ? (
            'No matching conversations found'
          ) : (
            <>
              {currentMode === 'all' && 'No chats yet'}
              {currentMode === 'buyer' && 'No buyer chats'}
              {currentMode === 'seller' && 'No seller chats'}
            </>
          )}
        </p>
      </div>
    );
  }

  return null;
};
