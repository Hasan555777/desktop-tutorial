// // src/pages/Settings/tabs/DocumentsTab.jsx
// import React from 'react';

// const DocumentsTab = ({ 
//   docStatus, 
//   uploadingDocs, 
//   uploadProgress, 
//   onUploadDocuments 
// }) => {
//   return (
//     <div className="settings-section">
//       <h2><i className="fa-solid fa-file"></i> ডকুমেন্ট যাচাই</h2>
//       <div className="settings-form">
//         {docStatus.documentsUploaded ? (
//           <div className="info-box success">
//             <span className="info-icon">✅</span>
//             <div>
//               <strong>ডকুমেন্ট আপলোড সম্পন্ন!</strong>
//               <p>আপনার ডকুমেন্ট অ্যাডমিন দ্বারা যাচাই করা হচ্ছে।</p>
//             </div>
//           </div>
//         ) : (
//           <>
//             <div className="upload-row">
//               <div className="form-group">
//                 <label>NID কার্ড (সামনে) <span className="required">*</span></label>
//                 <div className="upload-area" id="nidFrontArea">
//                   <input type="file" id="nidFront" accept="image/*" />
//                   <div className="upload-default">
//                     <div className="upload-icon">🪪</div>
//                     <div className="upload-label">সামনের ছবি</div>
//                   </div>
//                 </div>
//               </div>
//               <div className="form-group">
//                 <label>NID কার্ড (পিছনে) <span className="required">*</span></label>
//                 <div className="upload-area" id="nidBackArea">
//                   <input type="file" id="nidBack" accept="image/*" />
//                   <div className="upload-default">
//                     <div className="upload-icon">🔄</div>
//                     <div className="upload-label">পিছনের ছবি</div>
//                   </div>
//                 </div>
//               </div>
//             </div>
            
//             <div className="form-group">
//               <label>জন্ম নিবন্ধন সনদ</label>
//               <div className="upload-area" id="birthArea">
//                 <input type="file" id="birthCert" accept="image/*,application/pdf" />
//                 <div className="upload-default">
//                   <div className="upload-icon">📄</div>
//                   <div className="upload-label">সনদের ছবি বা PDF</div>
//                 </div>
//               </div>
//             </div>
            
//             {uploadingDocs && (
//               <div className="upload-progress">
//                 <div className="progress-text">আপলোড হচ্ছে... {Math.round(uploadProgress)}%</div>
//                 <div className="progress-bar-small">
//                   <div className="progress-fill-small" style={{ width: `${uploadProgress}%` }}></div>
//                 </div>
//               </div>
//             )}
            
//             <button className="save-btn" onClick={onUploadDocuments} disabled={uploadingDocs}>
//               {uploadingDocs ? '⏳ আপলোড হচ্ছে...' : '📤 ডকুমেন্ট আপলোড করুন'}
//             </button>
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// export default DocumentsTab;