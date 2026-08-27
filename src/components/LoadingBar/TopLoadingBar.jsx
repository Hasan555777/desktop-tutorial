// src/components/LoadingBar/TopLoadingBar.jsx
//
// হেডারের ঠিক নিচে (আসলে ভিউপোর্টের একদম উপরে, fixed) পাতলা animated
// লোডিং বার। App.js-এ একবারই মাউন্ট হবে — কোনো পেজে আলাদা করে বসাতে
// হবে না। প্রতিটা পেজ শুধু usePageLoadingBar(loading) কল করলেই এটা
// অটোমেটিক শো/হাইড হয়ে যাবে।

import React from 'react';
import { useLoadingBarContext } from './LoadingBarContext';
import styles from './TopLoadingBar.module.css';

const TopLoadingBar = () => {
  const { isLoading } = useLoadingBarContext();

  return (
    <div
      className={`${styles.topLoadingBar} ${isLoading ? styles.active : ''}`}
      role="progressbar"
      aria-hidden={!isLoading}
      aria-label="Loading"
    >
      <div className={styles.topLoadingBarFill} />
    </div>
  );
};

export default TopLoadingBar;