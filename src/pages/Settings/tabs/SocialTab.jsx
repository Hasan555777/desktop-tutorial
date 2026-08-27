// src/pages/Settings/tabs/SocialTab.jsx

import React, { useState } from 'react';
import './SocialTab.css';

const SocialTab = ({ 
  socialLinks, 
  setSocialLinks, 
  onSaveSocialLinks,
  saving = false 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // ── Social Link Change Handler ──
  const handleChange = (key, value) => {
    setSocialLinks(prev => ({
      ...prev,
      [key]: value
    }));
    
    // Clear validation error when typing
    if (validationErrors[key]) {
      setValidationErrors(prev => ({ ...prev, [key]: null }));
    }
  };

  // ── Validate URL ──
  const validateUrl = (key, value) => {
    if (!value) return true;
    
    const platform = socialPlatforms.find(p => p.key === key);
    if (!platform) return true;
    
    // Check if it's a valid URL
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    if (!urlPattern.test(value)) {
      return false;
    }
    
    // Platform-specific validation
    if (key === 'linkedin' && !value.includes('linkedin.com')) {
      return false;
    }
    if (key === 'github' && !value.includes('github.com')) {
      return false;
    }
    if (key === 'facebook' && !value.includes('facebook.com')) {
      return false;
    }
    if (key === 'youtube' && !value.includes('youtube.com')) {
      return false;
    }
    if (key === 'instagram' && !value.includes('instagram.com')) {
      return false;
    }
    if (key === 'twitter' && !value.includes('twitter.com') && !value.includes('x.com')) {
      return false;
    }
    
    return true;
  };

  // ── Save Handler ──
  const handleSave = async () => {
    // Validate all URLs before saving
    let hasError = false;
    const errors = {};
    
    Object.keys(socialLinks).forEach(key => {
      const value = socialLinks[key];
      if (value && !validateUrl(key, value)) {
        errors[key] = 'সঠিক URL দিন';
        hasError = true;
      }
    });
    
    if (hasError) {
      setValidationErrors(errors);
      return;
    }
    
    await onSaveSocialLinks();
    setIsEditing(false);
    setValidationErrors({});
  };

  // ── Social Platforms Configuration ──
  const socialPlatforms = [
    {
      key: 'linkedin',
      label: 'LinkedIn',
      icon: 'fa-brands fa-linkedin',
      color: '#0A66C2',
      placeholder: 'https://linkedin.com/in/yourusername'
    },
    {
      key: 'github',
      label: 'GitHub',
      icon: 'fa-brands fa-github',
      color: '#333333',
      placeholder: 'https://github.com/yourusername'
    },
    {
      key: 'facebook',
      label: 'Facebook',
      icon: 'fa-brands fa-facebook',
      color: '#1877F2',
      placeholder: 'https://facebook.com/yourusername'
    },
    {
      key: 'instagram',
      label: 'Instagram',
      icon: 'fa-brands fa-instagram',
      color: '#E4405F',
      placeholder: 'https://instagram.com/yourusername'
    },
    {
      key: 'twitter',
      label: 'Twitter / X',
      icon: 'fa-brands fa-twitter',
      color: '#000000',
      placeholder: 'https://twitter.com/yourusername'
    },
    {
      key: 'youtube',
      label: 'YouTube',
      icon: 'fa-brands fa-youtube',
      color: '#FF0000',
      placeholder: 'https://youtube.com/@yourchannel'
    },
    {
      key: 'website',
      label: 'ওয়েবসাইট / পোর্টফোলিও',
      icon: 'fa-solid fa-globe',
      color: '#14b8a6',
      placeholder: 'https://yourwebsite.com'
    }
  ];

  // ── Check if any link exists ──
  const hasLinks = Object.values(socialLinks).some(value => value?.trim());

  // ── Copy to clipboard ──
  const handleCopyLink = (url) => {
    navigator.clipboard.writeText(url);
    // You can add toast notification here
  };

  // ── Render Social Input ──
  const renderSocialInput = ({ key, label, icon, placeholder, color }) => {
    const value = socialLinks[key] || '';
    const isValid = validateUrl(key, value);
    const error = validationErrors[key];

    return (
      <div key={key} className="form-group">
        <label htmlFor={`social-${key}`}>
          <i className={icon} style={{ color }}></i> {label}
        </label>
        <div className="social-input-wrapper">
          <input
            id={`social-${key}`}
            type="url"
            className={`social-input ${error ? 'error' : !isValid && value ? 'invalid' : ''}`}
            placeholder={placeholder}
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            disabled={!isEditing}
          />
          {value && (
            <>
              {isValid && (
                <button 
                  className="social-link-copy"
                  onClick={() => handleCopyLink(value)}
                  title="কপি করুন"
                >
                  <i className="fa-regular fa-copy"></i>
                </button>
              )}
              <a 
                href={value} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="social-link-preview"
                title="খুলুন"
              >
                <i className="fa-solid fa-arrow-up-right-from-square"></i>
              </a>
            </>
          )}
          {error && (
            <span className="social-input-error" title={error}>
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span className="error-text">{error}</span>
            </span>
          )}
        </div>
        <small className="form-hint">
          <i className="fa-regular fa-circle-info"></i> 
          https:// সহ সম্পূর্ণ URL দিন
        </small>
      </div>
    );
  };

  // ── Render Social Preview ──
  const renderSocialPreview = () => {
    const activeLinks = socialPlatforms.filter(({ key }) => socialLinks[key]?.trim());

    if (activeLinks.length === 0) return null;

    return (
      <div className="social-preview-section">
        <h4>
          <i className="fa-solid fa-eye"></i> প্রিভিউ
        </h4>
        <div className="social-preview-links">
          {activeLinks.map(({ key, label, icon, color }) => (
            <a
              key={key}
              href={socialLinks[key]}
              target="_blank"
              rel="noopener noreferrer"
              className="social-preview-link"
              style={{ '--hover-color': color }}
            >
              <i className={icon} style={{ color }}></i>
              <span>{label}</span>
              <i className="fa-solid fa-arrow-up-right-from-square"></i>
            </a>
          ))}
        </div>
      </div>
    );
  };

  // ── Render YouTube Preview ──
  const renderYouTubePreview = () => {
    const youtubeUrl = socialLinks.youtube;
    if (!youtubeUrl) return null;

    return (
      <div className="youtube-preview-section">
        <h4>
          <i className="fa-brands fa-youtube" style={{ color: '#FF0000' }}></i> YouTube চ্যানেল
        </h4>
        <div className="youtube-preview-card">
          <div className="youtube-icon">
            <i className="fa-brands fa-youtube"></i>
          </div>
          <div className="youtube-info">
            <p>আপনার YouTube চ্যানেল লিঙ্ক সংরক্ষিত হয়েছে</p>
            <a 
              href={youtubeUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="youtube-visit-btn"
            >
              <i className="fa-solid fa-play"></i> চ্যানেল দেখুন
            </a>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // ✅ Main Render
  // ============================================================
  return (
    <div className="settings-section social-tab">
      <div className="tab-header">
        <h2>
          <i className="fa-solid fa-share-nodes"></i> সোশ্যাল লিংক
        </h2>
        <p className="tab-subtitle">
          আপনার সোশ্যাল মিডিয়া প্রোফাইল যুক্ত করুন
        </p>
        
        
      </div>

      {/* ── Edit Mode Toggle ── */}
      <div className="social-actions">
        {!isEditing ? (
          <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
            <i className="fa-solid fa-pen"></i> লিংক এডিট করুন
          </button>
        ) : (
          <div className="social-edit-actions">
            <button className="btn btn-secondary" onClick={() => {
              setIsEditing(false);
              setValidationErrors({});
            }}>
              <i className="fa-solid fa-times"></i> বাতিল
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...</>
              ) : (
                <><i className="fa-solid fa-check"></i> সংরক্ষণ করুন</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Social Inputs ── */}
      <div className="social-inputs">
        {socialPlatforms.map((platform) => renderSocialInput(platform))}
      </div>

      {/* ── YouTube Preview ── */}
      {socialLinks.youtube && renderYouTubePreview()}

      {/* ── Social Preview ── */}
      {hasLinks && renderSocialPreview()}

      {/* ── No Links Message ── */}
      {!hasLinks && !isEditing && (
        <div className="empty-state">
          <i className="fa-solid fa-share-nodes"></i>
          <p>কোন সোশ্যাল লিংক যোগ করা হয়নি</p>
          <small>আপনার সোশ্যাল প্রোফাইল যোগ করতে "লিংক এডিট করুন" বাটনে ক্লিক করুন</small>
        </div>
      )}
    </div>
  );
};

export default SocialTab;