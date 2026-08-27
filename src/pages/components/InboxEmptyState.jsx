// import React from 'react';

// export const InboxEmptyState = ({ loading, searchQuery, currentMode, filteredChats }) => {
//   if (loading) {
//     return (
//       <div className="loading-state">
//         <div className="loading-spinner"></div>
//         <p>Loading chats...</p>
//       </div>
//     );
//   }

//   if (filteredChats.length === 0) {
//     return (
//       <div className="no-chats-message">
//         <i className="fa-solid fa-inbox"></i>
//         <p>
//           {searchQuery ? 'No matching conversations found' : (
//             <>
//               {currentMode === 'all' && 'No chats yet'}
//               {currentMode === 'buyer' && 'No buyer chats'}
//               {currentMode === 'seller' && 'No seller chats'}
//             </>
//           )}
//         </p>
//       </div>
//     );
//   }

//   return null;
// };