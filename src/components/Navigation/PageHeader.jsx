// src/components/Navigation/PageHeader.jsx
import React from 'react';
import BackButton from './BackButton';
import './Header.css';

const PageHeader = ({
  title,
  subtitle = '',
  icon = null,
  left = null,
  center = null,
  right = null,
  backButton = false,
  backFallback = '/',
  onBack = null,
  className = '',
  size = 'md',
  sticky = false,
  border = true,
  transparent = false,
  height = 'auto'
}) => {
  // Default left: BackButton if backButton true
  const leftContent = left || (backButton && (
    <BackButton
      fallback={backFallback}
      onClick={onBack}
      size={size}
    />
  ));

  return (
    <div
      className={`page-header ${sticky ? 'sticky' : ''} ${border ? 'border' : ''} ${transparent ? 'transparent' : ''} ${className}`}
      style={{
        position: sticky ? 'sticky' : 'relative',
        top: sticky ? 0 : 'auto',
        zIndex: sticky ? 100 : 'auto',
        height: height !== 'auto' ? height : 'auto',
      }}
    >
      <div className="page-header-left">
        {leftContent}
        <div className="page-header-info">
          {icon && <i className={`page-header-icon ${icon}`}></i>}
          <h1 className="page-header-title">{title}</h1>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
      </div>
      
      {center && (
        <div className="page-header-center">
          {center}
        </div>
      )}
      
      {right && (
        <div className="page-header-right">
          {right}
        </div>
      )}
    </div>
  );
};

export default PageHeader;