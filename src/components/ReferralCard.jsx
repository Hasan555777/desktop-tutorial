import React from 'react';

function ReferralCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon referral"><i className="fas fa-gift"></i></div>
      <div className="content">
        <div className="title">Invite & Referral</div>
        <div className="sub">
          <i className="fas fa-user-plus"></i> Code · Invite · Rewards
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default ReferralCard;