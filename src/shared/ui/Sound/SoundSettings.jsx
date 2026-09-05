// src/UI/Sound/SoundSettings.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useSound } from './SoundProvider';
import { SOUND_EVENTS } from './SoundEvents';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/index';
import { auth } from '../../firebase/index';
import styles from './SoundSettings.module.css';


// ============================================================
// 📌 Constants
// ============================================================
const SOUND_SETTINGS_KEY = 'workhub_sound_settings';

const DEFAULT_SETTINGS = {
  enabled: true,
  volume: 0.8,
  muted: false,
  chat: true,
  wallet: true,
  notification: true,
  admin: true,
  offer: true,
  deal: true,
  verification: true,
  review: true,
  system: true,
  click: true,
};

// ============================================================
// ✅ Custom Hook for Sound Settings with Firestore
// ============================================================
export const useSoundSettings = (userId) => {
  const { setMuted, setVolume, soundEngine, isReady } = useSound();
  
  const [settings, setSettings] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(80);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ── Load settings from Firestore + localStorage ──
  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      
      try {
        let loadedSettings = null;
        
        // 1️⃣ Try Firestore first
        if (userId) {
          try {
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
              const data = userSnap.data();
              if (data.soundSettings) {
                loadedSettings = data.soundSettings;
                console.log('✅ Sound settings loaded from Firestore');
              }
            }
          } catch (error) {
            console.warn('⚠️ Could not load from Firestore:', error);
          }
        }
        
        // 2️⃣ Fallback to localStorage
        if (!loadedSettings) {
          const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              // Merge with defaults
              loadedSettings = { ...DEFAULT_SETTINGS, ...parsed };
              console.log('✅ Sound settings loaded from localStorage');
            } catch (e) {
              console.warn('⚠️ Error parsing localStorage:', e);
            }
          }
        }
        
        // 3️⃣ Use defaults if nothing found
        if (!loadedSettings) {
          loadedSettings = { ...DEFAULT_SETTINGS };
          console.log('✅ Using default sound settings');
        }
        
        // 4️⃣ Apply settings
        setSettings(loadedSettings);
        
        // Set mute state
        const muted = loadedSettings.muted === true;
        setIsMuted(muted);
        if (setMuted) setMuted(muted);
        
        // Set volume
        const vol = Math.round((loadedSettings.volume || 0.8) * 100);
        setVolumeState(vol);
        if (setVolume) setVolume(loadedSettings.volume || 0.8);
        
        // Save to localStorage for backup
        localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(loadedSettings));
        
      } catch (error) {
        console.error('❌ Error loading sound settings:', error);
        // Use defaults on error
        setSettings({ ...DEFAULT_SETTINGS });
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [userId, setMuted, setVolume]);

  // ── Update a single setting ──
  const updateSetting = useCallback(async (key, value) => {
    if (!key) return;
    
    setIsSaving(true);
    
    try {
      // 1️⃣ Update local state
      const updatedSettings = { ...settings, [key]: value };
      setSettings(updatedSettings);
      
      // 2️⃣ Update localStorage
      localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(updatedSettings));
      
      // 3️⃣ Update Firestore
      if (userId) {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          [`soundSettings.${key}`]: value,
          updatedAt: serverTimestamp()
        });
        console.log(`✅ Sound setting "${key}" saved to Firestore`);
      }
      
      // 4️⃣ Apply side effects
      if (key === 'muted') {
        setIsMuted(value);
        if (setMuted) setMuted(value);
      }
      
      if (key === 'volume') {
        const vol = Math.round(value * 100);
        setVolumeState(vol);
        if (setVolume) setVolume(value);
      }
      
      if (key === 'enabled' && value === true) {
        // Unmute if enabling
        if (settings?.muted) {
          const newSettings = { ...updatedSettings, muted: false };
          setSettings(newSettings);
          setIsMuted(false);
          if (setMuted) setMuted(false);
          localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(newSettings));
          
          if (userId) {
            await updateDoc(doc(db, 'users', userId), {
              'soundSettings.muted': false,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
      
      return true;
      
    } catch (error) {
      console.error('❌ Error updating sound setting:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [settings, userId, setMuted, setVolume]);

  // ── Reset to default ──
  const resetToDefault = useCallback(async () => {
    setIsSaving(true);
    
    try {
      const defaultSettings = { ...DEFAULT_SETTINGS };
      
      // 1️⃣ Update local state
      setSettings(defaultSettings);
      
      // 2️⃣ Update localStorage
      localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(defaultSettings));
      
      // 3️⃣ Update Firestore
      if (userId) {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          soundSettings: defaultSettings,
          updatedAt: serverTimestamp()
        });
        console.log('✅ Sound settings reset to default in Firestore');
      }
      
      // 4️⃣ Apply side effects
      setIsMuted(false);
      if (setMuted) setMuted(false);
      
      const vol = Math.round(defaultSettings.volume * 100);
      setVolumeState(vol);
      if (setVolume) setVolume(defaultSettings.volume);
      
      // 5️⃣ Play test sound
      setTimeout(() => {
        soundEngine?.playEvent(SOUND_EVENTS.SUCCESS);
      }, 200);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error resetting sound settings:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [userId, setMuted, setVolume, soundEngine]);

  // ── Toggle mute ──
  const toggleMute = useCallback(async () => {
    const newMuted = !isMuted;
    await updateSetting('muted', newMuted);
    
    if (!newMuted && isReady && volume > 0) {
      setTimeout(() => {
        soundEngine?.playEvent(SOUND_EVENTS.NOTIFICATION);
      }, 100);
    }
  }, [isMuted, isReady, volume, soundEngine, updateSetting]);

  // ── Change volume ──
  const handleVolumeChange = useCallback((e) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      const volumeValue = val / 100;
      updateSetting('volume', volumeValue);
    }
  }, [updateSetting]);

  // ── Test sound ──
  const playTestSound = useCallback((soundType = 'notification') => {
    if (!isMuted && isReady && volume > 0) {
      const soundMap = {
        notification: SOUND_EVENTS.NOTIFICATION,
        success: SOUND_EVENTS.SUCCESS,
        warning: SOUND_EVENTS.WARNING,
        error: SOUND_EVENTS.ERROR,
        admin: SOUND_EVENTS.ADMIN_NOTIFICATION,
        chat: SOUND_EVENTS.CHAT_MESSAGE,
        wallet: SOUND_EVENTS.WALLET,
        offer: SOUND_EVENTS.OFFER,
        deal: SOUND_EVENTS.DEAL,
        click: SOUND_EVENTS.CLICK,
      };
      
      const event = soundMap[soundType] || SOUND_EVENTS.NOTIFICATION;
      soundEngine?.playEvent(event);
      
      if (import.meta.env.DEV) {
        console.log(`🔊 Test sound played: ${soundType}`);
      }
    }
  }, [isMuted, isReady, volume, soundEngine]);

  return {
    settings,
    isMuted,
    volume,
    isReady,
    isLoading,
    isSaving,
    toggleMute,
    handleVolumeChange,
    playTestSound,
    updateSetting,
    resetToDefault,
  };
};

// ============================================================
// ✅ Main Component
// ============================================================
const SoundSettings = ({ 
  variant = 'default',
  onSoundPlay = null,
  showAdminSounds = false,
}) => {
  const {
    isMuted,
    volume,
    isReady,
    isLoading,
    toggleMute,
    handleVolumeChange,
    playTestSound,
  } = useSoundSettings(auth.currentUser?.uid);
const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTestSound, setSelectedTestSound] = useState('notification');

  if (isLoading) {
    return (
      <div className={`${styles.soundSettings} ${styles[variant]}`}>
        <div className={styles.soundSettingsBody} style={{ padding: '16px', textAlign: 'center' }}>
          <span className={styles.loadingText}>Loading sound settings...</span>
        </div>
      </div>
    );
  }

  // ✅ Admin variant
  if (variant === 'admin') {
    return (
      <div className={`${styles.soundSettings} ${styles.adminSoundSettings}`}>
        <div className={styles.soundSettingsHeader} onClick={() => setIsExpanded(!isExpanded)}>
          <div className={styles.soundSettingsTitle}>
            <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
            <span>Sound Settings</span>
            {!isMuted && volume > 0 && (
              <span className={styles.soundIndicator}>
                <i className="fa-solid fa-circle-check"></i>
              </span>
            )}
          </div>
          <div className={styles.soundSettingsStatus}>
            <span className={`${styles.statusDot} ${isMuted ? styles.muted : styles.active}`}></span>
            <span className={styles.volumeText}>{volume}%</span>
            <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
          </div>
        </div>

        {isExpanded && (
          <div className={styles.soundSettingsBody}>
            {/* Mute Toggle */}
            <div className={styles.soundSettingItem}>
              <div className={styles.settingLabel}>
                <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
                <span className={styles.settingLabelText}>
                  {isMuted ? '🔇 Muted' : '🔊 Unmuted'}
                </span>
              </div>
              <button 
                className={`${styles.muteToggle} ${isMuted ? styles.muted : styles.active}`}
                onClick={toggleMute}
                title={isMuted ? 'Unmute sound' : 'Mute sound'}
              >
                {isMuted ? (
                  <>
                    <i className="fa-solid fa-volume-high"></i> Unmute
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-volume-xmark"></i> Mute
                  </>
                )}
              </button>
            </div>

            {/* Volume Slider */}
            <div className={styles.soundSettingItem}>
              <div className={styles.settingLabel}>
                <i className="fa-solid fa-volume-low"></i>
                <span className={styles.settingLabelText}>Volume: <strong>{volume}%</strong></span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className={styles.volumeSlider}
                disabled={isMuted}
                style={{
                  background: isMuted 
                    ? 'var(--bg-tertiary)' 
                    : `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${volume}%, var(--bg-tertiary) ${volume}%, var(--bg-tertiary) 100%)`
                }}
              />
            </div>

            {/* Test Sound */}
            <div className={`${styles.soundSettingItem} ${styles.testSoundItem}`}>
              <div className={styles.settingLabel}>
                <i className="fa-solid fa-play"></i>
                <span className={styles.settingLabelText}>Test Sound</span>
              </div>
              <div className={styles.testSoundControls}>
                <select 
                  value={selectedTestSound}
                  onChange={(e) => setSelectedTestSound(e.target.value)}
                  className={styles.testSoundSelect}
                  disabled={isMuted}
                >
                  <option value="notification">🔔 Notification</option>
                  <option value="success">✅ Success</option>
                  <option value="warning">⚠️ Warning</option>
                  <option value="error">❌ Error</option>
                  {showAdminSounds && (
                    <>
                      <option value="admin">📢 Admin</option>
                    </>
                  )}
                </select>
                <button 
                  className={styles.testSoundBtn}
                  onClick={() => {
                    playTestSound(selectedTestSound);
                    if (onSoundPlay) onSoundPlay(selectedTestSound);
                  }}
                  disabled={isMuted || volume === 0}
                  title={isMuted ? 'Sound is muted' : volume === 0 ? 'Volume is 0' : 'Play test sound'}
                >
                  <i className="fa-solid fa-play"></i>
                  <span>Play</span>
                </button>
              </div>
            </div>

            {/* Sound Status */}
            <div className={styles.soundStatusBar}>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>Status:</span>
                <span className={`${styles.statusValue} ${isMuted ? styles.muted : styles.active}`}>
                  {isMuted ? '🔇 Muted' : '🔊 Active'}
                </span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>Volume:</span>
                <span className={styles.statusValue}>{volume}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

 // ✅ Default variant
  return (
    <div className={`${styles.soundSettings} ${styles[variant]}`}>
      {isExpanded && (
        <div className={styles.soundSettingsBody}>
          {/* Mute Toggle */}
          <div className={styles.soundSettingItem}>
            <div className={styles.settingLabel}>
              <i className={`fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}`}></i>
              <span>{isMuted ? 'Muted' : 'Unmuted'}</span>
            </div>
            <button 
              className={`${styles.muteToggle} ${isMuted ? styles.muted : styles.active}`}
              onClick={toggleMute}
            >
              {isMuted ? '🔇 Unmute' : '🔊 Mute'}
            </button>
          </div>

          {/* Volume Slider */}
          <div className={styles.soundSettingItem}>
            <div className={styles.settingLabel}>
              <i className="fa-solid fa-volume-low"></i>
              <span>Volume: {volume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className={styles.volumeSlider}
              disabled={isMuted}
            />
          </div>

          {/* Test Sound */}
          <div className={styles.soundSettingItem}>
            <button 
              className={styles.testSoundBtn}
              onClick={() => playTestSound('notification')}
              disabled={isMuted}
            >
              <i className="fa-solid fa-play"></i>
              Test Sound
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoundSettings;