// src/UI/Sound/SoundIntegration.js

import soundEngine from './SoundEngine';
import { SOUND_EVENTS } from './SoundEvents';

/**
 * 🎵 Create Sound Integration for Feedback System
 */
export const createSoundIntegration = (options = {}) => {
  // ✅ Sound Map - Admin টাইপ সহ
  const soundMap = {
    // ── Basic Types ──
    success: SOUND_EVENTS.SUCCESS,
    error: SOUND_EVENTS.ERROR,
    warning: SOUND_EVENTS.WARNING,
    info: SOUND_EVENTS.NOTIFICATION,
    confirm: SOUND_EVENTS.CLICK,
    delete: SOUND_EVENTS.WARNING,
    
    // ── Admin Types ── ✅ নতুন
    admin_announcement: SOUND_EVENTS.ADMIN_ANNOUNCEMENT,
    admin_notification: SOUND_EVENTS.ADMIN_NOTIFICATION,
    user_verified: SOUND_EVENTS.SUCCESS,
    user_blocked: SOUND_EVENTS.WARNING,
    user_unblocked: SOUND_EVENTS.SUCCESS,
    post_approved: SOUND_EVENTS.SUCCESS,
    post_rejected: SOUND_EVENTS.ERROR,
    deposit_approved: SOUND_EVENTS.SUCCESS,
    deposit_rejected: SOUND_EVENTS.ERROR,
    withdraw_approved: SOUND_EVENTS.SUCCESS,
    withdraw_rejected: SOUND_EVENTS.ERROR,
    report_resolved: SOUND_EVENTS.SUCCESS,
    report_cancelled: SOUND_EVENTS.WARNING,
    
    // ── Deal Types ──
    deal_created: SOUND_EVENTS.DEAL_CREATED,
    deal_confirmed: SOUND_EVENTS.SUCCESS,
    deal_approved: SOUND_EVENTS.SUCCESS,
    deal_rejected: SOUND_EVENTS.WARNING,
    deal_completed: SOUND_EVENTS.SUCCESS,
    deal_cancelled: SOUND_EVENTS.WARNING,
    
    // ── Wallet Types ──
    wallet: SOUND_EVENTS.WALLET,
    deposit: SOUND_EVENTS.WALLET,
    withdraw: SOUND_EVENTS.WALLET,
    
    // ── Chat Types ──
    chat_message: SOUND_EVENTS.CHAT_MESSAGE,
    chat_image: SOUND_EVENTS.CHAT_IMAGE,
    chat_proposal: SOUND_EVENTS.CHAT_PROPOSAL,
    
    // ── UI Types ──
    click: SOUND_EVENTS.CLICK,
    offer: SOUND_EVENTS.OFFER,
    deal: SOUND_EVENTS.DEAL,
  };

  return {
    isEnabled: options.enabled !== false,

    /**
     * Play sound by type
     */
    play(type, extraOptions = {}) {
      if (!this.isEnabled) return;
      
      const soundEvent = soundMap[type] || SOUND_EVENTS.NOTIFICATION;
      
      // ✅ Check if sound is muted
      const isMuted = localStorage.getItem('sound_muted') === 'true';
      if (isMuted) return;

      // ✅ Check volume
      const volume = parseInt(localStorage.getItem('sound_volume') || '80');
      if (volume === 0) return;

      if (import.meta.env.DEV) {
        console.log(`🔊 Playing sound: ${type} -> ${soundEvent}`);
      }

      soundEngine.playEvent(soundEvent);
    },

    /**
     * Enable/Disable sound
     */
    setEnabled(enabled) {
      this.isEnabled = enabled;
      localStorage.setItem('sound_enabled', enabled ? 'true' : 'false');
      if (import.meta.env.DEV) {
        console.log(`🔊 Sound ${enabled ? 'enabled' : 'disabled'}`);
      }
    },

    /**
     * Mute/Unmute sound
     */
    setMuted(muted) {
      localStorage.setItem('sound_muted', muted ? 'true' : 'false');
      soundEngine.setMuted(muted);
      if (import.meta.env.DEV) {
        console.log(`🔇 Sound ${muted ? 'muted' : 'unmuted'}`);
      }
    },

    /**
     * Set volume (0-100)
     */
    setVolume(volume) {
      const normalized = Math.max(0, Math.min(100, volume));
      localStorage.setItem('sound_volume', normalized.toString());
      soundEngine.setVolume(normalized / 100);
      if (import.meta.env.DEV) {
        console.log(`🔊 Volume set to: ${normalized}%`);
      }
    },

    /**
     * Get current settings
     */
    getSettings() {
      return {
        enabled: this.isEnabled,
        muted: localStorage.getItem('sound_muted') === 'true',
        volume: parseInt(localStorage.getItem('sound_volume') || '80'),
      };
    },

    // ── Shortcut Methods ──

    // Basic
    success() {
      this.play('success');
    },
    error() {
      this.play('error');
    },
    warning() {
      this.play('warning');
    },
    info() {
      this.play('info');
    },
    click() {
      this.play('click');
    },

    // ── Admin Shortcuts ── ✅ নতুন
    adminAnnouncement() {
      this.play('admin_announcement');
    },
    adminNotification() {
      this.play('admin_notification');
    },
    userVerified() {
      this.play('user_verified');
    },
    userBlocked() {
      this.play('user_blocked');
    },
    userUnblocked() {
      this.play('user_unblocked');
    },
    postApproved() {
      this.play('post_approved');
    },
    postRejected() {
      this.play('post_rejected');
    },
    depositApproved() {
      this.play('deposit_approved');
    },
    depositRejected() {
      this.play('deposit_rejected');
    },
    withdrawApproved() {
      this.play('withdraw_approved');
    },
    withdrawRejected() {
      this.play('withdraw_rejected');
    },
    reportResolved() {
      this.play('report_resolved');
    },
    reportCancelled() {
      this.play('report_cancelled');
    },

    // ── Deal Shortcuts ──
    dealCreated() {
      this.play('deal_created');
    },
    dealConfirmed() {
      this.play('deal_confirmed');
    },
    dealApproved() {
      this.play('deal_approved');
    },
    dealRejected() {
      this.play('deal_rejected');
    },
    dealCompleted() {
      this.play('deal_completed');
    },
    dealCancelled() {
      this.play('deal_cancelled');
    },

    // ── Wallet Shortcuts ──
    wallet() {
      this.play('wallet');
    },
    deposit() {
      this.play('deposit');
    },
    withdraw() {
      this.play('withdraw');
    },

    // ── Chat Shortcuts ──
    chatMessage() {
      this.play('chat_message');
    },
    chatImage() {
      this.play('chat_image');
    },
    chatProposal() {
      this.play('chat_proposal');
    },
  };
};

// ✅ Default export for backward compatibility
export default createSoundIntegration();

// ============================================================
// 🎯 Pre-configured instance with default settings
// ============================================================
export const soundIntegration = createSoundIntegration({
  enabled: true,
});