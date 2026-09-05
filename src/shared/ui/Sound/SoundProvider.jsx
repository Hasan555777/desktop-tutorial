// src/UI/Sound/SoundProvider.jsx

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import soundEngine from './SoundEngine';
import { SOUND_EVENTS } from './SoundEvents';

const SoundContext = createContext(null);

export const SoundProvider = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const isInitialized = useRef(false);
  const resumeAttempts = useRef(0);
  const maxResumeAttempts = 3;

  // ✅ Resume audio context with retry
  const resumeAudio = useCallback(() => {
    try {
      if (soundEngine.audioContext?.state === 'suspended') {
        soundEngine.audioContext.resume();
        if (import.meta.env.DEV) {
          console.log('🎵 AudioContext resumed');
        }
        resumeAttempts.current = 0;
        return true;
      }
      return false;
    } catch (error) {
      console.warn('⚠️ Error resuming AudioContext:', error);
      return false;
    }
  }, []);

  // ✅ Initialize sound engine
  useEffect(() => {
    if (!isInitialized.current) {
      soundEngine.init();
      soundEngine.preloadAll();
      isInitialized.current = true;
      setIsReady(true);
      
      if (import.meta.env.DEV) {
        console.log('🎵 SoundProvider initialized');
      }
    }

    // ✅ Try to resume on user interaction (once)
    const handleFirstInteraction = () => {
      resumeAudio();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    // ✅ Persistent resume check
    const handleResumeCheck = () => {
      if (soundEngine.audioContext?.state === 'suspended') {
        resumeAudio();
      }
    };

    // Add event listeners
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    
    // Persistent listeners
    document.addEventListener('click', handleResumeCheck);
    document.addEventListener('touchstart', handleResumeCheck);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('click', handleResumeCheck);
      document.removeEventListener('touchstart', handleResumeCheck);
    };
  }, [resumeAudio]);

  // ✅ playEvent with auto-resume
  const playEvent = useCallback((eventName) => {
    if (!isReady) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Sound not ready yet');
      }
      return;
    }
    
    // ✅ Resume audio context before playing
    if (soundEngine.audioContext?.state === 'suspended') {
      const resumed = resumeAudio();
      if (!resumed && resumeAttempts.current < maxResumeAttempts) {
        resumeAttempts.current++;
        setTimeout(() => {
          resumeAudio();
        }, 300);
      }
    }
    
    if (import.meta.env.DEV) {
      console.log(`🔊 Playing sound: ${eventName}`);
    }
    
    soundEngine.playEvent(eventName);
  }, [isReady, resumeAudio]);

  // ✅ setMuted
  const setMuted = useCallback((muted) => {
    soundEngine.setMuted(muted);
    if (import.meta.env.DEV) {
      console.log(`🔇 Sound ${muted ? 'muted' : 'unmuted'}`);
    }
  }, []);

  // ✅ setVolume
  const setVolume = useCallback((volume) => {
    soundEngine.setVolume(volume);
    if (import.meta.env.DEV) {
      console.log(`🔊 Volume set to: ${Math.round(volume * 100)}%`);
    }
  }, []);

  // ✅ getVolume
  const getVolume = useCallback(() => {
    return soundEngine.volume;
  }, []);

  // ✅ stopAll
  const stopAll = useCallback(() => {
    soundEngine.stopAll?.();
  }, []);

  // ✅ getState
  const getState = useCallback(() => {
    return soundEngine.getState?.() || {
      isInitialized: isInitialized.current,
      isReady,
      audioContextState: soundEngine.audioContext?.state || 'none',
    };
  }, [isReady]);

  const value = {
    playEvent,
    setMuted,
    setVolume,
    getVolume,
    stopAll,
    getState,
    isReady,
    soundEngine,
    SOUND_EVENTS,
    // ✅ For backward compatibility
    resume: resumeAudio,
  };

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used inside SoundProvider');
  }
  return context;
};

export default SoundProvider;