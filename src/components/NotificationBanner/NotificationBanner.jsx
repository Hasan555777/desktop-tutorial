// src/components/NotificationBanner/NotificationBanner.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useNotification } from '@/UI/Notification/NotificationProvider';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import './NotificationBanner.css';

const BANNER_STORAGE_KEY = 'allamanah_notification_banner';
const ADMIN_BANNER_STORAGE_KEY = 'allamanah_admin_notification_banner';

const NotificationBanner = ({ 
  variant = 'default', // 'default' | 'admin' | 'compact'
  autoShow = true,
  delay = 2000,
  onEnable = null,
  onDismiss = null,
  customTitle = null,
  customMessage = null,
  customIcon = null,
}) => {
  const { requestPermission, permissionStatus } = useNotification();
  const { alert } = useFeedback();
  const { playEvent, isReady } = useSound();
  
  const [showBanner, setShowBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const bannerSoundPlayed = useRef(false);

  // ✅ Storage key based on variant
  const storageKey = variant === 'admin' ? ADMIN_BANNER_STORAGE_KEY : BANNER_STORAGE_KEY;

  // ✅ Check if dismissed
  const isDismissed = () => {
    const dismissedData = localStorage.getItem(storageKey);
    if (!dismissedData) return false;
    try {
      const { timestamp } = JSON.parse(dismissedData);
      // ✅ Admin variant: 30 days, Default: 7 days
      const days = variant === 'admin' ? 30 : 7;
      return Date.now() - timestamp < days * 24 * 60 * 60 * 1000;
    } catch { return false; }
  };

  // ✅ Show banner
  useEffect(() => {
    if (!autoShow) return;
    
    if (permissionStatus === 'default' && !isDismissed()) {
      const timer = setTimeout(() => setShowBanner(true), delay);
      return () => clearTimeout(timer);
    }
  }, [permissionStatus, autoShow, delay]);

  // ✅ Play sound when banner shows
  useEffect(() => {
    if (showBanner && !bannerSoundPlayed.current && isReady) {
      if (import.meta.env.DEV) {
        console.log('🔊 Banner showing - playing sound...');
      }
      
      // ✅ Admin variant uses admin sound
      const soundEvent = variant === 'admin' 
        ? SOUND_EVENTS.ADMIN_NOTIFICATION 
        : SOUND_EVENTS.NOTIFICATION;
      
      playEvent?.(soundEvent);
      bannerSoundPlayed.current = true;
    }
  }, [showBanner, isReady, playEvent, variant]);

  // ✅ Hide banner when permission changes
  useEffect(() => {
    if (permissionStatus !== 'default') {
      setShowBanner(false);
      bannerSoundPlayed.current = false;
    }
  }, [permissionStatus]);

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        setShowBanner(false);
        localStorage.setItem(storageKey, JSON.stringify({ timestamp: Date.now() }));
        
        // ✅ Admin variant uses different message
        if (variant === 'admin') {
          alert.success({ 
            title: '✅ অ্যাডমিন নোটিফিকেশন চালু হয়েছে!', 
            message: 'এখন থেকে সব অ্যাডমিন আপডেট পাবেন।',
            duration: 3000 
          });
          playEvent?.(SOUND_EVENTS.ADMIN_ANNOUNCEMENT);
        } else {
          alert.success({ 
            title: '🎉 নোটিফিকেশন চালু হয়েছে!', 
            message: 'এখন থেকে নতুন আপডেট পাবেন।',
            duration: 3000 
          });
          playEvent?.(SOUND_EVENTS.SUCCESS);
        }
        
        if (onEnable) onEnable(true);
      } else {
        setShowBanner(false);
        alert.info({ 
          title: 'ℹ️ নোটিফিকেশন বন্ধ', 
          message: 'আপনি নোটিফিকেশন বন্ধ রেখেছেন।',
          duration: 3000 
        });
        if (onEnable) onEnable(false);
      }
    } catch (error) {
      alert.error({ 
        title: '❌ সমস্যা হয়েছে', 
        message: 'নোটিফিকেশন চালু করতে সমস্যা হয়েছে।',
        duration: 4000 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotNow = () => {
    setShowBanner(false);
    localStorage.setItem(storageKey, JSON.stringify({ timestamp: Date.now() }));
    
    if (variant === 'admin') {
      alert.info({ 
        title: 'ℹ️ পরে চালু করুন', 
        message: 'পরে অ্যাডমিন নোটিফিকেশন চালু করতে পারেন।',
        duration: 2000 
      });
    } else {
      alert.info({ 
        title: 'ℹ️ পরে চালু করুন', 
        message: 'পরে নোটিফিকেশন চালু করতে পারেন।',
        duration: 2000 
      });
    }
    
    if (onDismiss) onDismiss();
  };

  // ✅ If permission already granted/denied/unsupported
  if (permissionStatus === 'granted' || permissionStatus === 'denied' || permissionStatus === 'unsupported') {
    return null;
  }

  if (!showBanner) return null;

  // ✅ Admin variant styling
  if (variant === 'admin') {
    return (
      <div className="notification-banner admin-banner" role="alert" aria-live="polite">
        <div className="notification-banner-content">
          <div className="banner-icon">
            {customIcon || '🔔'}
            <span className="admin-badge">ADMIN</span>
          </div>
          <div className="banner-text">
            <h4>{customTitle || '📢 অ্যাডমিন নোটিফিকেশন চালু করুন'}</h4>
            <p>
              {customMessage || 
                'নতুন অ্যাডমিন আপডেট, রিপোর্ট এবং গুরুত্বপূর্ণ বিজ্ঞপ্তি পেতে নোটিফিকেশন চালু করুন।'
              }
            </p>
          </div>
          <div className="banner-actions admin-actions">
            <button 
              className="banner-btn btn-enable admin-btn" 
              onClick={handleEnable} 
              disabled={isLoading}
            >
{isLoading ? (
  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span className="spinner" style={{
      display: 'inline-block',
      width: '16px',
      height: '16px',
      border: '2px solid var(--border-color, #e2e8f0)',
      borderTop: '2px solid var(--accent-primary, #14b8a6)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }}></span>
    চালু হচ্ছে...
  </span>
) : (
  <>
    <i className="fa-solid fa-bell"></i> 
    চালু করুন
  </>
)}
            </button>
            <button 
              className="banner-btn btn-not-now admin-not-now" 
              onClick={handleNotNow} 
              disabled={isLoading}
            >
              পরে দেখাবেন
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Compact variant
  if (variant === 'compact') {
    return (
      <div className="notification-banner compact-banner" role="alert" aria-live="polite">
        <div className="notification-banner-content compact-content">
          <div className="banner-icon compact-icon">
            {customIcon || '🔔'}
          </div>
          <div className="banner-text compact-text">
            <p>{customMessage || 'নোটিফিকেশন চালু করুন'}</p>
          </div>
          <div className="banner-actions compact-actions">
            <button 
              className="banner-btn btn-enable compact-btn" 
              onClick={handleEnable} 
              disabled={isLoading}
            >
              {isLoading ? '...' : '✅ চালু করুন'}
            </button>
            <button 
              className="banner-btn btn-not-now compact-btn-close" 
              onClick={handleNotNow} 
              disabled={isLoading}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Default variant
  return (
    <div className="notification-banner" role="alert" aria-live="polite">
      <div className="notification-banner-content">
        <div className="banner-icon">{customIcon || '🔔'}</div>
        <div className="banner-text">
          <h4>{customTitle || 'নোটিফিকেশন চালু করুন'}</h4>
          <p>
            {customMessage || 
              'নতুন মেসেজ, অফার এবং গুরুত্বপূর্ণ আপডেট পেতে নোটিফিকেশন চালু করুন।'
            }
          </p>
        </div>
        <div className="banner-actions">
          <button 
            className="banner-btn btn-enable" 
            onClick={handleEnable} 
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span> 
                চালু হচ্ছে...
              </>
            ) : (
              <>
                <span>🔔</span> 
                চালু করুন
              </>
            )}
          </button>
          <button 
            className="banner-btn btn-not-now" 
            onClick={handleNotNow} 
            disabled={isLoading}
          >
            পরে দেখাবেন
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationBanner;