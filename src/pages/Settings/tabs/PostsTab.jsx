// src/pages/Settings/tabs/PostsTab.jsx
import React from 'react';

const PostsTab = ({ 
  userPosts, 
  postsLoading, 
  editingPost,
  onEditPost,
  onDeletePost
}) => {
  return (
    <div className="settings-section">
      <h2><i className="fa-solid fa-file-alt"></i> আমার পোস্ট</h2>
      <div className="settings-form">
        {postsLoading ? (
          <div className="loading-posts"><div className="loading-spinner-small"></div><p>পোস্ট লোড হচ্ছে...</p></div>
        ) : userPosts.length === 0 ? (
          <div className="no-posts"><i className="fa-solid fa-folder-open"></i><p>আপনি এখনও কোনো পোস্ট তৈরি করেননি।</p></div>
        ) : (
          <div className="posts-list">
            {userPosts.map(post => (
              <div key={post.id} className="post-item">
                <div className="post-item-info">
                  <h4>{post.title}</h4>
                  <p>{post.description?.substring(0, 80)}...</p>
                  <span className="post-item-meta">৳{post.budget || post.price} BDT · {post.type === 'hire' ? 'জব' : 'সার্ভিস'}</span>
                </div>
                <div className="post-item-actions">
                  <button className="edit-btn-small" onClick={() => onEditPost(post)}>
                    <i className="fa-solid fa-pen"></i>
                  </button>
                  <button className="delete-btn-small" onClick={() => onDeletePost(post.id)}>
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PostsTab;