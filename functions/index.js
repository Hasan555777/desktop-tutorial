// functions/index.js
require('dotenv').config(); // ✅ .env ফাইল থেকে ভেরিয়েবল লোড করা
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

admin.initializeApp();

// ============================================================
// 📧 ইমেইল ট্রান্সপোর্টার (Gmail)
// ============================================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'hasanmahmudmd362@gmail.com',
    pass: process.env.EMAIL_APP_PASSWORD // ✅ .env থেকে নেওয়া
  }
});

// ============================================================
// 🔐 DeepSeek API কী ( .env থেকে )
// ============================================================
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// ============================================================
// ১. অটো ডিলিট (প্রতি ঘণ্টায়)
// ============================================================
exports.autoDeleteBlockedUsers = functions.pubsub
  .schedule('0 * * * *')
  .timeZone('Asia/Dhaka')
  .onRun(async () => {
    console.log('🔍 Checking for expired blocked users...');
    
    const now = new Date();
    const snapshot = await admin.firestore()
      .collection('users')
      .where('isBanned', '==', true)
      .where('blockExpiry', '<=', now.toISOString())
      .get();
    
    if (snapshot.empty) return null;
    
    const batch = admin.firestore().batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
      batch.delete(admin.firestore().doc(`wallets/${doc.id}`));
    });
    await batch.commit();
    
    console.log(`✅ Deleted ${snapshot.size} users`);
    return null;
  });

// ============================================================
// ২. ইমেইল নোটিফিকেশন (নতুন ইউজার)
// ============================================================
exports.sendWelcomeEmail = functions.auth.user()
  .onCreate(async (user) => {
    try {
      await transporter.sendMail({
        to: user.email,
        subject: '🎉 Welcome to WorkTrustbd!',
        html: `<h1>Welcome ${user.displayName || 'User'}!</h1>
               <p>Your account has been created successfully.</p>`
      });
      console.log(`📧 Welcome email sent to ${user.email}`);
    } catch (error) {
      console.error('❌ Welcome email error:', error);
    }
  });

// ============================================================
// ৩. অ্যাডমিন লগ (কে কি করলো)
// ============================================================
exports.logAdminAction = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    if (before.isBanned !== after.isBanned) {
      await admin.firestore().collection('admin_logs').add({
        userId: context.params.userId,
        action: after.isBanned ? 'BLOCKED' : 'UNBLOCKED',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });

// ============================================================
// ৪. ব্লক নোটিফিকেশন
// ============================================================
exports.sendBlockNotification = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    if (before.isBanned === false && after.isBanned === true) {
      try {
        // ইমেইল পাঠান
        await transporter.sendMail({
          to: after.email,
          subject: '🚫 Your account has been blocked',
          html: `<h2>Your account has been blocked</h2>
                 <p>Reason: ${after.banReason || 'Admin blocked'}</p>
                 <p>You will be unblocked in 24 hours automatically.</p>`
        });
        
        // নোটিফিকেশন সেভ
        await admin.firestore().collection('notifications').add({
          userId: context.params.userId,
          type: 'account_blocked',
          message: 'Your account has been blocked for 24 hours',
          isUnread: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (error) {
        console.error('❌ Block notification error:', error);
      }
    }
  });

// ============================================================
// ৫. Push নোটিফিকেশন (FCM)
// ============================================================
exports.sendPushNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(data.userId)
      .get();
    
    const fcmToken = userDoc.data()?.fcmToken;
    if (fcmToken) {
      try {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: 'New Notification',
            body: data.message
          }
        });
      } catch (error) {
        console.error('❌ Push notification error:', error);
      }
    }
  });

// ============================================================
// ৬. বাল্ক ডিলিট হেল্পার (ব্যাচ ডিলিট)
// ============================================================
const deleteQueryBatch = async (queryRef) => {
  const snapshot = await queryRef.get();
  if (snapshot.empty) return;

  let batch = admin.firestore().batch();
  let operationCount = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    operationCount += 1;

    if (operationCount >= 450) {
      await batch.commit();
      batch = admin.firestore().batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }
};

// ============================================================
// ৭. অ্যাডমিন দ্বারা ইউজার ডিলিট
// ============================================================
exports.adminDeleteUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const requesterUid = context.auth.uid;
  const requesterEmail = context.auth.token.email || '';
  const adminEmails = [
    'hammanmusa362@gmail.com',
    'hasanmahmudmd362@gmail.com'
  ];

  const requesterDoc = await admin.firestore().collection('users').doc(requesterUid).get();
  const requesterRole = requesterDoc.exists ? requesterDoc.data().role : null;

  if (requesterRole !== 'admin' && !adminEmails.includes(requesterEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access is required.');
  }

  const targetUid = data?.userId;
  if (!targetUid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing userId.');
  }

  if (targetUid === requesterUid) {
    throw new functions.https.HttpsError('failed-precondition', 'You cannot delete your own admin account here.');
  }

  const db = admin.firestore();

  try {
    await admin.auth().deleteUser(targetUid).catch((error) => {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    });
  } catch (error) {
    throw new functions.https.HttpsError('internal', `Failed to delete Auth user: ${error.message}`);
  }

  const batch = db.batch();
  batch.delete(db.collection('users').doc(targetUid));
  batch.delete(db.collection('wallets').doc(targetUid));

  await deleteQueryBatch(db.collection('notifications').where('userId', '==', targetUid));
  await deleteQueryBatch(db.collection('transactions').where('userId', '==', targetUid));
  await deleteQueryBatch(db.collection('posts').where('userId', '==', targetUid));
  await deleteQueryBatch(db.collection('chats').where('participants', 'array-contains', targetUid));
  await deleteQueryBatch(db.collection('deals').where('participants', 'array-contains', targetUid));

  await batch.commit();

  await db.collection('admin_logs').add({
    type: 'user_deleted',
    userId: targetUid,
    deletedBy: requesterUid,
    deletedByEmail: requesterEmail,
    deletedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    message: 'User deleted successfully.'
  };
});

// ============================================================
// ৮. ডেডলাইন রিমাইন্ডার (প্রতি সকাল ৯টায়)
// ============================================================
exports.sendDeadlineReminder = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('Asia/Dhaka')
  .onRun(async () => {
    const deals = await admin.firestore()
      .collection('deals')
      .where('status', '==', 'active')
      .where('deadline', '<=', 3) // ৩ দিন বাকি
      .get();
    
    deals.forEach(async (doc) => {
      const deal = doc.data();
      await admin.firestore().collection('notifications').add({
        userId: deal.buyerId,
        type: 'deadline_reminder',
        message: `Deal "${deal.postTitle}" deadline is approaching!`,
        isUnread: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  });

// ============================================================
// ৯. DeepSeek AI Assistant (HTTPS Cloud Function)
// ============================================================
exports.askDeepSeek = onRequest({ cors: true }, async (req, res) => {
  // শুধুমাত্র POST রিকোয়েস্ট অ্যালাউ করুন
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // ✅ .env থেকে DEEPSEEK_API_KEY ব্যবহার
  if (!DEEPSEEK_API_KEY) {
    console.error('❌ DEEPSEEK_API_KEY is not set in .env');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        stream: false
      }),
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
      res.json({ reply: data.choices[0].message.content });
    } else {
      res.status(500).json({ error: 'DeepSeek returned an empty response' });
    }
  } catch (error) {
    console.error('DeepSeek Error:', error);
    res.status(500).json({ error: 'Failed to communicate with AI' });
  }
});