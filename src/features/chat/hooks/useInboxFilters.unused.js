// import { useState, useMemo } from 'react';

// export const useInboxFilters = (chats, currentUser, currentMode) => {
//   const [activeFilter, setActiveFilter] = useState('All Chats');
//   const [searchQuery, setSearchQuery] = useState('');

//   const modeFilteredChats = useMemo(() => {
//     return chats.filter(chat => {
//       const myUid = currentUser?.uid;
//       if (!myUid) return false;
      
//       if (currentMode === 'all') {
//         return chat.buyerId === myUid || chat.sellerId === myUid;
//       }
//       if (currentMode === 'buyer') {
//         return chat.buyerId === myUid;
//       } else {
//         return chat.sellerId === myUid;
//       }
//     });
//   }, [chats, currentUser, currentMode]);

//   const filteredChats = useMemo(() => {
//     return modeFilteredChats.filter(chat => {
//       if (activeFilter === 'Active Deals' && !chat.isActiveDeal) return false;
//       if (activeFilter === 'Unread' && !chat.isUnread) return false;
      
//       if (searchQuery.trim() !== "") {
//         const query = searchQuery.toLowerCase();
//         const displayName = (chat.otherPartyName || "").toLowerCase();
//         const tag = (chat.tag || "").toLowerCase();
//         const preview = (chat.preview || "").toLowerCase();
        
//         return displayName.includes(query) || tag.includes(query) || preview.includes(query);
//       }
      
//       return true;
//     });
//   }, [modeFilteredChats, activeFilter, searchQuery]);

//   const getUnreadCount = () => {
//     let count = 0;
//     const chatsToCheck = currentMode === 'all' ? modeFilteredChats : filteredChats;
//     chatsToCheck.forEach(chat => {
//       if (chat.isUnread) count++;
//     });
//     return count;
//   };

//   return {
//     activeFilter,
//     setActiveFilter,
//     searchQuery,
//     setSearchQuery,
//     modeFilteredChats,
//     filteredChats,
//     getUnreadCount
//   };
// };