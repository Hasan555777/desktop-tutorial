// src/pages/Admin/components/WithdrawalFeeSettings.jsx
// Lets an admin set the withdrawal fee percentage AND the min/max
// withdrawal amount (settings/withdrawalConfig.feePercent /
// minAmount / maxAmount), read by Withdraw.jsx.
//
// 🔧 ADD (admin should control Withdraw the same way as Deposit):
// min/max used to be hardcoded constants in Withdraw.jsx
// (MIN_WITHDRAW = 100, MAX_WITHDRAW = 50000) with no admin control
// at all — only the fee was editable. Added minAmount/maxAmount to
// the same settings doc/UI so withdrawal limits are configurable
// the same way deposit payment methods are (PaymentMethodsSettings.jsx).

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../shared/firebase/index';
import styles from './WithdrawalFeeSettings.module.css';

const DEFAULT_MIN = 100;
const DEFAULT_MAX = 50000;

// 🔧 FIX (permission-protected requirement): this previously had no
// permission check at all — any admin who could see the withdrawals
// tab could change the platform-wide fee. `canEdit` is passed down
// from AdminDashboard.jsx's canAccessTab('finance'), the same check
// used to gate deposit/withdrawal approval, so a sub-admin without
// the 'finance' permission can view the current settings but not
// change them. This is the client-side half only — the real
// boundary is the Firestore rule on settings/{id}.
const WithdrawalFeeSettings = ({ feedback, canEdit = false }) => {
  const [feePercent, setFeePercent] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const [saved, setSaved] = useState({ feePercent: 0, minAmount: DEFAULT_MIN, maxAmount: DEFAULT_MAX });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'withdrawalConfig'));
        if (!cancelled) {
          const data = snap.exists() ? snap.data() : {};
          const fee = Number(data.feePercent) || 0;
          const min = Number(data.minAmount) || DEFAULT_MIN;
          const max = Number(data.maxAmount) || DEFAULT_MAX;
          setFeePercent(String(fee));
          setMinAmount(String(min));
          setMaxAmount(String(max));
          setSaved({ feePercent: fee, minAmount: min, maxAmount: max });
        }
      } catch (error) {
        console.error('Failed to load withdrawal config:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isDirty =
    Number(feePercent) !== saved.feePercent ||
    Number(minAmount) !== saved.minAmount ||
    Number(maxAmount) !== saved.maxAmount;

  const handleSave = async () => {
    if (!canEdit) {
      feedback?.alert.error({ title: 'এই অ্যাকশনের জন্য আপনার পারমিশন নেই।' });
      return;
    }
    const fee = Number(feePercent);
    const min = Number(minAmount);
    const max = Number(maxAmount);

    if (isNaN(fee) || fee < 0 || fee > 100) {
      feedback?.alert.error({ title: 'ফি অবশ্যই ০ থেকে ১০০ এর মধ্যে হতে হবে' });
      return;
    }
    if (isNaN(min) || min <= 0) {
      feedback?.alert.error({ title: 'মিনিমাম উইথড্র পরিমাণ সঠিক হতে হবে' });
      return;
    }
    if (isNaN(max) || max <= min) {
      feedback?.alert.error({ title: 'ম্যাক্সিমাম পরিমাণ মিনিমামের চেয়ে বেশি হতে হবে' });
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'withdrawalConfig'), {
        feePercent: fee,
        minAmount: min,
        maxAmount: max,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });
      setSaved({ feePercent: fee, minAmount: min, maxAmount: max });
      feedback?.alert.success({ title: '✅ উইথড্র সেটিংস সেভ করা হয়েছে' });
    } catch (error) {
      console.error('Failed to save withdrawal config:', error);
      feedback?.alert.error({ title: 'সেভ করতে ব্যর্থ হয়েছে' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <i className="fa-solid fa-percent" style={{ opacity: 0.7 }}></i>
        <span className={styles.label}>উইথড্র ফি (%):</span>
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={feePercent}
          onChange={(e) => setFeePercent(e.target.value)}
          disabled={!canEdit}
          className={styles.input}
        />

        <i className="fa-solid fa-arrow-down-short-wide" style={{ opacity: 0.7, marginLeft: '8px' }}></i>
        <span className={styles.label}>মিনিমাম (৳):</span>
        <input
          type="number"
          min="1"
          step="1"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
          disabled={!canEdit}
          className={styles.input}
        />

        <i className="fa-solid fa-arrow-up-short-wide" style={{ opacity: 0.7, marginLeft: '8px' }}></i>
        <span className={styles.label}>ম্যাক্সিমাম (৳):</span>
        <input
          type="number"
          min="1"
          step="1"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
          disabled={!canEdit}
          className={styles.input}
        />

        <button
          onClick={handleSave}
          disabled={!canEdit || saving || !isDirty}
          className={styles.saveBtn}
        >
          {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : 'সেভ করুন'}
        </button>
      </div>
      <span className={styles.hint}>
        বর্তমান: ফি {saved.feePercent}% • মিনিমাম ৳{saved.minAmount} • ম্যাক্সিমাম ৳{saved.maxAmount}
        {!canEdit && ' (শুধু ফাইন্যান্স পারমিশনসহ অ্যাডমিন পরিবর্তন করতে পারবেন)'}
      </span>
    </div>
  );
};

export default WithdrawalFeeSettings;
