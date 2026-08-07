// src/components/ProfileTabs.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';

// ============================================================
// ✅ Loading Component (Reusable)
// ============================================================
const LoadingContent = ({ message = 'Loading...' }) => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column',
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: '40px 20px',
    color: 'var(--text-secondary, #94a3b8)'
  }}>
    <i className="fa-solid fa-spinner fa-spin" style={{ 
      fontSize: '32px', 
      color: 'var(--accent-primary, #14b8a6)',
      marginBottom: '12px'
    }} />
    <p>{message}</p>
  </div>
);

// ============================================================
// ✅ পোস্ট গ্রিড কম্পোনেন্ট
// ============================================================
export const PostGrid = ({ posts, isLoading, emptyMessage, activeTab, currentMode, navigate, onEdit, onDelete, onUnsave }) => {
  if (isLoading) {
    return <LoadingContent message="Loading posts..." />;
  }

  if (posts.length === 0) {
    return (
      <div className="no-posts">
        <i className="fa-solid fa-folder-open"></i>
        <p>{emptyMessage}</p>
        {activeTab === 'posts' && (
          <button className="create-post-btn" onClick={() => navigate('/')}>
            <i className="fa-solid fa-plus"></i> Create {currentMode === 'buyer' ? 'Job' : 'Service'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="posts-grid">
      {posts.map((post, index) => (
        <div key={`${post.id}-${index}`} className="post-card">
          {post.images && post.images.length > 0 && (
            <div className={`post-images-container ${post.images.length > 1 ? 'two-images' : 'one-image'}`}>
              {post.images.slice(0, 2).map((img, imgIndex) => (
                <img
                  key={imgIndex}
                  src={`${img.split('?')[0]}?v=${post._updatedAt || Date.now()}`}
                  alt={post.title}
                  className="post-image"
                />
              ))}
              {post.images.length > 2 && (
                <div className="post-image-badge">+{post.images.length - 2}</div>
              )}
            </div>
          )}

          <div className="post-content">
            <h4>{post.title}</h4>
            <p className="post-description">{post.description?.substring(0, 100)}...</p>
            <div className="post-meta">
              <span><i className="fa-solid fa-wallet"></i> {post.budget || post.price} BDT</span>
              <span><i className="fa-regular fa-clock"></i> {post.deadline || post.deliveryDays} Days</span>
              <span><i className="fa-solid fa-tag"></i> {post.type === 'hire' ? 'Job' : 'Service'}</span>
            </div>
            {activeTab === 'posts' && (
              <div className="post-actions">
                <button className="edit-post-btn" onClick={() => onEdit(post)}>
                  <i className="fa-solid fa-pen"></i> Edit
                </button>
                <button className="force-delete-btn" onClick={() => onDelete(post.id)}>
                  <i className="fa-solid fa-trash"></i> Delete
                </button>
              </div>
            )}
            {activeTab === 'saved' && (
              <button className="unsave-btn" onClick={() => onUnsave(post.id)}>
                <i className="fa-solid fa-bookmark"></i> Unsave
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// ✅ ডকুমেন্ট ট্যাব কম্পোনেন্ট
// ============================================================
export const DocumentsTab = ({
  verificationStatus,
  isVerified,
  docStatus,
  docPreviews,
  selectedDocs,
  uploadingDocs,
  uploadProgress,
  onDocFileChange,
  onRemoveDocFile,
  onUploadDocuments,
  onPdfPreview
}) => (
  <div className="tab-panel documents-panel">
    <h3><i className="fa-solid fa-file"></i> ডকুমেন্ট যাচাই</h3>
    <p className="tab-subtitle">আপনার পরিচয় প্রমাণের জন্য ডকুমেন্ট আপলোড করুন</p>

    <div className="verification-status-box">
      <div className={`status-badge-large ${verificationStatus}`}>
        {verificationStatus === 'verified' && '✅ যাচাইকৃত'}
        {verificationStatus === 'pending' && '⏳ যাচাই বাকি'}
        {verificationStatus === 'rejected' && '❌ প্রত্যাখ্যাত'}
      </div>
      {isVerified && (
        <div className="verified-badge">
          <i className="fa-solid fa-check-circle"></i> আপনার অ্যাকাউন্ট যাচাই করা হয়েছে
        </div>
      )}
    </div>

    {docStatus.documentsUploaded ? (
      <div className="info-box success">
        <span className="info-icon">✅</span>
        <div>
          <strong>ডকুমেন্ট আপলোড সম্পন্ন!</strong>
          <p>আপনার ডকুমেন্ট অ্যাডমিন দ্বারা যাচাই করা হচ্ছে।</p>
        </div>
      </div>
    ) : (
      <>
        <div className="upload-row">
          <div className="form-group">
            <label>NID কার্ড (সামনে) <span className="required">*</span></label>
            <div
              className={`upload-area ${docPreviews.nidFront ? 'has-file' : ''}`}
              id="nidFrontArea"
              onClick={() => !docPreviews.nidFront && document.getElementById('nidFront')?.click()}
            >
              <input
                type="file"
                id="nidFront"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => onDocFileChange(e, 'nidFront')}
              />
              {docPreviews.nidFront ? (
                <div className="upload-preview-container">
                  <img src={docPreviews.nidFront} alt="NID Front Preview" className="upload-preview" />
                  <button
                    type="button"
                    className="upload-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveDocFile('nidFront');
                    }}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              ) : (
                <div className="upload-default">
                  <div className="upload-icon">🪪</div>
                  <div className="upload-label">সামনের ছবি</div>
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>NID কার্ড (পিছনে) <span className="required">*</span></label>
            <div
              className={`upload-area ${docPreviews.nidBack ? 'has-file' : ''}`}
              id="nidBackArea"
              onClick={() => !docPreviews.nidBack && document.getElementById('nidBack')?.click()}
            >
              <input
                type="file"
                id="nidBack"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => onDocFileChange(e, 'nidBack')}
              />
              {docPreviews.nidBack ? (
                <div className="upload-preview-container">
                  <img src={docPreviews.nidBack} alt="NID Back Preview" className="upload-preview" />
                  <button
                    type="button"
                    className="upload-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveDocFile('nidBack');
                    }}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              ) : (
                <div className="upload-default">
                  <div className="upload-icon">🔄</div>
                  <div className="upload-label">পিছনের ছবি</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>জন্ম নিবন্ধন সনদ</label>
          <div
            className={`upload-area ${docPreviews.birthCert ? 'has-file' : ''}`}
            id="birthArea"
            onClick={() => !docPreviews.birthCert && document.getElementById('birthCert')?.click()}
          >
            <input
              type="file"
              id="birthCert"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => onDocFileChange(e, 'birthCert')}
            />
            {docPreviews.birthCert ? (
              <div className="upload-preview-container">
                {selectedDocs.birthCert?.type === 'application/pdf' ? (
                  <div className="pdf-preview" onClick={() => onPdfPreview(selectedDocs.birthCert)}>
                    <i className="fa-solid fa-file-pdf"></i>
                    <span>{selectedDocs.birthCert.name}</span>
                    <button className="pdf-view-btn">👁️ দেখুন</button>
                  </div>
                ) : (
                  <img src={docPreviews.birthCert} alt="Birth Cert Preview" className="upload-preview" />
                )}
                <button
                  type="button"
                  className="upload-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveDocFile('birthCert');
                  }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            ) : (
              <div className="upload-default">
                <div className="upload-icon">📄</div>
                <div className="upload-label">সনদের ছবি বা PDF</div>
              </div>
            )}
          </div>
        </div>

        {uploadingDocs && (
          <div className="upload-progress">
            <div className="progress-text">আপলোড হচ্ছে... {Math.round(uploadProgress)}%</div>
            <div className="progress-bar-small">
              <div className="progress-fill-small" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
        )}

        <button className="save-btn" onClick={onUploadDocuments} disabled={uploadingDocs}>
          {uploadingDocs ? '⏳ আপলোড হচ্ছে...' : '📤 ডকুমেন্ট আপলোড করুন'}
        </button>
      </>
    )}
  </div>
);

// ============================================================
// ✅ ফেস ভেরিফিকেশন ট্যাব কম্পোনেন্ট
// ============================================================
export const FaceVerificationTab = ({
  docStatus,
  faceVerified,
  camStream,
  livenessComplete,
  currentLivenessStep,
  livenessState,
  videoRef,
  canvasRef,
  cameraBoxRef,
  camStartBtnRef,
  captureBtnRef,
  camStopBtnRef,
  startCamera,
  stopCamera,
  capturePhoto
}) => (
  <div className="tab-panel face-panel">
    <h3><i className="fa-solid fa-camera"></i> মুখমণ্ডল যাচাই</h3>
    <p className="tab-subtitle">নিচের নির্দেশনা অনুসরণ করুন</p>

    {docStatus.faceVerified || faceVerified ? (
      <div className="info-box success">
        <span className="info-icon">✅</span>
        <div>
          <strong>মুখমণ্ডল যাচাই সম্পন্ন!</strong>
          <p>আপনার ফেস ভেরিফিকেশন সফলভাবে সম্পন্ন হয়েছে।</p>
        </div>
      </div>
    ) : (
      <>
        <div className="liveness-instructions">
          {livenessState.map((step, index) => (
            <div 
              key={step.id} 
              className={`instruction-step ${step.done ? 'done' : ''} ${index === currentLivenessStep && camStream ? 'active' : ''}`}
            >
              <div className="inst-text">{step.label}</div>
              <div className="inst-status">
                {step.done ? '✅' : index === currentLivenessStep && camStream ? '⏳' : '⬜'}
              </div>
            </div>
          ))}
        </div>

        <div className={`camera-box ${camStream ? 'camera-active' : ''}`} ref={cameraBoxRef}>
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline
            style={{ display: camStream ? 'block' : 'none', width: '100%' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {!camStream && (
            <div className="camera-placeholder">
              <span>📷</span>
              <div>ক্যামেরা চালু করুন</div>
            </div>
          )}
        </div>

        <div className="liveness-progress">
          <div className="progress-text" id="livenessProgressText">০/{livenessState.length} সম্পন্ন</div>
          <div className="progress-bar-small">
            <div className="progress-fill-small" id="livenessProgressFill" style={{ width: '0%' }}></div>
          </div>
        </div>

        <div className="btn-row">
          <button 
            className="btn btn-ghost" 
            ref={camStartBtnRef}
            onClick={startCamera}
            disabled={!!camStream}
          >
            📷 ক্যামেরা চালু
          </button>
          <button 
            className="btn btn-primary" 
            ref={captureBtnRef}
            onClick={capturePhoto}
            style={{ display: 'none' }}
            disabled={!livenessComplete}
          >
            📸 ছবি তুলুন
          </button>
          <button 
            className="btn btn-danger" 
            ref={camStopBtnRef}
            onClick={stopCamera}
            style={{ display: 'none' }}
          >
            ⏹ বন্ধ
          </button>
        </div>
      </>
    )}
  </div>
);

// ============================================================
// ✅ রিভিউ ট্যাব কম্পোনেন্ট (আপডেটেড)
// ============================================================
export const ReviewsTab = ({ reviews, reviewsLoading, userRating, navigate, userId }) => (
  <div className="tab-panel reviews-panel">
    <div className="reviews-header">
      <h3>
        <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i>
        Reviews ({reviews.length})
      </h3>
      {reviews.length > 0 && (
        <div className="average-rating">
          <span className="rating-number">{userRating.average}</span>
          <div className="rating-stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <i key={star} className={`fa-solid fa-star ${star <= Math.round(userRating.average) ? 'filled' : ''}`}></i>
            ))}
          </div>
          <span className="rating-total">({userRating.total} reviews)</span>
        </div>
      )}
    </div>

    {reviewsLoading ? (
      <LoadingContent message="Loading reviews..." />
    ) : reviews.length === 0 ? (
      <div className="no-reviews">
        <i className="fa-solid fa-star-half-stroke"></i>
        <p>No reviews yet.</p>
        <button className="btn-review" onClick={() => navigate(`/profile/${userId}`)}>
          <i className="fa-solid fa-star"></i> Share your profile to get reviews
        </button>
      </div>
    ) : (
      <div className="reviews-list">
        {reviews.map((review) => (
          <div key={review.id} className="review-card">
            <div className="review-header">
              <div className="reviewer-info">
                <img
                  src={review.reviewerPhoto || `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`}
                  alt={review.reviewerName}
                  className="reviewer-avatar"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`;
                  }}
                />
                <div>
                  <h4>{review.reviewerName || 'Anonymous'}</h4>
                  <div className="review-stars">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <i key={star} className={`fa-solid fa-star ${star <= review.rating ? 'filled' : ''}`}></i>
                    ))}
                  </div>
                </div>
              </div>
              <span className="review-date">
                {review.createdAt?.toDate?.()?.toLocaleDateString() ||
                  review.createdAt?.split?.('T')?.[0] ||
                  'Recently'}
              </span>
            </div>
            <p className="review-text">{review.text}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ============================================================
// ✅ এক্সপেরিয়েন্স ট্যাব কম্পোনেন্ট
// ============================================================
export const ExperienceTab = ({
  experience,
  isEditingExperience,
  newExperience,
  onNewExperienceChange,
  onAddExperience,
  onDeleteExperience,
  onToggleEditExperience
}) => (
  <div className="tab-panel experience-panel">
    <div className="section-header">
      <h3><i className="fa-solid fa-briefcase"></i> Work Experience</h3>
      {!isEditingExperience && (
        <button className="add-btn" onClick={onToggleEditExperience}>
          <i className="fa-solid fa-plus"></i> Add Experience
        </button>
      )}
    </div>

    {isEditingExperience && (
      <div className="add-form">
        <input type="text" placeholder="Company" value={newExperience.company} onChange={(e) => onNewExperienceChange('company', e.target.value)} />
        <input type="text" placeholder="Role / Position" value={newExperience.role} onChange={(e) => onNewExperienceChange('role', e.target.value)} />
        <input type="text" placeholder="Start Date" value={newExperience.startDate} onChange={(e) => onNewExperienceChange('startDate', e.target.value)} />
        <input type="text" placeholder="End Date (or Present)" value={newExperience.endDate} onChange={(e) => onNewExperienceChange('endDate', e.target.value)} />
        <textarea placeholder="Description" value={newExperience.description} onChange={(e) => onNewExperienceChange('description', e.target.value)} rows="3" />
        <div className="form-actions">
          <button className="cancel-btn" onClick={onToggleEditExperience}>Cancel</button>
          <button className="save-btn" onClick={onAddExperience}>Add</button>
        </div>
      </div>
    )}

    {experience.length === 0 && !isEditingExperience ? (
      <div className="empty-state">
        <i className="fa-solid fa-briefcase"></i>
        <p>No experience added yet</p>
      </div>
    ) : (
      experience.map(exp => (
        <div key={exp.id} className="item-card">
          <div className="item-header">
            <h4>{exp.role} at {exp.company}</h4>
            <button className="delete-btn" onClick={() => onDeleteExperience(exp.id)}>
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>
          <p className="item-date">{exp.startDate} - {exp.endDate || 'Present'}</p>
          <p className="item-description">{exp.description}</p>
        </div>
      ))
    )}
  </div>
);

// ============================================================
// ✅ এডুকেশন ট্যাব কম্পোনেন্ট
// ============================================================
export const EducationTab = ({
  education,
  isEditingEducation,
  newEducation,
  onNewEducationChange,
  onAddEducation,
  onDeleteEducation,
  onToggleEditEducation
}) => (
  <div className="tab-panel education-panel">
    <div className="section-header">
      <h3><i className="fa-solid fa-graduation-cap"></i> Education</h3>
      {!isEditingEducation && (
        <button className="add-btn" onClick={onToggleEditEducation}>
          <i className="fa-solid fa-plus"></i> Add Education
        </button>
      )}
    </div>

    {isEditingEducation && (
      <div className="add-form">
        <input type="text" placeholder="Institution" value={newEducation.institution} onChange={(e) => onNewEducationChange('institution', e.target.value)} />
        <input type="text" placeholder="Degree" value={newEducation.degree} onChange={(e) => onNewEducationChange('degree', e.target.value)} />
        <input type="text" placeholder="Field of Study" value={newEducation.field} onChange={(e) => onNewEducationChange('field', e.target.value)} />
        <input type="text" placeholder="Start Date" value={newEducation.startDate} onChange={(e) => onNewEducationChange('startDate', e.target.value)} />
        <input type="text" placeholder="End Date" value={newEducation.endDate} onChange={(e) => onNewEducationChange('endDate', e.target.value)} />
        <div className="form-actions">
          <button className="cancel-btn" onClick={onToggleEditEducation}>Cancel</button>
          <button className="save-btn" onClick={onAddEducation}>Add</button>
        </div>
      </div>
    )}

    {education.length === 0 && !isEditingEducation ? (
      <div className="empty-state">
        <i className="fa-solid fa-graduation-cap"></i>
        <p>No education added yet</p>
      </div>
    ) : (
      education.map(edu => (
        <div key={edu.id} className="item-card">
          <div className="item-header">
            <h4>{edu.degree} - {edu.field}</h4>
            <button className="delete-btn" onClick={() => onDeleteEducation(edu.id)}>
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>
          <p className="item-institution">{edu.institution}</p>
          <p className="item-date">{edu.startDate} - {edu.endDate || 'Present'}</p>
        </div>
      ))
    )}
  </div>
);

// ============================================================
// ✅ সার্টিফিকেশন ট্যাব কম্পোনেন্ট
// ============================================================
export const CertificationsTab = ({
  certifications,
  isEditingCertifications,
  newCertification,
  onNewCertificationChange,
  onAddCertification,
  onDeleteCertification,
  onToggleEditCertifications
}) => (
  <div className="tab-panel certifications-panel">
    <div className="section-header">
      <h3><i className="fa-solid fa-award"></i> Certifications</h3>
      {!isEditingCertifications && (
        <button className="add-btn" onClick={onToggleEditCertifications}>
          <i className="fa-solid fa-plus"></i> Add Certification
        </button>
      )}
    </div>

    {isEditingCertifications && (
      <div className="add-form">
        <input type="text" placeholder="Certification Name" value={newCertification.name} onChange={(e) => onNewCertificationChange('name', e.target.value)} />
        <input type="text" placeholder="Issuer" value={newCertification.issuer} onChange={(e) => onNewCertificationChange('issuer', e.target.value)} />
        <input type="text" placeholder="Date" value={newCertification.date} onChange={(e) => onNewCertificationChange('date', e.target.value)} />
        <input type="url" placeholder="Certificate Link (Optional)" value={newCertification.link} onChange={(e) => onNewCertificationChange('link', e.target.value)} />
        <div className="form-actions">
          <button className="cancel-btn" onClick={onToggleEditCertifications}>Cancel</button>
          <button className="save-btn" onClick={onAddCertification}>Add</button>
        </div>
      </div>
    )}

    {certifications.length === 0 && !isEditingCertifications ? (
      <div className="empty-state">
        <i className="fa-solid fa-award"></i>
        <p>No certifications added yet</p>
      </div>
    ) : (
      certifications.map(cert => (
        <div key={cert.id} className="item-card">
          <div className="item-header">
            <h4>{cert.name}</h4>
            <button className="delete-btn" onClick={() => onDeleteCertification(cert.id)}>
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>
          <p className="item-issuer">Issued by: {cert.issuer}</p>
          <p className="item-date">{cert.date}</p>
          {cert.link && <a href={cert.link} target="_blank" rel="noopener noreferrer" className="cert-link">🔗 View Certificate</a>}
        </div>
      ))
    )}
  </div>
);

// ============================================================
// ✅ সোশ্যাল লিংক ট্যাব কম্পোনেন্ট
// ============================================================
export const SocialLinksTab = ({ socialLinks, onSocialLinkChange, onSaveSocialLinks }) => (
  <div className="tab-panel social-panel">
    <h3><i className="fa-solid fa-share-nodes"></i> Connect</h3>

    <div className="social-form">
      <div className="form-group">
        <label><i className="fa-brands fa-linkedin"></i> LinkedIn</label>
        <input type="url" placeholder="https://linkedin.com/in/yourprofile" value={socialLinks.linkedin} onChange={(e) => onSocialLinkChange('linkedin', e.target.value)} />
      </div>
      <div className="form-group">
        <label><i className="fa-brands fa-github"></i> GitHub</label>
        <input type="url" placeholder="https://github.com/yourusername" value={socialLinks.github} onChange={(e) => onSocialLinkChange('github', e.target.value)} />
      </div>
      <div className="form-group">
        <label><i className="fa-solid fa-globe"></i> Website / Portfolio</label>
        <input type="url" placeholder="https://yourwebsite.com" value={socialLinks.website} onChange={(e) => onSocialLinkChange('website', e.target.value)} />
      </div>
      <button className="save-btn" onClick={onSaveSocialLinks}>
        <i className="fa-solid fa-check"></i> Save Links
      </button>
    </div>

    <div className="social-preview">
      {socialLinks.linkedin && <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-linkedin"></i> LinkedIn</a>}
      {socialLinks.github && <a href={socialLinks.github} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-github"></i> GitHub</a>}
      {socialLinks.website && <a href={socialLinks.website} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-globe"></i> Website</a>}
    </div>
  </div>
);

// ============================================================
// ✅ About ও Skills ট্যাব কম্পোনেন্ট
// ============================================================
export const AboutTab = ({ about }) => (
  <div className="about-section">
    <div className="about-card">
      <h3><i className="fa-solid fa-user-pen"></i> About Me</h3>
      <p>{about}</p>
    </div>
  </div>
);

export const SkillsTab = ({ skills }) => (
  <div className="skills-section">
    <div className="skills-card">
      <h3><i className="fa-solid fa-code"></i> Core Skills</h3>
      <div className="skills-chip-container">
        {skills?.split(',').map((skill, idx) => (
          <span key={idx} className="skill-chip">{skill.trim()}</span>
        )) || <p>No skills added yet</p>}
      </div>
    </div>
  </div>
);