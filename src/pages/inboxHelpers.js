import { serverTimestamp } from 'firebase/firestore';

// ============================================================
// ✅ টাইম ফরম্যাট ফাংশন
// ============================================================
export const formatLastSeen = (timestamp) => {
  if (!timestamp) return 'Offline';
  
  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }
  
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

// ============================================================
// ✅ নরমালাইজড চ্যাট অবজেক্ট তৈরি (সঠিক ডেটা সহ)
// ============================================================
// ============================================================
// ✅ নরমালাইজড চ্যাট অবজেক্ট তৈরি (সঠিক ডেটা সহ) - ফিক্সড
// ============================================================
export const createNormalizedChatObject = (chat, currentUser) => {
  if (!chat || !currentUser) return null;
  
  // ✅ ১. পোস্ট টাইপ নির্ধারণ
  const postType = chat.postType || chat.type || 'hire';
  
  // ✅ ২. অন্য পক্ষের আইডি বের করুন
  let otherId = chat.participants?.find(p => p !== currentUser?.uid);
  
  if (!otherId) {
    if (chat.buyerId === currentUser.uid) {
      otherId = chat.sellerId;
    } else if (chat.sellerId === currentUser.uid) {
      otherId = chat.buyerId;
    } else {
      otherId = chat.otherPartyId || chat.userId || chat.ownerId;
    }
  }
  
  // ✅ ৩. পোস্টের মালিক বের করুন
  let postOwnerId = chat.userId || chat.ownerId || chat.creatorId;
  
  // ✅ ৪. যদি postOwnerId না থাকে, অন্য পক্ষ থেকে বের করুন
  if (!postOwnerId) {
    postOwnerId = otherId;
  }
  
  // ✅ ৫. ✅ সঠিক buyerId এবং sellerId নির্ধারণ করুন (postType অনুযায়ী)
  let buyerId, sellerId;
  
  if (postType === 'hire') {
    // Hire Post: পোস্টের মালিক = Buyer, অন্য পক্ষ = Seller
    buyerId = postOwnerId;
    sellerId = otherId;
  } else {
    // Service Post: পোস্টের মালিক = Seller, অন্য পক্ষ = Buyer
    sellerId = postOwnerId;
    buyerId = otherId;
  }
  
  // ✅ ৬. যদি buyerId/sellerId এখনও খালি থাকে, chat থেকে নিন
  if (!buyerId) buyerId = chat.buyerId || null;
  if (!sellerId) sellerId = chat.sellerId || null;
  
  // ✅ ৭. বর্তমান ইউজার কে?
  const isBuyer = buyerId === currentUser?.uid;
  const isSeller = sellerId === currentUser?.uid;
  
  console.log("🔍 createNormalizedChatObject:", {
    chatId: chat.id,
    postType: postType,
    postOwnerId: postOwnerId,
    otherId: otherId,
    buyerId: buyerId,
    sellerId: sellerId,
    currentUser: currentUser.uid,
    isBuyer: isBuyer,
    isSeller: isSeller,
    chat: chat
  });
  
  // ✅ ৮. নরমালাইজড অবজেক্ট
  return {
    // মৌলিক তথ্য
    id: chat.id || chat.chatId,
    chatId: chat.id || chat.chatId,
    postId: chat.postId || chat.id,
    
    // পোস্ট সম্পর্কিত তথ্য
    title: chat.postTitle || chat.title || 'Untitled',
    postTitle: chat.postTitle || chat.title || 'Untitled',
    description: chat.description || '',
    budget: chat.budget || 0,
    deadline: chat.deadline || 0,
    postType: postType,
    postImage: chat.postImage || chat.image || null,
    images: chat.images || [],
    
    // ✅✅✅ ✅ সঠিক buyerId এবং sellerId
    buyerId: buyerId,
    sellerId: sellerId,
    userId: postOwnerId,           // ← পোস্টের মালিক
    ownerId: postOwnerId,          // ← পোস্টের মালিক
    otherPartyId: otherId || null,
    
    // ইউজার নাম
    buyerName: chat.buyerName || (postType === 'hire' ? chat.clientName : 'Buyer') || 'Buyer',
    sellerName: chat.sellerName || (postType === 'service' ? chat.clientName : 'Seller') || 'Seller',
    clientName: chat.clientName || chat.buyerName || 'Client',
    otherPartyName: chat.otherPartyName || (isBuyer ? chat.sellerName : chat.buyerName) || 'User',
    
    // ইউজার ফটো
    buyerPhoto: chat.buyerPhoto || null,
    sellerPhoto: chat.sellerPhoto || null,
    clientPhoto: chat.clientPhoto || null,
    otherPartyPhoto: chat.otherPartyPhoto || null,
    
    // চ্যাট স্ট্যাটাস
    participants: chat.participants || [currentUser?.uid, otherId].filter(Boolean),
    unreadCount: chat.unreadCount || {},
    userUnreadCount: chat.userUnreadCount || 0,
    isUnread: (chat.userUnreadCount || 0) > 0,
    lastMessage: chat.lastMessage || 'Start conversation',
    updatedAt: chat.updatedAt || serverTimestamp(),
    createdAt: chat.createdAt || serverTimestamp(),
    
    // ডিল স্ট্যাটাস
    status: chat.status || 'pending',
    isActiveDeal: chat.status === 'active' || chat.isActiveDeal || false,
    dealStatus: chat.dealStatus || chat.status || 'pending',
    
    // ব্লক স্ট্যাটাস
    isBlocked: chat.isBlocked === true && chat.blockedBy === currentUser?.uid,
    blockedBy: chat.blockedBy || null,
    blockedAt: chat.blockedAt || null,
    
    // অনলাইন স্ট্যাটাস
    isOnline: chat.isOnline || false,
    
    // ট্যাগ ও প্রিভিউ
    tag: chat.tag || chat.postTitle || 'Chat',
    preview: chat.preview || chat.lastMessage || 'Start conversation',
    time: chat.time || 'Just now',
    initial: (chat.otherPartyName || 'U').charAt(0).toUpperCase(),
    gradient: chat.gradient || "linear-gradient(135deg, #f59e0b, #d97706)",
    
    // ✅ গুরুত্বপূর্ণ: fullData
    fullData: chat,
    _original: chat
  };
};
// ============================================================
// ✅ নতুন চ্যাট তৈরি
// ============================================================
// ============================================================
// ✅ নতুন চ্যাট তৈরি - ফিক্সড
// ============================================================
export const createNewChatObject = (chatContext, currentUser) => {
  const postType = chatContext.type || chatContext.postType || 'hire';
  let buyerId, sellerId, buyerName, sellerName, buyerPhoto, sellerPhoto;
  
  const currentUserPhoto = currentUser.photoURL || null;
  const postOwnerId = chatContext.userId || chatContext.ownerId || chatContext.uid;
  const otherPartyName = chatContext.clientName || chatContext.userName || chatContext.sender || 'User';
  const otherPartyPhoto = chatContext.clientPhoto || chatContext.userPhoto || chatContext.senderPhoto || null;
  
  if (postType === 'service') {
    // Service: পোস্টের মালিক = Seller, বর্তমান ইউজার = Buyer
    sellerId = postOwnerId;
    buyerId = currentUser.uid;
    sellerName = otherPartyName || 'Seller';
    buyerName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Buyer';
    sellerPhoto = otherPartyPhoto || null;
    buyerPhoto = currentUserPhoto;
  } else {
    // Hire: পোস্টের মালিক = Buyer, বর্তমান ইউজার = Seller
    buyerId = postOwnerId;
    sellerId = currentUser.uid;
    buyerName = otherPartyName || 'Buyer';
    sellerName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Seller';
    buyerPhoto = otherPartyPhoto || null;
    sellerPhoto = currentUserPhoto;
  }
  
  const otherPartyId = postType === 'service' ? sellerId : buyerId;
  const otherPartyNameFinal = postType === 'service' ? sellerName : buyerName;
  const otherPartyPhotoFinal = postType === 'service' ? sellerPhoto : buyerPhoto;
  
  const chatId = chatContext.id || chatContext.postId || `chat_${Date.now()}`;
  const participants = [currentUser.uid, otherPartyId].filter(Boolean);
  const unreadCountObj = {
    [currentUser.uid]: 0,
    [otherPartyId]: 1
  };

  console.log("🔍 createNewChatObject:", {
    chatId: chatId,
    postType: postType,
    postOwnerId: postOwnerId,
    buyerId: buyerId,
    sellerId: sellerId,
    currentUser: currentUser.uid,
    otherPartyId: otherPartyId
  });

  return {
    id: chatId,
    chatId: chatId,
    postId: chatContext.id || chatContext.postId || chatId,
    participants: participants,
    buyerId: buyerId,
    sellerId: sellerId,
    buyerName: buyerName,
    sellerName: sellerName,
    buyerPhoto: buyerPhoto,
    sellerPhoto: sellerPhoto,
    otherPartyId: otherPartyId,
    otherPartyName: otherPartyNameFinal || 'User',
    otherPartyPhoto: otherPartyPhotoFinal || null,
    initial: (otherPartyNameFinal || "U").charAt(0).toUpperCase(),
    gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
    time: "Just Now",
    tag: chatContext.title || chatContext.postTitle || "New Job Post",
    preview: "চ্যাট শুরু হয়েছে। আপনার বার্তা লিখুন...",
    isUnread: true,
    unreadCount: unreadCountObj,
    userUnreadCount: 1,
    isActiveDeal: false,
    isOnline: false,
    budget: chatContext.budget || 0,
    deadline: chatContext.deadline || 0,
    fullData: chatContext || {},
    postTitle: chatContext.title || chatContext.postTitle || "Untitled Post",
    postType: postType,
    postImage: chatContext.postImage || chatContext.image || null,
    description: chatContext.description || chatContext.details || '',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    lastMessage: "Start conversation",
    status: 'pending',
    dealStatus: 'pending',
    isBlocked: false,
    blockedBy: null,
    blockedAt: null,
    ownerId: postOwnerId,
    userId: postOwnerId  // ← পোস্টের মালিক
  };
};