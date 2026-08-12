// // src/pages/DealManager/components/DealBanners.jsx

// import React from 'react';
// import { MAX_EXTENSIONS } from '../../../constants/dealManager.constants';  // ✅ পাথ ঠিক করা হয়েছে

// const DealBanners = ({
//   selectedDeal,
//   currentUser,
//   currentMode,
//   handleExtendDeadline,
//   handleCancelDeal,
//   handleOpenDispute,
//   handleExtensionResponse,
//   handleCancelResponse,
//   setSelectedDeal,
// }) => {
//   return (
//     <>
//       {/* Dispute Banner (blocks other actions while open) */}
//       {selectedDeal.disputeStatus === 'open' && (
//         <div className="dispute-banner open">
//           <i className="fa-solid fa-scale-balanced"></i>
//           <div>
//             <h4>⚖️ Dispute Under Admin Review</h4>
//             <p>
//               {selectedDeal.disputeRaisedBy === currentUser?.uid
//                 ? 'আপনি এই ডিলে Dispute ওপেন করেছেন।'
//                 : `${currentMode === 'buyer' ? 'Seller' : 'Buyer'} এই ডিলে Dispute ওপেন করেছেন।`}
//             </p>
//             <p className="extension-details">
//               <strong>কারণ:</strong> {selectedDeal.disputeReason}
//             </p>
//             <p className="extension-hint">
//               <i className="fa-solid fa-info-circle"></i> Admin সিদ্ধান্ত না দেওয়া পর্যন্ত Extend/Cancel বন্ধ থাকবে।
//             </p>
//           </div>
//         </div>
//       )}

//       {/* Overdue Banner — Extend / Cancel / Dispute */}
//       {selectedDeal.status === 'overdue' && selectedDeal.disputeStatus !== 'open' && (
//         <div className="overdue-banner">
//           <i className="fa-solid fa-triangle-exclamation"></i>
//           <div>
//             <h4>🔴 এই ডিলটি Overdue!</h4>
//             <p>ডেডলাইন এবং ২৪ ঘণ্টার Grace Period দুটোই পার হয়ে গেছে। এখন কী করতে চান?</p>
//           </div>
//           <div className="overdue-action-btns" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
//             {selectedDeal.extensionRequestStatus !== 'pending' && (
//               <button className="btn-agree" onClick={handleExtendDeadline}>
//                 <i className="fa-solid fa-clock"></i> Extend Deadline
//               </button>
//             )}
//             {!selectedDeal.cancelRequestedBy && (
//               <button className="btn-reject" onClick={handleCancelDeal}>
//                 <i className="fa-solid fa-ban"></i> Cancel Deal
//               </button>
//             )}
//             <button className="btn-dispute" onClick={handleOpenDispute} style={{ backgroundColor: '#f59e0b', color: '#111' }}>
//               <i className="fa-solid fa-scale-balanced"></i> Open Dispute
//             </button>
//           </div>
//         </div>
//       )}

//       {/* Extension Request Banner */}
//       {selectedDeal.extensionRequestStatus === 'pending' && (
//         <div className="extension-request-banner pending">
//           <i className="fa-solid fa-clock"></i>
//           <div>
//             <h4>📅 Deadline Extension Request Pending</h4>
//             <p>
//               {selectedDeal.extensionRequestedBy === currentUser?.uid
//                 ? `⏳ Waiting for ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} to respond...`
//                 : `${selectedDeal.extensionRequestedByName || 'Someone'} has requested to extend the deadline by ${selectedDeal.extensionRequestDays || 0} days.`}
//             </p>
//             <p className="extension-details">
//               <strong>Current Deadline:</strong> {selectedDeal.deadline} days &nbsp;|&nbsp;
//               <strong>New Deadline:</strong> {(selectedDeal.deadline || 0) + (selectedDeal.extensionRequestDays || 0)} days
//             </p>
//           </div>
//           {selectedDeal.extensionRequestedBy !== currentUser?.uid && (
//             <div className="extension-response-btns">
//               <button className="btn-agree" onClick={() => handleExtensionResponse('approve')}>
//                 <i className="fa-solid fa-check"></i> Approve
//               </button>
//               <button className="btn-reject" onClick={() => handleExtensionResponse('reject')}>
//                 <i className="fa-solid fa-times"></i> Reject
//               </button>
//             </div>
//           )}
//           {selectedDeal.extensionRequestedBy === currentUser?.uid && (
//             <span className="pending-waiting">
//               <i className="fa-solid fa-hourglass-half"></i> Waiting for response...
//             </span>
//           )}
//         </div>
//       )}

//       {/* Extension Approved Banner */}
//       {selectedDeal.extensionRequestStatus === 'approved' && (
//         <div className="extension-request-banner approved">
//           <i className="fa-solid fa-check-circle"></i>
//           <div>
//             <h4>✅ Deadline Extended!</h4>
//             <p>
//               Deadline has been extended by {selectedDeal.extensionRequestDays || 0} days.
//               <br />
//               <strong>New Deadline:</strong> {selectedDeal.deadline} days
//               <br />
//               <strong>Extensions used:</strong> {selectedDeal.extensionCount || 0}/{MAX_EXTENSIONS}
//             </p>
//           </div>
//         </div>
//       )}

//       {/* Extension Rejected Banner */}
//       {selectedDeal.extensionRequestStatus === 'rejected' && (
//         <div className="extension-request-banner rejected">
//           <i className="fa-solid fa-times-circle"></i>
//           <div>
//             <h4>❌ Extension Request Rejected</h4>
//             <p>
//               The extension request was rejected by the other party.
//               <br />
//               <strong>Current Deadline:</strong> {selectedDeal.deadline} days
//             </p>
//             <button
//               className="btn-dismiss"
//               onClick={() => {
//                 setSelectedDeal((prev) => ({ ...prev, extensionRequestStatus: null }));
//               }}
//             >
//               <i className="fa-solid fa-times"></i> Dismiss
//             </button>
//           </div>
//         </div>
//       )}

//       {/* Cancellation Request Banner */}
//       {selectedDeal.cancelRequestStatus === 'pending' && (
//         <div className="cancel-request-banner pending">
//           <i className="fa-solid fa-clock"></i>
//           <div>
//             <h4>Cancellation Request Pending</h4>
//             <p>
//               {selectedDeal.cancelRequestedBy === currentUser?.uid
//                 ? `Waiting for ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} to respond...`
//                 : `The ${currentMode === 'buyer' ? 'Seller' : 'Buyer'} has requested to cancel this deal.`}
//             </p>
//             <p className="cancel-reason">
//               <strong>Reason:</strong> {selectedDeal.cancelReason || 'No reason provided'}
//             </p>
//           </div>
//           {selectedDeal.cancelRequestedBy !== currentUser?.uid && (
//             <div className="cancel-response-btns">
//               <button className="btn-agree" onClick={() => handleCancelResponse('approve')}>
//                 <i className="fa-solid fa-check"></i> Agree to Cancel
//               </button>
//               <button className="btn-reject" onClick={() => handleCancelResponse('reject')}>
//                 <i className="fa-solid fa-times"></i> Reject
//               </button>
//             </div>
//           )}
//         </div>
//       )}

//       {/* Extend Deadline - Request Button (normal active state, not overdue) */}
//       {selectedDeal.status === 'active' && selectedDeal.disputeStatus !== 'open' && selectedDeal.extensionRequestStatus !== 'pending' && (
//         <div className="extend-deadline-section">
//           <button className="btn-extend-deadline" onClick={handleExtendDeadline} disabled={(selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS}>
//             <i className="fa-solid fa-clock"></i>
//             {(selectedDeal.extensionCount || 0) >= MAX_EXTENSIONS ? '🚫 Extension Limit Reached' : 'Request Deadline Extension'}
//           </button>
//           <p className="extension-hint">
//             <i className="fa-solid fa-info-circle"></i>
//             Your request must be approved by the other party. &nbsp;({selectedDeal.extensionCount || 0}/{MAX_EXTENSIONS} used)
//           </p>
//         </div>
//       )}
//     </>
//   );
// };

// export default DealBanners;