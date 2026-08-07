import React from 'react';

export const InboxFilterTabs = ({ activeFilter, setActiveFilter }) => {
  const tabs = ['All Chats', 'Active Deals', 'Unread'];

  return (
    <div className="filter-tabs">
      {tabs.map((tab) => (
        <button 
          key={tab} 
          type="button"
          className={`tab-chip ${activeFilter === tab ? 'active' : ''}`} 
          onClick={() => setActiveFilter(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};