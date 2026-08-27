// src/firebase/announcementRepository.js

import { db } from '@/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';

// ============================================================
// ✅ Get Latest Active Announcement
// ============================================================
export const getLatestActiveAnnouncement = async () => {
  try {
    const q = query(
      collection(db, 'announcements'),
      where('active', '==', true),
      orderBy('version', 'desc'),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    console.error('Error fetching announcement:', error);
    return null;
  }
};

// ============================================================
// ✅ Realtime Listener
// ============================================================
export const listenForAnnouncements = (callback) => {
  let lastKey = null;
  
  const q = query(
    collection(db, 'announcements'),
    where('active', '==', true),
    orderBy('version', 'desc'),
    limit(1)
  );
  
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null);
      return;
    }
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    const announcement = {
      id: doc.id,
      ...data
    };
    
    // ✅ Track by category_version to handle same version across categories
    const key = `${data.category || 'default'}_${data.version}`;
    if (lastKey === key) {
      return;
    }
    
    lastKey = key;
    callback(announcement);
  }, (error) => {
    console.error('Error listening to announcements:', error);
    callback(null);
  });
};

// ============================================================
// ✅ Admin Functions
// ============================================================

export const createAnnouncement = async (data, adminUid, adminEmail) => {
  try {
    if (!adminUid) {
      return {
        success: false,
        error: 'Admin UID is required'
      };
    }

    const result = await runTransaction(db, async (transaction) => {
      // Get latest version
      const q = query(
        collection(db, 'announcements'),
        orderBy('version', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      
      let newVersion = 1;
      if (!snapshot.empty) {
        newVersion = (snapshot.docs[0].data().version || 0) + 1;
      }
      
      // Create announcement
      const docRef = doc(collection(db, 'announcements'));
      const announcementData = {
        title: data.title.trim(),
        message: data.message.trim(),
        type: data.type || 'info',
        category: data.category || 'default',
        version: newVersion,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: adminUid,
        createdByEmail: adminEmail || 'admin',
        updatedAt: serverTimestamp()
      };
      
      transaction.set(docRef, announcementData);
      
      // ✅ Save to history (with error handling)
      try {
        const historyRef = doc(collection(db, 'announcementHistory'));
        transaction.set(historyRef, {
          ...announcementData,
          broadcastId: docRef.id,
          action: 'created',
          archivedAt: serverTimestamp()
        });
      } catch (historyError) {
        console.warn('⚠️ History save failed, but announcement created:', historyError);
        // ✅ Main announcement won't fail
      }
      
      return {
        id: docRef.id,
        version: newVersion
      };
    });
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('Error creating announcement:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const updateAnnouncement = async (announcementId, data, adminUid, adminEmail, bumpVersion = false) => {
  try {
    if (!adminUid) {
      return {
        success: false,
        error: 'Admin UID is required'
      };
    }

    const result = await runTransaction(db, async (transaction) => {
      const ref = doc(db, 'announcements', announcementId);
      const snapshot = await transaction.get(ref);
      
      if (!snapshot.exists()) {
        throw new Error('Announcement not found');
      }
      
      const currentData = snapshot.data();
      const newVersion = bumpVersion ? (currentData.version || 0) + 1 : currentData.version;
      
      const updateData = {
        title: data.title.trim() || currentData.title,
        message: data.message.trim() || currentData.message,
        type: data.type || currentData.type,
        category: data.category || currentData.category,
        version: newVersion,
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
        updatedByEmail: adminEmail || 'admin'
      };
      
      transaction.update(ref, updateData);
      
      // ✅ Save to history (with error handling)
      try {
        const historyRef = doc(collection(db, 'announcementHistory'));
        transaction.set(historyRef, {
          ...currentData,
          ...updateData,
          broadcastId: announcementId,
          action: bumpVersion ? 'updated_with_version_bump' : 'updated',
          archivedAt: serverTimestamp()
        });
      } catch (historyError) {
        console.warn('⚠️ History save failed, but announcement updated:', historyError);
      }
      
      return {
        version: newVersion,
        bumped: bumpVersion
      };
    });
    
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('Error updating announcement:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export const toggleAnnouncementActive = async (announcementId, active) => {
  try {
    const ref = doc(db, 'announcements', announcementId);
    await updateDoc(ref, {
      active: active,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Error toggling announcement:', error);
    return { success: false, error: error.message };
  }
};

export const deleteAnnouncement = async (announcementId) => {
  try {
    const ref = doc(db, 'announcements', announcementId);
    await deleteDoc(ref);
    return { success: true };
  } catch (error) {
    console.error('Error deleting announcement:', error);
    return { success: false, error: error.message };
  }
};

export const getAllAnnouncements = async () => {
  try {
    const q = query(
      collection(db, 'announcements'),
      orderBy('version', 'desc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return [];
  }
};

export const getAnnouncementHistory = async (announcementId = null) => {
  try {
    let q = query(
      collection(db, 'announcementHistory'),
      orderBy('archivedAt', 'desc'),
      limit(100)
    );
    
    if (announcementId) {
      q = query(
        collection(db, 'announcementHistory'),
        where('broadcastId', '==', announcementId),
        orderBy('archivedAt', 'desc')
      );
    }
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
};

export const deleteMultipleAnnouncements = async (announcementIds) => {
  try {
    const batch = writeBatch(db);
    announcementIds.forEach(id => {
      const ref = doc(db, 'announcements', id);
      batch.delete(ref);
    });
    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error('Error deleting multiple announcements:', error);
    return { success: false, error: error.message };
  }
};