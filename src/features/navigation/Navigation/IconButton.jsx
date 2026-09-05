// src/components/Navigation/IconButton.jsx
import React from 'react';
import './Button.css';

const IconButton = ({
  icon,
  label = '',
  size = 'md',
  variant = 'default',
  className = '',
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
  ariaLabel = '',
  tooltip = '',
  badge = null,
  active = false,
  rounded = false,
  color = '',
  iconSize = ''
}) => {
  // ✅ Design Tokens
  const sizeClass = {
    sm: 'icon-btn-sm',
    md: 'icon-btn-md',
    lg: 'icon-btn-lg'
  }[size] || 'icon-btn-md';

  const variantClass = {
    default: 'icon-btn-default',
    ghost: 'icon-btn-ghost',
    outline: 'icon-btn-outline',
    glass: 'icon-btn-glass',
    danger: 'icon-btn-danger',
    success: 'icon-btn-success',
    warning: 'icon-btn-warning'
  }[variant] || 'icon-btn-default';

  const roundedClass = rounded ? 'icon-btn-rounded' : '';
  const colorClass = color ? `icon-btn-${color}` : '';

  return (
    <button
      className={`icon-btn ${sizeClass} ${variantClass} ${roundedClass} ${colorClass} ${active ? 'active' : ''} ${className}`}
      onClick={onClick}
      type={type}
      disabled={disabled || loading}
      aria-label={ariaLabel || label || tooltip || 'Button'}
      title={tooltip}
    >
      {loading ? (
        <i className="fa-solid fa-spinner fa-spin"></i>
      ) : (
        <i className={`${icon} ${iconSize}`}></i>
      )}
      {label && <span className="icon-btn-label">{label}</span>}
      {badge !== null && badge > 0 && (
        <span className="icon-btn-badge">{badge}</span>
      )}
    </button>
  );
};

export default IconButton;