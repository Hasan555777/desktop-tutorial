// src/pages/Admin/AdminAnnouncement.jsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../shared/context/AuthContext';
import { useFeedback } from '../../shared/ui/Feedback/FeedbackProvider';
import { auth } from '../../shared/firebase/index';
import styles from './AdminAnnouncement.module.css';

// ✅ সঠিক পাথ (ইতিমধ্যে ঠিক আছে)
import { 
  getLatestActiveAnnouncement,
  updateAnnouncement,
  toggleAnnouncementActive,
  getAnnouncementHistory,
  createAnnouncement  // ✅ এখানে import করুন
} from '../announcements/firebase/announcementRepository';

const AdminAnnouncement = () => {
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
    category: 'default'
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
          category: data.category || 'default'
        });
      } else {
        setFormData({
          title: '',
          message: '',
          type: 'info',
          category: 'default'
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
      if (announcement) {
        // ✅ Update existing announcement
        const result = await updateAnnouncement(
          announcement.id,
          formData,
          currentUser.uid,
          currentUser.email,
          true
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
        // ✅ Create new announcement (now imported directly)
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
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <i className={`fa-solid fa-bullhorn ${styles.loadingIcon}`} />
          <h2>Loading Announcement...</h2>
          <p>
            <i className="fa-solid fa-spinner fa-spin"></i> Loading announcement settings...
          </p>
          <div className={styles.loadingDots}>
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    );
  }

  const badge = announcement ? getTypeBadge(announcement.type) : getTypeBadge('info');
  const categoryBadge = announcement ? getCategoryBadge(announcement.category) : getCategoryBadge('default');

  return (
    <div className={styles.adminAnnouncementContainer}>
      <div className={styles.adminAnnouncementHeader}>
        <h2>
          <i className="fa-solid fa-bullhorn"></i> Announcement Settings
        </h2>
        {announcement && (
          <div className={styles.headerStatus}>
            <span className={`${styles.statusBadge} ${announcement.active ? styles.active : styles.inactive}`}>
              {announcement.active ? '✅ Active' : '⏸️ Inactive'}
            </span>
            <span className={styles.versionBadge}>v{announcement.version}</span>
          </div>
        )}
      </div>

      {/* ✅ Settings Form */}
      <div className={styles.announcementSettings}>
        <form onSubmit={handleSave}>
          <div className={styles.formGroup}>
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

          <div className={styles.formGroup}>
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
            <span className={styles.charCount}>
              {formData.message.length}/500
            </span>
          </div>

          {/* ✅ Type Select */}
          <div className={styles.formGroup}>
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

          {/* ✅ Category Select */}
          <div className={styles.formGroup}>
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

          <div className={styles.formActions}>
            {announcement && (
              <button 
                type="button" 
                className={`${styles.btnToggleStatus} ${announcement.active ? styles.active : styles.inactive}`}
                onClick={handleToggleActive}
              >
                <i className={`fa-solid ${announcement.active ? 'fa-pause' : 'fa-play'}`}></i>
                {announcement.active ? ' Deactivate' : ' Activate'}
              </button>
            )}
            
            <button 
              type="button" 
              className={styles.btnHistory}
              onClick={handleViewHistory}
            >
              <i className="fa-solid fa-clock-rotate-left"></i> History
            </button>
            
            <button 
              type="submit" 
              className={styles.btnSave}
              disabled={saving}
            >
              <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
              {saving ? ' Saving...' : announcement ? ' Update' : ' Create'}
            </button>
          </div>
        </form>

        {/* ✅ Current Status */}
        {announcement && (
          <div className={styles.announcementStatus}>
            <div className={styles.statusGrid}>
              <div className={styles.statusItem}>
                <span className={styles.label}>Version</span>
                <span className={styles.value}>v{announcement.version}</span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.label}>Type</span>
                <span className={styles.value} style={{ color: badge.color }}>
                  {badge.label}
                </span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.label}>Category</span>
                <span className={styles.value} style={{ color: categoryBadge.color }}>
                  {categoryBadge.label}
                </span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.label}>Status</span>
                <span className={`${styles.value} ${announcement.active ? styles.active : styles.inactive}`}>
                  {announcement.active ? '✅ Active' : '⏸️ Inactive'}
                </span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.label}>Updated</span>
                <span className={styles.value}>
                  {announcement.updatedAt?.toDate?.()?.toLocaleString() || 'Just now'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ✅ History */}
      {showHistory && (
        <div className={styles.announcementHistory}>
          <h3>
            <i className="fa-solid fa-clock-rotate-left"></i> Version History
          </h3>
          {history.length === 0 ? (
            <p className={styles.noHistory}>No history found</p>
          ) : (
            <div className={styles.historyList}>
              {history.map((item) => (
                <div key={item.id} className={styles.historyItem}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyVersion}>v{item.version}</span>
                    <span className={styles.historyAction}>{item.action || 'Updated'}</span>
                    <span className={styles.historyDate}>
                      {item.archivedAt?.toDate?.()?.toLocaleString() || 'Unknown'}
                    </span>
                  </div>
                  <div className={styles.historyContent}>
                    <p><strong>{item.title}</strong></p>
                    <p className={styles.historyMessage}>{item.message}</p>
                    <span className={styles.historyType} style={{ 
                      color: getTypeBadge(item.type).color 
                    }}>
                      {item.type}
                    </span>
                    {item.category && (
                      <span className={styles.historyCategory} style={{ 
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