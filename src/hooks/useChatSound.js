// src/hooks/useChatSound.js
/**
 * 🎵 Chat Sound Integration
 * 
 * Handles all chat-related sound effects with deduplication logic
 * - Incoming messages (not own)
 * - Images
 * - Proposals
 * - Deal events
 * - User actions
 */

import { useCallback, useRef, useEffect } from 'react';
import { useSound } from '@/UI/Sound';

// ============================================================
// 🎵 Chat Sound Constants
// ============================================================
export const CHAT_SOUNDS = {
  MESSAGE: 'MESSAGE',
  IMAGE: 'MESSAGE',
  PROPOSAL: 'OFFER',
  PROPOSAL_ACCEPTED: 'SUCCESS',
  PROPOSAL_REJECTED: 'WARNING',
  DEAL_START: 'DEAL',
  USER_BLOCKED: 'WARNING',
  USER_UNBLOCKED: 'SUCCESS',
  MESSAGE_EDITED: 'CLICK',
  MESSAGE_DELETED: 'CLICK',
};

// ============================================================
// 🎵 Chat Sound Volumes
// ============================================================
export const CHAT_VOLUMES = {
  [CHAT_SOUNDS.MESSAGE]: 0.5,
  [CHAT_SOUNDS.IMAGE]: 0.4,
  [CHAT_SOUNDS.PROPOSAL]: 0.6,
  [CHAT_SOUNDS.PROPOSAL_ACCEPTED]: 0.7,
  [CHAT_SOUNDS.PROPOSAL_REJECTED]: 0.5,
  [CHAT_SOUNDS.DEAL_START]: 0.7,
  [CHAT_SOUNDS.USER_BLOCKED]: 0.4,
  [CHAT_SOUNDS.USER_UNBLOCKED]: 0.5,
  [CHAT_SOUNDS.MESSAGE_EDITED]: 0.2,
  [CHAT_SOUNDS.MESSAGE_DELETED]: 0.2,
};

// ============================================================
// 🎵 Chat Sound Hook
// ============================================================
export const useChatSound = () => {
  const { play, isPlaying } = useSound();
  
  // ✅ Track last played messages to prevent duplicates
  const playedMessagesRef = useRef(new Set());
  const lastPlayedRef = useRef({
    message: 0,
    image: 0,
    proposal: 0,
    deal: 0,
  });
  
  // ✅ Debounce timer refs
  const debounceTimersRef = useRef({
    message: null,
    image: null,
    proposal: null,
    deal: null,
  });
  
  // ============================================================
  // ✅ Deduplication Helpers
  // ============================================================
  
  /**
   * Check if a message has already been played
   */
  const hasMessageBeenPlayed = useCallback((messageId, type = 'message') => {
    const key = `${type}-${messageId}`;
    return playedMessagesRef.current.has(key);
  }, []);
  
  /**
   * Mark a message as played
   */
  const markMessageAsPlayed = useCallback((messageId, type = 'message') => {
    const key = `${type}-${messageId}`;
    playedMessagesRef.current.add(key);
    
    // ✅ Cleanup after 10 seconds (reconnect protection)
    setTimeout(() => {
      playedMessagesRef.current.delete(key);
    }, 10000);
  }, []);
  
  /**
   * Check if enough time has passed since last play
   */
  const isDebounced = useCallback((type, minInterval = 500) => {
    const now = Date.now();
    const last = lastPlayedRef.current[type] || 0;
    const diff = now - last;
    
    if (diff < minInterval) {
      return true; // ✅ Too soon, debounce
    }
    
    lastPlayedRef.current[type] = now;
    return false; // ✅ OK to play
  }, []);
  
  /**
   * Clear debounce timer
   */
  const clearDebounceTimer = useCallback((type) => {
    if (debounceTimersRef.current[type]) {
      clearTimeout(debounceTimersRef.current[type]);
      debounceTimersRef.current[type] = null;
    }
  }, []);
  
  // ============================================================
  // ✅ Play Chat Sound
  // ============================================================
  const playChatSound = useCallback((
    soundName,
    options = {}
  ) => {
    const {
      messageId = null,
      type = 'message',
      volume = 0.5,
      minInterval = 500,
      force = false,
      debounce = true,
    } = options;
    
    // ✅ Check if this message was already played
    if (messageId && hasMessageBeenPlayed(messageId, type)) {
      console.log(`🎵 Sound already played for ${type}: ${messageId}`);
      return;
    }
    
    // ✅ Check debounce
    if (debounce && isDebounced(type, minInterval)) {
      console.log(`🎵 Sound debounced for ${type}`);
      return;
    }
    
    // ✅ Play the sound
    try {
      // Clear any existing timer for this type
      clearDebounceTimer(type);
      
      // Play with volume
      play(soundName, {
        volume: CHAT_VOLUMES[soundName] || volume,
        ...options,
      });
      
      // ✅ Mark as played
      if (messageId) {
        markMessageAsPlayed(messageId, type);
      }
      
      console.log(`🎵 Played chat sound: ${soundName} (${type})`);
      
      // ✅ Set debounce timer
      debounceTimersRef.current[type] = setTimeout(() => {
        debounceTimersRef.current[type] = null;
      }, minInterval);
      
    } catch (error) {
      console.warn(`🎵 Error playing chat sound: ${soundName}`, error);
    }
  }, [
    hasMessageBeenPlayed,
    isDebounced,
    markMessageAsPlayed,
    clearDebounceTimer,
    play,
  ]);
  
  // ============================================================
  // ✅ Specific Chat Event Sounds
  // ============================================================
  
  /**
   * Play incoming message sound
   * ✅ Only for messages from other users
   */
  const playIncomingMessage = useCallback((messageId, senderId, currentUserId, options = {}) => {
    // ❌ Don't play if it's the user's own message
    if (senderId === currentUserId) {
      console.log('🎵 Skipping own message sound');
      return;
    }
    
    playChatSound(CHAT_SOUNDS.MESSAGE, {
      messageId,
      type: 'message',
      minInterval: 300,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play incoming image sound
   */
  const playIncomingImage = useCallback((messageId, senderId, currentUserId, options = {}) => {
    if (senderId === currentUserId) {
      console.log('🎵 Skipping own image sound');
      return;
    }
    
    playChatSound(CHAT_SOUNDS.IMAGE, {
      messageId,
      type: 'image',
      minInterval: 500,
      volume: 0.4,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play proposal received sound
   */
  const playProposalReceived = useCallback((proposalId, options = {}) => {
    playChatSound(CHAT_SOUNDS.PROPOSAL, {
      messageId: proposalId,
      type: 'proposal',
      minInterval: 1000,
      volume: 0.6,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play proposal accepted sound
   */
  const playProposalAccepted = useCallback((proposalId, options = {}) => {
    playChatSound(CHAT_SOUNDS.PROPOSAL_ACCEPTED, {
      messageId: proposalId,
      type: 'proposal_accept',
      minInterval: 500,
      volume: 0.7,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play proposal rejected sound
   */
  const playProposalRejected = useCallback((proposalId, options = {}) => {
    playChatSound(CHAT_SOUNDS.PROPOSAL_REJECTED, {
      messageId: proposalId,
      type: 'proposal_reject',
      minInterval: 500,
      volume: 0.5,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play deal started sound
   */
  const playDealStarted = useCallback((dealId, options = {}) => {
    playChatSound(CHAT_SOUNDS.DEAL_START, {
      messageId: dealId,
      type: 'deal',
      minInterval: 1000,
      volume: 0.7,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play user blocked sound
   */
  const playUserBlocked = useCallback((userId, options = {}) => {
    playChatSound(CHAT_SOUNDS.USER_BLOCKED, {
      type: 'user_blocked',
      minInterval: 500,
      volume: 0.4,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play user unblocked sound
   */
  const playUserUnblocked = useCallback((userId, options = {}) => {
    playChatSound(CHAT_SOUNDS.USER_UNBLOCKED, {
      type: 'user_unblocked',
      minInterval: 500,
      volume: 0.5,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play message edited sound (optional)
   */
  const playMessageEdited = useCallback((messageId, options = {}) => {
    playChatSound(CHAT_SOUNDS.MESSAGE_EDITED, {
      messageId,
      type: 'message_edit',
      minInterval: 300,
      volume: 0.2,
      ...options,
    });
  }, [playChatSound]);
  
  /**
   * Play message deleted sound (optional)
   */
  const playMessageDeleted = useCallback((messageId, options = {}) => {
    playChatSound(CHAT_SOUNDS.MESSAGE_DELETED, {
      messageId,
      type: 'message_delete',
      minInterval: 300,
      volume: 0.2,
      ...options,
    });
  }, [playChatSound]);
  
  // ============================================================
  // ✅ Cleanup
  // ============================================================
  useEffect(() => {
    return () => {
      // Clear all debounce timers
      Object.keys(debounceTimersRef.current).forEach((key) => {
        if (debounceTimersRef.current[key]) {
          clearTimeout(debounceTimersRef.current[key]);
          debounceTimersRef.current[key] = null;
        }
      });
      
      // Clear played messages
      playedMessagesRef.current.clear();
    };
  }, []);
  
  // ============================================================
  // ✅ Return
  // ============================================================
  return {
    // Core
    playChatSound,
    
    // Incoming
    playIncomingMessage,
    playIncomingImage,
    
    // Proposals
    playProposalReceived,
    playProposalAccepted,
    playProposalRejected,
    
    // Deal
    playDealStarted,
    
    // User actions
    playUserBlocked,
    playUserUnblocked,
    
    // Optional
    playMessageEdited,
    playMessageDeleted,
    
    // Status
    isPlaying,
    hasMessageBeenPlayed,
  };
};

export default useChatSound;