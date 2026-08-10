// src/components/DealGuideModal.jsx
//
// একটা reusable "পড়ুন ও নিশ্চিত করুন" পপআপ। অফার পাঠানোর আগে (sender) এবং
// অফার গ্রহণ করার আগে (accepter) — দুই জায়গাতেই এটা ব্যবহার হয়, যাতে দুই
// পক্ষই ডিল ম্যানেজার সিস্টেম কীভাবে কাজ করে তা বুঝে নিয়েই এগোয়।
//
// ব্যবহার:
//   <DealGuideModal
//     show={showGuideModal}
//     role="sender" | "accepter"
//     onConfirm={() => { ...continue the actual action... }}
//     onCancel={() => setShowGuideModal(false)}
//   />

import React, { useState, useEffect } from 'react';

const DealGuideModal = ({ show, onConfirm, onCancel, role = 'accepter' }) => {
  const [checked, setChecked] = useState(false);

  // মোডাল খোলার সময় চেকবক্স রিসেট থাকবে
  useEffect(() => {
    if (show) setChecked(false);
  }, [show]);

  if (!show) return null;

  const heading = role === 'sender'
    ? 'অফার পাঠানোর আগে এই নিয়মগুলো জেনে নিন'
    : 'অফার গ্রহণ করার আগে এই নিয়মগুলো জেনে নিন';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px'
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--bg-secondary, #0f1420)',
          color: 'var(--text-primary, #f8fafc)',
          borderRadius: '16px',
          maxWidth: '540px',
          width: '100%',
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: '24px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '6px', fontSize: '19px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-shield-halved" style={{ color: 'var(--accent-primary, #14b8a6)' }}></i>
          {heading}
        </h2>
        <p style={{ marginTop: 0, marginBottom: '16px', fontSize: '13px', color: 'var(--text-muted, #94a3b8)' }}>
          নিচের পুরো প্রক্রিয়াটা একবার পড়ে নিন — পরে কোনো ধাপে বিভ্রান্তি হবে না।
        </p>

        <div style={{ fontSize: '13.5px', lineHeight: '1.75', color: 'var(--text-secondary, #cbd5e1)' }}>
          <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <li>
              <strong>অফার গ্রহণ:</strong> অফার গ্রহণ করার সাথে সাথে Buyer-এর ওয়ালেটে পুরো বাজেট
              <strong> লক (reserved)</strong> হয়ে যায় — এটা কনফার্ম করে যে সেলার কাজ শুরু করলে টাকা পাবে।
            </li>
            <li>
              <strong>মাইলস্টোন ফান্ড করা:</strong> প্রতিটা মাইলস্টোনের কাজ শুরুর আগে Buyer সেটা
              <strong> "Fund" (Pay & Fund)</strong> করবেন — এই টাকা তখনই সেলারের কাছে যায় না, এসক্রোতে জমা থাকে।
            </li>
            <li>
              <strong>নির্দিষ্ট সময়ের মধ্যে কাজ জমা দিন:</strong> ফান্ড হওয়ার পর সেলারকে
              <strong> ৭ দিনের মধ্যে</strong> কাজ জমা দিতে হবে (প্রুফ লিংক/স্ক্রিনশট + নোট)। এই সময়ের মধ্যে জমা না দিলে
              টাকা স্বয়ংক্রিয়ভাবে Buyer-এর ওয়ালেটে ফেরত চলে যাবে।
            </li>
            <li>
              <strong>কাজ রিভিউ:</strong> সেলার কাজ জমা দিলে Buyer সেটা দেখে <strong>Accept</strong> অথবা
              <strong> Reject</strong> (কারণসহ) করতে পারবেন। Reject করলে সেলার সংশোধন করে আবার জমা দিতে পারবে।
            </li>
            <li>
              <strong>পেমেন্ট রিলিজ:</strong> Accept করার সাথে সাথে ঐ মাইলস্টোনের টাকা সরাসরি সেলারের
              ওয়ালেটে যোগ হয়ে যাবে।
            </li>
            <li>
              <strong>ডেডলাইন এক্সটেনশন:</strong> সর্বোচ্চ ৩ বার ডেডলাইন বাড়ানো যাবে, প্রতিবার অন্য পক্ষের
              অনুমোদন লাগবে।
            </li>
            <li>
              <strong>বাতিল/বিরোধ:</strong> কোনো মাইলস্টোন ফান্ড হওয়ার আগে ডিল বাতিল করা যায় (দুই পক্ষের সম্মতিতে)।
              জটিল সমস্যায় <strong>Dispute</strong> ওপেন করা যাবে — তখন Admin সিদ্ধান্ত নেবে।
            </li>
            <li>
              প্রতিটা গুরুত্বপূর্ণ পদক্ষেপে (অফার, ফান্ড, সাবমিট, অ্যাক্সেপ্ট/রিজেক্ট, বাতিল) —
              <strong> উভয় পক্ষকেই</strong> নোটিফিকেশন পাঠানো হবে।
            </li>
          </ol>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            marginTop: '20px',
            padding: '12px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.04)',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: '2px', width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer' }}
          />
          <span>আমি উপরের সম্পূর্ণ প্রক্রিয়াটি পড়েছি এবং বুঝেছি, এবং এই শর্তে এগিয়ে যেতে সম্মত।</span>
        </label>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '11px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px'
            }}
          >
            বাতিল
          </button>
          <button
            onClick={onConfirm}
            disabled={!checked}
            style={{
              flex: 2,
              padding: '11px',
              borderRadius: '10px',
              border: 'none',
              background: checked ? 'var(--accent-primary, #14b8a6)' : '#334155',
              color: '#fff',
              cursor: checked ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <i className="fa-solid fa-check"></i> বুঝেছি, এগিয়ে যান
          </button>
        </div>
      </div>
    </div>
  );
};

export default DealGuideModal;