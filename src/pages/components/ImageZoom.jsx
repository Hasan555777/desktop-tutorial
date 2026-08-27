import React from 'react';
import styles from './ImageZoom.module.css';

export const ImageZoom = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div className={styles.zoomLightboxOverlay} onClick={onClose}>
      <button className={styles.lightboxCloseBtn} onClick={onClose}>
        <i className="fa-solid fa-xmark"></i>
      </button>
      <div className={styles.lightboxContentBox} onClick={(e) => e.stopPropagation()}>
        <img src={imageUrl} alt="Zoomed" className={styles.lightboxZoomedImg} />
      </div>
    </div>
  );
};

export default ImageZoom;  // ✅ default export