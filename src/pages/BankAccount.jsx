// src/pages/BankAccount.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
import { 
  doc, getDoc, updateDoc
} from 'firebase/firestore';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import { sendWalletBalanceNotification } from './notificationHelper';
import useHideBottomNav from "@/hooks/useHideBottomNav";
import './BankAccount.css';

const BankAccount = () => {
  useHideBottomNav();
  const navigate = useNavigate();
  const user = auth.currentUser;
  const feedback = useFeedback();
  const { playEvent } = useSound();
  
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ============================================================
  // ✅ Back Handler - with Sound
  // ============================================================
  const handleBack = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    navigate(-1);
  };

  // ============================================================
  // ✅ Load Bank Accounts
  // ============================================================
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const loadAccounts = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const data = userSnap.data();
          setAccounts(data.bankAccounts || []);
        }
      } catch (error) {
        console.error("Error loading bank accounts:", error);
        feedback.alert.error({ message: 'Failed to load bank accounts.' });
      } finally {
        setLoading(false);
      }
    };

    loadAccounts();
  }, [user, navigate, feedback]);

  // ============================================================
  // ✅ Add Account - with Sound
  // ============================================================
  const addAccount = async () => {
    // Validation
    if (!bankName.trim()) {
      playEvent?.(SOUND_EVENTS.ERROR);
      feedback.alert.warning({ message: 'দয়া করে ব্যাংকের নাম দিন!' });
      return;
    }

    if (!accountNumber.trim()) {
      playEvent?.(SOUND_EVENTS.ERROR);
      feedback.alert.warning({ message: 'দয়া করে অ্যাকাউন্ট নম্বর দিন!' });
      return;
    }

    if (!accountHolder.trim()) {
      playEvent?.(SOUND_EVENTS.ERROR);
      feedback.alert.warning({ message: 'দয়া করে অ্যাকাউন্ট হোল্ডারের নাম দিন!' });
      return;
    }

    // Duplicate check
    const existing = accounts.find(acc => acc.accountNumber === accountNumber.trim());
    if (existing) {
      playEvent?.(SOUND_EVENTS.WARNING);
      feedback.alert.warning({ message: 'এই অ্যাকাউন্ট নম্বরটি ইতিমধ্যে বিদ্যমান!' });
      return;
    }

    setIsSubmitting(true);

    try {
      const userRef = doc(db, 'users', user.uid);
      
      const newAccount = {
        id: Date.now().toString(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountHolder: accountHolder.trim(),
        isDefault: isDefault,
        createdAt: new Date().toISOString()
      };

      let updatedAccounts = [...accounts, newAccount];
      if (isDefault) {
        updatedAccounts = updatedAccounts.map(acc => ({
          ...acc,
          isDefault: false
        }));
        updatedAccounts[updatedAccounts.length - 1].isDefault = true;
      }

      await updateDoc(userRef, {
        bankAccounts: updatedAccounts,
        updatedAt: new Date().toISOString()
      });

      setAccounts(updatedAccounts);
      resetForm();
      
      // ✅ Sound & Feedback
      playEvent?.(SOUND_EVENTS.SUCCESS);
      feedback.alert.success({ 
        message: `✅ ${bankName} অ্যাকাউন্ট সফলভাবে যোগ করা হয়েছে!` 
      });
      
      // ✅ Notification
      await sendWalletBalanceNotification(
        user.uid,
        0,
        'info',
        `Bank Account Added: ${bankName}`
      );
      
    } catch (error) {
      console.error("Error adding account:", error);
      playEvent?.(SOUND_EVENTS.ERROR);
      feedback.alert.error({ message: 'ব্যাংক অ্যাকাউন্ট যোগ করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================
  // ✅ Delete Account - with Sound
  // ============================================================
  const deleteAccount = async (id) => {
    const accountToDelete = accounts.find(acc => acc.id === id);
    
    const confirmed = await feedback.confirm({
      title: 'ব্যাংক অ্যাকাউন্ট ডিলিট করুন',
      message: `আপনি কি "${accountToDelete?.bankName}" অ্যাকাউন্টটি ডিলিট করতে চান?`,
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      cancelText: 'না'
    });

    if (!confirmed) return;

    playEvent?.(SOUND_EVENTS.CLICK);

    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedAccounts = accounts.filter(acc => acc.id !== id);
      
      await updateDoc(userRef, {
        bankAccounts: updatedAccounts,
        updatedAt: new Date().toISOString()
      });

      setAccounts(updatedAccounts);
      
      playEvent?.(SOUND_EVENTS.SUCCESS);
      feedback.alert.success({ 
        message: `✅ ${accountToDelete?.bankName} অ্যাকাউন্ট ডিলিট করা হয়েছে।` 
      });
      
    } catch (error) {
      console.error("Error deleting account:", error);
      playEvent?.(SOUND_EVENTS.ERROR);
      feedback.alert.error({ message: 'ব্যাংক অ্যাকাউন্ট ডিলিট করতে ব্যর্থ হয়েছে।' });
    }
  };

  // ============================================================
  // ✅ Set Default Account - with Sound
  // ============================================================
  const setDefaultAccount = async (id) => {
    const accountToSet = accounts.find(acc => acc.id === id);
    
    playEvent?.(SOUND_EVENTS.CLICK);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedAccounts = accounts.map(acc => ({
        ...acc,
        isDefault: acc.id === id
      }));

      await updateDoc(userRef, {
        bankAccounts: updatedAccounts,
        updatedAt: new Date().toISOString()
      });

      setAccounts(updatedAccounts);
      
      playEvent?.(SOUND_EVENTS.SUCCESS);
      feedback.alert.success({ 
        message: `✅ ${accountToSet?.bankName} ডিফল্ট অ্যাকাউন্ট হিসেবে সেট করা হয়েছে।` 
      });
      
    } catch (error) {
      console.error("Error setting default:", error);
      playEvent?.(SOUND_EVENTS.ERROR);
      feedback.alert.error({ message: 'ডিফল্ট অ্যাকাউন্ট সেট করতে ব্যর্থ হয়েছে।' });
    }
  };

  // ============================================================
  // ✅ Reset Form - with Sound
  // ============================================================
  const resetForm = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setBankName('');
    setAccountNumber('');
    setAccountHolder('');
    setIsDefault(false);
    setShowForm(false);
    setEditingId(null);
  };

  // ============================================================
  // ✅ Show Add Form - with Sound
  // ============================================================
  const showAddForm = () => {
    playEvent?.(SOUND_EVENTS.CLICK);
    setShowForm(true);
  };

  // ============================================================
  // ✅ Mask Account Number
  // ============================================================
  const maskAccountNumber = (number) => {
    if (number.length <= 4) return number;
    const visible = number.slice(-4);
    const masked = '*'.repeat(number.length - 4);
    return masked + visible;
  };

  // ============================================================
  // ✅ Loading State
  // ============================================================
if (loading) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--bg-primary, #090d16)',
      color: 'var(--accent-primary, #14b8a6)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{
          fontSize: '48px',
          color: 'var(--accent-primary, #14b8a6)',
          marginBottom: '16px',
          display: 'block'
        }} />
        <h2>Loading Accounts...</h2>
        <p style={{ color: 'var(--text-muted, #64748b)', marginTop: '8px' }}>
          <i className="fa-solid fa-spinner fa-spin"></i> Preparing your bank accounts...
        </p>
      </div>
    </div>
  );
}

  // ============================================================
  // ✅ Render
  // ============================================================
  return (
    <div className="bankaccount-container">
      <div className="bankaccount-card">
        
        {/* ✅ Back Button */}
        <button className="back-btn-simple" onClick={handleBack}>
          <i className="fa-solid fa-arrow-left"></i> Back
        </button>

        {/* Header */}
        <div className="bankaccount-header">
          <h2>
            <i className="fa-solid fa-building-columns"></i> Bank Accounts
          </h2>
          {!showForm && (
            <button className="add-btn" onClick={showAddForm}>
              <i className="fa-solid fa-plus"></i> Add Account
            </button>
          )}
        </div>

        {/* Account List */}
        {accounts.length === 0 && !showForm ? (
          <div className="no-account">
            <i className="fa-solid fa-credit-card"></i>
            <h3>No Bank Accounts</h3>
            <p>Add your bank account to receive payments</p>
            <button className="add-account-btn" onClick={showAddForm}>
              <i className="fa-solid fa-plus-circle"></i> Add Bank Account
            </button>
          </div>
        ) : (
          <div className="accounts-list">
            {accounts.map((acc) => (
              <div key={acc.id} className={`account-item ${acc.isDefault ? 'default' : ''}`}>
                <div className="account-icon">
                  <i className="fa-solid fa-building-columns"></i>
                  {acc.isDefault && <span className="default-badge">Default</span>}
                </div>
                <div className="account-details">
                  <h4>{acc.bankName}</h4>
                  <p className="account-number">{maskAccountNumber(acc.accountNumber)}</p>
                  <p className="account-holder">{acc.accountHolder}</p>
                  <p className="account-added">
                    <i className="fa-regular fa-calendar"></i> 
                    Added {new Date(acc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="account-actions">
                  {!acc.isDefault && (
                    <button 
                      className="set-default-btn"
                      onClick={() => setDefaultAccount(acc.id)}
                      title="Set as default"
                    >
                      <i className="fa-regular fa-star"></i>
                    </button>
                  )}
                  <button 
                    className="delete-btn"
                    onClick={() => deleteAccount(acc.id)}
                    title="Remove account"
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Form */}
        {showForm && (
          <div className="add-account-form">
            <div className="form-header">
              <h3>
                <i className="fa-solid fa-plus-circle"></i> 
                {editingId ? 'Edit Account' : 'Add New Account'}
              </h3>
              <button className="close-form-btn" onClick={resetForm}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="form-group">
              <label>Bank Name</label>
              <input 
                type="text" 
                placeholder="e.g., Dutch-Bangla Bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Account Number</label>
              <input 
                type="text" 
                placeholder="Enter account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\s/g, ''))}
              />
            </div>

            <div className="form-group">
              <label>Account Holder Name</label>
              <input 
                type="text" 
                placeholder="Full name as per bank account"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
              />
            </div>

            <div className="form-group checkbox">
              <label className="checkbox-label">
                <input 
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>Set as default account</span>
              </label>
            </div>

            <div className="form-actions">
              <button className="cancel-btn" onClick={resetForm}>
                Cancel
              </button>
              <button 
                className="save-btn" 
                onClick={addAccount}
                disabled={isSubmitting}
              >
{isSubmitting ? (
  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <i className="fa-solid fa-spinner fa-spin" style={{
      color: 'var(--accent-primary, #14b8a6)'
    }}></i>
    Saving...
  </span>
) : (
  <>
    <i className="fa-solid fa-check"></i> Save Account
  </>
)}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bankaccount-footer">
          <p>
            <i className="fa-solid fa-shield-check"></i> 
            Your bank account information is encrypted and secure
          </p>
        </div>

      </div>
    </div>
  );
};

export default BankAccount;