// src/pages/Admin/components/DepositAmountSettings.jsx
// New — lets an admin set the min/max deposit amount
// (settings/depositConfig.minAmount / maxAmount), read live by
// Deposit.jsx. Mirrors WithdrawalFeeSettings.jsx's min/max fields
// so Deposit and Withdraw have the exact same kind of admin control
// over amount limits — previously MINIMUM_DEPOSIT/MAXIMUM_DEPOSIT
// were hardcoded constants in Deposit.jsx with no admin control at
// all.

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../shared/firebase/index';
import styles from './DepositAmountSettings.module.css';


const DEFAULT_MIN = 100;
const DEFAULT_MAX = 50000;

// 🔧 Same permission pattern as WithdrawalFeeSettings.jsx / 
// PaymentMethodsSettings.jsx — `canEdit` comes from
// AdminDashboard.jsx's canAccessTab('finance'). Client-side gate
// only; real boundary must be the Firestore rule on settings/{id}.
const DepositAmountSettings = ({ feedback, canEdit = false }) => {
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [saved, setSaved] = useState({ minAmount: DEFAULT_MIN, maxAmount: DEFAULT_MAX });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'depositConfig'));
        if (!cancelled) {
          const data = snap.exists() ? snap.data() : {};
          const min = Number(data.minAmount) || DEFAULT_MIN;
          const max = Number(data.maxAmount) || DEFAULT_MAX;
          setMinAmount(String(min));
          setMaxAmount(String(max));
          setSaved({ minAmount: min, maxAmount: max });
        }
      } catch (error) {
        console.error('Failed to load deposit config:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isDirty = Number(minAmount) !== saved.minAmount || Number(maxAmount) !== saved.maxAmount;

  const handleSave = async () => {
    if (!canEdit) {
      feedback?.alert.error({ title: 'এই অ্যাকশনের জন্য আপনার পারমিশন নেই।' });
      return;
    }
    const min = Number(minAmount);
    const max = Number(maxAmount);

    if (isNaN(min) || min <= 0) {
      feedback?.alert.error({ title: 'মিনিমাম ডিপোজিট পরিমাণ সঠিক হতে হবে' });
      return;
    }
    if (isNaN(max) || max <= min) {
      feedback?.alert.error({ title: 'ম্যাক্সিমাম পরিমাণ মিনিমামের চেয়ে বেশি হতে হবে' });
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'depositConfig'), {
        minAmount: min,
        maxAmount: max,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });
      setSaved({ minAmount: min, maxAmount: max });
      feedback?.alert.success({ title: '✅ ডিপোজিট সেটিংস সেভ করা হয়েছে' });
    } catch (error) {
      console.error('Failed to save deposit config:', error);
      feedback?.alert.error({ title: 'সেভ করতে ব্যর্থ হয়েছে' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <i className="fa-solid fa-arrow-down-short-wide" style={{ opacity: 0.7 }}></i>
        <span className={styles.label}>মিনিমাম ডিপোজিট (৳):</span>
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
        বর্তমান: মিনিমাম ৳{saved.minAmount} • ম্যাক্সিমাম ৳{saved.maxAmount}
        {!canEdit && ' (শুধু ফাইন্যান্স পারমিশনসহ অ্যাডমিন পরিবর্তন করতে পারবেন)'}
      </span>
    </div>
  );
};

export default DepositAmountSettings;
