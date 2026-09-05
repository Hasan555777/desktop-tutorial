// src/pages/Admin/components/GuideEditor.jsx
// ============================================================
// 🆕 Admin UI for editing the content shown in GuideModal.jsx popups
// (currently: the wallet "how to deposit/withdraw" guide, and — once
// DealManager.jsx's own guide popup is wired to the same Firestore
// doc — the deal guide too). Writes directly to guides/{key} in
// Firestore; no separate hook wiring needed in useAdminData.js.
//
// 🔒 Needs a Firestore rule allowing admin-only writes to `guides/*`
// (public read, since GuideModal.jsx reads it for every user):
//
//   match /guides/{guideId} {
//     allow read: if true;
//     allow write: if isAdmin();
//   }
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../shared/firebase/index';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import styles from './GuideEditor.module.css';

const GUIDE_OPTIONS = [
  { key: 'wallet', label: '💰 ওয়ালেট গাইড', hint: 'ওয়ালেট পেজে ঢোকার সময় দেখানো পপআপ — যেমন বিকাশ/নগদে কীভাবে পেমেন্ট করবে, কতক্ষণ অপেক্ষা করবে।' },
  { key: 'deal', label: '🤝 ডিল গাইড', hint: 'ডিল শুরু করার সময় দেখানো পপআপ।' },
];

const emptyStep = () => ({ icon: '✅', title: '', description: '' });
const emptyGuide = () => ({ title: '', subtitle: '', enabled: true, steps: [emptyStep()] });

const GuideEditor = () => {
  const feedback = useFeedback();
  const [activeKey, setActiveKey] = useState('wallet');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guide, setGuide] = useState(emptyGuide());

  const loadGuide = useCallback(async (key) => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'guides', key));
      if (snap.exists()) {
        const data = snap.data();
        setGuide({
          title: data.title || '',
          subtitle: data.subtitle || '',
          enabled: data.enabled !== false,
          steps: (Array.isArray(data.steps) && data.steps.length > 0) ? data.steps : [emptyStep()],
        });
      } else {
        setGuide(emptyGuide());
      }
    } catch (error) {
      console.error('Load guide error:', error);
      feedback.showError('❌ লোড ব্যর্থ', 'গাইড লোড করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  }, [feedback]);

  useEffect(() => {
    loadGuide(activeKey);
  }, [activeKey, loadGuide]);

  const updateStep = (idx, field, value) => {
    setGuide(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    }));
  };

  const addStep = () => {
    setGuide(prev => ({ ...prev, steps: [...prev.steps, emptyStep()] }));
  };

  const removeStep = (idx) => {
    setGuide(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== idx) }));
  };

  const moveStep = (idx, direction) => {
    setGuide(prev => {
      const steps = [...prev.steps];
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= steps.length) return prev;
      [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
      return { ...prev, steps };
    });
  };

  const handleSave = async () => {
    if (!guide.title.trim()) {
      feedback.showWarning('⚠️ শিরোনাম দিন', 'গাইডের একটা শিরোনাম আবশ্যক');
      return;
    }

    const cleanSteps = guide.steps
      .map(s => ({ icon: (s.icon || '✅').trim(), title: (s.title || '').trim(), description: (s.description || '').trim() }))
      .filter(s => s.title || s.description);

    if (cleanSteps.length === 0) {
      feedback.showWarning('⚠️ ধাপ দিন', 'অন্তত একটা ধাপ (title বা description) থাকতে হবে');
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'guides', activeKey), {
        title: guide.title.trim(),
        subtitle: guide.subtitle.trim(),
        enabled: guide.enabled,
        steps: cleanSteps,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || 'admin',
        updatedByEmail: auth.currentUser?.email || 'admin',
      });

      feedback.showSuccess('✅ সংরক্ষিত হয়েছে', 'গাইড আপডেট হয়েছে — সব ইউজার আবার নতুন ভার্সন দেখবে।');
    } catch (error) {
      console.error('Save guide error:', error);
      feedback.showError('❌ সেভ ব্যর্থ', 'গাইড সংরক্ষণ করতে সমস্যা হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  const activeOption = GUIDE_OPTIONS.find(o => o.key === activeKey);

  return (
    <div className={styles.guideEditor}>
      <div className={styles.guideEditorHeader}>
        <h3><i className="fa-solid fa-book-open"></i> গাইড ম্যানেজমেন্ট</h3>
        <p className={styles.sectionSubtitle}>
          এখানে যা লিখবেন, ইউজাররা ঠিক তাই পপআপে দেখবে — কোনো কোড পরিবর্তন লাগবে না।
        </p>
      </div>

      <div className={styles.guideTabs}>
        {GUIDE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`${styles.guideTabBtn} ${activeKey === opt.key ? styles.active : ''}`}
            onClick={() => setActiveKey(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {activeOption && <p className={styles.guideTabHint}>{activeOption.hint}</p>}

      {loading ? (
        <div className={styles.guideEditorLoading}>
          <i className="fa-solid fa-spinner fa-spin"></i> লোড হচ্ছে...
        </div>
      ) : (
        <div className={styles.guideEditorForm}>
          <label className={styles.guideEditorToggle}>
            <input
              type="checkbox"
              checked={guide.enabled}
              onChange={(e) => setGuide(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <span>এই পপআপ চালু আছে</span>
          </label>

          <div className={styles.geFormGroup}>
            <label>শিরোনাম (Title)</label>
            <input
              type="text"
              value={guide.title}
              onChange={(e) => setGuide(prev => ({ ...prev, title: e.target.value }))}
              placeholder="যেমন: কীভাবে ওয়ালেটের কাজ সম্পন্ন করবেন"
            />
          </div>

          <div className={styles.geFormGroup}>
            <label>উপশিরোনাম (Subtitle) — ঐচ্ছিক</label>
            <input
              type="text"
              value={guide.subtitle}
              onChange={(e) => setGuide(prev => ({ ...prev, subtitle: e.target.value }))}
              placeholder="যেমন: নিচের ধাপগুলো মনোযোগ দিয়ে পড়ুন"
            />
          </div>

          <div className={styles.guideStepsEditor}>
            <div className={styles.guideStepsHeader}>
              <label>ধাপসমূহ (Steps)</label>
              <button className={styles.btnAddStep} onClick={addStep}>
                <i className="fa-solid fa-plus"></i> ধাপ যোগ করুন
              </button>
            </div>

            {guide.steps.map((step, idx) => (
              <div className={styles.guideStepRow} key={idx}>
                <div className={styles.guideStepControls}>
                  <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} title="উপরে সরান">
                    <i className="fa-solid fa-arrow-up"></i>
                  </button>
                  <button onClick={() => moveStep(idx, 1)} disabled={idx === guide.steps.length - 1} title="নিচে সরান">
                    <i className="fa-solid fa-arrow-down"></i>
                  </button>
                  <button onClick={() => removeStep(idx)} className={styles.btnRemoveStep} title="ডিলিট করুন">
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>

                <input
                  type="text"
                  className={styles.guideStepIconInput}
                  value={step.icon}
                  onChange={(e) => updateStep(idx, 'icon', e.target.value)}
                  placeholder="🔵"
                  maxLength={4}
                />

                <div className={styles.guideStepFields}>
                  <input
                    type="text"
                    value={step.title}
                    onChange={(e) => updateStep(idx, 'title', e.target.value)}
                    placeholder={`ধাপ ${idx + 1} শিরোনাম (যেমন: বিকাশে পেমেন্ট করুন)`}
                  />
                  <textarea
                    value={step.description}
                    onChange={(e) => updateStep(idx, 'description', e.target.value)}
                    placeholder="বিস্তারিত লিখুন... (যেমন: বিকাশ নম্বরে Send Money করুন, তারপর ট্রানজেকশন আইডি দিন। অ্যাপ্রুভ হতে সাধারণত ৫-১৫ মিনিট সময় লাগে।)"
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>

          <button className={styles.btnSaveGuide} onClick={handleSave} disabled={saving}>
            {saving ? (
              <><i className="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...</>
            ) : (
              <><i className="fa-solid fa-floppy-disk"></i> সংরক্ষণ করুন</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default GuideEditor;