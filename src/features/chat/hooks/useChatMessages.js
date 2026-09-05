// src/hooks/useChatMessages.js

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../../shared/firebase/index';
import {
  collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, doc, updateDoc, getDoc, increment
} from 'firebase/firestore';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import { NOTIFICATION_EVENTS } from '../../../shared/ui/Notification/NotificationEvents';
import { logger } from '../../../shared/utils/logger';
import { AUTO_IMAGE_CAPTION } from '../chatHelpers';

export const useChatMessages = (chatId, currentUser) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const feedback = useFeedback();

  // 🔧 ADD (read-receipt tracking): the "message কখন read হয়েছে"
  // requirement had NO actual tracking before this — unreadCount only
  // tracked whether the CONVERSATION has unread messages, never when
  // a specific message was actually seen. Rather than writing a
  // read-receipt to every individual message document (expensive,
  // one write per message per read), this follows the standard
  // WhatsApp/Messenger pattern: store a single `lastRead.{uid}`
  // timestamp on the chat doc (see markChatAsRead below), and derive
  // each of MY sent messages' read status by comparing its
  // createdAt against the OTHER participant's lastRead timestamp —
  // subscribed here.
  const [otherPartyLastRead, setOtherPartyLastRead] = useState(null);

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

  // 🔧 ADD (read-receipt tracking): subscribe to the parent chat doc
  // just for the `lastRead` map, to know when the OTHER participant
  // last opened this conversation — used to derive per-message read
  // ticks for messages I sent (see markChatAsRead for the write side).
  useEffect(() => {
    if (!chatId || typeof chatId !== 'string' || !currentUser?.uid) {
      setOtherPartyLastRead(null);
      return;
    }

    const chatRef = doc(db, 'chats', chatId);
    const unsubscribe = onSnapshot(chatRef, (docSnap) => {
      if (!docSnap.exists()) {
        setOtherPartyLastRead(null);
        return;
      }
      const data = docSnap.data();
      const participants = data.participants || [];
      const otherId = participants.find(p => p !== currentUser.uid) ||
        (data.buyerId === currentUser.uid ? data.sellerId : data.buyerId);
      const otherLastReadTs = otherId ? data.lastRead?.[otherId] : null;
      setOtherPartyLastRead(otherLastReadTs?.toMillis?.() ?? null);
    }, (error) => {
      logger.error("Chat doc (lastRead) listener error:", error);
    });

    return () => unsubscribe();
  }, [chatId, currentUser?.uid]);

  // 🔧 ADD (#16/#17): `attachment` is a new optional param —
  // { type: 'document'|'voice', url, name, duration } — added at the
  // end so every existing call site (image sending, plain text) keeps
  // working unchanged.
  const sendMessage = async (text, imageUrl, isBlocked, blockedBy, chatContext, safeChatId, replyTo, attachment) => {
    if ((!text.trim() && !imageUrl && !attachment) || !safeChatId || !currentUser?.uid) return;

    if (isBlocked || (blockedBy && blockedBy !== currentUser.uid)) {
      feedback.alert.warning({
        message: isBlocked ? 'আপনি এই ইউজারকে ব্লক করেছেন।' : 'আপনাকে এই ইউজার দ্বারা ব্লক করা হয়েছে।'
      });
      return false;
    }

    const previewText = imageUrl
      ? AUTO_IMAGE_CAPTION
      : attachment?.type === 'document'
        ? `📄 ${attachment.name || 'Document'}`
        : attachment?.type === 'voice'
          ? "🎤 Voice message"
          : text.trim();

    try {
      const messageData = {
        text: previewText,
        imageUrl: imageUrl || null,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email || 'User',
        senderPhoto: currentUser.photoURL || '',
        createdAt: serverTimestamp(),
      };

      if (attachment?.type === 'document') {
        messageData.documentUrl = attachment.url;
        messageData.documentName = attachment.name || 'Document';
      } else if (attachment?.type === 'voice') {
        messageData.audioUrl = attachment.url;
        messageData.audioDuration = attachment.duration || 0;
      }

      // 🔧 FIX (#15 reply): replyTo was captured in ChatInterface's UI
      // state and shown via ReplyIndicator, but was never actually
      // saved with the message — sending discarded it entirely. Store
      // a lightweight snapshot (id + text + sender), not the full
      // original message, per "do not duplicate the entire original
      // message unnecessarily."
      if (replyTo) {
        messageData.replyTo = {
          messageId: replyTo.id,
          text: (replyTo.text || '').slice(0, 200),
          senderName: replyTo.senderName || 'User',
        };
      }

      await addDoc(collection(db, 'chats', safeChatId, 'messages'), messageData);

      const chatRef = doc(db, 'chats', safeChatId);
      const chatSnap = await getDoc(chatRef);

      if (chatSnap.exists()) {
        const currentData = chatSnap.data();
        const participants = currentData.participants || [];
        const receiverId = participants.find(p => p !== currentUser.uid);

        if (receiverId) {
          await updateDoc(chatRef, {
            lastMessage: previewText,
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

  // 🔧 FIX (#14 soft-delete): this used to be a hard deleteDoc() —
  // permanently destroying messages that could matter later as
  // evidence for a deal dispute, exactly what the requirements
  // explicitly warn against. Now soft-deletes (deleted/deletedAt/
  // deletedBy fields) so the record survives; the UI shows a "Message
  // deleted" placeholder instead of the real content (see
  // MessageList.jsx). Ownership is enforced here AND in Firestore
  // rules (client checks are just faster feedback, never the real
  // security boundary).
  // 🔧 FIX (#14/#22 security): the original soft-delete only set
  // deleted/deletedAt/deletedBy — it never cleared text/imageUrl/
  // documentUrl/audioUrl. Firestore read access is all-or-nothing per
  // document, so those fields were still being delivered to every
  // participant's client via the normal onSnapshot listener even
  // after "deletion" — the UI just chose not to render them. Anyone
  // opening devtools could still see deleted content, which directly
  // violates "do not expose deleted messages through normal queries."
  //
  // Real fix: copy the original content into a separate admin-only
  // messageAudit collection BEFORE redacting it from the message
  // document itself, so moderators/dispute review can still see what
  // was deleted (per "sensitive deleted content must be protected by
  // Firestore/backend authorization... prefer soft-delete/audit-
  // preservation"), while ordinary participants' clients never
  // receive the actual content again after delete.
  const deleteMessage = async (messageId) => {
    if (!chatId || !messageId) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    if (msg.senderId !== currentUser?.uid) {
      feedback.alert.error({ message: 'আপনি শুধু নিজের মেসেজ ডিলিট করতে পারবেন।' });
      return;
    }
    if (msg.deleted) return;
    try {
      await addDoc(collection(db, 'messageAudit'), {
        chatId,
        messageId,
        senderId: msg.senderId,
        text: msg.text || null,
        imageUrl: msg.imageUrl || null,
        documentUrl: msg.documentUrl || null,
        documentName: msg.documentName || null,
        audioUrl: msg.audioUrl || null,
        audioDuration: msg.audioDuration || null,
        replyTo: msg.replyTo || null,
        originalCreatedAt: msg.createdAt || null,
        deletedAt: serverTimestamp(),
        deletedBy: currentUser.uid,
      });

      await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: currentUser.uid,
        // Redact content that would otherwise still sync to every
        // participant's client via the normal messages listener.
        text: null,
        imageUrl: null,
        documentUrl: null,
        documentName: null,
        audioUrl: null,
        audioDuration: null,
      });
    } catch (error) {
      logger.error("Delete message error:", error);
      feedback.alert.error({ message: 'মেসেজ ডিলিট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    }
  };

  // 🔧 FIX (#11 edit time limit): no time window existed before —
  // any message, regardless of age, could be edited. Added a 15
  // minute window (this codebase had no pre-existing convention to
  // follow, so using the requirement doc's suggested default).
  // Enforced here for immediate feedback AND in Firestore rules,
  // since a client-side check alone can be bypassed.
  const EDIT_WINDOW_MS = 15 * 60 * 1000;

  // 🔧 FIX (edit-scope): "Edit" was showing for every message type
  // (image/voice/document) but only ever wrote the `text` field —
  // for voice/document messages MessageList.jsx never renders `text`
  // at all (it renders the audio player / doc link instead), so the
  // edit silently had zero visible effect. Per the actual
  // requirement — only text and image messages should be editable —
  // this now rejects voice/document messages outright, both here
  // (immediate feedback) and in Firestore rules (the real boundary,
  // since a client-side check alone can be bypassed).
  const editMessage = async (messageId, newText) => {
    if (!chatId || !messageId || !newText.trim()) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    if (msg.senderId !== currentUser?.uid) {
      feedback.alert.error({ message: 'আপনি শুধু নিজের মেসেজ এডিট করতে পারবেন।' });
      return;
    }
    if (msg.deleted) return;
    if (msg.documentUrl || msg.audioUrl) {
      feedback.alert.warning({ message: 'শুধু টেক্সট ও ছবির মেসেজ এডিট করা যায়।' });
      return;
    }
    const createdAtMs = msg.createdAt?.toMillis?.() ?? 0;
    if (createdAtMs && Date.now() - createdAtMs > EDIT_WINDOW_MS) {
      feedback.alert.warning({ message: 'মেসেজ পাঠানোর ১৫ মিনিটের পরে আর এডিট করা যায় না।' });
      return;
    }
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

  // 🔧 FIX (#12 read/unread): unreadCount was only ever reset to 0
  // for the SENDER inside sendMessage — nothing reset it for the
  // RECIPIENT when they actually opened and viewed the chat, so
  // unread badges never cleared from just reading messages. Call
  // this when a chat is opened/selected.
  const markChatAsRead = useCallback(async (safeChatId) => {
    if (!safeChatId || !currentUser?.uid) return;
    try {
      await updateDoc(doc(db, 'chats', safeChatId), {
        [`unreadCount.${currentUser.uid}`]: 0,
        // 🔧 ADD (read-receipt tracking): timestamp the OTHER
        // participant's client reads to compute "seen" ticks on
        // messages I sent — see the lastRead subscription above.
        [`lastRead.${currentUser.uid}`]: serverTimestamp()
      });
    } catch (error) {
      logger.error("Mark chat as read error:", error);
    }
  }, [currentUser?.uid]);

  return { messages, loading, sendMessage, deleteMessage, editMessage, markChatAsRead, otherPartyLastRead };
};
