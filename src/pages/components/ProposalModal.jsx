// src/pages/components/ProposalModal.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';

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

  if (!show) return null;

  // ============================================================
  // ✅ হ্যান্ডেল সেন্ড (ব্যালেন্স চেক + অটো-সেভ)
  // ============================================================
  const handleSend = async () => {
    // ১. ফর্ম ভ্যালিডেশন
    const budget = Number(proposalData.budget);
    const deadline = Number(proposalData.deadline);

    if (!budget || budget < 100) {
      feedback.alert.warning({ message: 'Please enter a valid budget (minimum 100 BDT)!' });
      return;
    }
    if (!deadline || deadline < 1) {
      feedback.alert.warning({ message: 'Please enter a valid deadline (minimum 1 day)!' });
      return;
    }
    if (!proposalData.details.trim()) {
      feedback.alert.warning({ message: 'Please describe your work details!' });
      return;
    }

    // ২. ব্যালেন্স চেক
    try {
      const walletRef = doc(db, 'wallets', currentUser.uid);
      const walletSnap = await getDoc(walletRef);
      const currentBalance = walletSnap.exists() ? walletSnap.data().balance : 0;

      if (currentBalance < budget) {
        // 🔥 পেন্ডিং অফার সেভ করা (অটো-রিট্রাই এর জন্য)
        sessionStorage.setItem('pendingProposal', JSON.stringify({
          data: proposalData,
          chatId: safeChatId,
          postType,
          userRole,
          timestamp: Date.now()
        }));

        const confirmed = await feedback.confirm({
          title: '⚠️ Insufficient Balance!',
          message: `💰 Required: ৳${budget}\n💳 Available: ৳${currentBalance}\n\nWould you like to add funds to your wallet?`,
          okText: 'Go to Wallet',
          cancelText: 'Cancel'
        });

        if (confirmed) {
          navigate('/wallet');
        }
        return;
      }

      // ৩. ব্যালেন্স যথেষ্ট হলে, সাবমিট করো
      await onSend();
      onClose();

    } catch (error) {
      console.error('❌ Error checking balance:', error);
      feedback.alert.error({ message: 'Failed to check balance. Please try again.' });
    }
  };

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="proposal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><i className="fa-solid fa-file-signature"></i> Send Proposal</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label><i className="fa-solid fa-wallet"></i> Budget (BDT)</label>
            <input 
              type="number" 
              value={proposalData.budget} 
              onChange={(e) => setProposalData({...proposalData, budget: e.target.value})} 
              placeholder="Enter budget" 
            />
          </div>
          <div className="form-group">
            <label><i className="fa-regular fa-calendar"></i> Deadline (Days)</label>
            <input 
              type="number" 
              value={proposalData.deadline} 
              onChange={(e) => setProposalData({...proposalData, deadline: e.target.value})} 
              placeholder="Enter deadline" 
            />
          </div>
          <div className="form-group">
            <label><i className="fa-solid fa-file-lines"></i> Work Details</label>
            <textarea 
              rows="4" 
              value={proposalData.details} 
              onChange={(e) => setProposalData({...proposalData, details: e.target.value})} 
              placeholder="Describe your work..." 
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel-modal" onClick={onClose}>Cancel</button>
          <button className="btn-send-proposal" onClick={handleSend}>Send Proposal</button>
        </div>
      </div>
    </div>
  );
};

export default ProposalModal;