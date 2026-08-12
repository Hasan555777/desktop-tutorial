// import React from 'react';

// export const ModeSwitcher = ({ currentMode, handleModeChange, pendingCount, showCancelledDeals, setShowCancelledDeals, cancelledCount }) => (
//   <div className="deal-mode-switcher">
//     <button className={`mode-switch-button ${currentMode === 'buyer' ? 'active' : ''}`} onClick={() => handleModeChange('buyer')}>
//       <i className="fa-solid fa-briefcase"></i> Buyer Mode
//       {pendingCount > 0 && currentMode === 'buyer' && <span className="mode-badge-count">{pendingCount}</span>}
//     </button>
//     <button className={`mode-switch-button ${currentMode === 'seller' ? 'active' : ''}`} onClick={() => handleModeChange('seller')}>
//       <i className="fa-solid fa-laptop-code"></i> Seller Mode
//       {pendingCount > 0 && currentMode === 'seller' && <span className="mode-badge-count">{pendingCount}</span>}
//     </button>

//     <button
//       className={`mode-switch-button ${showCancelledDeals ? 'active cancelled-active' : 'cancelled-btn'}`}
//       onClick={() => setShowCancelledDeals(!showCancelledDeals)}
//     >
//       <i className="fa-solid fa-ban"></i> Cancelled ({cancelledCount})
//     </button>
//   </div>
// );

// export const DealsStats = ({ totalDeals, pendingCount, activeCount, overdueCount, completedCount, cancelledCount }) => (
//   <div className="deals-stats">
//     <span className="stat-items total">📊 Total: {totalDeals}</span>
//     <span className="stat-items pending">⏳ Pending: {pendingCount}</span>
//     <span className="stat-items active">⚡ Active: {activeCount}</span>
//     <span className="stat-items overdue">🔴 Overdue: {overdueCount}</span>
//     <span className="stat-items completed">✅ Completed: {completedCount}</span>
//     <span className="stat-items cancelled">❌ Cancelled: {cancelledCount}</span>
//   </div>
// );

// const DealsList = ({ showCancelledDeals, cancelledDeals, activeDeals, currentMode, navigate, timeRemaining }) => (
//   <div className="deals-list">
//     {showCancelledDeals ? (
//       cancelledDeals.length === 0 ? (
//         <div className="no-deal-selected">
//           <i className="fa-solid fa-check-circle"></i>
//           <p>No cancelled deals</p>
//         </div>
//       ) : (
//         cancelledDeals.map((deal) => (
//           <div key={deal.id} className="deal-list-item cancelled" onClick={() => navigate(`/deal-manager?dealId=${deal.id}`)}>
//             <div className="deal-list-info">
//               <h4>
//                 {deal.postTitle || 'Untitled Deal'}
//                 <span className="deal-id-badge">#{deal.dealIdNumber || deal.id?.slice(-8)}</span>
//               </h4>
//               <p className="deal-partner cancelled">
//                 <i className="fa-solid fa-user"></i>
//                 {currentMode === 'buyer' ? 'Seller' : 'Buyer'}:{' '}
//                 <strong>
//                   {currentMode === 'buyer' ? deal.sellerName || deal.sellerDisplayName || 'Unknown Seller' : deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer'}
//                 </strong>
//               </p>
//               <p>
//                 <i className="fa-solid fa-ban" style={{ color: '#ef4444' }}></i>
//                 {deal.cancellationReason || 'No reason provided'}
//               </p>
//               <p className="deal-cancelled-date">
//                 <i className="fa-regular fa-calendar"></i>
//                 {deal.cancelledAt ? new Date(deal.cancelledAt).toLocaleDateString() : 'Unknown'}
//               </p>
//             </div>
//             <div className="deal-list-status">
//               <span className="status-badge cancelled">❌ Cancelled</span>
//             </div>
//           </div>
//         ))
//       )
//     ) : activeDeals.length === 0 ? (
//       <div className="no-deal-selected">
//         <i className="fa-solid fa-folder-open"></i>
//         <p>You don't have any {currentMode === 'buyer' ? 'buyer' : 'seller'} deals yet.</p>
//       </div>
//     ) : (
//       activeDeals.map((deal) => (
//         <div key={deal.id} className="deal-list-item" onClick={() => navigate(`/deal-manager?dealId=${deal.id}`)}>
//           <div className="deal-list-info">
//             <h4>
//               {deal.postTitle || 'Untitled Deal'}
//               <span className="deal-id-badge">#{deal.dealIdNumber || deal.id?.slice(-8)}</span>
//             </h4>
//             <p className="deal-partner">
//               <i className="fa-solid fa-user"></i>
//               {currentMode === 'buyer' ? 'Seller' : 'Buyer'}:{' '}
//               <strong>
//                 {currentMode === 'buyer' ? deal.sellerName || deal.sellerDisplayName || 'Unknown Seller' : deal.buyerName || deal.buyerDisplayName || 'Unknown Buyer'}
//               </strong>
//             </p>
//             <p>Budget: {deal.budget?.toLocaleString()} BDT</p>
//             {(deal.status === 'active' || deal.status === 'overdue') && timeRemaining[deal.id] && (
//               <p className="deal-timer">
//                 <i className="fa-solid fa-clock"></i> {timeRemaining[deal.id]}
//               </p>
//             )}
//           </div>
//           <div className="deal-list-status">
//             <span className={`status-badge ${deal.status}`}>
//               {deal.status === 'pending' && '⏳ Pending'}
//               {deal.status === 'active' && '⚡ Active'}
//               {deal.status === 'overdue' && '🔴 Overdue'}
//               {deal.status === 'completed' && '✅ Completed'}
//             </span>
//           </div>
//         </div>
//       ))
//     )}
//   </div>
// );

// export default DealsList;