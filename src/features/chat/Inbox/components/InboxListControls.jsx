// src/pages/Inbox/components/InboxListControls.jsx
// InboxSearch, InboxModeSwitcher, InboxFilterTabs, InboxEmptyState —
// একসাথেই ব্যবহার হয় (Inbox.jsx), তাই একটা ফাইলে রাখা হয়েছে।

import React from 'react';
import styles from './InboxListControls.module.css';

// ============================================================
// InboxSearch
// ============================================================
export const InboxSearch = ({ searchQuery, setSearchQuery }) => {
  return (
    <div className={styles.searchBox}>
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
// getUnreadCount() সবসময় modeFilteredChats-ভিত্তিক (useInboxFilters.js
// দেখুন), তাই এই ব্যাজ সব মোডেই একইরকম আচরণ করে — search/tab ফিল্টারের
// প্রভাব পড়ে না।
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
      <div className={styles.inboxModeSwitcher}>
        <button 
          className={`${styles.modeSwitchBtn} ${currentMode === 'all' ? styles.active : ''}`} 
          onClick={() => onModeChange('all')}
        >
          <i className="fa-solid fa-list"></i> All
          {currentMode === 'all' && count > 0 && <span className={styles.modeBadgeCount}>{count}</span>}
        </button>

        <button 
          className={`${styles.modeSwitchBtn} ${currentMode === 'buyer' ? styles.active : ''}`} 
          onClick={() => onModeChange('buyer')}
        >
          <i className="fa-solid fa-briefcase"></i> Buyer
          {currentMode === 'buyer' && count > 0 && <span className={styles.modeBadgeCount}>{count}</span>}
        </button>

        <button 
          className={`${styles.modeSwitchBtn} ${currentMode === 'seller' ? styles.active : ''}`} 
          onClick={() => onModeChange('seller')}
        >
          <i className="fa-solid fa-laptop-code"></i> Seller
          {currentMode === 'seller' && count > 0 && <span className={styles.modeBadgeCount}>{count}</span>}
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
    <div className={styles.filterTabs}>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          className={`${styles.tabChip} ${activeFilter === tab ? styles.active : ''}`}
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
      <div className={styles.loadingState}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading chats...</p>
      </div>
    );
  }

  if (filteredChats.length === 0) {
    return (
      <div className={styles.noChatsMessage}>
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