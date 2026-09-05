// src/components/DealGuideModal.jsx
//
// একটা reusable "পড়ুন ও নিশ্চিত করুন" পপআপ। অফার পাঠানোর আগে (sender) এবং
// অফার গ্রহণ করার আগে (accepter) — দুই জায়গাতেই এটা ব্যবহার হয়, যাতে দুই
// পক্ষই ডিল ম্যানেজার সিস্টেম কীভাবে কাজ করে তা বুঝে নিয়েই এগোয়।
//
// ব্যবহার (অপরিবর্তিত — কোনো caller-কে touch করতে হবে না):
//   <DealGuideModal
//     show={showGuideModal}
//     role="sender" | "accepter"
//     onConfirm={() => { ...continue the actual action... }}
//     onCancel={() => setShowGuideModal(false)}
//   />
//
// ============================================================
// 🆕 CHANGE: heading/subtitle/steps/checkbox-label এখন Firestore-এর
// guides/deal ডকুমেন্ট থেকে লাইভ লোড হয় (Admin Dashboard → গাইড ট্যাব →
// "🤝 ডিল গাইড" থেকে এডিটযোগ্য — GuideEditor.jsx দেখুন)। এই মোডালটা
// deal flow-এর একটা বাধ্যতামূলক gate (checkbox ছাড়া এগোনো যায় না),
// তাই Firestore-এ কিছু সেট না থাকলে বা fetch fail করলেও এটা কখনো
// ভেঙে পড়বে না — নিচের FALLBACK_CONTENT (তোমার আগের হার্ডকোড করা
// কনটেন্ট, হুবহু) সবসময় ব্যাকআপ হিসেবে থাকছে।
// ============================================================

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../shared/firebase/index';
import styles from './DealGuideModal.module.css';

// 🔒 Fallback — Admin কিছু সেভ না করা পর্যন্ত, বা Firestore আনরিচেবল হলে,
// ঠিক আগের মতো এই কনটেন্টই দেখানো হবে।
const FALLBACK_STEPS = [
  { title: 'অফার গ্রহণ', description: 'অফার গ্রহণ করার সাথে সাথে Buyer-এর ওয়ালেটে পুরো বাজেট লক (reserved) হয়ে যায় — এটা কনফার্ম করে যে সেলার কাজ শুরু করলে টাকা পাবে।' },
  { title: 'মাইলস্টোন ফান্ড করা', description: 'প্রতিটা মাইলস্টোনের কাজ শুরুর আগে Buyer সেটা "Fund" (Pay & Fund) করবেন — এই টাকা তখনই সেলারের কাছে যায় না, এসক্রোতে জমা থাকে।' },
  { title: 'নির্দিষ্ট সময়ের মধ্যে কাজ জমা দিন', description: 'ফান্ড হওয়ার পর সেলারকে ৭ দিনের মধ্যে কাজ জমা দিতে হবে (প্রুফ লিংক/স্ক্রিনশট + নোট)। এই সময়ের মধ্যে জমা না দিলে টাকা স্বয়ংক্রিয়ভাবে Buyer-এর ওয়ালেটে ফেরত চলে যাবে।' },
  { title: 'কাজ রিভিউ', description: 'সেলার কাজ জমা দিলে Buyer সেটা দেখে Accept অথবা Reject (কারণসহ) করতে পারবেন। Reject করলে সেলার সংশোধন করে আবার জমা দিতে পারবে।' },
  { title: 'পেমেন্ট রিলিজ', description: 'Accept করার সাথে সাথে ঐ মাইলস্টোনের টাকা সরাসরি সেলারের ওয়ালেটে যোগ হয়ে যাবে।' },
  { title: 'ডেডলাইন এক্সটেনশন', description: 'সর্বোচ্চ ৩ বার ডেডলাইন বাড়ানো যাবে, প্রতিবার অন্য পক্ষের অনুমোদন লাগবে।' },
  { title: 'বাতিল/বিরোধ', description: 'কোনো মাইলস্টোন ফান্ড হওয়ার আগে ডিল বাতিল করা যায় (দুই পক্ষের সম্মতিতে)। জটিল সমস্যায় Dispute ওপেন করা যাবে — তখন Admin সিদ্ধান্ত নেবে।' },
  { title: '', description: 'প্রতিটা গুরুত্বপূর্ণ পদক্ষেপে (অফার, ফান্ড, সাবমিট, অ্যাক্সেপ্ট/রিজেক্ট, বাতিল) — উভয় পক্ষকেই নোটিফিকেশন পাঠানো হবে।' },
];

const FALLBACK_CONTENT = {
  senderTitle: 'অফার পাঠানোর আগে এই নিয়মগুলো জেনে নিন',
  accepterTitle: 'অফার গ্রহণ করার আগে এই নিয়মগুলো জেনে নিন',
  subtitle: 'নিচের পুরো প্রক্রিয়াটা একবার পড়ে নিন — পরে কোনো ধাপে বিভ্রান্তি হবে না।',
  checkboxLabel: 'আমি উপরের সম্পূর্ণ প্রক্রিয়াটি পড়েছি এবং বুঝেছি, এবং এই শর্তে এগিয়ে যেতে সম্মত।',
  requireCheckbox: true,
  steps: FALLBACK_STEPS,
};

const DealGuideModal = ({ show, onConfirm, onCancel, role = 'accepter' }) => {
  const [checked, setChecked] = useState(false);
  const [content, setContent] = useState(FALLBACK_CONTENT);

  // মোডাল খোলার সময় চেকবক্স রিসেট থাকবে
  useEffect(() => {
    if (show) setChecked(false);
  }, [show]);

  // 🆕 Firestore থেকে লাইভ কনটেন্ট — admin এডিট করলে সাথে সাথে reflect হবে।
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'guides', 'deal'),
      (snap) => {
        if (!snap.exists()) {
          setContent(FALLBACK_CONTENT);
          return;
        }
        const data = snap.data();
        if (data.enabled === false || !Array.isArray(data.steps) || data.steps.length === 0) {
          setContent(FALLBACK_CONTENT);
          return;
        }
        setContent({
          senderTitle: data.senderTitle || FALLBACK_CONTENT.senderTitle,
          accepterTitle: data.accepterTitle || FALLBACK_CONTENT.accepterTitle,
          subtitle: data.subtitle || FALLBACK_CONTENT.subtitle,
          checkboxLabel: data.checkboxLabel || FALLBACK_CONTENT.checkboxLabel,
          requireCheckbox: data.requireCheckbox !== false,
          steps: data.steps,
        });
      },
      (error) => {
        console.error('❌ DealGuideModal: guide content load failed, using fallback:', error);
        setContent(FALLBACK_CONTENT);
      }
    );
    return () => unsubscribe();
  }, []);

  if (!show) return null;

  const heading = role === 'sender' ? content.senderTitle : content.accepterTitle;
  const canConfirm = !content.requireCheckbox || checked;

  return (
    <div className={styles.dealGuideOverlay} onClick={onCancel}>
      <div className={styles.dealGuideModal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.dealGuideTitle}>
          <i className="fa-solid fa-shield-halved"></i>
          {heading}
        </h2>
        <p className={styles.dealGuideSubtitle}>
          {content.subtitle}
        </p>

        <div className={styles.dealGuideSteps}>
          <ol className={styles.dealGuideList}>
            {content.steps.map((step, idx) => (
              <li key={idx} className={styles.dealGuideStepItem}>
                {step.title && <strong>{step.title}:</strong>} {step.description}
              </li>
            ))}
          </ol>
        </div>

        {content.requireCheckbox && (
          <label className={styles.dealGuideCheckbox}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className={styles.dealGuideCheckboxInput}
            />
            <span>{content.checkboxLabel}</span>
          </label>
        )}

        <div className={styles.dealGuideActions}>
          <button
            className={styles.dealGuideCancel}
            onClick={onCancel}
          >
            বাতিল
          </button>
          <button
            className={`${styles.dealGuideConfirm} ${!canConfirm ? styles.disabled : ''}`}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            <i className="fa-solid fa-check"></i> বুঝেছি, এগিয়ে যান
          </button>
        </div>
      </div>
    </div>
  );
};

export default DealGuideModal;