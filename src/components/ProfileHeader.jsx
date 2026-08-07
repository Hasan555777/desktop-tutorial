import React, { useState, useRef } from 'react';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

const uploadToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "workhub_preset");

  try {
    const response = await fetch(
      "https://api.cloudinary.com/v1_1/drwex6tmf/image/upload",
      { method: "POST", body: formData }
    );
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    return null;
  }
};

function ProfileHeader({ profileData, setProfileData, user, userData, isOwnProfile = true }) {
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
      toast.error('You cannot edit this profile');
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
        toast.success('✅ প্রোফাইল পিকচার আপডেট হয়েছে!');
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error('❌ আপলোড ব্যর্থ হয়েছে');
    }
  };

  const handleSaveProfile = async () => {
    if (!isOwnProfile) {
      toast.error('You cannot edit this profile');
      return;
    }

    if (!editData.name?.trim()) {
      toast.error('Please enter your name!');
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

      toast.success('✅ Profile updated successfully!');
      setIsEditing(false);
    } catch (error) {
      console.error("Error:", error);
      toast.error('Failed to save profile');
    }
  };

  return (
    <>
      <div className="profile-header-wrapper">
        <div className="profile-avatar-wrapper">
          <img 
            src={profileData.profilePic} 
            alt="Profile" 
            className="profile-avatar"
            onClick={() => isOwnProfile && fileInputRef.current?.click()}
            style={{ cursor: isOwnProfile ? 'pointer' : 'default' }}
          />
          {isOwnProfile && (
            <>
              <label htmlFor="avatar-upload" className="avatar-upload-btn">
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

        <div className="profile-info-wrapper">
          <div className="profile-name-section">
            <h1>{profileData.name}</h1>
            {userData?.isVerified && (
              <span className="verified-badge">
                <i className="fa-solid fa-check-circle"></i> Verified
              </span>
            )}
            {!isOwnProfile && (
              <span className="unverified-badge" style={{ background: '#e5e7eb', color: '#6b7280' }}>
                <i className="fa-solid fa-user"></i> Public Profile
              </span>
            )}
          </div>

          <p className="profile-headline">{profileData.headline}</p>
          <p className="profile-email">
            <i className="fa-solid fa-envelope"></i> {isOwnProfile ? user?.email : 'Hidden'}
          </p>

          {isOwnProfile && (
            <button 
              className="edit-profile-btn" 
              onClick={() => setIsEditing(true)}
            >
              <i className="fa-solid fa-pen"></i> Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* এডিট মোডাল - শুধু নিজের প্রোফাইলের জন্য */}
      {isEditing && isOwnProfile && (
        <div className="modal-overlay" onClick={() => setIsEditing(false)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3><i className="fa-solid fa-user-pen"></i> Edit Profile</h3>
            <div className="edit-form">
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
              <div className="edit-actions">
                <button className="cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
                <button className="save-btn" onClick={handleSaveProfile}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ProfileHeader;