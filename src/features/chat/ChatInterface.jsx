// src/pages/ChatInterface.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import useHideBottomNav from "../../shared/hooks/useHideBottomNav";
import DealGuideModal from '../deal-manager/components/DealGuideModal';

import styles from './ChatInterface.module.css';


import {
  uploadToCloudinary,
  sendProposal,
  approveDeal,
  rejectDeal,
  reopenDeal,
  checkActiveDealBetweenUsers,
  extractBudgetValue,
  extractDeadlineValue,
  formatBudgetDisplay,
  formatDeadlineDisplay,
  getInitialsAvatar,
  AUTO_IMAGE_CAPTION
} from './chatHelpers';

import { useChatMessages } from './hooks/useChatMessages';
import { useDealStatus } from '../deal-manager/hooks/useDealStatus';
import { useTypingIndicator } from './hooks/useTypingIndicator';
import { useUserStatus } from '../profile/hooks/useUserStatus';
import { useUserRole } from './hooks/useUserRole';
import { useChatActions } from './hooks/useChatActions';
import { logger } from '../../shared/utils/logger';
import { uploadChatDocument, uploadVoiceMessage } from './services/chatAttachments';
import VoiceRecorder from './components/VoiceRecorder';

import ChatHeader from './components/ChatHeader';
import PostDetailCard from './components/PostDetailCard';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import BlockedView from './components/BlockedView';
import ProposalModal from './components/ProposalModal';
import EditMessageModal from './components/EditMessageModal';
import ContextMenu from './components/ContextMenu';
import ReplyIndicator from './components/ReplyIndicator';
import ImageZoom from './components/ImageZoom';

// ============================================================
// ✅ টেক্সট ট্রাংকেট ফাংশন (৫০ শব্দ)
// ============================================================
const truncateText = (text, wordLimit = 50) => {
  if (!text || typeof text !== 'string') return text || '';

  const plainText = text.replace(/<[^>]*>/g, '');
  const words = plainText.trim().split(/\s+/);

  if (words.length <= wordLimit) return plainText;

  return words.slice(0, wordLimit).join(' ') + '...';
};

// ============================================================
// ✅ ইমেজ কম্প্রেশন ফাংশন
// ============================================================
const compressImage = (file, maxWidth = 600, maxHeight = 400, quality = 0.6) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas to Blob failed'));
              return;
            }
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.jpg'),
              { type: 'image/jpeg', lastModified: Date.now() }
            );
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
  });
};

const ChatInterface = ({ chatContext, onBack, currentUser: propCurrentUser, currentMode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser: authUser } = useAuth();
  const feedback = useFeedback();
  const currentUser = propCurrentUser || authUser;
  useHideBottomNav();

  // ========== State ==========
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);

  // "রুলস পড়ুন" গাইড পপআপ — অফার পাঠানোর ফর্ম খোলার আগে অবশ্যই দেখাতে হবে
  const [showSendGuideModal, setShowSendGuideModal] = useState(false);

  const [proposalData, setProposalData] = useState(() => {
    const rawBudget = chatContext?.budget || chatContext?.price || '';
    const budgetValue = typeof rawBudget === 'object'
      ? (rawBudget.amount || rawBudget.max || 0)
      : rawBudget;

    const rawDeadline = chatContext?.deadline || chatContext?.deliveryDays || '';
    const deadlineValue = typeof rawDeadline === 'object'
      ? (rawDeadline.days || rawDeadline.max || 0)
      : rawDeadline;

    return {
      budget: typeof budgetValue === 'number' ? String(budgetValue) : String(budgetValue || ''),
      deadline: typeof deadlineValue === 'number' ? String(deadlineValue) : String(deadlineValue || ''),
      details: ''
    };
  });

  const [contextMenu, setContextMenu] = useState({
    visible: false, x: 0, y: 0, messageId: null, messageText: null,
    messageImage: null, senderName: null, senderId: null, canEdit: false, isImage: false
  });
  const [replyTo, setReplyTo] = useState(null);
  const [editMessage, setEditMessage] = useState(null);
  const [activeZoomImage, setActiveZoomImage] = useState(null);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);

  const [hasActiveDealWithChatUser, setHasActiveDealWithChatUser] = useState(false);
  const [activeDealCount, setActiveDealCount] = useState(0);

  // ========== Refs ==========
  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const contextMenuRef = useRef(null);
  const chatInputRef = useRef(null);
  const proposalSubmittedRef = useRef(false);

  // ========== Chat ID ==========
  const safeChatId = useMemo(() => {
    if (!chatContext) return null;
    return String(chatContext.id || chatContext.postId || '');
  }, [chatContext]);

  // ========== Custom Hooks ==========
  const { messages, loading, sendMessage: sendMsg, deleteMessage, editMessage: editMsg, markChatAsRead, otherPartyLastRead } = useChatMessages(safeChatId, currentUser);
  const { otherPartyInfo, targetUserInfo } = useUserStatus(chatContext, currentUser);
  const otherPartyId = otherPartyInfo.id;

  const { existingDeal, isBlocked, blockedBy, isActiveDeal, setIsActiveDeal, setExistingDeal, unblockUser } =
    useDealStatus(safeChatId, currentUser, otherPartyId);

  // 🔧 ADD (#20 typing indicator)
  const { otherPartyTyping, notifyTyping, clearOwnTyping } = useTypingIndicator(safeChatId, currentUser, otherPartyId);

  // 🔧 FIX (#12 read/unread): mark this chat as read for the current
  // user as soon as it's opened, not just when they send a reply —
  // see markChatAsRead's own comment in useChatMessages.js for why
  // this was missing before.
  // 🔧 FIX (#12 read/unread, continued): markChatAsRead only ran once
  // when the chat was opened — if the other person sent MORE
  // messages while I was still actively looking at this same open
  // chat, sendMessage() still increments my unreadCount regardless
  // (it has no way to know I'm already looking), so the badge would
  // wrongly reappear even though I'm staring right at the new
  // message. Re-running this whenever the message count changes
  // (not just on chatId change) re-clears it immediately, and also
  // keeps my `lastRead` timestamp current for the other side's read
  // ticks (see MessageList.jsx).
  useEffect(() => {
    if (safeChatId) markChatAsRead(safeChatId);
  }, [safeChatId, markChatAsRead, messages.length]);
  const { userRole, postType, roleLoading } = useUserRole(chatContext, currentUser);
  // FIX: useOnlineStatus() আগে এখানে কল হতো — এই কম্পোনেন্ট প্রতিবার চ্যাট
  // খোলা/বন্ধ করলে mount/unmount হয়, আর হুকের cleanup isOnline:false সেট
  // করে দিত, মানে শুধু চ্যাট বন্ধ করলেই ইউজার ভুলভাবে "Offline" দেখাত।
  // এখন App.js-এ (AppContent) app-root লেভেলে একবারই কল হয় — সেশনজুড়ে
  // স্থায়ী, প্রতিটা চ্যাট স্ক্রিনে না।

  // ✅ Block/Delete-এর আসল Firestore লজিক — Inbox.jsx-এর মতোই একই শেয়ারড
  // হুক থেকে, এখানে আগে শুধু "TODO: Implement actual logic" placeholder ছিল।
  const { handleDeleteChat: deleteChatAction, handleBlockUser: blockUserAction } = useChatActions(currentUser);

  // ============================================================
  // ✅ Check Active Deal with Chat User
  // ============================================================
  useEffect(() => {
    const checkActiveDeal = async () => {
      if (!currentUser?.uid || !otherPartyId) return;
      try {
        const result = await checkActiveDealBetweenUsers(currentUser.uid, otherPartyId);
        setHasActiveDealWithChatUser(result.hasActiveDeal);
        setActiveDealCount(result.count);
      } catch (error) {
        logger.error('Error checking active deal:', error);
      }
    };
    checkActiveDeal();
  }, [currentUser?.uid, otherPartyId]);

  // ========== Post Data ==========
  const postData = useMemo(() => {
    const data = chatContext?.fullData || chatContext || {};

    const rawTitle = data.title || data.postTitle || data.jobTitle || chatContext?.title || chatContext?.postTitle || 'No title';
    const truncatedTitle = truncateText(rawTitle, 50);

    const rawDescription = data.description || data.jobDescription || data.details || chatContext?.description || chatContext?.details || 'No description provided';
    const truncatedDescription = truncateText(rawDescription, 50);

    const rawBudget = data.budget || data.price || chatContext?.budget || chatContext?.price || 0;
    const rawDeadline = data.deadline || data.deliveryDays || chatContext?.deadline || chatContext?.deliveryDays || 0;

    return {
      id: data.id || chatContext?.id || chatContext?.postId || 'unknown',
      title: truncatedTitle,
      fullTitle: rawTitle,
      description: truncatedDescription,
      fullDescription: rawDescription,
      budget: extractBudgetValue(rawBudget),
      deadline: extractDeadlineValue(rawDeadline),
      budgetDisplay: formatBudgetDisplay(rawBudget),
      deadlineDisplay: formatDeadlineDisplay(rawDeadline),
      image: data.images?.[0] || data.postImage || data.image || data.jobImage ||
        chatContext?.images?.[0] || chatContext?.postImage || chatContext?.image ||
        getInitialsAvatar(data.clientName || chatContext?.clientName || 'User'),
      clientName: data.clientName || data.userName || data.buyerName ||
        chatContext?.clientName || chatContext?.userName || chatContext?.buyerName || 'Unknown Client',
      userId: data.userId || chatContext?.userId || chatContext?.ownerId,
      buyerId: data.buyerId || chatContext?.buyerId,
      sellerId: data.sellerId || chatContext?.sellerId,
      postType
    };
  }, [chatContext, postType]);

  // ============================================================
  // ✅ ডিপোজিট করার পর অটোমেটিক প্রপোজাল রি-সাবমিট
  // ============================================================
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const autoSubmit = params.get('autoSubmitProposal');
    const chatId = params.get('chatId');

    if (autoSubmit !== 'true' || chatId !== safeChatId || proposalSubmittedRef.current || isAutoSubmitting) {
      return;
    }

    setIsAutoSubmitting(true);
    const pendingOffer = sessionStorage.getItem('pendingProposal');

    if (!pendingOffer) {
      setIsAutoSubmitting(false);
      return;
    }

    try {
      const parsed = JSON.parse(pendingOffer);
      sessionStorage.removeItem('pendingProposal');

      const rawBudget = parsed.data?.budget || parsed.budget || '';
      const budgetValue = typeof rawBudget === 'object' ? (rawBudget.amount || rawBudget.max || 0) : rawBudget;

      const rawDeadline = parsed.data?.deadline || parsed.deadline || '';
      const deadlineValue = typeof rawDeadline === 'object' ? (rawDeadline.days || rawDeadline.max || 0) : rawDeadline;

      setProposalData({
        budget: typeof budgetValue === 'number' ? String(budgetValue) : String(budgetValue || ''),
        deadline: typeof deadlineValue === 'number' ? String(deadlineValue) : String(deadlineValue || ''),
        details: parsed.data?.details || parsed.details || ''
      });

      let buyerId, sellerId;
      if (postType === 'service') {
        buyerId = currentUser?.uid;
        sellerId = chatContext?.userId || chatContext?.ownerId || chatContext?.uid || chatContext?.sellerId;
      } else {
        buyerId = chatContext?.userId || chatContext?.buyerId || chatContext?.uid || chatContext?.ownerId;
        sellerId = currentUser?.uid;
      }

      if (buyerId === sellerId) {
        feedback.alert.error({ message: '❌ আপনি নিজেকে প্রপোজাল পাঠাতে পারবেন না!' });
        setShowProposalModal(false);
        setIsAutoSubmitting(false);
        return;
      }

      setTimeout(() => {
        setShowProposalModal(true);

        setTimeout(async () => {
          try {
            await sendProposal(parsed.data, chatContext, currentUser, postType, userRole, safeChatId, feedback);

            proposalSubmittedRef.current = true;
            setShowProposalModal(false);
            setExistingDeal({ status: 'pending' });
            setIsAutoSubmitting(false);

            feedback.alert.success({ message: '✅ আপনার প্রপোজাল সফলভাবে পাঠানো হয়েছে!' });
          } catch (error) {
            logger.error('Auto-submit failed:', error);
            feedback.alert.error({ message: '❌ প্রপোজাল পাঠাতে ব্যর্থ হয়েছে। দয়া করে ম্যানুয়ালি চেষ্টা করুন।' });
            setShowProposalModal(false);
            setIsAutoSubmitting(false);
          }
        }, 700);
      }, 1000);

    } catch (error) {
      logger.error('Auto-submit error:', error);
      sessionStorage.removeItem('pendingProposal');
      setIsAutoSubmitting(false);
    }
    // proposalData ইচ্ছাকৃতভাবে dependency-তে নেই — এই effect-ই সেটা সেট করে,
    // dependency-তে রাখলে প্রতিবার সেট হওয়ার পর effect অকারণে আবার রান হতো।
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, safeChatId, chatContext, currentUser, postType, userRole, isAutoSubmitting, feedback]);

  // ========== Handlers ==========
  const handleSendMessage = async (imageUrl = null, attachment = null) => {
    const success = await sendMsg(message, imageUrl, isBlocked, blockedBy, chatContext, safeChatId, replyTo, attachment);
    if (!imageUrl && !attachment) setMessage('');
    if (success) {
      setReplyTo(null);
      clearOwnTyping();
    }
  };

  // 🔧 ADD (#17 documents): file picker, type/size validation
  // (handled inside uploadChatDocument), upload, then send as a
  // document-type message.
  // 🔧 ADD (#16 voice messages)
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  const handleVoiceSend = async (blob, mimeType, durationSec) => {
    setUploading(true);
    try {
      const result = await uploadVoiceMessage(blob, mimeType);
      await handleSendMessage(null, { type: 'voice', url: result.url, duration: durationSec });
    } catch (error) {
      logger.error('Voice message upload error:', error);
      feedback.alert.error({ message: error.message || 'ভয়েস মেসেজ পাঠাতে ব্যর্থ হয়েছে।' });
    } finally {
      setUploading(false);
    }
  };

  const handleDocumentUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadChatDocument(file);
      await handleSendMessage(null, { type: 'document', url: result.url, name: file.name });
    } catch (error) {
      logger.error('Document upload error:', error);
      feedback.alert.error({ message: error.message || 'ফাইল আপলোড ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      feedback.alert.error({ message: "File size must be less than 10MB" });
      return;
    }
    if (!file.type.startsWith('image/')) {
      feedback.alert.error({ message: "Only image files are allowed" });
      return;
    }

    setUploading(true);
    try {
      let imageUrl;
      if (file.size > 200 * 1024) {
        const compressedFile = await compressImage(file, 600, 400, 0.6);
        imageUrl = await uploadToCloudinary(compressedFile);
      } else {
        imageUrl = await uploadToCloudinary(file);
      }

      if (imageUrl) {
        await handleSendMessage(imageUrl);
      } else {
        feedback.alert.error({ message: "Failed to upload image. Please try again." });
      }
    } catch (error) {
      logger.error("Upload error:", error);
      feedback.alert.error({ message: "Failed to upload image." });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    // 🔧 FIX (edit-scope): only text and image messages are
    // editable — voice/document messages never render their `text`
    // field, so editing it had no visible effect. Compute this once
    // here so ContextMenu can simply hide the Edit item.
    const isImage = !!msg.imageUrl && !msg.documentUrl && !msg.audioUrl;
    const canEdit = !msg.documentUrl && !msg.audioUrl;
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      messageId: msg.id,
      messageText: msg.text,
      messageImage: msg.imageUrl,
      senderName: msg.senderName,
      senderId: msg.senderId,
      canEdit,
      isImage
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, messageId: null, messageText: null, messageImage: null, senderName: null, senderId: null, canEdit: false, isImage: false });
  };

  // 🔧 FIX (#8): the Edit/Delete dropdown had no way to dismiss it
  // besides picking an action. Close it on outside click (mouse AND
  // touch, so long-press-to-open still works on mobile), and on
  // Escape. Only attached while the menu is actually open, and only
  // reads contextMenuRef (no interference with onEdit/onDelete).
  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        closeContextMenu();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') closeContextMenu();
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.visible]);

  const handleCopyMessage = () => {
    if (contextMenu.messageText) navigator.clipboard.writeText(contextMenu.messageText);
    else if (contextMenu.messageImage) navigator.clipboard.writeText(contextMenu.messageImage);
    closeContextMenu();
  };

  const handleEditMessage = () => {
    if (!contextMenu.canEdit) return;
    // 🔧 FIX (edit-scope): for an image message that was sent with no
    // real caption, `messageText` is just the internal auto-generated
    // placeholder ("📷 Shared an image") — opening the edit box
    // pre-filled with that looks broken/confusing. Start it empty
    // instead so the user is clearly adding a real caption.
    const startingText = contextMenu.isImage && contextMenu.messageText === AUTO_IMAGE_CAPTION
      ? ''
      : (contextMenu.messageText || '');
    setEditMessage({ id: contextMenu.messageId, text: startingText, isImage: contextMenu.isImage });
    closeContextMenu();
  };

  const handleDeleteMessage = async () => {
    if (!contextMenu.messageId) return;

    const confirmed = await feedback.confirm({
      title: '🗑️ Delete Message',
      message: 'Are you sure you want to delete this message?',
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      variant: 'delete'
    });
    if (!confirmed) return;

    try {
      await deleteMessage(contextMenu.messageId);
      feedback.showSuccess('✅ Deleted', 'Message deleted successfully');
    } catch (error) {
      logger.error('Delete message error:', error);
      feedback.showError('❌ Failed', 'Could not delete message');
    }
    closeContextMenu();
  };

  const handleReplyMessage = () => {
    setReplyTo({ id: contextMenu.messageId, text: contextMenu.messageText, senderName: contextMenu.senderName });
    closeContextMenu();
    chatInputRef.current?.focus();
  };

  const handleForwardMessage = () => {
    setMessage(`📨 Forwarded: ${contextMenu.messageText}`);
    closeContextMenu();
    chatInputRef.current?.focus();
  };

  const handleUnblock = async () => {
    await unblockUser(targetUserInfo.displayName);
  };

  // ============================================================
  // ✅ Block User — এখন আসল Firestore অপারেশন চালায় (আগে placeholder ছিল)
  // ============================================================
  const handleBlockUser = async () => {
    if (!otherPartyId || !chatContext) {
      feedback.showWarning('⚠️ সতর্কতা', 'ইউজার খুঁজে পাওয়া যায়নি!');
      return;
    }
    // active-deal check ও confirm dialog blockUserAction-এর ভেতরেই হয়
    await blockUserAction({ ...chatContext, otherPartyId, id: safeChatId });
  };

  // ============================================================
  // ✅ Delete Chat — এখন আসল Firestore অপারেশন চালায় (আগে placeholder ছিল)
  // ============================================================
  const handleDeleteChat = async () => {
    if (!safeChatId || !chatContext) return;
    const success = await deleteChatAction({ ...chatContext, otherPartyId, id: safeChatId });
    if (success) onBack?.();
  };

  // ========== Permission Functions ==========
  const canSendOffer = () => {
    if (roleLoading || existingDeal || isActiveDeal) return false;
    if (postType === 'hire') return userRole === 'seller';
    if (postType === 'service') return userRole === 'buyer';
    return false;
  };

  const canApproveDeal = () => {
    if (roleLoading || !existingDeal || existingDeal.status !== 'pending') return false;
    if (postType === 'hire') return userRole === 'buyer';
    if (postType === 'service') return userRole === 'seller';
    return false;
  };

  const getPendingBadgeText = () => {
    if (postType === 'hire') {
      return userRole === 'seller' ? '⏳ Offer Sent - Waiting for Buyer' : '📨 Pending Approval';
    }
    return userRole === 'buyer' ? '⏳ Offer Sent - Waiting for Seller' : '📨 Pending Approval';
  };

  // ========== Blocked Views ==========
  if (isBlocked || (blockedBy && blockedBy !== currentUser?.uid)) {
    return (
      <BlockedView
        isBlocked={isBlocked}
        blockedBy={blockedBy}
        currentUser={currentUser}
        targetUserInfo={targetUserInfo}
        onBack={onBack}
        onUnblock={handleUnblock}
        isActiveDeal={isActiveDeal}
      />
    );
  }

if (!safeChatId) {
    return (
      <div className={styles.chatContainer}>
        <div className={styles.chatHeader}>
          <button className={styles.backBtn} onClick={onBack}><i className="fa-solid fa-arrow-left"></i></button>
          <div className={styles.userInfo}><h3>No Chat Selected</h3></div>
        </div>
        <div className={styles.emptyChatState}><i className="fa-solid fa-comments"></i><p>Select a conversation</p></div>
      </div>
    );
  }

  // ============================================================
  // ✅ Manual Submit
  // ============================================================
  const handleManualSend = async (finalData) => {
    if (proposalSubmittedRef.current) return;

    const dataToSend = finalData || proposalData;

    let buyerId, sellerId;
    if (postType === 'service') {
      buyerId = currentUser?.uid;
      sellerId = chatContext?.userId || chatContext?.ownerId || chatContext?.uid || chatContext?.sellerId;
    } else {
      buyerId = chatContext?.userId || chatContext?.buyerId || chatContext?.uid || chatContext?.ownerId;
      sellerId = currentUser?.uid;
    }

    if (buyerId === sellerId) {
      feedback.alert.error({ message: '❌ আপনি নিজেকে প্রপোজাল পাঠাতে পারবেন না!' });
      return;
    }

    await sendProposal(dataToSend, chatContext, currentUser, postType, userRole, safeChatId, feedback);
    proposalSubmittedRef.current = true;
    setShowProposalModal(false);
    setExistingDeal({ status: 'pending' });
  };

  // ========== Main Render ==========
  return (
    <div className={styles.chatContainer}>
      {/* গাইড পপআপ — Send Offer ফর্মের আগে বাধ্যতামূলক */}
      <DealGuideModal
        show={showSendGuideModal}
        role="sender"
        onConfirm={() => {
          setShowSendGuideModal(false);
          setShowProposalModal(true);
        }}
        onCancel={() => setShowSendGuideModal(false)}
      />

      <ProposalModal
        show={showProposalModal}
        onClose={() => {
          setShowProposalModal(false);
          setIsAutoSubmitting(false);
        }}
        proposalData={proposalData}
        setProposalData={setProposalData}
        safeChatId={safeChatId}
        currentUser={currentUser}
        postType={postType}
        userRole={userRole}
        onSend={handleManualSend}
      />

      <ImageZoom imageUrl={activeZoomImage} onClose={() => setActiveZoomImage(null)} />

      {/* 🔧 ADD (#16 voice messages) */}
      {showVoiceRecorder && (
        <VoiceRecorder onSend={handleVoiceSend} onClose={() => setShowVoiceRecorder(false)} />
      )}

      <ContextMenu
        contextMenu={contextMenu}
        contextMenuRef={contextMenuRef}
        onCopy={handleCopyMessage}
        onReply={handleReplyMessage}
        onForward={handleForwardMessage}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onClose={closeContextMenu}
        isOwnMessage={contextMenu.senderId === currentUser?.uid}
        canEdit={contextMenu.canEdit}
      />

      <EditMessageModal
        editMessage={editMessage}
        setEditMessage={setEditMessage}
        isImage={editMessage?.isImage}
        onSave={async () => {
          if (editMessage && editMessage.text.trim()) {
            await editMsg(editMessage.id, editMessage.text.trim());
            setEditMessage(null);
          }
        }}
      />

      <ReplyIndicator replyTo={replyTo} onCancel={() => setReplyTo(null)} />

      <ChatHeader
        targetUserInfo={targetUserInfo}
        otherPartyInfo={otherPartyInfo}
        onBack={onBack}
        isActiveDeal={isActiveDeal}
        hasActiveDealWithChatUser={hasActiveDealWithChatUser}
        activeDealCount={activeDealCount}
        onBlockUser={handleBlockUser}
        onDeleteChat={handleDeleteChat}
        chatId={safeChatId}
      />

      <PostDetailCard
        postData={postData}
        onViewPost={() => {
          const postId = chatContext?.id || chatContext?.postId;
          if (postId) {
            sessionStorage.setItem('viewPost', JSON.stringify({
              ...postData,
              title: postData.fullTitle || postData.title,
              description: postData.fullDescription || postData.description
            }));
            navigate(`/post/${postId}`);
          }
        }}
        canSendOffer={canSendOffer() && !hasActiveDealWithChatUser}
        onSendOffer={() => setShowSendGuideModal(true)}
        canApproveDeal={canApproveDeal() && !hasActiveDealWithChatUser}
        onApproveDeal={async () => {
          if (hasActiveDealWithChatUser) {
            feedback.showError('⛔ ডিল অ্যাপ্রুভ করা যাচ্ছে না', `আপনার ${activeDealCount} টি Active Deal আছে।`);
            return;
          }
          await approveDeal(existingDeal, currentUser, safeChatId, feedback);
          setExistingDeal({ ...existingDeal, status: 'active' });
          setIsActiveDeal(true);
        }}
        onRejectDeal={async () => {
          if (hasActiveDealWithChatUser) {
            feedback.showError('⛔ ডিল রিজেক্ট করা যাচ্ছে না', `আপনার ${activeDealCount} টি Active Deal আছে।`);
            return;
          }
          await rejectDeal(existingDeal, currentUser, safeChatId, feedback);
          setExistingDeal({ ...existingDeal, status: 'rejected' });
          setIsActiveDeal(false);
        }}
        onReopenDeal={async () => {
          if (hasActiveDealWithChatUser) {
            feedback.showError('⛔ ডিল রি-ওপেন করা যাচ্ছে না', `আপনার ${activeDealCount} টি Active Deal আছে।`);
            return;
          }
          await reopenDeal(existingDeal, currentUser, safeChatId, feedback);
          setExistingDeal(prev => ({ ...prev, status: 'pending' }));
          setIsActiveDeal(false);
        }}
        existingDeal={existingDeal}
        getPendingBadgeText={getPendingBadgeText}
      />

      <MessageList
        messages={messages}
        currentUserId={currentUser?.uid}
        loading={loading}
        onContextMenu={handleContextMenu}
        onImageClick={setActiveZoomImage}
        otherPartyLastRead={otherPartyLastRead}
      />

      {/* 🔧 ADD (#20 typing indicator) */}
      {otherPartyTyping && (
        <div className={styles.typingIndicator}>
          <span className={styles.typingIndicatorDots}><span></span><span></span><span></span></span>
          {otherPartyInfo?.name || 'User'} is typing...
        </div>
      )}

      <ChatInput
        message={message}
        setMessage={setMessage}
        onSend={handleSendMessage}
        onKeyDown={handleKeyDown}
        onFileUpload={handleFileUpload}
        onDocumentUpload={handleDocumentUpload}
        onTyping={notifyTyping}
        onVoiceClick={() => setShowVoiceRecorder(true)}
        fileInputRef={fileInputRef}
        docInputRef={docInputRef}
        isBlocked={isBlocked}
        blockedBy={blockedBy}
        uploading={uploading}
        inputRef={chatInputRef}
      />

      {uploading && (
        <div className={styles.uploadingIndicator}>
          <i className="fa-solid fa-spinner fa-spin"></i> Uploading...
        </div>
      )}
    </div>
  );
};

export default ChatInterface;