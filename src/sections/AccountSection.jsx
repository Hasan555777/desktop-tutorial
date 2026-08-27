import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import toast from 'react-hot-toast';

function AccountSection({ profileData, setProfileData, user, onBack }) {
  const [editData, setEditData] = useState({
    name: profileData.name,
    headline: profileData.headline,
    about: profileData.about,
    skills: profileData.skills
  });

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: editData.name,
        headline: editData.headline,
        about: editData.about,
        skills: editData.skills,
        updatedAt: serverTimestamp()
      });

      setProfileData(prev => ({ ...prev, ...editData }));
      toast.success('✅ Account updated!');
      onBack();
    } catch (error) {
      console.error("Error:", error);
      toast.error('Failed to update');
    }
  };

  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-user-circle" style={{ marginRight: '10px', color: '#7c3aed' }}></i>
          Account Settings
        </div>
      </div>

      <div className="section-content">
        <div className="detail-item">
          <i className="fas fa-user"></i>
          <span className="detail-label">Full Name</span>
          <input 
            type="text" 
            value={editData.name} 
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            className="edit-input"
          />
        </div>

        <div className="detail-item">
          <i className="fas fa-tag"></i>
          <span className="detail-label">Headline</span>
          <input 
            type="text" 
            value={editData.headline} 
            onChange={(e) => setEditData({ ...editData, headline: e.target.value })}
            className="edit-input"
          />
        </div>

        <div className="detail-item">
          <i className="fas fa-align-left"></i>
          <span className="detail-label">About</span>
          <textarea 
            value={editData.about} 
            onChange={(e) => setEditData({ ...editData, about: e.target.value })}
            className="edit-textarea"
            rows="3"
          />
        </div>

        <div className="detail-item">
          <i className="fas fa-code"></i>
          <span className="detail-label">Skills</span>
          <input 
            type="text" 
            value={editData.skills} 
            onChange={(e) => setEditData({ ...editData, skills: e.target.value })}
            className="edit-input"
            placeholder="React, Node, Firebase"
          />
        </div>

        <button className="save-btn" onClick={handleSave}>
          <i className="fas fa-check"></i> Save Changes
        </button>
      </div>
    </div>
  );
}

export default AccountSection;