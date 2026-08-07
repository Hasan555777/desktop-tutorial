// src/hooks/useChatMessages.js

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, deleteDoc, doc, updateDoc, getDoc, increment 
} from 'firebase/firestore';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';

export const useChatMessages = (chatId, currentUser) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const feedback = useFeedback();
  
  // ✅ Track processed message IDs to prevent duplicate notifications on refresh
  const processedMessageIds = useRef(new Set());
  // ✅ Track last played time for debounce
  const lastPlayedTimeRef = useRef(0);
  // ✅ Track last processed ID for cleanup
  const lastProcessedIdRef = useRef(null);
  // ✅ Track initial snapshot load to prevent notifications on page refresh
  const initialSnapshotLoaded = useRef(false);

  // ✅ Helper: Cleanup processed IDs (keep last 300)
  const cleanupProcessedIds = () => {
    if (processedMessageIds.current.size > 300) {
      const ids = Array.from(processedMessageIds.current);
      const keepIds = ids.slice(-300);
      processedMessageIds.current = new Set(keepIds);
      console.log('🧹 Cleaned processed message IDs, kept:', processedMessageIds.current.size);
    }
  };

  useEffect(() => {
    if (!chatId || typeof chatId !== 'string') {
      setLoading(false);
      return;
    }

    // ✅ Reset initial snapshot flag when chatId changes
    initialSnapshotLoaded.current = false;

    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const changes = snapshot.docChanges();
        
        // ✅ FIRST SNAPSHOT: Just mark all messages as processed, no notifications
        if (!initialSnapshotLoaded.current) {
          console.log('📥 Initial snapshot loaded, marking all messages as processed...');
          
          // ✅ Mark all existing messages as processed
          snapshot.docs.forEach((doc) => {
            processedMessageIds.current.add(doc.id);
          });
          
          // ✅ Set initial snapshot loaded flag
          initialSnapshotLoaded.current = true;
          
          // ✅ Update messages state
          setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setLoading(false);
          
          console.log(`✅ Marked ${snapshot.docs.length} messages as processed (no notifications)`);
          return; // ✅ Exit early - no notifications for initial load
        }
        
        // ✅ Subsequent snapshots: Process changes normally
        for (const change of changes) {
          if (change.type === 'added') {
            const messageData = change.doc.data();
            const messageId = change.doc.id;
            
            // ✅ STEP 1: Already Processed Check
            if (processedMessageIds.current.has(messageId)) {
              continue;
            }
            
            // ✅ STEP 2: Mark as Processed Immediately
            processedMessageIds.current.add(messageId);
            lastProcessedIdRef.current = messageId;
            
            // ✅ STEP 3: Check if from Other User
            const isFromOtherUser = messageData.senderId !== currentUser?.uid;
            
            // ✅ STEP 4: Debounce Check
            const isDebounced = Date.now() - lastPlayedTimeRef.current > 500;
            
            // ✅ STEP 5: Skip notification - Now handled by NotificationProvider
            // ✅ Just update last played time for debounce
            if (isFromOtherUser && isDebounced) {
              lastPlayedTimeRef.current = Date.now();
            }
          }
        }

        // ✅ Cleanup processed IDs periodically
        cleanupProcessedIds();

        // ✅ Update messages state
        setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, 
      (error) => {
        console.error("Firebase listener error: ", error);
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
      return;
    }

    try {
      const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const messageData = {
        text: imageUrl ? "📷 Shared an image" : text.trim(),
        imageUrl: imageUrl || null,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email || 'User',
        senderPhoto: currentUser.photoURL || '',
        createdAt: serverTimestamp(),
      };
      
      // ✅ 1. Save message to chat
      await addDoc(collection(db, 'chats', safeChatId, 'messages'), messageData);

      const chatRef = doc(db, 'chats', safeChatId);
      const chatSnap = await getDoc(chatRef);
      
      if (chatSnap.exists()) {
        const currentData = chatSnap.data();
        const participants = currentData.participants || [];
        const receiverId = participants.find(p => p !== currentUser.uid);

        if (receiverId) {
          // ✅ 2. Update chat
          await updateDoc(chatRef, {
            lastMessage: imageUrl ? "📷 Shared an image" : text.trim(),
            updatedAt: serverTimestamp(),
            [`unreadCount.${receiverId}`]: increment(1),
            [`unreadCount.${currentUser.uid}`]: 0
          });

          // ✅ 3. Create notification for receiver
          await addDoc(collection(db, 'notifications'), {
            userId: receiverId,
            event: imageUrl 
              ? NOTIFICATION_EVENTS.CHAT_IMAGE 
              : NOTIFICATION_EVENTS.CHAT_MESSAGE,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email || 'User',
            senderPhoto: currentUser.photoURL || '',
            text: imageUrl ? "📷 Sent you an image" : text.trim(),
            chatId: safeChatId,
            isUnread: true,
            createdAt: serverTimestamp(),
          });
          
          console.log('🔔 Notification created for receiver:', receiverId);
        }
      }
      return true;
    } catch (error) {
      console.error("Error sending message:", error);
      feedback.alert.error({ message: 'মেসেজ পাঠাতে ব্যর্থ হয়েছে।' });
      return false;
    }
  };

  const deleteMessage = async (messageId) => {
    if (!chatId || !messageId) return;
    try {
      await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
    } catch (error) {
      console.error("Delete error:", error);
      feedback.alert.error({ message: 'মেসেজ ডিলিট করতে ব্যর্থ হয়েছে।' });
    }
  };

  const editMessage = async (messageId, newText) => {
    if (!chatId || !messageId || !newText.trim()) return;
    try {
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, {
        text: newText.trim(),
        edited: true,
        editedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Edit error:", error);
      feedback.alert.error({ message: 'মেসেজ এডিট করতে ব্যর্থ হয়েছে।' });
    }
  };

  return { messages, loading, sendMessage, deleteMessage, editMessage };
};