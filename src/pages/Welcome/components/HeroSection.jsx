// src/pages/Welcome/components/HeroSection.jsx

import React from 'react';
// import './HeroSection.css';

const HeroSection = ({ navigate }) => {
  return (
    <section className="hero-section">
      <div className="hero-badge">বাংলাদেশের বিশ্বস্ত ফ্রিল্যান্স মার্কেটপ্লেস</div>
      <h1 className="hero-title">
        সংযোগ করুন, কাজ করুন, <br />
        <span style={{ color: '#14b8a6', WebkitTextFillColor: '#14b8a6' }}>
          একসাথে বেড়ে উঠুন
        </span> 
      </h1>
      <p className="hero-subtitle">
        WorkTrustbd একটি বিশ্বস্ত ফ্রিল্যান্স ও সার্ভিস মার্কেটপ্লেস। 
        এখানে ক্লায়েন্ট ও প্রফেশনালরা নিরাপদে সংযোগ স্থাপন করতে পারেন 
        ভেরিফাইড প্রোফাইল, এসক্রো পেমেন্ট এবং অ্যাডমিন-অ্যাপ্রুভড পোস্টের মাধ্যমে। 
        আমাদের লক্ষ্য বাংলাদেশের ফ্রিল্যান্সারদের জন্য একটি নিরাপদ ও স্বচ্ছ প্ল্যাটফর্ম তৈরি করা 
        যেখানে তারা আত্মবিশ্বাসের সাথে কাজ করতে পারে এবং তাদের দক্ষতা দিয়ে আয় করতে পারে।
      </p>
      <div className="hero-actions">
        <button className="hero-btn-primary" onClick={() => navigate('/register')}>
          <i className="fa-solid fa-rocket"></i> ফ্রিতে শুরু করুন
        </button>
        <button className="hero-btn-secondary" onClick={() => navigate('/login')}>
          <i className="fa-solid fa-sign-in"></i> লগ ইন
        </button>
      </div>
    </section>
  );
};

export default HeroSection;