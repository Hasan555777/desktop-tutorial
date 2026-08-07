import React from 'react';

function VerificationCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon verification"><i className="fas fa-shield-alt"></i></div>
      <div className="content">
        <div className="title">Verification</div>
        <div className="sub">
          <i className="fas fa-id-badge"></i> NID · Birth cert · Face
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default VerificationCard;