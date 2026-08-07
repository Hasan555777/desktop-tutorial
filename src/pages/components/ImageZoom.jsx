import React from 'react';

export const ImageZoom = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div className="zoom-lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close-btn" onClick={onClose}>
        <i className="fa-solid fa-xmark"></i>
      </button>
      <div className="lightbox-content-box" onClick={(e) => e.stopPropagation()}>
        <img src={imageUrl} alt="Zoomed" className="lightbox-zoomed-img" />
      </div>
    </div>
  );
};

export default ImageZoom;  // ✅ default export
