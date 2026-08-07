// src/pages/Settings/components/VolumeSlider.jsx
import React from 'react';

const VolumeSlider = ({ value, onChange, label = 'Volume', disabled = false }) => {
  return (
    <div className="volume-slider-wrapper">
      <div className="volume-slider-header">
        <span className="volume-label">{label}</span>
        <span className="volume-value">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value * 100}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        disabled={disabled}
        className="volume-slider"
        style={{
          width: '100%',
          height: '6px',
          borderRadius: '3px',
          background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${value * 100}%, var(--border-color) ${value * 100}%, var(--border-color) 100%)`,
          outline: 'none',
          transition: 'all 0.3s ease',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  );
};

export default VolumeSlider;