import React, { useState, useRef, useCallback } from 'react';
import styles from './ImageZoom.module.css';

// 🔧 FIX (#19 image viewer): this used to be preview + close only.
// Added scroll/pinch zoom, drag-to-pan once zoomed in, and download —
// kept the external props (imageUrl, onClose) unchanged since this
// component is shared across 6 files, so nothing else needed to change.
const MIN_SCALE = 1;
const MAX_SCALE = 4;

export const ImageZoom = ({ imageUrl, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragState = useRef(null);
  const pinchState = useRef(null);

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  if (!imageUrl) return null;

  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const handleWheel = (e) => {
    e.preventDefault();
    const next = clampScale(scale - e.deltaY * 0.0015 * scale);
    setScale(next);
    if (next === MIN_SCALE) setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (scale <= MIN_SCALE) return;
    dragState.current = { startX: e.clientX - position.x, startY: e.clientY - position.y };
  };
  const handleMouseMove = (e) => {
    if (!dragState.current) return;
    setPosition({ x: e.clientX - dragState.current.startX, y: e.clientY - dragState.current.startY });
  };
  const handleMouseUp = () => { dragState.current = null; };

  const distance = (touches) => {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchState.current = { startDist: distance(e.touches), startScale: scale };
    } else if (e.touches.length === 1 && scale > MIN_SCALE) {
      dragState.current = {
        startX: e.touches[0].clientX - position.x,
        startY: e.touches[0].clientY - position.y,
      };
    }
  };
  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchState.current) {
      e.preventDefault();
      const next = clampScale(
        pinchState.current.startScale * (distance(e.touches) / pinchState.current.startDist)
      );
      setScale(next);
    } else if (e.touches.length === 1 && dragState.current) {
      setPosition({
        x: e.touches[0].clientX - dragState.current.startX,
        y: e.touches[0].clientY - dragState.current.startY,
      });
    }
  };
  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) {
      dragState.current = null;
      pinchState.current = null;
    }
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Cross-origin images without CORS headers can't be fetched as a
      // blob — fall back to opening in a new tab so the user can still
      // save it manually.
      window.open(imageUrl, '_blank', 'noopener');
    }
  };

  return (
    <div
      className={styles.zoomLightboxOverlay}
      onClick={onClose}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <button className={styles.lightboxCloseBtn} onClick={onClose} aria-label="Close">
        <i className="fa-solid fa-xmark"></i>
      </button>

      <button
        className={styles.lightboxDownloadBtn}
        onClick={handleDownload}
        aria-label="Download image"
      >
        <i className="fa-solid fa-download"></i>
      </button>

      {scale > MIN_SCALE && (
        <button
          className={styles.lightboxResetBtn}
          onClick={(e) => { e.stopPropagation(); resetView(); }}
          aria-label="Reset zoom"
        >
          <i className="fa-solid fa-magnifying-glass-minus"></i>
        </button>
      )}

      <div
        className={styles.lightboxContentBox}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={() => (scale > MIN_SCALE ? resetView() : setScale(2))}
      >
        <img
          src={imageUrl}
          alt="Zoomed"
          className={styles.lightboxZoomedImg}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: scale > MIN_SCALE ? 'grab' : 'zoom-in',
            transition: dragState.current ? 'none' : 'transform 0.15s ease',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
};

export default ImageZoom;  // ✅ default export