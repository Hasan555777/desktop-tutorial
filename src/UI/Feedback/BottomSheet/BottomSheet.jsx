// UI/Feedback/BottomSheet.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import Modal from '../Modal/Modal';
import './BottomSheet.css';

// ============================================================
// Constants
// ============================================================
const SNAP_POINTS = {
  auto: 'sheet-auto',
  small: 'sheet-small',
  half: 'sheet-half',
  large: 'sheet-large',
  full: 'sheet-full',
};

const ACTION_VARIANTS = {
  primary: 'sheet-btn-primary',
  secondary: 'sheet-btn-secondary',
  danger: 'sheet-btn-danger',
  success: 'sheet-btn-success',
  warning: 'sheet-btn-warning',
  ghost: 'sheet-btn-ghost',
};

// ============================================================
// Main Component
// ============================================================
const BottomSheet = React.memo(({
  // Core props
  title = '',
  children,
  actions = [],
  resolve,
  onClose,
  
  // Behavior props
  snap = 'auto',
  showHandle = true,
  showCloseButton = false,
  closeOnOverlay = true,
  closeOnEsc = true,
  swipeToClose = true,
  closeOnAction = true,
  
  // Visual props
  className = '',
  height = null,
  maxHeight = null,
  
  // Accessibility
  labelledBy = 'sheet-title',
  describedBy = 'sheet-desc',
  
  // Callbacks
  onOpen = null,
  onCloseComplete = null,
  onAction = null,
}) => {
  // ============================================================
  // State & Refs
  // ============================================================
  const [isLoading, setIsLoading] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchCurrentY, setTouchCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [shouldClose, setShouldClose] = useState(false);
  const sheetRef = useRef(null);
  const actionRefs = useRef({});

  // ============================================================
  // Computed Styles
  // ============================================================
  const sheetStyle = useMemo(() => {
    const style = {};
    if (height) {
      style.height = height;
      style.maxHeight = height;
    }
    if (maxHeight) {
      style.maxHeight = maxHeight;
    }
    return style;
  }, [height, maxHeight]);

  const snapClass = SNAP_POINTS[snap] || SNAP_POINTS.auto;

  // ============================================================
  // Action Handler
  // ============================================================
  const handleAction = useCallback(async (action, index) => {
    if (action.disabled || isLoading) return;
    
    try {
      // Set loading if action has loading prop
      if (action.loading !== undefined) {
        setIsLoading(action.loading);
      } else if (action.async) {
        setIsLoading(true);
      }
      
      // Call onAction callback
      if (onAction) {
        await onAction(action, index);
      }
      
      // Resolve with action value
      const result = action.value !== undefined ? action.value : true;
      await resolve(result);
      
      // Close if configured
      if (closeOnAction !== false && action.autoClose !== false) {
        onClose();
      }
    } catch (error) {
      console.error('Action error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, onAction, resolve, closeOnAction, onClose]);

  // ============================================================
  // Close Handler
  // ============================================================
  const handleClose = useCallback(() => {
    if (isLoading) return;
    resolve(false);
    onClose();
    onCloseComplete?.();
  }, [isLoading, resolve, onClose, onCloseComplete]);

  // ============================================================
  // Swipe to Close (Touch)
  // ============================================================
  useEffect(() => {
    if (!swipeToClose) return;

    const sheet = sheetRef.current;
    if (!sheet) return;

    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      setTouchStartY(touch.clientY);
      setTouchCurrentY(touch.clientY);
      setIsDragging(true);
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const deltaY = touch.clientY - touchStartY;
      
      if (deltaY > 0) {
        setTouchCurrentY(touch.clientY);
        sheet.style.transform = `translateY(${deltaY}px)`;
        sheet.style.transition = 'none';
        
        // If dragged more than 30% of sheet height, mark for close
        const sheetHeight = sheet.offsetHeight;
        if (deltaY > sheetHeight * 0.3) {
          setShouldClose(true);
        } else {
          setShouldClose(false);
        }
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      
      if (shouldClose) {
        handleClose();
      } else {
        // Reset position
        sheet.style.transform = 'translateY(0)';
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
      }
      
      setTouchStartY(0);
      setTouchCurrentY(0);
      setShouldClose(false);
    };

    sheet.addEventListener('touchstart', handleTouchStart);
    sheet.addEventListener('touchmove', handleTouchMove);
    sheet.addEventListener('touchend', handleTouchEnd);

    return () => {
      sheet.removeEventListener('touchstart', handleTouchStart);
      sheet.removeEventListener('touchmove', handleTouchMove);
      sheet.removeEventListener('touchend', handleTouchEnd);
    };
  }, [swipeToClose, isDragging, shouldClose, handleClose]);

  // ============================================================
  // Keyboard Support (Arrow keys for actions)
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Enter on focused action
      if (e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement?.classList.contains('sheet-btn')) {
          const index = activeElement.dataset.index;
          if (index !== undefined && actions[index]) {
            e.preventDefault();
            handleAction(actions[index], parseInt(index));
          }
        }
      }
      
      // Arrow keys for navigation
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const buttons = document.querySelectorAll('.sheet-btn:not(:disabled)');
        const currentIndex = Array.from(buttons).indexOf(document.activeElement);
        let nextIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
        nextIndex = Math.max(0, Math.min(buttons.length - 1, nextIndex));
        buttons[nextIndex]?.focus();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actions, handleAction]);

  // ============================================================
  // Auto Focus (First non-disabled action)
  // ============================================================
  useEffect(() => {
    const firstAction = actions.find(a => !a.disabled);
    if (firstAction) {
      const id = firstAction.id || firstAction.label;
      const ref = actionRefs.current[id];
      if (ref) {
        setTimeout(() => ref.focus(), 100);
      }
    }
  }, [actions]);

  // ============================================================
  // Render Actions
  // ============================================================
  const renderActions = () => {
    if (!actions || actions.length === 0) return null;

    return (
      <div className="sheet-actions">
        {actions.map((action, index) => {
          const variantClass = ACTION_VARIANTS[action.variant] || ACTION_VARIANTS.primary;
          const isLoadingAction = action.loading || (action.async && isLoading);
          const isDisabled = action.disabled || isLoadingAction;
          const id = action.id || action.label;

          return (
            <button
              key={id}
              ref={(el) => (actionRefs.current[id] = el)}
              className={`sheet-btn ${variantClass} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => handleAction(action, index)}
              disabled={isDisabled}
              data-index={index}
              aria-label={action.label}
            >
              {isLoadingAction ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  {action.loadingText || 'Loading...'}
                </>
              ) : (
                <>
                  {action.icon && <i className={`fa-solid fa-${action.icon}`}></i>}
                  {action.label}
                </>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <Modal
      onClose={handleClose}
      closeOnOverlay={closeOnOverlay}
      closeOnEsc={closeOnEsc}
      className={`sheet-modal ${className}`}
      labelledBy={labelledBy}
      describedBy={describedBy}
      size="fullscreen"
      animation="slide"
    >
      <div 
        ref={sheetRef}
        className={`sheet-container ${snapClass}`}
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledBy : undefined}
        aria-describedby={describedBy}
      >
        {/* Handle */}
        {showHandle && (
          <div className="sheet-handle-wrapper">
            <div className="sheet-handle" />
          </div>
        )}

        {/* Close Button */}
        {showCloseButton && (
          <button
            className="sheet-close-btn"
            onClick={handleClose}
            aria-label="Close"
            disabled={isLoading}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}

        {/* Title */}
        {title && (
          <h3 id={labelledBy} className="sheet-title">
            {title}
          </h3>
        )}

        {/* Content */}
        <div className="sheet-content" id={describedBy}>
          {children}
        </div>

        {/* Actions */}
        {renderActions()}
      </div>
    </Modal>
  );
});

// ============================================================
// PropTypes
// ============================================================
BottomSheet.propTypes = {
  title: PropTypes.string,
  children: PropTypes.node.isRequired,
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      label: PropTypes.string.isRequired,
      variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'success', 'warning', 'ghost']),
      icon: PropTypes.string,
      value: PropTypes.any,
      disabled: PropTypes.bool,
      loading: PropTypes.bool,
      loadingText: PropTypes.string,
      async: PropTypes.bool,
      autoClose: PropTypes.bool,
    })
  ),
  resolve: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  
  snap: PropTypes.oneOf(['auto', 'small', 'half', 'large', 'full']),
  showHandle: PropTypes.bool,
  showCloseButton: PropTypes.bool,
  closeOnOverlay: PropTypes.bool,
  closeOnEsc: PropTypes.bool,
  swipeToClose: PropTypes.bool,
  closeOnAction: PropTypes.bool,
  
  className: PropTypes.string,
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  maxHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  
  labelledBy: PropTypes.string,
  describedBy: PropTypes.string,
  
  onOpen: PropTypes.func,
  onCloseComplete: PropTypes.func,
  onAction: PropTypes.func,
};

BottomSheet.defaultProps = {
  title: '',
  actions: [],
  snap: 'auto',
  showHandle: true,
  showCloseButton: false,
  closeOnOverlay: true,
  closeOnEsc: true,
  swipeToClose: true,
  closeOnAction: true,
  className: '',
  height: null,
  maxHeight: null,
  labelledBy: 'sheet-title',
  describedBy: 'sheet-desc',
  onOpen: null,
  onCloseComplete: null,
  onAction: null,
};

BottomSheet.displayName = 'BottomSheet';

export default BottomSheet;