// src/pages/components/VoiceMessageBubble.jsx
// New (#16 voice messages) — playback UI: play/pause + progress bar.

import React, { useState, useRef, useEffect } from 'react';
import styles from './VoiceMessageBubble.module.css';

const VoiceMessageBubble = ({ url, duration = 0 }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const seek = (e) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * (audioRef.current.duration || duration);
  };

  const format = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className={styles.voiceMessageBubble}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <button className={styles.voiceMessagePlayBtn} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`}></i>
      </button>
      <div className={styles.voiceMessageTrack} onClick={seek}>
        <div className={styles.voiceMessageProgress} style={{ width: `${progress * 100}%` }} />
      </div>
      <span className={styles.voiceMessageDuration}>{format(currentTime || duration)}</span>
    </div>
  );
};

export default VoiceMessageBubble;