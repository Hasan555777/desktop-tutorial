// src/pages/Settings/components/TabWrapper.jsx
import React from 'react';

const TabWrapper = ({ title, icon, children }) => {
  return (
    <div className="settings-section">
      <h2><i className={icon}></i> {title}</h2>
      <div className="settings-form">
        {children}
      </div>
    </div>
  );
};

export default TabWrapper;