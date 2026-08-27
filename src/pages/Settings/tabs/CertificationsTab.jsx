// src/pages/Settings/tabs/CertificationsTab.jsx
import React from 'react';

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
    <div className="settings-section">
      <h2><i className="fa-solid fa-award"></i> সার্টিফিকেশন</h2>
      <div className="settings-form">
        {certifications.map(cert => (
          <div key={cert.id} className="item-card">
            <div className="item-header">
              <h4>{cert.name}</h4>
              <button className="delete-btn-small" onClick={() => onDeleteCertification(cert.id)}>
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
            <p className="item-issuer">ইস্যুকারী: {cert.issuer}</p>
            <p className="item-date">{cert.date}</p>
            {cert.link && <a href={cert.link} target="_blank" rel="noopener noreferrer" className="cert-link">🔗 দেখুন</a>}
          </div>
        ))}
        
        {isEditingCertifications ? (
          <div className="add-form">
            <input type="text" placeholder="সার্টিফিকেশন নাম" value={newCertification.name} onChange={(e) => setNewCertification({...newCertification, name: e.target.value})} />
            <input type="text" placeholder="ইস্যুকারী" value={newCertification.issuer} onChange={(e) => setNewCertification({...newCertification, issuer: e.target.value})} />
            <input type="text" placeholder="তারিখ" value={newCertification.date} onChange={(e) => setNewCertification({...newCertification, date: e.target.value})} />
            <input type="url" placeholder="লিংক (ঐচ্ছিক)" value={newCertification.link} onChange={(e) => setNewCertification({...newCertification, link: e.target.value})} />
            <div className="form-actions">
              <button className="cancel-btn" onClick={() => setIsEditingCertifications(false)}>বাতিল</button>
              <button className="save-btn" onClick={onAddCertification}>যোগ করুন</button>
            </div>
          </div>
        ) : (
          <button className="add-btn" onClick={() => setIsEditingCertifications(true)}>
            <i className="fa-solid fa-plus"></i> সার্টিফিকেশন যোগ করুন
          </button>
        )}
      </div>
    </div>
  );
};

export default CertificationsTab;