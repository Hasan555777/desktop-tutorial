// src/pages/Welcome/Welcome.jsx

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Welcome.css';

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
      navigate('/');
    }
  }, [currentUser, navigate]);

  return (
    <div className="welcome-page">
      {/* Navbar */}
      <nav className="welcome-navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <i className="fa-solid fa-cube"></i>
            <span>WorkTrustbd</span>
          </div>
          <div className="nav-actions">
            <button 
              className="nav-btn login-btn"
              onClick={() => navigate('/login')}
            >
              Log In
            </button>
            <button 
              className="nav-btn register-btn"
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
      <footer className="welcome-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <i className="fa-solid fa-cube"></i>
            <span>WorkTrustbd</span>
            <p>Trusted Freelance & Service Marketplace in Bangladesh</p>
          </div>
          <div className="footer-links">
            <a href="#">About</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Contact</a>
          </div>
          <div className="footer-social">
            <a href="#"><i className="fa-brands fa-facebook"></i></a>
            <a href="#"><i className="fa-brands fa-linkedin"></i></a>
            <a href="#"><i className="fa-brands fa-twitter"></i></a>
            <a href="#"><i className="fa-brands fa-youtube"></i></a>
          </div>
          <div className="footer-copy">
            &copy; 2026 WorkTrustbd. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Welcome;