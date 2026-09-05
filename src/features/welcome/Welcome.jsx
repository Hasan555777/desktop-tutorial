// src/pages/Welcome/Welcome.jsx

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import styles from './Welcome.module.css';

// Components
import HeroSection from './components/HeroSection';
import FeaturesSection from './components/FeaturesSection';
import StatsSection from './components/StatsSection';
import HowItWorksSection from './components/HowItWorksSection';
import TestimonialsSection from './components/TestimonialsSection';
import CTASection from './components/CTASection';

const Welcome = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // ✅ Already logged in? Redirect to home
  useEffect(() => {
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  return (
    <div className={styles.welcomePage}>
      {/* Navbar */}
      <nav className={styles.welcomeNavbar}>
        <div className={styles.navContainer}>
          <div className={styles.navLogo}>
            <i className="fa-solid fa-cube"></i>
            <span>WorkTrustbd</span>
          </div>
          <div className={styles.navActions}>
            <button 
              className={`${styles.navBtn} ${styles.loginBtn}`}
              onClick={() => navigate('/login')}
            >
              Log In
            </button>
            <button 
              className={`${styles.navBtn} ${styles.registerBtn}`}
              onClick={() => navigate('/register')}
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <HeroSection navigate={navigate} />

      {/* Features Section */}
      <FeaturesSection />

      {/* Stats Section */}
      <StatsSection />

      {/* How It Works */}
      <HowItWorksSection />

      {/* Testimonials */}
      <TestimonialsSection />

      {/* CTA Section */}
      <CTASection navigate={navigate} />

      {/* Footer */}
      <footer className={styles.welcomeFooter}>
        <div className={styles.footerContainer}>
          <div className={styles.footerBrand}>
            <i className="fa-solid fa-cube"></i>
            <span>WorkTrustbd</span>
            <p>Trusted Freelance & Service Marketplace in Bangladesh</p>
          </div>
          <div className={styles.footerLinks}>
            <a href="#">About</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Contact</a>
          </div>
          <div className={styles.footerSocial}>
            <a href="#"><i className="fa-brands fa-facebook"></i></a>
            <a href="#"><i className="fa-brands fa-linkedin"></i></a>
            <a href="#"><i className="fa-brands fa-twitter"></i></a>
            <a href="#"><i className="fa-brands fa-youtube"></i></a>
          </div>
          <div className={styles.footerCopy}>
            &copy; 2026 WorkTrustbd. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Welcome;