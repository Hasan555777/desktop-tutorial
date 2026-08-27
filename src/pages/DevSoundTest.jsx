// src/pages/DevSoundTest.jsx
/**
 * 🎵 Developer Sound Test Page
 * 
 * Use this page to test all sounds without needing to trigger
 * actual events in the app. This helps isolate sound issues.
 * 
 * How to access: Navigate to /dev-sound-test
 * 
 * ✅ All sounds should play when clicking buttons
 * ❌ No business logic, just sound testing
 */

import React, { useState } from 'react';
import { useSound } from '@/UI/Sound';
import { SOUND_EVENTS } from '@/UI/Sound/SoundEvents';
import './DevSoundTest.css';

const DevSoundTest = () => {
  const sound = useSound();
  const [lastPlayed, setLastPlayed] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Test Sound Function ──
  const testSound = (eventName, label) => {
    console.log(`🎵 Testing: ${label} (${eventName})`);
    setLastPlayed({ event: eventName, label, time: new Date().toLocaleTimeString() });
    
    try {
      sound.playEvent(eventName);
    } catch (error) {
      console.error(`❌ Failed to play ${label}:`, error);
      setLastPlayed(prev => ({ ...prev, error: error.message }));
    }
  };

  // ── Test All Sounds ──
  const testAllSounds = async () => {
    setIsLoading(true);
    const events = [
      { event: SOUND_EVENTS.NOTIFICATION, label: '🔔 Notification' },
      { event: SOUND_EVENTS.CHAT_MESSAGE, label: '💬 Chat Message' },
      { event: SOUND_EVENTS.CHAT_IMAGE, label: '🖼️ Chat Image' },
      { event: SOUND_EVENTS.SUCCESS, label: '✅ Success' },
      { event: SOUND_EVENTS.ERROR, label: '❌ Error' },
      { event: SOUND_EVENTS.WARNING, label: '⚠️ Warning' },
      { event: SOUND_EVENTS.OFFER, label: '📄 Offer' },
      { event: SOUND_EVENTS.DEAL, label: '🤝 Deal' },
      { event: SOUND_EVENTS.WALLET, label: '💰 Wallet' },
      { event: SOUND_EVENTS.CLICK, label: '🖱️ Click' },
      { event: SOUND_EVENTS.POPUP, label: '📱 Popup' },
    ];

    for (const { event, label } of events) {
      await new Promise(resolve => {
        sound.playEvent(event);
        setLastPlayed({ event, label, time: new Date().toLocaleTimeString() });
        setTimeout(resolve, 600); // 600ms gap between sounds
      });
    }

    setIsLoading(false);
    setLastPlayed(prev => ({ ...prev, allDone: true }));
  };

  return (
    <div className="dev-sound-test">
      <div className="test-container">
        <h1>🎵 Sound Test Page</h1>
        <p className="subtitle">Test all sounds without triggering real events</p>

        {/* ── Status ── */}
        <div className="status-bar">
          <span className="status-dot">●</span>
          <span className="status-text">
            {sound.isReady ? '✅ Sound Ready' : '⏳ Loading...'}
          </span>
          <span className="status-volume">
            Volume: {Math.round(sound.volume * 100)}%
          </span>
        </div>

        {/* ── Last Played ── */}
        {lastPlayed && (
          <div className="last-played">
            <span className="last-label">▶️ Last played:</span>
            <span className="last-event">{lastPlayed.label}</span>
            <span className="last-time">{lastPlayed.time}</span>
            {lastPlayed.error && (
              <span className="last-error">❌ {lastPlayed.error}</span>
            )}
            {lastPlayed.allDone && (
              <span className="last-success">✅ All sounds tested!</span>
            )}
          </div>
        )}

        {/* ── Sound Grid ── */}
        <div className="sound-grid">
          <button 
            className="sound-btn notification"
            onClick={() => testSound(SOUND_EVENTS.NOTIFICATION, '🔔 Notification')}
          >
            <span className="icon">🔔</span>
            <span className="label">Notification</span>
            <span className="file">notification.mp3</span>
          </button>

          <button 
            className="sound-btn chat-message"
            onClick={() => testSound(SOUND_EVENTS.CHAT_MESSAGE, '💬 Chat Message')}
          >
            <span className="icon">💬</span>
            <span className="label">Chat Message</span>
            <span className="file">chat-message.mp3</span>
          </button>

          <button 
            className="sound-btn chat-image"
            onClick={() => testSound(SOUND_EVENTS.CHAT_IMAGE, '🖼️ Chat Image')}
          >
            <span className="icon">🖼️</span>
            <span className="label">Chat Image</span>
            <span className="file">chat-image.mp3</span>
          </button>

          <button 
            className="sound-btn success"
            onClick={() => testSound(SOUND_EVENTS.SUCCESS, '✅ Success')}
          >
            <span className="icon">✅</span>
            <span className="label">Success</span>
            <span className="file">success.mp3</span>
          </button>

          <button 
            className="sound-btn error"
            onClick={() => testSound(SOUND_EVENTS.ERROR, '❌ Error')}
          >
            <span className="icon">❌</span>
            <span className="label">Error</span>
            <span className="file">error.mp3</span>
          </button>

          <button 
            className="sound-btn warning"
            onClick={() => testSound(SOUND_EVENTS.WARNING, '⚠️ Warning')}
          >
            <span className="icon">⚠️</span>
            <span className="label">Warning</span>
            <span className="file">warning.mp3</span>
          </button>

          <button 
            className="sound-btn offer"
            onClick={() => testSound(SOUND_EVENTS.OFFER, '📄 Offer')}
          >
            <span className="icon">📄</span>
            <span className="label">Offer</span>
            <span className="file">offer.mp3</span>
          </button>

          <button 
            className="sound-btn deal"
            onClick={() => testSound(SOUND_EVENTS.DEAL, '🤝 Deal')}
          >
            <span className="icon">🤝</span>
            <span className="label">Deal</span>
            <span className="file">deal.mp3</span>
          </button>

          <button 
            className="sound-btn wallet"
            onClick={() => testSound(SOUND_EVENTS.WALLET, '💰 Wallet')}
          >
            <span className="icon">💰</span>
            <span className="label">Wallet</span>
            <span className="file">wallet.mp3</span>
          </button>

          <button 
            className="sound-btn click"
            onClick={() => testSound(SOUND_EVENTS.CLICK, '🖱️ Click')}
          >
            <span className="icon">🖱️</span>
            <span className="label">Click</span>
            <span className="file">click.mp3</span>
          </button>

          <button 
            className="sound-btn popup"
            onClick={() => testSound(SOUND_EVENTS.POPUP, '📱 Popup')}
          >
            <span className="icon">📱</span>
            <span className="label">Popup</span>
            <span className="file">popup.mp3</span>
          </button>

          <button 
            className="sound-btn install"
            onClick={() => testSound(SOUND_EVENTS.INSTALL, '📲 Install')}
          >
            <span className="icon">📲</span>
            <span className="label">Install</span>
            <span className="file">install.mp3</span>
          </button>
        </div>

        {/* ── Actions ── */}
        <div className="test-actions">
          <button 
            className="btn-test-all"
            onClick={testAllSounds}
            disabled={isLoading || !sound.isReady}
          >
            {isLoading ? '⏳ Testing...' : '🔊 Test All Sounds'}
          </button>
          <button 
            className="btn-stop"
            onClick={() => sound.stopAll()}
          >
            ⏹ Stop All
          </button>
        </div>

        {/* ── Info ── */}
        <div className="test-info">
          <details>
            <summary>ℹ️ How to test</summary>
            <ul>
              <li>Click any button to play the corresponding sound</li>
              <li>Check your speakers/headphones</li>
              <li>Browser console shows which sound is playing</li>
              <li>If no sound plays, check file paths in <code>public/sounds/</code></li>
              <li>Make sure MP3 files exist in <code>public/sounds/</code> folder</li>
            </ul>
          </details>
        </div>

        {/* ── File Check ── */}
        <div className="file-check">
          <h4>📁 Sound Files Check</h4>
          <div className="file-list">
            {[
              'chat-message.mp3',
              'chat-image.mp3',
              'notification.mp3',
              'success.mp3',
              'error.mp3',
              'warning.mp3',
              'offer.mp3',
              'deal.mp3',
              'wallet.mp3',
              'click.mp3',
              'popup.mp3',
              'install.mp3',
            ].map((file) => (
              <div key={file} className="file-item">
                <span className="file-icon">📄</span>
                <span className="file-name">{file}</span>
                <span className="file-status">✅</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevSoundTest;