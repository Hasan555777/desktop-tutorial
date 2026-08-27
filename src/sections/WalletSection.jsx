import React, { useState } from 'react';
import toast from 'react-hot-toast';
import '../styles/profile.css';

function WalletSection({ userData, onBack }) {
  const [balance, setBalance] = useState(userData?.walletBalance || 1245.00);
  const [amount, setAmount] = useState('');

  const handleDeposit = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setBalance(prev => prev + val);
    toast.success(`💰 Deposited $${val}`);
    setAmount('');
  };

  const handleWithdraw = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (val > balance) {
      toast.error('Insufficient balance!');
      return;
    }
    setBalance(prev => prev - val);
    toast.success(`💸 Withdrew $${val}`);
    setAmount('');
  };

  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-wallet" style={{ marginRight: '10px', color: '#0369a1' }}></i>
          Wallet
        </div>
      </div>

      <div className="section-content">
        <div className="detail-item" style={{ background: '#e0f2fe', borderColor: '#bae6fd' }}>
          <i className="fas fa-coins" style={{ color: '#0369a1' }}></i>
          <span className="detail-label" style={{ fontWeight: 'bold' }}>Balance</span>
          <span className="detail-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#0369a1' }}>
            ${balance.toFixed(2)}
          </span>
        </div>

        <div className="detail-item">
          <i className="fas fa-id-card"></i>
          <span className="detail-label">Wallet ID</span>
          <span className="detail-value">{userData?.walletId || '#W-8792'}</span>
        </div>

        <div className="detail-item">
          <i className="fas fa-hand-holding-usd"></i>
          <span className="detail-label">Amount</span>
          <input 
            type="number" 
            value={amount} 
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            className="edit-input"
            style={{ width: '120px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button className="save-btn" onClick={handleDeposit} style={{ flex: 1, background: '#16a34a' }}>
            <i className="fas fa-arrow-down"></i> Deposit
          </button>
          <button className="save-btn" onClick={handleWithdraw} style={{ flex: 1, background: '#dc2626' }}>
            <i className="fas fa-arrow-up"></i> Withdraw
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalletSection;