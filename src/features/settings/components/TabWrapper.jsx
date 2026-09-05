// src/pages/Settings/components/TabWrapper.jsx

import React from 'react';
import styles from './TabWrapper.module.css';

const TabWrapper = ({ title, icon, children }) => {
  return (
    <div className={styles.settingsSection}>
      <h2><i className={icon}></i> {title}</h2>
      <div className={styles.settingsForm}>
        {children}
      </div>
    </div>
  );
};

export default TabWrapper;