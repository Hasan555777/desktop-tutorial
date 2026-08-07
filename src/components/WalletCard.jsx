import React from 'react';

function WalletCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon wallet"><i className="fas fa-wallet"></i></div>
      <div className="content">
        <div className="title">Wallet</div>
        <div className="sub">
          <i className="fas fa-coins"></i> Balance · Deposit · History
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default WalletCard;