// src/pages/Admin/components/AdminContentSkeleton.jsx
import React from 'react';

const shimmerStyle = {
  background: 'linear-gradient(90deg, var(--bg-secondary,#1a1f2e) 25%, var(--bg-tertiary,#232937) 50%, var(--bg-secondary,#1a1f2e) 75%)',
  backgroundSize: '200% 100%',
  animation: 'admin-skeleton-shimmer 1.5s infinite',
  borderRadius: '8px',
};

const AdminContentSkeleton = ({ rows = 6 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <style>{`
      @keyframes admin-skeleton-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        style={{ ...shimmerStyle, height: '52px', width: '100%' }}
      />
    ))}
  </div>
);

export default AdminContentSkeleton;