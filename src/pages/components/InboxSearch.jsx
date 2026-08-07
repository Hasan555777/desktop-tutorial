import React from 'react';

export const InboxSearch = ({ searchQuery, setSearchQuery }) => {
  return (
    <div className="search-box">
      <i className="fa-solid fa-magnifying-glass"></i>
      <input 
        type="text" 
        placeholder="Search conversations..." 
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>
  );
};