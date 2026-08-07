// server/index.js
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Admin SDK Initialize
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ============================================================
// ✅ 1. পেমেন্ট ভেরিফিকেশন এন্ডপয়েন্ট
// ============================================================
app.post('/api/submit-payment', async (req, res) => {
  const { userId, trxId, amount, senderNumber, method } = req.body;

  console.log('📥 Payment verification request:', { userId, trxId, amount, senderNumber, method });

  // ✅ ভ্যালিডেশন
  if (!userId || !trxId || !amount || !senderNumber) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields' 
    });
  }

  try {
    // ১. Firestore-এ ট্রানজেকশন আপডেট
    const transactionsRef = db.collection('transactions');
    const q = transactionsRef.where('trxId', '==', trxId).where('userId', '==', userId);
    const snapshot = await q.get();

    if (snapshot.empty) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    const doc = snapshot.docs[0];
    const txRef = doc.ref;

    // ২. bKash/Nagad API দিয়ে TrxID ভেরিফাই করুন
    const verificationResult = await verifyTransactionWithProvider(trxId, amount, senderNumber, method);

    if (verificationResult.success) {
      // ✅ সফল: ওয়ালেট আপডেট করুন
      const walletRef = db.collection('wallets').doc(userId);
      
      await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        const currentBalance = walletDoc.exists ? walletDoc.data().balance : 0;
        
        // ওয়ালেট আপডেট
        transaction.update(walletRef, {
          balance: currentBalance + Number(amount),
          totalEarned: admin.firestore.FieldValue.increment(Number(amount)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // ট্রানজাকশন স্ট্যাটাস আপডেট
        transaction.update(txRef, {
          status: 'completed',
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedBy: 'system'
        });

        // নোটিফিকেশন তৈরি
        const notifRef = db.collection('notifications').doc();
        transaction.set(notifRef, {
          userId: userId,
          type: 'deposit_success',
          title: 'Deposit Successful',
          message: `৳${amount} has been added to your wallet.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      console.log('✅ Deposit completed for user:', userId);
      return res.json({ 
        success: true, 
        message: 'Deposit verified and completed!',
        amount: amount
      });

    } else {
      // ❌ ব্যর্থ: ট্রানজাকশন রিজেক্ট করুন
      await txRef.update({
        status: 'rejected',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectionReason: verificationResult.message
      });

      return res.status(400).json({ 
        success: false, 
        message: verificationResult.message 
      });
    }

  } catch (error) {
    console.error('❌ Verification error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// ============================================================
// ✅ 2. bKash/Nagad API ইন্টিগ্রেশন
// ============================================================
const verifyTransactionWithProvider = async (trxId, amount, senderNumber, method) => {
  try {
    // 🔥 এখানে আপনার bKash/Nagad API ইন্টিগ্রেশন করুন
    // উদাহরণ: bKash Merchant API বা 3rd Party API
    
    if (method === 'bKash') {
      // bKash API কল করুন
      // const response = await axios.post('https://api.bkash.com/verify', {
      //   trxId,
      //   amount,
      //   senderNumber
      // });
      
      // ⚠️ ডেমো রেসপন্স (প্রোডাকশনে API ইন্টিগ্রেট করতে হবে)
      return { 
        success: true, 
        message: 'Transaction verified successfully' 
      };
      
    } else if (method === 'Nagad') {
      // Nagad API কল করুন
      return { 
        success: true, 
        message: 'Transaction verified successfully' 
      };
      
    } else if (method === 'Rocket') {
      // Rocket API কল করুন
      return { 
        success: true, 
        message: 'Transaction verified successfully' 
      };
    }
    
    return { 
      success: false, 
      message: 'Payment method not supported' 
    };
    
  } catch (error) {
    console.error('❌ Provider verification error:', error);
    return { 
      success: false, 
      message: 'Failed to verify with provider' 
    };
  }
};

// ============================================================
// ✅ 3. অ্যাডমিন এন্ডপয়েন্ট (ম্যানুয়াল ভেরিফিকেশন)
// ============================================================
app.post('/api/admin/verify-deposit', async (req, res) => {
  const { transactionId, verified } = req.body;

  try {
    const txRef = db.collection('transactions').doc(transactionId);
    const txDoc = await txRef.get();

    if (!txDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    const data = txDoc.data();

    if (verified) {
      // ওয়ালেট আপডেট
      const walletRef = db.collection('wallets').doc(data.userId);
      
      await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        const currentBalance = walletDoc.exists ? walletDoc.data().balance : 0;
        
        transaction.update(walletRef, {
          balance: currentBalance + Number(data.amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(txRef, {
          status: 'completed',
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedBy: 'admin'
        });
      });

      return res.json({ 
        success: true, 
        message: 'Deposit verified manually' 
      });
    } else {
      await txRef.update({
        status: 'rejected',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectionReason: 'Rejected by admin'
      });

      return res.json({ 
        success: true, 
        message: 'Deposit rejected' 
      });
    }

  } catch (error) {
    console.error('❌ Admin verification error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============================================================
// ✅ 4. পেন্ডিং ট্রানজাকশন লিস্ট (অ্যাডমিন)
// ============================================================
app.get('/api/admin/pending-transactions', async (req, res) => {
  try {
    const snapshot = await db.collection('transactions')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();

    const transactions = [];
    snapshot.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// ✅ 5. সার্ভার স্টার্ট
// ============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});