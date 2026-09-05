// src/pages/Navbar.jsx
//
// 🔍 SEARCH ARCHITECTURE (per agreed plan):
//   App.jsx already fetches ALL posts (no type/status filter). It now filters
//   to APPROVED posts only before text-matching for search (bug fix — pending
//   /rejected posts used to leak into search results and 404 when clicked).
//   That approved+matched list (both post types mixed) is passed down here as
//   `searchResults`. Navbar splits it into:
//     - currentModeResults: posts matching the person's active mode
//     - otherModeResults:   posts that belong to the OTHER mode
//   Clicking a current-mode result just navigates. Clicking an other-mode
//   result (or the "Switch to X Mode" footer button) flips `currentMode`
//   first, then navigates — Home.jsx's Firestore query re-subscribes for the
//   new mode and the highlight/scroll effect picks the post up once it
//   arrives.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../shared/firebase/index';
import PostJobBox from '../home-feed/PostJobBox';
import PostServiceBox from '../home-feed/PostServiceBox';
// import './Navbar.css';
import FloatingFeedbackButton from '../feedback-widget/FloatingFeedbackButton/FloatingFeedbackButton';
import SettingsDropdown from './components/SettingsDropdown';
import { useLayout } from "../../shared/context/LayoutContext";
import styles from './Navbar.module.css';

// ✅ Post type -> required app mode. 'hire' posts belong to Buyer Mode,
// 'service' posts belong to Seller Mode (matches Home.jsx's Firestore query).
const modeForPost = (post) => (post.type === 'hire' ? 'buyer' : 'seller');

const Navbar = ({ 
  children, 
  currentMode = 'seller',
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
  // 🔧 FIX (mobile/desktop dropdown "won't close on 2nd click"): the
  // outside-click handler used to detect the toggle buttons via
  // `event.target.closest('.dock-item')` / `.cb-item'` — plain string
  // class selectors. But those buttons render with CSS Modules
  // (`styles.dockItem` / `styles.cbItem`), which compile to hashed
  // class names at build time (e.g. `Navbar_cbItem_a1b2c`), never the
  // literal `.cb-item`. So that check always failed, and clicking the
  // toggle button on an already-open dropdown would: (1) get closed by
  // the mousedown-outside handler, then (2) get reopened by the
  // button's own click handler a moment later — net effect, it never
  // closed. Refs on the actual buttons are a reliable way to detect
  // "was this click on the toggle button" regardless of hashed class
  // names.
  const desktopMenuButtonRef = useRef(null);
  const mobileMenuButtonRef = useRef(null);
  
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
    const adminEmails = ['hammanmusa362@gmail.com', 'hasanmahmudmd362@gmail.com','mdmahdihasannur@gmail.com'];
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
        const isDesktopBtn = desktopMenuButtonRef.current?.contains(event.target);
        if (!isDesktopBtn) {
          setShowDesktopMenu(false);
        }
      }
      
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        const isMobileBtn = mobileMenuButtonRef.current?.contains(event.target);
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

  // ============================================================
  // ✅ Dual-mode split of the incoming (already approved-only) search
  // results. `searchResults` mixes both post types — this is where we
  // separate "belongs to my current mode" from "belongs to the other mode".
  // ============================================================
  const currentModeResults = useMemo(
    () => searchResults.filter(r => modeForPost(r) === currentMode),
    [searchResults, currentMode]
  );
  const otherModeResults = useMemo(
    () => searchResults.filter(r => modeForPost(r) !== currentMode),
    [searchResults, currentMode]
  );
  const otherMode = currentMode === 'buyer' ? 'seller' : 'buyer';
  const otherModeLabel = otherMode === 'buyer' ? 'Buyer Mode' : 'Seller Mode';
  const currentModeLabel = currentMode === 'buyer' ? 'Buyer Mode Jobs' : 'Seller Mode Services';

  // ============================================================
  // ✅ Clicking a result: navigate directly if it's already in the
  // person's current mode; otherwise switch mode first, then navigate.
  // Home.jsx re-subscribes its Firestore query when `currentMode` changes
  // and will pick up + highlight the post once the new mode's data arrives.
  // ============================================================
  const handleSearchResultClick = useCallback((result) => {
    const postId = result.id || result.postId;

    if (!postId) {
      console.error("❌ No post ID found:", result);
      return;
    }

    setLocalSearchQuery('');
    setShowSearchResults(false);
    if (onSearch) onSearch('');

    const requiredMode = modeForPost(result);
    if (requiredMode !== currentMode) {
      setCurrentMode(requiredMode);
      localStorage.setItem('currentMode', requiredMode);
    }

    navigate(`/post/${postId}`);
  }, [onSearch, navigate, currentMode, setCurrentMode]);

  // ✅ "Switch to X Mode" footer button — just flips the mode and stays on
  // the home feed; Home.jsx re-queries for the new mode and re-applies the
  // same (still-active) search term via its own `searchTerm` prop, so the
  // person immediately sees the other mode's matching posts in the feed.
  const handleSwitchModeForSearch = useCallback(() => {
    setCurrentMode(otherMode);
    localStorage.setItem('currentMode', otherMode);
    setShowSearchResults(false);
    if (location.pathname !== '/') {
      navigate('/');
    }
  }, [otherMode, setCurrentMode, navigate, location.pathname]);

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
    navigate('/login', { replace: true });
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
    <div className={styles.settingsDropdown}>
      <button onClick={() => handleNavigate('/profile', 'profile')} className={styles.dropItem}>
        <div className={styles.itemLeft}>
          <i className="fa-solid fa-circle-user"></i>
          <span>My Profile</span>
        </div>
      </button>

      <button onClick={() => handleNavigate('/saved-jobs', 'saved-jobs')} className={styles.dropItem}>
        <div className={styles.itemLeft}>
          <i className="fa-solid fa-bookmark"></i>
          <span>Saved Jobs</span>
        </div>
      </button>

      <button onClick={handleWalletNavigate} className={`${styles.dropItem} ${styles.walletHighlightRow}`}>
        <div className={styles.itemLeft}>
          <i className="fa-solid fa-wallet"></i>
          <span>My Wallet</span>
        </div>
        <span className={styles.badgeUsdt}>
          ৳ {userData?.walletBalance?.toLocaleString() || 0}
        </span>
      </button>

      {isAdmin && (
        <button onClick={() => handleNavigate('/admin', 'admin')} className={styles.dropItem}>
          <div className={styles.itemLeft}>
            <i className="fa-solid fa-shield-haltered"></i>
            <span>Admin Dashboard</span>
          </div>
        </button>
      )}

      <div className={styles.dropDivider}></div>

      <button onClick={handleSettingsNavigate} className={styles.dropItem}>
        <div className={styles.itemLeft}>
          <i className="fa-solid fa-sliders"></i>
          <span>Settings</span>
        </div>
        <i className="fa-solid fa-chevron-right"></i>
      </button>

      <button onClick={toggleTheme} className={styles.dropItem}>
        <div className={styles.itemLeft}>
          <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </div>
        <span className={styles.themeToggleIndicator}>
          {isDark ? '🌙' : '☀️'}
        </span>
      </button>

      <div className={styles.dropDivider}></div>

      <button onClick={handleLogoutClick} className={`${styles.dropItem} ${styles.logoutAction}`}>
        <div className={styles.itemLeft}>
          <i className="fa-solid fa-power-off"></i>
          <span>Log Out</span>
        </div>
      </button>
    </div>
  ), [userData, isAdmin, isDark, toggleTheme, handleLogoutClick, handleNavigate, handleWalletNavigate, handleSettingsNavigate]);

  // ============================================================
  // ✅ Renders one result row (used for both current-mode and
  // other-mode lists so the markup/behavior stays identical).
  // ============================================================
  const renderResultItem = (result) => {
    const isJobType = result.type === 'job' || result.type === 'hire';
    return (
      <div
        key={result.id || result.postId || result.title}
        className={styles.searchResultItem}
        onClick={() => handleSearchResultClick(result)}
      >
        <div className={styles.resultIcon}>
          <i className={isJobType ? 'fa-solid fa-briefcase' : 'fa-solid fa-laptop-code'}></i>
        </div>
        <div className={styles.resultInfo}>
          <h4>{highlightText(result.title || result.name, localSearchQuery)}</h4>
          <p>{highlightText(result.category || (isJobType ? 'Job' : 'Service'), localSearchQuery)}</p>
        </div>
        <div className={styles.resultBadge}>
          <span className={isJobType ? styles.badgeJob : styles.badgeService}>
            {isJobType ? 'Job' : 'Service'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.darkCyberThemeContainer}>
      
      {/* ডেস্কটপ সাইড বার */}
      <div className={styles.cyberSideDock}>
        <div className={styles.dockLogo} aria-label="Logo">
          <i className="fa-solid fa-cube"></i>
        </div>

        <nav className={styles.dockMenu} aria-label="Desktop Navigation">
          <button className={`${styles.cbItem} ${activeTab === 'dashboard' ? styles.active : ''}`} onClick={() => handleNavigate('/', 'dashboard')}>
            <i className="fa-solid fa-border-all"></i>
          </button>

          <button className={`${styles.cbItem} ${activeTab === 'messages' ? styles.active : ''}`} onClick={() => handleNavigate('/inbox', 'messages')}>
            <i className="fa-solid fa-paper-plane"></i>
            {totalUnread > 0 && <span className={`${styles.unreadBadge} ${styles.bottom}`}>{totalUnread}</span>}
          </button>
          
          <button 
            className={`${styles.dockItem} ${activeTab === 'jobs' ? styles.active : ''}`}
            onClick={() => handleNavigate('/deal-manager', 'jobs')}
          >
            <i className="fa-solid fa-briefcase"></i>
            {totalDeals > 0 && (
              <span className={styles.unreadBadge}>{totalDeals}</span>
            )}
          </button>
          
          <button className={`${styles.cbItem} ${activeTab === 'notifications' ? styles.active : ''}`} onClick={() => handleNavigate('/notifications', 'notifications')}>
            <i className="fa-solid fa-bell"></i>
            {unreadNotifications > 0 && (
              <span className={`${styles.unreadBadge} ${styles.bottom}`}>{unreadNotifications}</span>
            )}
          </button>
          
          <button 
            ref={desktopMenuButtonRef}
            className={`${styles.dockItem} ${showDesktopMenu ? styles.activeTrigger : ''}`} 
            onMouseEnter={() => setShowDesktopMenu(true)}
          >
            <i className="fa-solid fa-user-gear"></i>
          </button>
        </nav>

        <div 
          className={styles.dockMenuWrapper}
          onMouseEnter={() => setShowDesktopMenu(true)}
          onMouseLeave={() => setShowDesktopMenu(false)}
        >
          <div 
            className={`${styles.minimalDropdown} ${styles.desktopDropdownPos} ${showDesktopMenu ? styles.show : ''}`} 
            ref={desktopMenuRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.dropHeader}>
              <div className={styles.avatarGlow}>
                {userData?.photoURL ? (
                  <img 
                    src={userData.photoURL} 
                    alt="Profile" 
                    className={styles.avatarImg}
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
              <div className={styles.userMeta}>
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

      <div className={styles.contentContainerWrapper}>
        
        {isHomePage && (
          <header className={`${styles.floatingUtilityHub} ${showHeader ? styles.headerVisible : styles.headerHidden}`}>
            
            <div 
              className={`${styles.pageIntentTitle} ${showModeSwitcher ? styles.active : ''}`} 
              ref={modeSwitcherRef}
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('mode', e);
              }}
            >
              <div className={styles.titleFlexTrigger}>
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
              
              <div className={`${styles.modeSwitcherDropdown} ${showModeSwitcher ? styles.show : ''}`}>
                <div 
                  className={`${styles.modeOpt} ${currentMode === 'seller' ? styles.selected : ''}`} 
                  onClick={(e) => handleModeSwitch(e, 'seller')}
                >
                  <i className="fa-solid fa-store"></i>
                  <div className={styles.optMeta}>
                    <span className={styles.optTitle}>🛒 Seller Mode</span>
                    <span className={styles.optDesc}>Sell your services & gigs</span>
                  </div>
                  {currentMode === 'seller' && (
                    <span className={styles.optCheck}>
                      <i className="fa-solid fa-check-circle"></i>
                    </span>
                  )}
                </div>
                
                <div 
                  className={`${styles.modeOpt} ${currentMode === 'buyer' ? styles.selected : ''}`} 
                  onClick={(e) => handleModeSwitch(e, 'buyer')}
                >
                  <i className="fa-solid fa-briefcase"></i>
                  <div className={styles.optMeta}>
                    <span className={styles.optTitle}>💼 Buyer Mode</span>
                    <span className={styles.optDesc}>Find & hire freelancers</span>
                  </div>
                  {currentMode === 'buyer' && (
                    <span className={styles.optCheck}>
                      <i className="fa-solid fa-check-circle"></i>
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className={styles.searchContainer} ref={searchRef}>
              <div className={styles.searchPill}>
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
              
              {/* ✅ Dual-mode search results dropdown */}
              {showSearchResults && (
                <div className={styles.searchResultsDropdown}>
                  {searchResults.length === 0 ? (
                    <div className={styles.searchNoResults}>
                      <i className="fa-solid fa-search-minus"></i>
                      <p>No results found for "<strong>{localSearchQuery}</strong>"</p>
                      <span>Try adjusting your search terms</span>
                    </div>
                  ) : (
                    <>
                      {/* ── Current mode section ── */}
                      <div className={styles.searchSectionHeader}>
                        <span>
                          {currentMode === 'seller' ? '🛒' : '💼'} {currentModeLabel}
                        </span>
                        <span className={styles.countBadge}>{currentModeResults.length}</span>
                      </div>

                      {currentModeResults.length > 0 ? (
                        currentModeResults.map(renderResultItem)
                      ) : (
                        <div className={styles.searchEmptyMode}>
                          <i className="fa-solid fa-circle-info"></i>
                          এই মোডে কোনো ফলাফল নেই
                        </div>
                      )}

                      {/* ── Other mode section (count + switch shortcut) ── */}
                      {otherModeResults.length > 0 && (
                        <>
                          <div className={styles.searchDivider}></div>
                          <div className={styles.otherModeSearchFooter}>
                            <span>
                              {otherMode === 'seller' ? '🛒' : '💼'} {otherModeResults.length} results in {otherModeLabel}
                            </span>

                            {/* Quick links straight into specific other-mode posts */}
                            <div className={styles.otherModeResultsPreview}>
                              {otherModeResults.slice(0, 3).map(renderResultItem)}
                            </div>

                            <button
                              type="button"
                              className={styles.switchModeSearchBtn}
                              onClick={handleSwitchModeForSearch}
                            >
                              Switch to {otherModeLabel} <i className="fa-solid fa-arrow-right"></i>
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </header>
        )}

        <main className={styles.contentBodyReal}>
          {children} 
        </main>

        {/* মোবাইল ড্রপডাউন */}
        <div 
          className={`${styles.minimalDropdown} ${styles.mobileDropdownPos} ${showMobileMenu ? styles.show : ''}`} 
          ref={mobileMenuRef}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.dropHeader}>
            <div className={styles.avatarGlow}>
              {userData?.photoURL ? (
                <img 
                  src={userData.photoURL} 
                  alt="Profile" 
                  className={styles.avatarImg}
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
            <div className={styles.userMeta}>
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
            }}
          />
        </div>
      </div>

      {/* প্লাস আইকন */}
      {isHomePage && (
        <button className={styles.globalFloatingFab} onClick={() => setShowPostModal(true)}>
          <i className={currentMode === 'seller' ? "fa-solid fa-plus" : "fa-solid fa-briefcase"}></i>
        </button>
      )}

      {/* মোবাইল বটম বার */}
      {!hideBottomNav && (
        <nav className={styles.cyberBottomBar}>
          <button className={`${styles.cbItem} ${activeTab === 'dashboard' ? styles.active : ''}`} onClick={() => handleNavigate('/', 'dashboard')}>
            <i className="fa-solid fa-border-all"></i>
          </button>

          <button className={`${styles.cbItem} ${activeTab === 'messages' ? styles.active : ''}`} onClick={() => handleNavigate('/inbox', 'messages')}>
            <i className="fa-solid fa-paper-plane"></i>
            {totalUnread > 0 && <span className={`${styles.unreadBadge} ${styles.bottom}`}>{totalUnread}</span>}
          </button>

          <button className={`${styles.cbItem} ${activeTab === 'jobs' ? styles.active : ''}`} 
            onClick={() => handleNavigate('/deal-manager', 'jobs')}
          >
            <i className="fa-solid fa-briefcase"></i>
            {totalDeals > 0 && (
              <span className={`${styles.unreadBadge} ${styles.bottom}`}>{totalDeals}</span>
            )}
          </button>

          <button className={`${styles.cbItem} ${activeTab === 'notifications' ? styles.active : ''}`} onClick={() => handleNavigate('/notifications', 'notifications')}>
            <i className="fa-solid fa-bell"></i>
            {unreadNotifications > 0 && <span className={`${styles.unreadBadge} ${styles.bottom}`}>{unreadNotifications}</span>}
          </button>

          <button 
            ref={mobileMenuButtonRef}
            className={`${styles.cbItem} ${showMobileMenu ? styles.active : ''}`} 
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