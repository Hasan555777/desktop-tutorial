// src/UI/Notification/NotificationTemplates.js
// ============================================================
// 🔧 FIX APPLIED: added templates for events that NOTIFICATION_EVENTS
// declares but that had NO template here — NotificationProvider.notify()
// looks up NotificationTemplates[event] and silently does nothing
// (no sound, no Firestore write) when the template is missing. The
// file's own top comment already warned about this for four of them:
//   OFFER_EXPIRED, MILESTONE_SUBMITTED, MILESTONE_REJECTED, MILESTONE_REFUNDED
// Also found missing: DEAL_DEADLINE_PASSED (a separate constant from
// DEADLINE_PASSED — only DEADLINE_PASSED had a template) and
// REVIEW_REQUESTED. All six are added below, each marked "🔧 NEW".
// ============================================================

import { NOTIFICATION_EVENTS } from "./NotificationEvents";
import { SOUND_EVENTS } from "@/UI/Sound/SoundEvents";

// ============================================================
// 🎯 Notification Templates
// ============================================================
export const NotificationTemplates = {

  // ── 💬 Chat Events ──
  [NOTIFICATION_EVENTS.CHAT_MESSAGE]: (data) => ({
    title: data.senderName || "New Message",
    body: data.text || "You received a new message.",
    soundEvent: SOUND_EVENTS.CHAT_MESSAGE,
    browser: true,
    soundEnabled: true,
    inApp: false,
    icon: data.senderPhoto || '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'message',
    data: {
      chatId: data.chatId,
      messageId: data.messageId,
      senderId: data.senderId,
      senderName: data.senderName,
    }
  }),

  [NOTIFICATION_EVENTS.CHAT_IMAGE]: (data) => ({
    title: data.senderName || "New Image",
    body: "📷 Sent you an image",
    soundEvent: SOUND_EVENTS.CHAT_IMAGE,
    browser: true,
    soundEnabled: true,
    inApp: false,
    icon: data.senderPhoto || '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'message',
    data: {
      chatId: data.chatId,
      messageId: data.messageId,
      senderId: data.senderId,
      senderName: data.senderName,
    }
  }),

  [NOTIFICATION_EVENTS.CHAT_PROPOSAL]: (data) => ({
    title: "📄 New Proposal",
    body: `${data.senderName || 'Someone'} sent you a proposal for "${data.projectTitle || 'a project'}"`,
    soundEvent: SOUND_EVENTS.CHAT_PROPOSAL,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: data.senderPhoto || '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'message',
    data: {
      dealId: data.dealId,
      senderId: data.senderId,
      senderName: data.senderName,
    }
  }),

  [NOTIFICATION_EVENTS.CHAT_PROPOSAL_ACCEPTED]: (data) => ({
    title: "✅ Proposal Accepted",
    body: `Your proposal for "${data.projectTitle || 'a project'}" has been accepted!`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'message',
    data: {
      dealId: data.dealId,
      projectTitle: data.projectTitle,
    }
  }),

  [NOTIFICATION_EVENTS.CHAT_PROPOSAL_REJECTED]: (data) => ({
    title: "❌ Proposal Rejected",
    body: `Your proposal for "${data.projectTitle || 'a project'}" was rejected.`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'message',
    data: {
      dealId: data.dealId,
      projectTitle: data.projectTitle,
    }
  }),

  [NOTIFICATION_EVENTS.CHAT_DEAL_STARTED]: (data) => ({
    title: "🚀 Deal Started",
    body: `Deal "${data.projectTitle || 'a project'}" has been started!`,
    soundEvent: SOUND_EVENTS.DEAL,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      projectTitle: data.projectTitle,
    }
  }),

  // 🔧 NEW: CHAT_USER_BLOCKED / CHAT_USER_UNBLOCKED had no template
  // (safe no-op event constants otherwise — chat is deprecated per the
  // Notifications.jsx cleanup, so these are here only so notify()
  // never silently no-ops if some legacy code still calls them).
  [NOTIFICATION_EVENTS.CHAT_USER_BLOCKED]: (data) => ({
    title: "🚫 ব্যবহারকারী ব্লক করা হয়েছে",
    body: `${data.userName || 'একজন ব্যবহারকারী'} কে ব্লক করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: false,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'message',
    data: { userId: data.userId, chatId: data.chatId },
  }),

  [NOTIFICATION_EVENTS.CHAT_USER_UNBLOCKED]: (data) => ({
    title: "✅ ব্যবহারকারী আনব্লক করা হয়েছে",
    body: `${data.userName || 'একজন ব্যবহারকারী'} কে আনব্লক করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: false,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'message',
    data: { userId: data.userId, chatId: data.chatId },
  }),

  // ── 🤝 Deal Events ──
  [NOTIFICATION_EVENTS.DEAL_CREATED]: (data) => ({
    title: "📄 New Deal Created",
    body: `${data.senderName || 'Someone'} created a new deal for "${data.postTitle || 'a project'}"`,
    soundEvent: SOUND_EVENTS.DEAL_CREATED,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      senderId: data.senderId,
      senderName: data.senderName,
    }
  }),

  [NOTIFICATION_EVENTS.DEAL_CONFIRMED]: (data) => ({
    title: "🎉 ডিল কনফার্ম হয়েছে!",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলটি কনফার্ম হয়েছে। Budget: ${data.budget?.toLocaleString() || 0} BDT`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
      budget: data.budget,
    }
  }),

  [NOTIFICATION_EVENTS.DEAL_APPROVED]: (data) => ({
    title: "✅ Deal Approved",
    body: `Your deal "${data.postTitle || 'a project'}" has been approved!`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
    }
  }),

  [NOTIFICATION_EVENTS.DEAL_REJECTED]: (data) => ({
    title: "❌ Deal Rejected",
    body: `Your deal "${data.postTitle || 'a project'}" was rejected.`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
    }
  }),

  [NOTIFICATION_EVENTS.DEAL_REOPENED]: (data) => ({
    title: "🔄 Deal Reopened",
    body: `Deal "${data.postTitle || 'a project'}" has been reopened.`,
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
    }
  }),

  [NOTIFICATION_EVENTS.DEAL_COMPLETED]: (data) => ({
    title: "🏆 ডিল সম্পূর্ণ হয়েছে!",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলটি সফলভাবে সম্পূর্ণ হয়েছে!`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  [NOTIFICATION_EVENTS.DEAL_CANCELLED]: (data) => ({
    title: "❌ ডিল ক্যানসেল হয়েছে",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলটি ক্যানসেল করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      cancelledBy: data.cancelledBy,
      reason: data.reason,
    }
  }),

  [NOTIFICATION_EVENTS.DEAL_EXTENDED]: (data) => ({
    title: "⏰ ডেডলাইন বাড়ানো হয়েছে",
    body: `${data.extendedBy || 'Someone'} "${data.postTitle || 'Untitled Deal'}" ডিলের ডেডলাইন ${data.extraDays || 0} দিন বাড়িয়েছেন। নতুন ডেডলাইন: ${data.newDeadline || 0} দিন`,
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      extendedBy: data.extendedBy,
      extraDays: data.extraDays,
      newDeadline: data.newDeadline,
    }
  }),

  [NOTIFICATION_EVENTS.DEADLINE_PASSED]: (data) => ({
    title: "⏰ ডেডলাইন শেষ হয়েছে",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলের ডেডলাইন শেষ হয়েছে। অনুগ্রহ করে দ্রুত ব্যবস্থা নিন।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  // 🔧 NEW: DEAL_DEADLINE_PASSED is a SEPARATE constant from
  // DEADLINE_PASSED (both exist in NOTIFICATION_EVENTS) — only the
  // latter had a template, so any code calling notify() with
  // DEAL_DEADLINE_PASSED silently did nothing. Reuses the same
  // content as DEADLINE_PASSED for consistency.
  [NOTIFICATION_EVENTS.DEAL_DEADLINE_PASSED]: (data) => ({
    title: "⏰ ডেডলাইন শেষ হয়েছে",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলের ডেডলাইন শেষ হয়েছে। অনুগ্রহ করে দ্রুত ব্যবস্থা নিন।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  [NOTIFICATION_EVENTS.DEAL_OVERDUE]: (data) => ({
    title: "🔴 ডিল ওভারডিউ!",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলের ডেডলাইন এবং ২৪ ঘণ্টার গ্রেস পিরিয়ড দুটোই পার হয়ে গেছে। এখনই Extend, Cancel অথবা Dispute করুন।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    actionRequired: true,
    actionType: 'deal_overdue',
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  [NOTIFICATION_EVENTS.DISPUTE_OPENED]: (data) => ({
    title: "⚖️ Dispute ওপেন হয়েছে",
    body: `${data.raisedBy || 'Someone'} "${data.postTitle || 'Untitled Deal'}" ডিলে একটি Dispute ওপেন করেছেন। Admin শীঘ্রই রিভিউ করবে — এই ডিলে Extend/Cancel সাময়িক বন্ধ থাকবে।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    actionRequired: true,
    actionType: 'dispute_opened',
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      raisedBy: data.raisedBy,
      reason: data.reason,
    }
  }),

  // 🔧 NEW: OFFER_EXPIRED — was declared in NOTIFICATION_EVENTS with a
  // comment explicitly warning a template was needed; it had none.
  [NOTIFICATION_EVENTS.OFFER_EXPIRED]: (data) => ({
    title: "⌛ অফার মেয়াদোত্তীর্ণ হয়েছে",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলের পেন্ডিং অফারটি ৪৮ ঘণ্টায় কোনো সাড়া না পাওয়ায় স্বয়ংক্রিয়ভাবে বাতিল হয়ে গেছে।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  // ── 📝 Milestone Events ──
  [NOTIFICATION_EVENTS.MILESTONE_FUNDED]: (data) => ({
    title: "💰 মাইলস্টোন ফান্ড হয়েছে",
    body: `"${data.milestoneTitle || 'Milestone'}" মাইলস্টোনের জন্য ${data.amount?.toLocaleString() || 0} BDT ফান্ড করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WALLET,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'wallet',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      milestoneTitle: data.milestoneTitle,
      amount: data.amount,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  [NOTIFICATION_EVENTS.MILESTONE_REVIEW]: (data) => ({
    title: "📝 রিভিউ রিকোয়েস্ট",
    body: `${data.requesterName || 'Someone'} "${data.milestoneTitle || 'Milestone'}" মাইলস্টোনটি রিভিউ করতে বলেছেন।`,
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    actionRequired: true,
    actionType: 'review_milestone',
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      milestoneTitle: data.milestoneTitle,
      requesterName: data.requesterName,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  [NOTIFICATION_EVENTS.MILESTONE_RELEASED]: (data) => ({
    title: "✅ পেমেন্ট রিলিজ হয়েছে",
    body: `${data.amount?.toLocaleString() || 0} BDT পেমেন্ট রিলিজ হয়েছে "${data.milestoneTitle || 'Milestone'}" মাইলস্টোনের জন্য।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'wallet',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      milestoneTitle: data.milestoneTitle,
      amount: data.amount,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  // 🔧 NEW: MILESTONE_SUBMITTED — seller submits proof for a funded milestone.
  [NOTIFICATION_EVENTS.MILESTONE_SUBMITTED]: (data) => ({
    title: "📤 মাইলস্টোন জমা হয়েছে",
    body: `${data.sellerName || 'সেলার'} "${data.milestoneTitle || 'Milestone'}" মাইলস্টোনের কাজ প্রুফসহ জমা দিয়েছেন। রিভিউ করে অ্যাপ্রুভ/রিজেক্ট করুন।`,
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    actionRequired: true,
    actionType: 'review_milestone_submission',
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      milestoneTitle: data.milestoneTitle,
      sellerName: data.sellerName,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  // 🔧 NEW: MILESTONE_REJECTED — buyer rejects the seller's submission.
  [NOTIFICATION_EVENTS.MILESTONE_REJECTED]: (data) => ({
    title: "❌ মাইলস্টোন রিজেক্ট হয়েছে",
    body: `${data.buyerName || 'বায়ার'} "${data.milestoneTitle || 'Milestone'}" মাইলস্টোনের জমা দেওয়া কাজ প্রত্যাখ্যান করেছেন। কারণ: ${data.reason || 'উল্লেখ করা হয়নি'}`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    actionRequired: true,
    actionType: 'resubmit_milestone',
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      milestoneTitle: data.milestoneTitle,
      reason: data.reason,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  // 🔧 NEW: MILESTONE_REFUNDED — auto-refund when seller doesn't submit in time.
  [NOTIFICATION_EVENTS.MILESTONE_REFUNDED]: (data) => ({
    title: "↩️ মাইলস্টোন রিফান্ড হয়েছে",
    body: `সময়মতো জমা না দেওয়ায় "${data.milestoneTitle || 'Milestone'}" মাইলস্টোনের ${data.amount?.toLocaleString() || 0} BDT স্বয়ংক্রিয়ভাবে রিফান্ড করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WALLET,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'wallet',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      milestoneTitle: data.milestoneTitle,
      amount: data.amount,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  // ── ⚠️ Cancellation Events ──
  [NOTIFICATION_EVENTS.CANCELLATION_REQUEST]: (data) => ({
    title: "⚠️ ক্যানসেল রিকোয়েস্ট",
    body: `${data.requesterName || 'Someone'} "${data.postTitle || 'Untitled Deal'}" ডিলটি ক্যানসেল করতে চান। কারণ: ${data.reason || 'No reason provided'}`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    actionRequired: true,
    actionType: 'cancel_respond',
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      requesterName: data.requesterName,
      reason: data.reason,
      budget: data.budget,
    }
  }),

  [NOTIFICATION_EVENTS.CANCELLATION_APPROVED]: (data) => ({
    title: "✅ ডিল ক্যানসেল হয়েছে",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলটি উভয় পক্ষের সম্মতিতে ক্যানসেল করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
    }
  }),

  [NOTIFICATION_EVENTS.CANCELLATION_REJECTED]: (data) => ({
    title: "❌ ক্যানসেল রিজেক্ট",
    body: `"${data.postTitle || 'Untitled Deal'}" ডিলের ক্যানসেল রিকোয়েস্টটি রিজেক্ট করা হয়েছে। ডিল অ্যাক্টিভ আছে।`,
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'deal',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
    }
  }),

  // ── 💰 Wallet Events ──
  [NOTIFICATION_EVENTS.PAYMENT_RECEIVED]: (data) => ({
    title: "💰 পেমেন্ট পেয়েছেন",
    body: `${data.amount?.toLocaleString() || 0} BDT পেমেন্ট পেয়েছেন "${data.postTitle || 'Deal'}" এর জন্য।`,
    soundEvent: SOUND_EVENTS.WALLET,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'wallet',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      amount: data.amount,
      senderId: data.senderId,
    }
  }),

  [NOTIFICATION_EVENTS.PAYMENT_RELEASED]: (data) => ({
    title: "✅ পেমেন্ট রিলিজ হয়েছে",
    body: `${data.amount?.toLocaleString() || 0} BDT পেমেন্ট রিলিজ হয়েছে "${data.postTitle || 'Deal'}" এর জন্য।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'wallet',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      amount: data.amount,
      receiverId: data.receiverId,
    }
  }),

  [NOTIFICATION_EVENTS.WALLET_CREDITED]: (data) => ({
    title: "💰 টাকা যোগ হয়েছে",
    body: `${data.amount?.toLocaleString() || 0} BDT আপনার ওয়ালেটে যোগ করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WALLET,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'wallet',
    data: {
      amount: data.amount,
      transactionId: data.transactionId,
    }
  }),

  [NOTIFICATION_EVENTS.WALLET_DEBITED]: (data) => ({
    title: "💸 টাকা কাটা হয়েছে",
    body: `${data.amount?.toLocaleString() || 0} BDT আপনার ওয়ালেট থেকে কাটা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WALLET,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'wallet',
    data: {
      amount: data.amount,
      transactionId: data.transactionId,
    }
  }),

  // ── 👑 Admin Events ──
  [NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT]: (data) => ({
    title: "📢 অ্যাডমিন ঘোষণা",
    body: data.message || "অ্যাডমিনের নতুন ঘোষণা।",
    soundEvent: SOUND_EVENTS.ADMIN_ANNOUNCEMENT,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: data.icon || '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      announcementId: data.announcementId,
      type: 'admin_announcement',
    }
  }),

  [NOTIFICATION_EVENTS.ADMIN_NOTIFICATION]: (data) => ({
    title: "🔔 অ্যাডমিন নোটিফিকেশন",
    body: data.message || "আপনার একটি নতুন অ্যাডমিন নোটিফিকেশন আছে।",
    soundEvent: SOUND_EVENTS.ADMIN_NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: data.icon || '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      notificationId: data.notificationId,
      type: 'admin_notification',
    }
  }),

  // ── 👤 User Verification Events ──
  [NOTIFICATION_EVENTS.USER_VERIFIED]: (data) => ({
    title: "✅ ইউজার যাচাই করা হয়েছে",
    body: `${data.userName || 'A user'} এর অ্যাকাউন্ট সফলভাবে যাচাই করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: 'fa-solid fa-user-check',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      userId: data.userId,
      userName: data.userName,
      type: 'user_verified',
    }
  }),

  [NOTIFICATION_EVENTS.USER_BLOCKED]: (data) => ({
    title: "🚫 ইউজার ব্লক করা হয়েছে",
    body: `${data.userName || 'A user'} এর অ্যাকাউন্ট ব্লক করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: 'fa-solid fa-user-slash',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      userId: data.userId,
      userName: data.userName,
      reason: data.reason || 'Admin action',
      type: 'user_blocked',
    }
  }),

  [NOTIFICATION_EVENTS.USER_UNBLOCKED]: (data) => ({
    title: "✅ ইউজার আনব্লক করা হয়েছে",
    body: `${data.userName || 'A user'} এর অ্যাকাউন্ট আনব্লক করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: 'fa-solid fa-user-check',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      userId: data.userId,
      userName: data.userName,
      type: 'user_unblocked',
    }
  }),

  // ── 📝 Post Events ──
  [NOTIFICATION_EVENTS.POST_APPROVED]: (data) => ({
    title: "✅ পোস্ট অ্যাপ্রুভ করা হয়েছে",
    body: `"${data.postTitle || 'A post'}" টি অ্যাপ্রুভ করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: 'fa-solid fa-file-circle-check',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      postId: data.postId,
      postTitle: data.postTitle,
      userId: data.userId,
      type: 'post_approved',
    }
  }),

  [NOTIFICATION_EVENTS.POST_REJECTED]: (data) => ({
    title: "❌ পোস্ট রিজেক্ট করা হয়েছে",
    body: `"${data.postTitle || 'A post'}" টি রিজেক্ট করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.ERROR,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'error',
    icon: 'fa-solid fa-file-circle-xmark',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'admin',
    data: {
      postId: data.postId,
      postTitle: data.postTitle,
      userId: data.userId,
      reason: data.reason || 'Admin action',
      type: 'post_rejected',
    }
  }),

  // ── 💳 Deposit Events ──
  [NOTIFICATION_EVENTS.DEPOSIT_APPROVED]: (data) => ({
    title: "✅ ডিপোজিট অ্যাপ্রুভ করা হয়েছে",
    body: `${data.userName || 'A user'} এর ${data.amount?.toLocaleString() || 0} BDT ডিপোজিট অ্যাপ্রুভ করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: 'fa-solid fa-money-bill-wave',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      transactionId: data.transactionId,
      userId: data.userId,
      userName: data.userName,
      amount: data.amount,
      type: 'deposit_approved',
    }
  }),

  [NOTIFICATION_EVENTS.DEPOSIT_REJECTED]: (data) => ({
    title: "❌ ডিপোজিট রিজেক্ট করা হয়েছে",
    body: `${data.userName || 'A user'} এর ${data.amount?.toLocaleString() || 0} BDT ডিপোজিট রিজেক্ট করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.ERROR,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'error',
    icon: 'fa-solid fa-ban',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'admin',
    data: {
      transactionId: data.transactionId,
      userId: data.userId,
      userName: data.userName,
      amount: data.amount,
      reason: data.reason || 'Admin action',
      type: 'deposit_rejected',
    }
  }),

  // ── 💳 Withdraw Events ──
  [NOTIFICATION_EVENTS.WITHDRAW_APPROVED]: (data) => ({
    title: "✅ উইথড্র অ্যাপ্রুভ করা হয়েছে",
    body: `${data.userName || 'A user'} এর ${data.amount?.toLocaleString() || 0} BDT উইথড্র অ্যাপ্রুভ করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: 'fa-solid fa-money-bill-transfer',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      withdrawalId: data.withdrawalId,
      userId: data.userId,
      userName: data.userName,
      amount: data.amount,
      type: 'withdraw_approved',
    }
  }),

  [NOTIFICATION_EVENTS.WITHDRAW_REJECTED]: (data) => ({
    title: "❌ উইথড্র রিজেক্ট করা হয়েছে",
    body: `${data.userName || 'A user'} এর ${data.amount?.toLocaleString() || 0} BDT উইথড্র রিজেক্ট করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.ERROR,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'error',
    icon: 'fa-solid fa-ban',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'admin',
    data: {
      withdrawalId: data.withdrawalId,
      userId: data.userId,
      userName: data.userName,
      amount: data.amount,
      reason: data.reason || 'Admin action',
      type: 'withdraw_rejected',
    }
  }),

  // ── 📋 Report Events ──
  [NOTIFICATION_EVENTS.REPORT_RESOLVED]: (data) => ({
    title: "✅ রিপোর্ট সমাধান করা হয়েছে",
    body: `${data.reportType || 'A report'} টি সমাধান করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: 'fa-solid fa-flag-checkered',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'admin',
    data: {
      reportId: data.reportId,
      reportType: data.reportType,
      resolvedBy: data.resolvedBy,
      type: 'report_resolved',
    }
  }),

  [NOTIFICATION_EVENTS.REPORT_CANCELLED]: (data) => ({
    title: "❌ রিপোর্ট বাতিল করা হয়েছে",
    body: `${data.reportType || 'A report'} টি বাতিল করা হয়েছে।`,
    soundEvent: SOUND_EVENTS.WARNING,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'warning',
    icon: 'fa-solid fa-flag',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'admin',
    data: {
      reportId: data.reportId,
      reportType: data.reportType,
      cancelledBy: data.cancelledBy,
      type: 'report_cancelled',
    }
  }),

  // ── ⭐ Review Events ──
  [NOTIFICATION_EVENTS.REVIEW_RECEIVED]: (data) => ({
    title: "⭐ নতুন রিভিউ",
    body: `${data.reviewerName || 'Someone'} আপনাকে একটি রিভিউ দিয়েছেন।`,
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'review',
    data: {
      reviewId: data.reviewId,
      reviewerId: data.reviewerId,
      reviewerName: data.reviewerName,
      rating: data.rating,
    }
  }),

  // 🔧 NEW: REVIEW_REQUESTED — was declared but had no template.
  [NOTIFICATION_EVENTS.REVIEW_REQUESTED]: (data) => ({
    title: "📝 রিভিউ রিকোয়েস্ট",
    body: `"${data.postTitle || 'Deal'}" সম্পূর্ণ হয়েছে — ${data.requesterName || 'অপরপক্ষ'} কে একটি রিভিউ দিন।`,
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    actionRequired: true,
    actionType: 'give_review',
    category: 'review',
    data: {
      dealId: data.dealId,
      postTitle: data.postTitle,
      requesterName: data.requesterName,
    }
  }),

  // ── ✅ Verification Events ──
  [NOTIFICATION_EVENTS.VERIFY_APPROVED]: (data) => ({
    title: "✅ ভেরিফিকেশন অ্যাপ্রুভ হয়েছে",
    body: "আপনার অ্যাকাউন্ট সফলভাবে ভেরিফাই করা হয়েছে!",
    soundEvent: SOUND_EVENTS.SUCCESS,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'success',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'verification',
    data: {
      userId: data.userId,
    }
  }),

  [NOTIFICATION_EVENTS.VERIFY_REJECTED]: (data) => ({
    title: "❌ ভেরিফিকেশন রিজেক্ট",
    body: data.reason || "আপনার ভেরিফিকেশন রিজেক্ট করা হয়েছে। দয়া করে আবার চেষ্টা করুন।",
    soundEvent: SOUND_EVENTS.ERROR,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'error',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'verification',
    data: {
      userId: data.userId,
      reason: data.reason,
    }
  }),

  // ── 📢 System Events ──
  [NOTIFICATION_EVENTS.SYSTEM]: (data) => ({
    title: "📢 সিস্টেম",
    body: data.message || "সিস্টেম নোটিফিকেশন",
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: false,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'system',
    data: {
      systemId: data.systemId,
    }
  }),

  [NOTIFICATION_EVENTS.SYSTEM_UPDATE]: (data) => ({
    title: "🔄 সিস্টেম আপডেট",
    body: data.message || "একটি নতুন সিস্টেম আপডেট পাওয়া গেছে।",
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'system',
    data: {
      version: data.version,
      updateId: data.updateId,
    }
  }),

  [NOTIFICATION_EVENTS.SYSTEM_ERROR]: (data) => ({
    title: "⚠️ সিস্টেম এরর",
    body: data.message || "সিস্টেমে একটি ত্রুটি ঘটেছে।",
    soundEvent: SOUND_EVENTS.ERROR,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'error',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: true,
    category: 'system',
    data: {
      errorId: data.errorId,
      errorCode: data.errorCode,
    }
  }),

  // ── 🆕 Default / Fallback ──
  [NOTIFICATION_EVENTS.NOTIFICATION]: (data) => ({
    title: data.title || "🔔 নতুন নোটিফিকেশন",
    body: data.body || data.message || "আপনার একটি নতুন নোটিফিকেশন আছে",
    soundEvent: SOUND_EVENTS.NOTIFICATION,
    browser: true,
    soundEnabled: true,
    inApp: true,
    alertType: 'info',
    icon: '/logo192.png',
    badge: '/logo192.png',
    requireInteraction: false,
    category: 'system',
    data: {
      ...data,
    }
  }),

};

// ============================================================
// 🎯 Helper Functions
// ============================================================

export const getNotificationTemplate = (event, data = {}) => {
  const template = NotificationTemplates[event];
  if (!template) {
    if (import.meta.env.DEV) {
      console.warn(`🔔 No template found for event: ${event}`);
    }
    return null;
  }
  return template(data);
};

export const hasNotificationTemplate = (event) => {
  return !!NotificationTemplates[event];
};

export const getEventsWithTemplates = () => {
  return Object.keys(NotificationTemplates);
};

export const getNotificationCategory = (event) => {
  const template = NotificationTemplates[event];
  if (!template) return 'system';
  const result = template({});
  return result.category || 'system';
};

export const isNotificationEnabled = (event, settings) => {
  if (!settings) return true;

  const category = getNotificationCategory(event);

  const categoryMap = {
    'message': 'messageNotifications',
    'deal': 'dealUpdates',
    'wallet': 'walletNotifications',
    'admin': 'adminNotifications',
    'review': 'reviewNotifications',
    'verification': 'verificationNotifications',
    'system': 'systemNotifications',
  };

  const settingsKey = categoryMap[category] || 'systemNotifications';
  return settings[settingsKey] !== false;
};

// ============================================================
// 🎯 Default Export
// ============================================================
export default {
  NotificationTemplates,
  getNotificationTemplate,
  hasNotificationTemplate,
  getEventsWithTemplates,
  getNotificationCategory,
  isNotificationEnabled,
};