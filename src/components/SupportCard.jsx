import React from 'react';

function SupportCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon support"><i className="fas fa-life-ring"></i></div>
      <div className="content">
        <div className="title">Support</div>
        <div className="sub">
          <i className="fas fa-headset"></i> Help · Contact · FAQ
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default SupportCard;