// src/components/profile/EditProfileModal.jsx
import React from 'react';

const EditProfileModal = ({ profileData, setProfileData, onSave, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
        <h3><i className="fa-solid fa-user-pen"></i> Edit Profile</h3>
        <div className="edit-form">
          <div className="form-group">
            <label>Full Name <span className="required-star">*</span></label>
            <input
              type="text"
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              placeholder="Enter your full name"
              maxLength="100"
              className="edit-input"
            />
            <small className="char-count">
              {profileData.name?.length || 0}/100
            </small>
          </div>

          <div className="form-group">
            <label>Headline</label>
            <input
              type="text"
              value={profileData.headline}
              onChange={(e) => setProfileData({ ...profileData, headline: e.target.value })}
              placeholder="e.g. Full-Stack Developer | UI/UX Designer"
              maxLength="150"
              className="edit-input"
            />
            <small className="char-count">
              {profileData.headline?.length || 0}/150
            </small>
          </div>

          <div className="form-group">
            <label>About Me</label>
            <textarea
              value={profileData.about}
              onChange={(e) => setProfileData({ ...profileData, about: e.target.value })}
              placeholder="Tell people about yourself..."
              rows="4"
              maxLength="500"
              className="edit-textarea"
            />
            <small className="char-count">
              {profileData.about?.length || 0}/500
            </small>
          </div>

          <div className="form-group">
            <label>Skills <span className="hint-text">(comma separated)</span></label>
            <input
              type="text"
              value={profileData.skills}
              onChange={(e) => setProfileData({ ...profileData, skills: e.target.value })}
              placeholder="React, Firebase, Tailwind CSS, Node.js"
              maxLength="200"
              className="edit-input"
            />
            <small className="char-count">
              {profileData.skills?.length || 0}/200
            </small>
          </div>

          <div className="edit-actions">
            <button className="cancel-btn" onClick={onClose}>
              <i className="fa-solid fa-times"></i> Cancel
            </button>
            <button className="save-btn" onClick={onSave}>
              <i className="fa-solid fa-check"></i> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;