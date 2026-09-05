// src/pages/Welcome/components/StatsSection.jsx

import React, { useState, useEffect } from 'react';
import styles from './StatsSection.module.css';

const StatsSection = () => {
  const [counts, setCounts] = useState({
    users: 0,
    deals: 0,
    transactions: 0,
    reviews: 0,
    freelancers: 0,
    clients: 0,
    satisfaction: 0
  });

  useEffect(() => {
    const target = {
      users: 12500,
      deals: 8400,
      transactions: 32000,
      reviews: 5600,
      freelancers: 4800,
      clients: 7700,
      satisfaction: 98
    };

    const duration = 2000;
    const steps = 60;
    const interval = duration / steps;

    let current = { 
      users: 0, 
      deals: 0, 
      transactions: 0, 
      reviews: 0,
      freelancers: 0,
      clients: 0,
      satisfaction: 0
    };
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;

      setCounts({
        users: Math.floor(target.users * progress),
        deals: Math.floor(target.deals * progress),
        transactions: Math.floor(target.transactions * progress),
        reviews: Math.floor(target.reviews * progress),
        freelancers: Math.floor(target.freelancers * progress),
        clients: Math.floor(target.clients * progress),
        satisfaction: Math.floor(target.satisfaction * progress)
      });

      if (step >= steps) {
        clearInterval(timer);
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className={styles.statsSection}>
      <div className={styles.statsGrid}>
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{counts.users.toLocaleString()}+</span>
          <span className={styles.statLabel}>বিশ্বস্ত ইউজার</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{counts.freelancers.toLocaleString()}+</span>
          <span className={styles.statLabel}>ফ্রিল্যান্সার</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{counts.clients.toLocaleString()}+</span>
          <span className={styles.statLabel}>ক্লায়েন্ট</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{counts.deals.toLocaleString()}+</span>
          <span className={styles.statLabel}>কাজ সম্পন্ন</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{counts.transactions.toLocaleString()}+</span>
          <span className={styles.statLabel}>লেনদেন</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{counts.reviews.toLocaleString()}+</span>
          <span className={styles.statLabel}>৫-স্টার রিভিউ</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{counts.satisfaction}%</span>
          <span className={styles.statLabel}>সন্তুষ্টি হার</span>
        </div>
      </div>
    </section>
  );
};

export default StatsSection;