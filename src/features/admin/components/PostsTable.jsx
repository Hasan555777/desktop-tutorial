// src/pages/Admin/components/PostsTable.jsx

import React from 'react';
import { formatDate, formatMoney, getPostTypeLabel, truncateText } from '../utils/adminUtils';
import styles from './PostsTable.module.css';

// ============================================================
// 🎯 POSTS TABLE COMPONENT
// ============================================================

const PostsTable = ({ posts, onDeletePost }) => {
  return (
    <div className={styles.dataTable}>
      <div className={styles.tableHeader}>
        <h3>📄 অ্যাপ্রুভড পোস্ট</h3>
        <span className={styles.tableCount}>{posts.length} টি পোস্ট</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>আইডি</th>
            <th>শিরোনাম</th>
            <th>ধরন</th>
            <th>বাজেট</th>
            <th>পোস্ট করেছেন</th>
            <th>তারিখ</th>
            <th>অ্যাকশন</th>
          </tr>
        </thead>
        <tbody>
          {posts.map(post => (
            <tr key={post.id}>
              <td>{post.id?.slice(-8)}</td>
              <td>{truncateText(post.title, 40)}</td>
              <td>
                <span className={`${styles.typeBadge} ${styles[post.type || 'service']}`}>
                  {getPostTypeLabel(post.type)}
                </span>
              </td>
              <td>{formatMoney(post.budget || post.price)}</td>
              <td>{post.clientName || post.userName || 'অজানা'}</td>
              <td>{formatDate(post.createdAt)}</td>
              <td>
                <button 
                  className={`${styles.actionBtn} ${styles.delete}`}
                  onClick={() => onDeletePost(post.id)}
                >
                  🗑️
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PostsTable;