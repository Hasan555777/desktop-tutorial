// src/pages/Settings/components/ToggleSwitch.jsx

import React from 'react';

const ToggleSwitch = ({ checked, onChange, label, description = '', disabled = false }) => {
  // ✅ onChange ফাংশন সঠিকভাবে কল করুন
  const handleToggle = () => {
    if (!disabled && typeof onChange === 'function') {
      onChange(!checked);
    }
  };

  return (
    <div className="toggle-switch-wrapper">
      <div className="toggle-info">
        <label className="toggle-label">{label}</label>
        {description && <p className="toggle-description">{description}</p>}
      </div>
      <div
        className={`toggle-switch ${checked ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleToggle}
      >
        <div className="toggle-slider"></div>
      </div>
    </div>
  );
};

export default ToggleSwitch;