// src/components/GuideModal.jsx
// ============================================================
// 🆕 Generic, admin-editable "how to do this" popup.
//
// Usage: <GuideModal guideKey="wallet" />  or  <GuideModal guideKey="deal" />
//
// Content lives in Firestore at guides/{guideKey} — see
// src/pages/Admin/components/GuideEditor.jsx for the admin-side editor
// that writes to this same document. Nothing about the guide's TEXT is
// hardcoded here; only the popup mechanics are.
//
// Re-show behavior: the person only needs to dismiss a given guide
// once. We remember that via localStorage, keyed to the guide's
// updatedAt timestamp — so if the admin edits the guide later
// (bumping updatedAt), everyone who already dismissed the OLD version
// will see the NEW version once, automatically. No manual
// "reset for everyone" step needed on the admin side.
// ============================================================

import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import './GuideModal.css';

const seenStorageKey = (guideKey) => `guide_seen_${guideKey}`;

const GuideModal = ({ guideKey, forceShow = false, onClose = null }) => {
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!guideKey) return;

    const unsubscribe = onSnapshot(
      doc(db, 'guides', guideKey),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setGuide(data);

          if (data.enabled !== false && Array.isArray(data.steps) && data.steps.length > 0) {
            const updatedAtMs = data.updatedAt?.toMillis?.() || 0;
            const lastSeenMs = Number(localStorage.getItem(seenStorageKey(guideKey)) || 0);

            if (forceShow || lastSeenMs < updatedAtMs) {
              setVisible(true);
            }
          }
        } else {
          // Admin hasn't set this guide up yet — show nothing, no error.
          setGuide(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error(`❌ GuideModal (${guideKey}) load error:`, error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [guideKey, forceShow]);

  const handleClose = () => {
    if (guide?.updatedAt) {
      localStorage.setItem(seenStorageKey(guideKey), String(guide.updatedAt.toMillis()));
    }
    setVisible(false);
    onClose?.();
  };

  if (loading || !visible || !guide) return null;

  return (
    <div className="guide-modal-overlay" onClick={handleClose}>
      <div className="guide-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="guide-modal-close-btn" onClick={handleClose} aria-label="Close">
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div className="guide-modal-header">
          <h2>{guide.title}</h2>
          {guide.subtitle && <p className="guide-modal-subtitle">{guide.subtitle}</p>}
        </div>

        <div className="guide-modal-steps">
          {guide.steps.map((step, idx) => (
            <div className="guide-modal-step" key={idx}>
              <div className="guide-modal-step-icon">{step.icon || '✅'}</div>
              <div className="guide-modal-step-body">
                {step.title && <h4>{step.title}</h4>}
                {step.description && <p>{step.description}</p>}
              </div>
            </div>
          ))}
        </div>

        <button className="guide-modal-primary-btn" onClick={handleClose}>
          বুঝেছি, শুরু করি
        </button>
      </div>
    </div>
  );
};

export default GuideModal;