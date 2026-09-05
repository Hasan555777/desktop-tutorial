// src/components/AnnouncementPopup/AnnouncementPopup.jsx

import React, { useState, useEffect } from 'react';
import { getTypeStyle } from '../../services/announcementTypes';
import styles from './AnnouncementPopup.module.css';

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
    <div className={styles.announcementOverlay} role="dialog" aria-modal="true">
      <div className={styles.announcementPopup}>
        <div className={styles.announcementIcon} style={{ background: style.bg, color: style.color }}>
          <i className={style.icon}></i>
        </div>

        <h2 className={styles.announcementTitle}>{announcement.title}</h2>
        <p className={styles.announcementMessage}>{announcement.message}</p>

        <div className={styles.announcementVersion}>
          <span>Version {announcement.version}</span>
          {announcement.category && (
            <span className={styles.announcementCategory}>{announcement.category}</span>
          )}
          <span className={styles.announcementTypeBadge} style={{ background: style.color }}>
            {announcement.type || 'info'}
          </span>
        </div>

        <div className={styles.announcementCheckbox}>
          <label>
            <input 
              type="checkbox" 
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>🔕 এই ঘোষণাটি আর দেখাবে না।</span>
          </label>
        </div>

        <button className={styles.announcementBtn} onClick={handleDismiss}>
          <i className="fa-solid fa-check"></i> OK
        </button>

        <div className={styles.announcementFooter}>
          <p>আপনি চাইলে পরবর্তী ঘোষণা আবার দেখতে পারবেন।</p>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementPopup;