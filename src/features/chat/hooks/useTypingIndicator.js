// src/hooks/useTypingIndicator.js
//
// New feature (#20 typing indicator) — no existing infrastructure for
// this before. Design goals, per the requirements doc's cost-
// awareness rules (#38): don't write to Firestore on every keystroke,
// auto-clear after inactivity, clean up properly on unmount/chat
// close, and use one listener (not one per UI element).
//
// Data model: a `typing` map field directly on the chats/{chatId}
// document — { [uid]: Timestamp }. Piggybacks on the existing chats
// collection rather than creating a new one, and reuses the same
// isChatParticipant() authorization already enforced by the
// Firestore rules for the chats collection.

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../shared/firebase/index';
import { logger } from '../../../shared/utils/logger';

const TYPING_TIMEOUT_MS = 3000; // auto-clear after 3s of no input
const STALE_TYPING_MS = 8000;   // ignore a typing flag older than this (crashed tab, closed app, etc.)

export const useTypingIndicator = (chatId, currentUser, otherPartyId) => {
  const [otherPartyTyping, setOtherPartyTyping] = useState(false);
  const isTypingRef = useRef(false);
  const clearTimerRef = useRef(null);
  const staleCheckRef = useRef(null);

  // ── Listen for the other participant's typing state ──
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, 'chats', chatId);

    const unsubscribe = onSnapshot(chatRef, (snap) => {
      if (!snap.exists()) {
        setOtherPartyTyping(false);
        return;
      }
      const typingMap = snap.data().typing || {};
      const entry = otherPartyId ? typingMap[otherPartyId] : null;
      if (!entry) {
        setOtherPartyTyping(false);
        return;
      }
      const ageMs = Date.now() - (entry.toMillis?.() ?? 0);
      setOtherPartyTyping(ageMs < STALE_TYPING_MS);
    }, (error) => {
      logger.error('Typing indicator listener error:', error);
    });

    return () => unsubscribe();
  }, [chatId, otherPartyId]);

  // Re-check staleness on an interval too, in case the other party's
  // tab just closed without ever writing a "stopped typing" update —
  // otherwise the indicator could get stuck showing "typing..." with
  // no new snapshot to trigger a re-check.
  useEffect(() => {
    if (!otherPartyTyping) return;
    staleCheckRef.current = setTimeout(() => setOtherPartyTyping(false), STALE_TYPING_MS);
    return () => clearTimeout(staleCheckRef.current);
  }, [otherPartyTyping]);

  const clearOwnTyping = useCallback(async () => {
    if (!chatId || !currentUser?.uid || !isTypingRef.current) return;
    isTypingRef.current = false;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        [`typing.${currentUser.uid}`]: deleteField(),
      });
    } catch (error) {
      logger.error('Clear typing error:', error);
    }
  }, [chatId, currentUser?.uid]);

  // ── Call this on every keystroke — it's cheap: only writes to
  // Firestore on the FIRST keystroke of a typing burst, not every one.
  // Subsequent calls just reset the local auto-clear timer.
  const notifyTyping = useCallback(() => {
    if (!chatId || !currentUser?.uid) return;

    clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(clearOwnTyping, TYPING_TIMEOUT_MS);

    if (isTypingRef.current) return; // already marked typing, no extra write needed
    isTypingRef.current = true;
    updateDoc(doc(db, 'chats', chatId), {
      [`typing.${currentUser.uid}`]: serverTimestamp(),
    }).catch((error) => logger.error('Set typing error:', error));
  }, [chatId, currentUser?.uid, clearOwnTyping]);

  // ── Cleanup: clear the timer and the Firestore flag on unmount or
  // chat switch, so switching chats doesn't leave a stuck "typing..."
  // for the person you were just talking to.
  useEffect(() => {
    return () => {
      clearTimeout(clearTimerRef.current);
      clearOwnTyping();
    };
  }, [chatId, clearOwnTyping]);

  return { otherPartyTyping, notifyTyping, clearOwnTyping };
};
