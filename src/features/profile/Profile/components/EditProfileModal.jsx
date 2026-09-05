// src/components/profile/EditProfileModal.jsx

import React from 'react';
import styles from './EditProfileModal.module.css';

const EditProfileModal = ({ profileData, setProfileData, onSave, onClose }) => {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.editModal} onClick={(e) => e.stopPropagation()}>
        <h3><i className="fa-solid fa-user-pen"></i> Edit Profile</h3>
        <div className={styles.editForm}>
          <div className={styles.formGroup}>
            <label>Full Name <span className={styles.requiredStar}>*</span></label>
            <input
              type="text"
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              placeholder="Enter your full name"
              maxLength="100"
              className={styles.editInput}
            />
            <small className={styles.charCount}>
              {profileData.name?.length || 0}/100
            </small>
          </div>

          <div className={styles.formGroup}>
            <label>Headline</label>
            <input
              type="text"
              value={profileData.headline}
              onChange={(e) => setProfileData({ ...profileData, headline: e.target.value })}
              placeholder="e.g. Full-Stack Developer | UI/UX Designer"
              maxLength="150"
              className={styles.editInput}
            />
            <small className={styles.charCount}>
              {profileData.headline?.length || 0}/150
            </small>
          </div>

          <div className={styles.formGroup}>
            <label>About Me</label>
            <textarea
              value={profileData.about}
              onChange={(e) => setProfileData({ ...profileData, about: e.target.value })}
              placeholder="Tell people about yourself..."
              rows="4"
              maxLength="500"
              className={styles.editTextarea}
            />
            <small className={styles.charCount}>
              {profileData.about?.length || 0}/500
            </small>
          </div>

          <div className={styles.formGroup}>
            <label>Skills <span className={styles.hintText}>(comma separated)</span></label>
            <input
              type="text"
              value={profileData.skills}
              onChange={(e) => setProfileData({ ...profileData, skills: e.target.value })}
              placeholder="React, Firebase, Tailwind CSS, Node.js"
              maxLength="200"
              className={styles.editInput}
            />
            <small className={styles.charCount}>
              {profileData.skills?.length || 0}/200
            </small>
          </div>

          <div className={styles.editActions}>
            <button className={styles.cancelBtn} onClick={onClose}>
              <i className="fa-solid fa-times"></i> Cancel
            </button>
            <button className={styles.saveBtn} onClick={onSave}>
              <i className="fa-solid fa-check"></i> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;