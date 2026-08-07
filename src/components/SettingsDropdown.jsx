// src/components/SettingsDropdown.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SettingsDropdown.css';

const SettingsDropdown = ({ 
  userData, 
  isAdmin, 
  isDark, 
  toggleTheme, 
  onLogout, 
  setActiveTab, 
  onItemClick  // ✅ ড্রপডাউন বন্ধ করার জন্য
}) => {
  const navigate = useNavigate();

  // ✅ সব জায়গায় onItemClick কল করা হয়েছে
  const handleNavigate = (path, tab) => {
    if (setActiveTab) setActiveTab(tab);
    if (onItemClick) onItemClick(); // ✅ ড্রপডাউন বন্ধ
    navigate(path);
  };

  const handleWalletNavigate = () => {
    if (onItemClick) onItemClick(); // ✅ ড্রপডাউন বন্ধ
    navigate('/wallet');
  };

  const handleSettingsNavigate = () => {
    if (onItemClick) onItemClick(); // ✅ ড্রপডাউন বন্ধ
    navigate('/settings');
  };

  const handleThemeToggle = () => {
    if (onItemClick) onItemClick(); // ✅ ড্রপডাউন বন্ধ
    if (toggleTheme) toggleTheme();
  };

  const handleLogoutClick = (e) => {
    e.preventDefault();
    if (onItemClick) onItemClick(); // ✅ ড্রপডাউন বন্ধ
    if (onLogout) onLogout();
    navigate('/login');
  };

  return (
    <div className="settings-dropdown-grid">
      {/* ১. প্রোফাইল */}
      <div className="drop-grid-item" onClick={() => handleNavigate('/profile', 'profile')}>
        <div className="grid-icon"><i className="fa-solid fa-circle-user"></i></div>
        <span className="grid-label">Profile</span>
      </div>

      {/* ২. সেভড জবস */}
      <div className="drop-grid-item" onClick={() => handleNavigate('/saved-jobs', 'saved-jobs')}>
        <div className="grid-icon"><i className="fa-solid fa-bookmark"></i></div>
        <span className="grid-label">Saved Jobs</span>
      </div>

      {/* ৩. ওয়ালেট */}
      <div className="drop-grid-item wallet-highlight" onClick={handleWalletNavigate}>
        <div className="grid-icon"><i className="fa-solid fa-wallet"></i></div>
        <span className="grid-label">Wallet</span>
        <span className="badge-usdt">৳ {userData?.walletBalance?.toLocaleString() || 0}</span>
      </div>

      {/* ৪. অ্যাডমিন (শুধু অ্যাডমিন হলে) */}
      {isAdmin && (
        <div className="drop-grid-item" onClick={() => handleNavigate('/admin', 'admin')}>
          <div className="grid-icon"><i className="fa-solid fa-shield-halved"></i></div>
          <span className="grid-label">Admin</span>
        </div>
      )}

      {/* ৫. সেটিংস */}
      <div className="drop-grid-item" onClick={handleSettingsNavigate}>
        <div className="grid-icon"><i className="fa-solid fa-sliders"></i></div>
        <span className="grid-label">Settings</span>
      </div>

      {/* ৬. থিম টগল */}
      <div className="drop-grid-item" onClick={handleThemeToggle}>
        <div className="grid-icon"><i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`}></i></div>
        <span className="grid-label">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
      </div>

      {/* ৭. লগআউট */}
      <div className="drop-grid-item logout-action" onClick={handleLogoutClick}>
        <div className="grid-icon"><i className="fa-solid fa-power-off"></i></div>
        <span className="grid-label">Log Out</span>
      </div>
    </div>
  );
};

export default SettingsDropdown;