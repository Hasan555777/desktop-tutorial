// src/pages/Settings/components/VolumeSlider.jsx

import React from 'react';
import styles from './VolumeSlider.module.css';

const VolumeSlider = ({ value, onChange, label = 'Volume', disabled = false }) => {
  return (
    <div className={styles.volumeSliderWrapper}>
      <div className={styles.volumeSliderHeader}>
        <span className={styles.volumeLabel}>{label}</span>
        <span className={styles.volumeValue}>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        disabled={disabled}
        className={styles.volumeSlider}
        style={{
          background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${value * 100}%, var(--border-color) ${value * 100}%, var(--border-color) 100%)`,
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  );
};

export default VolumeSlider;