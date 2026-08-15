// ============================================================
// 📁 src/hooks/useInboxChats.js
// ============================================================
// Enterprise Grade - Rule Engine Integration (Production Ready)

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, setDoc, updateDoc, getDocs, writeBatch, deleteDoc, getDoc,
  serverTimestamp, runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { createNewChatObject, createNormalizedChatObject } from '../pages/inboxHelpers';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useAuth } from '@/context/AuthContext';

// ✅ Import Rule Engine
import { chatRules } from '@/rules/chatRules';
import { ACTIVE_DEAL_STATUSES } from '@/rules/dealRules';

// ✅ Import Active Deal Check
import { checkActiveDealBetweenUsers } from '@/pages/chatHelpers';

// ============================================================
// 📌 HELPER: getDisplayName
// ============================================================

const getDisplayName = (chat) => {
  if (!chat) return 'Unknown User';
  return chat.otherPartyName ||
    chat.buyerName ||
    chat.sellerName ||
    chat.displayName ||
    chat.email?.split('@')[0] ||
    'Unknown User';
};

// ============================================================
// 📌 HELPER: extractOtherUserId (Enhanced Safe ID Extraction)
// ============================================================

const extractOtherUserId = (chat, currentUserId) => {
  if (!chat) return null;
  if (!currentUserId) return null;

  // Try all possible fields
  let targetId = chat.otherPartyId;

  if (!targetId) {
    if (chat.buyerId && chat.buyerId !== currentUserId) {
      targetId = chat.buyerId;
    } else if (chat.sellerId && chat.sellerId !== currentUserId) {
      targetId = chat.sellerId;
    } else if (Array.isArray(chat.participants) && chat.participants.length > 0) {
      targetId = chat.participants.find(id => id !== currentUserId);
    } else if (chat.userId && chat.userId !== currentUserId) {
      targetId = chat.userId;
    } else if (chat.ownerId && chat.ownerId !== currentUserId) {
      targetId = chat.ownerId;
    }
  }

  // Last resort: try to find any ID that's not the current user
  if (!targetId) {
    const allIds = [
      chat.otherPartyId,
      chat.buyerId,
      chat.sellerId,
      chat.userId,
      chat.ownerId,
      ...(chat.participants || [])
    ].filter(id => id && id !== currentUserId);

    if (allIds.length > 0) {
      targetId = allIds[0];
    }
  }

  return targetId || null;
};

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
  const feedback = useFeedback();

  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin' || userData?.isAdmin === true;

  // ============================================================
  // ✅ Lifecycle
  // ============================================================

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // ============================================================
  // ✅ CHECK ACTIVE DEAL BETWEEN USERS
  // ============================================================

  const checkActiveDealWithUser = async (otherUserId) => {
    if (!currentUser?.uid || !otherUserId) {
      return { hasActiveDeal: false, count: 0, activeDeals: [] };
    }

    // Check cache first
    const cacheKey = `${currentUser.uid}_${otherUserId}`;
    if (activeDealStatus[cacheKey]) {
      return activeDealStatus[cacheKey];
    }

    try {
      const result = await checkActiveDealBetweenUsers(currentUser.uid, otherUserId);

      // Cache the result
      setActiveDealStatus(prev => ({
        ...prev,
        [cacheKey]: result
      }));

      return result;
    } catch (error) {
      console.error('❌ Error checking active deal:', error);
      return { hasActiveDeal: false, count: 0, activeDeals: [] };
    }
  };

  // ============================================================
  // ✅ DELETE CHAT — Enterprise Grade (with Active Deal Check)
  // ============================================================

  const handleDeleteChat = async (chat) => {
    // 🔍 Safe ID Extraction
    let targetUserId = extractOtherUserId(chat, currentUser?.uid);

    // 🔍 If still not found, try to get from chatContext
    if (!targetUserId && chatContext) {
      targetUserId = chatContext.otherPartyId || chatContext.userId || chatContext.buyerId || chatContext.sellerId;
    }

    // 📋 Log for debugging
    console.log('🔍 Delete Chat - Debug Info:', {
      chatId: chat?.id,
      targetUserId,
      chatOtherPartyId: chat?.otherPartyId,
      chatBuyerId: chat?.buyerId,
      chatSellerId: chat?.sellerId,
      chatParticipants: chat?.participants,
      chatUserId: chat?.userId,
      chatOwnerId: chat?.ownerId,
      chatContext: chatContext ? { otherPartyId: chatContext.otherPartyId, userId: chatContext.userId } : null
    });

    // ⛔ Early Guard: আইডি না পাওয়া গেলে
    if (!targetUserId || !currentUser?.uid) {
      console.error("❌ Delete Aborted: Missing valid target user ID", { chatId: chat?.id, targetUserId });
      feedback.alert.error({
        message: 'ইউজার আইডেন্টিফাই করা যায়নি! দয়া করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।'
      });
      return;
    }

    // ── Check Active Deal First ──
    const { hasActiveDeal, count, activeDeals } = await checkActiveDealWithUser(targetUserId);

    if (hasActiveDeal) {
      const dealTitles = activeDeals.map(d => d.postTitle || 'Untitled Deal').join(', ');
      feedback.alert.warning({
        message: `⛔ Active Deal থাকার কারণে চ্যাট ডিলিট করা যাচ্ছে না!\n\nআপনার ${count} টি Active Deal আছে:\n${dealTitles}\n\nActive Deal শেষ না হওয়া পর্যন্ত চ্যাট ডিলিট করা যাবে না।`
      });
      return;
    }

    // ── Rule Check ──
    const isChatOwner = chat.participants && Array.isArray(chat.participants)
      ? chat.participants.includes(currentUser?.uid)
      : false;

    const rule = chatRules.canDeleteConversation({
      userId: currentUser?.uid,
      chatId: chat.id,
      isAdmin: isAdmin,
      isChatOwner: isChatOwner,
      hasActiveDeal: chat.isActiveDeal || false,
      isGroupChat: chat.isGroupChat || false
    });

    if (!rule.allowed) {
      feedback.alert.warning({
        message: rule.message
      });
      return;
    }

    // ── User Confirmation ──
    const confirmed = await feedback.confirm({
      title: 'চ্যাট ডিলিট করুন',
      message: '⚠️ আপনি কি এই কনভার্সেশন স্থায়ীভাবে ডিলিট করতে চান?',
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'না'
    });

    if (!confirmed) return;

    try {
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, 'chats', chat.id, 'messages');
        const messagesSnapshot = await getDocs(messagesRef);

        messagesSnapshot.docs.forEach(doc => {
          transaction.delete(doc.ref);
        });

        transaction.delete(doc(db, 'chats', chat.id));
      });

      if (isMounted.current) {
        setChats(prev => prev.filter(c => c.id !== chat.id));
        if (selectedChat?.id === chat.id) {
          setSelectedChat(null);
          localStorage.removeItem('activeChat');
        }
      }

      feedback.alert.success({
        message: '✅ কনভার্সেশন সফলভাবে ডিলিট করা হয়েছে!'
      });

    } catch (error) {
      console.error("❌ Delete error:", error);
      feedback.alert.error({
        message: 'কনভার্সেশন ডিলিট করতে ব্যর্থ হয়েছে: ' + error.message
      });
    }
  };

  // ============================================================
  // ✅ BLOCK USER — Enterprise Grade (with Active Deal Check)
  // ============================================================

  const handleBlockUser = async (chat) => {
    // 🔍 Safe ID Extraction
    let targetUserId = extractOtherUserId(chat, currentUser?.uid);

    // 🔍 If still not found, try to get from chatContext
    if (!targetUserId && chatContext) {
      targetUserId = chatContext.otherPartyId || chatContext.userId || chatContext.buyerId || chatContext.sellerId;
    }

    // 📋 Log for debugging
    console.log('🔍 Block User - Debug Info:', {
      chatId: chat?.id,
      targetUserId,
      chatOtherPartyId: chat?.otherPartyId,
      chatBuyerId: chat?.buyerId,
      chatSellerId: chat?.sellerId,
      chatParticipants: chat?.participants,
      chatUserId: chat?.userId,
      chatOwnerId: chat?.ownerId,
      chatContext: chatContext ? { otherPartyId: chatContext.otherPartyId, userId: chatContext.userId } : null
    });

    // ⛔ Early Guard: আইডি না পাওয়া গেলে
    if (!targetUserId || !currentUser?.uid) {
      console.error("❌ Block Aborted: Missing valid target user ID", { chatId: chat?.id, targetUserId });
      feedback.alert.error({
        message: 'ইউজার আইডেন্টিফাই করা যায়নি! দয়া করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।'
      });
      return;
    }

    const userName = getDisplayName(chat);

    // ── Check Active Deal First ──
    const { hasActiveDeal, count, activeDeals } = await checkActiveDealWithUser(targetUserId);

    if (hasActiveDeal) {
      const dealTitles = activeDeals.map(d => d.postTitle || 'Untitled Deal').join(', ');
      feedback.alert.warning({
        message: `⛔ Active Deal থাকার কারণে ${userName} কে ব্লক করা যাচ্ছে না!\n\nআপনার ${count} টি Active Deal আছে:\n${dealTitles}\n\nActive Deal শেষ না হওয়া পর্যন্ত ব্লক করা যাবে না।`
      });
      return;
    }

    // ── Rule Check ──
    const rule = chatRules.canBlockUser({
      blockerId: currentUser?.uid,
      targetId: targetUserId,
      targetRole: chat.otherPartyRole || 'client',
      hasActiveDealWithTarget: chat.isActiveDeal || false,
      isAdmin: isAdmin,
      blockCount: chats && Array.isArray(chats)
        ? chats.filter(c => c.isBlocked && c.blockedBy === currentUser?.uid).length
        : 0
    });

    if (!rule.allowed) {
      feedback.alert.warning({
        message: rule.message
      });
      return;
    }

    // ── User Confirmation ──
    const confirmed = await feedback.confirm({
      title: 'ইউজার ব্লক করুন',
      message: `⚠️ আপনি কি ${userName} কে ব্লক করতে চান?`,
      confirmText: 'হ্যাঁ, ব্লক করুন',
      cancelText: 'না'
    });

    if (!confirmed) return;

    try {
      // 🔒 Safe Document Reference
      const blockDocId = `${currentUser.uid}_${targetUserId}`;
      const blockRef = doc(db, 'userBlocks', blockDocId);

      await runTransaction(db, async (transaction) => {
        // 🔒 Safe Data Object (কোনো undefined মান থাকবে না)
        transaction.set(blockRef, {
          blockerId: String(currentUser.uid),
          blockedId: String(targetUserId),
          blockedUserName: String(userName),
          blockedUserEmail: String(chat.otherPartyEmail || ''),
          reason: rule.data?.blockReason || 'User requested block',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        const chatRef = doc(db, 'chats', chat.id);
        transaction.update(chatRef, {
          isBlocked: true,
          blockedBy: String(currentUser.uid),
          blockRef: blockRef.path,
          blockedAt: serverTimestamp()
        });
      });

      if (isMounted.current) {
        setChats(prev => prev.map(c => {
          if (c.id === chat.id) {
            return { ...c, isBlocked: true, blockedBy: currentUser?.uid };
          }
          return c;
        }));

        if (selectedChat?.id === chat.id) {
          setSelectedChat(prev => ({ ...prev, isBlocked: true, blockedBy: currentUser?.uid }));
        }
      }

      feedback.alert.success({
        message: `✅ ${userName} কে ব্লক করা হয়েছে!`
      });

    } catch (error) {
      console.error("❌ Block error in Firestore Transaction:", error);
      feedback.alert.error({
        message: 'ইউজার ব্লক করতে ব্যর্থ হয়েছে: ' + error.message
      });
    }
  };

  // ============================================================
  // ✅ UNBLOCK USER — Enterprise Grade
  // ============================================================

  const handleUnblockUser = async (chat) => {
    // 🔍 Safe ID Extraction
    let targetUserId = extractOtherUserId(chat, currentUser?.uid);

    // 🔍 If still not found, try to get from chatContext
    if (!targetUserId && chatContext) {
      targetUserId = chatContext.otherPartyId || chatContext.userId || chatContext.buyerId || chatContext.sellerId;
    }

    // 📋 Log for debugging
    console.log('🔍 Unblock User - Debug Info:', {
      chatId: chat?.id,
      targetUserId,
      chatContext: chatContext ? { otherPartyId: chatContext.otherPartyId, userId: chatContext.userId } : null
    });

    if (!targetUserId || !currentUser?.uid) {
      console.error("❌ Unblock Aborted: Missing valid target user ID", { chatId: chat?.id, targetUserId });
      feedback.alert.error({
        message: 'ইউজার আইডেন্টিফাই করা যায়নি! দয়া করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।'
      });
      return;
    }

    const userName = getDisplayName(chat);

    // ── Rule Check ──
    const rule = chatRules.canUnblockUser({
      blockerId: currentUser?.uid,
      targetId: targetUserId,
      isAdmin: isAdmin
    });

    if (!rule.allowed) {
      feedback.alert.warning({
        message: rule.message
      });
      return;
    }

    // ── User Confirmation ──
    const confirmed = await feedback.confirm({
      title: 'ইউজার আনব্লক করুন',
      message: `⚠️ আপনি কি ${userName} কে আনব্লক করতে চান?`,
      confirmText: 'হ্যাঁ, আনব্লক করুন',
      cancelText: 'না'
    });

    if (!confirmed) return;

    try {
      await runTransaction(db, async (transaction) => {
        const blockRef = doc(db, 'userBlocks', `${currentUser?.uid}_${targetUserId}`);
        transaction.delete(blockRef);

        const chatRef = doc(db, 'chats', chat.id);
        transaction.update(chatRef, {
          isBlocked: false,
          blockedBy: null,
          blockRef: null,
          blockedAt: null
        });
      });

      if (isMounted.current) {
        setChats(prev => prev.map(c => {
          if (c.id === chat.id) {
            return { ...c, isBlocked: false, blockedBy: null };
          }
          return c;
        }));

        if (selectedChat?.id === chat.id) {
          setSelectedChat(prev => ({ ...prev, isBlocked: false, blockedBy: null }));
        }
      }

      feedback.alert.success({
        message: `✅ ${userName} কে আনব্লক করা হয়েছে!`
      });

    } catch (error) {
      console.error("❌ Unblock error:", error);
      feedback.alert.error({
        message: 'ইউজার আনব্লক করতে ব্যর্থ হয়েছে: ' + error.message
      });
    }
  };

  // ============================================================
  // ✅ SELECT CHAT
  // ============================================================

  const handleSelectChat = async (chat) => {
    const normalizedChat = createNormalizedChatObject(chat, currentUser);

    if (!normalizedChat) {
      console.error("❌ Failed to normalize chat data");
      return;
    }

    const otherId = normalizedChat.otherPartyId;
    if (otherId) {
      await fetchUserProfile(otherId);
    }

    if (isMounted.current) {
      setSelectedChat(normalizedChat);

      localStorage.setItem('activeChat', JSON.stringify({
        id: chat.id,
        otherPartyName: normalizedChat.otherPartyName,
        otherPartyPhoto: normalizedChat.otherPartyPhoto,
        fullData: normalizedChat
      }));
    }

    // Reset unread count
    const userUnread = chat.unreadCount?.[currentUser?.uid] || 0;
    if (userUnread > 0) {
      try {
        const chatRef = doc(db, 'chats', chat.id);
        if (chat.unreadCount && typeof chat.unreadCount === 'object') {
          const newUnreadCount = { ...chat.unreadCount };
          newUnreadCount[currentUser.uid] = 0;
          await updateDoc(chatRef, { unreadCount: newUnreadCount });
        } else {
          await updateDoc(chatRef, { unreadCount: 0 });
        }

        if (isMounted.current) {
          setChats(prev => prev.map(c => {
            if (c.id === chat.id) {
              const newUnreadCount = c.unreadCount && typeof c.unreadCount === 'object'
                ? { ...c.unreadCount, [currentUser.uid]: 0 }
                : 0;
              return { ...c, unreadCount: newUnreadCount, isUnread: false };
            }
            return c;
          }));
        }
      } catch (error) {
        console.error("Error resetting unread count:", error);
      }
    }
  };

  // ============================================================
  // ✅ FIREBASE QUERY
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

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    unsubscribeRef.current = onSnapshot(q,
      async (snapshot) => {
        if (!isMounted.current) return;

        try {
          const fetchedChats = snapshot.docs.map(doc => {
            const data = doc.data();

            let otherId = data.participants?.find(p => p !== currentUser.uid);
            if (!otherId) {
              if (data.buyerId === currentUser.uid) {
                otherId = data.sellerId;
              } else if (data.sellerId === currentUser.uid) {
                otherId = data.buyerId;
              } else {
                otherId = data.otherPartyId || data.userId || data.ownerId;
              }
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
              if (isCurrentUserBuyer) {
                otherPartyName = data.sellerName || 'Seller';
              } else {
                otherPartyName = data.buyerName || 'Buyer';
              }
            }

            let otherPartyPhoto = data.otherPartyPhoto;
            if (!otherPartyPhoto) {
              if (isCurrentUserBuyer) {
                otherPartyPhoto = data.sellerPhoto || null;
              } else {
                otherPartyPhoto = data.buyerPhoto || null;
              }
            }

              const isActiveDeal = false;
              
            return {
              id: doc.id,
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
              isActiveDeal: isActiveDeal,
              isOnline: data.isOnline || false,
              time: data.updatedAt?.toDate?.()?.toLocaleTimeString() || 'Just now',
              preview: data.lastMessage || 'Start conversation',
              tag: data.postTitle || 'Chat',
              isBlocked: data.isBlocked === true && data.blockedBy === currentUser?.uid,
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
            if (chat.otherPartyId) {
              uniqueUserIds.add(chat.otherPartyId);
            }
            if (chat.buyerId) uniqueUserIds.add(chat.buyerId);
            if (chat.sellerId) uniqueUserIds.add(chat.sellerId);
          });

          const fetchPromises = Array.from(uniqueUserIds).map(userId => {
            if (userId && userId !== currentUser.uid) {
              return fetchUserProfile(userId);
            }
            return Promise.resolve(null);
          });

          await Promise.all(fetchPromises);

          console.log("✅ Profiles fetched for users:", Array.from(uniqueUserIds));

        } catch (error) {
          console.error("Error processing chats:", error);
          if (isMounted.current) {
            setLoading(false);
            setIsDataReady(false);
          }
        }
      },
      (error) => {
        console.error("Error loading chats:", error);
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
  }, [currentUser?.uid, currentMode, fetchUserProfile]);

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
      setDoc(chatRef, newChat).catch(console.error);

      if (isMounted.current) {
        setChats(prev => {
          const exists = prev.some(c => c.id === chatId);
          if (exists) return prev;
          return [newChat, ...prev];
        });
        setSelectedChat(newChat);
      }
    } else {
      if (isMounted.current && !selectedChat) {
        handleSelectChat(existingChat);
      }
    }
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
        } catch (e) {
          localStorage.removeItem('activeChat');
        }
      }
    }
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
    checkActiveDealWithUser, // ✅ Export for external use
    activeDealStatus // ✅ Export for UI
  };
};