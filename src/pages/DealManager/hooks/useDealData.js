// // src/pages/DealManager/hooks/useDealData.js

// // Two responsibilities pulled straight out of the original component:
// //   1. Live-subscribe to the current user's deals (as buyer or seller).
// //   2. Fetch the single deal identified by ?dealId=/?postId= in the URL.
// // Logic is unchanged — only reorganized so DealManager.jsx isn't doing
// // data-fetching AND rendering AND every mutation in one 1600-line file.

// import { useState, useEffect } from 'react';
// import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
// import { db } from '../../../firebase';  // ✅ পাথ ঠিক করা হয়েছে

// export const useDealsList = (currentUser, currentMode) => {
//   const [deals, setDeals] = useState([]);
//   const [loadingList, setLoadingList] = useState(true);

//   useEffect(() => {
//     if (!currentUser?.uid) return;

//     setLoadingList(true);
//     const userField = currentMode === 'buyer' ? 'buyerId' : 'sellerId';
//     const dealsRef = collection(db, 'deals');
//     const q = query(dealsRef, where(userField, '==', currentUser.uid));

//     const unsubscribe = onSnapshot(
//       q,
//       (snapshot) => {
//         const fetchedDeals = snapshot.docs.map((docSnap) => ({
//           id: docSnap.id,
//           ...docSnap.data(),
//         }));

//         setDeals(fetchedDeals);

//         console.log('📊 Deals loaded:', {
//           total: fetchedDeals.length,
//           active: fetchedDeals.filter((d) => d.status === 'active').length,
//           pending: fetchedDeals.filter((d) => d.status === 'pending').length,
//           overdue: fetchedDeals.filter((d) => d.status === 'overdue').length,
//           completed: fetchedDeals.filter((d) => d.status === 'completed').length,
//           cancelled: fetchedDeals.filter((d) => d.status === 'cancelled').length,
//         });

//         setLoadingList(false);
//       },
//       (error) => {
//         console.error('Error loading deals:', error);
//         setLoadingList(false);
//       }
//     );

//     return () => unsubscribe();
//   }, [currentMode, currentUser?.uid]);

//   return { deals, setDeals, loadingList };
// };

// export const useSelectedDeal = (dealId) => {
//   const [selectedDeal, setSelectedDeal] = useState(null);
//   const [loadingDeal, setLoadingDeal] = useState(true);

//   useEffect(() => {
//     const fetchDeal = async () => {
//       if (!dealId) {
//         setSelectedDeal(null);
//         setLoadingDeal(false);
//         return;
//       }

//       setLoadingDeal(true);
//       try {
//         const dealRef = doc(db, 'deals', dealId);
//         const dealSnap = await getDoc(dealRef);
//         if (dealSnap.exists()) {
//           const data = dealSnap.data();
//           setSelectedDeal({
//             id: dealSnap.id,
//             ...data,
//             extensionRequestedBy: data.extensionRequestedBy || null,
//             extensionRequestedAt: data.extensionRequestedAt || null,
//             extensionRequestDays: data.extensionRequestDays || null,
//             extensionRequestStatus: data.extensionRequestStatus || null,
//             extensionRequestedByName: data.extensionRequestedByName || null,
//             extensionCount: data.extensionCount || 0,
//             overdueMarkedAt: data.overdueMarkedAt || null,
//             disputeStatus: data.disputeStatus || null,
//             disputeReason: data.disputeReason || null,
//             disputeRaisedBy: data.disputeRaisedBy || null,
//           });
//         } else {
//           setSelectedDeal(null);
//         }
//       } catch (error) {
//         console.error('Error fetching deal:', error);
//         setSelectedDeal(null);
//       }
//       setLoadingDeal(false);
//     };
//     fetchDeal();
//   }, [dealId]);

//   return { selectedDeal, setSelectedDeal, loadingDeal };
// };

// // ✅ ডিফল্ট এক্সপোর্ট যোগ করুন (যদি কেউ ডিফল্ট ইম্পোর্ট করে)
// export default {
//   useDealsList,
//   useSelectedDeal,
// };