// src/pages/Settings/tabs/ProfileTab.jsx
import React from 'react';

const ProfileTab = ({ 
  profileData, 
  setProfileData, 
  saving, 
  onUpdateProfile, 
  onProfilePicUpload 
}) => {
  return (
    <div className="settings-section">
      <h2><i className="fa-solid fa-user"></i> প্রোফাইল সেটিংস</h2>
      <div className="settings-form">
        <div className="profile-pic-section" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '16px',
          padding: '24px 20px',
          marginBottom: '24px',
          background: '#f1f5f9',
          borderRadius: '16px',
          border: '1px dashed #e2e8f0'
        }}> 
          <img 
            src={profileData.photoURL || `https://ui-avatars.com/api/?name=${profileData.firstName || 'User'}&background=14b8a6&color=fff&bold=true&size=120`} 
            alt="Profile" 
            style={{ 
              width: '120px', 
              height: '120px', 
              borderRadius: '50%', 
              objectFit: 'cover',
              border: '4px solid #438e82',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }} 
          />
          <label 
            htmlFor="avatar-upload" 
            style={{ 
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              background: '#438e82',
              color: '#ffffff',
              border: 'none',
              borderRadius: '30px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#4fb3a3';
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 4px 15px rgba(67, 142, 130, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#438e82';
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            <i className="fa-solid fa-camera"></i> ছবি পরিবর্তন
          </label>
          <input type="file" id="avatar-upload" hidden accept="image/*" onChange={onProfilePicUpload} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>নাম <span className="required">*</span></label>
            <input 
              type="text" 
              value={profileData.firstName} 
              onChange={(e) => setProfileData({...profileData, firstName: e.target.value})} 
              placeholder="আপনার নাম" 
            />
          </div>
          <div className="form-group">
            <label>পদবি <span className="required">*</span></label>
            <input 
              type="text" 
              value={profileData.lastName} 
              onChange={(e) => setProfileData({...profileData, lastName: e.target.value})} 
              placeholder="পদবি" 
            />
          </div>
        </div>

        <div className="form-group">
          <label>হেডলাইন</label>
          <input 
            type="text" 
            value={profileData.headline} 
            onChange={(e) => setProfileData({...profileData, headline: e.target.value})} 
            placeholder="আপনার পেশাগত হেডলাইন" 
          />
        </div>

        <div className="form-group">
          <label>ইমেইল <span className="required">*</span></label>
          <input type="email" value={profileData.email} disabled className="disabled-input" />
          <small>ইমেইল পরিবর্তন করা যাবে না।</small>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>ফোন <span className="required">*</span></label>
            <input 
              type="tel" 
              value={profileData.phone} 
              onChange={(e) => setProfileData({...profileData, phone: e.target.value})} 
              placeholder="01XXXXXXXXX" 
            />
          </div>
          <div className="form-group">
            <label>জন্ম তারিখ <span className="required">*</span></label>
            <input 
              type="date" 
              value={profileData.dob} 
              onChange={(e) => setProfileData({...profileData, dob: e.target.value})} 
            />
          </div>
        </div>

        <div className="form-group">
          <label>ঠিকানা</label>
          <textarea 
            value={profileData.address} 
            onChange={(e) => setProfileData({...profileData, address: e.target.value})} 
            placeholder="আপনার বর্তমান ঠিকানা" 
            rows="3" 
          />
        </div>

        <div className="form-group">
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

        <div className="form-group">
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

        <div className="form-group">
          <label>আপনি কি হিসেবে কাজ করতে চান? <span className="required">*</span></label>
          <div className="role-selector">
            <label className={`role-option ${profileData.role === 'client' ? 'active' : ''}`}>
              <input 
                type="radio" 
                value="client" 
                checked={profileData.role === 'client'} 
                onChange={() => setProfileData({...profileData, role: 'client'})} 
              />
              <i className="fa-solid fa-briefcase"></i>
              <span>ক্লায়েন্ট</span>
            </label>
            <label className={`role-option ${profileData.role === 'freelancer' ? 'active' : ''}`}>
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

        <button className="save-btn" onClick={onUpdateProfile} disabled={saving}>
          {saving ? <><i className="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...</> : '💾 প্রোফাইল সংরক্ষণ করুন'}
        </button>
      </div>
    </div>
  );
};

export default ProfileTab;