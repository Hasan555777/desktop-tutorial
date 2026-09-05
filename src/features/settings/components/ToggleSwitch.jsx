// src/pages/Settings/components/ToggleSwitch.jsx

import React from 'react';
import styles from './ToggleSwitch.module.css';

const ToggleSwitch = ({ checked, onChange, label, description = '', disabled = false }) => {
  // ✅ onChange ফাংশন সঠিকভাবে কল করুন
  const handleToggle = () => {
    if (!disabled && typeof onChange === 'function') {
      onChange(!checked);
    }
  };

  return (
    <div className={styles.toggleSwitchWrapper}>
      <div className={styles.toggleInfo}>
        <label className={styles.toggleLabel}>{label}</label>
        {description && <p className={styles.toggleDescription}>{description}</p>}
      </div>
      <div
        className={`${styles.toggleSwitch} ${checked ? styles.active : ''} ${disabled ? styles.disabled : ''}`}
        onClick={handleToggle}
      >
        <div className={styles.toggleSlider}></div>
      </div>
    </div>
  );
};

export default ToggleSwitch;