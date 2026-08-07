// src/components/UserStatus.jsx
import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import './UserStatus.css';

const UserStatus = ({ 
  userId, 
  showText = false, 
  size = 'medium',  // 'small', 'medium', 'large'
  showLastSeen = false,
  className = ''
}) => {
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [loading, setLoading] = useState(true);
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
          setIsOnline(data.isOnline === true);
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
      case 'small': return 'status-dot-small';
      case 'large': return 'status-dot-large';
      default: return 'status-dot-medium';
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
    <span 
      className={`status-loading ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px'
      }}
    >
      <span 
        className="status-dot status-dot-loading"
        style={{
          width: size === 'small' ? '8px' : size === 'large' ? '16px' : '12px',
          height: size === 'small' ? '8px' : size === 'large' ? '16px' : '12px',
          borderRadius: '50%',
          background: 'var(--bg-tertiary, #1a2332)',
          display: 'inline-block',
          animation: 'pulse 1.5s ease-in-out infinite'
        }}
      ></span>
      {showText && (
        <span 
          style={{
            color: 'var(--text-muted, #64748b)',
            fontSize: size === 'small' ? '10px' : size === 'large' ? '14px' : '12px',
            animation: 'pulse 1.5s ease-in-out infinite'
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
    <div className={`user-status-wrapper ${className}`}>
      <div className={`user-status-container ${isOnline ? 'online' : 'offline'}`}>
        {/* ডট */}
        <span 
          className={`status-dot ${getSizeClass()} ${isOnline ? 'online' : 'offline'}`}
          title={isOnline ? `${userName || 'User'} is Online` : `${userName || 'User'} is Offline`}
          aria-label={isOnline ? 'Online' : 'Offline'}
        ></span>
        
        {/* টেক্সট */}
        {showText && (
          <span className={`status-text ${isOnline ? 'online-text' : 'offline-text'}`}>
            {isOnline ? (
              <><i className="fa-solid fa-circle"></i> Online</>
            ) : (
              <><i className="fa-regular fa-circle"></i> Offline</>
            )}
          </span>
        )}
        
        {/* লাস্ট সিন - শুধু অফলাইন হলে */}
        {showLastSeen && !isOnline && lastSeen && (
          <span className="status-last-seen">
            <i className="fa-regular fa-clock"></i> {formatLastSeen(lastSeen)}
          </span>
        )}
      </div>
    </div>
  );
};

export default UserStatus;