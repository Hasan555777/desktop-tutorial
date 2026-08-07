import React from 'react';

function LegalCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon legal"><i className="fas fa-balance-scale"></i></div>
      <div className="content">
        <div className="title">Legal</div>
        <div className="sub">
          <i className="fas fa-file-alt"></i> About · Terms · Privacy
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default LegalCard;