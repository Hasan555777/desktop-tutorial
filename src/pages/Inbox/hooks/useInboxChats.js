// ============================================================
// 📁 src/pages/Inbox/hooks/useInboxChats.js
// ============================================================
// Enterprise Grade - Rule Engine Integration (Production Ready)

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, setDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/firebase';

import { createNewChatObject, createNormalizedChatObject } from '../inboxHelpers';
import { useAuth } from '@/context/AuthContext';
import { useChatActions } from '@/hooks/useChatActions';
import { checkActiveDealBetweenUsers } from '@/pages/chatHelpers';
import { logger } from '@/utils/logger';

// ============================================================
// 📌 MAIN HOOK
// ============================================================

export const useInboxChats = (currentUser, currentMode, selectedChat, setSelectedChat, fetchUserProfile, chatContext) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [activeDealStatus, setActiveDealStatus] = useState({});
  const unsubscribeRef = useRef(null);
  const isMounted = useRef(true);

  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin' || userData?.isAdmin === true;

  // ✅ Block/Delete/Unblock-এর আসল লজিক এখন একটা শেয়ারড হুকে —
  // ChatInterface.jsx-ও এই একই হুক ব্যবহার করে, তাই দুই জায়গায় দুই
  // রকম (বা অসম্পূর্ণ) কোড থাকার সুযোগ নেই।
  const { handleDeleteChat: deleteChatAction, handleBlockUser: blockUserAction, handleUnblockUser: unblockUserAction } =
    useChatActions(currentUser, { isAdmin });

  // ============================================================
  // ✅ Lifecycle
  // ============================================================
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  // ============================================================
  // ✅ DELETE / BLOCK / UNBLOCK — শেয়ারড হুক wrap করা, শুধু local state
  // (chats/selectedChat) সিঙ্ক করার জন্য
  // ============================================================
  const handleDeleteChat = useCallback(async (chat) => {
    const success = await deleteChatAction(chat);
    if (success && isMounted.current) {
      setChats(prev => prev.filter(c => c.id !== chat.id));
      if (selectedChat?.id === chat.id) {
        setSelectedChat(null);
        localStorage.removeItem('activeChat');
      }
    }
  }, [deleteChatAction, selectedChat?.id, setSelectedChat]);

  const handleBlockUser = useCallback(async (chat) => {
    const success = await blockUserAction(chat);
    if (success && isMounted.current) {
      setChats(prev => prev.map(c => (c.id === chat.id ? { ...c, isBlocked: true, blockedBy: currentUser?.uid } : c)));
      if (selectedChat?.id === chat.id) {
        setSelectedChat(prev => ({ ...prev, isBlocked: true, blockedBy: currentUser?.uid }));
      }
    }
  }, [blockUserAction, currentUser?.uid, selectedChat?.id, setSelectedChat]);

  const handleUnblockUser = useCallback(async (chat) => {
    const success = await unblockUserAction(chat);
    if (success && isMounted.current) {
      setChats(prev => prev.map(c => (c.id === chat.id ? { ...c, isBlocked: false, blockedBy: null } : c)));
      if (selectedChat?.id === chat.id) {
        setSelectedChat(prev => ({ ...prev, isBlocked: false, blockedBy: null }));
      }
    }
  }, [unblockUserAction, selectedChat?.id, setSelectedChat]);

  // ============================================================
  // ✅ SELECT CHAT
  // ============================================================
  const handleSelectChat = useCallback(async (chat) => {
    const normalizedChat = createNormalizedChatObject(chat, currentUser);
    if (!normalizedChat) {
      logger.error("Failed to normalize chat data");
      return;
    }

    const otherId = normalizedChat.otherPartyId;
    if (otherId) await fetchUserProfile(otherId);

    if (isMounted.current) {
      setSelectedChat(normalizedChat);
      localStorage.setItem('activeChat', JSON.stringify({
        id: chat.id,
        otherPartyName: normalizedChat.otherPartyName,
        otherPartyPhoto: normalizedChat.otherPartyPhoto,
        fullData: normalizedChat
      }));
    }

    // Unread count রিসেট
    const userUnread = chat.unreadCount?.[currentUser?.uid] || 0;
    if (userUnread > 0) {
      try {
        const chatRef = doc(db, 'chats', chat.id);
        if (chat.unreadCount && typeof chat.unreadCount === 'object') {
          const newUnreadCount = { ...chat.unreadCount, [currentUser.uid]: 0 };
          await updateDoc(chatRef, { unreadCount: newUnreadCount });
        } else {
          await updateDoc(chatRef, { unreadCount: 0 });
        }

        if (isMounted.current) {
          setChats(prev => prev.map(c => {
            if (c.id !== chat.id) return c;
            const newUnreadCount = c.unreadCount && typeof c.unreadCount === 'object'
              ? { ...c.unreadCount, [currentUser.uid]: 0 }
              : 0;
            return { ...c, unreadCount: newUnreadCount, isUnread: false };
          }));
        }
      } catch (error) {
        logger.error("Error resetting unread count:", error);
      }
    }
  }, [currentUser, fetchUserProfile, setSelectedChat]);

  // ============================================================
  // ✅ FIREBASE QUERY — চ্যাট লিস্ট
  // ============================================================
  useEffect(() => {
    if (!currentUser?.uid) {
      setLoading(false);
      setIsDataReady(false);
      return;
    }

    setLoading(true);
    setIsDataReady(false);

    const chatsRef = collection(db, 'chats');
    const q = query(
      chatsRef,
      where('participants', 'array-contains', currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    if (unsubscribeRef.current) unsubscribeRef.current();

    unsubscribeRef.current = onSnapshot(q,
      async (snapshot) => {
        if (!isMounted.current) return;

        try {
          const fetchedChats = snapshot.docs.map(docSnap => {
            const data = docSnap.data();

            let otherId = data.participants?.find(p => p !== currentUser.uid);
            if (!otherId) {
              if (data.buyerId === currentUser.uid) otherId = data.sellerId;
              else if (data.sellerId === currentUser.uid) otherId = data.buyerId;
              else otherId = data.otherPartyId || data.userId || data.ownerId;
            }

            const isCurrentUserBuyer = data.buyerId === currentUser.uid;

            let userUnread = 0;
            if (data.unreadCount && typeof data.unreadCount === 'object') {
              userUnread = data.unreadCount[currentUser.uid] || 0;
            } else if (typeof data.unreadCount === 'number') {
              userUnread = data.unreadCount;
            }

            let otherPartyName = data.otherPartyName;
            if (!otherPartyName) {
              otherPartyName = isCurrentUserBuyer ? (data.sellerName || 'Seller') : (data.buyerName || 'Buyer');
            }

            let otherPartyPhoto = data.otherPartyPhoto;
            if (!otherPartyPhoto) {
              otherPartyPhoto = isCurrentUserBuyer ? (data.sellerPhoto || null) : (data.buyerPhoto || null);
            }

            return {
              id: docSnap.id,
              ...data,
              otherPartyId: otherId,
              otherPartyName: otherPartyName || 'User',
              otherPartyPhoto: otherPartyPhoto || null,
              otherPartyRole: data.otherPartyRole || 'client',
              otherPartyEmail: data.otherPartyEmail || '',
              initial: (otherPartyName || 'U').charAt(0).toUpperCase(),
              gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
              isUnread: userUnread > 0,
              userUnreadCount: userUnread,
              // isActiveDeal এখানে static false রাখা হয়েছে — আসল মান নিচের
              // active-deal cache effect থেকে ডেরাইভ করে UI-লেয়ারে (Inbox.jsx-এর
              // getChatActiveDealStatus) বসানো হয়, কারণ deal status জানতে
              // আলাদা Firestore query লাগে যা এখানে সিঙ্ক্রোনাসভাবে করা যায় না।
              isActiveDeal: false,
              isOnline: data.isOnline || false,
              time: data.updatedAt?.toDate?.()?.toLocaleTimeString() || 'Just now',
              preview: data.lastMessage || 'Start conversation',
              tag: data.postTitle || 'Chat',
              isBlocked: data.isBlocked === true && data.blockedBy === currentUser?.uid,
              isBlockedByOther: data.isBlocked === true && !!data.blockedBy && data.blockedBy !== currentUser?.uid,
              blockedBy: data.blockedBy || null
            };
          });

          let filteredByMode = fetchedChats;
          if (currentMode === 'buyer') {
            filteredByMode = fetchedChats.filter(c => c.buyerId === currentUser.uid);
          } else if (currentMode === 'seller') {
            filteredByMode = fetchedChats.filter(c => c.sellerId === currentUser.uid);
          }

          filteredByMode.sort((a, b) => {
            const timeA = a.updatedAt?.toDate?.() || new Date(0);
            const timeB = b.updatedAt?.toDate?.() || new Date(0);
            return timeB - timeA;
          });

          if (isMounted.current) {
            setChats(filteredByMode);
            setLoading(false);
            setIsInitialLoad(false);
            setIsDataReady(true);
          }

          const uniqueUserIds = new Set();
          filteredByMode.forEach(chat => {
            if (chat.otherPartyId) uniqueUserIds.add(chat.otherPartyId);
            if (chat.buyerId) uniqueUserIds.add(chat.buyerId);
            if (chat.sellerId) uniqueUserIds.add(chat.sellerId);
          });

          await Promise.all(
            Array.from(uniqueUserIds).map(userId =>
              userId && userId !== currentUser.uid ? fetchUserProfile(userId) : Promise.resolve(null)
            )
          );
        } catch (error) {
          logger.error("Error processing chats:", error);
          if (isMounted.current) {
            setLoading(false);
            setIsDataReady(false);
          }
        }
      },
      (error) => {
        logger.error("Error loading chats:", error);
        if (isMounted.current) {
          setLoading(false);
          setIsDataReady(false);
        }
      }
    );

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
    // fetchUserProfile-এর identity এখন useUserProfiles.js-এর ফিক্সের পর
    // স্থায়ী, তাই এটা dependency-তে থাকলেও আর listener বারবার
    // resubscribe করাবে না।
  }, [currentUser?.uid, currentMode, fetchUserProfile]);

  // ============================================================
  // ✅ ACTIVE DEAL CACHE — প্রতিটা লোড হওয়া চ্যাটের অন্য পক্ষের সাথে
  // active deal আছে কিনা প্রোঅ্যাক্টিভলি চেক করে cache পপুলেট করে।
  //
  // FIX: আগে এই cache শুধুমাত্র delete/block চেষ্টা করার সময় populate
  // হতো (checkActiveDealWithUser শুধু ওই দুই হ্যান্ডলারের ভেতরে কল হতো)।
  // ফলে Inbox.jsx-এর getChatActiveDealStatus সবসময় খালি cache থেকে
  // পড়ত এবং "⚡ Active Deal" ব্যাজ/মেনু-আইটেম কখনো দেখাই যেত না।
  // এখন চ্যাট লিস্ট লোড হওয়ার সাথে সাথে (এবং নতুন চ্যাট যোগ হলে) প্রতিটা
  // না-চেক-করা অন্য পক্ষের জন্য এই চেক ব্যাকগ্রাউন্ডে চলে।
  // ============================================================
  useEffect(() => {
    if (!currentUser?.uid || chats.length === 0) return;

    const pending = chats.filter(c => {
      if (!c.otherPartyId) return false;
      const key = `${currentUser.uid}_${c.otherPartyId}`;
      return !(key in activeDealStatus);
    });
    if (pending.length === 0) return;

    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        pending.map(c => checkActiveDealBetweenUsers(currentUser.uid, c.otherPartyId))
      );
      if (cancelled || !isMounted.current) return;

      setActiveDealStatus(prev => {
        const next = { ...prev };
        pending.forEach((c, i) => {
          next[`${currentUser.uid}_${c.otherPartyId}`] = results[i];
        });
        return next;
      });
    })();

    return () => { cancelled = true; };
  }, [chats, currentUser?.uid, activeDealStatus]);

  // ============================================================
  // ✅ NEW CHAT CREATION
  // ============================================================
  useEffect(() => {
    if (!chatContext || !currentUser?.uid || !isDataReady) return;

    const chatId = chatContext.id || chatContext.postId;
    if (!chatId) return;

    const existingChat = chats.find(c => c.id === chatId);

    if (!existingChat) {
      const newChat = createNewChatObject(chatContext, currentUser);
      const chatRef = doc(db, 'chats', chatId);
      setDoc(chatRef, newChat).catch(error => logger.error("Error creating chat:", error));

      if (isMounted.current) {
        setChats(prev => {
          const exists = prev.some(c => c.id === chatId);
          if (exists) return prev;
          return [newChat, ...prev];
        });
        setSelectedChat(newChat);
      }
    } else if (isMounted.current && !selectedChat) {
      handleSelectChat(existingChat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatContext, currentUser, isDataReady]);

  // ============================================================
  // ✅ LOCAL STORAGE RESTORE
  // ============================================================
  useEffect(() => {
    if (!isInitialLoad && isDataReady && !selectedChat && chats.length > 0) {
      const savedChat = localStorage.getItem('activeChat');
      if (savedChat) {
        try {
          const parsedChat = JSON.parse(savedChat);
          const foundChat = chats.find(c => c.id === parsedChat.id);
          if (foundChat) {
            handleSelectChat(foundChat);
          } else {
            localStorage.removeItem('activeChat');
          }
        } catch {
          localStorage.removeItem('activeChat');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, isInitialLoad, isDataReady]);

  // ============================================================
  // 📌 RETURN
  // ============================================================
  return {
    chats,
    setChats,
    loading,
    isInitialLoad,
    isDataReady,
    handleDeleteChat,
    handleBlockUser,
    handleUnblockUser,
    handleSelectChat,
    setSelectedChat,
    activeDealStatus
  };
};
