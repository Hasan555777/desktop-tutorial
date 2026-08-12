// // src/pages/DealManager/utils/dealChat.js

// // Posts system messages into a deal's chat thread, and cleans up stale
// // cancellation-related notification docs. Logic unchanged from the
// // original file.

// import { collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch } from 'firebase/firestore';
// import { db } from '../../../firebase';  // ✅ পাথ ঠিক করা হয়েছে

// export const sendDealChatMessage = async (chatId, message, type = 'system') => {
//   if (!chatId) {
//     console.warn('⚠️ No chatId provided for deal chat message');
//     return;
//   }

//   try {
//     await addDoc(collection(db, 'chats', chatId, 'messages'), {
//       text: message,
//       sender: 'system',
//       senderId: 'system',
//       createdAt: serverTimestamp(),
//       type: type,
//     });
//     console.log('✅ Deal chat message sent:', message);
//   } catch (error) {
//     console.error('❌ Error sending deal chat message:', error);
//   }
// };

// export const deleteCancelNotifications = async (dealId) => {
//   try {
//     const notifRef = collection(db, 'notifications');
//     const q = query(
//       notifRef,
//       where('dealId', '==', dealId),
//       where('type', 'in', ['cancellation_request', 'cancellation_approved', 'cancellation_rejected'])
//     );
//     const snapshot = await getDocs(q);

//     if (snapshot.size > 0) {
//       const batch = writeBatch(db);
//       snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
//       await batch.commit();
//       console.log('✅ Notifications cleaned up');
//     }
//   } catch (error) {
//     console.error('Error cleaning notifications:', error);
//   }
// };

// // ✅ ডিফল্ট এক্সপোর্ট যোগ করুন (যদি কেউ ডিফল্ট ইম্পোর্ট করে)
// export default {
//   sendDealChatMessage,
//   deleteCancelNotifications,
// };