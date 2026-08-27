// src/hooks/useChatMessages.js

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import {
  collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, deleteDoc, doc, updateDoc, getDoc, increment
} from 'firebase/firestore';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';
import { logger } from '@/utils/logger';

export const useChatMessages = (chatId, currentUser) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const feedback = useFeedback();

  // রিফ্রেশে পুরনো মেসেজের জন্য বারবার নোটিফিকেশন-সাউন্ড ট্রিগার না হওয়ার জন্য
  const processedMessageIds = useRef(new Set());
  const lastPlayedTimeRef = useRef(0);
  const initialSnapshotLoaded = useRef(false);

  const cleanupProcessedIds = () => {
    if (processedMessageIds.current.size > 300) {
      const ids = Array.from(processedMessageIds.current);
      processedMessageIds.current = new Set(ids.slice(-300));
    }
  };

  useEffect(() => {
    if (!chatId || typeof chatId !== 'string') {
      setLoading(false);
      return;
    }

    initialSnapshotLoaded.current = false;

    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const changes = snapshot.docChanges();

        // প্রথম স্ন্যাপশট: শুধু সব মেসেজ processed হিসেবে চিহ্নিত করো, কোনো
        // নোটিফিকেশন-সাউন্ড ট্রিগার হবে না (পেজ রিফ্রেশে পুরনো মেসেজের জন্য
        // notification আসাটা অনাকাঙ্ক্ষিত)
        if (!initialSnapshotLoaded.current) {
          snapshot.docs.forEach((d) => processedMessageIds.current.add(d.id));
          initialSnapshotLoaded.current = true;
          setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
          return;
        }

        for (const change of changes) {
          if (change.type === 'added') {
            const messageData = change.doc.data();
            const messageId = change.doc.id;

            if (processedMessageIds.current.has(messageId)) continue;
            processedMessageIds.current.add(messageId);

            const isFromOtherUser = messageData.senderId !== currentUser?.uid;
            const isDebounced = Date.now() - lastPlayedTimeRef.current > 500;

            // প্রকৃত নোটিফিকেশন-সাউন্ড NotificationProvider হ্যান্ডেল করে;
            // এখানে শুধু debounce টাইমার আপডেট
            if (isFromOtherUser && isDebounced) {
              lastPlayedTimeRef.current = Date.now();
            }
          }
        }

        cleanupProcessedIds();
        setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (error) => {
        logger.error("Chat messages listener error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [chatId, currentUser?.uid]);

  const sendMessage = async (text, imageUrl, isBlocked, blockedBy, chatContext, safeChatId) => {
    if ((!text.trim() && !imageUrl) || !safeChatId || !currentUser?.uid) return;

    if (isBlocked || (blockedBy && blockedBy !== currentUser.uid)) {
      feedback.alert.warning({
        message: isBlocked ? 'আপনি এই ইউজারকে ব্লক করেছেন।' : 'আপনাকে এই ইউজার দ্বারা ব্লক করা হয়েছে।'
      });
      return false;
    }

    try {
      const messageData = {
        text: imageUrl ? "📷 Shared an image" : text.trim(),
        imageUrl: imageUrl || null,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email || 'User',
        senderPhoto: currentUser.photoURL || '',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'chats', safeChatId, 'messages'), messageData);

      const chatRef = doc(db, 'chats', safeChatId);
      const chatSnap = await getDoc(chatRef);

      if (chatSnap.exists()) {
        const currentData = chatSnap.data();
        const participants = currentData.participants || [];
        const receiverId = participants.find(p => p !== currentUser.uid);

        if (receiverId) {
          await updateDoc(chatRef, {
            lastMessage: imageUrl ? "📷 Shared an image" : text.trim(),
            updatedAt: serverTimestamp(),
            [`unreadCount.${receiverId}`]: increment(1),
            [`unreadCount.${currentUser.uid}`]: 0
          });

          await addDoc(collection(db, 'notifications'), {
            userId: receiverId,
            event: imageUrl ? NOTIFICATION_EVENTS.CHAT_IMAGE : NOTIFICATION_EVENTS.CHAT_MESSAGE,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email || 'User',
            senderPhoto: currentUser.photoURL || '',
            text: imageUrl ? "📷 Sent you an image" : text.trim(),
            chatId: safeChatId,
            isUnread: true,
            createdAt: serverTimestamp(),
          });
        }
      }
      return true;
    } catch (error) {
      logger.error("Error sending message:", error);
      feedback.alert.error({ message: 'মেসেজ পাঠাতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
      return false;
    }
  };

  const deleteMessage = async (messageId) => {
    if (!chatId || !messageId) return;
    try {
      await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
    } catch (error) {
      logger.error("Delete message error:", error);
      feedback.alert.error({ message: 'মেসেজ ডিলিট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    }
  };

  const editMessage = async (messageId, newText) => {
    if (!chatId || !messageId || !newText.trim()) return;
    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        text: newText.trim(),
        edited: true,
        editedAt: serverTimestamp()
      });
    } catch (error) {
      logger.error("Edit message error:", error);
      feedback.alert.error({ message: 'মেসেজ এডিট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    }
  };

  return { messages, loading, sendMessage, deleteMessage, editMessage };
};
