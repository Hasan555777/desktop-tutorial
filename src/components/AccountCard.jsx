import React from 'react';

function AccountCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon"><i className="fas fa-user-circle"></i></div>
      <div className="content">
        <div className="title">Account</div>
        <div className="sub">
          <i className="fas fa-id-card"></i> Edit profile · Personal · Password
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default AccountCard;