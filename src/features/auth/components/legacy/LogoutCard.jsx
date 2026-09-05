import React from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../../../shared/firebase/index';
import { signOut } from 'firebase/auth';
import { useFeedback } from '../../../../shared/ui/Feedback/FeedbackProvider';
import styles from './LogoutCard.module.css';

function LogoutCard({ user }) {
  const navigate = useNavigate();
  const feedback = useFeedback();

  const handleLogout = async () => {
    const confirmed = await feedback.confirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      variant: 'warning',
      confirmText: 'Yes, Logout',
      cancelText: 'Cancel',
    });
    if (confirmed) {
      try {
        await signOut(auth);
        feedback.alert.success({ title: '👋 Logged out successfully' });
        navigate('/login', { replace: true });
      } catch (error) {
        console.error("Logout error:", error);
        feedback.alert.error({ title: 'Failed to logout' });
      }
    }
  };

  return (
    <div className={`${styles.categoryItem} ${styles.logoutItem}`} onClick={handleLogout}>
      <div className={`${styles.icon} ${styles.logout}`}><i className="fas fa-sign-out-alt"></i></div>
      <div className={styles.content}>
        <div className={styles.title}>Logout</div>
        <div className={styles.sub}>Sign out of your account</div>
      </div>
      <div className={styles.arrow}>
        <i className="fas fa-chevron-right"></i>
      </div>
    </div>
  );
}

export default LogoutCard;