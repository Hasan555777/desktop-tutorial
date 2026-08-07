// src/pages/Settings/tabs/EducationTab.jsx
import React from 'react';

const EducationTab = ({ 
  education, 
  setEducation, 
  isEditingEducation, 
  setIsEditingEducation,
  newEducation,
  setNewEducation,
  onAddEducation,
  onDeleteEducation
}) => {
  return (
    <div className="settings-section">
      <h2><i className="fa-solid fa-graduation-cap"></i> শিক্ষা</h2>
      <div className="settings-form">
        {education.map(edu => (
          <div key={edu.id} className="item-card">
            <div className="item-header">
              <h4>{edu.degree} - {edu.field}</h4>
              <button className="delete-btn-small" onClick={() => onDeleteEducation(edu.id)}>
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
            <p className="item-institution">{edu.institution}</p>
            <p className="item-date">{edu.startDate} - {edu.endDate || 'বর্তমান'}</p>
          </div>
        ))}
        
        {isEditingEducation ? (
          <div className="add-form">
            <input type="text" placeholder="প্রতিষ্ঠান" value={newEducation.institution} onChange={(e) => setNewEducation({...newEducation, institution: e.target.value})} />
            <input type="text" placeholder="ডিগ্রি" value={newEducation.degree} onChange={(e) => setNewEducation({...newEducation, degree: e.target.value})} />
            <input type="text" placeholder="বিষয়" value={newEducation.field} onChange={(e) => setNewEducation({...newEducation, field: e.target.value})} />
            <div className="form-row">
              <input type="text" placeholder="শুরুর তারিখ" value={newEducation.startDate} onChange={(e) => setNewEducation({...newEducation, startDate: e.target.value})} />
              <input type="text" placeholder="শেষ তারিখ" value={newEducation.endDate} onChange={(e) => setNewEducation({...newEducation, endDate: e.target.value})} />
            </div>
            <div className="form-actions">
              <button className="cancel-btn" onClick={() => setIsEditingEducation(false)}>বাতিল</button>
              <button className="save-btn" onClick={onAddEducation}>যোগ করুন</button>
            </div>
          </div>
        ) : (
          <button className="add-btn" onClick={() => setIsEditingEducation(true)}>
            <i className="fa-solid fa-plus"></i> শিক্ষা যোগ করুন
          </button>
        )}
      </div>
    </div>
  );
};

export default EducationTab;