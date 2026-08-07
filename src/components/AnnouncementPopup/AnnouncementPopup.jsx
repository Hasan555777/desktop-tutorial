// src/components/AnnouncementPopup/AnnouncementPopup.jsx

import React, { useState, useEffect } from 'react';
import { getTypeStyle } from '@/services/announcementTypes';
import './AnnouncementPopup.css';

const AnnouncementPopup = ({ 
  announcement, 
  showPopup, 
  loading,
  onDismiss,
  onDismissForever 
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // ✅ Reset checkbox when announcement changes
  useEffect(() => {
    setDontShowAgain(false);
  }, [announcement]);

  if (loading) return null;
  if (!showPopup || !announcement) return null;

  const style = getTypeStyle(announcement.type);

  const handleDismiss = () => {
    if (dontShowAgain) {
      onDismissForever?.();
    } else {
      onDismiss?.();
    }
  };

  return (
    <div className="announcement-overlay" role="dialog" aria-modal="true">
      <div className="announcement-popup">
        <div className="announcement-icon" style={{ background: style.bg, color: style.color }}>
          <i className={style.icon}></i>
        </div>

        <h2 className="announcement-title">{announcement.title}</h2>
        <p className="announcement-message">{announcement.message}</p>

        <div className="announcement-version">
          <span>Version {announcement.version}</span>
          {announcement.category && (
            <span className="announcement-category">{announcement.category}</span>
          )}
          <span className="announcement-type-badge" style={{ background: style.color }}>
            {announcement.type || 'info'}
          </span>
        </div>

        <div className="announcement-checkbox">
          <label>
            <input 
              type="checkbox" 
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>🔕 এই ঘোষণাটি আর দেখাবে না। </span>
          </label>
          
        </div>

        <button className="announcement-btn" onClick={handleDismiss}>
          <i className="fa-solid fa-check"></i> OK
        </button>

        <div className="announcement-footer">
          <p>আপনি চাইলে পরবর্তী ঘোষণা আবার দেখতে পারবেন।</p>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementPopup;