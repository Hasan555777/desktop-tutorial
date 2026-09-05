// components/ErrorBoundary/ErrorBoundary.jsx
// Catches uncaught render-time errors anywhere below it in the tree so a
// single broken component can't take down the entire app with a blank
// white screen in production.

import React from 'react';
import { logError } from '../../utils/logger';
import styles from './ErrorBoundary.module.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logError('Uncaught render error', error, { componentStack: errorInfo?.componentStack });
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorContainer}>
          <h2 className={styles.errorTitle}>কিছু একটা সমস্যা হয়েছে</h2>
          <p className={styles.errorMessage}>
            অনুগ্রহ করে পেজটি রিলোড করুন। সমস্যা থেকেই গেলে সাপোর্টে জানান।
          </p>
          <button className={styles.errorButton} onClick={this.handleReload}>
            রিলোড করুন
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;