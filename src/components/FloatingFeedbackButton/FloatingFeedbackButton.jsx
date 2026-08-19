// src/components/FloatingFeedbackButton/FloatingFeedbackButton.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import './FloatingFeedbackButton.css';

// ============================================================
// ✅ Social Media Links
// ============================================================
const SOCIAL_LINKS = [
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'fa-brands fa-facebook',
    url: 'https://www.facebook.com/yourpage',
    color: '#1877f2',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'fa-brands fa-youtube',
    url: 'https://www.youtube.com/yourchannel',
    color: '#ff0000',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: 'fa-brands fa-telegram',
    url: 'https://t.me/yourchannel',
    color: '#0088cc',
  },
  // {
  //   id: 'whatsapp',
  //   name: 'WhatsApp',
  //   icon: 'fa-brands fa-whatsapp',
  //   url: 'https://wa.me/01891696262',
  //   color: '#25d366',
  // },
  // {
  //   id: 'instagram',
  //   name: 'Instagram',
  //   icon: 'fa-brands fa-instagram',
  //   url: 'https://www.instagram.com/yourpage',
  //   color: '#e4405f',
  // },
  // {
  //   id: 'twitter',
  //   name: 'Twitter',
  //   icon: 'fa-brands fa-twitter',
  //   url: 'https://twitter.com/yourpage',
  //   color: '#1da1f2',
  // },
];

const FloatingFeedbackButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [reportData, setReportData] = useState({
    type: 'complaint',
    subject: '',
    message: '',
    screenshot: null,
    screenshotPreview: null,
    pageUrl: window.location.href,
    userAgent: navigator.userAgent
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // ✅ ড্র্যাগ স্টেট
  const [isDragging, setIsDragging] = useState(false);
  
  // ✅ ডেস্কটপ/মোবাইল ডিটেক্ট করার জন্য স্টেট
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 768);

  // ✅ পজিশন স্টেট
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('feedbackButtonPosition');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        if (pos.x >= 0 && pos.y >= 0 && pos.x <= window.innerWidth - 60 && pos.y <= window.innerHeight - 60) {
          return pos;
        }
      } catch (e) {}
    }
    return { 
      x: window.innerWidth - 90, 
      y: window.innerHeight - 180 
    };
  });
  
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const isDraggingRef = useRef(false);

  const WHATSAPP_NUMBER = '01891696262';
  const EMAIL = 'hammanmusa362@gmail.com';

  // ✅ স্ক্রিন রিসাইজ হলে পজিশন চেক
  useEffect(() => {
    const handleResize = () => {
      const nowDesktop = window.innerWidth > 768;
      setIsDesktop(nowDesktop);
      
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;
      setPosition(prev => ({
        x: Math.min(prev.x, maxX),
        y: Math.min(prev.y, maxY)
      }));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============================================================
  // ✅ ডেস্কটপ ও মোবাইল ড্র্যাগ ইভেন্ট
  // ============================================================
  const handleDragStart = (e) => {
    const isTouch = e.type === 'touchstart';
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDragOffset({
      x: clientX - rect.left,
      y: clientY - rect.top
    });
    
    setIsDragging(true);
    isDraggingRef.current = true;
    
    if (isTouch) {
      document.addEventListener('touchmove', handleDragMove);
      document.addEventListener('touchend', handleDragEnd);
    } else {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
    }
    
    e.stopPropagation();
  };

  const handleDragMove = (e) => {
    if (!isDraggingRef.current) return;
    
    const isTouch = e.type === 'touchmove';
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    
    let newX = clientX - dragOffset.x;
    let newY = clientY - dragOffset.y;
    
    const buttonSize = 60;
    const maxX = window.innerWidth - buttonSize;
    const maxY = window.innerHeight - buttonSize;
    
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));
    
    setPosition({ x: newX, y: newY });
    
    e.preventDefault();
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
    
    localStorage.setItem('feedbackButtonPosition', JSON.stringify(position));
    
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('touchend', handleDragEnd);
  };

  // ── ক্লিক আউটসাইড ──
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) && !isDraggingRef.current) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── সোশ্যাল মিডিয়া লিংক হ্যান্ডেল ──
  const handleSocialLinkClick = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
    setShowSocialModal(false);
  };

  // ── হোয়াটসঅ্যাপে পাঠান ──
  const handleWhatsApp = () => {
    const message = `📢 *New Feedback/Report*\n\n` +
                    `👤 User: ${auth.currentUser?.displayName || 'Guest'}\n` +
                    `📧 Email: ${auth.currentUser?.email || 'N/A'}\n` +
                    `📱 UID: ${auth.currentUser?.uid || 'N/A'}\n` +
                    `📄 Page: ${window.location.href}\n` +
                    `🕐 Time: ${new Date().toLocaleString()}\n\n` +
                    `📝 Please describe your issue:`;
    
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    setIsOpen(false);
  };

  // ── ইমেইলে পাঠান ──
  const handleEmail = () => {
    const subject = encodeURIComponent('Feedback/Report from WorkTrustbd User');
    const body = encodeURIComponent(
      `📢 Feedback/Report\n\n` +
      `👤 User: ${auth.currentUser?.displayName || 'Guest'}\n` +
      `📧 Email: ${auth.currentUser?.email || 'N/A'}\n` +
      `📄 Page: ${window.location.href}\n` +
      `🕐 Time: ${new Date().toLocaleString()}\n\n` +
      `📝 Please describe your issue:\n\n`
    );
    window.open(`mailto:${EMAIL}?subject=${subject}&body=${body}`, '_blank');
    setIsOpen(false);
  };

  // ── রিপোর্ট সাবমিট ──
  const handleReportSubmit = async (e) => {
    e.preventDefault();
    
    if (!auth.currentUser) {
      toast.error('Please login to submit a report!');
      return;
    }

    if (!reportData.subject.trim() || !reportData.message.trim()) {
      toast.error('Please fill in all required fields!');
      return;
    }

    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'reports'), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        userName: auth.currentUser.displayName || 'User',
        type: reportData.type,
        subject: reportData.subject.trim(),
        message: reportData.message.trim(),
        pageUrl: reportData.pageUrl,
        userAgent: reportData.userAgent,
        screenshot: reportData.screenshotPreview || null,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'admin_notifications'), {
        type: 'new_report',
        title: '📢 নতুন অভিযোগ/পরামর্শ',
        message: `${reportData.subject} - ${reportData.message.substring(0, 100)}...`,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'User',
        isRead: false,
        createdAt: serverTimestamp()
      });

      toast.success('✅ Your report has been submitted successfully!');
      
      setReportData({
        type: 'complaint',
        subject: '',
        message: '',
        screenshot: null,
        screenshotPreview: null,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent
      });
      setShowReportModal(false);
      setIsOpen(false);

    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── স্ক্রিনশট হ্যান্ডেল ──
  const handleScreenshotChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReportData(prev => ({
          ...prev,
          screenshot: file,
          screenshotPreview: event.target.result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = () => {
    setReportData(prev => ({
      ...prev,
      screenshot: null,
      screenshotPreview: null
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ── টগল মেনু ──
  const toggleMenu = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* 🔥 ফ্লোটিং বাটন */}
      <div 
        className={`floating-feedback-container ${isDragging ? 'dragging' : ''}`}
        style={{
          position: 'fixed',
          left: position.x + 'px',
          top: position.y + 'px',
          zIndex: 9999,
          width: 'auto',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
      >
        <button 
          ref={buttonRef}
          className={`feedback-fab ${isOpen ? 'active' : ''}`}
          onClick={toggleMenu}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          aria-label="Feedback & Support"
          title="Feedback & Support"
        >
          <span className="fab-icon">
            <i className={`fa-solid ${isOpen ? 'fa-xmark' : 'fa-headset'}`}></i>
          </span>
          {!isOpen && <span className="fab-pulse"></span>}
          <span className="drag-indicator"><i className="fa-solid fa-grip-lines"></i></span>
        </button>

        {/* 📋 মেনু */}
        <div 
          className={`feedback-menu ${isOpen && !isDragging ? 'show' : ''}`}
          ref={menuRef}
        >
          <div className="menu-header">
            <div>
              <h4>
                <i className="fa-solid fa-message" style={{ color: '#14b8a6', marginRight: '8px' }}></i> 
                Need Help?
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>We're here to assist you</p>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent', border: 'none', color: '#94a3b8',
                fontSize: '20px', cursor: 'pointer', padding: '4px'
              }}
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div className="menu-items">
            {/* ✅ সোশ্যাল মিডিয়া বাটন - নতুন */}
            <button 
              className="menu-item social-toggle" 
              onClick={() => {
                setShowSocialModal(!showSocialModal);
              }}
            >
              <div className="menu-item-icon" style={{ color: '#8b5cf6' }}>
                <i className="fa-solid fa-share-nodes"></i>
              </div>
              <div className="menu-item-info">
                <span className="item-title">Social Media</span>
                <span className="item-desc">Connect with us</span>
              </div>
              <i className={`fa-solid fa-chevron-${showSocialModal ? 'up' : 'down'}`} style={{ color: '#94a3b8', fontSize: '12px' }}></i>
            </button>

            {/* ✅ সোশ্যাল মিডিয়া লিংক - ড্রপডাউন */}
            {showSocialModal && (
              <div className="social-links-dropdown">
                {SOCIAL_LINKS.map((social) => (
                  <button
                    key={social.id}
                    className="menu-item social-item"
                    onClick={() => handleSocialLinkClick(social.url)}
                  >
                    <div className="menu-item-icon" style={{ color: social.color }}>
                      <i className={social.icon}></i>
                    </div>
                    <div className="menu-item-info">
                      <span className="item-title">{social.name}</span>
                      <span className="item-desc">Follow us on {social.name}</span>
                    </div>
                    <i className="fa-solid fa-arrow-up-right-from-square" style={{ color: '#94a3b8', fontSize: '12px' }}></i>
                  </button>
                ))}
              </div>
            )}

            <button 
              className="menu-item" 
              onClick={() => {
                handleWhatsApp();
                setIsOpen(false);
              }}
            >
              <div className="menu-item-icon"><i className="fa-brands fa-whatsapp"></i></div>
              <div className="menu-item-info"><span className="item-title">WhatsApp</span><span className="item-desc">Chat with support</span></div>
            </button>

            <button 
              className="menu-item" 
              onClick={() => {
                handleEmail();
                setIsOpen(false);
              }}
            >
              <div className="menu-item-icon"><i className="fa-solid fa-envelope"></i></div>
              <div className="menu-item-info"><span className="item-title">Email</span><span className="item-desc">Send us an email</span></div>
            </button>

            <button 
              className="menu-item" 
              onClick={() => {
                setShowReportModal(true);
                setIsOpen(false);
              }}
            >
              <div className="menu-item-icon"><i className="fa-solid fa-flag"></i></div>
              <div className="menu-item-info"><span className="item-title">Report Issue</span><span className="item-desc">Submit a complaint</span></div>
            </button>

            <button 
              className="menu-item" 
              onClick={() => {
                setReportData(prev => ({ ...prev, type: 'suggestion' }));
                setShowReportModal(true);
                setIsOpen(false);
              }}
            >
              <div className="menu-item-icon"><i className="fa-solid fa-lightbulb"></i></div>
              <div className="menu-item-info"><span className="item-title">Suggestion</span><span className="item-desc">Share your feedback</span></div>
            </button>
          </div>

          <div className="menu-footer">
            <span>⚡ Quick response within 24hrs</span>
          </div>
        </div>
      </div>

      {/* 📝 রিপোর্ট মোডাল */}
      {showReportModal && (
        <div className="report-modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <i className="fa-solid fa-flag" style={{ marginRight: '8px' }}></i>
                {reportData.type === 'complaint' ? 'Report an Issue' : 'Share Suggestion'}
              </h3>
              <button className="modal-close" onClick={() => setShowReportModal(false)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleReportSubmit} className="report-form">
              <div className="form-group">
                <label>Type</label>
                <div className="type-selector">
                  <button 
                    type="button"
                    className={`type-btn ${reportData.type === 'complaint' ? 'active' : ''}`}
                    onClick={() => setReportData(prev => ({ ...prev, type: 'complaint' }))}
                  >
                    <i className="fa-solid fa-triangle-exclamation"></i> Complaint
                  </button>
                  <button 
                    type="button"
                    className={`type-btn ${reportData.type === 'suggestion' ? 'active' : ''}`}
                    onClick={() => setReportData(prev => ({ ...prev, type: 'suggestion' }))}
                  >
                    <i className="fa-solid fa-lightbulb"></i> Suggestion
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Subject <span className="required">*</span></label>
                <input
                  type="text"
                  placeholder="Brief subject of your report"
                  value={reportData.subject}
                  onChange={(e) => setReportData(prev => ({ ...prev, subject: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label>Message <span className="required">*</span></label>
                <textarea
                  placeholder="Describe your issue or suggestion in detail..."
                  value={reportData.message}
                  onChange={(e) => setReportData(prev => ({ ...prev, message: e.target.value }))}
                  rows="5"
                  required
                />
              </div>

              <div className="form-group">
                <label>Screenshot (Optional)</label>
                <div className="screenshot-area">
                  {reportData.screenshotPreview ? (
                    <div className="screenshot-preview">
                      <img src={reportData.screenshotPreview} alt="Screenshot" />
                      <button 
                        type="button"
                        className="remove-screenshot"
                        onClick={removeScreenshot}
                      >
                        <i className="fa-solid fa-times"></i>
                      </button>
                    </div>
                  ) : (
                    <div 
                      className="upload-area"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <i className="fa-solid fa-cloud-arrow-up"></i>
                      <p>Click to upload screenshot</p>
                      <span>PNG, JPG, GIF (Max 5MB)</span>
                    </div>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleScreenshotChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="cancel-btn"
                  onClick={() => setShowReportModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="submit-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> Submitting...</>
                  ) : (
                    <><i className="fa-solid fa-paper-plane"></i> Submit Report</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingFeedbackButton;