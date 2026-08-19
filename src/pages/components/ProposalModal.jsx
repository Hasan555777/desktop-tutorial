// src/pages/components/ProposalModal.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import './ProposalModal.css';
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
  
  // ✅ সময়ের ইউনিট ট্র্যাক করার জন্য স্টেট
  const [deadlineUnit, setDeadlineUnit] = useState('minutes');

  if (!show) return null;

  // ============================================================
  // ✅ হ্যান্ডেল সেন্ড (ব্যালেন্স চেক + অটো-সেভ)
  // ============================================================
  const handleSend = async () => {
    // ১. ফর্ম ভ্যালিডেশন
    const budget = Number(proposalData.budget);
    let deadline = Number(proposalData.deadline);

    // ✅ ইউনিট অনুযায়ী সময় কনভার্ট করা
    if (deadlineUnit === 'days') {
      deadline = deadline * 24 * 60; // দিনকে মিনিটে কনভার্ট
    }

    // ✅ বাজেট ৫০ (ন্যূনতম)
    if (!budget || budget < 50) {
      feedback.alert.warning({ message: 'দয়া করে সঠিক বাজেট দিন (সর্বনিম্ন ৫০ বিডিটি)!' });
      return;
    }

    // ✅ সময় ১০ মিনিট (ন্যূনতম)
    if (!deadline || deadline < 10) {
      feedback.alert.warning({ message: 'দয়া করে সঠিক সময় দিন (সর্বনিম্ন ১০ মিনিট)!' });
      return;
    }

    if (!proposalData.details.trim()) {
      feedback.alert.warning({ message: 'দয়া করে কাজের বিবরণ লিখুন!' });
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
          title: '⚠️ ব্যালেন্স কম!',
          message: `💰 প্রয়োজন: ৳${budget}\n💳 উপলব্ধ: ৳${currentBalance}\n\nআপনি কি ওয়ালেটে টাকা যোগ করতে চান?`,
          confirmText: 'ওয়ালেটে যান',
          cancelText: 'বাদ দিন'
        });

        if (confirmed) {
          navigate('/wallet');
        }
        return;
      }

      // ৩. ব্যালেন্স যথেষ্ট হলে, সাবমিট করো
      // ✅ প্রপোজাল ডেটায় মিনিটে সময় পাঠানো হচ্ছে
      const finalProposalData = {
        ...proposalData,
        deadline: deadline // মিনিটে
      };
      
      await onSend(finalProposalData);
      onClose();

    } catch (error) {
      console.error('❌ Error checking balance:', error);
      feedback.alert.error({ message: 'ব্যালেন্স চেক করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।' });
    }
  };

  // ============================================================
  // ✅ রেন্ডার
  // ============================================================
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="proposal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><i className="fa-solid fa-file-signature"></i> প্রপোজাল পাঠান</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-groups">
            <label><i className="fa-solid fa-wallet"></i> বাজেট (বিডিটি)</label>
            <input 
              type="number" 
              value={proposalData.budget} 
              onChange={(e) => setProposalData({...proposalData, budget: e.target.value})} 
              placeholder="বাজেট লিখুন" 
              min="50"
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              ⚠️ সর্বনিম্ন বাজেট: ৫০ বিডিটি
            </small>
          </div>
          
          <div className="form-groups">
            <label><i className="fa-regular fa-calendar"></i> সময়সীমা</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="number" 
                value={proposalData.deadline} 
                onChange={(e) => setProposalData({...proposalData, deadline: e.target.value})} 
                placeholder="সময় লিখুন" 
                min="1"
                style={{ flex: 1 }}
              />
              <select 
                value={deadlineUnit} 
                onChange={(e) => setDeadlineUnit(e.target.value)}
                style={{
                  padding: '12px 16px',
                  background: 'var(--input-bg, #1a2030)',
                  border: '1px solid var(--border-color, rgba(67, 142, 130, 0.2))',
                  borderRadius: '8px',
                  color: 'var(--text-primary, #f8fafc)',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  minWidth: '100px'
                }}
              >
                <option value="minutes">মিনিট</option>
                <option value="days">দিন</option>
              </select>
            </div>
            <small style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              ⚠️ সর্বনিম্ন সময়: ১০ মিনিট 
            </small>
          </div>

          <div className="form-groups">
            <label><i className="fa-solid fa-file-lines"></i> কাজের বিবরণ</label>
            <textarea 
              rows="4" 
              value={proposalData.details} 
              onChange={(e) => setProposalData({...proposalData, details: e.target.value})} 
              placeholder="দয়া করে এখানে কাজের বিস্তারিত বর্ণনা লিখুন..."  
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel-modal" onClick={onClose}>বাদ দিন</button>
          <button className="btn-send-proposal" onClick={handleSend}>
            <i className="fa-solid fa-paper-plane"></i> প্রপোজাল পাঠান
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProposalModal;