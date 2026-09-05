// src/pages/paymentFlow.js
import { 
  doc, 
  updateDoc, 
  collection, 
  addDoc, 
  serverTimestamp, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  setDoc 
} from 'firebase/firestore';
import { db } from '../../shared/firebase/index';
import { createPayment, executePayment, queryPayment } from './bKashHelper';
import { generateTransactionId } from '../../shared/utils/idGenerator';

// ============================================
// 📌 পেমেন্ট ফ্লো ম্যানেজার
// ============================================

/**
 * ১. পেমেন্ট ইনিশিয়েট
 */
export const initiatePayment = async (dealId, milestoneId, amount, userId) => {
  try {
    const orderId = `${dealId}_${milestoneId}_${Date.now()}`;
    const reference = `PAY_${dealId}_${milestoneId}`;
    
    const payment = await createPayment(amount, orderId, reference);
    
    if (payment.success) {
      // টেম্প ট্রানজেকশন সেভ
      const tempTxRef = collection(db, 'temp_transactions');
      await addDoc(tempTxRef, {
        dealId,
        milestoneId,
        amount,
        userId,
        paymentID: payment.paymentID,
        orderId,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      
      return {
        success: true,
        paymentID: payment.paymentID,
        bkashURL: payment.bkashURL
      };
    }
    
    return { success: false, error: payment.error };
  } catch (error) {
    console.error("❌ Initiate payment error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * ২. পেমেন্ট এক্সিকিউট (bKash থেকে কলব্যাক)
 */
export const executePaymentFlow = async (paymentID) => {
  try {
    // পেমেন্ট এক্সিকিউট
    const result = await executePayment(paymentID);
    
    if (result.success) {
      // টেম্প ট্রানজেকশন খুঁজে আনা
      const tempTxRef = collection(db, 'temp_transactions');
      const q = query(tempTxRef, where('paymentID', '==', paymentID));
      const querySnap = await getDocs(q);
      
      if (!querySnap.empty) {
        const tempTx = querySnap.docs[0].data();
        const tempTxId = querySnap.docs[0].id;
        
        // ৩. ট্রানজেকশন সেভ
        await saveTransaction({
          dealId: tempTx.dealId,
          milestoneId: tempTx.milestoneId,
          userId: tempTx.userId,
          amount: result.amount,
          transactionId: result.trxID,
          paymentID: result.paymentID,
          status: 'completed'
        });
        
        // ৪. ডিলের মাইলস্টোন আপডেট
        await updateMilestoneStatus(tempTx.dealId, tempTx.milestoneId, 'funded');
        
        // ৫. ওয়ালেট আপডেট (বায়ারের থেকে টাকা কাটা)
        await updateWallet(tempTx.userId, -result.amount, 'debit');
        
        // ৬. টেম্প ট্রানজেকশন ডিলিট
        await deleteDoc(doc(db, 'temp_transactions', tempTxId));
        
        return { success: true, trxID: result.trxID };
      }
    }
    
    return { success: false, error: result.error };
  } catch (error) {
    console.error("❌ Execute payment error:", error);
    return { success: false, error: error.message };
  }
};


const sendMoney = async (senderId, receiverId, amount, note = '') => {
  const transactionId = await generateTransactionId();
  
  await addDoc(collection(db, 'transactions'), {
    transactionId: transactionId,
    senderId: senderId,
    receiverId: receiverId,
    amount: amount,
    note: note,
    status: 'pending',
    createdAt: serverTimestamp()
  });
  
  return transactionId;
};

/**
 * ৩. ট্রানজেকশন সেভ
 */
export const saveTransaction = async (data) => {
  try {
    const transactionRef = collection(db, 'transactions');
    await addDoc(transactionRef, {
      dealId: data.dealId,
      milestoneId: data.milestoneId,
      userId: data.userId,
      amount: data.amount,
      type: 'debit',
      status: data.status || 'completed',
      transactionId: data.transactionId || '',
      paymentID: data.paymentID || '',
      title: 'Milestone Payment',
      description: `Payment for milestone #${data.milestoneId}`,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });
    console.log("✅ Transaction saved");
  } catch (error) {
    console.error("❌ Save transaction error:", error);
    throw error;
  }
};

/**
 * ৪. মাইলস্টোন স্ট্যাটাস আপডেট
 */
export const updateMilestoneStatus = async (dealId, milestoneId, status) => {
  try {
    const dealRef = doc(db, 'deals', dealId);
    const dealSnap = await getDoc(dealRef);
    
    if (dealSnap.exists()) {
      const deal = dealSnap.data();
      const updatedMilestones = deal.milestones.map(m => 
        m.id === milestoneId ? { ...m, status: status } : m
      );
      
      await updateDoc(dealRef, {
        milestones: updatedMilestones,
        updatedAt: serverTimestamp()
      });
      console.log("✅ Milestone updated to:", status);
    }
  } catch (error) {
    console.error("❌ Update milestone error:", error);
    throw error;
  }
};

/**
 * ৫. ওয়ালেট আপডেট
 */
export const updateWallet = async (userId, amount, type) => {
  try {
    const walletRef = doc(db, 'wallets', userId);
    const walletSnap = await getDoc(walletRef);
    
    if (walletSnap.exists()) {
      const currentBalance = walletSnap.data().balance || 0;
      const newBalance = currentBalance + amount;
      
      await updateDoc(walletRef, {
        balance: newBalance,
        totalDebit: (walletSnap.data().totalDebit || 0) + (type === 'debit' ? Math.abs(amount) : 0),
        totalCredit: (walletSnap.data().totalCredit || 0) + (type === 'credit' ? Math.abs(amount) : 0),
        updatedAt: serverTimestamp()
      });
    } else {
      // ওয়ালেট না থাকলে তৈরি করুন
      await setDoc(walletRef, {
        balance: amount < 0 ? Math.abs(amount) : 0,
        totalDebit: type === 'debit' ? Math.abs(amount) : 0,
        totalCredit: type === 'credit' ? amount : 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    console.log("✅ Wallet updated:", type === 'credit' ? '+' : '-', Math.abs(amount));
  } catch (error) {
    console.error("❌ Update wallet error:", error);
    throw error;
  }
};

/**
 * ৬. পেমেন্ট রিলিজ (Seller-এর ওয়ালেটে টাকা যাবে)
 */
export const releasePayment = async (dealId, milestoneId, sellerId, amount) => {
  try {
    // সেলারের ওয়ালেটে টাকা যোগ
    await updateWallet(sellerId, amount, 'credit');
    
    // মাইলস্টোন স্ট্যাটাস আপডেট
    await updateMilestoneStatus(dealId, milestoneId, 'released');
    
    // ট্রানজেকশন রেকর্ড
    const transactionRef = collection(db, 'transactions');
    await addDoc(transactionRef, {
      dealId: dealId,
      milestoneId: milestoneId,
      userId: sellerId,
      amount: amount,
      type: 'credit',
      status: 'completed',
      title: 'Payment Released',
      description: `Payment received for milestone #${milestoneId}`,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });
    
    console.log("✅ Payment released to seller:", amount);
    return { success: true };
  } catch (error) {
    console.error("❌ Release payment error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * ৭. পেমেন্ট স্ট্যাটাস চেক
 */
export const checkPaymentStatus = async (paymentID) => {
  try {
    const result = await queryPayment(paymentID);
    return result;
  } catch (error) {
    console.error("❌ Check payment status error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * ৮. পেমেন্ট রিফান্ড (ঐচ্ছিক)
 */
export const refundPayment = async (dealId, milestoneId, userId, amount, transactionId) => {
  try {
    // ১. ট্রানজেকশন রেকর্ড (রিফান্ড)
    const transactionRef = collection(db, 'transactions');
    await addDoc(transactionRef, {
      dealId: dealId,
      milestoneId: milestoneId,
      userId: userId,
      amount: amount,
      type: 'refund',
      status: 'completed',
      title: 'Payment Refund',
      description: `Refund for milestone #${milestoneId}`,
      transactionId: transactionId || `REFUND_${Date.now()}`,
      createdAt: serverTimestamp()
    });
    
    // ২. ওয়ালেট আপডেট
    await updateWallet(userId, amount, 'credit');
    
    // ৩. মাইলস্টোন স্ট্যাটাস আপডেট
    await updateMilestoneStatus(dealId, milestoneId, 'pending');
    
    console.log("✅ Payment refunded:", amount);
    return { success: true };
  } catch (error) {
    console.error("❌ Refund payment error:", error);
    return { success: false, error: error.message };
  }
};