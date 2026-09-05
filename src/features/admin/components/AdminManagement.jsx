// src/pages/Admin/components/AdminManagement.jsx
// New (#28-32 admin RBAC) — lets a MAIN admin create/edit/remove
// sub-admins with granular permissions. Only rendered for main
// admins (gated in AdminDashboard.jsx) — but per the requirements
// doc's explicit warning ("hiding buttons in React is NOT
// sufficient"), the real enforcement is the Firestore rule + the
// isMainAdminUser() checks inside every function this calls.

import React, { useState, useEffect, useCallback } from 'react';
import { auth } from '../../../shared/firebase/index';
import { isMainAdminUser, ADMIN_PERMISSIONS } from '../constants/admin';
import {
  getAllAdmins,
  findUserByEmail,
  createSubAdmin,
  updateSubAdminPermissions,
  removeSubAdmin,
  setSubAdminDisabled,
} from '../firebase/adminFunctions';
import styles from './AdminManagement.module.css';

const PERMISSION_LABELS = {
  users: 'ইউজার ম্যানেজমেন্ট (ব্লক/আনব্লক)',
  verification: 'ভেরিফিকেশন (আইডেন্টিটি/ফেস)',
  finance: 'ফাইন্যান্স (ডিপোজিট/উইথড্র)',
  deals: 'ডিল (ডিল ম্যানেজমেন্ট/ডিসপিউট)',
  support: 'সাপোর্ট (পোস্ট/রিপোর্ট/চ্যাট রিভিউ)',
  announcements: 'অ্যানাউন্সমেন্ট',
};

const AdminManagement = ({ feedback }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [newPermissions, setNewPermissions] = useState(
    Object.fromEntries(ADMIN_PERMISSIONS.map(p => [p, false]))
  );
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const currentUserIsMainAdmin = isMainAdminUser(auth.currentUser);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    const list = await getAllAdmins();
    setAdmins(list);
    setLoading(false);
  }, []);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  if (!currentUserIsMainAdmin) {
    return (
      <div className={styles.noAccessMessage}>
        শুধুমাত্র মেইন এডমিন এই সেকশন দেখতে পারবেন।
      </div>
    );
  }

  const handleCreateSubAdmin = async () => {
    if (!email.trim()) return;
    setSearching(true);
    try {
      const user = await findUserByEmail(email);
      if (!user) {
        feedback?.alert.error({ title: 'এই ইমেইলে কোনো রেজিস্টার্ড ইউজার পাওয়া যায়নি' });
        return;
      }
      if (user.role === 'admin') {
        feedback?.alert.warning({ title: 'এই ইউজার ইতিমধ্যে এডমিন' });
        return;
      }
      const result = await createSubAdmin(user.id, newPermissions);
      if (result.success) {
        feedback?.alert.success({ title: `✅ ${user.email} কে সাব-এডমিন করা হয়েছে` });
        setEmail('');
        setNewPermissions(Object.fromEntries(ADMIN_PERMISSIONS.map(p => [p, false])));
        loadAdmins();
      } else {
        feedback?.alert.error({ title: result.error || 'ব্যর্থ হয়েছে' });
      }
    } finally {
      setSearching(false);
    }
  };

  const handleTogglePermission = async (admin, permission) => {
    const updated = { ...(admin.adminPermissions || {}), [permission]: !admin.adminPermissions?.[permission] };
    const result = await updateSubAdminPermissions(admin.id, updated);
    if (result.success) {
      loadAdmins();
    } else {
      feedback?.alert.error({ title: result.error || 'ব্যর্থ হয়েছে' });
    }
  };

  const handleRemove = async (admin) => {
    const confirmed = await feedback?.confirm({
      title: 'নিশ্চিত করুন',
      message: `${admin.email} এর এডমিন অ্যাক্সেস বাতিল করতে চান?`,
      variant: 'error',
      confirmText: 'রিমুভ করুন',
      cancelText: 'বাতিল',
    });
    if (!confirmed) return;
    const result = await removeSubAdmin(admin.id);
    if (result.success) {
      feedback?.alert.success({ title: 'এডমিন অ্যাক্সেস বাতিল করা হয়েছে' });
      loadAdmins();
    } else {
      feedback?.alert.error({ title: result.error || 'ব্যর্থ হয়েছে' });
    }
  };

  const handleToggleDisabled = async (admin) => {
    const nextDisabled = !admin.adminDisabled;
    if (nextDisabled) {
      const confirmed = await feedback?.confirm({
        title: 'নিশ্চিত করুন',
        message: `${admin.email} কে সাময়িকভাবে নিষ্ক্রিয় করতে চান? তাদের পারমিশন অপরিবর্তিত থাকবে, পরে আবার সক্রিয় করা যাবে।`,
        variant: 'warning',
        confirmText: 'নিষ্ক্রিয় করুন',
        cancelText: 'বাতিল',
      });
      if (!confirmed) return;
    }
    const result = await setSubAdminDisabled(admin.id, nextDisabled);
    if (result.success) {
      feedback?.alert.success({
        title: nextDisabled ? '✅ এডমিন নিষ্ক্রিয় করা হয়েছে' : '✅ এডমিন আবার সক্রিয় করা হয়েছে',
      });
      loadAdmins();
    } else {
      feedback?.alert.error({ title: result.error || 'ব্যর্থ হয়েছে' });
    }
  };

  return (
    <div className={styles.adminManagement}>
      <div className={styles.createSection}>
        <h3>নতুন সাব-এডমিন যোগ করুন</h3>
        <p className={styles.createSubtitle}>
          ইউজার আগে থেকে রেজিস্টার করা থাকতে হবে — ইমেইল দিয়ে খুঁজে তাদের নির্দিষ্ট পারমিশন সহ সাব-এডমিন বানানো যাবে।
        </p>
        <input
          type="email"
          placeholder="ইউজারের ইমেইল"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={styles.emailInput}
        />
        <div className={styles.permissionsGrid}>
          {ADMIN_PERMISSIONS.map(p => (
            <label key={p} className={styles.permissionCheckbox}>
              <input
                type="checkbox"
                checked={newPermissions[p]}
                onChange={(e) => setNewPermissions(prev => ({ ...prev, [p]: e.target.checked }))}
              />
              {PERMISSION_LABELS[p]}
            </label>
          ))}
        </div>
        <button
          className={styles.createBtn}
          onClick={handleCreateSubAdmin}
          disabled={searching || !email.trim()}
        >
          {searching ? <i className="fa-solid fa-spinner fa-spin"></i> : 'সাব-এডমিন বানান'}
        </button>
      </div>

      <h3 className={styles.sectionTitle}>বর্তমান এডমিনরা</h3>
      {loading ? (
        <p className={styles.loadingText}>লোড হচ্ছে...</p>
      ) : (
        <div className={styles.adminsList}>
          {admins.map(admin => {
            const isMain = isMainAdminUser({ email: admin.email });
            return (
              <div key={admin.id} className={`${styles.adminCard} ${admin.adminDisabled ? styles.disabled : ''}`}>
                <div className={styles.adminHeader}>
                  <strong>{admin.email}</strong>
                  {isMain ? (
                    <span className={styles.mainBadge}>মেইন এডমিন</span>
                  ) : (
                    <div className={styles.adminActions}>
                      {admin.adminDisabled && (
                        <span className={styles.disabledBadge}>নিষ্ক্রিয়</span>
                      )}
                      <button
                        className={styles.toggleDisabledBtn}
                        onClick={() => handleToggleDisabled(admin)}
                      >
                        {admin.adminDisabled ? 'সক্রিয় করুন' : 'নিষ্ক্রিয় করুন'}
                      </button>
                      <button
                        className={styles.removeBtn}
                        onClick={() => handleRemove(admin)}
                      >
                        রিমুভ করুন
                      </button>
                    </div>
                  )}
                </div>
                {!isMain && (
                  <div className={styles.permissionsGrid}>
                    {ADMIN_PERMISSIONS.map(p => (
                      <label key={p} className={styles.permissionCheckbox}>
                        <input
                          type="checkbox"
                          checked={!!admin.adminPermissions?.[p]}
                          onChange={() => handleTogglePermission(admin, p)}
                        />
                        {PERMISSION_LABELS[p]}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminManagement;