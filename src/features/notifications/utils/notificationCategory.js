// src/utils/notificationCategory.js
// ============================================================
// 🔧 FIX: এটা নতুন ফাইল — এখন থেকে App.js এবং Notifications.jsx
// দুই জায়গায়ই এই একই ম্যাপিং ব্যবহার করবে। আগে দুই জায়গায় দুই রকম
// (একটায় settings filter ছিল, একটায় ছিল না) লজিক থাকায় badge count
// আর notification list-এর মধ্যে অমিল হচ্ছিল, আর settings বন্ধ করলেও
// সব জায়গায় সমানভাবে কাজ করছিল না।
// ============================================================

export const NOTIFICATION_CATEGORY_MAP = {
  CHAT_MESSAGE: 'message',
  CHAT_IMAGE: 'message',
  CHAT_PROPOSAL: 'message',
  CHAT_PROPOSAL_ACCEPTED: 'message',
  CHAT_PROPOSAL_REJECTED: 'message',
  CHAT_DEAL_STARTED: 'deal',
  CHAT_USER_BLOCKED: 'message',
  CHAT_USER_UNBLOCKED: 'message',

  DEAL_CREATED: 'deal',
  DEAL_CONFIRMED: 'deal',
  DEAL_APPROVED: 'deal',
  DEAL_REJECTED: 'deal',
  DEAL_REOPENED: 'deal',
  DEAL_COMPLETED: 'deal',
  DEAL_CANCELLED: 'deal',
  DEAL_EXTENDED: 'deal',
  DEADLINE_PASSED: 'deal',
  DEAL_DEADLINE_PASSED: 'deal',
  DEAL_OVERDUE: 'deal',
  DISPUTE_OPENED: 'deal',
  OFFER_EXPIRED: 'deal',
  CANCELLATION_REQUEST: 'deal',
  CANCELLATION_APPROVED: 'deal',
  CANCELLATION_REJECTED: 'deal',
  MILESTONE_REVIEW: 'deal',
  MILESTONE_SUBMITTED: 'deal',
  MILESTONE_REJECTED: 'deal',

  MILESTONE_FUNDED: 'wallet',
  MILESTONE_RELEASED: 'wallet',
  MILESTONE_REFUNDED: 'wallet',
  PAYMENT_RECEIVED: 'wallet',
  PAYMENT_RELEASED: 'wallet',
  WALLET_CREDITED: 'wallet',
  WALLET_DEBITED: 'wallet',

  ADMIN_ANNOUNCEMENT: 'admin',
  ADMIN_NOTIFICATION: 'admin',
  USER_VERIFIED: 'admin',
  USER_BLOCKED: 'admin',
  USER_UNBLOCKED: 'admin',
  POST_APPROVED: 'admin',
  POST_REJECTED: 'admin',
  DEPOSIT_APPROVED: 'admin',
  DEPOSIT_REJECTED: 'admin',
  WITHDRAW_APPROVED: 'admin',
  WITHDRAW_REJECTED: 'admin',
  REPORT_RESOLVED: 'admin',
  REPORT_CANCELLED: 'admin',

  REVIEW_RECEIVED: 'review',
  REVIEW_REQUESTED: 'review',

  VERIFY_APPROVED: 'verification',
  VERIFY_REJECTED: 'verification',

  SYSTEM: 'system',
  SYSTEM_UPDATE: 'system',
  SYSTEM_ERROR: 'system',
  NOTIFICATION: 'system',
};

const SETTINGS_KEY_MAP = {
  message: 'messageNotifications',
  deal: 'dealUpdates',
  wallet: 'walletNotifications',
  admin: 'adminNotifications',
  review: 'reviewNotifications',
  verification: 'verificationNotifications',
  system: 'systemNotifications',
};

// 🔧 NEW: notification-category → sound-settings-key mapping. The sound
// toggles live in a SEPARATE localStorage object (workhub_sound_settings)
// with slightly different key names than the notification-settings object.
const SOUND_CATEGORY_MAP = {
  message: 'chat',
  deal: 'deal',
  wallet: 'wallet',
  admin: 'admin',
  review: 'review',
  verification: 'verification',
  system: 'system',
};

// 🔧 FIX (#9 unified unread count): chat messages already have their
// own reliable, per-participant unread counter — the `unreadCount`
// map on each `chats/{chatId}` doc (incremented on send, zeroed by
// markChatAsRead when the recipient opens the chat). Every new chat
// message ALSO writes a CHAT_* doc into the shared `notifications`
// collection (so a toast/sound can fire), but nothing ever flips
// THOSE docs' `isUnread` back to false — Notifications.jsx already
// hides them from its list for exactly this reason (see isChatEvent
// there). If NotificationProvider's badge counted them too, it would
// be a second, ever-growing, inconsistent "unread" counter for the
// same messages. Exporting this list so both places share one
// definition of "this event belongs to chat, not the general badge".
export const CHAT_MESSAGING_EVENTS = [
  'CHAT_MESSAGE',
  'CHAT_IMAGE',
  'CHAT_PROPOSAL',
  'CHAT_PROPOSAL_ACCEPTED',
  'CHAT_PROPOSAL_REJECTED',
  'CHAT_DEAL_STARTED',
  'CHAT_USER_BLOCKED',
  'CHAT_USER_UNBLOCKED',
];

export const isChatMessagingEvent = (event) => CHAT_MESSAGING_EVENTS.includes(event);

export const getCategoryForEvent = (event) => NOTIFICATION_CATEGORY_MAP[event] || 'system';

export const getSoundCategoryForEvent = (event) => {
  const category = getCategoryForEvent(event);
  return SOUND_CATEGORY_MAP[category] || 'notification';
};

/**
 * settings = localStorage-এ রাখা workhub_notification_settings অবজেক্ট।
 * settings না থাকলে (null) সব সময় enabled ধরা হয় — default behavior অপরিবর্তিত।
 * 🔧 FIX: এখন master "সব নোটিফিকেশন" (pushNotifications) toggle-ও চেক করে —
 * আগে App.js/Notifications.jsx-এর filter এই master toggle মানত না, শুধু
 * NotificationProvider মানত। ফলে master বন্ধ করলেও badge/list-এ কাউন্ট
 * বন্ধ হতো না — এখন সব জায়গায় consistent।
 */
export const isCategoryEnabled = (event, settings) => {
  if (!settings) return true;
  if (settings.pushNotifications === false) return false;
  const category = getCategoryForEvent(event);
  const key = SETTINGS_KEY_MAP[category] || 'systemNotifications';
  return settings[key] !== false;
};

/**
 * soundSettings = localStorage-এ রাখা workhub_sound_settings অবজেক্ট।
 * এখানে master enabled/muted/volume=0 এবং category-নির্দিষ্ট toggle —
 * দুটোই চেক করা হয়। soundSettings না থাকলে সব সময় enabled ধরা হয়।
 */
export const isSoundCategoryEnabled = (event, soundSettings) => {
  if (!soundSettings) return true;
  if (soundSettings.enabled === false) return false;
  if (soundSettings.muted === true) return false;
  if (soundSettings.volume === 0) return false;
  const soundKey = getSoundCategoryForEvent(event);
  return soundSettings[soundKey] !== false;
};

export default {
  NOTIFICATION_CATEGORY_MAP,
  CHAT_MESSAGING_EVENTS,
  isChatMessagingEvent,
  getCategoryForEvent,
  getSoundCategoryForEvent,
  isCategoryEnabled,
  isSoundCategoryEnabled,
};