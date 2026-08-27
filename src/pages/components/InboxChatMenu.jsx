// // src/components/Inbox/InboxChatMenu.jsx

// import React, { useRef, useEffect } from 'react';

// export const InboxChatMenu = ({ 
//   chat, 
//   isOpen, 
//   onClose, 
//   onDelete, 
//   onBlock, 
//   onUnblock,
//   menuRef,
//   dotBtnRef 
// }) => {
//   // ✅ ক্লিক ইভেন্ট হ্যান্ডলার - বাইরে ক্লিক করলে বন্ধ হবে
//   useEffect(() => {
//     const handleClickOutside = (event) => {
//       if (
//         menuRef?.current && 
//         !menuRef.current.contains(event.target) &&
//         dotBtnRef?.current &&
//         !dotBtnRef.current.contains(event.target)
//       ) {
//         onClose?.();
//       }
//     };

//     if (isOpen) {
//       document.addEventListener('mousedown', handleClickOutside);
//       return () => {
//         document.removeEventListener('mousedown', handleClickOutside);
//       };
//     }
//   }, [isOpen, onClose, menuRef, dotBtnRef]);

//   // ✅ Escape key প্রেস করলে বন্ধ হবে
//   useEffect(() => {
//     const handleEscape = (event) => {
//       if (event.key === 'Escape') {
//         onClose?.();
//       }
//     };

//     if (isOpen) {
//       document.addEventListener('keydown', handleEscape);
//       return () => {
//         document.removeEventListener('keydown', handleEscape);
//       };
//     }
//   }, [isOpen, onClose]);

//   if (!isOpen) return null;

//   return (
//     <div 
//       className="chat-menu-dropdown" 
//       ref={menuRef}
//       onClick={(e) => e.stopPropagation()}
//       style={{ display: 'block' }}
//     >
//       {/* ✅ Delete Button */}
//       <button 
//         className={`chat-menu-item delete ${chat.isActiveDeal ? 'disabled' : ''}`}
//         onClick={(e) => {
//           e.stopPropagation();
//           e.preventDefault();
//           onDelete(chat);
//         }}
//         disabled={chat.isActiveDeal}
//         title={chat.isActiveDeal ? 'Cannot delete while active deal exists' : ''}
//       >
//         <i className="fa-solid fa-trash"></i>
//         <span>{chat.isActiveDeal ? 'Cannot Delete (Active Deal)' : 'Delete Conversation'}</span>
//       </button>
      
//       {/* ✅ Block/Unblock Button */}
//       {chat.isBlocked ? (
//         <button 
//           className="chat-menu-item unblock"
//           onClick={(e) => {
//             e.stopPropagation();
//             e.preventDefault();
//             onUnblock(chat);
//           }}
//           title="Unblock this user"
//         >
//           <i className="fa-solid fa-unlock"></i>
//           <span>Unblock User</span>
//         </button>
//       ) : (
//         <button 
//           className={`chat-menu-item block ${chat.isActiveDeal ? 'disabled' : ''}`}
//           onClick={(e) => {
//             e.stopPropagation();
//             e.preventDefault();
//             if (chat.isActiveDeal) {
//               // Active deal থাকলে ব্লক করা যাবে না
//               return;
//             }
//             onBlock(chat);
//           }}
//           disabled={chat.isActiveDeal}
//           title={chat.isActiveDeal ? 'Cannot block while active deal exists' : ''}
//         >
//           <i className="fa-solid fa-ban"></i>
//           <span>{chat.isActiveDeal ? 'Cannot Block (Active Deal)' : 'Block User'}</span>
//         </button>
//       )}
//     </div>
//   );
// };