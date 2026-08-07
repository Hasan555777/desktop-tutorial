import React from 'react';

function NotificationCard({ onClick }) {
  return (
    <div className="category-item" onClick={onClick}>
      <div className="icon"><i className="fas fa-bell"></i></div>
      <div className="content">
        <div className="title">Notifications</div>
        <div className="sub">
          <i className="fas fa-envelope"></i> Push · Email · SMS
        </div>
      </div>
      <div className="arrow"><i className="fas fa-chevron-right"></i></div>
    </div>
  );
}

export default NotificationCard;