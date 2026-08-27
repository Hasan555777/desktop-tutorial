// src/pages/Welcome/components/CTASection.jsx

import React from 'react';
// import './CTASection.css';

const CTASection = ({ navigate }) => {
  return (
    <section className="cta-section">
      <h2>আজই আপনার যাত্রা শুরু করুন! 🚀</h2>
      <p>
        বাংলাদেশের হাজার হাজার বিশ্বস্ত প্রফেশনাল ও ক্লায়েন্টদের সাথে যোগ দিন। 
        WorkTrustbd-এ আপনার দক্ষতাকে কাজে লাগিয়ে আয় করুন এবং ক্যারিয়ার গড়ুন। 
        ফ্রি অ্যাকাউন্ট তৈরি করতে মাত্র ২ মিনিট সময় লাগে। 
        ভেরিফিকেশন সম্পন্ন করে আজই কাজ শুরু করুন এবং আপনার স্বপ্নকে বাস্তবে রূপ দিন।
      </p>
      <div className="cta-actions">
        <button className="hero-btn-primary" onClick={() => navigate('/register')}>
          <i className="fa-solid fa-user-plus"></i> ফ্রি অ্যাকাউন্ট তৈরি করুন
        </button>
        <button className="hero-btn-secondary" onClick={() => navigate('/login')}>
          <i className="fa-solid fa-sign-in"></i> সাইন ইন
        </button>
      </div>
    </section>
  );
};

export default CTASection;