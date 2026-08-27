import React, { useState, useRef } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import toast from 'react-hot-toast';
import '../styles/profile.css';

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

function VerificationSection({ userData, user, onBack }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const nidFrontRef = useRef();
  const nidBackRef = useRef();
  const birthRef = useRef();

  const handleUpload = async () => {
    setUploading(true);
    setProgress(0);

    try {
      const uploadedDocs = {};
      let prog = 0;

      const frontFile = nidFrontRef.current?.files[0];
      if (frontFile) {
        const url = await uploadToCloudinary(frontFile);
        uploadedDocs.nidFront = { url };
        prog += 33;
        setProgress(prog);
      }

      const backFile = nidBackRef.current?.files[0];
      if (backFile) {
        const url = await uploadToCloudinary(backFile);
        uploadedDocs.nidBack = { url };
        prog += 33;
        setProgress(prog);
      }

      const birthFile = birthRef.current?.files[0];
      if (birthFile) {
        const url = await uploadToCloudinary(birthFile);
        uploadedDocs.birthCert = { url };
        prog += 34;
        setProgress(prog);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        documents: uploadedDocs,
        verificationStatus: 'pending',
        documentSubmittedAt: serverTimestamp()
      });

      toast.success('✅ ডকুমেন্ট আপলোড সম্পন্ন!');
      setProgress(100);
      setTimeout(onBack, 1500);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error('❌ আপলোড ব্যর্থ হয়েছে');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-shield-alt" style={{ marginRight: '10px', color: '#2563eb' }}></i>
          Verification
        </div>
      </div>

      <div className="section-content">
        <div className="verification-status-box">
          <div className={`status-badge-large ${userData?.verificationStatus || 'pending'}`}>
            {userData?.verificationStatus === 'verified' && '✅ যাচাইকৃত'}
            {userData?.verificationStatus === 'pending' && '⏳ যাচাই বাকি'}
            {userData?.verificationStatus === 'rejected' && '❌ প্রত্যাখ্যাত'}
            {!userData?.verificationStatus && '📋 যাচাই শুরু করুন'}
          </div>
        </div>

        <div className="detail-item">
          <i className="fas fa-id-card"></i>
          <span className="detail-label">National ID (Front)</span>
          <input type="file" ref={nidFrontRef} accept="image/*" />
        </div>

        <div className="detail-item">
          <i className="fas fa-id-card"></i>
          <span className="detail-label">National ID (Back)</span>
          <input type="file" ref={nidBackRef} accept="image/*" />
        </div>

        <div className="detail-item">
          <i className="fas fa-file-alt"></i>
          <span className="detail-label">Birth Certificate</span>
          <input type="file" ref={birthRef} accept="image/*,application/pdf" />
        </div>

        {uploading && (
          <div className="upload-progress">
            <div className="progress-text">আপলোড হচ্ছে... {Math.round(progress)}%</div>
            <div className="progress-bar-small">
              <div className="progress-fill-small" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        <button className="save-btn" onClick={handleUpload} disabled={uploading}>
          {uploading ? '⏳ আপলোড হচ্ছে...' : '📤 ডকুমেন্ট আপলোড করুন'}
        </button>
      </div>
    </div>
  );
}

export default VerificationSection;