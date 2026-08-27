// // src/pages/DealManager/utils/escrow.js

// // Escrow balance lock / unlock helpers, run as Firestore transactions.
// // Logic is unchanged from the original DealManager.jsx — only moved here so
// // it can be unit-tested in isolation from React and reused by any future
// // server-side Cloud Function port without dragging component code with it.

// import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
// import { db } from '../../../firebase';  // ✅ পাথ ঠিক করা হয়েছে

// /**
//  * Checks the buyer's AVAILABLE balance (balance - lockedBalance) against the
//  * deal budget. If sufficient, locks the full budget on the buyer's wallet
//  * AND activates the deal, all inside a single atomic transaction so the
//  * check-then-lock can never race with a second deal being activated at the
//  * same instant.
//  *
//  * Throws an Error with message 'INSUFFICIENT_BALANCE' if the buyer doesn't
//  * have enough available balance — callers should catch this and show a
//  * friendly message instead of a generic failure.
//  */
// export const activateDealWithEscrowLock = async ({ dealId, buyerId, budget, extraDealFields = {} }) => {
//   const dealRef = doc(db, 'deals', dealId);
//   const walletRef = doc(db, 'wallets', buyerId);

//   await runTransaction(db, async (transaction) => {
//     const walletSnap = await transaction.get(walletRef);
//     if (!walletSnap.exists()) {
//       throw new Error('WALLET_NOT_FOUND');
//     }
//     const walletData = walletSnap.data();
//     const currentBalance = walletData.balance || 0;
//     const currentLocked = walletData.lockedBalance || 0;
//     const available = currentBalance - currentLocked;

//     if (available < (budget || 0)) {
//       throw new Error('INSUFFICIENT_BALANCE');
//     }

//     transaction.update(walletRef, {
//       lockedBalance: currentLocked + (budget || 0),
//       updatedAt: serverTimestamp(),
//     });

//     transaction.update(dealRef, {
//       status: 'active',
//       startedAt: new Date().toISOString(),
//       escrowLockedAmount: budget || 0,
//       ...extraDealFields,
//       updatedAt: serverTimestamp(),
//     });
//   });
// };

// /**
//  * Releases the buyer's locked budget back to available balance. Only call
//  * this for deals that reach 'cancelled' status while still having their
//  * FULL budget locked and NO milestone funded/released yet — that invariant
//  * is enforced by handleCancelDeal's hasPayment guard before a cancellation
//  * request can even be created.
//  */
// export const releaseEscrowLock = async ({ buyerId, amount }) => {
//   if (!amount) return;
//   const walletRef = doc(db, 'wallets', buyerId);

//   await runTransaction(db, async (transaction) => {
//     const walletSnap = await transaction.get(walletRef);
//     if (!walletSnap.exists()) return;
//     const currentLocked = walletSnap.data().lockedBalance || 0;

//     transaction.update(walletRef, {
//       lockedBalance: Math.max(0, currentLocked - amount),
//       updatedAt: serverTimestamp(),
//     });
//   });
// };

// // ✅ ডিফল্ট এক্সপোর্ট যোগ করুন (যদি কেউ ডিফল্ট ইম্পোর্ট করে)
// export default {
//   activateDealWithEscrowLock,
//   releaseEscrowLock,
// };