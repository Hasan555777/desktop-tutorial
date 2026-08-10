// // src/pages/Settings/tabs/SoundTab.jsx

// import React, { useState, useRef, useEffect } from 'react';
// import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
// import { useSound } from '@/UI/Sound';
// import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
// import './SoundTab.css';

// // ✅ লোকাল স্টোরেজ কী
// const SOUND_SETTINGS_KEY = 'workhub_sound_settings';

// const SoundTab = () => {
//   const feedback = useFeedback();
//   const sound = useSound();
  
//   // ── States ──
//   const [isTesting, setIsTesting] = useState(false);
//   const [testSoundType, setTestSoundType] = useState('notification');
//   const volumeRef = useRef(null);
//   const [isLoading, setIsLoading] = useState(true);

//   // ── Sound Settings State ──
//   const [soundSettings, setSoundSettings] = useState({
//     enabled: true,
//     volume: 0.8,
//     muted: false,
//     chat: true,
//     wallet: true,
//     notification: true,
//     admin: true,
//     offer: true,
//     deal: true,
//     verification: true,
//     review: true,
//     system: true,
//     click: true,
//   });

//   // ── Load sound settings from localStorage ──
//   useEffect(() => {
//     const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
//     if (saved) {
//       try {
//         const parsed = JSON.parse(saved);
//         setSoundSettings(prev => ({ ...prev, ...parsed }));
//         // ✅ Apply to sound engine
//         if (sound?.setMuted) sound.setMuted(parsed.muted || false);
//         if (sound?.setVolume) sound.setVolume(parsed.volume || 0.8);
//       } catch (e) {
//         console.error('Error loading sound settings from localStorage:', e);
//       }
//     }
//     setIsLoading(false);
//   }, [sound]);

//   // ── Save settings to localStorage and apply ──
//   const saveSettings = (newSettings) => {
//     localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(newSettings));
//     setSoundSettings(newSettings);
//   };

//   // ── Update a single setting ──
//   const handleSoundUpdate = (key, value) => {
//     const newSettings = { ...soundSettings, [key]: value };
//     saveSettings(newSettings);

//     // ✅ Apply to sound engine
//     if (key === 'enabled') {
//       // If enabled is false, mute all
//       if (sound?.setMuted) sound.setMuted(!value);
//     }
//     if (key === 'muted') {
//       if (sound?.setMuted) sound.setMuted(value);
//     }
//     if (key === 'volume') {
//       if (sound?.setVolume) sound.setVolume(value);
//     }

//     // ✅ Play test sound if enabling
//     if (key === 'enabled' && value === true) {
//       setTimeout(() => {
//         sound?.playEvent(SOUND_EVENTS.SUCCESS);
//       }, 300);
//     }
//   };

//   // ── Update volume ──
//   const handleVolumeUpdate = (value) => {
//     const newSettings = { ...soundSettings, volume: value };
//     saveSettings(newSettings);
//     if (sound?.setVolume) sound.setVolume(value);
//   };

//   // ── Reset to default ──
//   const handleResetSound = async () => {
//     const confirmed = await feedback.confirm({
//       title: 'Reset Sound Settings',
//       message: 'Are you sure you want to reset all sound settings to default?',
//       variant: 'confirm',
//       confirmText: 'Yes, Reset',
//       cancelText: 'Cancel',
//     });

//     if (!confirmed) return;

//     const defaultSettings = {
//       enabled: true,
//       volume: 0.8,
//       muted: false,
//       chat: true,
//       wallet: true,
//       notification: true,
//       admin: true,
//       offer: true,
//       deal: true,
//       verification: true,
//       review: true,
//       system: true,
//       click: true,
//     };

//     saveSettings(defaultSettings);

//     // ✅ Apply to sound engine
//     if (sound?.setMuted) sound.setMuted(false);
//     if (sound?.setVolume) sound.setVolume(0.8);
    
//     // ✅ Play test sound
//     setTimeout(() => {
//       sound?.playEvent(SOUND_EVENTS.SUCCESS);
//     }, 300);

//     feedback.showSuccess('✅ সাউন্ড রিসেট', 'সব সাউন্ড সেটিংস ডিফল্টে রিসেট করা হয়েছে!');
//   };

//   // ── Test Sound ──
//   const handleTestSound = (type = 'notification') => {
//     if (isTesting) return;
    
//     if (soundSettings.muted || !soundSettings.enabled) {
//       feedback.showWarning('⚠️ সাউন্ড বন্ধ', 'সাউন্ড টেস্ট করতে প্রথমে সাউন্ড চালু করুন।');
//       return;
//     }

//     setIsTesting(true);
//     setTestSoundType(type);
    
//     try {
//       const soundMap = {
//         notification: SOUND_EVENTS.NOTIFICATION,
//         success: SOUND_EVENTS.SUCCESS,
//         warning: SOUND_EVENTS.WARNING,
//         error: SOUND_EVENTS.ERROR,
//         chat: SOUND_EVENTS.CHAT_MESSAGE,
//         wallet: SOUND_EVENTS.WALLET,
//         admin: SOUND_EVENTS.ADMIN_NOTIFICATION,
//         offer: SOUND_EVENTS.OFFER,
//         deal: SOUND_EVENTS.DEAL,
//         click: SOUND_EVENTS.CLICK,
//       };

//       const event = soundMap[type] || SOUND_EVENTS.NOTIFICATION;
      
//       const categoryMap = {
//         notification: 'notification',
//         success: 'notification',
//         warning: 'notification',
//         error: 'notification',
//         chat: 'chat',
//         wallet: 'wallet',
//         admin: 'admin',
//         offer: 'offer',
//         deal: 'deal',
//         click: 'click',
//       };
      
//       const category = categoryMap[type] || 'notification';
      
//       if (!soundSettings[category]) {
//         feedback.showWarning('⚠️ সাউন্ড বন্ধ', `"${category}" ক্যাটাগরির সাউন্ড বন্ধ আছে।`);
//         setIsTesting(false);
//         return;
//       }

//       if (soundSettings.volume === 0) {
//         feedback.showWarning('⚠️ ভলিউম শূন্য', 'ভলিউম বাড়িয়ে আবার চেষ্টা করুন।');
//         setIsTesting(false);
//         return;
//       }

//       if (sound?.playEvent) {
//         sound.setVolume(soundSettings.volume);
//         sound.playEvent(event);
//         feedback.showSuccess('🔊 টেস্ট সাউন্ড', `${type} সাউন্ড বাজানো হচ্ছে...`);
//       } else {
//         feedback.showError('❌ সাউন্ড এরর', 'সাউন্ড সিস্টেম কাজ করছে না।');
//       }
      
//     } catch (error) {
//       console.error('Test sound error:', error);
//       feedback.showError('❌ টেস্ট ব্যর্থ', 'সাউন্ড টেস্ট করতে সমস্যা হয়েছে।');
//     } finally {
//       setTimeout(() => {
//         setIsTesting(false);
//       }, 1000);
//     }
//   };

//   // ── Toggle Switch Component ──
//   const ToggleSwitch = ({ checked, onChange, label, description, disabled = false }) => (
//     <div className="toggle-item">
//       <div className="toggle-info">
//         <span className="toggle-label">{label}</span>
//         {description && <span className="toggle-description">{description}</span>}
//       </div>
//       <button
//         className={`toggle-switch ${checked ? 'active' : ''}`}
//         onClick={() => onChange(!checked)}
//         disabled={disabled}
//         role="switch"
//         aria-checked={checked}
//       >
//         <span className="toggle-slider"></span>
//         <span className="toggle-status">{checked ? 'চালু' : 'বন্ধ'}</span>
//       </button>
//     </div>
//   );

//   // ── Sound Category Component ──
//   const SoundCategory = ({ icon, label, categoryKey, description }) => {
//     const isChecked = soundSettings?.[categoryKey] !== false;
    
//     return (
//       <div className="sound-category">
//         <div className="category-icon">{icon}</div>
//         <div className="category-info">
//           <span className="category-name">{label}</span>
//           <span className="category-desc">{description}</span>
//         </div>
//         <ToggleSwitch
//           checked={isChecked}
//           onChange={(value) => handleSoundUpdate(categoryKey, value)}
//         />
//       </div>
//     );
//   };

//   // ── Loading State ──
//   if (isLoading) {
//     return (
//       <div className="sound-tab-loading">
//         <div className="loading-spinner"></div>
//         <p>সাউন্ড সেটিংস লোড হচ্ছে...</p>
//       </div>
//     );
//   }

//   return (
//     <div className="sound-tab">
//       {/* ── Header ── */}
//       <div className="sound-tab-header">
//         <h2>
//           <i className="fa-solid fa-volume-high"></i>
//           নোটিফিকেশন সাউন্ড
//         </h2>
//         <p className="header-subtitle">
//           আপনার পছন্দ অনুযায়ী সাউন্ড সেটিংস কাস্টমাইজ করুন
//         </p>
//       </div>

//       {/* ── Master Controls ── */}
//       <div className="sound-master-controls">
//         <div className="master-toggle">
//           <div className="master-info">
//             <span className="master-icon">
//               <i className={`fa-solid ${soundSettings.enabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
//             </span>
//             <div className="master-text">
//               <h4>সাউন্ড চালু/বন্ধ</h4>
//               <p>সব সাউন্ড একসাথে চালু বা বন্ধ করুন</p>
//             </div>
//           </div>
//           <ToggleSwitch
//             checked={soundSettings.enabled !== false}
//             onChange={(value) => handleSoundUpdate('enabled', value)}
//           />
//         </div>

//         {/* ── Master Mute ── */}
//         <div className="master-mute">
//           <div className="master-info">
//             <span className="master-icon">
//               <i className={`fa-solid ${soundSettings.muted ? 'fa-volume-xmark' : 'fa-volume-low'}`}></i>
//             </span>
//             <div className="master-text">
//               <h4>মিউট</h4>
//               <p>সব সাউন্ড মিউট করুন (ভলিউম ০)</p>
//             </div>
//           </div>
//           <ToggleSwitch
//             checked={soundSettings.muted === true}
//             onChange={(value) => handleSoundUpdate('muted', value)}
//           />
//         </div>
//       </div>

//       {/* ── Volume Control ── */}
//       <div className="volume-control">
//         <div className="volume-header">
//           <span className="volume-label">
//             <i className="fa-solid fa-sliders"></i>
//             ভলিউম
//           </span>
//           <span className="volume-value">{Math.round(soundSettings.volume * 100)}%</span>
//         </div>
//         <input
//           ref={volumeRef}
//           type="range"
//           min="0"
//           max="1"
//           step="0.01"
//           value={soundSettings.volume}
//           onChange={(e) => handleVolumeUpdate(parseFloat(e.target.value))}
//           className="volume-slider-main"
//           disabled={soundSettings.muted || !soundSettings.enabled}
//           style={{
//             background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${soundSettings.volume * 100}%, var(--bg-tertiary) ${soundSettings.volume * 100}%, var(--bg-tertiary) 100%)`
//           }}
//         />
//         <div className="volume-marks">
//           <span>০%</span>
//           <span>৫০%</span>
//           <span>১০০%</span>
//         </div>
//       </div>

//       {/* ── Sound Categories ── */}
//       <div className="sound-categories">
//         <h3 className="categories-title">
//           <i className="fa-solid fa-list"></i>
//           সাউন্ড ক্যাটাগরি
//         </h3>
//         <p className="categories-subtitle">প্রতিটি ক্যাটাগরির সাউন্ড আলাদাভাবে চালু/বন্ধ করুন</p>

//         <div className="categories-grid">
//           <SoundCategory
//             icon="💬"
//             label="চ্যাট"
//             categoryKey="chat"
//             description="নতুন মেসেজ, ইমেজ, প্রপোজাল"
//           />
//           <SoundCategory
//             icon="🤝"
//             label="ডিল"
//             categoryKey="deal"
//             description="ডিল তৈরি, কনফার্ম, কমপ্লিট"
//           />
//           <SoundCategory
//             icon="💰"
//             label="ওয়ালেট"
//             categoryKey="wallet"
//             description="ডিপোজিট, উইথড্র, পেমেন্ট"
//           />
//           <SoundCategory
//             icon="🔔"
//             label="নোটিফিকেশন"
//             categoryKey="notification"
//             description="সাধারণ নোটিফিকেশন"
//           />
//           <SoundCategory
//             icon="📢"
//             label="অ্যাডমিন"
//             categoryKey="admin"
//             description="অ্যাডমিন ঘোষণা ও নোটিফিকেশন"
//           />
//           <SoundCategory
//             icon="📄"
//             label="অফার"
//             categoryKey="offer"
//             description="নতুন অফার ও প্রপোজাল"
//           />
//           <SoundCategory
//             icon="✅"
//             label="ভেরিফিকেশন"
//             categoryKey="verification"
//             description="যাচাই সফল/ব্যর্থ"
//           />
//           <SoundCategory
//             icon="⭐"
//             label="রিভিউ"
//             categoryKey="review"
//             description="নতুন রিভিউ"
//           />
//           <SoundCategory
//             icon="🖱️"
//             label="ক্লিক"
//             categoryKey="click"
//             description="বাটন ক্লিক সাউন্ড"
//           />
//           <SoundCategory
//             icon="⚙️"
//             label="সিস্টেম"
//             categoryKey="system"
//             description="সিস্টেম আপডেট ও এরর"
//           />
//         </div>
//       </div>



//       {/* ── Reset Button ── */}
//       <div className="sound-reset">
//         <button className="reset-btn" onClick={handleResetSound}>
//           <i className="fa-solid fa-rotate"></i>
//           ডিফল্ট সেটিংস রিসেট করুন
//         </button>
//         <p className="reset-note">সব সাউন্ড সেটিংস ডিফল্টে ফিরিয়ে আনবে</p>
//       </div>

//       {/* ── Sound Status Bar ── */}

//     </div>
//   );
// };

// export default SoundTab;