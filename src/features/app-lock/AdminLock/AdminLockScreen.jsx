// src/components/AdminLock/AdminLockScreen.jsx
// New (admin dashboard lock security requirement)

import React, { useState } from 'react';
import styles from './AdminLockScreen.module.css';

const AdminLockScreen = ({ mode, onUnlock, onRecovery, onSetup, error, clearError }) => {
  const [password, setPassword] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmRecovery, setConfirmRecovery] = useState('');
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── First-time setup: admin chooses a password + a separate
  // recovery password to use if they ever forget the first one. ──
  if (mode === 'setup') {
    const handleSetup = async (e) => {
      e.preventDefault();
      if (password !== confirmPassword) {
        clearError();
        return onSetup(null, null, 'পাসওয়ার্ড দুটি মিলছে না');
      }
      if (recoveryPassword !== confirmRecovery) {
        clearError();
        return onSetup(null, null, 'রিকভারি পাসওয়ার্ড দুটি মিলছে না');
      }
      setSubmitting(true);
      await onSetup(password, recoveryPassword);
      setSubmitting(false);
    };

    return (
      <div className={styles.overlay}>
        <form className={styles.card} onSubmit={handleSetup}>
          <i className="fa-solid fa-lock" style={{ fontSize: '2rem', color: 'var(--brand-primary, #14b8a6)' }}></i>
          <h2>এডমিন ড্যাশবোর্ড লক সেটআপ</h2>
          <p className={styles.hint}>এডমিন ড্যাশবোর্ডে অতিরিক্ত সুরক্ষার জন্য একটি পাসওয়ার্ড সেট করুন, এবং একটি আলাদা রিকভারি পাসওয়ার্ড যা পাসওয়ার্ড ভুলে গেলে ব্যবহার করবেন।</p>

          <input type="password" placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <input type="password" placeholder="পাসওয়ার্ড নিশ্চিত করুন" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
          <input type="password" placeholder="রিকভারি পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)" value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} required minLength={6} />
          <input type="password" placeholder="রিকভারি পাসওয়ার্ড নিশ্চিত করুন" value={confirmRecovery} onChange={(e) => setConfirmRecovery(e.target.value)} required minLength={6} />

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? <i className="fa-solid fa-spinner fa-spin"></i> : 'সেট করুন'}
          </button>
        </form>
      </div>
    );
  }

  // ── Locked: unlock with password, or switch to recovery ──
  const handleUnlock = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await onUnlock(password);
    setSubmitting(false);
  };

  const handleRecovery = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await onRecovery(recoveryPassword);
    setSubmitting(false);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <i className="fa-solid fa-lock" style={{ fontSize: '2rem', color: 'var(--brand-primary, #14b8a6)' }}></i>
        <h2>এডমিন ড্যাশবোর্ড লক করা আছে</h2>

        {!showRecoveryForm ? (
          <form onSubmit={handleUnlock}>
            <input
              type="password"
              placeholder="পাসওয়ার্ড দিন"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" disabled={submitting}>
              {submitting ? <i className="fa-solid fa-spinner fa-spin"></i> : 'আনলক করুন'}
            </button>
            <button type="button" className={styles.linkBtn} onClick={() => { setShowRecoveryForm(true); clearError(); }}>
              পাসওয়ার্ড ভুলে গেছেন?
            </button>
          </form>
        ) : (
          <form onSubmit={handleRecovery}>
            <p className={styles.hint}>আগে থেকে সেট করা রিকভারি পাসওয়ার্ড দিন।</p>
            <input
              type="password"
              placeholder="রিকভারি পাসওয়ার্ড"
              value={recoveryPassword}
              onChange={(e) => setRecoveryPassword(e.target.value)}
              autoFocus
              required
            />
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" disabled={submitting}>
              {submitting ? <i className="fa-solid fa-spinner fa-spin"></i> : 'রিকভার করুন'}
            </button>
            <button type="button" className={styles.linkBtn} onClick={() => { setShowRecoveryForm(false); clearError(); }}>
              পাসওয়ার্ড দিয়ে চেষ্টা করুন
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AdminLockScreen;
