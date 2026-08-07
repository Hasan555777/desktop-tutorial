import { useState, useEffect, useMemo } from 'react';
import { db } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { formatLastSeen } from '../pages/chatHelpers';

export const useUserStatus = (chatContext, currentUser) => {
  const otherPartyInfo = useMemo(() => {
    if (!chatContext || !currentUser) return { name: 'Unknown', photo: null, id: null };
    
    if (chatContext.buyerId === currentUser.uid) {
      return { name: chatContext.sellerName || chatContext.otherPartyName || 'Unknown Seller', photo: chatContext.sellerPhoto || chatContext.otherPartyPhoto || null, id: chatContext.sellerId || chatContext.otherPartyId };
    }
    if (chatContext.sellerId === currentUser.uid) {
      return { name: chatContext.buyerName || chatContext.otherPartyName || 'Unknown Buyer', photo: chatContext.buyerPhoto || chatContext.otherPartyPhoto || null, id: chatContext.buyerId || chatContext.otherPartyId };
    }
    if (chatContext.participants?.length) {
      const otherId = chatContext.participants.find(pid => pid !== currentUser.uid);
      if (otherId) return { name: chatContext.otherPartyName || 'User', photo: chatContext.otherPartyPhoto || null, id: otherId };
    }
    return { name: chatContext.otherPartyName || chatContext.clientName || chatContext.sender || 'Unknown', photo: chatContext.otherPartyPhoto || chatContext.clientPhoto || chatContext.senderPhoto || null, id: chatContext.otherPartyId || chatContext.userId || chatContext.ownerId };
  }, [chatContext, currentUser]);

  const [targetUserInfo, setTargetUserInfo] = useState({
    displayName: otherPartyInfo.name || 'Loading...',
    photoURL: otherPartyInfo.photo || '',
    isOnline: false,
    lastSeen: null,
    lastSeenFormatted: 'Offline'
  });

  useEffect(() => {
    if (!otherPartyInfo.id) {
      setTargetUserInfo({
        displayName: otherPartyInfo.name || 'Unknown',
        photoURL: otherPartyInfo.photo || '',
        isOnline: false,
        lastSeen: null,
        lastSeenFormatted: 'Offline'
      });
      return;
    }

    const userRef = doc(db, 'users', otherPartyInfo.id);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const isOnline = data.isOnline === true;
        const lastSeen = data.lastSeen || null;
        setTargetUserInfo({
          displayName: data.displayName || otherPartyInfo.name || 'Unknown',
          photoURL: data.photoURL || otherPartyInfo.photo || '',
          isOnline,
          lastSeen,
          lastSeenFormatted: isOnline ? 'Online' : formatLastSeen(lastSeen)
        });
      } else {
        setTargetUserInfo({
          displayName: otherPartyInfo.name || 'Unknown',
          photoURL: otherPartyInfo.photo || '',
          isOnline: false,
          lastSeen: null,
          lastSeenFormatted: 'Offline'
        });
      }
    }, (error) => {
      console.error("Error listening to user:", error);
    });

    return () => unsubscribe();
  }, [otherPartyInfo.id, otherPartyInfo.name, otherPartyInfo.photo]);

  return { otherPartyInfo, targetUserInfo, setTargetUserInfo };
};