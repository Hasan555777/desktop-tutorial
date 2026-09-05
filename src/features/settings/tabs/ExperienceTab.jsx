// src/pages/Settings/tabs/ExperienceTab.jsx

import React from 'react';
import styles from './ExperienceTab.module.css';

const ExperienceTab = ({ 
  experience, 
  setExperience, 
  isEditingExperience, 
  setIsEditingExperience,
  newExperience,
  setNewExperience,
  onAddExperience,
  onDeleteExperience
}) => {
  return (
    <div className={styles.settingsSection}>
      <h2><i className="fa-solid fa-briefcase"></i> অভিজ্ঞতা</h2>
      <div className={styles.settingsForm}>
        {experience.map(exp => (
          <div key={exp.id} className={styles.itemCard}>
            <div className={styles.itemHeader}>
              <h4>{exp.role} - {exp.company}</h4>
              <button className={styles.deleteBtnSmall} onClick={() => onDeleteExperience(exp.id)}>
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
            <p className={styles.itemDate}>{exp.startDate} - {exp.endDate || 'বর্তমান'}</p>
            <p className={styles.itemDescription}>{exp.description}</p>
          </div>
        ))}
        
        {isEditingExperience ? (
          <div className={styles.addForm}>
            <input type="text" placeholder="কোম্পানি" value={newExperience.company} onChange={(e) => setNewExperience({...newExperience, company: e.target.value})} />
            <input type="text" placeholder="পদবি" value={newExperience.role} onChange={(e) => setNewExperience({...newExperience, role: e.target.value})} />
            <div className={styles.formRow}>
              <input type="text" placeholder="শুরুর তারিখ" value={newExperience.startDate} onChange={(e) => setNewExperience({...newExperience, startDate: e.target.value})} />
              <input type="text" placeholder="শেষ তারিখ (বা Present)" value={newExperience.endDate} onChange={(e) => setNewExperience({...newExperience, endDate: e.target.value})} />
            </div>
            <textarea placeholder="বর্ণনা" value={newExperience.description} onChange={(e) => setNewExperience({...newExperience, description: e.target.value})} rows="2" />
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setIsEditingExperience(false)}>বাতিল</button>
              <button className={styles.saveBtn} onClick={onAddExperience}>যোগ করুন</button>
            </div>
          </div>
        ) : (
          <button className={styles.addBtn} onClick={() => setIsEditingExperience(true)}>
            <i className="fa-solid fa-plus"></i> অভিজ্ঞতা যোগ করুন
          </button>
        )}
      </div>
    </div>
  );
};

export default ExperienceTab;