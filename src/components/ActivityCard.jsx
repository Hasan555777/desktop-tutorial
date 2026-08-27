import React from 'react';

function ActivityCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon"><i className="fas fa-briefcase"></i></div>
      <div className="content">
        <div className="title">Activity</div>
        <div className="sub">
          <i className="fas fa-tasks"></i> My Jobs · Services · Saved
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default ActivityCard;