// src/pages/Admin/components/PendingEdits.jsx

import React from 'react';
import { formatDate } from '../utils/adminUtils';
import EmptyState from './EmptyState';
import './PendingEdits.css';
// ============================================================
// 🎯 PENDING EDITS COMPONENT
// ============================================================

const PendingEdits = ({ 
  edits, 
  onApprove, 
  onReject, 
  onRefresh,
  formatDateFn = formatDate
}) => {
  if (edits.length === 0) {
    return (
      <div className="data-table pending-edits-table">
        <div className="table-header">
          <h3>
            <i className="fa-solid fa-pen-to-square"></i> 
            Pending Post Edits
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
          title="কোন পেন্ডিং এডিট নেই"
          subtitle="সব এডিট অ্যাপ্রুভ করা হয়েছে! 🎉"
        />
      </div>
    );
  }

  return (
    <div className="data-table pending-edits-table">
      <div className="table-header">
        <h3>
          <i className="fa-solid fa-pen-to-square"></i> 
          Pending Post Edits
          <span className="table-count">{edits.length} টি</span>
          {edits.length > 0 && (
            <span className="pending-badge">{edits.length} pending</span>
          )}
        </h3>
        <button className="refresh-btn" onClick={onRefresh}>
          <i className="fa-solid fa-sync"></i> রিফ্রেশ
        </button>
      </div>

      <div className="pending-edits-grid">
        {edits.map((post) => (
          <div key={post.id} className="pending-edit-card">
            <div className="edit-header">
              <h4 className="edit-title">{post.title}</h4>
              <span className="status-badge pending">⏳ Pending Edit</span>
            </div>
            
            {/* Current Version */}
            <div className="version-compare">
              <div className="current-version">
                <h5>📌 Current Version</h5>
                <p><strong>Title:</strong> {post.title}</p>
                <p><strong>Description:</strong> {post.description?.substring(0, 100)}...</p>
                <p><strong>Budget:</strong> {post.budget} BDT</p>
                <p><strong>Deadline:</strong> {post.deadline} Days</p>
              </div>
              
              <div className="version-arrow">→</div>
              
              <div className="pending-version">
                <h5>✏️ Pending Changes</h5>
                <p><strong>Title:</strong> {post.pendingChanges?.title}</p>
                <p><strong>Description:</strong> {post.pendingChanges?.description?.substring(0, 100)}...</p>
                <p><strong>Budget:</strong> {post.pendingChanges?.budget} BDT</p>
                <p><strong>Deadline:</strong> {post.pendingChanges?.deadline} Days</p>
                {post.pendingChanges?.images && post.pendingChanges.images.length > 0 && (
                  <div className="edit-images-preview">
                    {post.pendingChanges.images.slice(0, 2).map((img, idx) => (
                      <img key={idx} src={img} alt="New" className="edit-thumb" />
                    ))}
                    {post.pendingChanges.images.length > 2 && (
                      <span>+{post.pendingChanges.images.length - 2}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="edit-meta">
              <span>Submitted: {formatDateFn(post.editSubmittedAt)}</span>
              <span>By: {post.clientName || 'Unknown'}</span>
            </div>
            
            <div className="edit-actions">
              <button 
                className="action-btn approve"
                onClick={() => onApprove(post.id)}
              >
                ✅ Approve Edit
              </button>
              <button 
                className="action-btn reject"
                onClick={() => {
                  const reason = prompt('রিজেক্ট করার কারণ লিখুন:');
                  if (reason !== null) {
                    onReject(post.id, reason);
                  }
                }}
              >
                ❌ Reject Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PendingEdits;