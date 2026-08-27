// UI/Feedback/Modal.jsx
import React, { useEffect, useRef, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import './Modal.css';

// ============================================================
// Constants
// ============================================================
const FOCUSABLE_ELEMENTS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'details > summary:first-of-type',
  'area[href]',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]',
].join(',');

const SIZE_CLASSES = {
  sm: 'modal-sm',
  md: 'modal-md',
  lg: 'modal-lg',
  xl: 'modal-xl',
  fullscreen: 'modal-fullscreen',
};

// ============================================================
// Main Component
// ============================================================
const Modal = ({
  children,
  onClose,
  isOpen = true,
  closeOnOverlay = true,
  closeOnEsc = true,
  size = 'md',
  className = '',
  labelledBy = '',
  describedBy = '',
  zIndex = 1000,
  animation = 'fade',
  closeOnAnimationEnd = true,
  portalContainer = null,
}) => {
  // ============================================================
  // Refs
  // ============================================================
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const focusableElementsRef = useRef([]);
  const containerRef = useRef(portalContainer || document.body);

  // ============================================================
  // State
  // ============================================================
  const [isClosing, setIsClosing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // ============================================================
  // Body Scroll Lock
  // ============================================================
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    // Lock scroll
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPadding;
    };
  }, [isOpen]);

  // ============================================================
  // Focus Trap
  // ============================================================
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(modalRef.current.querySelectorAll(FOCUSABLE_ELEMENTS))
      .filter(el => el.offsetParent !== null && !el.hasAttribute('disabled'));
  }, []);

  const handleFocusTrap = useCallback((e) => {
    if (e.key !== 'Tab') return;

    const focusableElements = getFocusableElements();
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Shift+Tab on first element -> go to last
    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
      return;
    }

    // Tab on last element -> go to first
    if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
      return;
    }

    // If focus is outside modal, move it to first element
    if (!modalRef.current?.contains(document.activeElement)) {
      e.preventDefault();
      firstElement.focus();
    }
  }, [getFocusableElements]);

  // ============================================================
  // Keyboard Events (ESC)
  // ============================================================
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && closeOnEsc) {
      e.preventDefault();
      handleClose();
    }
  }, [closeOnEsc]);

  // ============================================================
  // Close Handler
  // ============================================================
  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    
    // Restore previous focus
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }

    // Call onClose after animation
    if (closeOnAnimationEnd) {
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, 300); // Match CSS animation duration
    } else {
      onClose();
      setIsClosing(false);
    }
  }, [isClosing, onClose, closeOnAnimationEnd]);

  // ============================================================
  // Overlay Click Handler
  // ============================================================
  const handleOverlayClick = useCallback((e) => {
    if (closeOnOverlay && e.target === e.currentTarget) {
      handleClose();
    }
  }, [closeOnOverlay, handleClose]);

  // ============================================================
  // Mount & Focus Management
  // ============================================================
  useEffect(() => {
    if (!isOpen) return;

    // Save previous focus
    previousFocusRef.current = document.activeElement;

    // Set mounted state for animation
    setIsMounted(true);

    // Focus first focusable element after a small delay
    const timer = setTimeout(() => {
      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        // If no focusable elements, focus the modal itself
        modalRef.current?.focus();
      }
    }, 50);

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleFocusTrap);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleFocusTrap);
      
      // Restore focus on unmount
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen, handleKeyDown, handleFocusTrap, getFocusableElements]);

  // ============================================================
  // Get Animation Classes
  // ============================================================
  const getAnimationClass = useCallback(() => {
    if (isClosing) {
      return `modal-${animation}-out`;
    }
    if (isMounted) {
      return `modal-${animation}-in`;
    }
    return 'modal-hidden';
  }, [animation, isClosing, isMounted]);

  // ============================================================
  // Render
  // ============================================================
  if (!isOpen) return null;

  const modalContent = (
    <div
      className={`modal-overlay ${getAnimationClass()}`}
      style={{ zIndex }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy || undefined}
      aria-describedby={describedBy || undefined}
    >
      <div
        ref={modalRef}
        className={`modal-container ${SIZE_CLASSES[size]} ${className}`}
        tabIndex="-1"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(
    modalContent,
    containerRef.current
  );
};

// ============================================================
// PropTypes (Runtime Validation)
// ============================================================
Modal.propTypes = {
  children: PropTypes.node.isRequired,
  onClose: PropTypes.func.isRequired,
  isOpen: PropTypes.bool,
  closeOnOverlay: PropTypes.bool,
  closeOnEsc: PropTypes.bool,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', 'fullscreen']),
  className: PropTypes.string,
  labelledBy: PropTypes.string,
  describedBy: PropTypes.string,
  zIndex: PropTypes.number,
  animation: PropTypes.oneOf(['fade', 'slide', 'scale', 'none']),
  closeOnAnimationEnd: PropTypes.bool,
  portalContainer: PropTypes.instanceOf(Element),
};

Modal.defaultProps = {
  isOpen: true,
  closeOnOverlay: true,
  closeOnEsc: true,
  size: 'md',
  className: '',
  labelledBy: '',
  describedBy: '',
  zIndex: 1000,
  animation: 'fade',
  closeOnAnimationEnd: true,
  portalContainer: null,
};

Modal.displayName = 'Modal';

export default Modal;