// src/services/NotificationService.js

import { db } from '@/firebase';
import { collection, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { NOTIFICATION_EVENTS } from '@/UI/Notification/NotificationEvents';
import { NotificationTemplates } from '@/UI/Notification/NotificationTemplates';

class NotificationService {
  
  /**
   * 📨 Send a notification
   * 
   * @param {Object} params
   * @param {string} params.event - Notification event (from NOTIFICATION_EVENTS)
   * @param {string} params.userId - Recipient user ID
   * @param {Object} params.data - Notification data
   * @param {Array} params.userIds - Multiple recipients (optional)
   * @param {boolean} params.skipFirestore - Skip saving to Firestore (optional)
   * @param {boolean} params.silent - Don't play sound (optional)
   * 
   * @example
   * // Single user
   * await notificationService.send({
   *   event: NOTIFICATION_EVENTS.DEAL_APPROVED,
   *   userId: 'user123',
   *   data: { dealId: 'deal123', postTitle: 'My Project' }
   * });
   * 
   * // Multiple users
   * await notificationService.send({
   *   event: NOTIFICATION_EVENTS.DEAL_COMPLETED,
   *   userIds: ['user1', 'user2'],
   *   data: { dealId: 'deal123', postTitle: 'My Project' }
   * });
   */
  async send({ 
    event, 
    userId, 
    userIds, 
    data = {}, 
    skipFirestore = false,
    silent = false 
  }) {
    // ✅ 1. Validate event
    if (!event) {
      console.error('❌ Event is required');
      return null;
    }

    // ✅ 2. Get template
    const template = NotificationTemplates[event];
    if (!template) {
      console.warn(`⚠️ No template found for event: ${event}`);
      return null;
    }

    // ✅ 3. Generate config from template
    const config = template(data);

    // ✅ 4. Determine recipients
    const recipients = userIds || (userId ? [userId] : []);
    if (recipients.length === 0) {
      console.warn('⚠️ No recipients provided');
      return null;
    }

    // ✅ 5. If silent, override sound
    if (silent) {
      config.soundEnabled = false;
    }

    // ✅ 6. Save to Firestore (unless skipped)
    const results = [];
    if (!skipFirestore) {
      try {
        // ✅ Use batch for multiple recipients (better performance)
        if (recipients.length > 1) {
          const batch = writeBatch(db);
          const docRefs = [];

          for (const recipientId of recipients) {
            const notificationData = this._buildNotificationData({
              userId: recipientId,
              event,
              config,
              data,
            });

            const docRef = doc(collection(db, 'notifications'));
            batch.set(docRef, notificationData);
            docRefs.push({ userId: recipientId, id: docRef.id });
          }

          await batch.commit();
          results.push(...docRefs);
          console.log(`✅ Batch notifications sent to ${recipients.length} users: ${event}`);
          
        } else {
          // ✅ Single recipient
          for (const recipientId of recipients) {
            const notificationData = this._buildNotificationData({
              userId: recipientId,
              event,
              config,
              data,
            });

            const docRef = await addDoc(collection(db, 'notifications'), notificationData);
            results.push({ userId: recipientId, id: docRef.id });
            console.log(`✅ Notification sent to ${recipientId}: ${event}`);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to send notification:`, error);
      }
    }

    return results;
  }

  /**
   * 🔧 Build notification data object
   */
  _buildNotificationData({ userId, event, config, data }) {
    return {
      userId: userId,
      event: event,
      title: config.title || 'Notification',
      message: config.body || '',
      dealId: data.dealId || null,
      postTitle: data.postTitle || null,
      milestoneId: data.milestoneId || null,
      soundEvent: config.soundEvent || null,
      actionRequired: config.actionRequired || false,
      actionType: config.actionType || null,
      isUnread: true,
      isRead: false,
      createdAt: serverTimestamp(),
      metadata: data,
    };
  }

  /**
   * 📨 Send notification using old 'type' format (for backward compatibility)
   * @deprecated Use send() with event instead
   */
  async sendLegacy({ userId, type, title, message, data = {} }) {
    console.warn('⚠️ sendLegacy() is deprecated. Use send() with event instead.');
    
    const eventMap = {
      'deal': NOTIFICATION_EVENTS.DEAL_CREATED,
      'deal_confirmed': NOTIFICATION_EVENTS.DEAL_CONFIRMED,
      'deal_rejected': NOTIFICATION_EVENTS.DEAL_REJECTED,
      'payment': NOTIFICATION_EVENTS.PAYMENT_RECEIVED,
      'payment_released': NOTIFICATION_EVENTS.PAYMENT_RELEASED,
      'wallet': NOTIFICATION_EVENTS.WALLET_CREDITED,
      'wallet_credited': NOTIFICATION_EVENTS.WALLET_CREDITED,
      'wallet_debited': NOTIFICATION_EVENTS.WALLET_DEBITED,
      'deposit': NOTIFICATION_EVENTS.DEPOSIT_APPROVED,
      'withdraw': NOTIFICATION_EVENTS.WITHDRAW_APPROVED,
      'message': NOTIFICATION_EVENTS.CHAT_MESSAGE,
      'cancellation_request': NOTIFICATION_EVENTS.CANCELLATION_REQUEST,
      'cancellation_approved': NOTIFICATION_EVENTS.CANCELLATION_APPROVED,
      'cancellation_rejected': NOTIFICATION_EVENTS.CANCELLATION_REJECTED,
      'deadline_passed': NOTIFICATION_EVENTS.DEADLINE_PASSED,
      'review': NOTIFICATION_EVENTS.REVIEW_RECEIVED,
      'review_requested': NOTIFICATION_EVENTS.REVIEW_REQUESTED,
      'system': NOTIFICATION_EVENTS.SYSTEM,
    };

    const event = eventMap[type] || NOTIFICATION_EVENTS.NOTIFICATION;
    
    return this.send({
      event,
      userId,
      data: { ...data, title, message },
    });
  }

  /**
   * 📊 Get unread count for a user
   */
  async getUnreadCount(userId) {
    if (!userId) return 0;
    
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('isUnread', '==', true)
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * 📊 Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    if (!userId) return;
    
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('isUnread', '==', true)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) return;
      
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          isUnread: false,
          isRead: true,
          readAt: serverTimestamp(),
        });
      });
      await batch.commit();
      
      console.log(`✅ Marked ${snapshot.size} notifications as read`);
    } catch (error) {
      console.error('❌ Error marking all as read:', error);
    }
  }
}

// ✅ Singleton instance
export const notificationService = new NotificationService();

// ✅ Default export
export default notificationService;