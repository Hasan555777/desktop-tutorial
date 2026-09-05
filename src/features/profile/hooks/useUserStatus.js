// src/hooks/useUserStatus.js
import { useState, useEffect, useMemo } from 'react';
import { db } from '../../../shared/firebase/index';
import { doc, onSnapshot } from 'firebase/firestore';
import { formatLastSeen } from '../../chat/chatHelpers';
import { logger } from '../../../shared/utils/logger';
import { getEffectiveOnlineStatus, ONLINE_HEARTBEAT_MS } from '../utils/presence';

export const useUserStatus = (chatContext, currentUser) => {
  const otherPartyInfo = useMemo(() => {
    if (!chatContext || !currentUser) return { name: 'Unknown', photo: null, id: null };

    if (chatContext.buyerId === currentUser.uid) {
      return {
        name: chatContext.sellerName || chatContext.otherPartyName || 'Unknown Seller',
        photo: chatContext.sellerPhoto || chatContext.otherPartyPhoto || null,
        id: chatContext.sellerId || chatContext.otherPartyId
      };
    }
    if (chatContext.sellerId === currentUser.uid) {
      return {
        name: chatContext.buyerName || chatContext.otherPartyName || 'Unknown Buyer',
        photo: chatContext.buyerPhoto || chatContext.otherPartyPhoto || null,
        id: chatContext.buyerId || chatContext.otherPartyId
      };
    }
    if (chatContext.participants?.length) {
      const otherId = chatContext.participants.find(pid => pid !== currentUser.uid);
      if (otherId) {
        return { name: chatContext.otherPartyName || 'User', photo: chatContext.otherPartyPhoto || null, id: otherId };
      }
    }
    return {
      name: chatContext.otherPartyName || chatContext.clientName || chatContext.sender || 'Unknown',
      photo: chatContext.otherPartyPhoto || chatContext.clientPhoto || chatContext.senderPhoto || null,
      id: chatContext.otherPartyId || chatContext.userId || chatContext.ownerId
    };
  }, [chatContext, currentUser]);

  // 🔧 FIX (always-online bug): keep the RAW doc fields (isOnline
  // flag + lastSeen heartbeat) in state, separate from the derived
  // "effective" online status. This is needed because an
  // onSnapshot listener only fires when the *document* changes — if
  // the other person's tab dies without writing isOnline:false, no
  // new snapshot ever arrives, so a value computed only inside the
  // snapshot callback would stay stuck at whatever it was the last
  // time they were genuinely active. A periodic re-derive (below)
  // recomputes staleness against the current clock even with no new
  // Firestore writes at all.
  const [rawStatus, setRawStatus] = useState({
    displayName: otherPartyInfo.name || 'Loading...',
    photoURL: otherPartyInfo.photo || '',
    isOnlineFlag: false,
    lastSeen: null,
  });
  const [, forceRecompute] = useState(0);

  useEffect(() => {
    if (!otherPartyInfo.id) {
      setRawStatus({
        displayName: otherPartyInfo.name || 'Unknown',
        photoURL: otherPartyInfo.photo || '',
        isOnlineFlag: false,
        lastSeen: null,
      });
      return;
    }

    const userRef = doc(db, 'users', otherPartyInfo.id);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRawStatus({
          displayName: data.displayName || otherPartyInfo.name || 'Unknown',
          photoURL: data.photoURL || otherPartyInfo.photo || '',
          isOnlineFlag: data.isOnline === true,
          lastSeen: data.lastSeen || null,
        });
      } else {
        setRawStatus({
          displayName: otherPartyInfo.name || 'Unknown',
          photoURL: otherPartyInfo.photo || '',
          isOnlineFlag: false,
          lastSeen: null,
        });
      }
    }, (error) => {
      logger.error("Error listening to user:", error);
    });

    return () => unsubscribe();
  }, [otherPartyInfo.id, otherPartyInfo.name, otherPartyInfo.photo]);

  // Re-derive effective online status on a timer too, not just when
  // a new snapshot arrives — this is what actually flips a genuinely
  // gone user to "Offline" once their heartbeat goes stale.
  useEffect(() => {
    const interval = setInterval(() => forceRecompute(t => t + 1), ONLINE_HEARTBEAT_MS / 2);
    return () => clearInterval(interval);
  }, []);

  const targetUserInfo = useMemo(() => {
    const isOnline = getEffectiveOnlineStatus(rawStatus.isOnlineFlag, rawStatus.lastSeen);
    return {
      displayName: rawStatus.displayName,
      photoURL: rawStatus.photoURL,
      isOnline,
      lastSeen: rawStatus.lastSeen,
      lastSeenFormatted: isOnline ? 'Online' : formatLastSeen(rawStatus.lastSeen)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStatus]); // note: intentionally NOT depending on the forceRecompute tick's

  return { otherPartyInfo, targetUserInfo, setTargetUserInfo: setRawStatus };
};
