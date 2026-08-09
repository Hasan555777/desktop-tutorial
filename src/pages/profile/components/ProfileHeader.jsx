// src/components/profile/ProfileHeader.jsx
import React from 'react';
import ProfileProgress from "@components/ProfileProgress";

const ProfileHeader = ({
  profileData,
  user,
  userData,
  copySuccess,
  onProfilePicUpload,
  onCopyLink,
  onEditClick,
  feedback,
}) => {
  const copyField = (value, label) => {
    navigator.clipboard.writeText(value || '');
    feedback?.alert?.success?.({ message: `📋 ${label} copied!` });
  };

  return (
    <div className="profile-header-wrapper">
      <div className="profile-avatar-wrapper">
        <img src={profileData.profilePic} alt="Profile" className="profile-avatar" />
        <label htmlFor="avatar-upload" className="avatar-upload-btn">
          <i className="fa-solid fa-camera"></i>
        </label>
        <input type="file" id="avatar-upload" hidden accept="image/*" onChange={onProfilePicUpload} />
      </div>

      <div className="progress-section" style={{ padding: '0 20px' }}>
        <ProfileProgress />
      </div>

      <div className="profile-info-wrapper">
        <div className="profile-name-section">
          <h1>{profileData.name}</h1>
          <button className="copy-link-btn" onClick={onCopyLink}>
            <i className="fa-solid fa-copy"></i>
            {copySuccess ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <p className="profile-headline">{profileData.headline}</p>
        <p className="profile-email">
          <i className="fa-solid fa-envelope"></i> {user?.email}
        </p>

        <div className="profile-stats-row">
          <div className="stat-item">
            <span className="stat-number">{userData?.followersCount || 0}</span>
            <span className="stat-label">
              <i className="fa-solid fa-user-plus"></i> Followers
            </span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-number">{userData?.followingCount || 0}</span>
            <span className="stat-label">
              <i className="fa-solid fa-user-check"></i> Following
            </span>
          </div>
        </div>

        <div className="profile-unique-ids">
          <div className="unique-id-item">
            <span className="id-label">🆔 User ID</span>
            <span className="id-value">{userData?.uniqueId || 'Loading...'}</span>
            <button
              className="copy-id-btn"
              onClick={() => copyField(userData?.uniqueId, 'User ID')}
              title="Copy"
            >
              <i className="fa-solid fa-copy"></i>
            </button>
          </div>

          <div className="unique-id-item">
            <span className="id-label">💳 Wallet ID</span>
            <span className="id-value">{userData?.walletId || 'Loading...'}</span>
            <button
              className="copy-id-btn"
              onClick={() => copyField(userData?.walletId, 'Wallet ID')}
              title="Copy"
            >
              <i className="fa-solid fa-copy"></i>
            </button>
          </div>

          <div className="unique-id-item">
            <span className="id-label">🔗 Referral Code</span>
            <span className="id-value">{userData?.referralCode || 'Loading...'}</span>
            <button
              className="copy-id-btn"
              onClick={() => copyField(userData?.referralCode, 'Referral Code')}
              title="Copy"
            >
              <i className="fa-solid fa-copy"></i>
            </button>
          </div>
        </div>

        <button className="edit-profile-btn" onClick={onEditClick}>
          <i className="fa-solid fa-pen"></i> Edit Profile
        </button>
      </div>
    </div>
  );
};

export default ProfileHeader;