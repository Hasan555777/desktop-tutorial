// src/pages/Admin/components/PendingPosts.jsx

import React from 'react';
import { formatDate, formatMoney, getPostTypeLabel } from '../utils/adminUtils';
import EmptyState from './EmptyState';
import './PendingPosts.css'; 

// ============================================================
// 🎯 PENDING POSTS COMPONENT
// ============================================================

const PendingPosts = ({ 
  posts, 
  onApprove, 
  onReject, 
  onRefresh,
  onOpenRejectModal,
  formatDateFn = formatDate,
  formatMoneyFn = formatMoney
}) => {
  // ============================================================
  // ✅ Helper Functions for Budget & Deadline Display
  // ============================================================

  /**
   * Format budget for display
   * Supports both old format (number) and new format (object with type, amount, min, max)
   */
  const getBudgetDisplay = (post) => {
    const budgetData = post.budget;
    
    // ✅ নতুন ফরম্যাট
    if (budgetData && typeof budgetData === 'object') {
      if (budgetData.type === 'fixed') {
        return {
          display: `TK ${Number(budgetData.amount || 0).toLocaleString('en-IN')} BDT`,
          isNegotiable: budgetData.isNegotiable || false,
          type: 'fixed'
        };
      } else if (budgetData.type === 'range') {
        return {
          display: `TK ${Number(budgetData.min || 0).toLocaleString('en-IN')} - ${Number(budgetData.max || 0).toLocaleString('en-IN')} BDT`,
          isNegotiable: budgetData.isNegotiable || false,
          type: 'range'
        };
      }
    }

    // ✅ পুরানো ফরম্যাট (fallback)
    const budgetValue = post.budget || post.price || 0;
    return {
      display: `TK ${Number(budgetValue).toLocaleString('en-IN')} BDT`,
      isNegotiable: post.isNegotiable || false,
      type: 'fixed'
    };
  };

  /**
   * Format deadline for display
   * Supports both old format (number) and new format (object with type, days, min, max)
   */
  const getDeadlineDisplay = (post) => {
    const deadlineData = post.deadline;
    
    // ✅ নতুন ফরম্যাট
    if (deadlineData && typeof deadlineData === 'object') {
      if (deadlineData.type === 'fixed') {
        return {
          display: `${Number(deadlineData.days || 0)} days`,
          type: 'fixed'
        };
      } else if (deadlineData.type === 'range') {
        return {
          display: `${Number(deadlineData.min || 0)} - ${Number(deadlineData.max || 0)} days`,
          type: 'range'
        };
      }
    }

    // ✅ পুরানো ফরম্যাট (fallback)
    const deadlineValue = post.deadline || post.deliveryTime || 0;
    return {
      display: `${Number(deadlineValue)} days`,
      type: 'fixed'
    };
  };

  if (posts.length === 0) {
    return (
      <div className="data-table pending-posts-table">
        <div className="table-header">
          <h3>
            <i className="fa-solid fa-clock"></i> 
            পেন্ডিং পোস্ট
            <span className="table-count">0 টি</span>
          </h3>
          <button className="refresh-btn" onClick={onRefresh}>
            <i className="fa-solid fa-sync"></i> রিফ্রেশ
          </button>
        </div>
        <EmptyState 
          icon="fa-solid fa-check-circle"
          iconColor="#10b981"
          iconSize="48px"
          title="কোন পেন্ডিং পোস্ট নেই"
          subtitle="সব পোস্ট অ্যাপ্রুভ করা হয়েছে! 🎉"
        />
      </div>
    );
  }

  return (
    <div className="data-table pending-posts-table">
      <div className="table-header">
        <h3>
          <i className="fa-solid fa-clock"></i> 
          পেন্ডিং পোস্ট
          <span className="table-count">{posts.length} টি</span>
          {posts.length > 0 && (
            <span className="pending-badge">{posts.length} pending</span>
          )}
        </h3>
        <button className="refresh-btn" onClick={onRefresh}>
          <i className="fa-solid fa-sync"></i> রিফ্রেশ
        </button>
      </div>

      <div className="pending-posts-grid">
        {posts.map((post) => {
          const budgetInfo = getBudgetDisplay(post);
          const deadlineInfo = getDeadlineDisplay(post);
          
          return (
            <div key={post.id} className="pending-post-card">
              {/* Post Image */}
              {post.images && post.images.length > 0 && (
                <div className="post-image">
                  <img 
                    src={post.images[0]} 
                    alt={post.title} 
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/400x250?text=No+Image';
                    }}
                  />
                </div>
              )}
              
              <div className="post-content">
                <div className="post-header">
                  <h4 className="post-title">{post.title || 'Untitled'}</h4>
                  <span className="status-badge pending">⏳ পেন্ডিং</span>
                </div>
                
                <p className="post-description">
                  {post.description?.substring(0, 120)}
                  {post.description?.length > 120 && '...'}
                </p>
                
                <div className="post-meta">
                  <div className="meta-item">
                    <i className="fa-solid fa-tag"></i>
                    <span>{getPostTypeLabel(post.type)}</span>
                  </div>
                  
                  {/* ✅ Budget Display with Negotiable Badge */}
                  <div className="meta-item">
                    <i className="fa-solid fa-money-bill"></i>
                    <span>
                      {budgetInfo.display}
                      {budgetInfo.isNegotiable && (
                        <span className="negotiable-badge" style={{
                          display: 'inline-block',
                          fontSize: '9px',
                          fontWeight: '600',
                          color: 'var(--accent-primary, #14b8a6)',
                          background: 'var(--accent-glow, rgba(20, 184, 166, 0.1))',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          marginLeft: '4px'
                        }}>
                          🤝 আলোচনা সাপেক্ষ
                        </span>
                      )}
                      {budgetInfo.type === 'range' && (
                        <span className="range-badge" style={{
                          display: 'inline-block',
                          fontSize: '9px',
                          fontWeight: '500',
                          color: 'var(--text-secondary, #94a3b8)',
                          background: 'var(--bg-tertiary, #1a2030)',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          marginLeft: '4px'
                        }}>
                          রেঞ্জ
                        </span>
                      )}
                    </span>
                  </div>
                  
                  {/* ✅ Deadline Display */}
                  <div className="meta-item">
                    <i className="fa-solid fa-calendar-days"></i>
                    <span>
                      {deadlineInfo.display}
                      {deadlineInfo.type === 'range' && (
                        <span className="range-badge" style={{
                          display: 'inline-block',
                          fontSize: '9px',
                          fontWeight: '500',
                          color: 'var(--text-secondary, #94a3b8)',
                          background: 'var(--bg-tertiary, #1a2030)',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          marginLeft: '4px'
                        }}>
                          ফ্লেক্সিবল
                        </span>
                      )}
                    </span>
                  </div>
                  
                  <div className="meta-item">
                    <i className="fa-solid fa-user"></i>
                    <span>{post.clientName || post.userName || 'অজানা'}</span>
                  </div>
                  <div className="meta-item">
                    <i className="fa-solid fa-calendar"></i>
                    <span>{formatDateFn(post.createdAt)}</span>
                  </div>
                </div>
                
                <div className="post-actions">
                  <button 
                    className="action-btn approve"
                    onClick={() => onApprove(post.id)}
                    title="অ্যাপ্রুভ করুন"
                  >
                    ✅ অ্যাপ্রুভ
                  </button>
                  <button 
                    className="action-btn reject"
                    onClick={() => onOpenRejectModal(post.id)}
                    title="রিজেক্ট করুন"
                  >
                    ❌ রিজেক্ট
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PendingPosts;