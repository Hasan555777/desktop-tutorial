// src/components/UserStatus.jsx

import React, { useState, useEffect } from 'react';
import { usePageLoadingBar } from '../../shared/ui/LoadingBar/usePageLoadingBar';
import { db } from '../../shared/firebase/index';
import { doc, onSnapshot } from 'firebase/firestore';
import { getEffectiveOnlineStatus, ONLINE_HEARTBEAT_MS } from './utils/presence';
import styles from './UserStatus.module.css';

const UserStatus = ({ 
  userId, 
  showText = false, 
  size = 'medium',  // 'small', 'medium', 'large'
  showLastSeen = false,
  className = ''
}) => {
  const [isOnline, setIsOnline] = useState(false);
  const [rawOnline, setRawOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [loading, setLoading] = useState(true);
  usePageLoadingBar(loading);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(
      userRef, 
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setRawOnline(data.isOnline === true);
          setIsOnline(getEffectiveOnlineStatus(data.isOnline, data.lastSeen));
          setLastSeen(data.lastSeen || null);
          setUserName(data.displayName || data.name || '');
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error tracking user status:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // 🔧 FIX (always-online bug): re-derive on a timer too
  useEffect(() => {
    const interval = setInterval(() => {
      setIsOnline(getEffectiveOnlineStatus(rawOnline, lastSeen));
    }, ONLINE_HEARTBEAT_MS / 2);
    return () => clearInterval(interval);
  }, [rawOnline, lastSeen]);

  // ============================================================
  // ✅ লাস্ট সিন ফরম্যাট
  // ============================================================
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Recently';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
      if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
      
      return date.toLocaleDateString();
    } catch (error) {
      return 'Recently';
    }
  };

  // ============================================================
  // ✅ সাইজ ক্লাস
  // ============================================================
  const getSizeClass = () => {
    switch(size) {
      case 'small': return styles.statusDotSmall;
      case 'large': return styles.statusDotLarge;
      default: return styles.statusDotMedium;
    }
  };

  // ============================================================
  // ✅ স্ট্যাটাস টেক্সট
  // ============================================================
  const getStatusText = () => {
    if (isOnline) return 'Online';
    if (lastSeen) return `Last seen ${formatLastSeen(lastSeen)}`;
    return 'Offline';
  };

  // ============================================================
  // ✅ লোডিং স্টেট
  // ============================================================
  if (loading) {
    return (
      <span className={`${styles.statusLoading} ${className}`}>
        <span 
          className={`${styles.statusDot} ${styles.statusDotLoading}`}
          style={{
            width: size === 'small' ? '8px' : size === 'large' ? '16px' : '12px',
            height: size === 'small' ? '8px' : size === 'large' ? '16px' : '12px',
          }}
        ></span>
        {showText && (
          <span 
            className={styles.statusLoadingText}
            style={{
              fontSize: size === 'small' ? '10px' : size === 'large' ? '14px' : '12px',
            }}
          >
            Loading...
          </span>
        )}
      </span>
    );
  }

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className={`${styles.userStatusWrapper} ${className}`}>
      <div className={`${styles.userStatusContainer} ${isOnline ? styles.online : styles.offline}`}>
        {/* ডট */}
        <span 
          className={`${styles.statusDot} ${getSizeClass()} ${isOnline ? styles.online : styles.offline}`}
          title={isOnline ? `${userName || 'User'} is Online` : `${userName || 'User'} is Offline`}
          aria-label={isOnline ? 'Online' : 'Offline'}
        ></span>
        
        {/* টেক্সট */}
        {showText && (
          <span className={`${styles.statusText} ${isOnline ? styles.onlineText : styles.offlineText}`}>
            {isOnline ? (
              <><i className="fa-solid fa-circle"></i> Online</>
            ) : (
              <><i className="fa-regular fa-circle"></i> Offline</>
            )}
          </span>
        )}
        
        {/* লাস্ট সিন - শুধু অফলাইন হলে */}
        {showLastSeen && !isOnline && lastSeen && (
          <span className={styles.statusLastSeen}>
            <i className="fa-regular fa-clock"></i> {formatLastSeen(lastSeen)}
          </span>
        )}
      </div>
    </div>
  );
};

export default UserStatus;