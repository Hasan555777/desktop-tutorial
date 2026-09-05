// src/pages/Settings/tabs/CertificationsTab.jsx

import React from 'react';
import styles from './CertificationsTab.module.css';

const CertificationsTab = ({ 
  certifications, 
  setCertifications, 
  isEditingCertifications, 
  setIsEditingCertifications,
  newCertification,
  setNewCertification,
  onAddCertification,
  onDeleteCertification
}) => {
  return (
    <div className={styles.settingsSection}>
      <h2><i className="fa-solid fa-award"></i> সার্টিফিকেশন</h2>
      <div className={styles.settingsForm}>
        {certifications.map(cert => (
          <div key={cert.id} className={styles.itemCard}>
            <div className={styles.itemHeader}>
              <h4>{cert.name}</h4>
              <button className={styles.deleteBtnSmall} onClick={() => onDeleteCertification(cert.id)}>
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
            <p className={styles.itemIssuer}>ইস্যুকারী: {cert.issuer}</p>
            <p className={styles.itemDate}>{cert.date}</p>
            {cert.link && <a href={cert.link} target="_blank" rel="noopener noreferrer" className={styles.certLink}>🔗 দেখুন</a>}
          </div>
        ))}
        
        {isEditingCertifications ? (
          <div className={styles.addForm}>
            <input type="text" placeholder="সার্টিফিকেশন নাম" value={newCertification.name} onChange={(e) => setNewCertification({...newCertification, name: e.target.value})} />
            <input type="text" placeholder="ইস্যুকারী" value={newCertification.issuer} onChange={(e) => setNewCertification({...newCertification, issuer: e.target.value})} />
            <input type="text" placeholder="তারিখ" value={newCertification.date} onChange={(e) => setNewCertification({...newCertification, date: e.target.value})} />
            <input type="url" placeholder="লিংক (ঐচ্ছিক)" value={newCertification.link} onChange={(e) => setNewCertification({...newCertification, link: e.target.value})} />
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setIsEditingCertifications(false)}>বাতিল</button>
              <button className={styles.saveBtn} onClick={onAddCertification}>যোগ করুন</button>
            </div>
          </div>
        ) : (
          <button className={styles.addBtn} onClick={() => setIsEditingCertifications(true)}>
            <i className="fa-solid fa-plus"></i> সার্টিফিকেশন যোগ করুন
          </button>
        )}
      </div>
    </div>
  );
};

export default CertificationsTab;