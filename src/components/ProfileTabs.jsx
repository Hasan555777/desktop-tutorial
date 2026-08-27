// src/components/ProfileTabs.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './ProfileTabs.module.css';

const formatDeadlineDisplay = (deadline) => {
  if (deadline === null || deadline === undefined) return '0';
  
  if (typeof deadline === 'number') {
    if (deadline < 1440) {
      if (deadline < 60) {
        return `${deadline} মিনিট`;
      }
      const hours = Math.floor(deadline / 60);
      const minutes = deadline % 60;
      if (minutes === 0) {
        return `${hours} ঘন্টা`;
      }
      return `${hours} ঘন্টা ${minutes} মিনিট`;
    }
    const days = Math.ceil(deadline / 1440);
    const remainingMinutes = deadline % 1440;
    if (remainingMinutes === 0) {
      return `${days} দিন`;
    }
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    if (hours === 0) {
      return `${days} দিন ${minutes} মিনিট`;
    }
    return `${days} দিন ${hours} ঘন্টা`;
  }
  
  if (typeof deadline === 'string') return deadline;
  if (typeof deadline === 'object') {
    if (deadline.type === 'range') {
      const min = deadline.min || 0;
      const max = deadline.max || 0;
      return `${min}-${max}`;
    }
    const days = deadline.days || 0;
    return String(days);
  }
  return String(deadline);
};

// ============================================================
// ✅ Loading Component (Reusable)
// ============================================================
export const LoadingContent = ({ message = 'Loading...' }) => (
  <div className={styles.loadingContent}>
    <i className={`fa-solid fa-spinner fa-spin ${styles.loadingIcon}`} />
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
      <div className={styles.noPosts}>
        <i className="fa-solid fa-folder-open"></i>
        <p>{emptyMessage}</p>
        {activeTab === 'posts' && (
          <button className={styles.createPostBtn} onClick={() => navigate('/')}>
            <i className="fa-solid fa-plus"></i> Create {currentMode === 'buyer' ? 'Job' : 'Service'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.postsGrid}>
      {posts.map((post, index) => (
        <div key={`${post.id}-${index}`} className={styles.postCard}>
          {post.images && post.images.length > 0 && (
            <div className={`${styles.postImagesContainer} ${post.images.length > 1 ? styles.twoImages : styles.oneImage}`}>
              {post.images.slice(0, 2).map((img, imgIndex) => (
                <img
                  key={imgIndex}
                  src={`${img.split('?')[0]}?v=${post._updatedAt || Date.now()}`}
                  alt={post.title}
                  className={styles.postImage}
                />
              ))}
              {post.images.length > 2 && (
                <div className={styles.postImageBadge}>+{post.images.length - 2}</div>
              )}
            </div>
          )}

          <div className={styles.postContent}>
            <h4>{post.title}</h4>
            <p className={styles.postDescription}>{post.description?.substring(0, 100)}...</p>
            <div className={styles.postMeta}>
              <span><i className="fa-solid fa-wallet"></i> {post.budget || post.price} BDT</span>
              <span><i className="fa-regular fa-clock"></i> {formatDeadlineDisplay(post.deadline || post.deliveryDays)}</span>
              <span><i className="fa-solid fa-tag"></i> {post.type === 'hire' ? 'Job' : 'Service'}</span>
            </div>
            {activeTab === 'posts' && (
              <div className={styles.postActions}>
                <button className={styles.editPostBtn} onClick={() => onEdit(post)}>
                  <i className="fa-solid fa-pen"></i> Edit
                </button>
                <button className={styles.forceDeleteBtn} onClick={() => onDelete(post.id)}>
                  <i className="fa-solid fa-trash"></i> Delete
                </button>
              </div>
            )}
            {activeTab === 'saved' && (
              <button className={styles.unsaveBtn} onClick={() => onUnsave(post.id)}>
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
  <div className={`${styles.tabPanel} ${styles.documentsPanel}`}>
    <h3><i className="fa-solid fa-file"></i> ডকুমেন্ট যাচাই</h3>
    <p className={styles.tabSubtitle}>আপনার পরিচয় প্রমাণের জন্য ডকুমেন্ট আপলোড করুন</p>

    <div className={styles.verificationStatusBox}>
      <div className={`${styles.statusBadgeLarge} ${styles[verificationStatus]}`}>
        {verificationStatus === 'verified' && '✅ যাচাইকৃত'}
        {verificationStatus === 'pending' && '⏳ যাচাই বাকি'}
        {verificationStatus === 'rejected' && '❌ প্রত্যাখ্যাত'}
      </div>
      {isVerified && (
        <div className={styles.verifiedBadge}>
          <i className="fa-solid fa-check-circle"></i> আপনার অ্যাকাউন্ট যাচাই করা হয়েছে
        </div>
      )}
    </div>

    {docStatus.documentsUploaded ? (
      <div className={`${styles.infoBox} ${styles.success}`}>
        <span className={styles.infoIcon}>✅</span>
        <div>
          <strong>ডকুমেন্ট আপলোড সম্পন্ন!</strong>
          <p>আপনার ডকুমেন্ট অ্যাডমিন দ্বারা যাচাই করা হচ্ছে।</p>
        </div>
      </div>
    ) : (
      <>
        <div className={styles.uploadRow}>
          <div className={styles.formGroup}>
            <label>NID কার্ড (সামনে) <span className={styles.required}>*</span></label>
            <div
              className={`${styles.uploadArea} ${docPreviews.nidFront ? styles.hasFile : ''}`}
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
                <div className={styles.uploadPreviewContainer}>
                  <img src={docPreviews.nidFront} alt="NID Front Preview" className={styles.uploadPreview} />
                  <button
                    type="button"
                    className={styles.uploadRemoveBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveDocFile('nidFront');
                    }}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              ) : (
                <div className={styles.uploadDefault}>
                  <div className={styles.uploadIcon}>🪪</div>
                  <div className={styles.uploadLabel}>সামনের ছবি</div>
                </div>
              )}
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>NID কার্ড (পিছনে) <span className={styles.required}>*</span></label>
            <div
              className={`${styles.uploadArea} ${docPreviews.nidBack ? styles.hasFile : ''}`}
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
                <div className={styles.uploadPreviewContainer}>
                  <img src={docPreviews.nidBack} alt="NID Back Preview" className={styles.uploadPreview} />
                  <button
                    type="button"
                    className={styles.uploadRemoveBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveDocFile('nidBack');
                    }}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              ) : (
                <div className={styles.uploadDefault}>
                  <div className={styles.uploadIcon}>🔄</div>
                  <div className={styles.uploadLabel}>পিছনের ছবি</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>জন্ম নিবন্ধন সনদ</label>
          <div
            className={`${styles.uploadArea} ${docPreviews.birthCert ? styles.hasFile : ''}`}
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
              <div className={styles.uploadPreviewContainer}>
                {selectedDocs.birthCert?.type === 'application/pdf' ? (
                  <div className={styles.pdfPreview} onClick={() => onPdfPreview(selectedDocs.birthCert)}>
                    <i className="fa-solid fa-file-pdf"></i>
                    <span>{selectedDocs.birthCert.name}</span>
                    <button className={styles.pdfViewBtn}>👁️ দেখুন</button>
                  </div>
                ) : (
                  <img src={docPreviews.birthCert} alt="Birth Cert Preview" className={styles.uploadPreview} />
                )}
                <button
                  type="button"
                  className={styles.uploadRemoveBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveDocFile('birthCert');
                  }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            ) : (
              <div className={styles.uploadDefault}>
                <div className={styles.uploadIcon}>📄</div>
                <div className={styles.uploadLabel}>সনদের ছবি বা PDF</div>
              </div>
            )}
          </div>
        </div>

        {uploadingDocs && (
          <div className={styles.uploadProgress}>
            <div className={styles.progressText}>আপলোড হচ্ছে... {Math.round(uploadProgress)}%</div>
            <div className={styles.progressBarSmall}>
              <div className={styles.progressFillSmall} style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
        )}

        <button className={styles.saveBtn} onClick={onUploadDocuments} disabled={uploadingDocs}>
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
  <div className={`${styles.tabPanel} ${styles.facePanel}`}>
    <h3><i className="fa-solid fa-camera"></i> মুখমণ্ডল যাচাই</h3>
    <p className={styles.tabSubtitle}>নিচের নির্দেশনা অনুসরণ করুন</p>

    {docStatus.faceVerified || faceVerified ? (
      <div className={`${styles.infoBox} ${styles.success}`}>
        <span className={styles.infoIcon}>✅</span>
        <div>
          <strong>মুখমণ্ডল যাচাই সম্পন্ন!</strong>
          <p>আপনার ফেস ভেরিফিকেশন সফলভাবে সম্পন্ন হয়েছে।</p>
        </div>
      </div>
    ) : (
      <>
        <div className={styles.livenessInstructions}>
          {livenessState.map((step, index) => (
            <div 
              key={step.id} 
              className={`${styles.instructionStep} ${step.done ? styles.done : ''} ${index === currentLivenessStep && camStream ? styles.active : ''}`}
            >
              <div className={styles.instText}>{step.label}</div>
              <div className={styles.instStatus}>
                {step.done ? '✅' : index === currentLivenessStep && camStream ? '⏳' : '⬜'}
              </div>
            </div>
          ))}
        </div>

        <div className={`${styles.cameraBox} ${camStream ? styles.cameraActive : ''}`} ref={cameraBoxRef}>
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline
            style={{ display: camStream ? 'block' : 'none', width: '100%' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {!camStream && (
            <div className={styles.cameraPlaceholder}>
              <span>📷</span>
              <div>ক্যামেরা চালু করুন</div>
            </div>
          )}
        </div>

        <div className={styles.livenessProgress}>
          <div className={styles.progressText} id="livenessProgressText">০/{livenessState.length} সম্পন্ন</div>
          <div className={styles.progressBarSmall}>
            <div className={styles.progressFillSmall} id="livenessProgressFill" style={{ width: '0%' }}></div>
          </div>
        </div>

        <div className={styles.btnRow}>
          <button 
            className={`${styles.btn} ${styles.btnGhost}`} 
            ref={camStartBtnRef}
            onClick={startCamera}
            disabled={!!camStream}
          >
            📷 ক্যামেরা চালু
          </button>
          <button 
            className={`${styles.btn} ${styles.btnPrimary}`} 
            ref={captureBtnRef}
            onClick={capturePhoto}
            style={{ display: 'none' }}
            disabled={!livenessComplete}
          >
            📸 ছবি তুলুন
          </button>
          <button 
            className={`${styles.btn} ${styles.btnDanger}`} 
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
// ✅ রিভিউ ট্যাব কম্পোনেন্ট
// ============================================================
export const ReviewsTab = ({ reviews, reviewsLoading, userRating, navigate, userId }) => (
  <div className={`${styles.tabPanel} ${styles.reviewsPanel}`}>
    <div className={styles.reviewsHeader}>
      <h3>
        <i className="fa-solid fa-star" style={{ color: '#fbbf24' }}></i>
        Reviews ({reviews.length})
      </h3>
      {reviews.length > 0 && (
        <div className={styles.averageRating}>
          <span className={styles.ratingNumber}>{userRating.average}</span>
          <div className={styles.ratingStars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <i key={star} className={`fa-solid fa-star ${star <= Math.round(userRating.average) ? styles.filled : ''}`}></i>
            ))}
          </div>
          <span className={styles.ratingTotal}>({userRating.total} reviews)</span>
        </div>
      )}
    </div>

    {reviewsLoading ? (
      <LoadingContent message="Loading reviews..." />
    ) : reviews.length === 0 ? (
      <div className={styles.noReviews}>
        <i className="fa-solid fa-star-half-stroke"></i>
        <p>No reviews yet.</p>
        <button className={styles.btnReview} onClick={() => navigate(`/profile/${userId}`)}>
          <i className="fa-solid fa-star"></i> Share your profile to get reviews
        </button>
      </div>
    ) : (
      <div className={styles.reviewsList}>
        {reviews.map((review) => (
          <div key={review.id} className={styles.reviewCard}>
            <div className={styles.reviewHeader}>
              <div className={styles.reviewerInfo}>
                <img
                  src={review.reviewerPhoto || `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`}
                  alt={review.reviewerName}
                  className={styles.reviewerAvatar}
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${review.reviewerName || 'User'}&background=14b8a6&color=fff&bold=true&size=40`;
                  }}
                />
                <div>
                  <h4>{review.reviewerName || 'Anonymous'}</h4>
                  <div className={styles.reviewStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <i key={star} className={`fa-solid fa-star ${star <= review.rating ? styles.filled : ''}`}></i>
                    ))}
                  </div>
                </div>
              </div>
              <span className={styles.reviewDate}>
                {review.createdAt?.toDate?.()?.toLocaleDateString() ||
                  review.createdAt?.split?.('T')?.[0] ||
                  'Recently'}
              </span>
            </div>
            <p className={styles.reviewText}>{review.text}</p>
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
  <div className={`${styles.tabPanel} ${styles.experiencePanel}`}>
    <div className={styles.sectionHeader}>
      <h3><i className="fa-solid fa-briefcase"></i> Work Experience</h3>
      {!isEditingExperience && (
        <button className={styles.addBtn} onClick={onToggleEditExperience}>
          <i className="fa-solid fa-plus"></i> Add Experience
        </button>
      )}
    </div>

    {isEditingExperience && (
      <div className={styles.addForm}>
        <input type="text" placeholder="Company" value={newExperience.company} onChange={(e) => onNewExperienceChange('company', e.target.value)} />
        <input type="text" placeholder="Role / Position" value={newExperience.role} onChange={(e) => onNewExperienceChange('role', e.target.value)} />
        <input type="text" placeholder="Start Date" value={newExperience.startDate} onChange={(e) => onNewExperienceChange('startDate', e.target.value)} />
        <input type="text" placeholder="End Date (or Present)" value={newExperience.endDate} onChange={(e) => onNewExperienceChange('endDate', e.target.value)} />
        <textarea placeholder="Description" value={newExperience.description} onChange={(e) => onNewExperienceChange('description', e.target.value)} rows="3" />
        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={onToggleEditExperience}>Cancel</button>
          <button className={styles.saveBtn} onClick={onAddExperience}>Add</button>
        </div>
      </div>
    )}

    {experience.length === 0 && !isEditingExperience ? (
      <div className={styles.emptyState}>
        <i className="fa-solid fa-briefcase"></i>
        <p>No experience added yet</p>
      </div>
    ) : (
      experience.map(exp => (
        <div key={exp.id} className={styles.itemCard}>
          <div className={styles.itemHeader}>
            <h4>{exp.role} at {exp.company}</h4>
            <button className={styles.deleteBtn} onClick={() => onDeleteExperience(exp.id)}>
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>
          <p className={styles.itemDate}>{exp.startDate} - {exp.endDate || 'Present'}</p>
          <p className={styles.itemDescription}>{exp.description}</p>
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
  <div className={`${styles.tabPanel} ${styles.educationPanel}`}>
    <div className={styles.sectionHeader}>
      <h3><i className="fa-solid fa-graduation-cap"></i> Education</h3>
      {!isEditingEducation && (
        <button className={styles.addBtn} onClick={onToggleEditEducation}>
          <i className="fa-solid fa-plus"></i> Add Education
        </button>
      )}
    </div>

    {isEditingEducation && (
      <div className={styles.addForm}>
        <input type="text" placeholder="Institution" value={newEducation.institution} onChange={(e) => onNewEducationChange('institution', e.target.value)} />
        <input type="text" placeholder="Degree" value={newEducation.degree} onChange={(e) => onNewEducationChange('degree', e.target.value)} />
        <input type="text" placeholder="Field of Study" value={newEducation.field} onChange={(e) => onNewEducationChange('field', e.target.value)} />
        <input type="text" placeholder="Start Date" value={newEducation.startDate} onChange={(e) => onNewEducationChange('startDate', e.target.value)} />
        <input type="text" placeholder="End Date" value={newEducation.endDate} onChange={(e) => onNewEducationChange('endDate', e.target.value)} />
        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={onToggleEditEducation}>Cancel</button>
          <button className={styles.saveBtn} onClick={onAddEducation}>Add</button>
        </div>
      </div>
    )}

    {education.length === 0 && !isEditingEducation ? (
      <div className={styles.emptyState}>
        <i className="fa-solid fa-graduation-cap"></i>
        <p>No education added yet</p>
      </div>
    ) : (
      education.map(edu => (
        <div key={edu.id} className={styles.itemCard}>
          <div className={styles.itemHeader}>
            <h4>{edu.degree} - {edu.field}</h4>
            <button className={styles.deleteBtn} onClick={() => onDeleteEducation(edu.id)}>
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>
          <p className={styles.itemInstitution}>{edu.institution}</p>
          <p className={styles.itemDate}>{edu.startDate} - {edu.endDate || 'Present'}</p>
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
  <div className={`${styles.tabPanel} ${styles.certificationsPanel}`}>
    <div className={styles.sectionHeader}>
      <h3><i className="fa-solid fa-award"></i> Certifications</h3>
      {!isEditingCertifications && (
        <button className={styles.addBtn} onClick={onToggleEditCertifications}>
          <i className="fa-solid fa-plus"></i> Add Certification
        </button>
      )}
    </div>

    {isEditingCertifications && (
      <div className={styles.addForm}>
        <input type="text" placeholder="Certification Name" value={newCertification.name} onChange={(e) => onNewCertificationChange('name', e.target.value)} />
        <input type="text" placeholder="Issuer" value={newCertification.issuer} onChange={(e) => onNewCertificationChange('issuer', e.target.value)} />
        <input type="text" placeholder="Date" value={newCertification.date} onChange={(e) => onNewCertificationChange('date', e.target.value)} />
        <input type="url" placeholder="Certificate Link (Optional)" value={newCertification.link} onChange={(e) => onNewCertificationChange('link', e.target.value)} />
        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={onToggleEditCertifications}>Cancel</button>
          <button className={styles.saveBtn} onClick={onAddCertification}>Add</button>
        </div>
      </div>
    )}

    {certifications.length === 0 && !isEditingCertifications ? (
      <div className={styles.emptyState}>
        <i className="fa-solid fa-award"></i>
        <p>No certifications added yet</p>
      </div>
    ) : (
      certifications.map(cert => (
        <div key={cert.id} className={styles.itemCard}>
          <div className={styles.itemHeader}>
            <h4>{cert.name}</h4>
            <button className={styles.deleteBtn} onClick={() => onDeleteCertification(cert.id)}>
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>
          <p className={styles.itemIssuer}>Issued by: {cert.issuer}</p>
          <p className={styles.itemDate}>{cert.date}</p>
          {cert.link && <a href={cert.link} target="_blank" rel="noopener noreferrer" className={styles.certLink}>🔗 View Certificate</a>}
        </div>
      ))
    )}
  </div>
);

// ============================================================
// ✅ সোশ্যাল লিংক ট্যাব কম্পোনেন্ট
// ============================================================
export const SocialLinksTab = ({ socialLinks, onSocialLinkChange, onSaveSocialLinks }) => (
  <div className={`${styles.tabPanel} ${styles.socialPanel}`}>
    <h3><i className="fa-solid fa-share-nodes"></i> Connect</h3>

    <div className={styles.socialForm}>
      <div className={styles.formGroup}>
        <label><i className="fa-brands fa-linkedin"></i> LinkedIn</label>
        <input type="url" placeholder="https://linkedin.com/in/yourprofile" value={socialLinks.linkedin} onChange={(e) => onSocialLinkChange('linkedin', e.target.value)} />
      </div>
      <div className={styles.formGroup}>
        <label><i className="fa-brands fa-github"></i> GitHub</label>
        <input type="url" placeholder="https://github.com/yourusername" value={socialLinks.github} onChange={(e) => onSocialLinkChange('github', e.target.value)} />
      </div>
      <div className={styles.formGroup}>
        <label><i className="fa-solid fa-globe"></i> Website / Portfolio</label>
        <input type="url" placeholder="https://yourwebsite.com" value={socialLinks.website} onChange={(e) => onSocialLinkChange('website', e.target.value)} />
      </div>
      <button className={styles.saveBtn} onClick={onSaveSocialLinks}>
        <i className="fa-solid fa-check"></i> Save Links
      </button>
    </div>

    <div className={styles.socialPreview}>
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
  <div className={styles.aboutSection}>
    <div className={styles.aboutCard}>
      <h3><i className="fa-solid fa-user-pen"></i> About Me</h3>
      <p>{about}</p>
    </div>
  </div>
);

export const SkillsTab = ({ skills }) => (
  <div className={styles.skillsSection}>
    <div className={styles.skillsCard}>
      <h3><i className="fa-solid fa-code"></i> Core Skills</h3>
      <div className={styles.skillsChipContainer}>
        {skills?.split(',').map((skill, idx) => (
          <span key={idx} className={styles.skillChip}>{skill.trim()}</span>
        )) || <p>No skills added yet</p>}
      </div>
    </div>
  </div>
);