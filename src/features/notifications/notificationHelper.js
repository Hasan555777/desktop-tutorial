// src/pages/notificationHelper.js
// ============================================================
// 🔧 FIXES APPLIED (search "FIX" to jump to each spot):
// 1. sendNotification(): push-notification failure no longer retries
//    the whole function -> was creating duplicate Firestore docs for
//    any notification type without a stable id (addDoc path).
// 2. isDuplicate(): removed the Date.now() fallback that silently made
//    the guard useless whenever no transferId/transactionId/dealId/
//    relatedId/postTitle was supplied.
// 3. sendWalletBalanceNotification(): now accepts + forwards a
//    transactionId so it gets a persistent id too (was previously
//    only deduped by a flimsy string check on dealTitle).
// 4. sendNotification(): persistent-id check + create is now wrapped
//    in a Firestore transaction instead of a separate getDoc()/setDoc()
//    pair -> closes a race condition where two concurrent calls
//    (double click, two tabs, retried request) could both see
//    "doesn't exist" and both write, defeating the whole point of
//    notificationId dedup.
// 5. sendNotification(): retry loop now breaks early on non-retryable
//    errors (permission-denied, invalid-argument) instead of always
//    burning all 3 attempts.
// 6. (item #8) Removed a full second/third duplicate FCM+push
//    implementation that lived in this file (saveFCMToken,
//    initializeFCM, setupForegroundMessageListener,
//    getNotificationPermissionStatus, isPushSupported,
//    requestNotificationPermission, getFCMTokenFromDevice,
//    deleteFCMTokenFromDevice) — none of it was imported anywhere
//    else, and a couple of the functions called
//    Notification.requestPermission() with no user-gesture guard.
//    sendPushNotification() also used to POST to
//    '/api/send-push-notification', a backend route that doesn't
//    exist in this project — it's now an honest no-op (dev-only log)
//    instead of a call that was always guaranteed to fail silently
//    in production. See the comment on sendPushNotification below
//    for what a real fix needs (a server-side sender).
// ============================================================

import { db, auth } from '../../shared/firebase/index';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc, 
  updateDoc,
  runTransaction
} from 'firebase/firestore';

// ============================================================
// ✅ Constants
// ============================================================
export const NOTIFICATION_TYPES = {
  BID_RECEIVED: 'bid_received',
  BID_ACCEPTED: 'bid_accepted',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_RELEASED: 'payment_released',
  MILESTONE_COMPLETED: 'milestone_completed',
  DEAL_CONFIRMED: 'deal_confirmed',
  MESSAGE_RECEIVED: 'message_received',
  DEAL_COMPLETED: 'deal_completed',
  DEAL_CANCELLED: 'deal_cancelled',
  DEADLINE_PASSED: 'deadline_passed',
  CANCELLATION_REQUEST: 'cancellation_request',
  CANCELLATION_APPROVED: 'cancellation_approved',
  CANCELLATION_REJECTED: 'cancellation_rejected',
  WALLET_DEPOSIT: 'wallet_deposit',
  WALLET_WITHDRAW: 'wallet_withdraw',
  WALLET_DEPOSIT_APPROVED: 'wallet_deposit_approved',
  WALLET_DEPOSIT_REJECTED: 'wallet_deposit_rejected',
  WALLET_WITHDRAW_APPROVED: 'wallet_withdraw_approved',
  WALLET_WITHDRAW_REJECTED: 'wallet_withdraw_rejected',
  WALLET_BALANCE_UPDATED: 'wallet_balance_updated',
  WALLET_DEAL_PAYMENT: 'wallet_deal_payment',
  WALLET_DEAL_RELEASE: 'wallet_deal_release',
  MONEY_SENT: 'money_sent',
  MONEY_RECEIVED: 'money_received',
};

export const USER_ROLES = {
  BUYER: 'buyer',
  SELLER: 'seller',
  FREELANCER: 'freelancer',
  CLIENT: 'client'
};

export const TRANSACTION_TYPE = {
  CREDIT: 'credit',
  DEBIT: 'debit',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  PAYMENT: 'payment',
  RELEASE: 'release'
};

const DEPOSIT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

const WITHDRAW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
};

// ============================================================
// ✅ Notification Icons Mapping
// ============================================================
const NOTIFICATION_ICONS = {
  [NOTIFICATION_TYPES.BID_RECEIVED]: { icon: 'fa-solid fa-gavel', colorClass: 'noti-project' },
  [NOTIFICATION_TYPES.BID_ACCEPTED]: { icon: 'fa-solid fa-check-circle', colorClass: 'noti-success' },
  [NOTIFICATION_TYPES.PAYMENT_RECEIVED]: { icon: 'fa-solid fa-wallet', colorClass: 'noti-payment' },
  [NOTIFICATION_TYPES.PAYMENT_RELEASED]: { icon: 'fa-solid fa-circle-check', colorClass: 'noti-success' },
  [NOTIFICATION_TYPES.MILESTONE_COMPLETED]: { icon: 'fa-solid fa-flag-checkered', colorClass: 'noti-project' },
  [NOTIFICATION_TYPES.DEAL_CONFIRMED]: { icon: 'fa-solid fa-handshake', colorClass: 'noti-success' },
  [NOTIFICATION_TYPES.MESSAGE_RECEIVED]: { icon: 'fa-solid fa-comment-dots', colorClass: 'noti-message' },
  [NOTIFICATION_TYPES.DEAL_COMPLETED]: { icon: 'fa-solid fa-trophy', colorClass: 'noti-success' },
  [NOTIFICATION_TYPES.DEAL_CANCELLED]: { icon: 'fa-solid fa-ban', colorClass: 'noti-danger' },
  [NOTIFICATION_TYPES.DEADLINE_PASSED]: { icon: 'fa-solid fa-clock', colorClass: 'noti-warning' },
  [NOTIFICATION_TYPES.CANCELLATION_REQUEST]: { icon: 'fa-solid fa-clock', colorClass: 'noti-warning' },
  [NOTIFICATION_TYPES.CANCELLATION_APPROVED]: { icon: 'fa-solid fa-ban', colorClass: 'noti-danger' },
  [NOTIFICATION_TYPES.CANCELLATION_REJECTED]: { icon: 'fa-solid fa-times', colorClass: 'noti-system' },
  [NOTIFICATION_TYPES.WALLET_DEPOSIT]: { icon: 'fa-solid fa-arrow-down-left', colorClass: 'noti-payment' },
  [NOTIFICATION_TYPES.WALLET_WITHDRAW]: { icon: 'fa-solid fa-arrow-up-right-from-square', colorClass: 'noti-payment' },
  [NOTIFICATION_TYPES.WALLET_DEPOSIT_APPROVED]: { icon: 'fa-solid fa-check-circle', colorClass: 'noti-success' },
  [NOTIFICATION_TYPES.WALLET_DEPOSIT_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },
  [NOTIFICATION_TYPES.WALLET_WITHDRAW_APPROVED]: { icon: 'fa-solid fa-check-circle', colorClass: 'noti-success' },
  [NOTIFICATION_TYPES.WALLET_WITHDRAW_REJECTED]: { icon: 'fa-solid fa-times-circle', colorClass: 'noti-danger' },
  [NOTIFICATION_TYPES.WALLET_BALANCE_UPDATED]: { icon: 'fa-solid fa-wallet', colorClass: 'noti-payment' },
  [NOTIFICATION_TYPES.WALLET_DEAL_PAYMENT]: { icon: 'fa-solid fa-credit-card', colorClass: 'noti-payment' },
  [NOTIFICATION_TYPES.WALLET_DEAL_RELEASE]: { icon: 'fa-solid fa-circle-check', colorClass: 'noti-success' },
  [NOTIFICATION_TYPES.MONEY_SENT]: { icon: 'fa-solid fa-arrow-up-right-from-square', colorClass: 'noti-payment' },
  [NOTIFICATION_TYPES.MONEY_RECEIVED]: { icon: 'fa-solid fa-arrow-down-left', colorClass: 'noti-success' },
};

// ============================================================
// ✅ LRU Cache for User Data
// ============================================================
class LRUCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

const userCache = new LRUCache(100);

const getUserData = async (userId) => {
  if (!userId) return { name: 'Someone', mode: USER_ROLES.BUYER };
  
  const cached = userCache.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    let data = { name: userId.slice(0, 8), mode: USER_ROLES.BUYER };
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      let mode = USER_ROLES.BUYER;
      if (userData.role === USER_ROLES.FREELANCER || userData.role === USER_ROLES.SELLER) {
        mode = USER_ROLES.SELLER;
      } else if (userData.role === USER_ROLES.CLIENT || userData.role === USER_ROLES.BUYER) {
        mode = USER_ROLES.BUYER;
      }
      
      data = {
        name: userData.displayName || userData.name || userId.slice(0, 8),
        mode: mode,
        email: userData.email,
        phone: userData.phone,
      };
    }
    
    userCache.set(userId, data);
    return data;
  } catch (error) {
    console.error("Error getting user data:", error);
    return { name: userId.slice(0, 8), mode: USER_ROLES.BUYER };
  }
};

// ============================================================
// ✅ Duplicate Prevention (fast, short-window, in-memory guard —
// only helps within the SAME tab/session. Real de-dup is the
// persistent Firestore id below via getPersistentNotificationId)
// ============================================================
const sentNotifications = new Map();

const isDuplicate = (userId, type, data) => {
  // 🔧 FIX: previously fell back to `${type}-${Date.now()}` when no
  // unique key existed, which is always unique -> the guard did
  // nothing for those calls. Now falls back to just `type`, which at
  // least blocks two identical-type calls fired back-to-back
  // (e.g. an effect re-running) within the 10s window.
  const uniqueKey = data.transferId || data.transactionId || data.dealId || data.relatedId || data.postTitle || type || 'generic';
  const key = `${userId}-${type}-${uniqueKey}`;
  
  if (sentNotifications.has(key)) {
    return true;
  }
  sentNotifications.set(key, Date.now());
  
  setTimeout(() => {
    sentNotifications.delete(key);
  }, 10000);
  
  return false;
};


const getPersistentNotificationId = (userId, type, options) => {
  if (type === NOTIFICATION_TYPES.MESSAGE_RECEIVED && !options.messageId && !options.idempotencyKey) {
    return null;
  }

  const entityId = options.idempotencyKey || options.messageId || options.transactionId ||
    options.transferId || options.dealId || options.relatedId;
  if (!entityId) {
    // 🔧 Visible in dev so it's easy to spot which senders still need
    // a stable id passed in (dealId/transactionId/relatedId/transferId).
    if (import.meta.env.DEV) {
      console.warn(`⚠️ No stable id for notification type "${type}" — this send is NOT idempotent (can duplicate on retry).`);
    }
    return null;
  }

  return `${userId}_${type || 'system'}_${entityId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
};

// ============================================================
// ✅ Core Notification Sender (Firestore)
// ============================================================
export const sendNotification = async (userId, title, message, mode, options = {}) => {
  if (!userId) {
    console.error("❌ No userId provided for notification");
    return null;
  }

  if (isDuplicate(userId, options.type, options)) {
    console.log(`⏭️ Duplicate notification skipped: ${options.type}`);
    return null;
  }

  const notificationId = getPersistentNotificationId(userId, options.type, options);
  let attempts = 0;
  const maxAttempts = 3;
  let lastError = null;

  while (attempts < maxAttempts) {
    try {
      const iconData = NOTIFICATION_ICONS[options.type] || { icon: 'fa-solid fa-bell', colorClass: 'noti-system' };
      
      const notificationData = {
        userId: userId,
        title: title,
        message: message,
        mode: mode || USER_ROLES.BUYER,
        isUnread: true,
        icon: options.icon || iconData.icon,
        colorClass: options.colorClass || iconData.colorClass,
        type: options.type || 'system',
        event: options.type || 'system',
        createdAt: serverTimestamp(),
        readAt: null,
      };
      
      if (options.relatedId) notificationData.relatedId = options.relatedId;
      if (options.dealId) notificationData.dealId = options.dealId;
      if (options.postTitle) notificationData.postTitle = options.postTitle;
      if (options.transferId) notificationData.transferId = options.transferId;
      if (options.transactionId) notificationData.transactionId = options.transactionId;
      if (options.actionRequired) {
        notificationData.actionRequired = options.actionRequired;
        notificationData.actionType = options.actionType || 'respond';
      }
      
      let docRef;
      if (notificationId) {
        docRef = doc(db, 'notifications', notificationId);

        // 🔧 FIX: getDoc() + setDoc() as two separate calls is not
        // atomic — two concurrent calls (double click, two tabs,
        // retried request) could both observe "doesn't exist" and
        // both write, defeating the whole point of notificationId
        // dedup. A transaction makes the check + write atomic.
        const wasCreated = await runTransaction(db, async (transaction) => {
          const existingSnap = await transaction.get(docRef);
          if (existingSnap.exists()) {
            return false;
          }
          transaction.set(docRef, { ...notificationData, idempotencyKey: notificationId });
          return true;
        });

        if (!wasCreated) {
          console.log('Persistent duplicate notification skipped:', notificationId);
          return docRef.id;
        }
      } else {
        docRef = await addDoc(collection(db, 'notifications'), notificationData);
      }
      console.log("✅ Notification sent to:", userId, "Doc ID:", docRef.id);
      
      // ============================================================
      // 🔧 FIX (the main duplicate-notification bug):
      // Push-notification sending must NEVER be able to cause the
      // Firestore write above to be retried. Previously, if this threw,
      // the outer catch caught it and looped back to the top — and for
      // any notification type without a stable id (notificationId ===
      // null, i.e. addDoc path) that meant a SECOND Firestore document
      // got created for the exact same event. Isolating it here means
      // a push failure is just logged, never retried, never duplicates
      // the notification doc.
      // ============================================================
      try {
        await sendPushNotification(userId, title, message, options);
      } catch (pushError) {
        console.error("⚠️ Push notification failed (notification doc already saved, not retrying):", pushError);
      }
      
      return docRef.id;
      
    } catch (error) {
      lastError = error;
      attempts++;
      console.error(`❌ Error sending notification (attempt ${attempts}/${maxAttempts}):`, error);

      // 🔧 FIX: don't burn remaining attempts on errors that will
      // never succeed on retry (bad permissions, malformed data).
      if (error.code === 'permission-denied' || error.code === 'invalid-argument') {
        break;
      }

      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }

  console.error("❌ Failed to send notification after", attempts, "attempt(s):", lastError);
  return null;
};

// ============================================================
// ============================================================
// ✅ FCM (Firebase Cloud Messaging) — read-only helper
//
// 🔧 FIX (item #8): this section used to contain a full second set of
// FCM functions (saveFCMToken, deleteFCMToken, initializeFCM,
// setupForegroundMessageListener, getNotificationPermissionStatus,
// isPushSupported, requestNotificationPermission,
// getFCMTokenFromDevice, deleteFCMTokenFromDevice) — a third,
// completely separate, duplicate notification/permission
// implementation, on top of the ones in AuthContext.jsx and
// App.jsx. None of it was imported anywhere else in the app (dead
// code), a couple of the functions (initializeFCM,
// requestNotificationPermission) called
// Notification.requestPermission() directly with no user-gesture
// guard — the exact bug already fixed elsewhere — and its own
// saveFCMToken duplicated AuthContext's saveNotificationToken
// writing to the same field. All of that is removed. The one thing
// this file actually needs — reading a user's saved token so
// sendPushNotification (below) can look it up — stays, as a single
// read-only helper.
// ============================================================

export const getFCMToken = async (userId) => {
  if (!userId) {
    console.error("❌ getFCMToken: userId missing");
    return null;
  }

  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      return data.notification?.token || data.fcmToken || null;
    }
    return null;
  } catch (error) {
    console.error("❌ Error getting FCM token:", error);
    return null;
  }
};

export const deleteFCMToken = async (userId) => {
  if (!userId) {
    console.error("❌ deleteFCMToken: userId missing");
    return false;
  }

  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'notification.token': null,
      'notification.enabled': false,
      'notification.updatedAt': serverTimestamp(),
    });

    console.log("✅ FCM Token deleted for user:", userId);
    return true;
  } catch (error) {
    console.error("❌ Error deleting FCM token:", error);
    return false;
  }
};

// ============================================================
// 🔧 FIX (item #8, follow-up): this used to fetch()
// '/api/send-push-notification' — a backend route that never
// existed anywhere in this project. That's the reason a closed tab
// / backgrounded phone never got a real system notification: the
// Firestore notification document still got created (that's what
// powers the in-app bell/list, and the in-app browser banner while
// a tab is open), but nothing ever told FCM to actually deliver a
// push to the device.
//
// Now it calls the new worktrust-push-worker (see
// worktrust-push-worker/src/index.js) — a small Cloudflare Worker
// that signs its own Google OAuth token and calls FCM's HTTP v1
// send API directly. This needs no Blaze plan: Blaze only gates
// *deploying a Cloud Function*, not calling FCM's REST API, which
// is free and unlimited on the Spark (free) plan. See that file's
// header comment for the full setup (secrets to set, KV namespace
// to create, IAM role to add).
//
// VITE_PUSH_API_URL must point at your deployed worker, e.g.
// https://worktrust-push.<your-subdomain>.workers.dev — and
// VITE_PUSH_SHARED_SECRET must match the PUSH_SHARED_SECRET secret
// you set on that worker. Until both are set, this safely no-ops
// (logs in dev, silent in production) instead of making a request
// that's guaranteed to fail — exactly like before, just now it
// actually works once those two are configured.
// ============================================================
export const sendPushNotification = async (userId, title, message, options = {}) => {
  const token = await getFCMToken(userId);

  if (!token) {
    console.log("ℹ️ No FCM token found for user:", userId);
    return false;
  }

  const pushApiUrl = import.meta.env.VITE_PUSH_API_URL;
  const pushSharedSecret = import.meta.env.VITE_PUSH_SHARED_SECRET;

  if (!pushApiUrl || !pushSharedSecret) {
    if (import.meta.env.DEV) {
      console.log("📱 [DEV] Push notification would be sent (set VITE_PUSH_API_URL + VITE_PUSH_SHARED_SECRET to actually send):", {
        userId,
        title,
        message,
        type: options.type || 'notification',
        token: token.slice(0, 20) + '...',
      });
    }
    return false;
  }

  try {
    const response = await fetch(`${pushApiUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Push-Secret': pushSharedSecret,
      },
      body: JSON.stringify({
        token,
        title,
        message,
        link: options.link || '/',
        data: {
          type: options.type || 'notification',
          dealId: options.dealId || '',
          relatedId: options.relatedId || '',
          postTitle: options.postTitle || '',
          actionRequired: options.actionRequired ? 'true' : 'false',
          actionType: options.actionType || '',
        },
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.warn("⚠️ Push worker rejected the notification:", result?.message);

      // Token is dead (uninstalled, cleared site data, expired) —
      // clear it so future notifications don't keep trying it and
      // the user gets a fresh permission/subscribe prompt instead.
      if (result?.staleToken) {
        await deleteFCMToken(userId);
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ Error calling push worker:", error);
    return false;
  }
};


// ============================================================
// ✅ Money Transfer Notification (Combined)
// ============================================================
export const sendMoneyTransferNotification = async ({
  senderId,
  senderName,
  receiverId,
  receiverName,
  amount,
  transferId,
  transactionId,
  note = '',
}) => {
  const sender = await getUserData(senderId);
  const receiver = await getUserData(receiverId);
  
  await sendNotification(
    senderId,
    '💸 Money Sent',
    `You sent ৳${amount} to ${receiverName}`,
    sender.mode,
    {
      icon: 'fa-solid fa-arrow-up-right-from-square',
      colorClass: 'noti-payment',
      type: NOTIFICATION_TYPES.MONEY_SENT,
      transferId: transferId,
      transactionId: transactionId,
    }
  );
  
  await sendNotification(
    receiverId,
    '💰 Money Received',
    `You received ৳${amount} from ${senderName}`,
    receiver.mode,
    {
      icon: 'fa-solid fa-arrow-up-right-from-square',
      colorClass: 'noti-success',
      type: NOTIFICATION_TYPES.MONEY_RECEIVED,
      transferId: transferId,
      transactionId: transactionId,
    }
  );
};

// ============================================================
// ✅ Wallet Balance Notification
// 🔧 FIX: added `transactionId` param and forward it in options so
// this gets a persistent id too. Previously the only "id" attempt was
// `dealTitle.includes('transfer') ? dealTitle : undefined`, which is
// almost always undefined -> addDoc path -> not idempotent -> could
// duplicate on retry. Callers should now pass the actual Firestore
// transaction/ledger doc id they already created for this change.
// ============================================================
export const sendWalletBalanceNotification = async (userId, amount, type, dealTitle = '', customTitle = '', customType = '', transactionId = null) => {
  if (!userId) {
    console.error("❌ sendWalletBalanceNotification: userId missing");
    return;
  }

  const user = await getUserData(userId);
  const isCredit = type === TRANSACTION_TYPE.CREDIT || type === TRANSACTION_TYPE.DEPOSIT;
  
  let title = customTitle || (isCredit ? '💰 টাকা যোগ হয়েছে' : '💸 টাকা কাটা হয়েছে');
  const action = isCredit ? 'যোগ' : 'কাটা';
  
  let message = `আপনার ওয়ালেটে ${amount} BDT ${action} হয়েছে`;
  if (dealTitle) {
    message += ` (${dealTitle})`;
  }

  const notificationType = customType || NOTIFICATION_TYPES.WALLET_BALANCE_UPDATED;

  await sendNotification(
    userId,
    title,
    message,
    user.mode,
    {
      icon: isCredit ? 'fa-solid fa-plus-circle' : 'fa-solid fa-minus-circle',
      colorClass: isCredit ? 'noti-success' : 'noti-danger',
      type: notificationType,
      transactionId: transactionId || undefined,
      relatedId: transactionId || undefined,
    }
  );
};

// ============================================================
// ✅ Send Money Notifications (Separate)
// ============================================================
export const sendMoneySentNotification = async (senderId, amount, receiverName, transferId) => {
  if (!senderId) return;
  
  const sender = await getUserData(senderId);
  
  await sendNotification(
    senderId,
    '💸 Money Sent',
    `You sent ৳${amount} to ${receiverName}`,
    sender.mode,
    {
      icon: 'fa-solid fa-arrow-up-right-from-square',
      colorClass: 'noti-payment',
      type: NOTIFICATION_TYPES.WALLET_BALANCE_UPDATED,
      transferId: transferId,
    }
  );
};

export const sendMoneyReceivedNotification = async (receiverId, amount, senderName, transferId) => {
  if (!receiverId) return;
  
  const receiver = await getUserData(receiverId);
  
  await sendNotification(
    receiverId,
    '💰 Money Received',
    `You received ৳${amount} from ${senderName}`,
    receiver.mode,
    {
      icon: 'fa-solid fa-arrow-up-right-from-square',
      colorClass: 'noti-success',
      type: NOTIFICATION_TYPES.WALLET_BALANCE_UPDATED,
      transferId: transferId,
    }
  );
};

// ============================================================
// ✅ 1. Bid Notifications
// ============================================================
export const sendBidNotification = async (sellerId, buyerId, projectTitle, projectId, sellerName, bidAmount) => {
  const seller = await getUserData(sellerId);
  const displayName = sellerName || seller.name;
  
  await sendNotification(
    buyerId,
    '📋 নতুন বিড এসেছে',
    `${displayName} আপনার "${projectTitle}" প্রজেক্টে ${bidAmount} BDT তে বিড করেছেন`,
    USER_ROLES.BUYER,
    { 
      icon: 'fa-solid fa-gavel', 
      colorClass: 'noti-project', 
      type: NOTIFICATION_TYPES.BID_RECEIVED,
      relatedId: projectId,
      dealId: projectId,
      postTitle: projectTitle
    }
  );
  
  await sendNotification(
    sellerId,
    '✅ বিড সফল হয়েছে',
    `আপনার বিড "${projectTitle}" প্রজেক্টে সফলভাবে জমা হয়েছে`,
    USER_ROLES.SELLER,
    { 
      icon: 'fa-solid fa-paper-plane', 
      colorClass: 'noti-project', 
      type: NOTIFICATION_TYPES.BID_RECEIVED,
      relatedId: projectId,
      dealId: projectId,
      postTitle: projectTitle
    }
  );
};

// ============================================================
// ✅ 2. Deal Notifications
// ============================================================
export const sendDealNotification = async (buyerId, sellerId, dealTitle, dealId) => {
  const buyer = await getUserData(buyerId);
  const seller = await getUserData(sellerId);
  
  await sendNotification(
    buyerId,
    '🎉 ডিল কনফার্ম হয়েছে',
    `আপনার "${dealTitle}" ডিলটি কনফার্ম হয়েছে। এখন কাজ শুরু করতে পারেন।`,
    buyer.mode,
    { 
      icon: 'fa-solid fa-handshake', 
      colorClass: 'noti-project', 
      type: NOTIFICATION_TYPES.DEAL_CONFIRMED,
      dealId: dealId,
      postTitle: dealTitle
    }
  );
  
  await sendNotification(
    sellerId,
    '🚀 ডিল স্টার্ট হয়েছে',
    `ক্লায়েন্ট "${dealTitle}" ডিলটি কনফার্ম করেছেন। আপনি কাজ শুরু করতে পারেন!`,
    seller.mode,
    { 
      icon: 'fa-solid fa-rocket', 
      colorClass: 'noti-project', 
      type: NOTIFICATION_TYPES.DEAL_CONFIRMED,
      dealId: dealId,
      postTitle: dealTitle
    }
  );
};

// ============================================================
// ✅ 3. Payment Notifications
// ============================================================
export const sendPaymentNotification = async (userId, amount, mode, dealTitle, dealId) => {
  const user = await getUserData(userId);
  
  await sendNotification(
    userId,
    '💰 পেমেন্ট সফল হয়েছে',
    `আপনার ওয়ালেটে ${amount} BDT জমা হয়েছে "${dealTitle}" এর জন্য`,
    user.mode,
    { 
      icon: 'fa-solid fa-wallet', 
      colorClass: 'noti-payment', 
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      dealId: dealId,
      postTitle: dealTitle
    }
  );
};

// ============================================================
// ✅ 4. Milestone Notifications
// ============================================================
export const sendMilestoneNotification = async (buyerId, sellerId, milestoneTitle, dealTitle, dealId, sellerName) => {
  const buyer = await getUserData(buyerId);
  const seller = await getUserData(sellerId);
  const displayName = sellerName || seller.name;
  
  await sendNotification(
    buyerId,
    '📝 মাইলস্টোন রিভিউ রিকোয়েস্ট',
    `${displayName} "${milestoneTitle}" মাইলস্টোনটি সম্পন্ন করেছেন। রিভিউ করে পেমেন্ট রিলিজ করুন।`,
    buyer.mode,
    { 
      icon: 'fa-solid fa-check-circle', 
      colorClass: 'noti-project', 
      type: NOTIFICATION_TYPES.MILESTONE_COMPLETED,
      dealId: dealId,
      postTitle: dealTitle,
      actionRequired: true,
      actionType: 'review_milestone'
    }
  );
  
  await sendNotification(
    sellerId,
    '✅ মাইলস্টোন জমা হয়েছে',
    `আপনার "${milestoneTitle}" মাইলস্টোনটি রিভিউয়ের জন্য জমা হয়েছে।`,
    seller.mode,
    { 
      icon: 'fa-solid fa-clock', 
      colorClass: 'noti-project', 
      type: NOTIFICATION_TYPES.MILESTONE_COMPLETED,
      dealId: dealId,
      postTitle: dealTitle
    }
  );
};

// ============================================================
// ✅ 5. Message Notifications
// ============================================================
export const sendMessageNotification = async (receiverId, receiverMode, senderName, chatId) => {
  await sendNotification(
    receiverId,
    '💬 নতুন মেসেজ',
    `${senderName} আপনাকে একটি নতুন মেসেজ পাঠিয়েছেন`,
    receiverMode || USER_ROLES.BUYER,
    { 
      icon: 'fa-solid fa-comment-dots', 
      colorClass: 'noti-system', 
      type: NOTIFICATION_TYPES.MESSAGE_RECEIVED,
      relatedId: chatId
    }
  );
};

// ============================================================
// ✅ 6. Deal Complete Notifications
// ============================================================
export const sendDealCompleteNotification = async (buyerId, sellerId, dealTitle, dealId) => {
  const buyer = await getUserData(buyerId);
  const seller = await getUserData(sellerId);
  
  await sendNotification(
    buyerId,
    '🏆 ডিল সম্পূর্ণ হয়েছে',
    `"${dealTitle}" ডিলটি সফলভাবে সম্পূর্ণ হয়েছে। সেলারকে রেটিং দিন।`,
    buyer.mode,
    { 
      icon: 'fa-solid fa-trophy', 
      colorClass: 'noti-project', 
      type: NOTIFICATION_TYPES.DEAL_COMPLETED,
      dealId: dealId,
      postTitle: dealTitle
    }
  );
  
  await sendNotification(
    sellerId,
    '🏆 ডিল সম্পূর্ণ হয়েছে',
    `"${dealTitle}" ডিলটি সফলভাবে সম্পূর্ণ হয়েছে। ক্লায়েন্টকে রেটিং দিন।`,
    seller.mode,
    { 
      icon: 'fa-solid fa-trophy', 
      colorClass: 'noti-project', 
      type: NOTIFICATION_TYPES.DEAL_COMPLETED,
      dealId: dealId,
      postTitle: dealTitle
    }
  );
};

// ============================================================
// ✅ 7-11. Cancellation & Deadline Notifications
// ============================================================
export const sendCancellationRequestNotification = async (userId, postTitle, dealId, requesterName, reason, budget) => {
  const user = await getUserData(userId);
  const safePostTitle = postTitle || 'Untitled Deal';
  const safeRequesterName = requesterName || 'Someone';
  const safeReason = reason || 'No reason provided';
  
  await sendNotification(
    userId,
    '⚠️ ডিল ক্যানসেল রিকোয়েস্ট',
    `${safeRequesterName} "${safePostTitle}" (Budget: ${budget || 0} BDT) ডিলটি ক্যানসেল করতে চান। কারণ: ${safeReason}`,
    user.mode,
    {
      icon: 'fa-solid fa-clock',
      colorClass: 'noti-warning',
      type: NOTIFICATION_TYPES.CANCELLATION_REQUEST,
      dealId: dealId,
      postTitle: safePostTitle,
      actionRequired: true,
      actionType: 'cancel_respond'
    }
  );
};

export const sendCancellationApprovedNotification = async (buyerId, sellerId, postTitle, dealId) => {
  const buyer = await getUserData(buyerId);
  const seller = await getUserData(sellerId);
  const safePostTitle = postTitle || 'Untitled Deal';
  
  await sendNotification(
    buyerId,
    '❌ ডিল ক্যানসেল হয়েছে',
    `"${safePostTitle}" ডিলটি উভয় পক্ষের সম্মতিতে ক্যানসেল করা হয়েছে।`,
    buyer.mode,
    {
      icon: 'fa-solid fa-ban',
      colorClass: 'noti-danger',
      type: NOTIFICATION_TYPES.CANCELLATION_APPROVED,
      dealId: dealId,
      postTitle: safePostTitle
    }
  );
  
  await sendNotification(
    sellerId,
    '❌ ডিল ক্যানসেল হয়েছে',
    `"${safePostTitle}" ডিলটি উভয় পক্ষের সম্মতিতে ক্যানসেল করা হয়েছে।`,
    seller.mode,
    {
      icon: 'fa-solid fa-ban',
      colorClass: 'noti-danger',
      type: NOTIFICATION_TYPES.CANCELLATION_APPROVED,
      dealId: dealId,
      postTitle: safePostTitle
    }
  );
};

export const sendCancellationRejectedNotification = async (userId, postTitle, dealId) => {
  const user = await getUserData(userId);
  const safePostTitle = postTitle || 'Untitled Deal';
  
  await sendNotification(
    userId,
    '✅ ক্যানসেল রিকোয়েস্ট রিজেক্ট',
    `"${safePostTitle}" ডিলের ক্যানসেল রিকোয়েস্টটি রিজেক্ট করা হয়েছে। ডিল অ্যাক্টিভ আছে।`,
    user.mode,
    {
      icon: 'fa-solid fa-check-circle',
      colorClass: 'noti-system',
      type: NOTIFICATION_TYPES.CANCELLATION_REJECTED,
      dealId: dealId,
      postTitle: safePostTitle
    }
  );
};

export const sendDeadlinePassedNotification = async (sellerId, buyerId, postTitle, dealId) => {
  if (!sellerId || !buyerId) {
    console.error("❌ sendDeadlinePassedNotification: sellerId or buyerId missing", { sellerId, buyerId });
    return;
  }
  
  const seller = await getUserData(sellerId);
  const buyer = await getUserData(buyerId);
  const safePostTitle = postTitle || 'Untitled Deal';
  
  await sendNotification(
    sellerId,
    '⏰ ডেডলাইন শেষ হয়েছে',
    `"${safePostTitle}" ডিলের ডেডলাইন শেষ হয়েছে। অনুগ্রহ করে ক্লায়েন্টকে আপডেট দিন।`,
    seller.mode,
    {
      icon: 'fa-solid fa-clock',
      colorClass: 'noti-warning',
      type: NOTIFICATION_TYPES.DEADLINE_PASSED,
      dealId: dealId,
      postTitle: safePostTitle,
      actionRequired: true,
      actionType: 'update_progress'
    }
  );
  
  await sendNotification(
    buyerId,
    '⏰ ডেডলাইন শেষ হয়েছে',
    `"${safePostTitle}" ডিলের ডেডলাইন শেষ হয়েছে। সেলারের সাথে যোগাযোগ করতে পারেন।`,
    buyer.mode,
    {
      icon: 'fa-solid fa-clock',
      colorClass: 'noti-warning',
      type: NOTIFICATION_TYPES.DEADLINE_PASSED,
      dealId: dealId,
      postTitle: safePostTitle
    }
  );
};

export const sendDealCancelledNotification = async (userId, postTitle, dealId, cancelledBy, reason) => {
  if (!userId) return;
  
  const user = await getUserData(userId);
  const safePostTitle = postTitle || 'Untitled Deal';
  const safeCancelledBy = cancelledBy || 'Someone';
  const safeReason = reason || 'No reason provided';
  
  await sendNotification(
    userId,
    '❌ ডিল ক্যানসেল হয়েছে',
    `${safeCancelledBy} "${safePostTitle}" ডিলটি ক্যানসেল করেছেন। কারণ: ${safeReason}`,
    user.mode,
    {
      icon: 'fa-solid fa-ban',
      colorClass: 'noti-danger',
      type: NOTIFICATION_TYPES.DEAL_CANCELLED,
      dealId: dealId,
      postTitle: safePostTitle
    }
  );
};

// ============================================================
// ✅ Wallet Deposit & Withdraw Notifications
// ============================================================
export const sendWalletDepositNotification = async (
  userId, 
  amount, 
  trxId, 
  method, 
  status = DEPOSIT_STATUS.PENDING,
  transactionId = null
) => {
  if (!userId) {
    console.error("❌ sendWalletDepositNotification: userId missing");
    return;
  }

  // 🔧 FIX: transactionId is now required for a stable id. If the
  // caller genuinely doesn't have a Firestore doc id yet at the
  // PENDING stage, fall back to the deposit's trxId (still stable
  // and unique per real-world request) instead of leaving it empty.
  const stableId = transactionId || trxId || null;

  const user = await getUserData(userId);
  
  const baseOptions = {
    icon: 'fa-solid fa-clock',
    colorClass: 'noti-payment',
    type: NOTIFICATION_TYPES.WALLET_DEPOSIT,
  };

  if (stableId) {
    baseOptions.relatedId = stableId;
    baseOptions.dealId = stableId;
    baseOptions.transactionId = stableId;
  }
  
  if (status === DEPOSIT_STATUS.PENDING) {
    await sendNotification(
      userId,
      '💰 ডিপোজিট রিকোয়েস্ট জমা হয়েছে',
      `আপনার ${amount} BDT ডিপোজিট রিকোয়েস্টটি জমা হয়েছে। TrxID: ${trxId} (${method})`,
      user.mode,
      {
        ...baseOptions,
        icon: 'fa-solid fa-clock',
        colorClass: 'noti-payment',
        type: NOTIFICATION_TYPES.WALLET_DEPOSIT,
      }
    );
  } else if (status === DEPOSIT_STATUS.APPROVED) {
    await sendNotification(
      userId,
      '✅ ডিপোজিট অ্যাপ্রুভ হয়েছে',
      `আপনার ${amount} BDT ডিপোজিট অ্যাপ্রুভ হয়েছে এবং ওয়ালেটে যোগ করা হয়েছে।`,
      user.mode,
      {
        ...baseOptions,
        icon: 'fa-solid fa-check-circle',
        colorClass: 'noti-success',
        type: NOTIFICATION_TYPES.WALLET_DEPOSIT_APPROVED,
      }
    );
  } else if (status === DEPOSIT_STATUS.REJECTED) {
    await sendNotification(
      userId,
      '❌ ডিপোজিট রিজেক্ট হয়েছে',
      `আপনার ${amount} BDT ডিপোজিট রিকোয়েস্টটি রিজেক্ট করা হয়েছে।`,
      user.mode,
      {
        ...baseOptions,
        icon: 'fa-solid fa-times-circle',
        colorClass: 'noti-danger',
        type: NOTIFICATION_TYPES.WALLET_DEPOSIT_REJECTED,
      }
    );
  }
};

export const sendWalletWithdrawNotification = async (
  userId,
  amount,
  method,
  mobileNumber,
  status = WITHDRAW_STATUS.PENDING,
  transactionId = null
) => {
  if (!userId) return;

  const user = await getUserData(userId);
  
  const baseOptions = {
    icon: 'fa-solid fa-clock',
    colorClass: 'noti-payment',
    type: NOTIFICATION_TYPES.WALLET_WITHDRAW,
  };

  if (transactionId) {
    baseOptions.relatedId = transactionId;
    baseOptions.dealId = transactionId;
  }

  if (status === WITHDRAW_STATUS.PENDING) {
    await sendNotification(
      userId,
      '💳 উইথড্র রিকোয়েস্ট জমা হয়েছে',
      `আপনার ${amount} BDT উইথড্র রিকোয়েস্টটি জমা হয়েছে। (${method})`,
      user.mode,
      {
        ...baseOptions,
        icon: 'fa-solid fa-clock',
        colorClass: 'noti-payment',
        type: NOTIFICATION_TYPES.WALLET_WITHDRAW,
      }
    );
  } else if (status === WITHDRAW_STATUS.APPROVED) {
    await sendNotification(
      userId,
      '✅ উইথড্র অ্যাপ্রুভ হয়েছে',
      `আপনার ${amount} BDT উইথড্র অ্যাপ্রুভ হয়েছে এবং প্রক্রিয়াধীন।`,
      user.mode,
      {
        ...baseOptions,
        icon: 'fa-solid fa-check-circle',
        colorClass: 'noti-success',
        type: NOTIFICATION_TYPES.WALLET_WITHDRAW_APPROVED,
      }
    );
  } else if (status === WITHDRAW_STATUS.REJECTED) {
    await sendNotification(
      userId,
      '❌ উইথড্র রিজেক্ট হয়েছে',
      `আপনার ${amount} BDT উইথড্র রিকোয়েস্টটি রিজেক্ট করা হয়েছে।`,
      user.mode,
      {
        ...baseOptions,
        icon: 'fa-solid fa-times-circle',
        colorClass: 'noti-danger',
        type: NOTIFICATION_TYPES.WALLET_WITHDRAW_REJECTED,
      }
    );
  }
};

// ============================================================
// ✅ Deal Payment Notifications
// ============================================================
export const sendDealPaymentNotification = async (userId, amount, dealTitle, dealId, type = 'funded') => {
  if (!userId) return;

  const user = await getUserData(userId);
  
  if (type === 'funded') {
    await sendNotification(
      userId,
      '💳 ডিল পেমেন্ট ফান্ড হয়েছে',
      `"${dealTitle}" ডিলের জন্য ${amount} BDT পেমেন্ট ফান্ড করা হয়েছে।`,
      user.mode,
      {
        icon: 'fa-solid fa-credit-card',
        colorClass: 'noti-payment',
        type: NOTIFICATION_TYPES.WALLET_DEAL_PAYMENT,
        dealId: dealId,
        postTitle: dealTitle
      }
    );
  } else if (type === 'released') {
    await sendNotification(
      userId,
      '✅ ডিল পেমেন্ট রিলিজ হয়েছে',
      `"${dealTitle}" ডিলের ${amount} BDT পেমেন্ট রিলিজ করা হয়েছে।`,
      user.mode,
      {
        icon: 'fa-solid fa-check-circle',
        colorClass: 'noti-success',
        type: NOTIFICATION_TYPES.WALLET_DEAL_RELEASE,
        dealId: dealId,
        postTitle: dealTitle
      }
    );
  }
};

// ============================================================
// ✅ Export all functions
// ============================================================
export default {
  getFCMToken,
  deleteFCMToken,
  sendPushNotification,

  sendNotification,
  sendBidNotification,
  sendDealNotification,
  sendPaymentNotification,
  sendMilestoneNotification,
  sendMessageNotification,
  sendDealCompleteNotification,
  sendCancellationRequestNotification,
  sendCancellationApprovedNotification,
  sendCancellationRejectedNotification,
  sendDeadlinePassedNotification,
  sendDealCancelledNotification,
  sendWalletDepositNotification,
  sendWalletWithdrawNotification,
  sendDealPaymentNotification,
  sendWalletBalanceNotification,
  sendMoneyTransferNotification,
  sendMoneySentNotification,
  sendMoneyReceivedNotification,
};