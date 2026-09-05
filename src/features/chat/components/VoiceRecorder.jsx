// src/pages/components/VoiceRecorder.jsx
//
// New (#16 voice messages) — no existing recording infrastructure in
// this codebase. Handles: start/stop/cancel recording, preview
// playback before sending, permission-denial and unsupported-browser
// cases, and cleans up the microphone stream when done (stopping all
// MediaStream tracks) so the mic indicator doesn't stay active.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import styles from './VoiceRecorder.module.css';

const MAX_DURATION_SEC = 120; // 2 minutes — reasonable cap for a chat voice note

const VoiceRecorder = ({ onSend, onClose }) => {
  const [status, setStatus] = useState('requesting'); // requesting | recording | preview | unsupported | denied
  const [duration, setDuration] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const blobRef = useRef(null);
  const mimeTypeRef = useRef('audio/webm');
  const audioElRef = useRef(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Request mic + start recording on mount ──
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;

        const preferredMime = ['audio/webm', 'audio/mp4', 'audio/ogg']
          .find(m => MediaRecorder.isTypeSupported?.(m)) || '';
        mimeTypeRef.current = preferredMime || 'audio/webm';

        const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          blobRef.current = new Blob(chunksRef.current, { type: mimeTypeRef.current });
          setStatus('preview');
        };

        recorder.start();
        setStatus('recording');

        let elapsed = 0;
        timerRef.current = setInterval(() => {
          elapsed += 1;
          setDuration(elapsed);
          if (elapsed >= MAX_DURATION_SEC) {
            recorder.stop();
            stopTimer();
          }
        }, 1000);
      })
      .catch(() => {
        if (!cancelled) setStatus('denied');
      });

    return () => {
      cancelled = true;
      stopTimer();
      stopStream();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* already stopped */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = () => {
    stopTimer();
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    stopStream(); // mic no longer needed once recording stops
  };

  const handleCancel = () => {
    stopTimer();
    stopStream();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    onClose();
  };

  const handleTogglePreview = () => {
    if (!audioElRef.current) return;
    if (previewPlaying) {
      audioElRef.current.pause();
    } else {
      audioElRef.current.play();
    }
  };

  const handleSend = async () => {
    if (!blobRef.current) return;
    await onSend(blobRef.current, mimeTypeRef.current, duration);
    onClose();
  };

  const formatDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const previewUrl = status === 'preview' && blobRef.current ? URL.createObjectURL(blobRef.current) : null;

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  if (status === 'unsupported') {
    return (
      <div className={styles.recorderOverlay}>
        <div className={styles.recorderCard}>
          <p>এই ব্রাউজারে ভয়েস মেসেজ রেকর্ডিং সমর্থিত নয়।</p>
          <button className={styles.recorderCancelBtn} onClick={onClose}>বন্ধ করুন</button>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className={styles.recorderOverlay}>
        <div className={styles.recorderCard}>
          <p>মাইক্রোফোন অ্যাক্সেসের অনুমতি পাওয়া যায়নি। ব্রাউজার সেটিংস থেকে মাইক্রোফোন অনুমতি দিন।</p>
          <button className={styles.recorderCancelBtn} onClick={onClose}>বন্ধ করুন</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.recorderOverlay}>
      <div className={styles.recorderCard}>
        {status === 'requesting' && <p>মাইক্রোফোন প্রস্তুত হচ্ছে...</p>}

        {status === 'recording' && (
          <>
            <div className={styles.recordingPulse}><i className="fa-solid fa-microphone"></i></div>
            <div className={styles.recorderDuration}>{formatDuration(duration)}</div>
            <div className={styles.recorderControls}>
              <button className={styles.recorderCancelBtn} onClick={handleCancel} aria-label="Cancel recording">
                <i className="fa-solid fa-trash"></i>
              </button>
              <button className={styles.recorderStopBtn} onClick={handleStop} aria-label="Stop recording">
                <i className="fa-solid fa-stop"></i>
              </button>
            </div>
          </>
        )}

        {status === 'preview' && (
          <>
            <audio
              ref={audioElRef}
              src={previewUrl}
              onPlay={() => setPreviewPlaying(true)}
              onPause={() => setPreviewPlaying(false)}
              onEnded={() => setPreviewPlaying(false)}
            />
            <div className={styles.recorderDuration}>{formatDuration(duration)}</div>
            <div className={styles.recorderControls}>
              <button className={styles.recorderCancelBtn} onClick={handleCancel} aria-label="Discard">
                <i className="fa-solid fa-trash"></i>
              </button>
              <button className={styles.recorderPlayBtn} onClick={handleTogglePreview} aria-label={previewPlaying ? 'Pause' : 'Play preview'}>
                <i className={`fa-solid ${previewPlaying ? 'fa-pause' : 'fa-play'}`}></i>
              </button>
              <button className={styles.recorderSendBtn} onClick={handleSend} aria-label="Send voice message">
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VoiceRecorder;
