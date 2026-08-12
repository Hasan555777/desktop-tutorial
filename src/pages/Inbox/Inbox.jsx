// src/pages/Inbox.jsx
//
// FIX: this file used to declare its OWN `activeDealStatus` state and
// `checkActiveDealWithUser` function — duplicating what useInboxChats.js
// already builds and returns. Worse, this local copy was never actually
// called anywhere, so `getChatActiveDealStatus` always read from an empty
// cache and the "⚡ Active Deal" badge on chat items/menus never showed.
// Now both are sourced directly from the hook (which also proactively
// populates the cache for every loaded chat, not just on delete/block).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import ChatInterface from '@/pages/ChatInterface';
import './Inbox.css';

// Import Helpers
import { createNormalizedChatObject } from './inboxHelpers';

// Import Hooks
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { useInboxChats } from '@/hooks/useInboxChats';
import { useInboxFilters } from '@/hooks/useInboxFilters';

// Import Components (merged — see components/InboxListControls.jsx)
import { InboxSearch, InboxModeSwitcher, InboxFilterTabs, InboxEmptyState } from './components/InboxListControls';
import { InboxChatItem } from '@/components/InboxChatItem';
import  InboxChatMenu from '@/components/InboxChatMenu';

const Inbox = ({ chatContext: propChatContext, currentUser, setHideBottomNav }) => {
  const location = useLocation();

  // ========== State ==========
  const [currentMode, setCurrentMode] = useState(() => {
    return localStorage.getItem('inboxMode') || 'all';
  });
  const [selectedChat, setSelectedChat] = useState(null);
  const [openMenuChatId, setOpenMenuChatId] = useState(null);
  const [isChatReady, setIsChatReady] = useState(false);
  const [chatContext, setChatContext] = useState(null);

  // ========== Refs ==========
  const menuRef = useRef(null);
  const dotBtnRef = useRef(null);

  // ========== Hooks ==========
  const {
    userProfiles,
    fetchUserProfile,
    getOnlineStatusText,
    getIsOnline,
    getDisplayName,
    getPhotoURL
  } = useUserProfiles();

  const {
    chats,
    loading,
    isDataReady,
    handleDeleteChat,
    handleBlockUser,
    handleUnblockUser,
    handleSelectChat,
    activeDealStatus // ✅ now sourced from the hook, not duplicated here
  } = useInboxChats(currentUser, currentMode, selectedChat, setSelectedChat, fetchUserProfile, chatContext);

  const {
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    filteredChats,
    getUnreadCount
  } = useInboxFilters(chats, currentUser, currentMode);

  // ============================================================
  // ✅ Mode Change Handler - useCallback দিয়ে wrap
  // ============================================================
  const handleModeChange = useCallback((mode) => {
    // ✅ Mode পরিবর্তন করলে Chat বন্ধ করুন
    setSelectedChat(null);
    setIsChatReady(false);
    setHideBottomNav?.(false);
    localStorage.removeItem('activeChat');

    // ✅ Mode পরিবর্তন করুন
    setCurrentMode(mode);
    localStorage.setItem('inboxMode', mode);
  }, [setHideBottomNav]);

  // ============================================================
  // ✅ location.state থেকে chatContext নেওয়া
  // ============================================================
  useEffect(() => {
    if (location.state?.chatContext) {
      console.log("📩 Inbox received chatContext from navigation:", location.state.chatContext);
      setChatContext(location.state.chatContext);
      window.history.replaceState({}, document.title);
      return;
    }

    if (location.state?.job && location.state?.openChat) {
      const job = location.state.job;
      console.log("📩 Inbox received job from navigation:", job);

      // NOTE: buyerId/sellerId here are placeholders only — when
      // useInboxChats.js actually creates the chat doc, it recomputes
      // both correctly from `type`/`postType` via createNewChatObject()
      // in inboxHelpers.js, which is the version that matters. Kept as-is
      // rather than "fixed" to avoid duplicating that branching logic in
      // two places; flagging so it isn't mistaken for the real assignment.
      const newChatContext = {
        id: job.id || job.postId || job.jobId,
        postId: job.id || job.postId || job.jobId,
        userId: job.userId,
        title: job.title || 'Untitled Job',
        description: job.description || '',
        budget: job.budget || 0,
        deadline: job.deadline || 'N/A',
        type: job.type || 'hire',
        images: job.images || [],
        createdAt: job.createdAt || new Date(),
        clientName: job.clientName || job.userName || 'User',
        clientPhoto: job.clientPhoto || job.userPhoto || '',
        buyerId: currentUser?.uid,
        sellerId: job.userId,
        participants: [currentUser?.uid, job.userId],
        otherPartyId: job.userId,
        otherPartyName: job.clientName || job.userName || 'User',
        otherPartyPhoto: job.clientPhoto || job.userPhoto || '',
      };

      console.log("📤 Created chatContext from job:", newChatContext);
      setChatContext(newChatContext);
      window.history.replaceState({}, document.title);
      return;
    }

    if (propChatContext) {
      console.log("📩 Inbox received chatContext from prop:", propChatContext);
      setChatContext(propChatContext);
    }
  }, [location.state, propChatContext, currentUser]);

  // ============================================================
  // ✅ chatContext সেট হলে selectedChat অটোমেটিক সিলেক্ট করুন
  // ============================================================
  useEffect(() => {
    if (chatContext && isDataReady && chats.length > 0) {
      const chatId = chatContext.id || chatContext.postId;
      const existingChat = chats.find(c => c.id === chatId);

      if (existingChat) {
        console.log("✅ Found existing chat, selecting:", existingChat.id);
        handleSelectChatWithNormalization(existingChat);
      } else {
        console.log("⏳ Chat will be created by useInboxChats hook");
      }
    }
  }, [chatContext, isDataReady, chats]);

  // ============================================================
  // ✅ Cleanup
  // ============================================================
  useEffect(() => {
    return () => {
      setHideBottomNav?.(false);
    };
  }, []);

  // ========== Handlers ==========
  const toggleMenu = (chatId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setOpenMenuChatId(prevId => prevId === chatId ? null : chatId);
  };

  const closeMenu = () => setOpenMenuChatId(null);

  // ========== Click Outside Handler ==========
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current?.contains(event.target) || dotBtnRef.current?.contains(event.target)) {
        return;
      }
      const menuElements = document.querySelectorAll('.chat-menu-dropdown');
      let isClickInsideMenu = false;
      menuElements.forEach(el => {
        if (el.contains(event.target)) {
          isClickInsideMenu = true;
        }
      });
      if (isClickInsideMenu) return;

      setOpenMenuChatId(null);
    };

    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        setOpenMenuChatId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, []);

  // ========== Handle Select with Normalization ==========
  const handleSelectChatWithNormalization = useCallback(async (chat) => {
    closeMenu();

    if (!isDataReady) {
      console.log("⏳ Data not ready yet, waiting...");
      return;
    }

    const otherId = chat.participants?.find(p => p !== currentUser?.uid);
    if (otherId) {
      await fetchUserProfile(otherId);
    }

    const normalizedChat = createNormalizedChatObject(chat, currentUser);

    console.log("📌 Inbox - Selected Chat:", normalizedChat);

    if (normalizedChat) {
      handleSelectChat(normalizedChat);
      setIsChatReady(true);
      setHideBottomNav?.(true);
    }
  }, [isDataReady, currentUser?.uid, fetchUserProfile, handleSelectChat, setHideBottomNav]);

  // ========== Chat Interface Props ==========
  const getChatInterfaceProps = useCallback(() => {
    if (!selectedChat || !isChatReady) return null;

    return {
      chatContext: selectedChat,
      onBack: () => {
        setSelectedChat(null);
        setIsChatReady(false);
        setHideBottomNav?.(false);
        localStorage.removeItem('activeChat');
      },
      currentUser: currentUser,
      currentMode: currentMode
    };
  }, [selectedChat, isChatReady, currentUser, currentMode, setHideBottomNav]);

  // ============================================================
  // ✅ Check if chat has active deal (for UI) — reads the hook's cache
  // ============================================================
  const getChatActiveDealStatus = useCallback((chat) => {
    const otherId = chat.otherPartyId || chat.buyerId || chat.sellerId;
    if (otherId && currentUser?.uid) {
      const cacheKey = `${currentUser.uid}_${otherId}`;
      return activeDealStatus[cacheKey] || { hasActiveDeal: false, count: 0 };
    }
    return { hasActiveDeal: false, count: 0 };
  }, [currentUser?.uid, activeDealStatus]);

  // ============================================================
  // ✅ লোডিং UI
  // ============================================================
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#090d16',
        color: '#14b8a6'
      }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fa-solid fa-cube" style={{
            fontSize: '48px',
            animation: 'spin 2s linear infinite',
            display: 'block',
            marginBottom: '16px'
          }} />
          <h2>Loading Inbox...</h2>
        </div>
      </div>
    );
  }

  // ============================================================
  // ✅ Render
  // ============================================================
  const chatProps = getChatInterfaceProps();

  return (
    <div className={`inbox-page-layout ${selectedChat && isChatReady ? 'chat-active' : ''}`}>

      {/* Chat List */}
      <div className="workspace-inbox-wrapper">
        <div className="workspace-inbox">
          <InboxSearch
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />

          <InboxModeSwitcher
            currentMode={currentMode}
            handleModeChange={handleModeChange}
            getUnreadCount={getUnreadCount}
            setSelectedChat={setSelectedChat}
            setIsChatReady={setIsChatReady}
            setHideBottomNav={setHideBottomNav}
          />

          <InboxFilterTabs
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
          />

          <div className="inbox-rows-container">
            <InboxEmptyState
              loading={loading}
              searchQuery={searchQuery}
              currentMode={currentMode}
              filteredChats={filteredChats}
            />

            {!loading && isDataReady && filteredChats.map((chat) => {
              const isMenuOpen = openMenuChatId === chat.id;
              const activeDeal = getChatActiveDealStatus(chat);

              return (
                <div key={chat.id} style={{ position: 'relative' }}>
                  <InboxChatItem
                    chat={chat}
                    isSelected={selectedChat?.id === chat.id}
                    onSelect={handleSelectChatWithNormalization}
                    onMenuToggle={toggleMenu}
                    isMenuOpen={isMenuOpen}
                    menuRef={menuRef}
                    dotBtnRef={dotBtnRef}
                    getDisplayName={getDisplayName}
                    getPhotoURL={getPhotoURL}
                    getIsOnline={getIsOnline}
                    getOnlineStatusText={getOnlineStatusText}
                    currentUser={currentUser}
                    userProfiles={userProfiles}
                    hasActiveDeal={activeDeal.hasActiveDeal}
                    activeDealCount={activeDeal.count}
                  />

                  <InboxChatMenu
                    chat={chat}
                    isOpen={isMenuOpen}
                    onClose={closeMenu}
                    onDelete={handleDeleteChat}
                    onBlock={handleBlockUser}
                    onUnblock={handleUnblockUser}
                    menuRef={menuRef}
                    dotBtnRef={dotBtnRef}
                    hasActiveDeal={activeDeal.hasActiveDeal}
                    activeDealCount={activeDeal.count}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="active-chat-area">
        {selectedChat && isChatReady && chatProps ? (
          <ChatInterface {...chatProps} />
        ) : loading ? (
          <div className="no-chat-selected-message">
            <div className="loading-spinner"></div>
            <p>Loading conversation...</p>
          </div>
        ) : (
          <div className="no-chat-selected-message">
            <i className="fa-solid fa-comments" style={{fontSize: '50px', color: '#438e82'}}></i>
            <p>আপনার কনভারসেশন শুরু করতে বাম দিক থেকে একটি জব সিলেক্ট করুন।</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
