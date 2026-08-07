// src/pages/Navbar.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import PostJobBox from './PostJobBox';
import PostServiceBox from './PostServiceBox';
import './Navbar.css';
import FloatingFeedbackButton from '@components/FloatingFeedbackButton/FloatingFeedbackButton';
import SettingsDropdown from '@components/SettingsDropdown';
import { useLayout } from "@/context/LayoutContext";

const Navbar = ({ 
  children, 
  currentMode = 'seller', // ✅ ডিফল্ট 'seller'
  setCurrentMode, 
  onLogout, 
  activeTab, 
  setActiveTab, 
  onSilentPost, 
  currentUser, 
  totalUnread,
  totalDeals,
  unreadNotifications = 0,
  onSearch,
  searchQuery: propSearchQuery,
  searchResults: propSearchResults,
}) => {

  const { hideBottomNav } = useLayout();
  
  if (process.env.NODE_ENV === 'development') {
    // console.log("Navbar:", hideBottomNav);
  }

  const navigate = useNavigate();
  const location = useLocation();
  
  const { userData: authUserData } = useAuth();
  
  const [walletBalance, setWalletBalance] = useState(0);
  
  useEffect(() => {
    if (!currentUser) return;
    
    const loadWalletBalance = async () => {
      try {
        const walletRef = doc(db, 'wallets', currentUser.uid);
        const walletSnap = await getDoc(walletRef);
        if (walletSnap.exists()) {
          setWalletBalance(walletSnap.data().balance || 0);
        }
      } catch (error) {
        console.error("Error loading wallet balance:", error);
      }
    };
    
    loadWalletBalance();
    
    const walletRef = doc(db, 'wallets', currentUser.uid);
    const unsubscribe = onSnapshot(walletRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setWalletBalance(data.balance || 0);
      }
    });
    
    return () => unsubscribe();
  }, [currentUser]);
  
  const userData = useMemo(() => ({
    name: authUserData?.displayName || currentUser?.displayName || "User",
    badge: authUserData?.isVerified ? "✅ Verified" : "📝 Member",
    walletBalance: walletBalance,
    photoURL: authUserData?.photoURL || currentUser?.photoURL || ""
  }), [authUserData, currentUser, walletBalance]);

  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 768);

  const [showDesktopMenu, setShowDesktopMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showModeSwitcher, setShowModeSwitcher] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollY = useRef(0);
  
  const desktopMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const modeSwitcherRef = useRef(null);
  const searchRef = useRef(null);
  
  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme !== 'light';
  });

  const toggleTheme = useCallback(() => {
    const newMode = !isDark;
    setIsDark(newMode);
    
    if (!newMode) {
      document.documentElement.classList.add('light-mode');
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark-mode');
      document.documentElement.classList.remove('light-mode');
      localStorage.setItem('theme', 'dark');
    }
  }, [isDark]);

  const [localSearchQuery, setLocalSearchQuery] = useState(propSearchQuery || '');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const [isAdmin, setIsAdmin] = useState(false);
  const isHomePage = location.pathname === '/' || location.pathname.startsWith('/post/');

  const highlightText = useCallback((text, searchTerm) => {
    if (!searchTerm || !text || searchTerm.trim() === '') return text;
    try {
      const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, index) => 
        regex.test(part) ? 
          <mark key={index} className="search-highlight">{part}</mark> : 
          part
      );
    } catch (error) {
      return text;
    }
  }, []);

  useEffect(() => {
    const adminEmails = ['hammanmusa362@gmail.com', 'hasanmahmudmd362@gmail.com'];
    if (currentUser && adminEmails.includes(currentUser.email)) {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  }, [currentUser]);

  useEffect(() => {
    setLocalSearchQuery(propSearchQuery || '');
  }, [propSearchQuery]);

  useEffect(() => {
    if (propSearchResults) {
      setSearchResults(propSearchResults);
    }
  }, [propSearchResults]);

  useEffect(() => {
    const path = location.pathname;
    if (path === '/') setActiveTab('dashboard');
    else if (path === '/inbox') setActiveTab('messages');
    else if (path === '/deal-manager') setActiveTab('jobs');
    else if (path === '/notifications') setActiveTab('notifications');
    else if (path === '/profile') setActiveTab('profile');
    else if (path === '/saved-jobs') setActiveTab('saved-jobs');
  }, [location.pathname, setActiveTab]);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth > 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(event.target)) {
        const isDesktopBtn = event.target.closest('.dock-item')?.querySelector('.fa-user-gear');
        if (!isDesktopBtn) {
          setShowDesktopMenu(false);
        }
      }
      
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        const isMobileBtn = event.target.closest('.cb-item')?.querySelector('.fa-user-gear');
        if (!isMobileBtn) {
          setShowMobileMenu(false);
        }
      }
      
      if (modeSwitcherRef.current && !modeSwitcherRef.current.contains(event.target)) {
        setShowModeSwitcher(false);
      }
      
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        setShowDesktopMenu(false);
        setShowMobileMenu(false);
        setShowModeSwitcher(false);
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < 10) {
        setShowHeader(true);
        return;
      }
      if (currentScrollY > lastScrollY.current) {
        setShowHeader(false);
      } else {
        setShowHeader(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const toggleDesktopMenu = useCallback((e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setShowDesktopMenu(prev => !prev);
  }, []);

  const toggleMobileMenu = useCallback((e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setShowMobileMenu(prev => !prev);
  }, []);

  const toggleDropdown = useCallback((dropdownType, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    setShowDesktopMenu(false);
    setShowMobileMenu(false);
    setShowModeSwitcher(false);
    setShowSearchResults(false);
    
    if (dropdownType === 'mode') {
      setShowModeSwitcher(prev => !prev);
    }
  }, []);

  const handleSearch = useCallback((e) => {
    const value = e.target.value;
    setLocalSearchQuery(value);
    if (onSearch) onSearch(value);
    if (value.trim().length > 0) {
      setShowSearchResults(true);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [onSearch]);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && localSearchQuery.trim()) {
      setShowSearchResults(false);
      navigate(`/search?q=${encodeURIComponent(localSearchQuery)}`);
    }
  }, [localSearchQuery, navigate]);

  const handleSearchResultClick = useCallback((result) => {
    setLocalSearchQuery('');
    setShowSearchResults(false);
    if (onSearch) onSearch('');
    navigate(`/post/${result.id}`);
  }, [onSearch, navigate]);

  const handleModeSwitch = useCallback((e, mode) => {
    e.stopPropagation();
    setCurrentMode(mode);
    setShowModeSwitcher(false);
    localStorage.setItem('currentMode', mode);
  }, [setCurrentMode]);

  const handleLogoutClick = useCallback((e) => {
    e.preventDefault();
    setShowDesktopMenu(false);
    setShowMobileMenu(false);
    if (onLogout) onLogout();
    navigate('/login');
  }, [onLogout, navigate]);

  const handleNavigate = useCallback((path, tab) => {
    setActiveTab(tab);
    setShowDesktopMenu(false);
    setShowMobileMenu(false);
    setShowModeSwitcher(false);
    setShowSearchResults(false);
    navigate(path);
  }, [setActiveTab, navigate]);

  const handleWalletNavigate = useCallback(() => {
    setShowDesktopMenu(false);
    setShowMobileMenu(false);
    setShowModeSwitcher(false);
    setShowSearchResults(false);
    navigate('/wallet');
  }, [navigate]);

  const handleSettingsNavigate = useCallback(() => {
    setShowDesktopMenu(false);
    setShowMobileMenu(false);
    setShowModeSwitcher(false);
    setShowSearchResults(false);
    navigate('/settings');
  }, [navigate]);

  const settingsDropdown = useMemo(() => (
    <div className="settings-dropdown">
      <button onClick={() => handleNavigate('/profile', 'profile')} className="drop-item">
        <div className="item-left">
          <i className="fa-solid fa-circle-user"></i>
          <span>My Profile</span>
        </div>
      </button>

      <button onClick={() => handleNavigate('/saved-jobs', 'saved-jobs')} className="drop-item">
        <div className="item-left">
          <i className="fa-solid fa-bookmark"></i>
          <span>Saved Jobs</span>
        </div>
      </button>

      <button onClick={handleWalletNavigate} className="drop-item wallet-highlight-row">
        <div className="item-left">
          <i className="fa-solid fa-wallet"></i>
          <span>My Wallet</span>
        </div>
        <span className="badge-usdt">
          ৳ {userData?.walletBalance?.toLocaleString() || 0}
        </span>
      </button>

      {isAdmin && (
        <button onClick={() => handleNavigate('/admin', 'admin')} className="drop-item">
          <div className="item-left">
            <i className="fa-solid fa-shield-haltered"></i>
            <span>Admin Dashboard</span>
          </div>
        </button>
      )}

      <div className="drop-divider"></div>

      <button onClick={handleSettingsNavigate} className="drop-item">
        <div className="item-left">
          <i className="fa-solid fa-sliders"></i>
          <span>Settings</span>
        </div>
        <i className="fa-solid fa-chevron-right"></i>
      </button>

      <button onClick={toggleTheme} className="drop-item">
        <div className="item-left">
          <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </div>
        <span className="theme-toggle-indicator">
          {isDark ? '🌙' : '☀️'}
        </span>
      </button>

      <div className="drop-divider"></div>

      <button onClick={handleLogoutClick} className="drop-item logout-action">
        <div className="item-left">
          <i className="fa-solid fa-power-off"></i>
          <span>Log Out</span>
        </div>
      </button>
    </div>
  ), [userData, isAdmin, isDark, toggleTheme, handleLogoutClick, handleNavigate, handleWalletNavigate, handleSettingsNavigate]);

  return (
    <div className="dark-cyber-theme-container">
      
      {/* ডেস্কটপ সাইড বার */}
      <div className="cyber-side-dock">
        <div className="dock-logo" aria-label="Logo">
          <i className="fa-solid fa-cube"></i>
        </div>

        <nav className="dock-menu" aria-label="Desktop Navigation">
          <button className={`cb-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleNavigate('/', 'dashboard')}>
            <i className="fa-solid fa-border-all"></i>
          </button>

          <button className={`cb-item ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => handleNavigate('/inbox', 'messages')}>
            <i className="fa-solid fa-paper-plane"></i>
            {totalUnread > 0 && <span className="unread-badge bottom">{totalUnread}</span>}
          </button>
          
          <button 
            className={`dock-item ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => handleNavigate('/deal-manager', 'jobs')}
          >
            <i className="fa-solid fa-briefcase"></i>
            {totalDeals > 0 && (
              <span className="unread-badge">{totalDeals}</span>
            )}
          </button>
          
          <button className={`cb-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => handleNavigate('/notifications', 'notifications')}>
            <i className="fa-solid fa-bell"></i>
            {unreadNotifications > 0 && (
              <span className="unread-badge bottom">{unreadNotifications}</span>
            )}
          </button>
          
          <button 
            className={`dock-item ${showDesktopMenu ? 'active-trigger' : ''}`} 
            onMouseEnter={() => setShowDesktopMenu(true)}
          >
            <i className="fa-solid fa-user-gear"></i>
          </button>
        </nav>

        <div 
          className="dock-menu-wrapper"
          onMouseEnter={() => setShowDesktopMenu(true)}
          onMouseLeave={() => setShowDesktopMenu(false)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: 'auto' }}
        >
          <div 
            className={`minimal-dropdown desktop-dropdown-pos ${showDesktopMenu ? 'show' : ''}`} 
            ref={desktopMenuRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drop-header">
              <div className="avatar-glow">
                {userData?.photoURL ? (
                  <img 
                    src={userData.photoURL} 
                    alt="Profile" 
                    className="avatar-img"
                    key={userData.photoURL}
                    onError={(e) => {
                      e.target.src = '';
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <i className="fa-solid fa-user-gear"></i>
                )}
              </div>
              <div className="user-meta">
                <h4>{userData?.name || 'User'}</h4>
                <p>{userData?.badge}</p>
              </div>
            </div>
            <SettingsDropdown 
              userData={userData}
              isAdmin={isAdmin}
              isDark={isDark}
              toggleTheme={toggleTheme}
              onLogout={onLogout}
              setActiveTab={setActiveTab}
              onItemClick={() => {
                setShowDesktopMenu(false);
                setShowMobileMenu(false); 
              }}
            />
          </div>
        </div>

      </div>

      <div className="content-container-wrapper">
        
        {isHomePage && (
          <header className={`floating-utility-hub ${showHeader ? 'header-visible' : 'header-hidden'}`}>
            
            <div 
              className={`page-intent-title ${showModeSwitcher ? 'active' : ''}`} 
              ref={modeSwitcherRef}
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('mode', e);
              }}
            >
              <div className="title-flex-trigger">
                {/* ✅ সরাসরি Seller / Buyer Mode */}
                <h1>
                  {currentMode === 'seller' ? (
                    <>
                      <i className="fa-solid fa-store" style={{ marginRight: '8px', color: 'var(--accent-primary)' }}></i>
                      Seller Mode
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-briefcase" style={{ marginRight: '8px', color: 'var(--accent-primary)' }}></i>
                      Buyer Mode
                    </>
                  )}
                </h1>
                <i className="fa-solid fa-chevron-down"></i>
              </div>
              
              <div className={`mode-switcher-dropdown ${showModeSwitcher ? 'show' : ''}`}>
                {/* ✅ Seller Mode */}
                <div 
                  className={`mode-opt ${currentMode === 'seller' ? 'selected' : ''}`} 
                  onClick={(e) => handleModeSwitch(e, 'seller')}
                >
                  <i className="fa-solid fa-store"></i>
                  <div className="opt-meta">
                    <span className="opt-title">🛒 Seller Mode</span>
                    <span className="opt-desc">Sell your services & gigs</span>
                  </div>
                  {currentMode === 'seller' && (
                    <span className="opt-check">
                      <i className="fa-solid fa-check-circle"></i>
                    </span>
                  )}
                </div>
                
                {/* ✅ Buyer Mode */}
                <div 
                  className={`mode-opt ${currentMode === 'buyer' ? 'selected' : ''}`} 
                  onClick={(e) => handleModeSwitch(e, 'buyer')}
                >
                  <i className="fa-solid fa-briefcase"></i>
                  <div className="opt-meta">
                    <span className="opt-title">💼 Buyer Mode</span>
                    <span className="opt-desc">Find & hire freelancers</span>
                  </div>
                  {currentMode === 'buyer' && (
                    <span className="opt-check">
                      <i className="fa-solid fa-check-circle"></i>
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="search-container" ref={searchRef}>
              <div className="search-pill">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input 
                  type="text" 
                  placeholder={currentMode === 'seller' ? "Search services..." : "Search jobs..."}
                  value={localSearchQuery}
                  onChange={handleSearch}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => localSearchQuery.trim() && setShowSearchResults(true)}
                />
              </div>
              
              {showSearchResults && searchResults.length > 0 && (
                <div className="search-results-dropdown">
                  {searchResults.map((result) => (
                    <div key={result.id} className="search-result-item" onClick={() => handleSearchResultClick(result)}>
                      <div className="result-icon">
                        <i className={result.type === 'job' || result.type === 'hire' ? 'fa-solid fa-briefcase' : 'fa-solid fa-laptop-code'}></i>
                      </div>
                      <div className="result-info">
                        <h4>{highlightText(result.title || result.name, localSearchQuery)}</h4>
                        <p>{highlightText(result.category || (result.type === 'job' || result.type === 'hire' ? 'Job' : 'Service'), localSearchQuery)}</p>
                      </div>
                      <div className="result-badge">
                        <span className={result.type === 'job' || result.type === 'hire' ? 'badge-job' : 'badge-service'}>
                          {result.type === 'job' || result.type === 'hire' ? 'Job' : 'Service'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </header>
        )}

        <main className="content-body-real">
          {children} 
        </main>

        {/* মোবাইল ড্রপডাউন */}
        <div 
          className={`minimal-dropdown mobile-dropdown-pos ${showMobileMenu ? 'show' : ''}`} 
          ref={mobileMenuRef}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="drop-header">
            <div className="avatar-glow">
              {userData?.photoURL ? (
                <img 
                  src={userData.photoURL} 
                  alt="Profile" 
                  className="avatar-img"
                  key={userData.photoURL}
                  onError={(e) => {
                    e.target.src = '';
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <i className="fa-solid fa-user-gear"></i>
              )}
            </div>
            <div className="user-meta">
              <h4>{userData?.name || 'User'}</h4>
              <p>{userData?.badge}</p>
            </div>
          </div>
          <SettingsDropdown 
            userData={userData}
            isAdmin={isAdmin}
            isDark={isDark}
            toggleTheme={toggleTheme}
            onLogout={onLogout}
            setActiveTab={setActiveTab}
            onItemClick={() => {
              setShowMobileMenu(false);
              setShowMobileMenu(false); 
            }}
          />
        </div>
      </div>

      {/* প্লাস আইকন */}
      {isHomePage && (
        <button className="global-floating-fab" onClick={() => setShowPostModal(true)}>
          <i className={currentMode === 'seller' ? "fa-solid fa-plus" : "fa-solid fa-briefcase"}></i>
        </button>
      )}

      {/* মোবাইল বটম বার */}
      {!hideBottomNav && (
        <nav className="cyber-bottom-bar">
          <button className={`cb-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleNavigate('/', 'dashboard')}>
            <i className="fa-solid fa-border-all"></i>
          </button>

          <button className={`cb-item ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => handleNavigate('/inbox', 'messages')}>
            <i className="fa-solid fa-paper-plane"></i>
            {totalUnread > 0 && <span className="unread-badge bottom">{totalUnread}</span>}
          </button>

          <button className={`cb-item ${activeTab === 'jobs' ? 'active' : ''}`} 
            onClick={() => handleNavigate('/deal-manager', 'jobs')}
          >
            <i className="fa-solid fa-briefcase"></i>
            {totalDeals > 0 && (
              <span className="unread-badge bottom">{totalDeals}</span>
            )}
          </button>

          <button className={`cb-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => handleNavigate('/notifications', 'notifications')}>
            <i className="fa-solid fa-bell"></i>
            {unreadNotifications > 0 && <span className="unread-badge bottom">{unreadNotifications}</span>}
          </button>

          <button 
            className={`cb-item ${showMobileMenu ? 'active' : ''}`} 
            onClick={toggleMobileMenu}
          >
            <i className="fa-solid fa-user-gear"></i>
          </button>
        </nav>
      )}

      {/* পোস্ট মডাল */}
      {showPostModal && (
        currentMode === 'buyer' ? (
          <PostJobBox 
            onClose={() => setShowPostModal(false)} 
            setActiveTab={setActiveTab} 
            onSilentPost={onSilentPost} 
            currentUser={currentUser}
          />
        ) : (
          <PostServiceBox 
            onClose={() => setShowPostModal(false)} 
            setActiveTab={setActiveTab} 
            onSilentPost={onSilentPost} 
            currentUser={currentUser}
          />
        )
      )}

    </div>
  );
};

export default Navbar;