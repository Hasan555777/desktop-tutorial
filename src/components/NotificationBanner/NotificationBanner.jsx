// src/components/NotificationBanner/NotificationBanner.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useNotification } from '@/UI/Notification/NotificationProvider';
import { useFeedback } from '@/UI/Feedback/FeedbackProvider';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import styles from './NotificationBanner.module.css';

const BANNER_STORAGE_KEY = 'allamanah_notification_banner';
const ADMIN_BANNER_STORAGE_KEY = 'allamanah_admin_notification_banner';

const NotificationBanner = ({ 
  variant = 'default',
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

  const storageKey = variant === 'admin' ? ADMIN_BANNER_STORAGE_KEY : BANNER_STORAGE_KEY;

  const isDismissed = () => {
    const dismissedData = localStorage.getItem(storageKey);
    if (!dismissedData) return false;
    try {
      const { timestamp } = JSON.parse(dismissedData);
      const days = variant === 'admin' ? 30 : 7;
      return Date.now() - timestamp < days * 24 * 60 * 60 * 1000;
    } catch { return false; }
  };

  useEffect(() => {
    if (!autoShow) return;
    
    if (permissionStatus === 'default' && !isDismissed()) {
      const timer = setTimeout(() => setShowBanner(true), delay);
      return () => clearTimeout(timer);
    } else {
      setShowBanner(false);
    }
  }, [permissionStatus, autoShow, delay]);

  useEffect(() => {
    if (showBanner && !bannerSoundPlayed.current && isReady) {
      if (import.meta.env.DEV) {
        console.log('🔊 Banner showing - playing sound...');
      }
      
      const soundEvent = variant === 'admin' 
        ? SOUND_EVENTS.ADMIN_NOTIFICATION 
        : SOUND_EVENTS.NOTIFICATION;
      
      playEvent?.(soundEvent);
      bannerSoundPlayed.current = true;
    }
  }, [showBanner, isReady, playEvent, variant]);

  useEffect(() => {
    if (permissionStatus !== 'default') {
      setShowBanner(false);
      bannerSoundPlayed.current = false;
    }
  }, [permissionStatus]);

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      console.log('🔍 Before permission request - status:', permissionStatus);
      
      const granted = await requestPermission();
      
      console.log('🔍 After permission request - granted:', granted, 'status:', permissionStatus);
      
      if (granted === true) {
        setShowBanner(false);
        localStorage.setItem(storageKey, JSON.stringify({ timestamp: Date.now() }));
        
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
      } 
      else {
        setShowBanner(false);
        
        if (variant === 'admin') {
          alert.info({ 
            title: 'ℹ️ অ্যাডমিন নোটিফিকেশন বন্ধ', 
            message: 'আপনি অ্যাডমিন নোটিফিকেশন বন্ধ রেখেছেন।',
            duration: 3000 
          });
        } else {
          alert.info({ 
            title: 'ℹ️ নোটিফিকেশন বন্ধ', 
            message: 'আপনি নোটিফিকেশন বন্ধ রেখেছেন।',
            duration: 3000 
          });
        }
        
        if (onEnable) onEnable(false);
      }
    } catch (error) {
      console.error('❌ Permission error:', error);
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

  if (permissionStatus === 'granted' || permissionStatus === 'denied' || permissionStatus === 'unsupported') {
    return null;
  }

  if (!showBanner) return null;

  // ✅ Admin variant
  if (variant === 'admin') {
    return (
      <div className={`${styles.notificationBanner} ${styles.adminBanner}`} role="alert" aria-live="polite">
        <div className={styles.notificationBannerContent}>
          <div className={styles.bannerIcon}>
            {customIcon || '🔔'}
            <span className={styles.adminBadge}>ADMIN</span>
          </div>
          <div className={styles.bannerText}>
            <h4>{customTitle || '📢 অ্যাডমিন নোটিফিকেশন চালু করুন'}</h4>
            <p>
              {customMessage || 
                'নতুন অ্যাডমিন আপডেট, রিপোর্ট এবং গুরুত্বপূর্ণ বিজ্ঞপ্তি পেতে নোটিফিকেশন চালু করুন।'
              }
            </p>
          </div>
          <div className={`${styles.bannerActions} ${styles.adminActions}`}>
            <button 
              className={`${styles.bannerBtn} ${styles.btnEnable} ${styles.adminBtn}`} 
              onClick={handleEnable} 
              disabled={isLoading}
            >
              {isLoading ? (
                <span className={styles.loadingText}>
                  <span className={styles.spinner}></span>
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
              className={`${styles.bannerBtn} ${styles.btnNotNow} ${styles.adminNotNow}`} 
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
      <div className={`${styles.notificationBanner} ${styles.compactBanner}`} role="alert" aria-live="polite">
        <div className={`${styles.notificationBannerContent} ${styles.compactContent}`}>
          <div className={`${styles.bannerIcon} ${styles.compactIcon}`}>
            {customIcon || '🔔'}
          </div>
          <div className={`${styles.bannerText} ${styles.compactText}`}>
            <p>{customMessage || 'নোটিফিকেশন চালু করুন'}</p>
          </div>
          <div className={`${styles.bannerActions} ${styles.compactActions}`}>
            <button 
              className={`${styles.bannerBtn} ${styles.btnEnable} ${styles.compactBtn}`} 
              onClick={handleEnable} 
              disabled={isLoading}
            >
              {isLoading ? '...' : '✅ চালু করুন'}
            </button>
            <button 
              className={`${styles.bannerBtn} ${styles.btnNotNow} ${styles.compactBtnClose}`} 
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
    <div className={styles.notificationBanner} role="alert" aria-live="polite">
      <div className={styles.notificationBannerContent}>
        <div className={styles.bannerIcon}>{customIcon || '🔔'}</div>
        <div className={styles.bannerText}>
          <h4>{customTitle || 'নোটিফিকেশন চালু করুন'}</h4>
          <p>
            {customMessage || 
              'নতুন মেসেজ, অফার এবং গুরুত্বপূর্ণ আপডেট পেতে নোটিফিকেশন চালু করুন।'
            }
          </p>
        </div>
        <div className={styles.bannerActions}>
          <button 
            className={`${styles.bannerBtn} ${styles.btnEnable}`} 
            onClick={handleEnable} 
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner}></span> 
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
            className={`${styles.bannerBtn} ${styles.btnNotNow}`} 
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