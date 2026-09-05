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
// ✅ 5. অ্যাডমিন - ইউজারের জন্য সাময়িক পাসওয়ার্ড সেট করুন
// ============================================================
// একটা অ্যাকাউন্টের Firebase Auth পাসওয়ার্ড শুধুমাত্র Admin SDK দিয়েই
// (client SDK দিয়ে না) অন্য কারো পক্ষ থেকে পরিবর্তন করা যায় — তাই এই
// একটামাত্র sensitive অ্যাকশনের জন্যই ফ্রন্টএন্ড থেকে সরাসরি Firestore না
// লিখে এই ব্যাকএন্ডে আসতে হয়েছে। এই এন্ডপয়েন্ট আগে ভেরিফাই করে caller
// আসলেই একজন authenticated admin কিনা (নিচের requireAdmin middleware),
// তারপর টার্গেট ইউজারের পাসওয়ার্ড সেট করে এবং users/{uid}.mustChangePassword
// ফ্ল্যাগ true করে দেয় — যাতে পরের লগইনে (Login.jsx) ইউজারকে জোর করে
// Settings → Security ট্যাবে পাঠিয়ে নতুন পাসওয়ার্ড সেট করানো যায়।

// 🔧 রাখুন সিঙ্কে: src/features/admin/constants/admin.js-এর ADMIN_EMAILS-এর
// সাথে হুবহু মিলিয়ে রাখুন — এই ব্যাকএন্ড আলাদা রানটাইম, তাই এখানে ওই
// ফাইলটা সরাসরি import করা যায় না।
const ADMIN_EMAILS = ['hammanmusa362@gmail.com', 'hasanmahmudmd362@gmail.com'];

const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!idToken) {
      return res.status(401).json({ success: false, message: 'Missing authorization token' });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const isMainAdmin = ADMIN_EMAILS.includes(decoded.email);

    let isSubAdmin = false;
    if (!isMainAdmin) {
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      isSubAdmin = userData.role === 'admin' && !userData.adminDisabled;
    }

    if (!isMainAdmin && !isSubAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    req.adminUid = decoded.uid;
    req.adminEmail = decoded.email || 'admin';
    next();
  } catch (error) {
    console.error('❌ Admin auth check failed:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

app.post('/api/admin/set-temp-password', requireAdmin, async (req, res) => {
  const { userId, tempPassword } = req.body;

  if (!userId || !tempPassword) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  if (String(tempPassword).length < 6) {
    return res.status(400).json({ success: false, message: 'Temporary password must be at least 6 characters' });
  }

  try {
    // মূল (main) অ্যাডমিন অ্যাকাউন্টের পাসওয়ার্ড এই এন্ডপয়েন্ট দিয়ে কখনো
    // পরিবর্তনযোগ্য না — অন্য কোনো sub-admin ভুলে/ইচ্ছাকৃতভাবে চেষ্টা করলেও।
    const targetUserRecord = await admin.auth().getUser(userId);
    if (ADMIN_EMAILS.includes(targetUserRecord.email)) {
      return res.status(403).json({ success: false, message: 'Cannot reset a main admin account this way' });
    }

    await admin.auth().updateUser(userId, { password: tempPassword });

    await db.collection('users').doc(userId).set(
      {
        mustChangePassword: true,
        tempPasswordSetAt: admin.firestore.FieldValue.serverTimestamp(),
        tempPasswordSetBy: req.adminUid,
      },
      { merge: true }
    );

    await db.collection('adminLogs').add({
      action: 'set_temp_password',
      userId,
      adminId: req.adminUid,
      adminEmail: req.adminEmail,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('🔐 Temporary password set for user:', userId, 'by admin:', req.adminEmail);
    return res.json({ success: true, message: 'Temporary password set successfully' });
  } catch (error) {
    console.error('❌ Set temp password error:', error);
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ============================================================
// ✅ 6. সার্ভার স্টার্ট
// ============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});