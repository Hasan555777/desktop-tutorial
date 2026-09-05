import React, { useState, useRef } from 'react';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../shared/firebase/index';
import { useFeedback } from '../../../../shared/ui/Feedback/FeedbackProvider';
import styles from './ProfileHeader.module.css';
import { uploadToCloudinary as uploadProfilePic } from '../../../register/hooks/registerHelpers';

// 🔧 FIX (item #5/#10): this was its own uncompressed, unvalidated inline
// duplicate — full-resolution profile photos went straight to Cloudinary.
// Now delegates to the shared, auto-compressing implementation.
const uploadToCloudinary = async (file) => {
  try {
    const result = await uploadProfilePic(file, 'profile_photos');
    return result.url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    return null;
  }
};

function ProfileHeader({ profileData, setProfileData, user, userData, isOwnProfile = true }) {
  const feedback = useFeedback();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: profileData.name,
    headline: profileData.headline,
    about: profileData.about,
    skills: profileData.skills
  });
  const fileInputRef = useRef(null);

  const handleProfilePicUpload = async (e) => {
    if (!isOwnProfile) {
      feedback.alert.error({ title: 'You cannot edit this profile' });
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    try {
      const imageUrl = await uploadToCloudinary(file);
      if (imageUrl) {
        const batch = writeBatch(db);
        const userRef = doc(db, 'users', user.uid);
        batch.update(userRef, { photoURL: imageUrl });

        const q = query(collection(db, 'posts'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((postDoc) => {
          batch.update(postDoc.ref, { userPhotoURL: imageUrl });
        });

        await batch.commit();
        await updateProfile(user, { photoURL: imageUrl });

        setProfileData(prev => ({ ...prev, profilePic: imageUrl }));
        feedback.alert.success({ title: '✅ প্রোফাইল পিকচার আপডেট হয়েছে!' });
      }
    } catch (error) {
      console.error("Error:", error);
      feedback.alert.error({ title: '❌ আপলোড ব্যর্থ হয়েছে' });
    }
  };

  const handleSaveProfile = async () => {
    if (!isOwnProfile) {
      feedback.alert.error({ title: 'You cannot edit this profile' });
      return;
    }

    if (!editData.name?.trim()) {
      feedback.alert.error({ title: 'Please enter your name!' });
      return;
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: editData.name.trim(),
        headline: editData.headline || '',
        about: editData.about || '',
        skills: editData.skills || '',
        updatedAt: serverTimestamp()
      });

      await updateProfile(user, {
        displayName: editData.name.trim()
      });

      setProfileData(prev => ({
        ...prev,
        name: editData.name,
        headline: editData.headline,
        about: editData.about,
        skills: editData.skills
      }));

      feedback.alert.success({ title: '✅ Profile updated successfully!' });
      setIsEditing(false);
    } catch (error) {
      console.error("Error:", error);
      feedback.alert.error({ title: 'Failed to save profile' });
    }
  };

  return (
    <>
      <div className={styles.profileHeaderWrapper}>
        <div className={styles.profileAvatarWrapper}>
          <img 
            src={profileData.profilePic} 
            alt="Profile" 
            className={styles.profileAvatar}
            onClick={() => isOwnProfile && fileInputRef.current?.click()}
            style={{ cursor: isOwnProfile ? 'pointer' : 'default' }}
          />
          {isOwnProfile && (
            <>
              <label htmlFor="avatar-upload" className={styles.avatarUploadBtn}>
                <i className="fa-solid fa-camera"></i>
              </label>
              <input 
                type="file" 
                id="avatar-upload" 
                ref={fileInputRef}
                hidden 
                accept="image/*" 
                onChange={handleProfilePicUpload} 
              />
            </>
          )}
        </div>

        <div className={styles.profileInfoWrapper}>
          <div className={styles.profileNameSection}>
            <h1>{profileData.name}</h1>
            {userData?.isVerified && (
              <span className={styles.verifiedBadge}>
                <i className="fa-solid fa-check-circle"></i> Verified
              </span>
            )}
            {!isOwnProfile && (
              <span className={styles.unverifiedBadge}>
                <i className="fa-solid fa-user"></i> Public Profile
              </span>
            )}
          </div>

          <p className={styles.profileHeadline}>{profileData.headline}</p>
          <p className={styles.profileEmail}>
            <i className="fa-solid fa-envelope"></i> {isOwnProfile ? user?.email : 'Hidden'}
          </p>

          {isOwnProfile && (
            <button 
              className={styles.editProfileBtn} 
              onClick={() => setIsEditing(true)}
            >
              <i className="fa-solid fa-pen"></i> Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* এডিট মোডাল - শুধু নিজের প্রোফাইলের জন্য */}
      {isEditing && isOwnProfile && (
        <div className={styles.modalOverlay} onClick={() => setIsEditing(false)}>
          <div className={styles.editModal} onClick={(e) => e.stopPropagation()}>
            <h3><i className="fa-solid fa-user-pen"></i> Edit Profile</h3>
            <div className={styles.editForm}>
              <input 
                type="text" 
                value={editData.name} 
                onChange={(e) => setEditData({ ...editData, name: e.target.value })} 
                placeholder="Full Name" 
              />
              <input 
                type="text" 
                value={editData.headline} 
                onChange={(e) => setEditData({ ...editData, headline: e.target.value })} 
                placeholder="Headline" 
              />
              <textarea 
                value={editData.about} 
                onChange={(e) => setEditData({ ...editData, about: e.target.value })} 
                placeholder="About Me" 
                rows="4" 
              />
              <input 
                type="text" 
                value={editData.skills} 
                onChange={(e) => setEditData({ ...editData, skills: e.target.value })} 
                placeholder="Skills (comma separated)" 
              />
              <div className={styles.editActions}>
                <button className={styles.cancelBtn} onClick={() => setIsEditing(false)}>Cancel</button>
                <button className={styles.saveBtn} onClick={handleSaveProfile}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ProfileHeader;