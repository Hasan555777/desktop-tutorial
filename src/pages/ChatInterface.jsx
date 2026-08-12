// src/pages/ChatInterface.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '@/firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import useHideBottomNav from "@/hooks/useHideBottomNav";
import DealGuideModal from './DealManager/components/DealGuideModal';

import './ChatInterface.css';

// Helpers
import { 
  uploadToCloudinary, 
  generateMilestones, 
  formatLastSeen, 
  getInitialsAvatar, 
  formatTime,
  sendProposal,
  approveDeal,
  rejectDeal,
  reopenDeal,
  checkActiveDealBetweenUsers,
  extractBudgetValue,
  extractDeadlineValue,
  formatBudgetDisplay,
  formatDeadlineDisplay
} from './chatHelpers';

// Hooks
import { useChatMessages } from '../hooks/useChatMessages';
import { useUserStatus } from '../hooks/useUserStatus';
import { useDealStatus } from '../hooks/useDealStatus';
import { useUserRole } from '../hooks/useUserRole';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

// Components
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
  
  if (words.length <= wordLimit) {
    return plainText;
  }
  
  const truncated = words.slice(0, wordLimit).join(' ');
  return truncated + '...';
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
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
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
            
            const originalSize = file.size / 1024;
            const compressedSize = blob.size / 1024;
            
            console.log(`📊 Chat image: ${originalSize.toFixed(1)}KB → ${compressedSize.toFixed(1)}KB`);
            
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

const ChatInterface = ({ chatContext, onBack, onConfirm, onCancel, currentUser: propCurrentUser, currentMode }) => {
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

  // ✅ NEW: "read the rules" guide popup shown before the Send Offer form
  // even opens — satisfies "sender must acknowledge the Deal Manager
  // workflow before sending an offer".
  const [showSendGuideModal, setShowSendGuideModal] = useState(false);
  
  // ✅ FIXED: proposalData with safe extraction
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
    messageImage: null, senderName: null, senderId: null 
  });
  const [replyTo, setReplyTo] = useState(null);
  const [editMessage, setEditMessage] = useState(null);
  const [activeZoomImage, setActiveZoomImage] = useState(null);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);
  
  // ✅ Active Deal State
  const [hasActiveDealWithChatUser, setHasActiveDealWithChatUser] = useState(false);
  const [activeDealCount, setActiveDealCount] = useState(0);

  // ========== Refs ==========
  const fileInputRef = useRef(null);
  const contextMenuRef = useRef(null);
  const chatInputRef = useRef(null);
  const proposalSubmittedRef = useRef(false);

  // ========== Chat ID ==========
  const safeChatId = useMemo(() => {
    if (!chatContext) return null;
    return String(chatContext.id || chatContext.postId || '');
  }, [chatContext]);

  // ========== Custom Hooks ==========
  const { messages, loading, sendMessage: sendMsg, deleteMessage, editMessage: editMsg } = useChatMessages(safeChatId, currentUser);
  const { otherPartyInfo, targetUserInfo, setTargetUserInfo } = useUserStatus(chatContext, currentUser);
  const { existingDeal, isBlocked, blockedBy, isActiveDeal, setIsActiveDeal, setExistingDeal, setIsBlocked, setBlockedBy, unblockUser } = useDealStatus(safeChatId, currentUser);
  const { userRole, postType, isPostOwner, roleLoading } = useUserRole(chatContext, currentUser);
  useOnlineStatus(currentUser);

  // ========== Other Party Info ==========
  const otherPartyId = otherPartyInfo.id;

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
        
        if (result.hasActiveDeal) {
          console.log(`🔒 Active deal(s) (${result.count}) with user:`, otherPartyId);
        }
      } catch (error) {
        console.error('❌ Error checking active deal:', error);
      }
    };
    
    checkActiveDeal();
  }, [currentUser?.uid, otherPartyId]);

  // ========== Post Data (ট্রাংকেট + Budget/Deadline Fix) ==========
  const postData = useMemo(() => {
    const data = chatContext?.fullData || chatContext || {};
    
    const rawTitle = data.title || data.postTitle || data.jobTitle || chatContext?.title || chatContext?.postTitle || 'No title';
    const truncatedTitle = truncateText(rawTitle, 50);
    
    const rawDescription = data.description || data.jobDescription || data.details || chatContext?.description || chatContext?.details || 'No description provided';
    const truncatedDescription = truncateText(rawDescription, 50);
    
    // ✅ FIXED: Use extract helpers for budget and deadline
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
      postType: postType
    };
  }, [chatContext, postType]);

  // ============================================================
  // ✅ ডিপোজিট করার পর অটোমেটিক প্রপোজাল রি-সাবমিট (FIXED)
  // ============================================================
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const autoSubmit = params.get('autoSubmitProposal');
    const chatId = params.get('chatId');
    
    if (autoSubmit === 'true' && chatId === safeChatId && !proposalSubmittedRef.current && !isAutoSubmitting) {
      setIsAutoSubmitting(true);
      
      const pendingOffer = sessionStorage.getItem('pendingProposal');
      
      if (pendingOffer) {
        try {
          const parsed = JSON.parse(pendingOffer);
          sessionStorage.removeItem('pendingProposal');
          
          // ✅ Extract budget value safely
          const rawBudget = parsed.data?.budget || parsed.budget || '';
          const budgetValue = typeof rawBudget === 'object'
            ? (rawBudget.amount || rawBudget.max || 0)
            : rawBudget;
          
          const rawDeadline = parsed.data?.deadline || parsed.deadline || '';
          const deadlineValue = typeof rawDeadline === 'object'
            ? (rawDeadline.days || rawDeadline.max || 0)
            : rawDeadline;
          
          setProposalData({
            budget: typeof budgetValue === 'number' ? String(budgetValue) : String(budgetValue || ''),
            deadline: typeof deadlineValue === 'number' ? String(deadlineValue) : String(deadlineValue || ''),
            details: parsed.data?.details || parsed.details || ''
          });
          
          console.log('✅ Auto-submit: Proposal data loaded from sessionStorage');
          
          let buyerId, sellerId;
          
          if (postType === 'service') {
            buyerId = currentUser?.uid;
            sellerId = chatContext?.userId || chatContext?.ownerId || chatContext?.uid || chatContext?.sellerId;
          } else {
            buyerId = chatContext?.userId || chatContext?.buyerId || chatContext?.uid || chatContext?.ownerId;
            sellerId = currentUser?.uid;
          }
          
          if (buyerId === sellerId) {
            console.error("❌ ERROR: buyerId and sellerId are the same!");
            console.error("buyerId:", buyerId);
            console.error("sellerId:", sellerId);
            console.error("chatContext:", chatContext);
            console.error("currentUser:", currentUser);
            console.error("postType:", postType);
            
            feedback.alert.error({ 
              message: '❌ আপনি নিজেকে প্রপোজাল পাঠাতে পারবেন না!' 
            });
            setShowProposalModal(false);
            setIsAutoSubmitting(false);
            return;
          }
          
          setTimeout(() => {
            setShowProposalModal(true);
            console.log('✅ Auto-submit: Modal opened');
            
            setTimeout(async () => {
              try {
                const { sendProposal } = await import('./chatHelpers');
                
                console.log("========== SEND PROPOSAL (AUTO) ==========");
                console.log("proposalData:", parsed.data);
                console.log("buyerId:", buyerId);
                console.log("sellerId:", sellerId);
                console.log("postType:", postType);
                console.log("userRole:", userRole);
                console.log("==========================================");
                
                await sendProposal(
                  parsed.data, 
                  chatContext, 
                  currentUser, 
                  postType, 
                  userRole, 
                  safeChatId,
                  feedback
                );
                
                proposalSubmittedRef.current = true;
                setShowProposalModal(false);
                setExistingDeal({ status: 'pending' });
                setIsAutoSubmitting(false);
                
                feedback.alert.success({ 
                  message: '✅ আপনার প্রপোজাল সফলভাবে পাঠানো হয়েছে!' 
                });
                
              } catch (error) {
                console.error('❌ Auto-submit failed:', error);
                feedback.alert.error({ 
                  message: '❌ প্রপোজাল পাঠাতে ব্যর্থ হয়েছে। দয়া করে ম্যানুয়ালি চেষ্টা করুন।' 
                });
                setShowProposalModal(false);
                setIsAutoSubmitting(false);
              }
            }, 700);
          }, 1000);
          
        } catch (error) {
          console.error('❌ Auto-submit error:', error);
          sessionStorage.removeItem('pendingProposal');
          setIsAutoSubmitting(false);
        }
      } else {
        console.log('ℹ️ No pending proposal found in sessionStorage');
        setIsAutoSubmitting(false);
      }
    }
  }, [location.search, safeChatId, chatContext, currentUser, postType, userRole, proposalData, isAutoSubmitting, feedback]);

  // ========== Handlers ==========
  const handleSendMessage = async (imageUrl = null) => {
    await sendMsg(message, imageUrl, isBlocked, blockedBy, chatContext, safeChatId);
    if (!imageUrl) setMessage('');
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
        console.log("🔄 Compressing chat image...");
        const compressedFile = await compressImage(file, 600, 400, 0.6);
        imageUrl = await uploadToCloudinary(compressedFile);
      } else {
        imageUrl = await uploadToCloudinary(file);
      }
      
      if (imageUrl) {
        await handleSendMessage(imageUrl);
        console.log("✅ Image sent successfully!");
      } else {
        feedback.alert.error({ message: "Failed to upload image. Please try again." });
      }
    } catch (error) {
      console.error("Upload error:", error);
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

  const handleContextMenu = (e, message) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      messageId: message.id,
      messageText: message.text,
      messageImage: message.imageUrl,
      senderName: message.senderName,
      senderId: message.senderId
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, messageId: null, messageText: null, messageImage: null, senderName: null, senderId: null });
  };

  const handleCopyMessage = () => {
    if (contextMenu.messageText) navigator.clipboard.writeText(contextMenu.messageText);
    else if (contextMenu.messageImage) navigator.clipboard.writeText(contextMenu.messageImage);
    closeContextMenu();
  };

  const handleEditMessage = () => {
    setEditMessage({ id: contextMenu.messageId, text: contextMenu.messageText });
    closeContextMenu();
  };

  const handleDeleteMessage = async () => {
    if (!contextMenu.messageId) return;

    const confirmed = await feedback?.confirm({
      title: '🗑️ Delete Message',
      message: 'Are you sure you want to delete this message?',
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      variant: 'delete'
    });

    if (!confirmed) return;

    try {
      await deleteMessage(contextMenu.messageId);
      feedback?.showSuccess('✅ Deleted', 'Message deleted successfully');
    } catch (error) {
      console.error('❌ Delete message error:', error);
      feedback?.showError('❌ Failed', 'Could not delete message');
    }
    
    closeContextMenu();
  };

  const handleReplyMessage = () => {
    setReplyTo({
      id: contextMenu.messageId,
      text: contextMenu.messageText,
      senderName: contextMenu.senderName
    });
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
  // ✅ Block User Handler (with Active Deal Check)
  // ============================================================
  const handleBlockUser = async () => {
    if (!otherPartyId) {
      feedback?.showWarning('⚠️ সতর্কতা', 'ইউজার খুঁজে পাওয়া যায়নি!');
      return;
    }

    if (hasActiveDealWithChatUser) {
      feedback?.showError(
        '⛔ ব্লক করা যাচ্ছে না',
        `আপনার ${activeDealCount} টি Active Deal আছে। Active Deal শেষ না হওয়া পর্যন্ত ${targetUserInfo?.displayName || 'এই ইউজার'} কে ব্লক করা যাবে না।`
      );
      return;
    }

    const confirmed = await feedback?.confirm({
      title: '🚫 ইউজার ব্লক',
      message: `আপনি কি ${targetUserInfo?.displayName || 'এই ইউজার'} কে ব্লক করতে চান?`,
      confirmText: 'হ্যাঁ, ব্লক করুন',
      cancelText: 'না',
      variant: 'warning'
    });

    if (!confirmed) return;

    // TODO: Implement actual block logic here
    feedback?.showSuccess('✅ ব্লক করা হয়েছে', `${targetUserInfo?.displayName || 'ইউজার'} কে ব্লক করা হয়েছে।`);
  };

  // ============================================================
  // ✅ Delete Chat Handler (with Active Deal Check)
  // ============================================================
  const handleDeleteChat = async () => {
    if (!safeChatId) return;

    if (hasActiveDealWithChatUser) {
      feedback?.showError(
        '⛔ ডিলিট করা যাচ্ছে না',
        `আপনার ${activeDealCount} টি Active Deal আছে। Active Deal শেষ না হওয়া পর্যন্ত চ্যাট ডিলিট করা যাবে না।`
      );
      return;
    }

    const confirmed = await feedback?.confirm({
      title: '🗑️ চ্যাট ডিলিট',
      message: `আপনি কি ${targetUserInfo?.displayName || 'এই ইউজার'} এর সাথে চ্যাট ডিলিট করতে চান?`,
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'না',
      variant: 'delete'
    });

    if (!confirmed) return;

    // TODO: Implement actual delete logic here
    feedback?.showSuccess('✅ ডিলিট করা হয়েছে', 'চ্যাট সফলভাবে ডিলিট করা হয়েছে।');
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
    } else {
      return userRole === 'buyer' ? '⏳ Offer Sent - Waiting for Seller' : '📨 Pending Approval';
    }
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
      <div className="chat-container">
        <div className="chat-header">
          <button className="back-btn" onClick={onBack}><i className="fa-solid fa-arrow-left"></i></button>
          <div className="user-info"><h3>No Chat Selected</h3></div>
        </div>
        <div className="empty-chat-state"><i className="fa-solid fa-comments"></i><p>Select a conversation</p></div>
      </div>
    );
  }

  // ============================================================
  // ✅ Manual Submit
  // ============================================================
  const handleManualSend = async () => {
    if (proposalSubmittedRef.current) return;
    
    let buyerId, sellerId;
    
    if (postType === 'service') {
      buyerId = currentUser?.uid;
      sellerId = chatContext?.userId || chatContext?.ownerId || chatContext?.uid || chatContext?.sellerId;
    } else {
      buyerId = chatContext?.userId || chatContext?.buyerId || chatContext?.uid || chatContext?.ownerId;
      sellerId = currentUser?.uid;
    }
    
    if (buyerId === sellerId) {
      feedback.alert.error({ 
        message: '❌ আপনি নিজেকে প্রপোজাল পাঠাতে পারবেন না!' 
      });
      return;
    }
    
    const { sendProposal } = await import('./chatHelpers');
    
    console.log("========== SEND PROPOSAL (MANUAL) ==========");
    console.log("proposalData:", proposalData);
    console.log("chatContext:", chatContext);
    console.log("currentUser:", currentUser);
    console.log("postType:", postType);
    console.log("userRole:", userRole);
    console.log("buyerId:", buyerId);
    console.log("sellerId:", sellerId);
    console.log("==============================================");
    
    await sendProposal(proposalData, chatContext, currentUser, postType, userRole, safeChatId, feedback);
    proposalSubmittedRef.current = true;
    setShowProposalModal(false);
    setExistingDeal({ status: 'pending' });
  };

  // ========== Main Render ==========
  return (
    <div className="chat-container">
      {/* Modals */}

      {/* ✅ NEW: guide popup — shown BEFORE the Send Offer form opens.
          Clicking "Send Offer" no longer opens ProposalModal directly;
          it opens this guide first, and only once the sender has ticked
          the checkbox and pressed "বুঝেছি, এগিয়ে যান" does the actual
          Send Offer form appear. handleManualSend / sendProposal are
          completely untouched by this — it only gates *when* the form
          opens. */}
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

      <ImageZoom 
        imageUrl={activeZoomImage}
        onClose={() => setActiveZoomImage(null)}
      />

      <ContextMenu 
        contextMenu={contextMenu}
        contextMenuRef={contextMenuRef}
        onCopy={handleCopyMessage}
        onReply={handleReplyMessage}
        onForward={handleForwardMessage}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        isOwnMessage={contextMenu.senderId === currentUser?.uid}
      />

      <EditMessageModal 
        editMessage={editMessage}
        setEditMessage={setEditMessage}
        onSave={async () => {
          if (editMessage && editMessage.text.trim()) {
            await editMsg(editMessage.id, editMessage.text.trim());
            setEditMessage(null);
          }
        }}
      />

      <ReplyIndicator 
        replyTo={replyTo}
        onCancel={() => setReplyTo(null)}
      />

      {/* Header */}
      <ChatHeader 
        targetUserInfo={targetUserInfo}
        otherPartyInfo={otherPartyInfo}
        onBack={onBack}
        isActiveDeal={isActiveDeal}
        postData={postData}
        hasActiveDealWithChatUser={hasActiveDealWithChatUser}
        activeDealCount={activeDealCount}
        onBlockUser={handleBlockUser}
        onDeleteChat={handleDeleteChat}
        currentMode={currentMode}
        userRole={userRole}
        postType={postType}
      />

      {/* Post Detail Card */}
      <PostDetailCard 
        postData={postData}
        budgetDisplay={postData.budgetDisplay}
        deadlineDisplay={postData.deadlineDisplay}
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
            feedback?.showError(
              '⛔ ডিল অ্যাপ্রুভ করা যাচ্ছে না',
              `আপনার ${activeDealCount} টি Active Deal আছে।`
            );
            return;
          }
          const { approveDeal } = await import('./chatHelpers');
          await approveDeal(existingDeal, currentUser, safeChatId, feedback);
          setExistingDeal({ ...existingDeal, status: 'active' });
          setIsActiveDeal(true);
        }}
        onRejectDeal={async () => {
          if (hasActiveDealWithChatUser) {
            feedback?.showError(
              '⛔ ডিল রিজেক্ট করা যাচ্ছে না',
              `আপনার ${activeDealCount} টি Active Deal আছে।`
            );
            return;
          }
          const { rejectDeal } = await import('./chatHelpers');
          await rejectDeal(existingDeal, currentUser, safeChatId, feedback);
          setExistingDeal({ ...existingDeal, status: 'rejected' });
          setIsActiveDeal(false);
        }}
        onReopenDeal={async () => {
          if (hasActiveDealWithChatUser) {
            feedback?.showError(
              '⛔ ডিল রি-ওপেন করা যাচ্ছে না',
              `আপনার ${activeDealCount} টি Active Deal আছে।`
            );
            return;
          }
          const { reopenDeal } = await import('./chatHelpers');
          await reopenDeal(existingDeal, currentUser, safeChatId, feedback);
          setExistingDeal(prev => ({ ...prev, status: 'pending' }));
          setIsActiveDeal(false);
        }}
        existingDeal={existingDeal}
        getPendingBadgeText={getPendingBadgeText}
        currentMode={currentMode}
        userRole={userRole}
        postType={postType}
      />

      {/* Messages */}
      <MessageList 
        messages={messages}
        currentUserId={currentUser?.uid}
        loading={loading}
        onContextMenu={handleContextMenu}
        onImageClick={setActiveZoomImage}
      />

      {/* Input */}
      <ChatInput 
        message={message}
        setMessage={setMessage}
        onSend={handleSendMessage}
        onKeyDown={handleKeyDown}
        onFileUpload={handleFileUpload}
        fileInputRef={fileInputRef}
        isBlocked={isBlocked}
        blockedBy={blockedBy}
        uploading={uploading}
        inputRef={chatInputRef}
        currentMode={currentMode}
        userRole={userRole}
        postType={postType}
      />

      {uploading && (
        <div className="uploading-indicator">
          <i className="fa-solid fa-spinner fa-spin"></i> Uploading...
        </div>
      )}
    </div>
  );
};

export default ChatInterface;