// src/pages/components/ProposalModal.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../shared/firebase/index';
import { useFeedback } from '../../../shared/ui/Feedback/FeedbackProvider';
import { logger } from '../../../shared/utils/logger';
import styles from './ProposalModal.module.css';

export const ProposalModal = ({
  show,
  onClose,
  proposalData,
  setProposalData,
  onSend,
  safeChatId,
  currentUser,
  postType,
  userRole
}) => {
  const navigate = useNavigate();
  const feedback = useFeedback();

  // সময়ের ইউনিট ট্র্যাক করার জন্য স্টেট
  const [deadlineUnit, setDeadlineUnit] = useState('minutes');

  if (!show) return null;

  // ============================================================
  // ✅ হ্যান্ডেল সেন্ড (ব্যালেন্স চেক + অটো-সেভ)
  // ============================================================
  const handleSend = async () => {
    const budget = Number(proposalData.budget);
    let deadline = Number(proposalData.deadline);

    // ইউনিট অনুযায়ী সময় কনভার্ট — সবসময় মিনিটে
    if (deadlineUnit === 'days') {
      deadline = deadline * 24 * 60;
    }

    if (!budget || budget < 50) {
      feedback.alert.warning({ message: 'দয়া করে সঠিক বাজেট দিন (সর্বনিম্ন ৫০ বিডিটি)!' });
      return;
    }
    if (!deadline || deadline < 10) {
      feedback.alert.warning({ message: 'দয়া করে সঠিক সময় দিন (সর্বনিম্ন ১০ মিনিট)!' });
      return;
    }
    if (!proposalData.details.trim()) {
      feedback.alert.warning({ message: 'দয়া করে কাজের বিবরণ লিখুন!' });
      return;
    }

    const finalProposalData = {
      ...proposalData,
      deadline // মিনিটে, ইউনিট নির্বিশেষে
    };

    try {
      const walletRef = doc(db, 'wallets', currentUser.uid);
      const walletSnap = await getDoc(walletRef);
      const currentBalance = walletSnap.exists() ? walletSnap.data().balance : 0;

      if (currentBalance < budget) {
        sessionStorage.setItem('pendingProposal', JSON.stringify({
          data: finalProposalData,
          chatId: safeChatId,
          postType,
          userRole,
          timestamp: Date.now()
        }));

        const confirmed = await feedback.confirm({
          title: '⚠️ ব্যালেন্স কম!',
          message: `💰 প্রয়োজন: ৳${budget}\n💳 উপলব্ধ: ৳${currentBalance}\n\nআপনি কি ওয়ালেটে টাকা যোগ করতে চান?`,
          confirmText: 'ওয়ালেটে যান',
          cancelText: 'বাদ দিন'
        });

        if (confirmed) navigate('/wallet');
        return;
      }

      await onSend(finalProposalData);
      onClose();

    } catch (error) {
      logger.error('Error checking balance:', error);
      feedback.alert.error({ message: 'ব্যালেন্স চেক করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.proposalModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3><i className="fa-solid fa-file-signature"></i> প্রপোজাল পাঠান</h3>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroups}>
            <label><i className="fa-solid fa-wallet"></i> বাজেট (বিডিটি)</label>
            <input
              type="number"
              value={proposalData.budget}
              onChange={(e) => setProposalData({ ...proposalData, budget: e.target.value })}
              placeholder="বাজেট লিখুন"
              min="50"
            />
            <small className={styles.fieldHint}>
              ⚠️ সর্বনিম্ন বাজেট: ৫০ বিডিটি
            </small>
          </div>

          <div className={styles.formGroups}>
            <label><i className="fa-regular fa-calendar"></i> সময়সীমা</label>
            <div className={styles.deadlineInputGroup}>
              <input
                type="number"
                value={proposalData.deadline}
                onChange={(e) => setProposalData({ ...proposalData, deadline: e.target.value })}
                placeholder="সময় লিখুন"
                min="1"
                className={styles.deadlineInput}
              />
              <select
                value={deadlineUnit}
                onChange={(e) => setDeadlineUnit(e.target.value)}
                className={styles.deadlineUnitSelect}
              >
                <option value="minutes">মিনিট</option>
                <option value="days">দিন</option>
              </select>
            </div>
            <small className={styles.fieldHint}>
              ⚠️ সর্বনিম্ন সময়: ১০ মিনিট
            </small>
          </div>

          <div className={styles.formGroups}>
            <label><i className="fa-solid fa-file-lines"></i> কাজের বিবরণ</label>
            <textarea
              rows="4"
              value={proposalData.details}
              onChange={(e) => setProposalData({ ...proposalData, details: e.target.value })}
              placeholder="দয়া করে এখানে কাজের বিস্তারিত বর্ণনা লিখুন..."
              className={styles.detailsTextarea}
            />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnCancelModal} onClick={onClose}>বাদ দিন</button>
          <button className={styles.btnSendProposal} onClick={handleSend}>
            <i className="fa-solid fa-paper-plane"></i> প্রপোজাল পাঠান
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProposalModal;