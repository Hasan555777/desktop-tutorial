// src/UI/Sound/SoundEngine.js

import { SOUND_EVENTS } from './SoundEvents';

class SoundEngine {
  constructor() {
    this.audioContext = null;
    this.sounds = {};
    this.isInitialized = false;
    this.isMuted = false;
    this.volume = 0.8;
    this._isPlaying = false;
    this.isPreloading = false;
    this._pendingSounds = new Map();
    this._initPromise = null;
  }

  // ✅ Initialize with promise support
  init() {
    if (this.isInitialized) return Promise.resolve(true);
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise((resolve) => {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.isInitialized = true;
        if (import.meta.env.DEV) {
          console.log('🎵 SoundEngine initialized');
        }
        resolve(true);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('⚠️ AudioContext not supported:', error);
        }
        resolve(false);
      }
    });

    return this._initPromise;
  }

  // ✅ Resume with error handling
  resume() {
    try {
      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume();
        if (import.meta.env.DEV) {
          console.log('🎵 AudioContext resumed');
        }
        return true;
      }
      return false;
    } catch (error) {
      console.warn('⚠️ Error resuming AudioContext:', error);
      return false;
    }
  }

  // ✅ Load sound with caching and error handling
  async loadSound(name, url) {
    try {
      // Skip if already loaded
      if (this.sounds[name]) {
        if (import.meta.env.DEV) {
          console.log(`✅ Sound already loaded: ${name}`);
        }
        return true;
      }

      // Check if already pending
      if (this._pendingSounds.has(name)) {
        return this._pendingSounds.get(name);
      }

      // Create load promise
      const loadPromise = (async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.sounds[name] = audioBuffer;
        if (import.meta.env.DEV) {
          console.log(`✅ Sound loaded: ${name}`);
        }
        return true;
      })();

      this._pendingSounds.set(name, loadPromise);
      const result = await loadPromise;
      this._pendingSounds.delete(name);
      return result;

    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`⚠️ Failed to load sound: ${name}`, error);
      }
      this._pendingSounds.delete(name);
      return false;
    }
  }

  // ✅ Play sound with safety checks
  play(name, volume = this.volume) {
    // Safety checks
    if (this.isMuted) {
      if (import.meta.env.DEV) {
        console.log(`🔇 Muted, skipping: ${name}`);
      }
      return;
    }

    if (!this.isInitialized) {
      this.init();
    }

    if (!this.audioContext) {
      if (import.meta.env.DEV) {
        console.warn(`⚠️ No AudioContext available`);
      }
      return;
    }

    // Resume if suspended
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const buffer = this.sounds[name];
    if (!buffer) {
      if (import.meta.env.DEV) {
        console.warn(`⚠️ Sound not found: ${name}`);
      }
      return;
    }

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      source.start(0);
      if (import.meta.env.DEV) {
        console.log(`🔊 Playing sound: ${name}`);
      }

      source.onended = () => {
        source.disconnect();
        gainNode.disconnect();
      };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`⚠️ Error playing sound: ${name}`, error);
      }
    }
  }

  // ✅ MAIN: playEvent with auto-resume and fallback
  playEvent(eventName) {
    if (import.meta.env.DEV) {
      console.log(`🔊 SoundEngine.playEvent: ${eventName}`);
    }
    
    if (this.isMuted) {
      if (import.meta.env.DEV) {
        console.log(`🔇 Muted, skipping: ${eventName}`);
      }
      return;
    }

    // Ensure audio context is ready
    if (!this.isInitialized) {
      this.init();
    }

    // Resume if suspended
    if (this.audioContext?.state === 'suspended') {
      try {
        this.audioContext.resume();
      } catch (error) {
        console.warn('⚠️ Error resuming AudioContext:', error);
      }
    }

    // Sound mapping
    const soundMap = {
      // ── Chat Events ──
      [SOUND_EVENTS.CHAT_MESSAGE]: 'chat-message',
      [SOUND_EVENTS.CHAT_IMAGE]: 'chat-image',
      [SOUND_EVENTS.CHAT_PROPOSAL]: 'offer',

      // ── Deal Events ──
      [SOUND_EVENTS.DEAL_CREATED]: 'deal',
      [SOUND_EVENTS.DEAL_APPROVED]: 'success',
      [SOUND_EVENTS.DEAL_REJECTED]: 'warning',
      [SOUND_EVENTS.DEAL_REOPENED]: 'notification',
      [SOUND_EVENTS.DEAL_COMPLETED]: 'success',
      [SOUND_EVENTS.DEAL_CONFIRMED]: 'success',
      [SOUND_EVENTS.DEAL_CANCELLED]: 'warning',
      [SOUND_EVENTS.DEAL_EXTENDED]: 'notification',
      [SOUND_EVENTS.DEAL_DEADLINE_PASSED]: 'warning',

      // ── Notification Events ──
      [SOUND_EVENTS.NOTIFICATION]: 'notification',
      [SOUND_EVENTS.SUCCESS]: 'success',
      [SOUND_EVENTS.WARNING]: 'warning',
      [SOUND_EVENTS.ERROR]: 'error',

      // ── Wallet Events ──
      [SOUND_EVENTS.WALLET]: 'wallet',
      [SOUND_EVENTS.DEPOSIT]: 'wallet',
      [SOUND_EVENTS.WITHDRAW]: 'wallet',
      [SOUND_EVENTS.DEPOSIT_APPROVED]: 'success',
      [SOUND_EVENTS.DEPOSIT_REJECTED]: 'error',
      [SOUND_EVENTS.WITHDRAW_APPROVED]: 'success',
      [SOUND_EVENTS.WITHDRAW_REJECTED]: 'error',

      // ── Admin Events ──
      [SOUND_EVENTS.ADMIN_ANNOUNCEMENT]: 'admin-announcement',
      [SOUND_EVENTS.ADMIN_NOTIFICATION]: 'admin-notification',
      [SOUND_EVENTS.USER_VERIFIED]: 'success',
      [SOUND_EVENTS.USER_BLOCKED]: 'warning',
      [SOUND_EVENTS.POST_APPROVED]: 'success',
      [SOUND_EVENTS.POST_REJECTED]: 'error',
      [SOUND_EVENTS.REPORT_RESOLVED]: 'success',
      [SOUND_EVENTS.REPORT_CANCELLED]: 'warning',
      [SOUND_EVENTS.SYSTEM_ERROR]: 'error',
      [SOUND_EVENTS.SYSTEM_WARNING]: 'warning',

      // ── UI Events ──
      [SOUND_EVENTS.CLICK]: 'click',
      [SOUND_EVENTS.OFFER]: 'offer',
      [SOUND_EVENTS.DEAL]: 'deal',

      // ── Page Events ──
      [SOUND_EVENTS.PAGE_LOAD]: 'notification',
      [SOUND_EVENTS.PAGE_LEAVE]: 'notification',
    };

    const soundName = soundMap[eventName];
    if (!soundName) {
      if (import.meta.env.DEV) {
        console.warn(`⚠️ No sound mapping for: ${eventName}`);
      }
      return;
    }

    // If sound loaded, play it
    if (this.sounds[soundName]) {
      this.play(soundName);
      return;
    }

    // Otherwise load and play
    const urlMap = {
      'chat-message': '/sounds/chat-message.mp3',
      'chat-image': '/sounds/chat-image.mp3',
      'notification': '/sounds/notification.mp3',
      'success': '/sounds/success.mp3',
      'warning': '/sounds/warning.mp3',
      'error': '/sounds/error.mp3',
      'wallet': '/sounds/wallet.mp3',
      'click': '/sounds/click.mp3',
      'offer': '/sounds/offer.mp3',
      'deal': '/sounds/deal.mp3',
      'admin-announcement': '/sounds/admin-announcement.mp3',
      'admin-notification': '/sounds/admin-notification.mp3',
    };
    
    const url = urlMap[soundName];
    if (url) {
      this.loadSound(soundName, url).then(() => {
        if (!this.isMuted) {
          this.play(soundName);
        }
      });
    } else {
      // ✅ Fallback to notification sound
      if (import.meta.env.DEV) {
        console.log(`🔊 Fallback to notification sound for: ${eventName}`);
      }
      this.loadSound('notification', '/sounds/notification.mp3').then(() => {
        if (!this.isMuted) {
          this.play('notification');
        }
      });
    }
  }

  // ✅ Preload all sounds
  preloadAll() {
    if (this.isPreloading) return;
    this.isPreloading = true;

    const sounds = [
      { name: 'chat-message', url: '/sounds/chat-message.mp3' },
      { name: 'chat-image', url: '/sounds/chat-image.mp3' },
      { name: 'notification', url: '/sounds/notification.mp3' },
      { name: 'success', url: '/sounds/success.mp3' },
      { name: 'warning', url: '/sounds/warning.mp3' },
      { name: 'error', url: '/sounds/error.mp3' },
      { name: 'wallet', url: '/sounds/wallet.mp3' },
      { name: 'click', url: '/sounds/click.mp3' },
      { name: 'offer', url: '/sounds/offer.mp3' },
      { name: 'deal', url: '/sounds/deal.mp3' },
      { name: 'admin-announcement', url: '/sounds/admin-announcement.mp3' },
      { name: 'admin-notification', url: '/sounds/admin-notification.mp3' },
    ];

    sounds.forEach(({ name, url }) => {
      this.loadSound(name, url);
    });
  }

  // ✅ Stop all sounds
  stopAll() {
    if (this.audioContext) {
      try {
        this.audioContext.close();
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.isInitialized = true;
        if (import.meta.env.DEV) {
          console.log('🎵 All sounds stopped');
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('⚠️ Error stopping sounds:', error);
        }
      }
    }
  }

  // ✅ Get current state
  getState() {
    return {
      isInitialized: this.isInitialized,
      isMuted: this.isMuted,
      volume: this.volume,
      isPreloading: this.isPreloading,
      audioContextState: this.audioContext?.state || 'none',
      loadedSounds: Object.keys(this.sounds),
      pendingSounds: Array.from(this._pendingSounds.keys()),
    };
  }

  // ✅ Check if sound is loaded
  isSoundLoaded(name) {
    return !!this.sounds[name];
  }

  // ✅ Set mute
  setMuted(muted) { 
    this.isMuted = muted; 
    if (import.meta.env.DEV) {
      console.log(`🔇 Sound ${muted ? 'muted' : 'unmuted'}`);
    }
  }
  
  // ✅ Set volume
  setVolume(volume) { 
    this.volume = Math.max(0, Math.min(1, volume));
    if (import.meta.env.DEV) {
      console.log(`🔊 Volume set to: ${Math.round(this.volume * 100)}%`);
    }
  }
  
  // ✅ Destroy
  destroy() {
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (error) {
        // Ignore
      }
      this.audioContext = null;
      this.isInitialized = false;
      this.sounds = {};
      this.isPreloading = false;
      this._pendingSounds.clear();
      this._initPromise = null;
      if (import.meta.env.DEV) {
        console.log('🎵 SoundEngine destroyed');
      }
    }
  }
}

// ✅ Export single instance
export default new SoundEngine();