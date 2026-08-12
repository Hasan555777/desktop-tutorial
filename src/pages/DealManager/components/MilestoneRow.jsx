// import React from 'react';
// import { getMilestoneStatusBadge, getSubmitDeadlineText } from '../utils/dealStatus';

// const MilestoneRow = ({
//   milestone,
//   index,
//   isActive,
//   isBuyer,
//   isSeller,
//   navigate,
//   dealId,
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
//   const statusBadge = getMilestoneStatusBadge(milestone.status);
//   const deadlineInfo = milestone.status === 'funded' ? getSubmitDeadlineText(milestone) : null;

//   return (
//     <div className={`milestone-row ${milestone.status}`}>
//       <div className="m-info-block">
//         <div className="m-number">{String(index + 1).padStart(2, '0')}</div>
//         <div className="m-details">
//           <h4>{milestone.title}</h4>
//           <p className="m-amount">💰 Amount: {milestone.amount?.toLocaleString()} BDT</p>
//           {milestone.status === 'funded' && milestone.workRejectReason && (
//             <p style={{ fontSize: '12px', color: '#ef4444', margin: '4px 0 0' }}>
//               <i className="fa-solid fa-triangle-exclamation"></i> পূর্বের সাবমিশন প্রত্যাখ্যাত হয়েছে: {milestone.workRejectReason}
//             </p>
//           )}
//           {deadlineInfo && (
//             <p style={{ fontSize: '12px', color: deadlineInfo.urgent ? '#ef4444' : '#f59e0b', margin: '4px 0 0' }}>
//               {deadlineInfo.text}
//             </p>
//           )}
//           {milestone.status === 'refunded' && (
//             <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
//               <i className="fa-solid fa-rotate-left"></i>{' '}
//               {milestone.refundReason === 'seller_no_submission'
//                 ? 'সময়মতো কাজ জমা না দেওয়ায় অটো-রিফান্ড হয়েছে।'
//                 : 'Buyer-কে টাকা ফেরত দেওয়া হয়েছে।'}
//             </p>
//           )}
//         </div>
//       </div>

//       <div className="m-status-side">
//         <span className={`status-badge ${statusBadge.class}`}>{statusBadge.text}</span>

//         {/* Buyer: pay & fund */}
//         {isActive && isBuyer && milestone.status === 'pending' && (
//           <button className="btn-fund" onClick={() => navigate(`/payment/${dealId}/${milestone.id}`)}>
//             <i className="fa-solid fa-credit-card"></i> Pay & Fund
//           </button>
//         )}

//         {/* Buyer: review submitted work */}
//         {isActive && isBuyer && milestone.status === 'review' && (
//           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
//             {(milestone.workProofLink || milestone.workProofNote) && (
//               <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', textAlign: 'right', maxWidth: '260px' }}>
//                 {milestone.workProofLink && (
//                   <div>
//                     <a
//                       href={milestone.workProofLink}
//                       target="_blank"
//                       rel="noopener noreferrer"
//                       style={{ color: 'var(--accent-primary, #14b8a6)' }}
//                     >
//                       <i className="fa-solid fa-link"></i> Proof Link দেখুন
//                     </a>
//                   </div>
//                 )}
//                 {milestone.workProofNote && <div style={{ marginTop: '2px' }}>📝 {milestone.workProofNote}</div>}
//               </div>
//             )}
//             <div style={{ display: 'flex', gap: '8px' }}>
//               <button className="btn-review-release" onClick={() => onReleasePayment(milestone.id)} disabled={releasingPayment === milestone.id}>
//                 {releasingPayment === milestone.id ? (
//                   <>
//                     <i className="fa-solid fa-spinner fa-spin"></i> ...
//                   </>
//                 ) : (
//                   <>
//                     <i className="fa-solid fa-check"></i> Accept & Release
//                   </>
//                 )}
//               </button>
//               <button
//                 className="btn-reject-work"
//                 onClick={() => onRejectWork(milestone.id)}
//                 disabled={rejectingWork === milestone.id}
//                 style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer' }}
//               >
//                 {rejectingWork === milestone.id ? (
//                   <>
//                     <i className="fa-solid fa-spinner fa-spin"></i> ...
//                   </>
//                 ) : (
//                   <>
//                     <i className="fa-solid fa-times"></i> Reject
//                   </>
//                 )}
//               </button>
//             </div>
//           </div>
//         )}

//         {/* Seller: submit work */}
//         {isActive && isSeller && milestone.status === 'funded' && (
//           openSubmitForm === milestone.id ? (
//             <div className="work-submit-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '240px' }}>
//               <input
//                 type="text"
//                 placeholder="🔗 Proof link (স্ক্রিনশট/ফাইল/ড্রাইভ লিংক)"
//                 value={workDraft[milestone.id]?.link || ''}
//                 onChange={(e) => setWorkDraft((prev) => ({ ...prev, [milestone.id]: { ...prev[milestone.id], link: e.target.value } }))}
//                 style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
//               />
//               <textarea
//                 placeholder="নোট (যেমন: বাকি ফাইল WhatsApp/Messenger-এ পাঠানো হয়েছে)"
//                 value={workDraft[milestone.id]?.note || ''}
//                 onChange={(e) => setWorkDraft((prev) => ({ ...prev, [milestone.id]: { ...prev[milestone.id], note: e.target.value } }))}
//                 rows={2}
//                 style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'inherit', resize: 'vertical', fontSize: '13px' }}
//               />
//               <div style={{ display: 'flex', gap: '8px' }}>
//                 <button className="btn-submit-work" onClick={() => onSubmitWork(milestone.id)} disabled={submittingMilestone === milestone.id}>
//                   {submittingMilestone === milestone.id ? (
//                     <>
//                       <i className="fa-solid fa-spinner fa-spin"></i> Submitting...
//                     </>
//                   ) : (
//                     <>
//                       <i className="fa-solid fa-paper-plane"></i> Submit
//                     </>
//                   )}
//                 </button>
//                 <button
//                   onClick={() => setOpenSubmitForm(null)}
//                   style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--text-muted, #94a3b8)', cursor: 'pointer', fontSize: '13px' }}
//                 >
//                   বাতিল
//                 </button>
//               </div>
//             </div>
//           ) : (
//             <button className="btn-submit-work" onClick={() => setOpenSubmitForm(milestone.id)}>
//               <i className="fa-solid fa-upload"></i> Submit Work
//             </button>
//           )
//         )}

//         {milestone.status === 'released' && (
//           <span className="badge-completed">
//             <i className="fa-solid fa-check-circle"></i> Payment Released
//           </span>
//         )}
//       </div>
//     </div>
//   );
// };

// export default MilestoneRow;
