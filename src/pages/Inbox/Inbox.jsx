



// src/pages/Inbox/Inbox.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import ChatInterface from '@/pages/ChatInterface';
import styles from './Inbox.module.css';

import { createNormalizedChatObject } from './inboxHelpers';

import { useUserProfiles } from '@/hooks/useUserProfiles';
import { useInboxChats } from './hooks/useInboxChats';
import { useInboxFilters } from './hooks/useInboxFilters';

import InboxChatItem from './components/InboxChatItem';
import { InboxSearch, InboxModeSwitcher, InboxFilterTabs, InboxEmptyState } from './components/InboxListControls';
import InboxChatMenu from './components/InboxChatMenu';

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
    activeDealStatus
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
  // ✅ Mode Change Handler
  // ============================================================
  const handleModeChange = useCallback((mode) => {
    setSelectedChat(null);
    setIsChatReady(false);
    setHideBottomNav?.(false);
    localStorage.removeItem('activeChat');

    setCurrentMode(mode);
    localStorage.setItem('inboxMode', mode);
  }, [setHideBottomNav]);

  // ============================================================
  // ✅ location.state থেকে chatContext নেওয়া
  // ============================================================
  useEffect(() => {
    if (location.state?.chatContext) {
      setChatContext(location.state.chatContext);
      window.history.replaceState({}, document.title);
      return;
    }

    if (location.state?.job && location.state?.openChat) {
      const job = location.state.job;

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

      setChatContext(newChatContext);
      window.history.replaceState({}, document.title);
      return;
    }

    if (propChatContext) {
      setChatContext(propChatContext);
    }
  }, [location.state, propChatContext, currentUser]);

  // ============================================================
  // ✅ chatContext সেট হলে selectedChat অটোমেটিক সিলেক্ট
  // ============================================================
  useEffect(() => {
    if (chatContext && isDataReady && chats.length > 0) {
      const chatId = chatContext.id || chatContext.postId;
      const existingChat = chats.find(c => c.id === chatId);
      if (existingChat) {
        handleSelectChatWithNormalization(existingChat);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatContext, isDataReady, chats]);

  // ============================================================
  // ✅ Cleanup
  // ============================================================
  useEffect(() => {
    return () => {
      setHideBottomNav?.(false);
    };
  }, []);

  // ============================================================
  // ✅ Fixed Menu Toggle Handler (ক্রস ও ডট বাটন ফিক্স)
  // ============================================================
  const toggleMenu = useCallback((chatId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    setOpenMenuChatId(prevId => {
      // যদি null পাঠানো হয় অথবা একই আইডিতে আবার ক্লিক করা হয়, তবে বন্ধ হবে
      if (!chatId || prevId === chatId) {
        return null;
      }
      return chatId;
    });
  }, []);

  const closeMenu = useCallback(() => setOpenMenuChatId(null), []);

  // ========== Click Outside Handler ==========
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current?.contains(event.target) || dotBtnRef.current?.contains(event.target)) {
        return;
      }
      const menuElements = document.querySelectorAll('.chat-menu-dropdown');
      let isClickInsideMenu = false;
      menuElements.forEach(el => {
        if (el.contains(event.target)) isClickInsideMenu = true;
      });
      if (isClickInsideMenu) return;

      setOpenMenuChatId(null);
    };

    const handleEscKey = (event) => {
      if (event.key === 'Escape') setOpenMenuChatId(null);
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

    if (!isDataReady) return;

    const otherId = chat.participants?.find(p => p !== currentUser?.uid);
    if (otherId) await fetchUserProfile(otherId);

    const normalizedChat = createNormalizedChatObject(chat, currentUser);

    if (normalizedChat) {
      handleSelectChat(normalizedChat);
      setIsChatReady(true);
      setHideBottomNav?.(true);
    }
  }, [isDataReady, currentUser, fetchUserProfile, handleSelectChat, setHideBottomNav, closeMenu]);

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
      currentUser,
      currentMode
    };
  }, [selectedChat, isChatReady, currentUser, currentMode, setHideBottomNav]);

  // ============================================================
  // ✅ Active Deal স্ট্যাটাস — হুকের cache থেকে পড়ে
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
    <div className={`${styles.inboxPageLayout} ${selectedChat && isChatReady ? styles.chatActive : ''}`}>

      {/* Chat List */}
      <div className={styles.workspaceInboxWrapper}>
        <div className={styles.workspaceInbox}>
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

          <div className={styles.inboxRowsContainer}>
            <InboxEmptyState
              loading={loading}
              searchQuery={searchQuery}
              currentMode={currentMode}
              filteredChats={filteredChats}
            />

            {isDataReady && filteredChats.map((chat) => {
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
      <div className={styles.activeChatArea}>
        {selectedChat && isChatReady && chatProps ? (
          <ChatInterface {...chatProps} />
        ) : (
          <div className={styles.noChatSelectedMessage}>
            <i className="fa-solid fa-comments" style={{ fontSize: '50px', color: '#438e82' }}></i>
            <p>আপনার কনভারসেশন শুরু করতে বাম দিক থেকে একটি জব সিলেক্ট করুন।</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;







// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {

//     function isSignedIn() {
//       return request.auth != null;
//     }
//     function isParticipant(chatData) {
//       return isSignedIn() && request.auth.uid in chatData.participants;
//     }
//     function isDealParty(dealData) {
//       return isSignedIn() &&
//         (dealData.buyerId == request.auth.uid || dealData.sellerId == request.auth.uid);
//     }

//     // ============================================================
//     // chats
//     // ============================================================
//     match /chats/{chatId} {
//       allow read: if isParticipant(resource.data);

//       allow create: if isSignedIn()
//         && request.auth.uid in request.resource.data.participants
//         && (request.auth.uid == request.resource.data.buyerId
//             || request.auth.uid == request.resource.data.sellerId);

//       allow update: if isParticipant(resource.data);
//       allow delete: if isParticipant(resource.data);

//       match /messages/{messageId} {
//         allow read: if isParticipant(get(/databases/$(database)/documents/chats/$(chatId)).data);

//         allow create: if isParticipant(get(/databases/$(database)/documents/chats/$(chatId)).data)
//           && (request.resource.data.senderId == request.auth.uid
//               || request.resource.data.senderId == 'system');

//         // নিজের মেসেজ এডিট করা যাবে; পুরো চ্যাট ডিলিট করার সময়
//         // (useChatActions.js-এর transaction bulk-delete করে) participant
//         // যেকোনো মেসেজ delete করতে পারবে — এটা ইচ্ছাকৃতভাবে loose,
//         // কারণ bulk delete-এর জন্য দরকার।
//         allow update: if isParticipant(get(/databases/$(database)/documents/chats/$(chatId)).data)
//           && resource.data.senderId == request.auth.uid;
//         allow delete: if isParticipant(get(/databases/$(database)/documents/chats/$(chatId)).data);
//       }
//     }

//     // ============================================================
//     // userBlocks — doc id প্যাটার্ন: {blockerId}_{blockedId}
//     // ============================================================
//     match /userBlocks/{blockDocId} {
//       allow create: if isSignedIn()
//         && request.resource.data.blockerId == request.auth.uid
//         && blockDocId == request.auth.uid + '_' + request.resource.data.blockedId;

//       allow read: if isSignedIn()
//         && (resource.data.blockerId == request.auth.uid || resource.data.blockedId == request.auth.uid);

//       allow delete: if isSignedIn() && resource.data.blockerId == request.auth.uid;
//       allow update: if false; // mutate না করে delete + recreate করাই নিরাপদ
//     }

//     // ============================================================
//     // deals
//     // ============================================================
//     match /deals/{dealId} {
//       allow read: if isDealParty(resource.data);

//       allow create: if isSignedIn()
//         && request.resource.data.proposedBy == request.auth.uid
//         && request.auth.uid in [request.resource.data.buyerId, request.resource.data.sellerId]
//         && request.resource.data.status == 'pending';

//       // status ট্রানজিশনের ওপর আরও কড়াকড়ি চাইলে (যেমন pending→active শুধু
//       // non-proposer করতে পারবে) এখানে যোগ করা যায়; বর্তমানে দুই পক্ষের
//       // যেকেউ আপডেট করতে পারবে।
//       allow update: if isDealParty(resource.data);

//       allow delete: if false; // ডিল কখনো hard-delete না করাই নিরাপদ, শুধু status বদলাক
//     }

//     // ============================================================
//     // notifications
//     // ============================================================
//     match /notifications/{notifId} {
//       allow read, update: if isSignedIn() && resource.data.userId == request.auth.uid;

//       // client সরাসরি notification লিখতে পারে, কিন্তু senderId নিজের uid
//       // (বা 'system') না হলে অন্যের নামে ভুয়া নোটিফিকেশন পাঠানো ঠেকানো
//       // হচ্ছে। দীর্ঘমেয়াদে এটা Cloud Function-এ সরানো বেশি নিরাপদ।
//       allow create: if isSignedIn()
//         && (request.resource.data.senderId == request.auth.uid
//             || request.resource.data.senderId == null
//             || request.resource.data.senderId == 'system');

//       allow delete: if isSignedIn() && resource.data.userId == request.auth.uid;
//     }

//     // ============================================================
//     // users
//     // ============================================================
//     match /users/{userId} {
//       allow read: if isSignedIn();
//       allow update: if isSignedIn() && request.auth.uid == userId;
//       allow create: if isSignedIn() && request.auth.uid == userId;
//       allow delete: if false;
//     }

//     // ============================================================
//     // metadata/dealCounter — generateDealId() transaction এখান থেকে পড়ে/লেখে
//     // ============================================================
//     match /metadata/dealCounter {
//       allow read: if isSignedIn();
//       allow update: if isSignedIn()
//         && request.resource.data.count == resource.data.count + 1
//         && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['count']);
//       allow create: if isSignedIn();
//       allow delete: if false;
//     }

//     // ============================================================
//     // guides — DealGuideModal.jsx লাইভ-লোড করে, শুধু admin এডিট করতে পারবে
//     // ============================================================
//     match /guides/{guideId} {
//       allow read: if isSignedIn();
//       allow write: if isSignedIn()
//         && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
//     }
//   }
// }
