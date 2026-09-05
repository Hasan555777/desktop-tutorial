// src/pages/Admin/components/AdminChatMonitor.jsx
//
// ✅ NEW — Admin-only "চ্যাট মনিটর" tab.
//
// WHY THIS EXISTS: users can permanently delete a message for
// themselves and the other participant (see hooks/useChatMessages.js
// deleteMessage — it redacts text/imageUrl/documentUrl/audioUrl on
// the live message doc so deleted content stops syncing to either
// participant's client at all). Since deals/payments get discussed
// in chat, deleted content still needs to be recoverable for dispute
// resolution and record-keeping — deleteMessage already preserves
// the original content in the admin-only `messageAudit` collection
// before redacting. This screen is simply the UI for admins to
// browse every conversation and see that recovered content.
//
// NO FIRESTORE RULE CHANGES WERE NEEDED for this: `chats`,
// `chats/{id}/messages`, and `messageAudit` all already grant read
// access to isAdmin() (see firestore-rules/firestore.rules) — this
// file only adds the front-end to use that existing access. Tab
// visibility is gated by the 'moderation' permission client-side,
// same as the Posts/Deals/Reports tabs, for a consistent admin UX —
// the actual security boundary is still the Firestore rule.
//
// SCOPE NOTE: a regular user's own delete still fully removes the
// content from THEIR view and the other participant's view — this
// screen does not restore it to either of them, it only lets admins
// look it up separately for support/dispute purposes, exactly as
// asked for.

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../../shared/firebase/index';
import {
  collection, query, orderBy, limit, onSnapshot,
  doc, getDoc, where, getDocs
} from 'firebase/firestore';
import { formatTime } from '../../chat/chatHelpers';
import { logger } from '../../../shared/utils/logger';
import styles from './AdminChatMonitor.module.css';

const CHAT_LIST_LIMIT = 150;

// Small in-memory cache so re-opening the same chat/user doesn't
// re-fetch on every click within a session.
const userCache = new Map();

const fetchUserBrief = async (uid) => {
  if (!uid) return { name: 'Unknown', photoURL: null };
  if (userCache.has(uid)) return userCache.get(uid);
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const brief = snap.exists()
      ? { name: snap.data().displayName || snap.data().name || 'User', photoURL: snap.data().photoURL || snap.data().photo || null, email: snap.data().email || '' }
      : { name: 'Deleted user', photoURL: null, email: '' };
    userCache.set(uid, brief);
    return brief;
  } catch (error) {
    logger.error('AdminChatMonitor: user fetch failed', error);
    return { name: 'Unknown', photoURL: null, email: '' };
  }
};

const formatDay = (ts) => {
  if (!ts?.seconds) return '';
  try {
    return new Date(ts.seconds * 1000).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

const AdminChatMonitor = ({ feedback }) => {
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatParticipants, setChatParticipants] = useState({}); // chatId -> [briefA, briefB]
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [auditByMessageId, setAuditByMessageId] = useState({}); // messageId -> audit record (recovered content)

  // ── ১. সব চ্যাটের তালিকা (সর্বশেষ আপডেট অনুযায়ী) ──
  useEffect(() => {
    const q = query(collection(db, 'chats'), orderBy('updatedAt', 'desc'), limit(CHAT_LIST_LIMIT));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChats(list);
      setChatsLoading(false);
    }, (error) => {
      logger.error('AdminChatMonitor: chats listener error', error);
      setChatsLoading(false);
      feedback?.alert?.error?.({ title: 'চ্যাট লিস্ট লোড করা যায়নি।' });
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ২. প্রতিটি চ্যাটের দুই participant-এর নাম/ছবি লেজি-লোড ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = chats.filter(c => !chatParticipants[c.id]);
      if (!missing.length) return;
      const updates = {};
      for (const chat of missing) {
        const ids = chat.participants?.length ? chat.participants : [chat.buyerId, chat.sellerId].filter(Boolean);
        const briefs = await Promise.all(ids.map(fetchUserBrief));
        updates[chat.id] = ids.map((id, i) => ({ uid: id, ...briefs[i] }));
      }
      if (!cancelled) setChatParticipants(prev => ({ ...prev, ...updates }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats]);

  // ── ৩. নির্বাচিত চ্যাটের মেসেজ থ্রেড + সংশ্লিষ্ট audit রেকর্ড ──
  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setAuditByMessageId({});
      return;
    }
    setMessagesLoading(true);
    const q = query(collection(db, 'chats', selectedChatId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(list);
      setMessagesLoading(false);

      // যেসব মেসেজ ডিলিট হয়ে গেছে (redacted), তাদের আসল কনটেন্ট
      // messageAudit থেকে খুঁজে আনা — শুধু deleted মেসেজগুলোর জন্যই।
      const deletedIds = list.filter(m => m.deleted).map(m => m.id);
      if (!deletedIds.length) {
        setAuditByMessageId({});
        return;
      }
      try {
        const auditQ = query(
          collection(db, 'messageAudit'),
          where('chatId', '==', selectedChatId)
        );
        const auditSnap = await getDocs(auditQ);
        const map = {};
        auditSnap.docs.forEach(d => {
          const data = d.data();
          if (deletedIds.includes(data.messageId)) {
            map[data.messageId] = data;
          }
        });
        setAuditByMessageId(map);
      } catch (error) {
        logger.error('AdminChatMonitor: audit fetch failed', error);
      }
    }, (error) => {
      logger.error('AdminChatMonitor: messages listener error', error);
      setMessagesLoading(false);
    });
    return () => unsubscribe();
  }, [selectedChatId]);

  const openChat = useCallback((chatId) => setSelectedChatId(chatId), []);
  const closeThread = useCallback(() => setSelectedChatId(null), []);

  const filteredChats = chats.filter(chat => {
    if (!searchTerm.trim()) return true;
    // 🔧 ADD (admin chat lookup): users are shown "WT-<chatId>" as a
    // reference code (see ChatHeader.jsx) — strip that prefix before
    // matching so pasting it in verbatim works, not just the bare ID.
    const term = searchTerm.trim().replace(/^wt-/i, '').toLowerCase();
    const briefs = chatParticipants[chat.id] || [];
    return briefs.some(b =>
      b.name?.toLowerCase().includes(term) || b.email?.toLowerCase().includes(term)
    ) || chat.id.toLowerCase().includes(term);
  });

  const selectedChat = chats.find(c => c.id === selectedChatId);
  const selectedBriefs = selectedChatId ? (chatParticipants[selectedChatId] || []) : [];

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h2><i className="fa-solid fa-comments"></i> চ্যাট মনিটর</h2>
        <p className={styles.subtitle}>
          সব ইউজারের সব কনভারসেশন — ডিল/পেমেন্ট নিয়ে সমস্যা হলে বা কেউ রিপোর্ট করলে এখান থেকে যাচাই করা যাবে।
          ইউজার কোনো মেসেজ ডিলিট করলে সেটা তাদের দুজনের চ্যাট থেকেই সরে যায়, কিন্তু এখানে
          <strong> "ডিলিটকৃত (রিকভার করা)" </strong> ব্যাজসহ আসল কনটেন্ট দেখা যাবে।
          <br />
          <strong>দ্রুত খুঁজতে:</strong> প্রতিটা চ্যাটের হেডারে ইউজারদের জন্য একটা কপিযোগ্য "WT-..." রেফারেন্স কোড দেখানো হয় —
          অভিযোগ করার সময় ইউজারকে সেটা দিতে বলুন, এখানে সার্চ বক্সে সেই কোড পেস্ট করলেই সরাসরি চ্যাটটি চলে আসবে।
        </p>
      </div>

      <div className={styles.layout}>
        {/* ── চ্যাট লিস্ট প্যানেল ── */}
        <div className={`${styles.listPanel} ${selectedChatId ? styles.listPanelHiddenOnMobile : ''}`}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="নাম, ইমেইল, বা WT-... চ্যাট আইডি দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {chatsLoading ? (
            <div className={styles.emptyState}>লোড হচ্ছে...</div>
          ) : filteredChats.length === 0 ? (
            <div className={styles.emptyState}>কোনো চ্যাট পাওয়া যায়নি।</div>
          ) : (
            <div className={styles.chatList}>
              {filteredChats.map(chat => {
                const briefs = chatParticipants[chat.id] || [];
                const names = briefs.map(b => b.name).join(' ↔ ') || 'লোড হচ্ছে...';
                return (
                  <button
                    key={chat.id}
                    className={`${styles.chatListItem} ${selectedChatId === chat.id ? styles.chatListItemActive : ''}`}
                    onClick={() => openChat(chat.id)}
                  >
                    <div className={styles.chatListNames}>{names}</div>
                    <div className={styles.chatListCode}>WT-{chat.id}</div>
                    <div className={styles.chatListPreview}>
                      {chat.lastMessage || '—'}
                    </div>
                    <div className={styles.chatListMeta}>{formatDay(chat.updatedAt)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── থ্রেড প্যানেল ── */}
        <div className={`${styles.threadPanel} ${!selectedChatId ? styles.threadPanelHiddenOnMobile : ''}`}>
          {!selectedChatId ? (
            <div className={styles.emptyState}>বাম পাশ থেকে একটি কনভারসেশন সিলেক্ট করুন।</div>
          ) : (
            <>
              <div className={styles.threadHeader}>
                <button className={styles.backBtn} onClick={closeThread}>
                  <i className="fa-solid fa-arrow-left"></i>
                </button>
                <div>
                  <div className={styles.threadTitle}>
                    {selectedBriefs.map(b => b.name).join(' ↔ ') || selectedChat?.id}
                  </div>
                  {selectedBriefs.length > 0 && (
                    <div className={styles.threadSubtitle}>
                      {selectedBriefs.map(b => b.email).filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className={styles.threadCode}>WT-{selectedChatId}</div>
                </div>
              </div>

              <div className={styles.threadBody}>
                {messagesLoading ? (
                  <div className={styles.emptyState}>মেসেজ লোড হচ্ছে...</div>
                ) : messages.length === 0 ? (
                  <div className={styles.emptyState}>এই কনভারসেশনে কোনো মেসেজ নেই।</div>
                ) : (
                  messages.map(msg => {
                    const sender = selectedBriefs.find(b => b.uid === msg.senderId);
                    const audit = auditByMessageId[msg.id];
                    return (
                      <div key={msg.id} className={styles.messageRow}>
                        <div className={styles.messageMeta}>
                          <strong>{sender?.name || msg.senderName || 'Unknown'}</strong>
                          <span className={styles.messageTime}>{formatTime(msg.createdAt)}</span>
                          {msg.edited && !msg.deleted && <span className={styles.editedTag}>এডিটেড</span>}
                        </div>

                        {msg.deleted ? (
                          audit ? (
                            <div className={styles.deletedRecovered}>
                              <div className={styles.deletedBadge}>
                                <i className="fa-solid fa-trash-can"></i> ডিলিটকৃত (রিকভার করা)
                              </div>
                              {audit.text && <p className={styles.messageText}>{audit.text}</p>}
                              {audit.imageUrl && <img src={audit.imageUrl} alt="deleted attachment" className={styles.messageImage} />}
                              {audit.documentUrl && (
                                <a href={audit.documentUrl} target="_blank" rel="noopener noreferrer" className={styles.docLink}>
                                  <i className="fa-solid fa-file"></i> {audit.documentName || 'নথি দেখুন'}
                                </a>
                              )}
                              {audit.audioUrl && (
                                <audio controls src={audit.audioUrl} className={styles.audioPlayer} />
                              )}
                              <div className={styles.deletedFootnote}>
                                ডিলিট করার সময়: {formatTime(msg.deletedAt)}
                              </div>
                            </div>
                          ) : (
                            <div className={styles.deletedUnrecoverable}>
                              <i className="fa-solid fa-trash-can"></i> ডিলিটকৃত মেসেজ (অডিট রেকর্ড পাওয়া যায়নি)
                            </div>
                          )
                        ) : (
                          <>
                            {msg.text && <p className={styles.messageText}>{msg.text}</p>}
                            {msg.imageUrl && <img src={msg.imageUrl} alt="attachment" className={styles.messageImage} />}
                            {msg.documentUrl && (
                              <a href={msg.documentUrl} target="_blank" rel="noopener noreferrer" className={styles.docLink}>
                                <i className="fa-solid fa-file"></i> {msg.documentName || 'নথি দেখুন'}
                              </a>
                            )}
                            {msg.audioUrl && (
                              <audio controls src={msg.audioUrl} className={styles.audioPlayer} />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminChatMonitor;
