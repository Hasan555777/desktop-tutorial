// src/pages/BlockedPage.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../shared/context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../shared/firebase/index';
// import styles from '../auth/VerifyPending.module.css';
import styles from './BlockedPage.module.css';

const BlockedPage = () => {
  const { logout, currentUser } = useAuth();
  const [timeRemaining, setTimeRemaining] = useState('');
  const [blockReason, setBlockReason] = useState('');

  // 🔧 FIX (#27 24-hour block review): this used to calculate
  // "24 hours have passed" client-side and show a fake "your account
  // has been automatically deleted" screen — nothing was ever
  // actually deleted, it was a setInterval-driven illusion that only
  // "worked" if this exact page happened to be open in a browser.
  // The real 24-hour check now runs server-side on a schedule (see
  // block-review-worker/) and notifies the admin to review and
  // decide — it never auto-deletes anything, matching the actual
  // requirement. This page now just shows how long the account has
  // been under review, honestly, instead of a countdown to a fake
  // deletion.
  useEffect(() => {
    const fetchBlockInfo = async () => {
      if (!currentUser?.uid) return;

      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setBlockReason(data.banReason || 'অ্যাডমিন দ্বারা ব্লক করা হয়েছে');

          const bannedAt = data.bannedAt?.toDate?.() || new Date(data.bannedAt);

          const updateElapsed = () => {
            const diff = Date.now() - bannedAt.getTime();
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setTimeRemaining(`${hours} ঘণ্টা ${minutes} মিনিট আগে`);
          };

          updateElapsed();
          // Updates once a minute — this is purely informational
          // display now (not a deadline countdown), so no need for
          // per-second updates.
          const interval = setInterval(updateElapsed, 60000);
          return () => clearInterval(interval);
        }
      } catch (error) {
        console.error('Error fetching block info:', error);
      }
    };

    fetchBlockInfo();
  }, [currentUser]);

  // 🔧 FIX (#27 24-hour block review): removed the fake "your account
  // was automatically deleted" state that used to render here.
  // Nothing was ever actually being deleted — it was a client-side
  // setInterval comparing bannedAt+24h to now, purely cosmetic, and
  // relied entirely on this page happening to be open in a browser.
  // The real 24-hour check now runs server-side (see
  // block-review-worker/) and notifies the admin — this page just
  // shows an honest status instead of a fake countdown-to-deletion.

 // ── ব্লক অবস্থায় ──
  return (
    <div className={styles.verifyPendingContainer}>
      <div className={styles.verifyCard}>
        <div className={`${styles.verifyIcon} ${styles.error}`}>🚫</div>
        <h2>অ্যাকাউন্ট ব্লক করা হয়েছে</h2>
        <p>{blockReason}</p>

        <div className={styles.blockTimer}>
          <div className={styles.timerIcon}>⏰</div>
          <div className={styles.timerText}>
            <span className={styles.timerLabel}>ব্লক হয়েছে:</span>
            <span className={styles.timerValue}>{timeRemaining || 'গণনা করা হচ্ছে...'}</span>
          </div>
        </div>

        <div className={styles.blockInfo}>
          <p>
            <i className="fa-solid fa-info-circle"></i>
            আপনার অ্যাকাউন্ট এডমিন কর্তৃক পর্যালোচনাধীন আছে। ২৪ ঘণ্টা পর
            এডমিনকে স্বয়ংক্রিয়ভাবে জানানো হবে এবং এডমিন সিদ্ধান্ত নেবেন —
            আপনার অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে ডিলিট হবে না।
          </p>
        </div>

        <div className={styles.verifyActions}>
          <button className={styles.btnSupport} onClick={() => window.location.href = 'mailto:support@worktrustbd.com'}>
            📧 সাপোর্টে ইমেইল করুন
          </button>
        </div>

        <div className={styles.verifyFooter}>
          <button className={styles.btnLogout} onClick={logout}>🔓 লগ আউট করুন</button>
        </div>
      </div>
    </div>
  );
};

export default BlockedPage;