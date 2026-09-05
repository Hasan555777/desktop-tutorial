// src/components/Skeleton/Skeleton.jsx
//
// রিইউজেবল shimmer বিল্ডিং ব্লক। যেকোনো পেজে টেবিল-রো, কার্ড,
// avatar, text-line ইত্যাদির shape বানাতে এটা কম্পোজ করে ব্যবহার
// করবেন। এটা নিজে কোনো "layout" চাপায় না — শুধু shimmer বক্স দেয়,
// shape/size আপনি props দিয়ে ঠিক করবেন।
//
// ব্যবহার:
//   <Skeleton width="60%" height={14} />                → টেক্সট লাইন
//   <Skeleton width={40} height={40} variant="circle" /> → avatar
//   <Skeleton width="100%" height={52} radius={10} />    → card/row

import React from 'react';
import styles from './Skeleton.module.css';

const Skeleton = ({
  width = '100%',
  height = 16,
  radius = 6,
  variant = 'rect', // 'rect' | 'circle'
  style = {},
  className = '',
}) => {
  const resolvedRadius = variant === 'circle' ? '50%' : radius;
  const resolvedWidth = typeof width === 'number' ? `${width}px` : width;
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${styles.skeletonShimmer} ${className}`}
      style={{
        width: resolvedWidth,
        height: resolvedHeight,
        borderRadius: typeof resolvedRadius === 'number' ? `${resolvedRadius}px` : resolvedRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
};

// ── সাহায্যকারী কম্পোজিশন — সাধারণ প্যাটার্নগুলো রেডিমেড ──

// একটা টেবিল-রো / লিস্ট-আইটেম শেপ: বামে avatar, ডানে দুইটা লাইন
export const SkeletonRow = ({ style = {} }) => (
  <div
    className={styles.skeletonRow}
    style={style}
  >
    <Skeleton width={40} height={40} variant="circle" />
    <div className={styles.skeletonRowContent}>
      <Skeleton width="55%" height={13} />
      <Skeleton width="85%" height={11} />
    </div>
  </div>
);

// একটা প্লেইন কার্ড/ব্লক শেপ (উচ্চতা কাস্টমাইজেবল)
export const SkeletonBlock = ({ height = 90, style = {} }) => (
  <Skeleton width="100%" height={height} radius={12} style={style} />
);

// একগুচ্ছ রো একসাথে রেন্ডার করার শর্টকাট
export const SkeletonList = ({ count = 6, gap = 8, ItemComponent = SkeletonRow }) => (
  <div 
    className={styles.skeletonList}
    style={{ gap: `${gap}px` }}
  >
    {Array.from({ length: count }).map((_, i) => (
      <ItemComponent key={i} />
    ))}
  </div>
);

export default Skeleton;