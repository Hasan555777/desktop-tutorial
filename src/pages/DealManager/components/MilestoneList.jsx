// import React from 'react';
// import MilestoneRow from './MilestoneRow';

// const MilestoneList = ({
//   selectedDeal,
//   currentMode,
//   currentUser,
//   navigate,
//   runWithGuide,
//   handleConfirmDeal,
//   handleCancelResponse,
//   releasingPayment,
//   rejectingWork,
//   submittingMilestone,
//   openSubmitForm,
//   setOpenSubmitForm,
//   workDraft,
//   setWorkDraft,
//   onReleasePayment,
//   onRejectWork,
//   onSubmitWork,
// }) => {
//   if (!selectedDeal?.milestones) return null;

//   const isBuyer = currentMode === 'buyer';
//   const isSeller = currentMode === 'seller';
//   const isActive = selectedDeal.status === 'active' || selectedDeal.status === 'overdue';
//   const isPending = selectedDeal.status === 'pending';
//   const isCancelled = selectedDeal.status === 'cancelled';
//   const postType = selectedDeal.postType || 'hire';

//   if (isCancelled) {
//     return (
//       <div className="deal-cancelled-banner">
//         <i className="fa-solid fa-ban"></i>
//         <h4>Deal Cancelled</h4>
//         <p>Cancelled on: {selectedDeal.cancelledAt ? new Date(selectedDeal.cancelledAt).toLocaleDateString() : 'N/A'}</p>
//         <p>Reason: {selectedDeal.cancellationReason || 'No reason provided'}</p>
//       </div>
//     );
//   }

//   return (
//     <div className="milestone-container">
//       {isPending && (
//         <div className="confirm-deal-banner">
//           <p>
//             <i className="fa-solid fa-gavel"></i> একটি অফার পাঠানো হয়েছে!
//           </p>

//           <div style={{ display: 'flex', gap: '10px' }}>
//             {postType === 'service' && selectedDeal.sellerId === currentUser?.uid && (
//               <>
//                 <button className="btn-confirm-deal" onClick={() => runWithGuide(handleConfirmDeal)}>
//                   <i className="fa-solid fa-check-circle"></i> অফার গ্রহণ করুন
//                 </button>
//                 <button className="btn-cancel-deal" style={{ backgroundColor: '#ef4444', color: 'white' }} onClick={() => handleCancelResponse('reject')}>
//                   <i className="fa-solid fa-times-circle"></i> অফার প্রত্যাখ্যান করুন
//                 </button>
//               </>
//             )}

//             {postType === 'hire' && selectedDeal.buyerId === currentUser?.uid && (
//               <>
//                 <button className="btn-confirm-deal" onClick={() => runWithGuide(handleConfirmDeal)}>
//                   <i className="fa-solid fa-check-circle"></i> অফার গ্রহণ করুন
//                 </button>
//                 <button className="btn-cancel-deal" style={{ backgroundColor: '#ef4444', color: 'white' }} onClick={() => handleCancelResponse('reject')}>
//                   <i className="fa-solid fa-times-circle"></i> অফার প্রত্যাখ্যান করুন
//                 </button>
//               </>
//             )}

//             {!(
//               (postType === 'service' && selectedDeal.sellerId === currentUser?.uid) ||
//               (postType === 'hire' && selectedDeal.buyerId === currentUser?.uid)
//             ) && (
//               <span className="pending-message">⏳ {postType === 'service' ? 'সেলার' : 'বায়ার'} এর সিদ্ধান্তের জন্য অপেক্ষা করছেন...</span>
//             )}
//           </div>

//           {selectedDeal.proposedAt && (
//             <p style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '8px' }}>
//               <i className="fa-solid fa-hourglass-half"></i> এই অফারটি ৪৮ ঘণ্টার মধ্যে গ্রহণ না করা হলে স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।
//             </p>
//           )}
//         </div>
//       )}

//       {selectedDeal.milestones.map((milestone, index) => (
//         <MilestoneRow
//           key={milestone.id}
//           milestone={milestone}
//           index={index}
//           isActive={isActive}
//           isBuyer={isBuyer}
//           isSeller={isSeller}
//           navigate={navigate}
//           dealId={selectedDeal.id}
//           releasingPayment={releasingPayment}
//           rejectingWork={rejectingWork}
//           submittingMilestone={submittingMilestone}
//           openSubmitForm={openSubmitForm}
//           setOpenSubmitForm={setOpenSubmitForm}
//           workDraft={workDraft}
//           setWorkDraft={setWorkDraft}
//           onReleasePayment={onReleasePayment}
//           onRejectWork={onRejectWork}
//           onSubmitWork={onSubmitWork}
//         />
//       ))}

//       {selectedDeal.status === 'completed' && (
//         <div className="deal-completed-banner">
//           <i className="fa-solid fa-trophy"></i>
//           <h4>Deal Completed!</h4>
//           <p>All milestones have been completed and payments released.</p>
//         </div>
//       )}
//     </div>
//   );
// };

// export default MilestoneList;