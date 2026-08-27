import React from 'react';

function TrustCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon"><i className="fas fa-star"></i></div>
      <div className="content">
        <div className="title">Trust & Reputation</div>
        <div className="sub">
          <i className="fas fa-star-half-alt"></i> Reviews · Ratings · Jobs
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default TrustCard;