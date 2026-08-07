import { useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export const useOnlineStatus = (currentUser) => {
  useEffect(() => {
    if (!currentUser?.uid) return;

    const userRef = doc(db, 'users', currentUser.uid);
    
    const updateOnlineStatus = async () => {
      try {
        await updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() });
      } catch (error) {
        console.error("Error updating online status:", error);
      }
    };

    updateOnlineStatus();

    const handleBeforeUnload = async () => {
      try {
        await updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() });
      } catch (error) {
        console.error("Error setting offline:", error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const interval = setInterval(async () => {
      try {
        await updateDoc(userRef, { lastSeen: serverTimestamp() });
      } catch (error) {
        console.error("Error updating lastSeen:", error);
      }
    }, 30000);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(interval);
      updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() })
        .catch(error => console.error("Error setting offline on unmount:", error));
    };
  }, [currentUser?.uid]);
};