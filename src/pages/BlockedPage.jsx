// src/pages/BlockedPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import './VerifyPending.css';

const BlockedPage = () => {
  const navigate = useNavigate();
  const { logout, currentUser } = useAuth();
  const [timeRemaining, setTimeRemaining] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const fetchBlockInfo = async () => {
      if (!currentUser?.uid) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setBlockReason(data.banReason || 'অ্যাডমিন দ্বারা ব্লক করা হয়েছে');
          
          // ব্লক টাইম ক্যালকুলেট
          const bannedAt = data.bannedAt?.toDate?.() || new Date(data.bannedAt);
          const expiryTime = new Date(bannedAt.getTime() + 24 * 60 * 60 * 1000);
          const now = new Date();
          
          if (now > expiryTime) {
            setIsExpired(true);
            setTimeRemaining('⏰ সময় শেষ!');
          } else {
            // কাউন্টডাউন শুরু
            const updateTimer = () => {
              const now2 = new Date();
              const diff = expiryTime - now2;
              
              if (diff <= 0) {
                setIsExpired(true);
                setTimeRemaining('⏰ সময় শেষ!');
                return;
              }
              
              const hours = Math.floor(diff / (1000 * 60 * 60));
              const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              const seconds = Math.floor((diff % (1000 * 60)) / 1000);
              
              setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
            };
            
            updateTimer();
            const interval = setInterval(updateTimer, 1000);
            return () => clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('Error fetching block info:', error);
      }
    };
    
    fetchBlockInfo();
  }, [currentUser]);

  // ── ডিলিট হওয়ার পর ──
  if (isExpired) {
    return (
      <div className="verify-pending-container">
        <div className="verify-card">
          <div className="verify-icon error">🗑️</div>
          <h2>অ্যাকাউন্ট ডিলিট করা হয়েছে</h2>
          <p>
            ২৪ ঘণ্টার মধ্যে অ্যাডমিন আনব্লক না করায় 
            আপনার অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে ডিলিট করা হয়েছে।
          </p>
          <p className="verify-sub-text">
            নতুন অ্যাকাউন্ট তৈরি করতে নিচের বাটনে ক্লিক করুন।
          </p>
          
          <div className="verify-actions">
            <button className="btn-retry" onClick={() => navigate('/register')}>
              📝 নতুন অ্যাকাউন্ট তৈরি করুন
            </button>
          </div>
          
          <div className="verify-footer">
            <button className="btn-logout" onClick={logout}>🔓 লগ আউট করুন</button>
          </div>
        </div>
      </div>
    );
  }

  // ── ব্লক অবস্থায় ──
  return (
    <div className="verify-pending-container">
      <div className="verify-card">
        <div className="verify-icon error">🚫</div>
        <h2>অ্যাকাউন্ট ব্লক করা হয়েছে</h2>
        <p>{blockReason}</p>
        
        <div className="block-timer">
          <div className="timer-icon">⏰</div>
          <div className="timer-text">
            <span className="timer-label">আনব্লক হতে বাকি:</span>
            <span className="timer-value">{timeRemaining || 'গণনা করা হচ্ছে...'}</span>
          </div>
        </div>
         
        <div className="block-info">
          <p>
            <i className="fa-solid fa-info-circle"></i> 
            ২৪ ঘণ্টার মধ্যে অ্যাডমিন আনব্লক না করলে 
            আপনার অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে ডিলিট হয়ে যাবে।
          </p>
        </div>
        
        <div className="verify-actions">
          <button className="btn-support" onClick={() => window.location.href = 'mailto:support@worktrustbd.com'}>
            📧 সাপোর্টে ইমেইল করুন
          </button>
        </div>
        
        <div className="verify-footer">
          <button className="btn-logout" onClick={logout}>🔓 লগ আউট করুন</button>
        </div>
      </div>
    </div>
  );
};

export default BlockedPage;