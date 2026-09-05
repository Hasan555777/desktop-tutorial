// UI/Feedback/Prompt.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Modal from '../Modal/Modal';
import styles from './Prompt.module.css';


const Prompt = React.memo(({ 
  title, 
  message, 
  defaultValue = '',
  placeholder = 'Enter value...',
  type = 'text',
  maxLength = 100,
  minLength = 0,
  validator = null,
  required = true,
  autoComplete = 'off',
  spellCheck = false,
  resolve, 
  onClose,
  loading: externalLoading, // ✅ default value নেই
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  
  // ✅ সঠিক isControlled লজিক
  const isControlled = externalLoading !== undefined;
  const isLoadingState = isControlled ? externalLoading : isLoading;

  // ============================================================
  // Validation
  // ============================================================
  const validate = useCallback((text) => {
    const trimmed = text.trim();
    
    if (required && !trimmed) {
      return 'This field is required';
    }
    
    if (minLength > 0 && trimmed.length < minLength) {
      return `Minimum ${minLength} characters required`;
    }
    
    if (maxLength > 0 && trimmed.length > maxLength) {
      return `Maximum ${maxLength} characters allowed`;
    }
    
    if (validator && typeof validator === 'function') {
      const result = validator(trimmed);
      if (result !== true) {
        return typeof result === 'string' ? result : 'Invalid value';
      }
    }
    
    return '';
  }, [required, minLength, maxLength, validator]);

  const isValid = useMemo(() => {
    return !validate(value);
  }, [value, validate]);

  // ============================================================
  // Auto Focus & Select
  // ============================================================
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (type !== 'password') {
        inputRef.current.select();
      }
    }
  }, [type]);

  // ============================================================
  // ✅ Handlers - resolve একবার, onClose শুধু UI close
  // ============================================================
  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    
    const validationError = validate(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    if (!isControlled) {
      setIsLoading(true);
    }
    
    try {
      // ✅ শুধু resolve কল, onClose পরে
      await resolve(trimmed);
      // ✅ resolve শেষ হলে UI close
      onClose();
    } catch (error) {
      setError(error.message || 'Failed to save');
      if (!isControlled) {
        setIsLoading(false);
      }
    }
    // ✅ finally-এর বদলে এখানে handle
  }, [value, validate, resolve, onClose, isControlled]);

  const handleCancel = useCallback(() => {
    // ✅ Cancel: resolve(null) এবং UI close
    resolve(null);
    onClose();
  }, [resolve, onClose]);

  // ============================================================
  // ✅ Keyboard Events - ইনপুট লেভেলে
  // ============================================================
  const handleKeyDown = useCallback((e) => {
    // ESC -> Cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
      return;
    }
    
    // Ctrl+Enter or Cmd+Enter -> Save (multiline support)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isValid && !isLoadingState) {
        handleSave();
      }
      return;
    }
    
    // Enter -> Save (single line only)
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      if (isValid && !isLoadingState) {
        handleSave();
      }
      return;
    }
  }, [handleSave, handleCancel, isValid, isLoadingState, type]);

  // ============================================================
  // Input Change
  // ============================================================
  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    setValue(newValue);
    setError('');
    
    if (required || validator) {
      const validationError = validate(newValue);
      if (validationError) {
        setError(validationError);
      }
    }
  }, [validate, required, validator]);

  // ============================================================
  // Render Input
  // ============================================================
  const renderInput = () => {
    const commonProps = {
      ref: inputRef,
      value: value,
      onChange: handleChange,
      onKeyDown: handleKeyDown, // ✅ ইনপুট লেভেলে listener
      placeholder: placeholder,
      maxLength: maxLength,
      autoComplete: autoComplete,
      spellCheck: spellCheck,
      disabled: isLoadingState,
      'aria-label': title || 'Prompt input',
      'aria-describedby': error ? 'prompt-error' : undefined,
      'aria-invalid': !!error,
    };

    if (type === 'textarea') {
      return (
        <textarea
          {...commonProps}
          rows={4}
          className={`prompt-textarea ${error ? 'has-error' : ''}`}
        />
      );
    }

    if (type === 'password') {
      return (
        <input
          {...commonProps}
          type="password"
          autoComplete="current-password"
        />
      );
    }

    if (type === 'number') {
      return (
        <input
          {...commonProps}
          type="number"
          step="any"
          min="0"
          onKeyDown={(e) => {
            if (e.key === '-') e.preventDefault();
            handleKeyDown(e); // ✅ parent handler call
          }}
        />
      );
    }

    const inputTypes = {
      email: { type: 'email', autoComplete: 'email' },
      url: { type: 'url', autoComplete: 'url' },
      tel: { type: 'tel', autoComplete: 'tel' },
    };

    if (inputTypes[type]) {
      return (
        <input
          {...commonProps}
          type={inputTypes[type].type}
          autoComplete={inputTypes[type].autoComplete}
        />
      );
    }

    return (
      <input
        {...commonProps}
        type="text"
      />
    );
  };

  // ============================================================
  // Character Counter
  // ============================================================
  const charCount = value.length;
  const showCounter = maxLength > 0 && maxLength < 500;

 return (
    <Modal onClose={handleCancel}>
      <div className={styles.promptContainer}>
        {/* Icon */}
        <div className={styles.promptIcon}>
          <div className={styles.cubeBackground}>
            <i className="fa-solid fa-cube"></i>
          </div>
          <i className={`fa-solid fa-pencil ${styles.promptIconEdit}`}></i>
        </div>

        {/* Title & Message */}
        <h3 className={styles.promptTitle}>{title}</h3>
        {message && <p className={styles.promptMessage}>{message}</p>}

        {/* Input */}
        <div className={styles.promptInputWrapper}>
          {renderInput()}
          
          {showCounter && (
            <div className={`${styles.promptCounter} ${charCount > maxLength ? styles.error : ''}`}>
              {charCount}/{maxLength}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div id="prompt-error" className={styles.promptError}>
            <i className="fa-solid fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className={styles.promptActions}>
          <button
            className={`${styles.promptBtn} ${styles.secondary}`}
            onClick={handleCancel}
            disabled={isLoadingState}
          >
            Cancel
          </button>
          <button
            className={`${styles.promptBtn} ${styles.primary}`}
            onClick={handleSave}
            disabled={!isValid || isLoadingState}
          >
            {isLoadingState ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
});

Prompt.displayName = 'Prompt';

export default Prompt;