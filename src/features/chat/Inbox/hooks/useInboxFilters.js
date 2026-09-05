// src/pages/Inbox/hooks/useInboxFilters.js
//
// getUnreadCount() সবসময় modeFilteredChats (শুধু currentMode ফিল্টার করা)
// থেকে গণনা করে — activeFilter ট্যাব বা searchQuery-এর প্রভাব পড়ে না।
// এতে mode-switcher badge সবসময় "এই মোডে কতগুলো unread চ্যাট আছে" বোঝায়,
// সার্চ বক্সে কিছু টাইপ করলে বা ট্যাব বদলালে বদলায় না।

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
        const q = searchQuery.toLowerCase();
        const displayName = (chat.otherPartyName || '').toLowerCase();
        const tag = (chat.tag || '').toLowerCase();
        const preview = (chat.preview || '').toLowerCase();
        return displayName.includes(q) || tag.includes(q) || preview.includes(q);
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
