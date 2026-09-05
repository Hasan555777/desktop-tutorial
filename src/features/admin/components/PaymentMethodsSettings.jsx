// src/pages/Admin/components/PaymentMethodsSettings.jsx
// New — lets an admin add/edit/enable/disable deposit & withdrawal
// payment methods (bKash, Nagad, Rocket, Bank) from the Admin
// Dashboard, backed by a single Firestore document:
// settings/paymentMethods
//
// 🔧 ADD (#4 admin should manage deposit/withdraw payment methods):
// Deposit.jsx used to hardcode every receiving number and the bank
// account details directly in the frontend source. This component
// makes that configuration live and admin-editable instead —
// Deposit.jsx and Withdraw.jsx both read this same document (via
// onSnapshot) so a change here takes effect immediately, and the
// numbers/bank details are never shipped in frontend source code.
//
// Permission: gated the same way as WithdrawalFeeSettings.jsx —
// `canEdit` is passed down from AdminDashboard.jsx's
// canAccessTab('finance'). A sub-admin without the 'finance'
// permission can see the current config but not change it. This is
// the client-side half only; the real boundary must be the
// Firestore rule on settings/{id} (write restricted to admin/
// finance roles, read open to authenticated users so the deposit/
// withdraw pages can show enabled methods).

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../shared/firebase/index';
import styles from './PaymentMethodsSettings.module.css';

const METHOD_META = {
  bKash: { icon: 'fa-brands fa-btc', color: '#E2136E', type: 'mobile' },
  Nagad: { icon: 'fa-solid fa-n', color: '#F58A1E', type: 'mobile' },
  Rocket: { icon: 'fa-solid fa-rocket', color: '#8B5CF6', type: 'mobile' },
  Bank: { icon: 'fa-solid fa-building-columns', color: '#438e82', type: 'bank' },
};

const DEFAULT_CONFIG = {
  bKash: { enabled: true, number: '', accountType: 'Personal' },
  Nagad: { enabled: true, number: '', accountType: 'Personal' },
  Rocket: { enabled: true, number: '', accountType: 'Personal' },
  Bank: { enabled: true, bankName: '', accountName: '', accountNumber: '', branch: '', routingNumber: '' },
};

const PaymentMethodsSettings = ({ feedback, canEdit = false }) => {
  const [config, setConfig] = useState(null); // live/committed doc
  const [draft, setDraft] = useState(null);    // local edits per method
  const [loading, setLoading] = useState(true);
  const [savingMethod, setSavingMethod] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'paymentMethods'));
        const data = snap.exists() ? { ...DEFAULT_CONFIG, ...snap.data() } : DEFAULT_CONFIG;
        if (!cancelled) {
          setConfig(data);
          setDraft(data);
        }
      } catch (error) {
        console.error('Failed to load payment methods config:', error);
        if (!cancelled) {
          setConfig(DEFAULT_CONFIG);
          setDraft(DEFAULT_CONFIG);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateField = (method, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [method]: { ...prev[method], [field]: value },
    }));
  };

  const isDirty = (method) => {
    if (!config || !draft) return false;
    return JSON.stringify(config[method]) !== JSON.stringify(draft[method]);
  };

  const saveMethod = async (method) => {
    if (!canEdit) {
      feedback?.alert.error({ title: 'এই অ্যাকশনের জন্য আপনার পারমিশন নেই।' });
      return;
    }

    const methodDraft = draft[method];

    // ── Basic validation before writing to Firestore ──
    if (METHOD_META[method].type === 'mobile') {
      const clean = (methodDraft.number || '').replace(/\D/g, '');
      if (methodDraft.enabled && clean.length !== 11) {
        feedback?.alert.error({ title: `${method}-এর জন্য সঠিক ১১-সংখ্যার নম্বর দিন` });
        return;
      }
    } else {
      if (methodDraft.enabled && (!methodDraft.bankName?.trim() || !methodDraft.accountNumber?.trim())) {
        feedback?.alert.error({ title: 'ব্যাংকের নাম ও অ্যাকাউন্ট নম্বর আবশ্যক' });
        return;
      }
    }

    setSavingMethod(method);
    try {
      await setDoc(
        doc(db, 'settings', 'paymentMethods'),
        {
          [method]: methodDraft,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || null,
        },
        { merge: true }
      );
      setConfig((prev) => ({ ...prev, [method]: methodDraft }));
      feedback?.alert.success({ title: `✅ ${method} সেভ করা হয়েছে` });
    } catch (error) {
      console.error(`Failed to save ${method} config:`, error);
      feedback?.alert.error({ title: `${method} সেভ করতে ব্যর্থ হয়েছে` });
    } finally {
      setSavingMethod(null);
    }
  };

  const toggleEnabled = (method) => {
    if (!canEdit) {
      feedback?.alert.error({ title: 'এই অ্যাকশনের জন্য আপনার পারমিশন নেই।' });
      return;
    }
    const next = { ...draft[method], enabled: !draft[method].enabled };
    setDraft((prev) => ({ ...prev, [method]: next }));
    // Enable/disable is a one-click action — persist immediately
    // instead of waiting for a separate save click.
    (async () => {
      setSavingMethod(method);
      try {
        await setDoc(
          doc(db, 'settings', 'paymentMethods'),
          { [method]: next, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null },
          { merge: true }
        );
        setConfig((prev) => ({ ...prev, [method]: next }));
      } catch (error) {
        console.error(`Failed to toggle ${method}:`, error);
        feedback?.alert.error({ title: `${method} আপডেট করতে ব্যর্থ হয়েছে` });
        // revert local draft on failure
        setDraft((prev) => ({ ...prev, [method]: config[method] }));
      } finally {
        setSavingMethod(null);
      }
    })();
  };

  if (loading || !draft) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h3>
          <i className="fa-solid fa-credit-card"></i> পেমেন্ট মেথড কনফিগারেশন
        </h3>
        <span className={styles.hint}>
          {canEdit ? 'ডিপোজিট ও উইথড্র পেজে যেসব মেথড দেখাবে, তা এখান থেকে নিয়ন্ত্রণ করুন' : 'শুধু ফাইন্যান্স পারমিশনসহ অ্যাডমিন পরিবর্তন করতে পারবেন'}
        </span>
      </div>

      <div className={styles.methodsGrid}>
        {Object.keys(METHOD_META).map((method) => {
          const meta = METHOD_META[method];
          const m = draft[method] || DEFAULT_CONFIG[method];
          const dirty = isDirty(method);
          const saving = savingMethod === method;

          return (
            <div key={method} className={`${styles.methodCard} ${!m.enabled ? styles.disabled : ''}`}>
              <div className={styles.methodCardHeader}>
                <span className={styles.methodName} style={{ color: meta.color }}>
                  <i className={meta.icon}></i> {method}
                </span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={!!m.enabled}
                    onChange={() => toggleEnabled(method)}
                    disabled={!canEdit || saving}
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>

              {meta.type === 'mobile' ? (
                <>
                  <div className={styles.fieldRow}>
                    <label>নম্বর</label>
                    <input
                      type="text"
                      value={m.number || ''}
                      onChange={(e) => updateField(method, 'number', e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="01XXXXXXXXX"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className={styles.fieldRow}>
                    <label>অ্যাকাউন্ট টাইপ</label>
                    <select
                      value={m.accountType || 'Personal'}
                      onChange={(e) => updateField(method, 'accountType', e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="Personal">Personal</option>
                      <option value="Agent">Agent</option>
                      <option value="Merchant">Merchant</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.fieldRow}>
                    <label>Bank Name</label>
                    <input type="text" value={m.bankName || ''} onChange={(e) => updateField(method, 'bankName', e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className={styles.fieldRow}>
                    <label>Account Name</label>
                    <input type="text" value={m.accountName || ''} onChange={(e) => updateField(method, 'accountName', e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className={styles.fieldRow}>
                    <label>Account Number</label>
                    <input type="text" value={m.accountNumber || ''} onChange={(e) => updateField(method, 'accountNumber', e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className={styles.fieldRow}>
                    <label>Branch</label>
                    <input type="text" value={m.branch || ''} onChange={(e) => updateField(method, 'branch', e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className={styles.fieldRow}>
                    <label>Routing No.</label>
                    <input type="text" value={m.routingNumber || ''} onChange={(e) => updateField(method, 'routingNumber', e.target.value)} disabled={!canEdit} />
                  </div>
                </>
              )}

              <button
                className={styles.saveBtn}
                onClick={() => saveMethod(method)}
                disabled={!canEdit || !dirty || saving}
              >
                {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-floppy-disk"></i> সেভ করুন</>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PaymentMethodsSettings;
