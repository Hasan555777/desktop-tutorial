import React from 'react';

function PortfolioCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon portfolio"><i className="fas fa-folder-open"></i></div>
      <div className="content">
        <div className="title">Portfolio</div>
        <div className="sub">
          <i className="fas fa-graduation-cap"></i> Experience · Skills · Edu
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default PortfolioCard;