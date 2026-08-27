// src/components/NotificationBell/NotificationBell.jsx

import React, { useState, useRef, useEffect } from 'react';
import { useNotification } from '@/UI/Notification/NotificationProvider';
import NotificationDropdown from './NotificationDropdown';
import styles from './NotificationBell.module.css';

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount } = useNotification();
  const containerRef = useRef(null);

  // ✅ Click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ✅ Toggle dropdown
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={styles.notificationBellContainer} ref={containerRef}>
      {/* 🔔 Bell Icon */}
      <button 
        className={styles.notificationBellBtn} 
        onClick={toggleDropdown}
        aria-label="Notifications"
      >
        <i className="fa-solid fa-bell"></i>
        {unreadCount > 0 && (
          <span className={styles.notificationBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* 📋 Dropdown - শুধু open হলে mount হবে */}
      {isOpen && (
        <NotificationDropdown 
          onClose={() => setIsOpen(false)}
          isOpen={isOpen}
        />
      )}
    </div>
  );
};

export default NotificationBell;