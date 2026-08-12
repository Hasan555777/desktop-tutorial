// import React from 'react';
// import { getDealStatusBadge } from '../utils/dealStatus';

// export const DealHeader = ({ selectedDeal, currentMode, timeRemaining, navigate, feedback }) => (
//   <div className="dash-header">
//     <div className="project-meta">
//       <button className="back-to-list" onClick={() => navigate('/deal-manager')}>
//         <i className="fa-solid fa-arrow-left"></i> Back
//       </button>

//       <div className="deal-title-section">
//         <h2>{selectedDeal.postTitle || 'Deal Dashboard'}</h2>

//         <div className="deal-partner-info">
//           <span className="partner-label">{currentMode === 'buyer' ? '🤝 Seller' : '🤝 Buyer'}:</span>
//           <span className="partner-name">
//             {currentMode === 'buyer'
//               ? selectedDeal.sellerName || selectedDeal.sellerDisplayName || 'Unknown Seller'
//               : selectedDeal.buyerName || selectedDeal.buyerDisplayName || 'Unknown Buyer'}
//           </span>
//         </div>

//         <div className="deal-id-display">
//           <span className="deal-id-label">Deal ID:</span>
//           <span className="deal-id-number">#{selectedDeal.dealIdNumber || selectedDeal.id?.slice(-8)}</span>
//           <button
//             className="copy-id-btn"
//             onClick={() => {
//               navigator.clipboard.writeText(selectedDeal.dealIdNumber || selectedDeal.id);
//               feedback.alert.success({ message: '✅ Deal ID copied!' });
//             }}
//           >
//             <i className="fa-regular fa-copy"></i>
//           </button>
//         </div>
//       </div>

//       <span className={`mode-badge ${selectedDeal.status}`}>{getDealStatusBadge(selectedDeal.status).text}</span>
//       {(selectedDeal.status === 'active' || selectedDeal.status === 'overdue') && timeRemaining[selectedDeal.id] && (
//         <span className="timer-badge">
//           <i className="fa-solid fa-clock"></i> {timeRemaining[selectedDeal.id]}
//         </span>
//       )}
//     </div>
//   </div>
// );

// export const DealInfoCard = ({ selectedDeal, currentMode, timeRemaining }) => (
//   <div className="deal-info-card">
//     <div className="deal-info-row">
//       <span>
//         <i className="fa-solid fa-hashtag"></i> Deal ID:
//       </span>
//       <strong className="deal-id-highlight">#{selectedDeal.dealIdNumber || selectedDeal.id?.slice(-8)}</strong>
//     </div>

//     <div className="deal-info-row partner-row">
//       <span>
//         <i className="fa-solid fa-user"></i> {currentMode === 'buyer' ? 'Seller' : 'Buyer'}:
//       </span>
//       <strong>
//         {currentMode === 'buyer'
//           ? selectedDeal.sellerName || selectedDeal.sellerDisplayName || 'Unknown Seller'
//           : selectedDeal.buyerName || selectedDeal.buyerDisplayName || 'Unknown Buyer'}
//       </strong>
//     </div>

//     <div className="deal-info-row">
//       <span>
//         <i className="fa-solid fa-wallet"></i> Total Budget:
//       </span>
//       <strong>{selectedDeal.budget?.toLocaleString()} BDT</strong>
//     </div>
//     <div className="deal-info-row">
//       <span>
//         <i className="fa-regular fa-calendar"></i> Deadline:
//       </span>
//       <strong>{selectedDeal.deadline} Days</strong>
//     </div>
//     {(selectedDeal.status === 'active' || selectedDeal.status === 'overdue') && (
//       <div className="deal-info-row">
//         <span>
//           <i className="fa-solid fa-clock"></i> Time Remaining:
//         </span>
//         <strong className="timer-display">{timeRemaining[selectedDeal.id] || 'Calculating...'}</strong>
//       </div>
//     )}
//     <div className="deal-info-row">
//       <span>
//         <i className="fa-solid fa-file-lines"></i> Details:
//       </span>
//       <p>{selectedDeal.details || 'No details provided'}</p>
//     </div>
//   </div>
// );