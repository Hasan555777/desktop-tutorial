// src/pages/Admin/AdminAnnouncement.jsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { auth } from '@/firebase';

// ✅ New imports for v1 architecture
import { 
  getLatestActiveAnnouncement,
  updateAnnouncement,
  toggleAnnouncementActive,
  getAnnouncementHistory
} from '@/firebase/announcementRepository';
import './AdminAnnouncement.css';

const AdminAnnouncement = () => {
  // const { user } = useAuth();
  const { currentUser } = useAuth();
  const feedback = useFeedback();
  
  // ✅ Single announcement state
  const [announcement, setAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // ✅ Form data with category
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info',
    category: 'default'  // ✅ যোগ করা হয়েছে
  });

  // ============================================================
  // ✅ Load Current Announcement
  // ============================================================
  const loadAnnouncement = async () => {
    setLoading(true);
    try {
      const data = await getLatestActiveAnnouncement();
      setAnnouncement(data);
      
      if (data) {
        setFormData({
          title: data.title || '',
          message: data.message || '',
          type: data.type || 'info',
          category: data.category || 'default'  // ✅ যোগ করা হয়েছে
        });
      } else {
        setFormData({
          title: '',
          message: '',
          type: 'info',
          category: 'default'  // ✅ যোগ করা হয়েছে
        });
      }
    } catch (error) {
      console.error('Error loading announcement:', error);
      feedback.alert.error({ message: 'Failed to load announcement' });
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // ✅ Load History
  // ============================================================
  const loadHistory = async () => {
    try {
      const data = await getAnnouncementHistory();
      setHistory(data);
    } catch (error) {
      console.error('Error loading history:', error);
      feedback.alert.error({ message: 'Failed to load history' });
    }
  };

  useEffect(() => {
    loadAnnouncement();
  }, []);

  // ============================================================
  // ✅ Save Announcement (Create or Update)
  // ============================================================
  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      feedback.alert.warning({ message: 'Please enter a title!' });
      return;
    }
    if (!formData.message.trim()) {
      feedback.alert.warning({ message: 'Please enter a message!' });
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      feedback.alert.error({ message: 'You must be logged in!' });
      return;
    }

    setSaving(true);
    
    try {
      // ✅ If announcement exists, update it
      if (announcement) {
        const result = await updateAnnouncement(
          announcement.id,
          formData,
          currentUser.uid,
          currentUser.email,
          true // bumpVersion: true for new announcement
        );
        
        if (result.success) {
          feedback.alert.success({ 
            message: `✅ Announcement updated! Version: ${result.version}` 
          });
          await loadAnnouncement();
        } else {
          feedback.alert.error({ message: result.error });
        }
      } else {
        // ✅ Create new announcement using repository
        const { createAnnouncement } = await import('@/firebase/announcementRepository');
        const result = await createAnnouncement(
          formData,
          currentUser.uid,
          currentUser.email
        );
        
        if (result.success) {
          feedback.alert.success({ 
            message: `✅ Announcement created! Version: ${result.version}` 
          });
          await loadAnnouncement();
        } else {
          feedback.alert.error({ message: result.error });
        }
      }
    } catch (error) {
      console.error('Error saving:', error);
      feedback.alert.error({ message: 'Failed to save announcement' });
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // ✅ Toggle Active Status
  // ============================================================
  const handleToggleActive = async () => {
    if (!announcement) return;
    
    const newStatus = !announcement.active;
    const action = newStatus ? 'activate' : 'deactivate';
    
    const confirmed = await feedback.confirm({
      title: `${action === 'activate' ? 'Activate' : 'Deactivate'} Announcement?`,
      message: `Are you sure you want to ${action} this announcement?`,
      okText: `Yes, ${action}`,
      cancelText: 'Cancel'
    });
    
    if (!confirmed) return;
    
    try {
      const result = await toggleAnnouncementActive(announcement.id, newStatus);
      if (result.success) {
        feedback.alert.success({ 
          message: `✅ Announcement ${action}d successfully!` 
        });
        await loadAnnouncement();
      } else {
        feedback.alert.error({ message: result.error });
      }
    } catch (error) {
      console.error('Error toggling:', error);
      feedback.alert.error({ message: 'Failed to toggle status' });
    }
  };

  // ============================================================
  // ✅ View History
  // ============================================================
  const handleViewHistory = async () => {
    setShowHistory(!showHistory);
    if (!showHistory) {
      await loadHistory();
    }
  };

  // ============================================================
  // ✅ Type Badge
  // ============================================================
  const getTypeBadge = (type) => {
    const colors = {
      info: '#3b82f6',
      warning: '#f59e0b',
      success: '#22c55e',
      danger: '#ef4444',
      feature: '#8b5cf6',
      maintenance: '#f97316'
    };
    return {
      color: colors[type] || '#3b82f6',
      label: type || 'info'
    };
  };

  // ============================================================
  // ✅ Category Badge
  // ============================================================
  const getCategoryBadge = (category) => {
    const categories = {
      default: { label: '📢 সাধারণ', color: '#6b7280' },
      feature: { label: '✨ ফিচার', color: '#8b5cf6' },
      maintenance: { label: '🔧 মেইন্টেন্যান্স', color: '#f97316' },
      security: { label: '🔒 সিকিউরিটি', color: '#ef4444' },
      update: { label: '🔄 আপডেট', color: '#3b82f6' },
      announcement: { label: '📢 অ্যানাউন্সমেন্ট', color: '#14b8a6' }
    };
    return categories[category] || categories.default;
  };

  // ============================================================
  // ✅ Render
  // ============================================================
if (loading) {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      padding: '60px 20px',
      minHeight: '400px',
      background: 'var(--bg-primary, #090d16)', 
      color: 'var(--accent-primary, #14b8a6)' 
    }}>
      <div style={{ textAlign: 'center' }}>
        <i className="fa-solid fa-bullhorn" style={{ 
          fontSize: '48px', 
          animation: 'spin 2s linear infinite',
          display: 'block',
          marginBottom: '16px',
          color: 'var(--accent-primary, #14b8a6)'
        }} />
        <h2 style={{ 
          color: 'var(--text-primary, #f1f5f9)', 
          fontSize: '20px', 
          fontWeight: '600',
          margin: '0 0 8px 0'
        }}>
          Loading Announcement...
        </h2>
        <p style={{ 
          color: 'var(--text-muted, #64748b)', 
          marginTop: '8px', 
          fontSize: '14px' 
        }}>
          <i className="fa-solid fa-spinner fa-spin"></i> Loading announcement settings...
        </p>
        <div style={{ marginTop: '20px' }}>
          <div className="loading-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
  const badge = announcement ? getTypeBadge(announcement.type) : getTypeBadge('info');
  const categoryBadge = announcement ? getCategoryBadge(announcement.category) : getCategoryBadge('default');

  return (
    <div className="admin-announcement-container">
      <div className="admin-announcement-header">
        <h2>
          <i className="fa-solid fa-bullhorn"></i> Announcement Settings
        </h2>
        {announcement && (
          <div className="header-status">
            <span className={`status-badge ${announcement.active ? 'active' : 'inactive'}`}>
              {announcement.active ? '✅ Active' : '⏸️ Inactive'}
            </span>
            <span className="version-badge">v{announcement.version}</span>
          </div>
        )}
      </div>

      {/* ✅ Settings Form */}
      <div className="announcement-settings">
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="Enter announcement title"
              maxLength="100"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="message">Message</label>
            <textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
              placeholder="Enter announcement message"
              rows="5"
              maxLength="500"
              required
            />
            <span className="char-count">
              {formData.message.length}/500
            </span>
          </div>

          {/* ✅ Type Select */}
          <div className="form-group">
            <label htmlFor="type">Type</label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
            >
              <option value="info">ℹ️ Info</option>
              <option value="success">✅ Success</option>
              <option value="warning">⚠️ Warning</option>
              <option value="danger">🚨 Danger</option>
              <option value="feature">✨ Feature</option>
              <option value="maintenance">🔧 Maintenance</option>
            </select>
          </div>

          {/* ✅ Category Select - নতুন যোগ করা হয়েছে */}
          <div className="form-group">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
            >
              <option value="default">📢 সাধারণ</option>
              <option value="feature">✨ ফিচার</option>
              <option value="maintenance">🔧 মেইন্টেন্যান্স</option>
              <option value="security">🔒 সিকিউরিটি</option>
              <option value="update">🔄 আপডেট</option>
              <option value="announcement">📢 অ্যানাউন্সমেন্ট</option>
            </select>
          </div>

          <div className="form-actions">
            {announcement && (
              <button 
                type="button" 
                className={`btn-toggle-status ${announcement.active ? 'active' : 'inactive'}`}
                onClick={handleToggleActive}
              >
                <i className={`fa-solid ${announcement.active ? 'fa-pause' : 'fa-play'}`}></i>
                {announcement.active ? ' Deactivate' : ' Activate'}
              </button>
            )}
            
            <button 
              type="button" 
              className="btn-history"
              onClick={handleViewHistory}
            >
              <i className="fa-solid fa-clock-rotate-left"></i> History
            </button>
            
            <button 
              type="submit" 
              className="btn-save"
              disabled={saving}
            >
              <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
              {saving ? ' Saving...' : announcement ? ' Update' : ' Create'}
            </button>
          </div>
        </form>

        {/* ✅ Current Status */}
        {announcement && (
          <div className="announcement-status">
            <div className="status-grid">
              <div className="status-item">
                <span className="label">Version</span>
                <span className="value">v{announcement.version}</span>
              </div>
              <div className="status-item">
                <span className="label">Type</span>
                <span className="value" style={{ color: badge.color }}>
                  {badge.label}
                </span>
              </div>
              {/* ✅ Category Status - নতুন যোগ করা হয়েছে */}
              <div className="status-item">
                <span className="label">Category</span>
                <span className="value" style={{ color: categoryBadge.color }}>
                  {categoryBadge.label}
                </span>
              </div>
              <div className="status-item">
                <span className="label">Status</span>
                <span className={`value ${announcement.active ? 'active' : 'inactive'}`}>
                  {announcement.active ? '✅ Active' : '⏸️ Inactive'}
                </span>
              </div>
              <div className="status-item">
                <span className="label">Updated</span>
                <span className="value">
                  {announcement.updatedAt?.toDate?.()?.toLocaleString() || 'Just now'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ✅ History */}
      {showHistory && (
        <div className="announcement-history">
          <h3>
            <i className="fa-solid fa-clock-rotate-left"></i> Version History
          </h3>
          {history.length === 0 ? (
            <p className="no-history">No history found</p>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <div key={item.id} className="history-item">
                  <div className="history-header">
                    <span className="history-version">v{item.version}</span>
                    <span className="history-action">{item.action || 'Updated'}</span>
                    <span className="history-date">
                      {item.archivedAt?.toDate?.()?.toLocaleString() || 'Unknown'}
                    </span>
                  </div>
                  <div className="history-content">
                    <p><strong>{item.title}</strong></p>
                    <p className="history-message">{item.message}</p>
                    <span className="history-type" style={{ 
                      color: getTypeBadge(item.type).color 
                    }}>
                      {item.type}
                    </span>
                    {item.category && (
                      <span className="history-category" style={{ 
                        color: getCategoryBadge(item.category).color 
                      }}>
                        {getCategoryBadge(item.category).label}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminAnnouncement;