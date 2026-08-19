// src/pages/Welcome/components/StatsSection.jsx

import React, { useState, useEffect } from 'react';

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
    <section className="stats-section">
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-number">{counts.users.toLocaleString()}+</span>
          <span className="stat-label">বিশ্বস্ত ইউজার</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{counts.freelancers.toLocaleString()}+</span>
          <span className="stat-label">ফ্রিল্যান্সার</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{counts.clients.toLocaleString()}+</span>
          <span className="stat-label">ক্লায়েন্ট</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{counts.deals.toLocaleString()}+</span>
          <span className="stat-label">কাজ সম্পন্ন</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{counts.transactions.toLocaleString()}+</span>
          <span className="stat-label">লেনদেন</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{counts.reviews.toLocaleString()}+</span>
          <span className="stat-label">৫-স্টার রিভিউ</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{counts.satisfaction}%</span>
          <span className="stat-label">সন্তুষ্টি হার</span>
        </div>
      </div>
    </section>
  );
};

export default StatsSection;