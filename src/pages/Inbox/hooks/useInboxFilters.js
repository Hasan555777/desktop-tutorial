// useInboxFilters.js
//
// FIX: getUnreadCount() used to branch — modeFilteredChats for 'all',
// filteredChats (which also includes the active tab filter AND the search
// query) for buyer/seller. That meant the mode-switcher unread badge
// changed meaning depending on which mode you were in: in 'buyer' mode,
// typing a search query would shrink the badge even though nothing about
// your actual unread count changed. Now it always uses modeFilteredChats,
// so the badge consistently means "unread chats in this mode," unaffected
// by the currently active tab or search box.

import { useState, useMemo } from 'react';

export const useInboxFilters = (chats, currentUser, currentMode) => {
  const [activeFilter, setActiveFilter] = useState('All Chats');
  const [searchQuery, setSearchQuery] = useState('');

  const modeFilteredChats = useMemo(() => {
    return chats.filter((chat) => {
      const myUid = currentUser?.uid;
      if (!myUid) return false;

      if (currentMode === 'all') {
        return chat.buyerId === myUid || chat.sellerId === myUid;
      }
      if (currentMode === 'buyer') {
        return chat.buyerId === myUid;
      }
      return chat.sellerId === myUid;
    });
  }, [chats, currentUser, currentMode]);

  const filteredChats = useMemo(() => {
    return modeFilteredChats.filter((chat) => {
      if (activeFilter === 'Active Deals' && !chat.isActiveDeal) return false;
      if (activeFilter === 'Unread' && !chat.isUnread) return false;

      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const displayName = (chat.otherPartyName || '').toLowerCase();
        const tag = (chat.tag || '').toLowerCase();
        const preview = (chat.preview || '').toLowerCase();

        return displayName.includes(query) || tag.includes(query) || preview.includes(query);
      }

      return true;
    });
  }, [modeFilteredChats, activeFilter, searchQuery]);

  const getUnreadCount = () => {
    let count = 0;
    modeFilteredChats.forEach((chat) => {
      if (chat.isUnread) count++;
    });
    return count;
  };

  return {
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    modeFilteredChats,
    filteredChats,
    getUnreadCount,
  };
};
