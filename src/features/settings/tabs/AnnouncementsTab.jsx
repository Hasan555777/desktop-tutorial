// src/pages/Settings/tabs/AnnouncementsTab.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth } from '../../../shared/firebase/index';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import { getTypeStyle } from '../../announcements/services/announcementTypes';
import styles from './AnnouncementsTab.module.css';

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
        const announcementsQuery = query(
          collection(db, 'announcements'),
          orderBy('createdAt', 'desc')
        );
        const announcementsSnap = await getDocs(announcementsQuery);
        
        const historyQuery = query(
          collection(db, 'announcementHistory'),
          orderBy('archivedAt', 'desc')
        );
        const historySnap = await getDocs(historyQuery);
        
        const combined = [];
        const announcementIds = new Set();
        
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
        
        historySnap.forEach((doc) => {
          const data = doc.data();
          const id = doc.id;
          
          const isDuplicate = data.broadcastId && announcementIds.has(data.broadcastId);
          
          combined.push({
            id: id,
            broadcastId: data.broadcastId || id,
            title: data.title || 'Untitled',
            message: data.message || '',
            type: data.type || 'info',
            category: data.category || 'default',
            version: data.version || 1,
            active: false,
            createdAt: data.createdAt?.toDate?.() || data.archivedAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || data.archivedAt?.toDate?.() || new Date(),
            createdBy: data.createdBy,
            createdByEmail: data.createdByEmail,
            source: 'history',
            action: data.action || 'archived',
            isDuplicate: isDuplicate,
          });
        });
        
        combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        console.log('📢 Combined announcements:', combined.length);
        
        setAnnouncements(combined);
        setLoading(false);
        
      } catch (error) {
        console.error('❌ Error fetching announcements:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    fetchAllAnnouncements();

    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
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
        
        setAnnouncements(prev => {
          const historyItems = prev.filter(item => item.source === 'history');
          const merged = [...updatedList, ...historyItems];
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
    return true;
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
      <div className={styles.announcementsLoading}>
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
      <div className={styles.announcementsError}>
        <i className="fa-solid fa-circle-exclamation"></i>
        <h3>লোড করতে সমস্যা হয়েছে</h3>
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={() => window.location.reload()}>
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
      <div className={styles.announcementsEmpty}>
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
    <div className={styles.announcementsTab}>
      <div className={styles.announcementsHeader}>
        <div className={styles.headerLeft}>
          <h2>
            <i className="fa-solid fa-bullhorn" style={{ color: 'var(--accent-primary)' }}></i>
            অ্যানাউন্সমেন্ট
          </h2>
          <span className={styles.announcementCount}>
            {filteredAnnouncements.length} টি
          </span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.filterButtons}>
            <button
              className={`${styles.filterBtn} ${filter === 'all' ? styles.active : ''}`}
              onClick={() => setFilter('all')}
            >
              সব ({announcements.length})
            </button>
            <button
              className={`${styles.filterBtn} ${filter === 'active' ? styles.active : ''}`}
              onClick={() => setFilter('active')}
            >
              সক্রিয় ({announcements.filter(a => a.active === true && a.source === 'announcements').length})
            </button>
            <button
              className={`${styles.filterBtn} ${filter === 'archived' ? styles.active : ''}`}
              onClick={() => setFilter('archived')}
            >
              পুরাতন ({announcements.filter(a => a.active === false || a.source === 'history').length})
            </button>
          </div>
        </div>
      </div>

      <div className={styles.announcementsList}>
        {filteredAnnouncements.length === 0 ? (
          <div className={styles.noResults}>
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
                className={`${styles.announcementCard} ${isExpanded ? styles.expanded : ''} ${announcement.active ? styles.active : styles.archived}`}
                onClick={() => toggleExpand(announcement.id)}
              >
                <div className={styles.announcementHeader}>
                  <div className={styles.announcementIcon} style={{ background: typeInfo.bg, color: typeInfo.color }}>
                    <i className={typeInfo.icon}></i>
                  </div>
                  <div className={styles.announcementInfo}>
                    <div className={styles.announcementTitleRow}>
                      <h3 className={styles.announcementTitle}>{announcement.title}</h3>
                      <span className={styles.announcementStatus}>
                        {announcement.active && announcement.source === 'announcements' ? (
                          <span className={`${styles.statusBadge} ${styles.active}`}>✅ সক্রিয়</span>
                        ) : announcement.source === 'history' ? (
                          <span className={`${styles.statusBadge} ${styles.history}`}>📜 ইতিহাস</span>
                        ) : (
                          <span className={`${styles.statusBadge} ${styles.archived}`}>⏸️ পুরাতন</span>
                        )}
                        {announcement.isDuplicate && (
                          <span className={`${styles.statusBadge} ${styles.duplicate}`}>🔄 ডুপ্লিকেট</span>
                        )}
                      </span>
                    </div>
                    <div className={styles.announcementMeta}>
                      <span className={styles.metaItem}>
                        <i className="fa-regular fa-calendar"></i>
                        {formatDate(announcement.createdAt)}
                      </span>
                      <span className={styles.metaItem}>
                        <i className="fa-solid fa-tag"></i>
                        {typeInfo.label}
                      </span>
                      <span className={styles.metaItem}>
                        <i className="fa-solid fa-folder"></i>
                        {categoryLabel}
                      </span>
                      {announcement.version && (
                        <span className={styles.metaItem}>
                          <i className="fa-solid fa-code-branch"></i>
                          v{announcement.version}
                        </span>
                      )}
                      {announcement.source === 'history' && (
                        <span className={`${styles.metaItem} ${styles.historyTag}`}>
                          <i className="fa-solid fa-clock-rotate-left"></i>
                          {announcement.action || 'Archived'}
                        </span>
                      )}
                    </div>
                  </div>
                  <button className={styles.expandBtn}>
                    <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                  </button>
                </div>

                <div className={`${styles.announcementBody} ${isExpanded ? styles.show : ''}`}>
                  <p className={styles.announcementMessage}>{announcement.message}</p>
                  
                  {announcement.createdBy && (
                    <div className={styles.announcementFooter}>
                      <span className={styles.createdBy}>
                        <i className="fa-regular fa-user"></i>
                        {announcement.createdByEmail || 'অ্যাডমিন'}
                      </span>
                      {announcement.updatedAt && announcement.updatedAt !== announcement.createdAt && (
                        <span className={styles.updatedAt}>
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
      <div className={styles.announcementsFooter}>
        <p>
          <i className="fa-regular fa-clock"></i>
          সর্বশেষ আপডেট: {announcements.length > 0 ? formatDate(announcements[0]?.updatedAt || announcements[0]?.createdAt) : 'N/A'}
        </p>
      </div>
    </div>
  );
};

export default AnnouncementsTab;