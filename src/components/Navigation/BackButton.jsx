// src/components/Navigation/BackButton.jsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import IconButton from './IconButton';
import './Button.css';

const BackButton = ({
  fallback = '/',
  icon = 'fa-solid fa-arrow-left',
  label = '',
  size = 'md',
  variant = 'default',
  className = '',
  onClick,
  disabled = false,
  loading = false,
  tooltip = 'Go back'
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (disabled || loading) return;

    if (onClick) {
      onClick();
      return;
    }

    // ✅ প্রথমে location.state থেকে চেক
    if (location.state?.from) {
      navigate(location.state.from);
      return;
    }

    // ✅ history check না করে সরাসরি fallback
    navigate(fallback);
  };

  return (
    <IconButton
      icon={icon}
      label={label}
      size={size}
      variant={variant}
      className={`back-btn ${className}`}
      onClick={handleBack}
      disabled={disabled}
      loading={loading}
      tooltip={tooltip}
      aria-label={label || 'Go back'}
    />
  );
};

export default BackButton;