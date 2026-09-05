// src/pages/Settings/tabs/RulesTab.jsx

import React, { useState } from 'react';
import styles from './RulesTab.module.css';

const RulesTab = () => {
  const [expandedSection, setExpandedSection] = useState('withdraw');

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // ── Rules Sections ──
  const sections = [
    {
      id: 'withdraw',
      icon: 'fa-solid fa-money-bill-transfer',
      title: '💰 টাকা উত্তোলন (Withdraw)',
      color: '#10b981',
      rules: [
        { title: 'ন্যূনতম উত্তোলন', description: 'একবারে ন্যূনতম ৫০০ টাকা উত্তোলন করতে পারবেন।' },
        { title: 'সর্বোচ্চ উত্তোলন', description: 'প্রতিদিন সর্বোচ্চ ৫০,০০০ টাকা উত্তোলন করতে পারবেন।' },
        { title: 'প্রক্রিয়াকরণ সময়', description: 'উত্তোলন অনুরোধ ২৪-৪৮ ঘন্টার মধ্যে প্রক্রিয়া করা হবে।' },
        { title: 'ব্যাংক অ্যাকাউন্ট', description: 'আপনার যাচাইকৃত ব্যাংক অ্যাকাউন্টে টাকা পাঠানো হবে।' },
        { title: 'সার্ভিস চার্জ', description: 'প্রতি উত্তোলনে ১০ টাকা সার্ভিস চার্জ প্রযোজ্য।' },
        { title: 'অতিরিক্ত তথ্য', description: 'উত্তোলনের সময় আপনার প্রোফাইল সম্পূর্ণ ও ভেরিফাইড থাকতে হবে।' }
      ]
    },
    {
      id: 'send-money',
      icon: 'fa-solid fa-paper-plane',
      title: '📤 সেন্ড মানি (Send Money)',
      color: '#3b82f6',
      rules: [
        { title: 'ন্যূনতম সেন্ড', description: 'একবারে ন্যূনতম ১০০ টাকা সেন্ড করতে পারবেন।' },
        { title: 'সর্বোচ্চ সেন্ড', description: 'প্রতিদিন সর্বোচ্চ ২০,০০০ টাকা সেন্ড করতে পারবেন।' },
        { title: 'রিসিভার ভেরিফিকেশন', description: 'শুধুমাত্র ভেরিফাইড ইউজারদের কাছে টাকা সেন্ড করতে পারবেন।' },
        { title: 'সার্ভিস চার্জ', description: 'প্রতি সেন্ডে ৫ টাকা সার্ভিস চার্জ প্রযোজ্য।' },
        { title: 'নিরাপত্তা', description: 'পাসওয়ার্ড বা PIN দিয়ে ট্রানজেকশন কনফর্ম করতে হবে।' }
      ]
    },
    {
      id: 'add-money',
      icon: 'fa-solid fa-circle-plus',
      title: '➕ এড মানি (Add Money)',
      color: '#8b5cf6',
      rules: [
        { title: 'ন্যূনতম এড', description: 'একবারে ন্যূনতম ২০০ টাকা এড করতে পারবেন।' },
        { title: 'সর্বোচ্চ এড', description: 'প্রতিদিন সর্বোচ্চ ১,০০,০০০ টাকা এড করতে পারবেন।' },
        { title: 'পেমেন্ট মেথড', description: 'বিকাশ, নগদ, রকেট, ব্যাংক ট্রান্সফার সহযোগে এড করতে পারবেন।' },
        { title: 'প্রক্রিয়াকরণ সময়', description: 'এড করার ৫-১০ মিনিটের মধ্যে ওয়ালেটে টাকা যোগ হবে।' },
        { title: 'সার্ভিস চার্জ', description: 'এড মানিতে কোনো চার্জ প্রযোজ্য নয়।' }
      ]
    },
    {
      id: 'deal',
      icon: 'fa-solid fa-handshake',
      title: '🤝 ডিল ও লেনদেন (Deal & Transaction)',
      color: '#f59e0b',
      rules: [
        { title: 'ডিল তৈরি', description: 'শুধুমাত্র ভেরিফাইড ইউজাররা ডিল তৈরি করতে পারবেন।' },
        { title: 'ডিল গ্রহণ', description: 'যেকোনো ভেরিফাইড ইউজার ডিল গ্রহণ করতে পারবেন।' },
        { title: 'পেমেন্ট রিলিজ', description: 'কাজ শেষ হলে বায়ার পেমেন্ট রিলিজ করবেন।' },
        { title: 'বিতর্ক', description: 'কোনো সমস্যা হলে সাপোর্ট টিমের সাথে যোগাযোগ করুন।' },
        { title: 'রেটিং', description: 'ডিল শেষ হলে পারস্পরিক রেটিং দিতে হবে।' }
      ]
    },
    {
      id: 'verification',
      icon: 'fa-solid fa-id-card',
      title: '✅ ভেরিফিকেশন (Verification)',
      color: '#06b6d4',
      rules: [
        { title: 'NID ভেরিফিকেশন', description: 'আপনার NID আপলোড করে ভেরিফাইড হতে হবে।' },
        { title: 'সেলফি ভেরিফিকেশন', description: 'NID এর সাথে একটি সেলফি আপলোড করতে হবে।' },
        { title: 'প্রক্রিয়াকরণ সময়', description: 'ভেরিফিকেশন ২৪-৭২ ঘন্টার মধ্যে সম্পন্ন হবে।' },
        { title: 'ভেরিফিকেশন প্রয়োজন', description: 'উত্তোলন ও বড় ট্রানজেকশনের জন্য ভেরিফিকেশন আবশ্যক।' }
      ]
    },
    {
      id: 'security',
      icon: 'fa-solid fa-shield-halved',
      title: '🔒 নিরাপত্তা গাইডলাইন (Security)',
      color: '#ef4444',
      rules: [
        { title: 'শক্তিশালী পাসওয়ার্ড', description: '৮+ অক্ষরের শক্তিশালী পাসওয়ার্ড ব্যবহার করুন।' },
        { title: '2FA সক্রিয় রাখুন', description: 'অতিরিক্ত নিরাপত্তার জন্য 2FA চালু রাখুন।' },
        { title: 'অ্যাপ লক ব্যবহার', description: 'অ্যাপ লক ব্যবহার করে আপনার অ্যাকাউন্ট সুরক্ষিত রাখুন।' },
        { title: 'সন্দেহজনক কার্যক্রম', description: 'সন্দেহজনক কিছু দেখলে সাপোর্টকে জানান।' },
        { title: 'পাসওয়ার্ড পরিবর্তন', description: 'নিয়মিত পাসওয়ার্ড পরিবর্তন করুন।' }
      ]
    },
    {
      id: 'fee',
      icon: 'fa-solid fa-receipt',
      title: '📋 ফি ও চার্জ (Fees & Charges)',
      color: '#ec4899',
      rules: [
        { title: 'প্ল্যাটফর্ম ফি', description: 'প্রতি সফল ডিলে ৫% প্ল্যাটফর্ম ফি প্রযোজ্য।' },
        { title: 'উত্তোলন চার্জ', description: 'প্রতি উত্তোলনে ১০ টাকা চার্জ।' },
        { title: 'সেন্ড মানি চার্জ', description: 'প্রতি সেন্ডে ৫ টাকা চার্জ।' },
        { title: 'এড মানি চার্জ', description: 'এড মানিতে কোনো চার্জ নেই।' },
        { title: 'ভ্যাট', description: 'সব চার্জের উপর ১৫% ভ্যাট প্রযোজ্য।' }
      ]
    }
  ];

  return (
    <div className={styles.rulesTab}>
      {/* ── Header ── */}
      <div className={styles.rulesHeader}>
        <h2>
          <i className="fa-solid fa-gavel" style={{ color: 'var(--accent-primary)' }}></i>
          নিয়ম ও গাইডলাইন
        </h2>
        <p className={styles.rulesSubtitle}>
          প্ল্যাটফর্ম ব্যবহারের জন্য সকল নিয়ম ও গাইডলাইন
        </p>
      </div>

      {/* ── Quick Navigation ── */}
      <div className={styles.rulesNav}>
        {sections.map((section) => (
          <button
            key={section.id}
            className={`${styles.rulesNavBtn} ${expandedSection === section.id ? styles.active : ''}`}
            onClick={() => toggleSection(section.id)}
            style={{ borderColor: section.color }}
          >
            <i className={section.icon} style={{ color: section.color }}></i>
            <span>{section.title.split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>

      {/* ── Rules Content ── */}
      <div className={styles.rulesContent}>
        {sections.map((section) => (
          <div
            key={section.id}
            className={`${styles.rulesSection} ${expandedSection === section.id ? styles.expanded : ''}`}
          >
            <div
              className={styles.rulesSectionHeader}
              onClick={() => toggleSection(section.id)}
              style={{ borderLeftColor: section.color }}
            >
              <div className={styles.sectionTitle}>
                <i className={section.icon} style={{ color: section.color }}></i>
                <h3>{section.title}</h3>
              </div>
              <span className={styles.sectionToggle}>
                <i className={`fa-solid ${expandedSection === section.id ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
              </span>
            </div>

            {expandedSection === section.id && (
              <div className={styles.rulesSectionBody}>
                {section.rules.map((rule, index) => (
                  <div key={index} className={styles.ruleItem}>
                    <div className={styles.ruleNumber}>{index + 1}</div>
                    <div className={styles.ruleContent}>
                      <h4>{rule.title}</h4>
                      <p>{rule.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className={styles.rulesFooter}>
        <p>
          <i className="fa-solid fa-info-circle"></i>
          নিয়ম পরিবর্তনের অধিকার সংরক্ষিত। সর্বশেষ আপডেট: {new Date().toLocaleDateString('bn-BD')}
        </p>
      </div>
    </div>
  );
};

export default RulesTab;