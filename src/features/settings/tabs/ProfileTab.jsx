// src/pages/Settings/tabs/ProfileTab.jsx

import React from 'react';
import styles from './ProfileTab.module.css';

const ProfileTab = ({ 
  profileData, 
  setProfileData, 
  saving, 
  onUpdateProfile, 
  onProfilePicUpload 
}) => {
  return (
    <div className={styles.settingsSection}>
      <h2><i className="fa-solid fa-user"></i> প্রোফাইল সেটিংস</h2>
      <div className={styles.settingsForm}>
        <div className={styles.profilePicSection}>
          <img 
            src={profileData.photoURL || `https://ui-avatars.com/api/?name=${profileData.firstName || 'User'}&background=14b8a6&color=fff&bold=true&size=120`} 
            alt="Profile" 
            className={styles.profileAvatar}
          />
          <label 
            htmlFor="avatar-upload" 
            className={styles.uploadLabel}
          >
            <i className="fa-solid fa-camera"></i> ছবি পরিবর্তন
          </label>
          <input type="file" id="avatar-upload" hidden accept="image/*" onChange={onProfilePicUpload} />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>নাম <span className={styles.required}>*</span></label>
            <input 
              type="text" 
              value={profileData.firstName} 
              onChange={(e) => setProfileData({...profileData, firstName: e.target.value})} 
              placeholder="আপনার নাম" 
            />
          </div>
          <div className={styles.formGroup}>
            <label>পদবি <span className={styles.required}>*</span></label>
            <input 
              type="text" 
              value={profileData.lastName} 
              onChange={(e) => setProfileData({...profileData, lastName: e.target.value})} 
              placeholder="পদবি" 
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>হেডলাইন</label>
          <input 
            type="text" 
            value={profileData.headline} 
            onChange={(e) => setProfileData({...profileData, headline: e.target.value})} 
            placeholder="আপনার পেশাগত হেডলাইন" 
          />
        </div>

        <div className={styles.formGroup}>
          <label>ইমেইল <span className={styles.required}>*</span></label>
          <input type="email" value={profileData.email} disabled className={styles.disabledInput} />
          <small>ইমেইল পরিবর্তন করা যাবে না।</small>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>ফোন <span className={styles.required}>*</span></label>
            <input 
              type="tel" 
              value={profileData.phone} 
              onChange={(e) => setProfileData({...profileData, phone: e.target.value})} 
              placeholder="01XXXXXXXXX" 
            />
          </div>
          <div className={styles.formGroup}>
            <label>জন্ম তারিখ <span className={styles.required}>*</span></label>
            <input 
              type="date" 
              value={profileData.dob} 
              onChange={(e) => setProfileData({...profileData, dob: e.target.value})} 
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>ঠিকানা</label>
          <textarea 
            value={profileData.address} 
            onChange={(e) => setProfileData({...profileData, address: e.target.value})} 
            placeholder="আপনার বর্তমান ঠিকানা" 
            rows="3" 
          />
        </div>

        <div className={styles.formGroup}>
          <label>বায়ো</label>
          <textarea 
            value={profileData.bio} 
            onChange={(e) => setProfileData({...profileData, bio: e.target.value})} 
            placeholder="আপনার সম্পর্কে সংক্ষেপে বলুন" 
            rows="3" 
            maxLength="500" 
          />
          <small>{profileData.bio?.length || 0}/500</small>
        </div>

        <div className={styles.formGroup}>
          <label>দক্ষতা (কমা দিয়ে আলাদা করুন)</label>
          <input 
            type="text" 
            value={Array.isArray(profileData.skills) ? profileData.skills.join(', ') : profileData.skills || ''} 
            onChange={(e) => {
              const skillsArray = e.target.value.split(',').map(s => s.trim()).filter(s => s);
              setProfileData({...profileData, skills: skillsArray});
            }} 
            placeholder="JavaScript, React, Firebase" 
          />
        </div>

        <div className={styles.formGroup}>
          <label>আপনি কি হিসেবে কাজ করতে চান? <span className={styles.required}>*</span></label>
          <div className={styles.roleSelector}>
            <label className={`${styles.roleOption} ${profileData.role === 'client' ? styles.active : ''}`}>
              <input 
                type="radio" 
                value="client" 
                checked={profileData.role === 'client'} 
                onChange={() => setProfileData({...profileData, role: 'client'})} 
              />
              <i className="fa-solid fa-briefcase"></i>
              <span>ক্লায়েন্ট</span>
            </label>
            <label className={`${styles.roleOption} ${profileData.role === 'freelancer' ? styles.active : ''}`}>
              <input 
                type="radio" 
                value="freelancer" 
                checked={profileData.role === 'freelancer'} 
                onChange={() => setProfileData({...profileData, role: 'freelancer'})} 
              />
              <i className="fa-solid fa-laptop-code"></i>
              <span>ফ্রিল্যান্সার</span>
            </label>
          </div>
        </div>

        <button className={styles.saveBtn} onClick={onUpdateProfile} disabled={saving}>
          {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...</> : '💾 প্রোফাইল সংরক্ষণ করুন'}
        </button>
      </div>
    </div>
  );
};

export default ProfileTab;