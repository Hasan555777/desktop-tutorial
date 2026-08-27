// src/pages/Settings/tabs/AnnouncementsTab.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth } from '@/firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { getTypeStyle } from '@/services/announcementTypes';
import './AnnouncementsTab.css';

const AnnouncementsTab = () => {
  const feedback = useFeedback();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  // ============================================================
  // ✅ Load ALL Announcements from BOTH collections
  // ============================================================
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const fetchAllAnnouncements = async () => {
      try {
        // ✅ 1. Get from 'announcements' collection (active + inactive)
        const announcementsQuery = query(
          collection(db, 'announcements'),
          orderBy('createdAt', 'desc')
        );
        const announcementsSnap = await getDocs(announcementsQuery);
        
        // ✅ 2. Get from 'announcementHistory' collection (all history)
        const historyQuery = query(
          collection(db, 'announcementHistory'),
          orderBy('archivedAt', 'desc')
        );
        const historySnap = await getDocs(historyQuery);
        
        // ✅ Combine both collections - SIMPLIFIED
        const combined = [];
        const announcementIds = new Set();
        
        // First, add all from announcements
        announcementsSnap.forEach((doc) => {
          const data = doc.data();
          const id = doc.id;
          announcementIds.add(id);
          
          combined.push({
            id: id,
            ...data,
            source: 'announcements',
            createdAt: data.createdAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || new Date(),
          });
        });
        
        // Then add ALL from history (don't filter by broadcastId)
        historySnap.forEach((doc) => {
          const data = doc.data();
          const id = doc.id;
          
          // ✅ Check if this history item's broadcastId exists in announcements
          //但如果 broadcastId matches, still add it but mark as duplicate
          const isDuplicate = data.broadcastId && announcementIds.has(data.broadcastId);
          
          combined.push({
            id: id,
            broadcastId: data.broadcastId || id,
            title: data.title || 'Untitled',
            message: data.message || '',
            type: data.type || 'info',
            category: data.category || 'default',
            version: data.version || 1,
            active: false, // History items are always archived
            createdAt: data.createdAt?.toDate?.() || data.archivedAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || data.archivedAt?.toDate?.() || new Date(),
            createdBy: data.createdBy,
            createdByEmail: data.createdByEmail,
            source: 'history',
            action: data.action || 'archived',
            isDuplicate: isDuplicate, // ✅ track if duplicate
          });
        });
        
        // Sort by createdAt descending
        combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        console.log('📢 Combined announcements:', combined.length);
        console.log('📢 From announcements:', announcementsSnap.size);
        console.log('📢 From history:', historySnap.size);
        console.log('📢 All combined data:', combined.map(item => ({
          id: item.id,
          title: item.title,
          source: item.source,
          isDuplicate: item.isDuplicate
        })));
        
        setAnnouncements(combined);
        setLoading(false);
        
      } catch (error) {
        console.error('❌ Error fetching announcements:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    fetchAllAnnouncements();

    // ✅ Real-time listener for announcements collection only
    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        // Update only announcements from 'announcements' collection
        const updatedList = [];
        const updatedIds = new Set();
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          const id = doc.id;
          updatedIds.add(id);
          
          updatedList.push({
            id: id,
            ...data,
            source: 'announcements',
            createdAt: data.createdAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || new Date(),
          });
        });
        
        // Merge with history (keep ALL history items)
        setAnnouncements(prev => {
          // Keep all history items
          const historyItems = prev.filter(item => item.source === 'history');
          
          // Remove old announcements and add updated ones
          const merged = [...updatedList, ...historyItems];
          // Sort by createdAt descending
          merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return merged;
        });
        
        setLoading(false);
      },
      (error) => {
        console.error('❌ Listener error:', error);
        setError(error.message);
      }
    );

    return () => unsubscribe();
  }, []);

  // ============================================================
  // ✅ Filter Announcements
  // ============================================================
  const filteredAnnouncements = announcements.filter(announcement => {
    if (filter === 'active') return announcement.active === true && announcement.source === 'announcements';
    if (filter === 'archived') return announcement.active === false || announcement.source === 'history';
    return true; // 'all' - সব দেখাবে
  });

  // ============================================================
  // ✅ Toggle Expand
  // ============================================================
  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // ============================================================
  // ✅ Format Date
  // ============================================================
  const formatDate = (date) => {
    if (!date) return 'Unknown';
    if (date instanceof Date) {
      return date.toLocaleString('bn-BD', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return String(date);
  };

  // ============================================================
  // ✅ Get Type Style
  // ============================================================
  const getTypeInfo = (type) => {
    const style = getTypeStyle(type);
    const labels = {
      info: 'ℹ️ তথ্য',
      warning: '⚠️ সতর্কতা',
      success: '✅ সফল',
      danger: '🚨 জরুরি',
      feature: '✨ নতুন ফিচার',
      maintenance: '🔧 রক্ষণাবেক্ষণ'
    };
    return {
      ...style,
      label: labels[type] || type || 'তথ্য'
    };
  };

  // ============================================================
  // ✅ Get Category Label
  // ============================================================
  const getCategoryLabel = (category) => {
    const categories = {
      default: '📢 সাধারণ',
      feature: '✨ ফিচার',
      maintenance: '🔧 মেইন্টেন্যান্স',
      security: '🔒 সিকিউরিটি',
      update: '🔄 আপডেট',
      announcement: '📢 অ্যানাউন্সমেন্ট'
    };
    return categories[category] || categories.default;
  };

  // ============================================================
  // ✅ Render Loading
  // ============================================================
  if (loading) {
    return (
      <div className="announcements-loading">
        <i className="fa-solid fa-spinner fa-spin"></i>
        <span>লোড হচ্ছে...</span>
      </div>
    );
  }

  // ============================================================
  // ✅ Render Error
  // ============================================================
  if (error) {
    return (
      <div className="announcements-error">
        <i className="fa-solid fa-circle-exclamation"></i>
        <h3>লোড করতে সমস্যা হয়েছে</h3>
        <p>{error}</p>
        <button className="retry-btn" onClick={() => window.location.reload()}>
          <i className="fa-solid fa-rotate"></i> পুনরায় চেষ্টা করুন
        </button>
      </div>
    );
  }

  // ============================================================
  // ✅ Render Empty State
  // ============================================================
  if (announcements.length === 0) {
    return (
      <div className="announcements-empty">
        <i className="fa-solid fa-bullhorn"></i>
        <h3>কোন অ্যানাউন্সমেন্ট নেই</h3>
        <p>বর্তমানে কোনো অ্যানাউন্সমেন্ট পাওয়া যায়নি।</p>
      </div>
    );
  }

  // ============================================================
  // ✅ Main Render
  // ============================================================
  return (
    <div className="announcements-tab">
      <div className="announcements-header">
        <div className="header-left">
          <h2>
            <i className="fa-solid fa-bullhorn" style={{ color: 'var(--accent-primary)' }}></i>
            অ্যানাউন্সমেন্ট
          </h2>
          <span className="announcement-count">
            {filteredAnnouncements.length} টি
          </span>
        </div>
        <div className="header-right">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              সব ({announcements.length})
            </button>
            <button
              className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
              onClick={() => setFilter('active')}
            >
              সক্রিয় ({announcements.filter(a => a.active === true && a.source === 'announcements').length})
            </button>
            <button
              className={`filter-btn ${filter === 'archived' ? 'active' : ''}`}
              onClick={() => setFilter('archived')}
            >
              পুরাতন ({announcements.filter(a => a.active === false || a.source === 'history').length})
            </button>
          </div>
        </div>
      </div>

      <div className="announcements-list">
        {filteredAnnouncements.length === 0 ? (
          <div className="no-results">
            <i className="fa-solid fa-filter"></i>
            <p>এই ফিল্টারে কোনো অ্যানাউন্সমেন্ট নেই</p>
          </div>
        ) : (
          filteredAnnouncements.map((announcement) => {
            const typeInfo = getTypeInfo(announcement.type);
            const isExpanded = expandedId === announcement.id;
            const categoryLabel = getCategoryLabel(announcement.category);

            return (
              <div
                key={announcement.id}
                className={`announcement-card ${isExpanded ? 'expanded' : ''} ${announcement.active ? 'active' : 'archived'}`}
                onClick={() => toggleExpand(announcement.id)}
              >
                <div className="announcement-header">
                  <div className="announcement-icon" style={{ background: typeInfo.bg, color: typeInfo.color }}>
                    <i className={typeInfo.icon}></i>
                  </div>
                  <div className="announcement-info">
                    <div className="announcement-title-row">
                      <h3 className="announcement-title">{announcement.title}</h3>
                      <span className="announcement-status">
                        {announcement.active && announcement.source === 'announcements' ? (
                          <span className="status-badge active">✅ সক্রিয়</span>
                        ) : announcement.source === 'history' ? (
                          <span className="status-badge history">📜 ইতিহাস</span>
                        ) : (
                          <span className="status-badge archived">⏸️ পুরাতন</span>
                        )}
                        {announcement.isDuplicate && (
                          <span className="status-badge duplicate">🔄 ডুপ্লিকেট</span>
                        )}
                      </span>
                    </div>
                    <div className="announcement-meta">
                      <span className="meta-item">
                        <i className="fa-regular fa-calendar"></i>
                        {formatDate(announcement.createdAt)}
                      </span>
                      <span className="meta-item">
                        <i className="fa-solid fa-tag"></i>
                        {typeInfo.label}
                      </span>
                      <span className="meta-item">
                        <i className="fa-solid fa-folder"></i>
                        {categoryLabel}
                      </span>
                      {announcement.version && (
                        <span className="meta-item">
                          <i className="fa-solid fa-code-branch"></i>
                          v{announcement.version}
                        </span>
                      )}
                      {announcement.source === 'history' && (
                        <span className="meta-item history-tag">
                          <i className="fa-solid fa-clock-rotate-left"></i>
                          {announcement.action || 'Archived'}
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="expand-btn">
                    <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                  </button>
                </div>

                <div className={`announcement-body ${isExpanded ? 'show' : ''}`}>
                  <p className="announcement-message">{announcement.message}</p>
                  
                  {announcement.createdBy && (
                    <div className="announcement-footer">
                      <span className="created-by">
                        <i className="fa-regular fa-user"></i>
                        {announcement.createdByEmail || 'অ্যাডমিন'}
                      </span>
                      {announcement.updatedAt && announcement.updatedAt !== announcement.createdAt && (
                        <span className="updated-at">
                          <i className="fa-regular fa-pen-to-square"></i>
                          হালনাগাদ: {formatDate(announcement.updatedAt)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer ── */}
      <div className="announcements-footer">
        <p>
          <i className="fa-regular fa-clock"></i>
          সর্বশেষ আপডেট: {announcements.length > 0 ? formatDate(announcements[0]?.updatedAt || announcements[0]?.createdAt) : 'N/A'}
        </p>
      </div>
    </div>
  );
};

export default AnnouncementsTab;