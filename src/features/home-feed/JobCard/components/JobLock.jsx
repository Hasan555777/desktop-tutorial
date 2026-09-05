// src/pages/JobCard/components/JobLock.jsx

import React from 'react';
import styles from './JobLock.module.css';

const JobLock = ({ 
  post, 
  isBusy = false, 
  isDealActive = false,
  showBadge = true,
  showButton = true,
  className = '',
  onToggle,
  isToggling = false,
  currentMode = 'buyer' // 'buyer' | 'seller'
}) => {
  // ── স্ট্যাটাস চেক ──
  const isLocked = isBusy || isDealActive;
  
  // ── টেক্সট জেনারেট ──
  const getStatusText = () => {
    if (isBusy) return '🔒 Seller is currently Busy';
    if (isDealActive) return '🔒 Deal is Active';
    return '🟢 Available';
  };

  const getButtonLabel = () => {
    if (currentMode === 'seller') {
      return isBusy ? '🔓 Available' : '🔒 Busy';
    } else {
      return isDealActive ? '🔓 Close Deal' : '🔒 Activate Deal';
    }
  };

  const getButtonIcon = () => {
    if (currentMode === 'seller') {
      return isBusy ? 'fa-unlock' : 'fa-lock';
    } else {
      return isDealActive ? 'fa-door-open' : 'fa-handshake';
    }
  };

  const getButtonTitle = () => {
    if (currentMode === 'seller') {
      return isBusy ? 'Mark as Available' : 'Mark as Busy';
    } else {
      return isDealActive ? 'Close Deal' : 'Activate Deal';
    }
  };

  const getBadgeClass = () => {
    if (isBusy) return `${styles.jobLockBadge} ${styles.busy}`;
    if (isDealActive) return `${styles.jobLockBadge} ${styles.dealActive}`;
    return `${styles.jobLockBadge} ${styles.available}`;
  };

  // ── টগল হ্যান্ডলার ──
  const handleToggle = () => {
    if (onToggle && typeof onToggle === 'function') {
      onToggle(!isLocked);
    }
  };

  return (
    <div className={`${styles.jobLockContainer} ${className}`}>
      {/* ── ব্যাজ ── */}
      {showBadge && isLocked && (
        <div className={getBadgeClass()}>
          <i className={`fa-solid ${isBusy ? 'fa-clock' : 'fa-handshake'}`}></i>
          {getStatusText()}
        </div>
      )}

      {/* ── লকড স্টেটাস ইনফো ── */}
      {isLocked && (
        <div className={styles.jobLockInfo}>
          <i className="fa-solid fa-info-circle"></i>
          <span>
            {isBusy 
              ? 'This seller is currently busy with other projects' 
              : 'This deal is currently active'}
          </span>
        </div>
      )}
    </div>
  );
};

export default JobLock;