// // src/pages/Settings/tabs/FaceVerificationTab.jsx
// import React from 'react';

// const FaceVerificationTab = ({ 
//   docStatus, 
//   faceVerified, 
//   camStream, 
//   livenessState, 
//   livenessComplete,
//   onStartCamera,
//   onStopCamera,
//   onCapturePhoto,
//   videoRef,
//   canvasRef
// }) => {
//   return (
//     <div className="settings-section">
//       <h2><i className="fa-solid fa-camera"></i> মুখমণ্ডল যাচাই</h2>
//       <div className="settings-form">
//         {docStatus.faceVerified ? (
//           <div className="info-box success">
//             <span className="info-icon">✅</span>
//             <div>
//               <strong>মুখমণ্ডল যাচাই সম্পন্ন!</strong>
//               <p>আপনার ফেস ভেরিফিকেশন সফলভাবে সম্পন্ন হয়েছে।</p>
//             </div>
//           </div>
//         ) : (
//           <>
//             <div className="liveness-instructions">
//               {livenessState.map((step) => (
//                 <div key={step.id} className={`instruction-step ${step.done ? 'done' : ''}`}>
//                   <div className="inst-text">{step.label}</div>
//                   <div className="inst-status">{step.done ? '✅' : '⬜'}</div>
//                 </div>
//               ))}
//             </div>
            
//             <div className="camera-box" id="cameraBox">
//               <video 
//                 ref={videoRef} 
//                 autoPlay 
//                 muted 
//                 playsInline
//                 style={{ 
//                   display: camStream ? 'block' : 'none',
//                   width: '100%',
//                   maxHeight: '400px',
//                   objectFit: 'cover',
//                   borderRadius: '12px',
//                   background: '#000'
//                 }}
//               />
//               <canvas ref={canvasRef} style={{ display: 'none' }} />
//               {!camStream && (
//                 <div className="camera-placeholder">
//                   <span>📷</span>
//                   <div>ক্যামেরা চালু করুন</div>
//                 </div>
//               )}
//             </div>
            
//             <div className="liveness-progress">
//               <div className="progress-text" id="livenessProgressText">০/৬ সম্পন্ন</div>
//               <div className="progress-bar-small">
//                 <div className="progress-fill-small" id="livenessProgressFill" style={{ width: '0%' }}></div>
//               </div>
//             </div>
            
//             <div className="btn-row">
//               <button 
//                 className="btn btn-ghost" 
//                 id="camStartBtn" 
//                 onClick={onStartCamera}
//                 disabled={!!camStream}
//               >
//                 📷 ক্যামেরা চালু
//               </button>
//               <button 
//                 className="btn btn-primary" 
//                 id="captureBtn" 
//                 onClick={onCapturePhoto} 
//                 style={{ display: 'none' }}
//                 disabled={!livenessComplete}
//               >
//                 📸 ছবি তুলুন
//               </button>
//               <button 
//                 className="btn btn-danger" 
//                 id="camStopBtn" 
//                 onClick={onStopCamera} 
//                 style={{ display: 'none' }}
//               >
//                 ⏹ বন্ধ
//               </button>
//             </div>
//           </>
//         )}
//       </div>
//     </div>
//   );
// };

// export default FaceVerificationTab;