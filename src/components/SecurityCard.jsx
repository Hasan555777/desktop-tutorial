import React from 'react';

function SecurityCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon security"><i className="fas fa-lock"></i></div>
      <div className="content">
        <div className="title">Security</div>
        <div className="sub">
          <i className="fas fa-mobile-alt"></i> 2FA · Devices · Privacy
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default SecurityCard;