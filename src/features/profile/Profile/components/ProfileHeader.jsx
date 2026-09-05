// src/components/profile/ProfileHeader.jsx

import React from 'react';
import ProfileProgress from "../../components/ProfileProgress";
import styles from './ProfileHeader.module.css';

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
    <div className={styles.profileHeaderWrapper}>
      <div className={styles.profileAvatarWrapper}>
        <img src={profileData.profilePic} alt="Profile" className={styles.profileAvatar} />
        <label htmlFor="avatar-upload" className={styles.avatarUploadBtn}>
          <i className="fa-solid fa-camera"></i>
        </label>
        <input type="file" id="avatar-upload" hidden accept="image/*" onChange={onProfilePicUpload} />
      </div>

      <div className={styles.progressSection}>
        <ProfileProgress />
      </div>

      <div className={styles.profileInfoWrapper}>
        <div className={styles.profileNameSection}>
          <h1>{profileData.name}</h1>
          <button className={styles.copyLinkBtn} onClick={onCopyLink}>
            <i className="fa-solid fa-copy"></i>
            {copySuccess ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <p className={styles.profileHeadline}>{profileData.headline}</p>
        <p className={styles.profileEmail}>
          <i className="fa-solid fa-envelope"></i> {user?.email}
        </p>

        <div className={styles.profileStatsRow}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{userData?.followersCount || 0}</span>
            <span className={styles.statLabel}>
              <i className="fa-solid fa-user-plus"></i> Followers
            </span>
          </div>
          <div className={styles.statDivider}></div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{userData?.followingCount || 0}</span>
            <span className={styles.statLabel}>
              <i className="fa-solid fa-user-check"></i> Following
            </span>
          </div>
        </div>

        <div className={styles.profileUniqueIds}>
          <div className={styles.uniqueIdItem}>
            <span className={styles.idLabel}>🆔 User ID</span>
            <span className={styles.idValue}>{userData?.uniqueId || 'Loading...'}</span>
            <button
              className={styles.copyIdBtn}
              onClick={() => copyField(userData?.uniqueId, 'User ID')}
              title="Copy"
            >
              <i className="fa-solid fa-copy"></i>
            </button>
          </div>

          <div className={styles.uniqueIdItem}>
            <span className={styles.idLabel}>💳 Wallet ID</span>
            <span className={styles.idValue}>{userData?.walletId || 'Loading...'}</span>
            <button
              className={styles.copyIdBtn}
              onClick={() => copyField(userData?.walletId, 'Wallet ID')}
              title="Copy"
            >
              <i className="fa-solid fa-copy"></i>
            </button>
          </div>

          <div className={styles.uniqueIdItem}>
            <span className={styles.idLabel}>🔗 Referral Code</span>
            <span className={styles.idValue}>{userData?.referralCode || 'Loading...'}</span>
            <button
              className={styles.copyIdBtn}
              onClick={() => copyField(userData?.referralCode, 'Referral Code')}
              title="Copy"
            >
              <i className="fa-solid fa-copy"></i>
            </button>
          </div>
        </div>

        <button className={styles.editProfileBtn} onClick={onEditClick}>
          <i className="fa-solid fa-pen"></i> Edit Profile
        </button>
      </div>
    </div>
  );
};

export default ProfileHeader;